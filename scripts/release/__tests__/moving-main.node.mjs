import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { bind, verifyCandidate, digest } from '../candidate.mjs';
import { run, settingsDigest } from '../workflow.mjs';
import { read } from '../ledger.mjs';

const workflow = yaml.safeLoad(readFileSync('.github/workflows/release.yml', 'utf8'));
const ancestryScript = workflow.jobs.verify.steps.find((step) => step.name === 'Verify approved candidate ancestry and current main').run;
const exampleSettings = JSON.parse(readFileSync('docs/release/ENVIRONMENT_SPEC.md', 'utf8').match(/```json\n([\s\S]*?)\n```/)[1]);

function history(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'release-moving-main-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (path, text) => { writeFileSync(join(cwd, path), text); git('add', '.'); git('commit', '-m', path); return git('rev-parse', 'HEAD'); };
  git('init'); git('config', 'user.name', 'Synthetic Test'); git('config', 'user.email', 'test@example.test');
  mkdirSync(join(cwd, 'prisma/migrations/001'), { recursive: true });
  writeFileSync(join(cwd, 'render.yaml'), 'services: []');
  writeFileSync(join(cwd, 'prisma/migrations/001/migration.sql'), 'SELECT 1;');
  const base = commit('package-lock.json', '{}');
  const candidate = commit('package-lock.json', '{"candidate":true}');
  const approvedMain = commit('approved.txt', 'approved main head');
  const advanced = commit('advanced.txt', 'forward main head');
  git('checkout', '--detach', base);
  const rewrite = commit('rewrite.txt', 'candidate removed');
  git('checkout', '--detach', candidate);
  const retainedRewrite = commit('rewrite.txt', 'candidate retained, approved head removed');
  git('checkout', '--detach', candidate);
  git('remote', 'add', 'origin', cwd); // Real Git fetches stay entirely local.
  return { cwd, git, base, candidate, approvedMain, advanced, rewrite, retainedRewrite };
}

test('dispatch and release keep the candidate through fast-forward main and refuse rewrites or a new head', async (t) => {
  const h = history(t);
  const approved = await bind(h.cwd, h.candidate, h.approvedMain);
  const options = { cwd: h.cwd, allowMainAdvance: true };
  const forward = await bind(h.cwd, h.candidate, h.advanced);
  assert.equal(verifyCandidate(approved, forward, h.advanced, options).candidate_sha, h.candidate);
  assert.throws(() => verifyCandidate(approved, forward, h.advanced), /Main moved/);
  const newHead = await bind(h.cwd, h.advanced, h.advanced);
  assert.equal(newHead.lockfile_sha256, approved.lockfile_sha256, 'Even identical digests do not approve a new commit');
  assert.throws(() => verifyCandidate(approved, newHead, h.advanced, options), /binding mismatch: candidate_sha/);
  for (const field of ['lockfile_sha256', 'render_yaml_sha256', 'migrations_sha256']) {
    assert.throws(() => verifyCandidate(approved, { ...forward, [field]: 'b'.repeat(64) }, h.advanced, options), /binding mismatch/);
  }
  await assert.rejects(bind(h.cwd, h.candidate, h.rewrite));
  const retained = await bind(h.cwd, h.candidate, h.retainedRewrite);
  assert.throws(() => verifyCandidate(approved, retained, h.retainedRewrite, options));
  const checkDispatch = (main, candidate = h.candidate) => {
    h.git('checkout', '--detach', candidate);
    h.git('branch', '-f', 'main', main);
    execFileSync('bash', ['-c', ancestryScript], { cwd: h.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CANDIDATE_SHA: candidate, MAIN_BRANCH: 'main', APPROVAL: JSON.stringify({ candidate: approved }) } });
  };
  checkDispatch(h.advanced);
  assert.throws(() => checkDispatch(h.rewrite));
  assert.throws(() => checkDispatch(h.retainedRewrite));
  assert.throws(() => checkDispatch(h.advanced, h.advanced));
});

test('only the bootstrap run is excluded from the settings binding', () => {
  const initial = { ...exampleSettings, ledger_bootstrap_run: '99' };
  const cleared = { ...initial }; delete cleared.ledger_bootstrap_run;
  assert.equal(settingsDigest(JSON.stringify(initial)), settingsDigest(JSON.stringify(cleared)));
  assert.equal(settingsDigest(JSON.stringify(initial)), settingsDigest(JSON.stringify({ ...initial, ledger_bootstrap_run: null })));
  for (const key of Object.keys(cleared)) {
    assert.notEqual(settingsDigest(JSON.stringify(initial)), settingsDigest(JSON.stringify({ ...cleared, [key]: 'changed' })), key);
  }
});

