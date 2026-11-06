import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredChecks } from '../../workflow.mjs';
import { parseContext, runJob } from '../receipt.mjs';
import { preflight } from '../preflight.mjs';
import { final } from '../final.mjs';

export function context(step = 'preflight') {
  return { operation_id: `1.1.${step}`, candidate_sha: 'a'.repeat(40), previous_sha: 'b'.repeat(40),
    candidate_binding: { candidate_sha: 'a'.repeat(40), approved_main_sha: 'a'.repeat(40),
      lockfile_sha256: 'c'.repeat(64), render_yaml_sha256: 'd'.repeat(64), migrations_sha256: 'e'.repeat(64) },
    release_started_at: '2026-01-01T00:00:00.000Z', baseline_counts_sha256: step === 'preflight' ? null : 'f'.repeat(64),
    receipt_prefix: 'JITM_RELEASE_RECEIPT:', checks: requiredChecks[step] };
}
export const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
export async function capture(step, action, value = context(step)) {
  const out = [], errors = [];
  const code = await runJob(step, action, { env: { JITM_RELEASE_CONTEXT: encode(value) }, stdout: s => out.push(s), stderr: s => errors.push(s) });
  return { code, out, errors };
}

test('context validates identity, binding, date, prefix, baseline and exact checks', () => {
  assert.equal(parseContext('preflight', encode(context())).operation_id, '1.1.preflight');
  for (const [key, value] of [['operation_id','1.1.final'], ['candidate_sha','short'], ['previous_sha',null],
    ['candidate_binding',{}], ['receipt_prefix','bad\nreceipt:'], ['release_started_at','2099-01-01T00:00:00.000Z'],
    ['baseline_counts_sha256','f'.repeat(64)], ['checks',[]]]) {
    assert.throws(() => parseContext('preflight', encode({ ...context(), [key]: value })), key);
  }
  for (const value of ['', 'e30=\n', '####', 'a'.repeat(20000)]) assert.throws(() => parseContext('preflight', value));
});

test('only one allowlisted receipt is printed after every check succeeds', async () => {
  const result = await capture('preflight', async () => ({ checks: Object.fromEntries(requiredChecks.preflight.map(k => [k,true])), counts_sha256: 'f'.repeat(64), private: 'must never appear' }));
  assert.equal(result.code,0); assert.equal(result.out.length,1); assert.equal(result.errors.length,0);
  assert.ok(!result.out[0].includes('private')); assert.equal(result.out[0].split('\n').length,2);
});

test('failed, missing and mismatched assertions emit no receipt or exception details', async () => {
  for (const action of [async () => { throw new Error('private detail'); }, async () => ({}),
    async () => ({ checks: Object.fromEntries(requiredChecks.final.map(k => [k,true])), counts_sha256: 'a'.repeat(64) })]) {
    const result = await capture('final', action);
    assert.equal(result.code,1); assert.deepEqual(result.out,[]); assert.equal(result.errors.length,1);
    assert.ok(!result.errors[0].includes('private detail'));
  }
});

const io = () => ({ reviewedSource: async () => ({ previous: {}, candidate: {} }), runtimeRole: async () => {},
  withReadOnly: async action => action({}), noRecoveryHold: async () => {}, migrations: async () => {},
  schemaReady: async () => {}, countsDigest: async () => 'f'.repeat(64), finalResidue: async () => {} });
for (const [step, action] of [['preflight',preflight],['final',final]]) {
  test(`${step} passes and refuses each independently failed read`, async () => {
    assert.equal((await capture(step, c => action(c,io()))).code,0);
    for (const key of Object.keys(io()).filter(k => step === 'final' || k !== 'finalResidue')) {
      const result = await capture(step, c => action(c,{ ...io(), [key]: async () => { throw new Error('private detail'); } }));
      assert.equal(result.code,1,key); assert.equal(result.out.length,0,key);
    }
  });
}
