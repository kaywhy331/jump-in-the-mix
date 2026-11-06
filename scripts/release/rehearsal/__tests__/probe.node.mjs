import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStartCommand } from '../../workflow.mjs';
import { probe } from '../probe.mjs';
import { cli, validate } from '../client.mjs';
import { settings, renderStub, synthetic } from './fixtures.mjs';

test('probe qualifies concurrent scoped receipts, command size, both execution modes and three egress observations', async () => {
  for (const argv of [false, true]) {
    const s = settings(), stub = renderStub(s, { argv });
    await probe(s, stub.io);
    assert.equal(stub.jobs.size, 4);
    assert.equal(stub.io.report.nonzero_exit_failed, true);
    assert.equal(stub.io.report.execution.argument_vector, argv);
    assert.equal(stub.io.report.egress.three_jobs, true);
    assert.equal(stub.io.report.concurrent, true);
    const reads = stub.calls.filter(x => x.path === '/v1/logs');
    assert.equal(new Set(reads.map(x => new URLSearchParams(x.search).get('resource'))).size, 4);
    assert.equal(reads.length, 4);
  }
});
for (const fault of ['badId', 'unknownCreate', 'unknownStatus', 'nonzeroSucceeded', 'noOverlap', 'crossJob', 'duplicate', 'noReceipt', 'inexactPrefix', 'smallEnv', 'badMode', 'egressChanges', 'wrongOwner']) {
  test(`probe refuses ${fault}`, async () => {
    const s = settings(), stub = renderStub(s, { [fault]: true });
    await assert.rejects(probe(s, stub.io));
  });
}
test('late receipt is measured but cannot pass the single-read release contract', async () => {
  const s = settings(), stub = renderStub(s, { late: true });
  await assert.rejects(probe(s, stub.io), /after first/);
  assert.equal(stub.io.report.parallel_0.first_read, false);
  assert.ok(stub.io.report.parallel_0.receipt_latency_ms > 0);
});
test('lost creation is not retried', async () => {
  const s = settings(), stub = renderStub(s, { lostPost: true });
  await assert.rejects(stub.io.create(stub.io.context('nonzero-exit'), 'probe'));
  assert.equal(stub.calls.filter(c => c.method === 'POST').length, 1);
});
test('initial probe can discover egress without inventing an expected IP', async () => {
  const s = settings(); s.rehearsal.expected_egress_addresses = [];
  const stub = renderStub(s); await probe(s, stub.io);
  assert.equal(stub.io.report.egress.expected_configured, false);
  assert.equal(stub.io.report.egress.one_address, true);
});
test('namespace validation refuses production and API changes before any request', () => {
  for (const field of ['production_environment', 'releaser_prefix', 'production_tag_prefix', 'record_branch_prefix', 'ledger_branch', 'concurrency_group', 'receipt_prefix', 'render_api_url']) {
    assert.throws(() => validate({ ...settings(), [field]: 'production' }));
  }
});
test('CLI emits safe summaries when transport throws sensitive response text', async t => {
  const s = settings(), stub = renderStub(s, { lostPost: true }), output = [];
  t.mock.method(globalThis, 'fetch', stub.fetcher);
  t.mock.method(console, 'log', value => output.push(value));
  const before = process.exitCode;
  try {
    await cli(probe, () => assert.fail('not the operator'), { GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/tags/rehearsal-releaser-synthetic', REHEARSAL_SETTINGS_JSON: JSON.stringify(s), RENDER_API_KEY: synthetic(24) });
    assert.equal(process.exitCode, 1);
    assert.equal(JSON.parse(output[0]).passed, false);
    assert.ok(!output.join('').includes('sensitive'));
    assert.ok(!output.join('').includes(s.render_owner_id));
  } finally { process.exitCode = before; }
});
test('actual payload executes through shell and argv and emits exactly one receipt', t => {
  const dir = mkdtempSync(join(tmpdir(), 'rehearsal-command-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Child fetch stub: actual Node/env execution, no network.
  const preloader = `data:text/javascript,${encodeURIComponent("globalThis.fetch=async()=>new Response('192.0.2.1');")}`;
  const context = { operation_id: synthetic(), mode: 'shell-detection', receipt_prefix: settings().receipt_prefix,
    egress_url: 'https://egress.example.test', timeout_ms: 100, hold_ms: 1, padding: 'x'.repeat(1536) };
  const command = buildStartCommand(context, 'node scripts/release/rehearsal/probe.mjs --job') + ' ;';
  for (const shell of [true, false]) {
    const path = join(dir, 'output'), fd = openSync(path, 'w');
    try {
      execFileSync(shell ? 'sh' : 'env', shell ? ['-c', command] : command.split(' ').slice(1),
        { stdio: ['ignore', fd, fd], env: { ...process.env, NODE_OPTIONS: `--import=${preloader}` } });
    } finally { closeSync(fd); }
    const output = readFileSync(path, 'utf8').trim().split('\n');
    assert.equal(output.length, 1);
    const receipt = JSON.parse(output[0].slice(context.receipt_prefix.length));
    assert.equal(receipt.shell, shell);
    assert.equal(receipt.argument_vector, !shell);
    assert.equal(receipt.env_1536_bytes, true);
    assert.equal(receipt.operation_id, context.operation_id);
  }
});