test('publish survives bootstrap removal, with settings and candidate changes still refused', async (t) => {
  const h = history(t);
  const beforeCwd = process.cwd();
  t.after(() => process.chdir(beforeCwd));
  process.chdir(h.cwd);
  const initial = { ...exampleSettings, ledger_bootstrap_run: '99', site_url: 'https://site.example.test', jobs: {} };
  const cleared = { ...initial }; delete cleared.ledger_bootstrap_run;
  const approval = {
    candidate: await bind(h.cwd, h.candidate, h.approvedMain), release_name: 'Synthetic release', migration_job: 'none',
    reviewed_jobs_sha256: digest(JSON.stringify(initial.jobs)), tier3: { passed: true, reference: 'synthetic-local-evidence' }, review_ref: 'synthetic-review',
    pull_requests: [1], previous_sha: h.base, ...Object.fromEntries(['previous_tag', 'dependencies', 'changes', 'rollback', 'owner_followups', 'not_run', 'carried_followups'].map((key) => [key, 'synthetic record'])),
  };
  const env = {
    RELEASE_SETTINGS_JSON: JSON.stringify(cleared), RELEASE_APPROVAL_JSON: JSON.stringify(approval), CANDIDATE_SHA: h.candidate,
    RELEASE_NAME: approval.release_name, MIGRATION_JOB: 'none', GITHUB_RUN_ID: '99', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: `refs/tags/${initial.releaser_prefix}synthetic`, GITHUB_SHA: h.candidate, GITHUB_API_URL: 'https://github.example.test', GITHUB_REPOSITORY: 'synthetic/repository', GITHUB_STEP_SUMMARY: join(h.cwd, 'summary.md'),
  };
  const steps = ['approval', 'preflight_services', 'preflight', 'backup', 'migrate', 'worker', 'worker_gate', 'web', 'postflight_services', 'postflight', 'smoke', 'cleanup', 'final', 'final_services'];
  const records = steps.flatMap((step) => {
    const request = { operation_id: `99.1.${step}`, candidate_sha: h.candidate, step, render_deploy_id: null, status: 'requested', evidence: { operation_kind: 'local' }, at: '2026-11-06T00:00:00.000Z' };
    return [request, { ...request, status: 'succeeded', evidence: { kind: 'local', ...(step === 'approval' ? { approval_sha256: digest(env.RELEASE_APPROVAL_JSON), settings_sha256: settingsDigest(JSON.stringify(initial)) } : {}) } }];
  });
  const text = records.map((record) => JSON.stringify(record) + '\n').join('');
  assert.equal(read(text).length, steps.length * 2);
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, env.GITHUB_API_URL, 'No real provider or Render calls');
    const path = url.pathname.replace('/repos/synthetic/repository/', '');
    let response;
    if (options.method !== 'GET') {
      assert.ok(['git/tags', 'git/refs'].includes(path) || path.startsWith('contents/'), path);
      writes.push({ path, body: JSON.parse(options.body) });
      response = { sha: 'b'.repeat(40) };
    } else if (path === `git/ref/heads/${initial.ledger_branch}`) response = { object: { sha: 'head' } };
    else if (path === 'git/commits/head') response = { tree: { sha: 'tree' } };
    else if (path === 'git/trees/tree') response = { tree: [{ path: initial.ledger_file, type: 'blob', sha: 'blob' }] };
    else if (path === 'git/blobs/blob') response = { encoding: 'base64', content: Buffer.from(text).toString('base64') };
    else if (path.startsWith('git/ref/tags/')) return new Response(null, { status: 404 });
    else assert.fail(`Unexpected API request: ${path}`);
    return new Response(JSON.stringify(response), { status: 200 });
  });
  await run('publish', env);
  assert.equal(writes.find((entry) => entry.path === 'git/tags').body.object, h.candidate);
  assert.equal(writes.filter((entry) => entry.path === 'git/refs').length, 2);
  assert.match(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /Synthetic release/);
  const count = writes.length;
  await assert.rejects(run('publish', { ...env, RELEASE_SETTINGS_JSON: JSON.stringify({ ...cleared, site_url: 'https://changed.example.test' }) }), /Approval\/settings changed/);
  await assert.rejects(run('publish', { ...env, CANDIDATE_SHA: h.advanced }), /Approval must name candidate/);
  assert.equal(writes.length, count, 'Rejected changes must not publish');
});
