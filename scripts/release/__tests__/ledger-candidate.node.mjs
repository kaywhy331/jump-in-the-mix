import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { append, read, resolve, assertNoUnresolved, GitLedger } from '../ledger.mjs';
import { bind, verifyCandidate } from '../candidate.mjs';

const request = {
  operation_id: '123.1.worker', candidate_sha: 'a'.repeat(40), step: 'worker',
  render_deploy_id: null, status: 'requested', evidence: { operation_kind: 'deploy' }, at: '2026-11-06T00:00:00.000Z',
};
const started = append('', request);
const unresolved = append(started, { ...request, status: 'unresolved', render_deploy_id: 'dep-example', evidence: { reason: 'poll interrupted' } });
const e1 = { operation_id: request.operation_id, kind: 'E1', status: 'succeeded', observed_status: 'succeeded', render_deploy_id: 'dep-example', reference: 'synthetic-receipt' };

test('requested and explicitly unresolved operations both refuse the next run', () => {
  for (const text of [started, unresolved]) assert.throws(() => assertNoUnresolved(read(text)), /unresolved operations/);
  assert.throws(() => append(unresolved, { ...request, operation_id: '124.1.worker' }), /unresolved operations/);
});
test('E1 terminal observation resolves precisely the named operation and allows the next run', () => {
  const next = resolve(unresolved, e1);
  assert.equal(assertNoUnresolved(read(next)), true);
  assert.equal(read(append(next, { ...request, operation_id: '124.1.worker' })).length, 4);
});
test('E3 requires a recorded owner decision; timing is never a resolution', () => {
  assert.throws(() => resolve(unresolved, { ...e1, kind: 'E2' }), /only E1 or E3/);
  assert.throws(() => resolve(unresolved, { ...e1, kind: 'E3' }), /Kevin recorded decision/);
  const text = resolve(unresolved, { operation_id: request.operation_id, kind: 'E3', author: 'Kevin', decision_ref: 'synthetic-owner-decision', decision: 'Observed failure accepted; fresh release authorized', status: 'failed' });
  assert.equal(assertNoUnresolved(read(text)), true);
});
test('malformed, truncated, rewritten, mismatched and duplicate history refuses', () => {
  for (const text of ['{\n', started.trim(), '\n', '{}\n']) assert.throws(() => read(text));
  assert.throws(() => resolve(unresolved, { ...e1, render_deploy_id: 'dep-other' }), /provider id changed/);
  assert.throws(() => resolve(unresolved, { ...e1, observed_status: 'running' }), /terminal observation/);
  assert.throws(() => resolve(unresolved, { ...e1, operation_id: 'missing' }), /must name/);
  assert.throws(() => append(started, request), /duplicate request/);
  assert.throws(() => append(resolve(unresolved, e1), { ...request, status: 'unresolved' }), /immutable/);
  assert.throws(() => append(started, { ...request, status: 'succeeded', evidence: { kind: 'local' } }), /external outcome/);
});
test('remote ledger appends a child commit and never forces a competing update', async () => {
  const calls = [];
  const api = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path.startsWith('git/ref/')) return { object: { sha: 'old' } };
    if (path.startsWith('contents/')) return { encoding: 'base64', content: Buffer.from(unresolved).toString('base64') };
    if (path.startsWith('git/refs/')) throw new Error('non-fast-forward');
    return { sha: 'new' };
  };
  const store = new GitLedger(api, { branch: 'release-ledger', file: 'ledger.jsonl' });
  const previous = await store.read();
  await assert.rejects(store.write(previous, resolve(previous.text, e1)), /non-fast-forward/);
  assert.deepEqual(calls.find((c) => c.path === 'git/commits').body.parents, ['old']);
  assert.equal(calls.at(-1).body.force, false);
  await assert.rejects(new GitLedger(async () => null, { branch: 'release-ledger', file: 'ledger.jsonl' }).read(), /missing ledger/);
});

test('real Git candidate binding rejects non-main history, moved main and every digest mismatch', async () => {
  mkdirSync('.artifacts/tmp', { recursive: true });
  const cwd = mkdtempSync(join(process.cwd(), '.artifacts/tmp/release-candidate-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init'); git('config', 'user.name', 'Synthetic Test'); git('config', 'user.email', 'test@example.test');
    mkdirSync(join(cwd, 'prisma/migrations/001'), { recursive: true });
    writeFileSync(join(cwd, 'package-lock.json'), '{}'); writeFileSync(join(cwd, 'render.yaml'), 'services: []');
    writeFileSync(join(cwd, 'prisma/migrations/001/migration.sql'), 'SELECT 1;');
    git('add', '.'); git('commit', '-m', 'baseline');
    const initial = git('rev-parse', 'HEAD');
    const approved = await bind(cwd, initial, initial);
    assert.deepEqual(verifyCandidate(approved, await bind(cwd, initial, initial), initial), approved);
    for (const field of ['lockfile_sha256', 'render_yaml_sha256', 'migrations_sha256']) {
      assert.throws(() => verifyCandidate(approved, { ...approved, [field]: 'b'.repeat(64) }, initial), /binding mismatch/);
    }
    writeFileSync(join(cwd, 'package-lock.json'), '{"changed":true}'); git('add', '.'); git('commit', '-m', 'advance');
    const moved = git('rev-parse', 'HEAD');
    const actual = await bind(cwd, initial, moved);
    assert.throws(() => verifyCandidate(approved, actual, moved), /Main moved/);
    await assert.rejects(bind(cwd, moved, initial));
    assert.notEqual((await bind(cwd, moved, moved)).lockfile_sha256, approved.lockfile_sha256);
    await assert.rejects(bind(cwd, 'main', moved), /full commit SHA/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
