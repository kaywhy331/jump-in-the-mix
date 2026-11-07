import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkReceipt, requiredChecks, terminalStatus, performOperation } from '../workflow.mjs';
import { append, read, assertNoUnresolved } from '../ledger.mjs';

const candidate = 'a'.repeat(40);
test('one-off receipt must prove every assertion and its operation/candidate identity', () => {
  for (const [step, checks] of Object.entries(requiredChecks)) {
    const receipt = { operation_id: 'run.step', candidate_sha: candidate, checks: Object.fromEntries(checks.map((name) => [name, true])), private_detail: 'must not enter ledger' };
    assert.deepEqual(Object.keys(checkReceipt(receipt, step, 'run.step', candidate)), ['checks']);
    assert.throws(() => checkReceipt(receipt, step, 'different-run', candidate), /identity/);
    assert.throws(() => checkReceipt(receipt, step, 'run.step', 'b'.repeat(40)), /identity/);
    for (const name of checks) assert.throws(() => checkReceipt({ ...receipt, checks: { ...receipt.checks, [name]: false } }, step, 'run.step', candidate), /assertions/);
  }
});
test('provider running/unknown statuses and elapsed time are never terminal', () => {
  assert.equal(terminalStatus('deploy', { status: 'live' }), 'succeeded');
  assert.equal(terminalStatus('deploy', { status: 'build_failed' }), 'failed');
  assert.equal(terminalStatus('job', { status: 'canceled' }), 'cancelled');
  for (const status of ['created', 'running', 'build_in_progress', 'update_in_progress', undefined]) assert.equal(terminalStatus('job', { status }), undefined);
});
test('external request is fenced by the durable append and preserves returned IDs before polling', async () => {
  let text = ''; const order = [];
  const request = { operation_id: 'run.worker', candidate_sha: candidate, step: 'worker', render_deploy_id: null, status: 'requested', evidence: { operation_kind: 'deploy' }, at: new Date().toISOString() };
  const ledger = { append: async (record) => { text = append(text, record); order.push(record.status); } };
  await performOperation({ ledger, request, invoke: async () => { order.push('POST'); return { id: 'dep-synthetic' }; }, observe: async (providerId) => {
    assert.equal(read(text).at(-1).render_deploy_id, providerId); order.push('GET');
    return { status: 'succeeded', path: 'synthetic-observation', receipt: {} };
  } });
  assert.deepEqual(order, ['requested', 'POST', 'unresolved', 'GET', 'succeeded']);
  assert.equal(assertNoUnresolved(read(text)), true);
  let called = false;
  await assert.rejects(performOperation({ ledger: { append: async () => { throw Error('storage unavailable'); } }, request, invoke: async () => { called = true; }, observe: async () => {} }), /storage unavailable/);
  assert.equal(called, false);
});
test('missing ID, lost POST response and interrupted observation leave a hold without a second request', async () => {
  for (const scenario of ['missing-id', 'lost-response', 'lost-observation']) {
    let text = ''; let requests = 0;
    const request = { operation_id: `run.${scenario}`, candidate_sha: candidate, step: 'backup', render_deploy_id: null, status: 'requested', evidence: { operation_kind: 'job' }, at: new Date().toISOString() };
    await assert.rejects(performOperation({ ledger: { append: async (r) => { text = append(text, r); } }, request, invoke: async () => {
      requests++;
      if (scenario === 'lost-response') throw Error('transport lost');
      return scenario === 'missing-id' ? {} : { id: 'job-synthetic' };
    }, observe: async () => { throw Error('observation lost'); } }));
    assert.equal(requests, 1);
    assert.throws(() => assertNoUnresolved(read(text)), /unresolved/);
    assert.equal(read(text).at(-1).render_deploy_id, scenario === 'lost-observation' ? 'job-synthetic' : null);
  }
});
test('verify job retains every existing CI run command and all actions are pinned', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  const verify = workflow.split('\n  release:\n')[0];
  const commands = (text) => [...text.matchAll(/^        run: (.+)(?:\n(?:          .*|\s*$))*/gm)].map((m) => m[0]);
  const retained = commands(verify);
  for (const command of commands(ci)) assert.ok(retained.includes(command), 'CI run command missing or changed');
  assert.ok(workflow.includes('permissions: {}'));
  assert.ok(!verify.includes('secrets.'));
  assert.ok(!/^    environment:/m.test(verify));
  for (const match of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(match[1], /^actions\/[a-z-]+@[a-f0-9]{40} # v/);
  const privileged = workflow.split('\n  release:\n')[1];
  assert.ok(!privileged.includes('ref: ${{ inputs.candidate_sha }}'));
  assert.ok(!privileged.includes('npm '));
});
