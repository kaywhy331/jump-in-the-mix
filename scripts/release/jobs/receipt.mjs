import { pathToFileURL } from 'node:url';
import { requiredChecks, checkReceipt } from '../workflow.mjs';
import { settings } from './settings.mjs';

export function need(value) { if (!value) throw new Error('Release assertion failed'); }
export const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function parseContext(step, encoded = process.env.JITM_RELEASE_CONTEXT, now = Date.now()) {
  need(requiredChecks[step] && typeof encoded === 'string' && encoded.length <= settings.maxContextBytes);
  need(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded));
  const bytes = Buffer.from(encoded, 'base64');
  need(bytes.toString('base64') === encoded);
  const context = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  need(context && !Array.isArray(context));
  need(typeof context.operation_id === 'string' && new RegExp(`^[0-9]+\\.[0-9]+\\.${step}$`).test(context.operation_id));
  need(isSha(context.candidate_sha) && isSha(context.previous_sha));
  need(typeof context.receipt_prefix === 'string' && /^[A-Za-z0-9_:.-]{1,100}:$/.test(context.receipt_prefix));
  need(typeof context.release_started_at === 'string' && new Date(context.release_started_at).toISOString() === context.release_started_at && Date.parse(context.release_started_at) <= now);
  need(JSON.stringify(context.checks) === JSON.stringify(requiredChecks[step]));
  const binding = context.candidate_binding;
  need(binding?.candidate_sha === context.candidate_sha && isSha(binding.approved_main_sha));
  for (const key of ['lockfile_sha256', 'render_yaml_sha256', 'migrations_sha256']) need(isDigest(binding[key]));
  need(step === 'preflight' ? context.baseline_counts_sha256 === null : isDigest(context.baseline_counts_sha256));
  return Object.freeze(context);
}

// Nothing from an exception, subprocess, configuration or context is logged.
// Construct an allowlisted receipt only after the entire command succeeds.
export async function runJob(step, action, { env = process.env, stdout = line => process.stdout.write(line), stderr = line => process.stderr.write(line) } = {}) {
  try {
    const context = parseContext(step, env.JITM_RELEASE_CONTEXT);
    const result = await action(context);
    const identity = { operation_id: context.operation_id, candidate_sha: context.candidate_sha };
    const safe = { ...identity, ...checkReceipt({ ...result, ...identity }, step, context.operation_id, context.candidate_sha) };
    const hashKey = step === 'backup' ? 'backup_sha256' : ['preflight', 'migrate', 'final'].includes(step) ? 'counts_sha256' : null;
    if (hashKey) {
      need(isDigest(result[hashKey]));
      if (['migrate', 'final'].includes(step)) need(result[hashKey] === context.baseline_counts_sha256);
      safe[hashKey] = result[hashKey];
    }
    stdout(`${context.receipt_prefix}${JSON.stringify(safe)}\n`);
    return 0;
  } catch {
    stderr('Release job failed; no success receipt emitted.\n');
    return 1;
  }
}

export function cli(url, step, action) {
  if (process.argv[1] && url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.length !== 2) { process.stderr.write('Release job accepts no arguments.\n'); process.exitCode = 1; }
    else runJob(step, action).then(code => { process.exitCode = code; });
  }
}
