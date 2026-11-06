// Executed only from the owner-cut releaser tag. No npm install, candidate
// checkout, candidate import, shell evaluation, or candidate subprocess here.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bind, verifyCandidate, digest, blobDigest } from './candidate.mjs';
import { GitLedger, read, resolve, verify, assertNoUnresolved } from './ledger.mjs';

export const requiredChecks = Object.freeze({
  preflight: ['database_ready', 'runtime_role', 'no_recovery_hold', 'migration_checksums', 'reviewed_diff', 'counts_recorded'],
  backup: ['encrypted', 'fresh', 'durable', 'checksum_verified'],
  migrate: ['forward_only', 'runtime_role', 'new_objects', 'backup_grants', 'counts_unchanged'],
  worker_gate: ['candidate_heartbeat', 'old_instance_drained', 'queue_probe_created_nothing', 'probe_removed'],
  postflight: ['public', 'security_headers', 'redirects', 'health', 'signed_in_redirects', 'asset_hashes', 'deleted_files_absent'],
  smoke: ['one_synthetic_owner', 'no_recipient_addresses', 'manual_beats', 'cookie_flags_and_lifetime', 'phone_today', 'client_address', 'signed_errors', 'both_theme_reflow_and_axe', 'release_changes'],
  cleanup: ['all_synthetic_rows_removed'],
  final: ['counts_unchanged', 'no_synthetic_rows', 'no_probe_jobs', 'no_rate_limit_blocks', 'no_failed_jobs_since_release'],
});
export function checkReceipt(receipt, step, operationId, candidateSha) {
  if (receipt?.operation_id !== operationId || receipt?.candidate_sha !== candidateSha) throw new Error('Receipt identity mismatch');
  if (!requiredChecks[step]?.every((key) => receipt.checks?.[key] === true)) throw new Error(`Missing or failed ${step} assertions`);
  // Only allowlisted assertion names and hashes enter the public ledger.
  return { checks: Object.fromEntries(requiredChecks[step].map((key) => [key, true])) };
}
export function terminalStatus(kind, object) {
  if (kind === 'deploy') return ({ live: 'succeeded', build_failed: 'failed', update_failed: 'failed', pre_deploy_failed: 'failed', canceled: 'cancelled', deactivated: 'cancelled' })[object.status];
  return ({ succeeded: 'succeeded', failed: 'failed', canceled: 'cancelled' })[object.status];
}
const need = (condition, message) => { if (!condition) throw new Error(message); };
const id = (value) => { need(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), 'Invalid provider identifier'); return value; };
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export async function changeManifest(cwd, previousSha, candidateSha) {
  const list = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean);
  const changed = list('diff', '--name-only', '-z', previousSha, candidateSha);
  const exists = new Set(list('ls-tree', '-r', '--name-only', '-z', candidateSha));
  const manifest = [];
  for (const path of changed) manifest.push([path, exists.has(path) ? await blobDigest(cwd, candidateSha, path) : null]);
  return manifest;
}

// Injected transport makes the lost-response boundary testable without a
// provider call. No timeout or transport exception triggers a second request.
export async function performOperation({ ledger, request, invoke, observe }) {
  await ledger.append(request);
  let providerId = null;
  let terminalRecorded = false;
  try {
    const result = await invoke();
    providerId = result?.id ?? null;
    if (providerId) id(providerId);
    await ledger.append({ ...request, render_deploy_id: providerId, status: 'unresolved', evidence: { ...request.evidence, reason: providerId ? 'Awaiting terminal observation' : 'none returned' }, at: new Date().toISOString() });
    need(providerId, 'Provider returned no ID; operation remains unresolved');
    const observed = await observe(providerId);
    await ledger.append({ ...request, render_deploy_id: providerId, status: observed.status, evidence: { kind: 'E1', observed_status: observed.status, reference: observed.path, ...observed.receipt }, at: new Date().toISOString() });
    terminalRecorded = true;
    need(observed.status === 'succeeded', 'Provider reported a terminal failure');
  } catch (error) {
    if (!terminalRecorded) await ledger.append({ ...request, render_deploy_id: providerId, status: 'unresolved', evidence: { ...request.evidence, reason: 'Request or observation incomplete; do not retry automatically' }, at: new Date().toISOString() });
    throw error;
  }
}

