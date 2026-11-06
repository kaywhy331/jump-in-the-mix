import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { cli, emit, need } from './client.mjs';

export async function probe(settings, io) {
  await io.operator();
  const r = settings.rehearsal;
  const make = mode => io.context(mode, { egress_url: r.egress_url, timeout_ms: settings.request_timeout_ms,
    hold_ms: r.overlap_hold_ms, padding: 'x'.repeat(1536) });
  // Submit both before observing either; terminal timestamps must prove overlap.
  const pair = await Promise.all([io.create(make('parallel-a'), 'probe'), io.create(make('parallel-b'), 'probe')]);
  need(pair[0].id !== pair[1].id, 'Concurrent jobs share an ID');
  const observed = await Promise.all(pair.map(async (job, i) => {
    const ended = await io.terminal(job, 'succeeded');
    return { ended, receipt: await io.receipt(ended, `parallel_${i}`) };
  }));
  const ended = observed.map(value => value.ended);
  const spans = ended.map(job => [Date.parse(job.terminal.startedAt), Date.parse(job.terminal.finishedAt)]);
  need(spans.every(([start, end]) => Number.isFinite(start) && end > start)
    && Math.max(...spans.map(x => x[0])) < Math.min(...spans.map(x => x[1])), 'Concurrent execution not proven');
  io.report.concurrent = true;
  const receipts = observed.map(value => value.receipt);
  // A lone trailing separator has no side effect: a shell consumes it; argv retains it.
  const detection = await io.terminal(await io.create(make('shell-detection'), 'probe', ' ;'), 'succeeded');
  receipts.push(await io.receipt(detection, 'shell_detection'));
  need(receipts.every(value => value.env_1536_bytes === true && isIP(value.egress_address)), 'Env command or egress assertion failed');
  const shell = receipts[2];
  need(typeof shell.shell === 'boolean' && typeof shell.argument_vector === 'boolean'
    && shell.shell !== shell.argument_vector, 'Execution mode unknown');
  io.report.execution = { shell: shell.shell, argument_vector: shell.argument_vector, env_1536_bytes: true };
  const addresses = receipts.map(value => value.egress_address);
  io.report.egress = { three_jobs: true, valid_addresses: true, one_address: new Set(addresses).size === 1,
    expected_configured: r.expected_egress_addresses.length > 0,
    matches_expected: r.expected_egress_addresses.length === 0 || addresses.every(ip => r.expected_egress_addresses.includes(ip)) };
  need(io.report.egress.one_address && io.report.egress.matches_expected, 'Egress does not satisfy the current single-address contract');
  const failed = await io.terminal(await io.create(io.context('nonzero-exit'), 'probe'), 'failed');
  const failure = await io.receipt(failed, 'nonzero_exit');
  need(failure.nonzero_exit === true, 'Nonzero exit assertion missing');
  io.report.nonzero_exit_failed = true;
}

export async function probeJob(context, { fetcher = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), output = emit, argv = process.argv } = {}) {
  if (context.mode === 'nonzero-exit') {
    output(context, { nonzero_exit: true });
    process.exitCode = 17;
    return;
  }
  need(['parallel-a', 'parallel-b', 'shell-detection'].includes(context.mode), 'Unknown probe mode');
  const response = await fetcher(context.egress_url, { redirect: 'error', signal: AbortSignal.timeout(context.timeout_ms) });
  need(response.ok, 'Egress lookup failed');
  const address = (await response.text()).trim();
  need(isIP(address), 'Invalid egress address');
  await sleep(context.hold_ms);
  output(context, { env_1536_bytes: Buffer.byteLength(process.env.JITM_RELEASE_CONTEXT ?? '') >= 1536,
    shell: argv.at(-1) !== ';', argument_vector: argv.at(-1) === ';', egress_address: address });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await cli(probe, probeJob);
