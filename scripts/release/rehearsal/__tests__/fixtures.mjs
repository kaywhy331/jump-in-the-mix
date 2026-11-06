import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { client } from '../client.mjs';

export const synthetic = (bytes = 10) => randomBytes(bytes).toString('hex');
export const template = name => JSON.parse(readFileSync(new URL(`../../../../docs/release/rehearsal/${name}.template.json`, import.meta.url), 'utf8'));
export function fill(value, values) {
  if (Array.isArray(value)) return value.map(v => fill(v, values));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, values)]));
  if (typeof value !== 'string') return value;
  const exact = value.match(/^\{\{([A-Z0-9_]+)\}\}$/);
  if (exact) { assert.ok(exact[1] in values, exact[1]); return values[exact[1]]; }
  return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => { assert.ok(key in values, key); return values[key]; });
}
export function settings() {
  const s = fill(template('RELEASE_SETTINGS'), {
    BOOTSTRAP_RUN_ID: synthetic(), REHEARSAL_OWNER_ID: `tea-${synthetic()}`,
    REHEARSAL_WEB_ID: `srv-${synthetic()}`, REHEARSAL_WORKER_ID: `srv-${synthetic()}`,
    REHEARSAL_OPERATOR_ID: `srv-${synthetic()}`, REHEARSAL_SITE_URL: 'https://rehearsal.example.test',
    CATALOG_REVIEW_REF: `synthetic-${synthetic()}`, OPERATOR_FULL_SHA: synthetic(20), PREVIOUS_FULL_SHA: synthetic(20),
    REHEARSAL_DATABASE_HOST: 'db.example.test', REVIEWED_PLAIN_IP_HTTPS_URL: 'https://egress.example.test', EXPECTED_OPERATOR_EGRESS_IP: '192.0.2.1',
  });
  s.poll_interval_ms = 5; s.operation_timeout_ms = 30; s.rehearsal.receipt_wait_ms = 20;
  return s;
}

// No sockets or provider calls. Consume the actual HTTP URL/body contract.
export function renderStub(s, faults = {}) {
  const jobs = new Map(), calls = []; let clock = 1000;
  const fetcher = async (url, options) => {
    assert.equal(url.origin, 'https://api.render.com');
    calls.push({ path: url.pathname, search: url.search, method: options.method });
    const path = url.pathname.replace('/v1/', ''); let value;
    if (options.method === 'POST') {
      assert.equal(path, `services/${s.rehearsal.operator_service_id}/jobs`);
      if (faults.lostPost) throw Error('sensitive provider body');
      const { startCommand } = JSON.parse(options.body);
      const encoded = startCommand.match(/^env JITM_RELEASE_CONTEXT=([A-Za-z0-9+/=]+) node scripts\/release\/rehearsal\/(probe|seed)\.mjs --job(?: ;)?$/);
      assert.ok(encoded, 'Actual env-prefix command contract');
      const context = JSON.parse(Buffer.from(encoded[1], 'base64'));
      if (context.padding) assert.ok(Buffer.byteLength(encoded[1]) >= 1536);
      const id = faults.badId ? 'job-wrong' : `job-${synthetic()}`;
      jobs.set(id, { id, context, reads: 0, logReads: 0 });
      value = { id, status: faults.unknownCreate ? 'unknown' : 'pending' };
    } else if (path.endsWith('/deploys')) {
      value = [{ deploy: { status: 'live', commit: { id: faults.wrongPrevious ? synthetic(20) : s.rehearsal.previous_sha } } }];
    } else if (/^services\/[^/]+$/.test(path)) {
      const id = path.split('/')[1];
      value = { id, ownerId: faults.wrongOwner ? `tea-${synthetic()}` : s.render_owner_id, type: 'cron_job', autoDeploy: 'no' };
    } else if (path.startsWith('services/')) {
      const job = jobs.get(path.split('/').at(-1)); assert.ok(job);
      job.reads++;
      value = { id: job.id, status: faults.unknownStatus ? 'unknown' : job.reads === 1 ? 'running'
        : job.context.mode === 'nonzero-exit' && !faults.nonzeroSucceeded ? 'failed' : 'succeeded',
      startedAt: new Date(faults.noOverlap && job.context.mode === 'parallel-b' ? 250 : 0).toISOString(), finishedAt: new Date(200).toISOString() };
    } else if (path === 'logs') {
      const job = jobs.get(url.searchParams.get('resource')); assert.ok(job, 'Logs must address the exact job');
      assert.equal(url.searchParams.get('ownerId'), s.render_owner_id);
      job.logReads++;
      const receipt = { operation_id: faults.crossJob ? synthetic() : job.context.operation_id, mode: job.context.mode,
        env_1536_bytes: !faults.smallEnv, egress_address: faults.egressChanges && job.context.mode === 'shell-detection' ? '192.0.2.2' : '192.0.2.1',
        shell: !faults.argv, argument_vector: !!faults.argv, nonzero_exit: true,
        previous_commit: true, unmarked_rows: !faults.markedSeed, nontrivial: true };
      if (faults.badMode) receipt.argument_vector = receipt.shell;
      const message = s.receipt_prefix + JSON.stringify(receipt);
      value = { logs: faults.noReceipt || (faults.late && job.logReads === 1) ? [] : [{ message }, ...(faults.duplicate ? [{ message }] : [])] };
      if (faults.inexactPrefix) value.logs = [{ message: ` ${message}` }];
    } else assert.fail(`Unexpected stub path: ${path}`);
    return new Response(JSON.stringify(value), { status: 200 });
  };
  const io = client(s, { fetcher, token: synthetic(24), now: () => clock, sleep: async ms => { clock += ms; } });
  return { io, jobs, calls, fetcher };
}
