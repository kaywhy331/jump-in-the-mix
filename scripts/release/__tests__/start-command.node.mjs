import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { buildStartCommand, run } from '../workflow.mjs';
import { diagnosticArguments } from '../qualification/commands.mjs';

const settings = JSON.parse(readFileSync('docs/release/ENVIRONMENT_SPEC.md', 'utf8').match(/```json\n([\s\S]*?)\n```/)[1]);
const candidate = 'a'.repeat(40);

function gateEnv(jobs) {
  return {
    RELEASE_SETTINGS_JSON: JSON.stringify({ ...settings, site_url: 'https://site.example.test', jobs }),
    // Deliberately stop at approval after command validation, before any IO.
    RELEASE_APPROVAL_JSON: JSON.stringify({ candidate: { candidate_sha: 'b'.repeat(40) } }),
    CANDIDATE_SHA: candidate, GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: `refs/tags/${settings.releaser_prefix}synthetic`,
    GITHUB_SHA: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    MIGRATION_JOB: 'selected_migration',
  };
}

test('gate accepts node arguments and an empty jobs catalog before checking approval', async () => {
  for (const jobs of [{}, { smoke: { command: 'node --import tsx scripts/release/jobs/smoke.mjs' } }]) {
    await assert.rejects(run('gate', gateEnv(jobs)), /Approval must name candidate and release/);
  }
});

for (const [name, command] of [
  ['assignment-only', 'FOO=bar'],
  ['quoted argument', 'node "scripts/release/jobs/preflight.mjs"'],
  ['shell operator', 'node scripts/release/jobs/preflight.mjs && node next.mjs'],
  ['non-node executable', 'npm run preflight'],
]) {
  test(`gate refuses ${name} in every job entry before approval`, async () => {
    for (const key of ['preflight', 'selected_migration', 'unused_job']) {
      const jobs = { preflight: { command: 'node scripts/release/jobs/preflight.mjs' }, [key]: { command } };
      await assert.rejects(run('gate', gateEnv(jobs)), /One-off command must start with node/);
    }
  });
}

test('real startCommand preserves context and arguments through execFile and sh', { skip: process.platform === 'win32' }, async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'release command '));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'child.mjs'), 'console.log(JSON.stringify({ context: process.env.JITM_RELEASE_CONTEXT, args: process.argv.slice(2) }));\n');
  const context = { operation_id: '1.1.preflight', candidate_sha: candidate, note: 'Synthetic context with spaces and Unicode: λ' };
  const args = ['alpha', '--mode=local', '@scope/package', 'v1.2.3', './relative', '/absolute', 'colon:value', 'plus+minus-', 'under_score'];
  const startCommand = buildStartCommand(context, `node child.mjs ${args.join(' ')}`);
  const tokens = startCommand.split(' ');
  const expected = { context: Buffer.from(JSON.stringify(context)).toString('base64'), args };
  assert.deepEqual(tokens.slice(0, 2), ['env', `JITM_RELEASE_CONTEXT=${expected.context}`]);
  const options = { cwd, env: { PATH: process.env.PATH, JITM_RELEASE_CONTEXT: 'replaced-by-command' } };
  const vector = await promisify(execFile)(tokens[0], tokens.slice(1), options);
  const shell = await promisify(execFile)('sh', ['-c', startCommand], options);
  for (const result of [vector, shell]) {
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), expected);
  }
});

test('both diagnostic argument vectors retain env and the full context assignment', () => {
  const context = { operation_id: '1.1.smoke', candidate_sha: candidate };
  const startCommand = buildStartCommand(context, 'node --import tsx scripts/release/jobs/smoke.mjs');
  const prefix = ['env', `JITM_RELEASE_CONTEXT=${Buffer.from(JSON.stringify(context)).toString('base64')}`];
  assert.deepEqual(diagnosticArguments(startCommand, 'postflight'), [...prefix, 'node', 'scripts/release/qualification/diagnose-postflight.mjs']);
  assert.deepEqual(diagnosticArguments(startCommand, 'smoke'), [...prefix, 'node', '--import', 'tsx', 'scripts/release/qualification/diagnose-smoke.mjs']);
  assert.throws(() => diagnosticArguments(startCommand, 'unknown'), /Unknown diagnostic step/);
});
