import test from 'node:test';
import assert from 'node:assert/strict';
import { GitLedger, read, assertNoUnresolved } from '../ledger.mjs';

test('Git blob storage reads and verifies a ledger above 1 MiB at a fixed ref', async () => {
  const records = [];
  for (let i = 0; i < 4000; i++) {
    const request = { operation_id: `${i}.1.approval`, candidate_sha: 'a'.repeat(40), step: 'approval', render_deploy_id: null, status: 'requested', evidence: { operation_kind: 'local' }, at: '2026-11-06T00:00:00.000Z' };
    records.push(request, { ...request, status: 'succeeded', evidence: { kind: 'local' } });
  }
  const text = records.map((record) => JSON.stringify(record) + '\n').join('');
  assert.ok(Buffer.byteLength(text) > 1024 * 1024);
  const calls = [];
  const api = async (path) => {
    calls.push(path);
    const responses = {
      'git/ref/heads/release-ledger': { object: { sha: 'captured-head' } },
      'git/commits/captured-head': { tree: { sha: 'root' } },
      'git/trees/root': { tree: [{ path: 'history', type: 'tree', sha: 'nested' }] },
      'git/trees/nested': { tree: [{ path: 'ledger.jsonl', type: 'blob', sha: 'large-blob' }] },
      'git/blobs/large-blob': { encoding: 'base64', content: Buffer.from(text).toString('base64') },
    };
    assert.ok(path in responses, `Unexpected request: ${path}`);
    return responses[path];
  };
  const store = new GitLedger(api, { branch: 'release-ledger', file: 'history/ledger.jsonl' });
  assert.deepEqual(await store.read(), { text, head: 'captured-head' });
  assert.equal(assertNoUnresolved(read(text)), true);
  assert.equal(calls.filter((path) => path.startsWith('git/ref/')).length, 1);
  assert.equal(calls.at(-1), 'git/blobs/large-blob');
});

test('missing files, truncated trees and malformed Git blobs fail closed', async () => {
  for (const fault of ['missing', 'truncated', 'malformed']) {
    const api = async (path) => {
      if (path.startsWith('git/ref/')) return { object: { sha: 'head' } };
      if (path.startsWith('git/commits/')) return { tree: { sha: 'root' } };
      if (path.startsWith('git/trees/')) return { truncated: fault === 'truncated', tree: fault === 'missing' ? [] : [{ path: 'ledger.jsonl', type: 'blob', sha: 'blob' }] };
      return { encoding: 'base64', content: Buffer.from('{\n').toString('base64') };
    };
    await assert.rejects(new GitLedger(api, { branch: 'release-ledger', file: 'ledger.jsonl' }).read(), /Ledger:/);
  }
});
