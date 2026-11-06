import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { bind, digest } from '../../candidate.mjs';
import { run } from '../../workflow.mjs';
import { read } from '../../ledger.mjs';
import { settings, template, fill, synthetic } from './fixtures.mjs';

test('filled templates pass workflow.mjs settings and gate with local Git and stub GitHub', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'rehearsal-gate-')), before = process.cwd();
  t.after(() => { process.chdir(before); rmSync(cwd, { recursive: true, force: true }); });
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Synthetic Test'); git('config', 'user.email', 'test@example.test');
  mkdirSync(join(cwd, 'prisma/migrations/001'), { recursive: true });
  writeFileSync(join(cwd, 'prisma/migrations/001/migration.sql'), 'SELECT 1;');
  writeFileSync(join(cwd, 'package-lock.json'), '{}'); writeFileSync(join(cwd, 'render.yaml'), 'services: []');
  git('add', '.'); git('commit', '-m', 'synthetic baseline'); const previous = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'change.txt'), 'synthetic'); git('add', '.'); git('commit', '-m', 'synthetic candidate');
  const candidate = git('rev-parse', 'HEAD'); git('remote', 'add', 'origin', cwd);
  const binding = await bind(cwd, candidate, candidate), s = settings(), raw = template('RELEASE_APPROVAL');
  const values = Object.fromEntries([...JSON.stringify(raw).matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map(m => [m[1], `synthetic-${synthetic()}`]));
  Object.assign(values, { CANDIDATE_FULL_SHA: candidate, APPROVED_MAIN_FULL_SHA: candidate,
    LOCKFILE_SHA256: binding.lockfile_sha256, RENDER_YAML_SHA256: binding.render_yaml_sha256, MIGRATIONS_SHA256: binding.migrations_sha256,
    JOBS_JSON_SHA256: digest(JSON.stringify(s.jobs)), PREVIOUS_FULL_SHA: previous,
    REHEARSAL_EXCEPTION_APPROVED_BOOLEAN: true, REVIEWED_MERGED_PR_ID: 1 });
  const approval = fill(raw, values);
  assert.match(approval.tier3.reference, /REHEARSAL, not tier-3/);
  const env = { RELEASE_SETTINGS_JSON: JSON.stringify(s), RELEASE_APPROVAL_JSON: JSON.stringify(approval), CANDIDATE_SHA: candidate,
    RELEASE_NAME: approval.release_name, MIGRATION_JOB: 'none', GITHUB_RUN_ID: s.ledger_bootstrap_run, GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/tags/rehearsal-releaser-synthetic', GITHUB_SHA: candidate,
    GITHUB_API_URL: 'https://github.example.test', GITHUB_REPOSITORY: 'synthetic/repository' };
  let exists = false, ledger = ''; const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, env.GITHUB_API_URL, 'No real GitHub or Render calls');
    const path = url.pathname.replace('/repos/synthetic/repository/', ''); let response;
    if (options.method !== 'GET') {
      const body = JSON.parse(options.body); writes.push({ path, body });
      if (path === 'git/blobs') ledger = body.content;
      if (path === 'git/refs') { assert.equal(body.ref, 'refs/heads/rehearsal/ledger'); exists = true; }
      if (path.startsWith('git/refs/heads/')) assert.equal(body.force, false);
      response = { sha: 'synthetic-object' };
    } else if (path === 'git/ref/heads/main') response = { object: { sha: candidate } };
    else if (path === 'git/ref/heads/rehearsal/ledger') {
      if (!exists) return new Response(null, { status: 404 });
      response = { object: { sha: 'synthetic-head' } };
    } else if (path === 'git/commits/synthetic-head') response = { tree: { sha: 'synthetic-tree' } };
    else if (path === 'git/trees/synthetic-tree') response = { tree: [{ path: s.ledger_file, type: 'blob', sha: 'synthetic-blob' }] };
    else if (path === 'git/blobs/synthetic-blob') response = { encoding: 'base64', content: Buffer.from(ledger).toString('base64') };
    else assert.fail(`Unexpected path ${path}`);
    return new Response(JSON.stringify(response), { status: 200 });
  });
  process.chdir(cwd);
  await run('gate', env);
  assert.deepEqual(read(ledger).map(r => r.status), ['requested', 'succeeded']);
  const count = writes.length;
  await assert.rejects(run('gate', { ...env, RELEASE_APPROVAL_JSON: JSON.stringify(raw) }));
  await assert.rejects(run('gate', { ...env, RELEASE_SETTINGS_JSON: JSON.stringify(template('RELEASE_SETTINGS')) }));
  await assert.rejects(run('gate', { ...env, RELEASE_APPROVAL_JSON: JSON.stringify({ ...approval, tier3: { passed: false } }) }));
  await assert.rejects(run('gate', { ...env, RELEASE_SETTINGS_JSON: JSON.stringify({ ...s, poll_interval_ms: 0 }) }));
  const changed = structuredClone(s); changed.jobs.smoke.command = 'env';
  await assert.rejects(run('gate', { ...env, RELEASE_SETTINGS_JSON: JSON.stringify(changed) }), /must start with node/);
  assert.equal(writes.length, count);
});

test('ops workflow is manual, namespace-gated, secret-minimal and SHA-pinned', () => {
  const source = readFileSync('.github/workflows/rehearsal-ops.yml', 'utf8'), workflow = yaml.safeLoad(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.mode.options, ['probe', 'seed']);
  const job = workflow.jobs.rehearsal;
  assert.equal(job.environment, 'rehearsal'); assert.deepEqual(job.permissions, {});
  assert.equal(workflow.concurrency.group, settings().concurrency_group);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.match(job.if, /refs\/tags\/rehearsal-releaser-/);
  assert.deepEqual([...source.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]), ['RENDER_API_KEY']);
  for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
  assert.equal(job.steps.filter(step => step.env?.RENDER_API_KEY).length, 1);
  assert.ok(!source.includes('github.token'));
});
