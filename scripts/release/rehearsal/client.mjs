import { randomUUID } from 'node:crypto';
import { buildStartCommand, terminalStatus } from '../workflow.mjs';

export const need = (ok, message) => { if (!ok) throw new Error(message); };
export const statuses = new Set(['pending', 'running', 'succeeded', 'failed', 'canceled']);
export const jobId = value => need(/^job-[0-9a-z]{20}$/.test(value ?? ''), 'Invalid job ID shape');
const identifier = value => need(/^[a-z]+-[0-9a-z]+$/.test(value ?? ''), 'Invalid provider ID shape');

export function validate(settings) {
  need(settings.production_environment === 'rehearsal'
    && settings.releaser_prefix === 'rehearsal-releaser-'
    && settings.production_tag_prefix === 'rehearsal-published-'
    && settings.record_branch_prefix === 'rehearsal/record-'
    && settings.ledger_branch === 'rehearsal/ledger'
    && settings.concurrency_group === 'rehearsal-release-and-recovery'
    && settings.receipt_prefix === 'JITM_RELEASE_RECEIPT:', 'Rehearsal namespace required');
  need(settings.render_api_url === 'https://api.render.com/v1/', 'Fixed Render API required');
  identifier(settings.render_owner_id);
  identifier(settings.rehearsal.operator_service_id);
  for (const key of ['request_timeout_ms', 'operation_timeout_ms', 'poll_interval_ms']) {
    need(Number.isSafeInteger(settings[key]) && settings[key] > 0, 'Positive timeout required');
  }
  const r = settings.rehearsal;
  for (const key of ['receipt_wait_ms', 'overlap_hold_ms']) need(Number.isSafeInteger(r[key]) && r[key] > 0, 'Positive probe timing required');
  const url = new URL(r.egress_url);
  need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'Reviewed HTTPS egress endpoint required');
  need(Array.isArray(r.expected_egress_addresses), 'Expected egress list required');
  return settings;
}

export function client(settings, { fetcher = fetch, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), token } = {}) {
  validate(settings);
  need(typeof token === 'string' && token.length > 0, 'Render key required');
  const report = {};
  async function api(path, body) {
    const url = new URL(path, settings.render_api_url);
    need(url.origin === new URL(settings.render_api_url).origin, 'API origin changed');
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(settings.request_timeout_ms),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    need(response.ok, 'Render HTTP failure'); // Never include bodies or thrown provider messages.
    return response.json();
  }
  const serviceId = settings.rehearsal.operator_service_id;
  async function operator() {
    const service = await api(`services/${serviceId}`);
    report.operator_identity = service.id === serviceId && service.ownerId === settings.render_owner_id
      && service.type === 'cron_job' && service.autoDeploy === 'no';
    need(report.operator_identity, 'Operator identity mismatch');
  }
  function context(mode, extras = {}) {
    return { operation_id: randomUUID(), mode, receipt_prefix: settings.receipt_prefix, ...extras };
  }
  async function create(context, script, suffix = '') {
    const command = buildStartCommand(context, `node scripts/release/rehearsal/${script}.mjs --job`) + suffix;
    const response = await api(`services/${serviceId}/jobs`, { startCommand: command });
    report.job_id_shape = /^job-[0-9a-z]{20}$/.test(response.id ?? '');
    report.job_status_enum = statuses.has(response.status);
    jobId(response.id);
    need(report.job_status_enum, 'Unknown job status');
    return { id: response.id, context };
  }
  async function terminal(job, expected) {
    const deadline = now() + settings.operation_timeout_ms;
    do {
      const result = await api(`services/${serviceId}/jobs/${job.id}`);
      report.job_identity = result.id === job.id;
      report.job_status_enum = statuses.has(result.status);
      need(report.job_identity && report.job_status_enum, 'Unknown job shape or status');
      if (terminalStatus('job', result)) {
        need(result.status === expected, 'Unexpected terminal status');
        return { ...job, terminal: result, observedAt: now() };
      }
      await sleep(settings.poll_interval_ms);
    } while (now() < deadline);
    throw new Error('Job observation timed out; do not retry creation');
  }
  async function receipt(job, label) {
    const query = new URLSearchParams({ ownerId: settings.render_owner_id, resource: job.id, direction: 'backward', limit: '100' });
    const deadline = now() + settings.rehearsal.receipt_wait_ms;
    let reads = 0;
    do {
      const response = await api(`logs?${query}`);
      need(Array.isArray(response.logs), 'Unknown logs shape');
      reads++;
      const lines = response.logs.map(x => x.message).filter(x => typeof x === 'string' && x.startsWith(settings.receipt_prefix));
      need(lines.length <= 1, 'Multiple exact-prefix receipts');
      if (lines.length) {
        const value = JSON.parse(lines[0].slice(settings.receipt_prefix.length));
        need(value.operation_id === job.context.operation_id && value.mode === job.context.mode, 'Cross-job receipt or wrong identity');
        report[label] = { single_receipt: true, first_read: reads === 1, receipt_latency_ms: now() - job.observedAt };
        // Polling measures latency; it must NOT conceal the release runner's single-read gap.
        need(reads === 1, 'Receipt arrived after first terminal-status read');
        return value;
      }
      await sleep(settings.poll_interval_ms);
    } while (now() < deadline);
    report[label] = { single_receipt: false, first_read: false, receipt_latency_ms: now() - job.observedAt };
    throw new Error('Receipt not observed');
  }
  return { api, operator, context, create, terminal, receipt, report };
}

export function jobContext(env = process.env) {
  const value = JSON.parse(Buffer.from(env.JITM_RELEASE_CONTEXT ?? '', 'base64').toString());
  need(value.receipt_prefix === 'JITM_RELEASE_RECEIPT:' && typeof value.operation_id === 'string', 'Invalid rehearsal context');
  return value;
}

export function emit(context, evidence) {
  console.log(context.receipt_prefix + JSON.stringify({ operation_id: context.operation_id, mode: context.mode, ...evidence }));
}

export async function cli(run, job, env = process.env) {
  const report = { rehearsal: true, go_live: false };
  try {
    if (process.argv[2] === '--job') return await job(jobContext(env));
    need(env.GITHUB_EVENT_NAME === 'workflow_dispatch'
      && env.GITHUB_REF?.startsWith('refs/tags/rehearsal-releaser-'), 'Owner rehearsal tag dispatch required');
    const settings = JSON.parse(env.REHEARSAL_SETTINGS_JSON);
    const io = client(settings, { token: env.RENDER_API_KEY });
    report.observations = io.report;
    await run(settings, io);
    report.passed = true;
  } catch { report.passed = false; process.exitCode = 1; }
  console.log(JSON.stringify(report));
}