export async function run(command, env = process.env) {
  const settings = JSON.parse(env.RELEASE_SETTINGS_JSON);
  const approval = JSON.parse(env.RELEASE_APPROVAL_JSON);
  const candidate = env.CANDIDATE_SHA;
  const runKey = `${env.GITHUB_RUN_ID}.${env.GITHUB_RUN_ATTEMPT}`;
  const ref = env.GITHUB_REF;
  need(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Manual dispatch required');
  need(settings.releaser_prefix && ref?.startsWith(`refs/tags/${settings.releaser_prefix}`), 'Owner releaser tag required');
  need(git('rev-parse', 'HEAD') === env.GITHUB_SHA, 'Checkout must be the workflow tag commit');
  need(/^[a-f0-9]{40}$/.test(candidate), 'Full candidate SHA required');
  for (const key of ['main_branch', 'ledger_branch', 'ledger_file', 'concurrency_group', 'production_environment', 'production_tag_prefix', 'record_branch_prefix', 'render_api_url', 'site_url']) need(settings[key], `Missing setting: ${key}`);
  for (const key of ['request_timeout_ms', 'operation_timeout_ms', 'poll_interval_ms']) need(Number.isSafeInteger(settings[key]) && settings[key] > 0, `Positive timeout setting required: ${key}`);
  need(Array.isArray(settings.health_paths) && settings.health_paths.length > 0, 'Health paths required');
  need(settings.ledger_branch !== settings.main_branch, 'Ledger must have a dedicated ref');
  need(approval.candidate.candidate_sha === candidate && approval.release_name === env.RELEASE_NAME, 'Approval must name candidate and release');
  need(approval.migration_job === env.MIGRATION_JOB, 'Migration selection differs from approval');
  need(approval.reviewed_jobs_sha256 === digest(JSON.stringify(settings.jobs)), 'Reviewed job definitions changed');
  need(approval.tier3?.passed === true && approval.tier3.reference && approval.review_ref, 'Local tier-3 baseline evidence and review required');
  need(Array.isArray(approval.pull_requests) && approval.pull_requests.length && approval.previous_sha?.match(/^[a-f0-9]{40}$/), 'Previous release and reviewed pull requests required');
  for (const key of ['previous_tag', 'dependencies', 'changes', 'rollback', 'owner_followups', 'not_run', 'carried_followups']) need(typeof approval[key] === 'string' && approval[key].trim(), `Release record field required: ${key}`);

  async function http(base, token, path, options = {}) {
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
    need(url.origin === new URL(base).origin && url.protocol === 'https:', 'API origin must remain fixed and HTTPS');
    const response = await fetch(url, {
      method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(settings.request_timeout_ms),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status === 404 && options.allow404) return null;
    // Do not log request/response bodies, commands, credentials or private logs.
    need(response.ok, `Provider HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  const github = (path, options) => http(`${env.GITHUB_API_URL}/repos/${env.GITHUB_REPOSITORY}/`, env.GH_TOKEN, path, options);
  const render = (path, options) => http(settings.render_api_url, env.RENDER_API_KEY, path, options);
  const ledger = new GitLedger(github, { branch: settings.ledger_branch, file: settings.ledger_file, bootstrap: settings.ledger_bootstrap_run === env.GITHUB_RUN_ID });
  const history = async () => read((await ledger.read()).text);
  // All lookups below are scoped to this run attempt.
  const current = async (step) => verify(await history()).get(`${runKey}.${step}`);
  const checked = async (step) => { const r = await current(step); need(r?.status === 'succeeded', `Required step has not succeeded: ${step}`); return r; };
  if (command !== 'gate') {
    const bound = await checked('approval');
    need(bound.evidence.approval_sha256 === digest(env.RELEASE_APPROVAL_JSON) && bound.evidence.settings_sha256 === digest(env.RELEASE_SETTINGS_JSON), 'Approval/settings changed after the environment approval gate');
  }

  async function binding() {
    const main = await github(`git/ref/heads/${settings.main_branch}`);
    git('fetch', '--no-tags', 'origin', main.object.sha, candidate);
    verifyCandidate(approval.candidate, await bind(process.cwd(), candidate, main.object.sha), main.object.sha);
    return main.object.sha;
  }
  async function local(step, action) {
    assertNoUnresolved(await history());
    const request = { operation_id: `${runKey}.${step}`, candidate_sha: candidate, step, render_deploy_id: null, status: 'requested', evidence: { operation_kind: 'local' }, at: new Date().toISOString() };
    await ledger.append(request);
    try {
      const evidence = await action();
      await ledger.append({ ...request, status: 'succeeded', evidence: { kind: 'local', ...evidence }, at: new Date().toISOString() });
    } catch (error) {
      await ledger.append({ ...request, status: 'failed', evidence: { kind: 'local', reason: 'Local gate failed; inspect private run evidence' }, at: new Date().toISOString() });
      throw error;
    }
  }
  async function poll(kind, serviceId, objectId) {
    const path = `services/${id(serviceId)}/${kind === 'deploy' ? 'deploys' : 'jobs'}/${id(objectId)}`;
    const deadline = Date.now() + settings.operation_timeout_ms;
    while (Date.now() < deadline) {
      const object = await render(path);
      const status = terminalStatus(kind, object);
      if (status) return { object, status, path };
      await new Promise((r) => setTimeout(r, settings.poll_interval_ms));
    }
    throw new Error('Observation timed out; timing does not resolve the ledger');
  }
  async function jobReceipt(step, serviceId, jobId, operationId) {
    // Render log shape and one-off ID/resource correlation must be qualified in h.
    const query = new URLSearchParams({ ownerId: settings.render_owner_id, resource: jobId, direction: 'backward', limit: '100' });
    const logs = await render(`logs?${query}`);
    const messages = (logs.logs ?? []).map((entry) => entry.message).filter((text) => typeof text === 'string' && text.startsWith(settings.receipt_prefix));
    const receipts = messages.map((text) => JSON.parse(text.slice(settings.receipt_prefix.length))).filter((value) => value.operation_id === operationId);
    need(receipts.length === 1, 'Exactly one bound one-off receipt required');
    const safe = checkReceipt(receipts[0], step, operationId, candidate);
    if (step === 'preflight') {
      need(/^[a-f0-9]{64}$/.test(receipts[0].counts_sha256), 'Record-count baseline digest required');
      safe.counts_sha256 = receipts[0].counts_sha256;
    }
    if (['migrate', 'final'].includes(step)) need(receipts[0].counts_sha256 === (await checked('preflight')).evidence.counts_sha256, 'Record counts changed');
    if (step === 'backup') {
      need(/^[a-f0-9]{64}$/.test(receipts[0].backup_sha256), 'Encrypted backup checksum required');
      safe.backup_sha256 = receipts[0].backup_sha256;
    }
    return safe;
  }
  async function external(step, kind, serviceId, body) {
    await binding();
    assertNoUnresolved(await history());
    const request = { operation_id: `${runKey}.${step}`, candidate_sha: candidate, step, render_deploy_id: null, status: 'requested', evidence: { operation_kind: kind, service_id: serviceId, request_sha256: digest(JSON.stringify(body)) }, at: new Date().toISOString() };
    // This ref append must succeed BEFORE the request leaves the runner.
    await performOperation({ ledger, request,
      invoke: () => render(`services/${id(serviceId)}/${kind === 'deploy' ? 'deploys' : 'jobs'}`, { method: 'POST', body }),
      observe: async (providerId) => {
        const observed = await poll(kind, serviceId, providerId);
        if (kind === 'deploy' && observed.status === 'succeeded') need(observed.object.commit?.id === candidate, 'Deployed commit differs from candidate');
        const receipt = kind === 'job' && observed.status === 'succeeded' ? await jobReceipt(step, serviceId, providerId, request.operation_id) : {};
        return { ...observed, receipt };
      },
    });
  }
  async function job(step, specKey = step) {
    const spec = settings.jobs[specKey];
    need(spec?.review_ref && typeof spec.command === 'string' && spec.command.length, 'Reviewed one-off job definition required');
    if (step === 'migrate') need(spec.forward_only === true, 'Migration job must be reviewed as forward-only');
    const baseline = (await current('preflight'))?.evidence?.counts_sha256 ?? null;
    const context = Buffer.from(JSON.stringify({ operation_id: `${runKey}.${step}`, candidate_sha: candidate, previous_sha: approval.previous_sha, candidate_binding: approval.candidate, release_started_at: (await checked('approval')).at, baseline_counts_sha256: baseline, receipt_prefix: settings.receipt_prefix, checks: requiredChecks[step] })).toString('base64');
    await external(step, 'job', id(spec.service_id), { startCommand: `JITM_RELEASE_CONTEXT=${context} ${spec.command}` });
  }
  function blueprintNames() {
    const yaml = git('show', `${candidate}:render.yaml`).split('\nservices:\n')[1];
    need(yaml, 'Blueprint services required');
    return Object.fromEntries([...yaml.matchAll(/^  - type: (web|worker)\n    name: ([A-Za-z0-9_-]+)$/gm)].map((m) => [m[1], m[2]]));
  }
  async function serviceChecks(expectedSha) {
    const names = blueprintNames();
    for (const type of ['worker', 'web']) {
      const serviceId = id(settings.services[type]);
      const service = await render(`services/${serviceId}`);
      need(names[type] && service.name === names[type] && service.autoDeploy === 'no', 'Service identity or auto-deploy mismatch');
      const deployments = await render(`services/${serviceId}/deploys?limit=20`);
      const live = deployments.map((entry) => entry.deploy ?? entry).filter((entry) => entry.status === 'live');
      need(live.length === 1 && live[0].commit?.id === expectedSha, 'Live service commit mismatch');
      if (type === 'web') {
        const domains = await render(`services/${serviceId}/custom-domains`);
        need(domains.some((entry) => (entry.customDomain ?? entry).name === new URL(settings.site_url).hostname), 'Production domain does not belong to the web service');
      }
    }
    for (let i = 0; i < 3; i++) {
      for (const path of settings.health_paths) {
        const response = await fetch(new URL(path, settings.site_url), { redirect: 'error', signal: AbortSignal.timeout(settings.request_timeout_ms) });
        need(response.status === 200, 'Health check failed'); await response.body?.cancel();
      }
    }
    return { target_checks: true, changed_files_sha256: digest(JSON.stringify(await changeManifest(process.cwd(), approval.previous_sha, candidate))) };
  }

  if (command === 'gate') {
    await binding();
    const previous = await ledger.read();
    if (env.LEDGER_RESOLUTION) {
      const resolution = JSON.parse(env.LEDGER_RESOLUTION);
      const entry = verify(read(previous.text)).get(resolution.operation_id);
      need(entry, 'Resolution names no ledger operation');
      if (resolution.kind === 'E1') {
        // E1 may only observe an ID durably returned earlier. Missing-ID cases
        // require E3, never a guessed ID or a time-window match (E2).
        need(entry.render_deploy_id && resolution.render_deploy_id === entry.render_deploy_id, 'E1 needs the recorded returned ID');
        const initial = read(previous.text).find((r) => r.operation_id === resolution.operation_id);
        const observed = await poll(initial.evidence.operation_kind, initial.evidence.service_id, entry.render_deploy_id);
        if (initial.evidence.operation_kind === 'deploy') need(observed.object.commit?.id === entry.candidate_sha, 'E1 deploy candidate mismatch');
        need(observed.status === resolution.status && resolution.observed_status === observed.status, 'E1 terminal status mismatch');
        resolution.reference = observed.path;
      } else {
        need(resolution.kind === 'E3' && approval.ledger_resolution_sha256 === digest(env.LEDGER_RESOLUTION), 'E3 decision must be bound to the owner-approved release record');
      }
      await ledger.write(previous, resolve(previous.text, resolution));
    }
    assertNoUnresolved(await history());
    await local('approval', async () => ({ approval_sha256: digest(env.RELEASE_APPROVAL_JSON), settings_sha256: digest(env.RELEASE_SETTINGS_JSON), binding: approval.candidate, review_ref: approval.review_ref, previous_sha: approval.previous_sha }));
  } else if (command === 'preflight') {
    await checked('approval'); await local('preflight_services', () => serviceChecks(approval.previous_sha)); await job('preflight');
  } else if (command === 'backup') {
    await checked('preflight'); await job('backup');
  } else if (command === 'migrate') {
    await checked('backup');
    if (env.MIGRATION_JOB === 'none') {
      const previous = await bind(process.cwd(), approval.previous_sha, approval.candidate.approved_main_sha);
      need(previous.migrations_sha256 === approval.candidate.migrations_sha256, 'Changed migration set requires a reviewed job');
      await local('migrate', async () => ({ migration_job: 'none', reason: 'Migration set unchanged' }));
    } else await job('migrate', env.MIGRATION_JOB);
  } else if (command === 'worker') {
    await checked('migrate'); await external('worker', 'deploy', settings.services.worker, { commitId: candidate, clearCache: 'do_not_clear' });
    await job('worker_gate');
  } else if (command === 'web') {
    await checked('worker_gate'); await external('web', 'deploy', settings.services.web, { commitId: candidate, clearCache: 'do_not_clear' });
  } else if (command === 'postflight') {
    await checked('web'); await local('postflight_services', () => serviceChecks(candidate)); await job('postflight');
  } else if (command === 'smoke') {
    await checked('postflight'); await job('smoke');
  } else if (command === 'cleanup') {
    need(await current('smoke'), 'Smoke was not requested'); await job('cleanup');
  } else if (command === 'final') {
    await checked('smoke'); await checked('cleanup'); await job('final'); await local('final_services', () => serviceChecks(candidate));
  } else if (command === 'publish') {
    assertNoUnresolved(await history());
    for (const step of ['approval', 'preflight_services', 'preflight', 'backup', 'migrate', 'worker', 'worker_gate', 'web', 'postflight_services', 'postflight', 'smoke', 'cleanup', 'final', 'final_services']) await checked(step);
    const worker = await checked('worker'); const web = await checked('web'); const final = await checked('final_services');
    const utcDate = web.at.slice(0, 10);
    const tag = `${settings.production_tag_prefix}${utcDate}-${candidate.slice(0, 7)}`;
    const message = `${env.RELEASE_NAME}\nPRs: ${approval.pull_requests.join(', ')}\nWorker: ${worker.render_deploy_id}\nWeb: ${web.render_deploy_id}\nPrevious: ${approval.previous_sha}\nRun: ${env.GITHUB_RUN_ID}`;
    // Existing tags are never moved, and publication failures never redeploy.
    need(!await github(`git/ref/tags/${tag}`, { allow404: true }), 'Production tag already exists; manual publication reconciliation required');
    const tagged = await github('git/tags', { method: 'POST', body: { tag, message, object: candidate, type: 'commit' } });
    await github('git/refs', { method: 'POST', body: { ref: `refs/tags/${tag}`, sha: tagged.sha } });
    const rows = (await history()).filter((r) => r.candidate_sha === candidate);
    const titleDate = new Date(web.at).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
    const markdown = `# ${env.RELEASE_NAME} — ${titleDate}\n\nLive URL: ${settings.site_url}; final check ${final.at} (UTC)\n\n${env.MIGRATION_JOB === 'none' ? 'Code-only' : 'Migration'} release; rollback: ${env.MIGRATION_JOB === 'none' ? 'previous tag, web then worker' : 'forward correction only; never reverse a migration in place'}.\n\n| Item | Evidence |\n|---|---|\n| Previous commit / tag | ${approval.previous_sha} / ${approval.previous_tag} |\n| Application commit / PRs / tag | ${candidate} / ${approval.pull_requests.join(', ')} / ${tag} |\n| Migration job | ${env.MIGRATION_JOB} |\n| Dependencies | ${approval.dependencies} |\n| Worker deploy / observed live UTC | ${worker.render_deploy_id} / ${worker.at} |\n| Web deploy / observed live UTC | ${web.render_deploy_id} / ${web.at}; build ID unknown; cache retained |\n| Final check UTC | ${final.at} |\n\n## Changes\n\n${approval.changes}\n\n## Decisions\n\n1. Owner-approved releaser ref: ${ref}; review: ${approval.review_ref}.\n\n## Verification\n\nVERIFIED-RUNTIME: this workflow CI tier and release gates passed. Local tier-3 baseline and failure classification: ${approval.tier3.reference}.\n\n## Release steps and attempts\n\n${rows.map((r) => `- ${r.at}: ${r.step} ${r.status}; provider ID ${r.render_deploy_id ?? 'none'}; evidence ${JSON.stringify(r.evidence)}`).join('\n')}\n\n## Rollback\n\n${approval.rollback}\n\n## Owner steps and NOT RUN\n\n${approval.owner_followups}\n\nNOT RUN: ${approval.not_run}\n\n## Follow-ups\n\n${approval.carried_followups}\n`;
    mkdirSync(settings.record_directory, { recursive: true });
    const path = `${settings.record_directory}/RELEASE_${candidate.slice(0, 7)}_${utcDate}.md`;
    writeFileSync(path, markdown);
    const branch = `${settings.record_branch_prefix}${utcDate}-${candidate.slice(0, 7)}`;
    await github('git/refs', { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: candidate } });
    await github(`contents/${path}`, { method: 'PUT', body: { message: `docs: record the ${env.RELEASE_NAME} release (${candidate.slice(0, 7)})`, branch, content: Buffer.from(markdown).toString('base64') } });
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n\nManual WF-06 step 13: open the record PR from ${branch}; update the feature map when statuses changed. Required PR title: docs: record the ${env.RELEASE_NAME} release (${candidate.slice(0, 7)}).\n`);
  } else throw new Error('Unknown release command');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2]).catch(() => {
    // Provider errors may contain sensitive data. The ledger keeps safe reasons.
    console.error('Release gate failed; inspect the ledger and private provider evidence. No automatic retry.');
    process.exitCode = 1;
  });
}
