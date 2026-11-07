import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const statuses = new Set(['requested', 'succeeded', 'failed', 'cancelled', 'unresolved']);
const terminal = new Set(['succeeded', 'failed', 'cancelled']);
const keys = ['operation_id', 'candidate_sha', 'step', 'render_deploy_id', 'status', 'evidence', 'at'];
const fail = (message) => { throw new Error(`Ledger: ${message}`); };
export const pending = (record) => !terminal.has(record.status);

// Reads never repair, truncate, skip, or reinterpret malformed history.
export function read(text) {
  if (typeof text !== 'string' || (text && !text.endsWith('\n'))) fail('expected complete JSON lines');
  const records = text ? text.slice(0, -1).split('\n').map((line) => {
    try { return JSON.parse(line); } catch { return fail('invalid JSON line'); }
  }) : [];
  verify(records);
  return records;
}

export function verify(records) {
  if (!Array.isArray(records)) fail('expected records');
  const latest = new Map();
  for (const record of records) {
    if (!record || keys.some((key) => !(key in record)) || Object.keys(record).length !== keys.length) fail('invalid record fields');
    const { operation_id: id, candidate_sha: sha, status, evidence, at } = record;
    if (!/^[a-zA-Z0-9_.:-]+$/.test(id) || !/^[a-f0-9]{40}$/.test(sha) || !/^[a-zA-Z0-9_-]+$/.test(record.step)) fail('invalid identity');
    if (!statuses.has(status) || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)) fail('invalid status/evidence');
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) fail('invalid UTC timestamp');
    if (record.render_deploy_id !== null && !/^[a-zA-Z0-9_-]+$/.test(record.render_deploy_id)) fail('invalid provider id');
    const previous = latest.get(id);
    if (!previous && status !== 'requested') fail('operation must start requested');
    if (previous) {
      if (!pending(previous)) fail('terminal operation is immutable');
      if (sha !== previous.candidate_sha || record.step !== previous.step) fail('operation identity changed');
      if (previous.render_deploy_id && record.render_deploy_id !== previous.render_deploy_id) fail('provider id changed');
      if (Date.parse(at) < Date.parse(previous.at)) fail('operation time moved backwards');
      if (status === 'requested') fail('duplicate request');
      if (terminal.has(status)) {
        if (evidence.kind === 'E1') {
          if (!record.render_deploy_id || evidence.observed_status !== status || !evidence.reference) fail('E1 requires returned id and terminal observation');
        } else if (evidence.kind === 'E3') {
          if (!evidence.decision_ref || !evidence.decision || evidence.author !== 'Kevin') fail('E3 requires Kevin recorded decision');
        } else if (evidence.kind !== 'local' || previous.evidence.operation_kind !== 'local') {
          fail('external outcome requires E1 or E3; E2 timing is informational only');
        }
      }
    } else if (!['local', 'deploy', 'job'].includes(evidence.operation_kind)) fail('missing operation kind');
    latest.set(id, record);
  }
  return latest;
}

export function assertNoUnresolved(records) {
  const unresolved = [...verify(records).values()].filter(pending);
  if (unresolved.length) fail(`unresolved operations: ${unresolved.map((r) => r.operation_id).join(', ')}`);
  return true;
}

export function append(text, record) {
  const records = read(text);
  // Only an observation/resolution of the outstanding operation may follow it.
  if (!records.some((r) => r.operation_id === record.operation_id)) assertNoUnresolved(records);
  verify([...records, record]);
  return text + JSON.stringify(record) + '\n';
}

export function resolve(text, resolution, at = new Date().toISOString()) {
  const current = verify(read(text)).get(resolution.operation_id);
  if (!current || !pending(current)) fail('resolution must name an unresolved operation');
  if (!['E1', 'E3'].includes(resolution.kind)) fail('only E1 or E3 can resolve an operation');
  return append(text, {
    ...current, at, status: resolution.status,
    render_deploy_id: resolution.render_deploy_id ?? current.render_deploy_id,
    evidence: resolution,
  });
}

// Storage uses GitHub's non-force ref update as compare-and-swap. A competing
// append creates a sibling commit and the losing ref update is rejected.
export class GitLedger {
  constructor(api, { branch, file, bootstrap = false }) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_/-]*$/.test(branch) || branch.includes('..')) fail('invalid ledger branch');
    if (typeof file !== 'string' || file.split('/').some((part) => !part || part === '.' || part === '..')) fail('invalid ledger file');
    this.api = api; this.branch = branch; this.file = file; this.bootstrap = bootstrap;
  }
  async read() {
    const ref = await this.api(`git/ref/heads/${this.branch}`, { allow404: true });
    if (!ref) {
      if (!this.bootstrap) fail('missing ledger ref; explicit first-run bootstrap required');
      return { text: '', head: null };
    }
    // Resolve the file at the captured ref, then read the Git blob API. The
    // contents API omits base64 data once a file exceeds 1 MB.
    const commit = await this.api(`git/commits/${ref.object.sha}`);
    let objectSha = commit.tree.sha;
    const parts = this.file.split('/');
    for (const [index, part] of parts.entries()) {
      const tree = await this.api(`git/trees/${objectSha}`);
      if (tree.truncated || !Array.isArray(tree.tree)) fail('unreadable ledger tree');
      const entry = tree.tree.find((entry) => entry.path === part);
      if (!entry?.sha || entry.type !== (index === parts.length - 1 ? 'blob' : 'tree')) fail('missing ledger blob');
      objectSha = entry.sha;
    }
    const content = await this.api(`git/blobs/${objectSha}`);
    if (content.encoding !== 'base64' || typeof content.content !== 'string') fail('unreadable ledger blob');
    const text = Buffer.from(content.content, 'base64').toString('utf8');
    read(text);
    return { text, head: ref.object.sha };
  }
  async write(previous, next) {
    if (!next.startsWith(previous.text) || next === previous.text) fail('append-only storage');
    read(next);
    const blob = await this.api('git/blobs', { method: 'POST', body: { content: next, encoding: 'utf-8' } });
    const tree = await this.api('git/trees', { method: 'POST', body: { tree: [{ path: this.file, mode: '100644', type: 'blob', sha: blob.sha }] } });
    const commit = await this.api('git/commits', { method: 'POST', body: { message: 'Append release evidence', tree: tree.sha, parents: previous.head ? [previous.head] : [] } });
    if (previous.head) await this.api(`git/refs/heads/${this.branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    else await this.api('git/refs', { method: 'POST', body: { ref: `refs/heads/${this.branch}`, sha: commit.sha } });
    return commit.sha;
  }
  async append(record) {
    const previous = await this.read();
    return this.write(previous, append(previous.text, record));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] !== 'gate' || !process.argv[3]) throw new Error('Usage: node scripts/release/ledger.mjs gate <ledger.jsonl>');
    assertNoUnresolved(read(await readFile(process.argv[3], 'utf8')));
    console.log('Ledger gate passed');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
