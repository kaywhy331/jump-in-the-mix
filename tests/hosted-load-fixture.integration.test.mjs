import { randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSourceHash, loadDatabaseName, loadRoleName, loadWorkerConfiguration, isolatedLoadEnvironment } from '../scripts/lib/hosted-load-plan.mjs';
import { quoteIdentifier } from '../scripts/lib/postgres-ops.mjs';
import { customerRoutes } from '../scripts/lib/load-probe.mjs';

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? '');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await pause(100); }
  throw new Error('Fixture observation timed out.');
}

describe.skipIf(!local || process.env.RUN_HOSTED_LOAD_WEB_TESTS !== 'true').sequential('hosted fixture lifecycle on an owned local source', () => {
  const sourceDatabase = `jitm_design_hosted_${randomBytes(6).toString('hex')}`;
  const children = [], plans = [];
  let owner, admin, source, directory;
  beforeAll(async () => {
    source = new URL(process.env.DATABASE_URL); source.pathname = '/postgres'; source.search = '';
    admin = new Client({ connectionString: source.href }); await admin.connect();
    await admin.query(`CREATE DATABASE ${quoteIdentifier(sourceDatabase)} TEMPLATE template0`);
    source.pathname = `/${sourceDatabase}`;
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: source.href }, timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    owner = new Client({ connectionString: source.href }); await owner.connect();
    await owner.query(`INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('source-sentinel','source@example.test','Unchanged source',now())`);
    directory = await mkdtemp(join(tmpdir(), 'jitm-hosted-lifecycle-'));
  }, 60000);
  function start(args) {
    const child = spawn(process.execPath, args, { env: { ...process.env, RENDER_GIT_COMMIT: 'a'.repeat(40) }, stdio: ['pipe', 'pipe', 'pipe'] });
    const run = { child, output: '', errors: '', ended: false, events: [] }; children.push(run);
    let pending = '';
    child.stdout.on('data', chunk => { run.output += chunk; pending += chunk; const lines = pending.split('\n'); pending = lines.pop(); for (const line of lines) { try { run.events.push(JSON.parse(line)); } catch {} } });
    child.stderr.on('data', chunk => { run.errors += chunk; });
    run.done = new Promise(resolve => child.once('close', (code, signal) => { run.ended = true; resolve({ code, signal }); }));
    run.event = (name, after = 0) => until(() => { const event = run.events.slice(after).find(value => value.event === name); if (event) return event; if (run.ended) throw new Error(`Fixture exited before ${name}: ${run.output} ${run.errors}`); }, 90000);
    return run;
  }
  async function setup(profile = { accounts: 2, contactsPerAccount: 100, historyPerContact: 2, mixesPerAccount: 10, beatsPerMix: 6 }) {
    const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
    const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
    const plan = { version: 1, id: randomBytes(6).toString('hex'), token: randomBytes(32).toString('hex'), sourceUrl: source.href, sourceHash: loadSourceHash(source.href), port, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), expectedCommit: 'a'.repeat(40), profile };
    plans.push(plan);
    const file = join(directory, plan.id + '.json'), output = join(directory, plan.id);
    await writeFile(file, JSON.stringify(plan), { mode: 0o600 });
    return { plan, file, output, start: () => start(['scripts/serve-hosted-load-fixture.mjs', file, output]) };
  }
  async function removed(plan) {
    expect((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [loadDatabaseName(plan.id)])).rowCount).toBe(0);
    expect((await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [loadRoleName(plan.id)])).rowCount).toBe(0);
    expect((await owner.query('SELECT id,name FROM "User"')).rows).toEqual([{ id: 'source-sentinel', name: 'Unchanged source' }]);
  }
  afterAll(async () => {
    for (const run of children) if (!run.ended) { run.child.kill('SIGTERM'); const timer = setTimeout(() => run.child.kill('SIGKILL'), 8000); await run.done; clearTimeout(timer); }
    await owner?.end();
    if (admin) {
      // Names originate only in this test's cryptographically random plans.
      for (const plan of plans) { await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(loadDatabaseName(plan.id))} WITH (FORCE)`); await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(loadRoleName(plan.id))}`); }
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(sourceDatabase)} WITH (FORCE)`); await admin.end();
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  }, 45000);
  it('serves isolated customer pages, restarts, processes queued imports and removes owned resources', async () => {
    const fixture = await setup(), run = fixture.start();
    expect(await run.event('ready')).toMatchObject({ fixtureRoleRestricted: true, sourceCustomerReadDenied: true, commit: 'a'.repeat(40) });
    const { origin, accounts } = JSON.parse(await readFile(join(fixture.output, 'accounts.json'), 'utf8'));
    for (const name of ['accounts.json', 'worker.json', 'process.log']) expect((await stat(join(fixture.output, name))).mode & 0o077).toBe(0);
    const config = loadWorkerConfiguration(fixture.plan), forbidden = new URL(config.runtimeUrl); forbidden.pathname = source.pathname;
    const sourceRuntime = new Client({ connectionString: forbidden.href }); await sourceRuntime.connect();
    try { await expect(sourceRuntime.query('SELECT * FROM "User"')).rejects.toMatchObject({ code: '42501' }); await expect(sourceRuntime.query('UPDATE "User" SET name=name')).rejects.toMatchObject({ code: '42501' }); }
    finally { await sourceRuntime.end(); }
    for (const account of accounts) for (const route of customerRoutes) {
      const response = await fetch(origin + route.path, { headers: { Cookie: account.cookie }, redirect: 'manual' });
      expect(response.status).toBe(200); const body = await response.text(); expect(body).toContain(account.marker);
      for (const other of accounts) if (other !== account) expect(body).not.toContain(other.marker);
    }
    for (const kind of ['restart', 'crash-restart']) {
      const offset = run.events.length; run.child.stdin.write(kind + '\n');
      expect(await run.event('restarted', offset)).toMatchObject({ kind });
      expect((await fetch(origin + '/contacts', { headers: { Cookie: accounts[0].cookie }, redirect: 'manual' })).status).toBe(200);
    }
    const items = Array.from({ length: 50 }, (_, index) => {
      const rowId = `import_${index}`;
      return { record: { rowId, sourceRow: index + 1, source: 'CSV', firstName: null, lastName: null, displayName: `Imported person ${index}`, company: null, publicNotes: null, emails: [], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId, action: 'CREATE', targetContactId: null } };
    });
    const queued = await fetch(origin + '/api/contacts/import', { method: 'POST', headers: { Cookie: accounts[0].cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'queue', importId: 'fixture_import_01', items }) });
    expect(queued.status).toBe(202); await queued.arrayBuffer();
    const worker = start(['scripts/run-hosted-load-worker.mjs', join(fixture.output, 'worker.json')]);
    const db = new Client({ connectionString: config.runtimeUrl }); await db.connect();
    try {
      // Import rows can commit before the worker records terminal completion.
      await until(async () => (await db.query('SELECT status FROM "ContactImportBatch"')).rows[0]?.status === 'COMPLETED', 45000);
      expect((await db.query('SELECT count(*)::int AS count FROM "Contact"')).rows[0].count).toBe(250);
      expect((await db.query('SELECT status FROM "ContactImportBatch"')).rows).toEqual([{ status: 'COMPLETED' }]);
    } finally { await db.end(); }
    worker.child.kill('SIGTERM'); expect((await worker.done).code).toBe(0);
    const offset = run.events.length; run.child.stdin.write('snapshot\n'); expect(await run.event('snapshot', offset)).toMatchObject({ contacts: 250 });
    run.child.stdin.write('stop\n'); expect((await run.done).code).toBe(0);
    expect(run.events.find(event => event.event === 'cleanup')).toMatchObject({ databaseRemoved: true, roleRemoved: true, credentialsRemoved: true });
    for (const name of ['accounts.json', 'worker.json']) await expect(stat(join(fixture.output, name))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(run.output + run.errors).not.toContain(fixture.plan.token);
    expect(run.output + run.errors).not.toContain(fixture.plan.sourceUrl);
    await removed(fixture.plan);
  }, 180000);
  it('deletes a populated account within the application transaction while preserving another account', async () => {
    const fixture = await setup({ accounts: 2, contactsPerAccount: 1000, historyPerContact: 24, mixesPerAccount: 30, beatsPerMix: 6 });
    const run = fixture.start(); await run.event('ready');
    const config = loadWorkerConfiguration(fixture.plan);
    const { accounts } = JSON.parse(await readFile(join(fixture.output, 'accounts.json'), 'utf8'));
    const program = `
      import assert from 'node:assert/strict';
      import { deleteAccountData } from './src/lib/account-deletion.ts';
      import { prisma } from './src/lib/prisma.ts';
      const [removed, retained] = ${JSON.stringify(accounts.map(account => account.marker))};
      const counts = async workspaceId => ({
        contacts: await prisma.contact.count({ where: { workspaceId } }),
        followups: await prisma.jump.count({ where: { workspaceId } }),
        mixes: await prisma.mix.count({ where: { workspaceId } })
      });
      try {
        const identity = await prisma.$queryRawUnsafe('SELECT current_database() AS database,current_user AS role');
        assert.equal(identity[0].database, ${JSON.stringify(loadDatabaseName(fixture.plan.id))});
        assert.equal(identity[0].role, ${JSON.stringify(loadRoleName(fixture.plan.id))});
        const expected = { contacts: 1000, followups: 25000, mixes: 30 };
        assert.deepEqual(await counts(removed), expected);
        assert.deepEqual(await counts(retained), expected);
        // Keep deleteAccountData's actual transaction timeout: a successful
        // commit, complete erasure and tenant preservation are the contract.
        const result = await deleteAccountData(removed);
        assert.equal(result.deleted, true);
        assert.deepEqual(await counts(removed), { contacts: 0, followups: 0, mixes: 0 });
        assert.equal(await prisma.user.count({ where: { id: removed } }), 0);
        assert.equal(await prisma.workspace.count({ where: { id: removed } }), 0);
        assert.equal(await prisma.session.count({ where: { userId: removed } }), 0);
        assert.equal((await prisma.accountDeletionAudit.findUnique({ where: { requestId: result.requestId } })).status, 'COMPLETED');
        assert.deepEqual(await counts(retained), expected);
        assert.equal(await prisma.user.count({ where: { id: retained } }), 1);
        assert.deepEqual(await deleteAccountData(removed), { deleted: false });
        console.log('Populated account erasure and unrelated account preservation passed.');
      } finally { await prisma.$disconnect(); }
    `;
    const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
      env: isolatedLoadEnvironment(config), timeout: 45000, maxBuffer: 2 * 1024 * 1024
    });
    expect(result.stdout).toContain('Populated account erasure and unrelated account preservation passed.');
    run.child.stdin.write('stop\n'); expect((await run.done).code).toBe(0);
    expect(run.events.find(event => event.event === 'cleanup')).toMatchObject({ databaseRemoved: true, roleRemoved: true, credentialsRemoved: true });
    await removed(fixture.plan);
  }, 120000);
  it('cleans up after controller cancellation', async () => {
    const fixture = await setup(), run = fixture.start(); await run.event('ready');
    run.child.kill('SIGTERM'); expect((await run.done).code).toBe(0);
    expect(run.events.find(event => event.event === 'cleanup')).toMatchObject({ databaseRemoved: true, roleRemoved: true, credentialsRemoved: true });
    await removed(fixture.plan);
  }, 90000);
  it('rejects a recovery-held source before creating fixtures', async () => {
    const fixture = await setup();
    await owner.query(`ALTER DATABASE ${quoteIdentifier(sourceDatabase)} SET jitm.recovery_hold='held-fixture'`);
    try { const run = fixture.start(); expect((await run.done).code).toBe(1); expect(run.events.find(event => event.event === 'failed')).toMatchObject({ phase: 'source-preflight', code: null }); await removed(fixture.plan); }
    finally { await owner.query(`ALTER DATABASE ${quoteIdentifier(sourceDatabase)} RESET jitm.recovery_hold`); }
  }, 15000);
  it('refuses source privileges inherited from PUBLIC and cleans up the unsuccessful fixture', async () => {
    const fixture = await setup(); await owner.query('GRANT SELECT ON "Contact" TO PUBLIC');
    try {
      const run = fixture.start(); expect((await run.done).code).toBe(1);
      expect(run.events.find(event => event.event === 'failed')).toMatchObject({ phase: 'source-isolation', code: null });
      expect(run.events.find(event => event.event === 'cleanup')).toMatchObject({ databaseRemoved: true, roleRemoved: true });
      await removed(fixture.plan);
    } finally { await owner.query('REVOKE SELECT ON "Contact" FROM PUBLIC'); }
  }, 60000);
  it('preserves preexisting target databases instead of adopting or deleting them', async () => {
    const fixture = await setup(), name = quoteIdentifier(loadDatabaseName(fixture.plan.id));
    await owner.query(`CREATE DATABASE ${name} TEMPLATE template0`);
    try { const run = fixture.start(); expect((await run.done).code).toBe(1); expect((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [loadDatabaseName(fixture.plan.id)])).rowCount).toBe(1); }
    finally { await owner.query(`DROP DATABASE ${name}`); }
    await removed(fixture.plan);
  }, 15000);
  it('refuses a packaged environment file before accessing the database', async () => {
    const fixture = await setup(), envFile = '.next/standalone/.env.production.local';
    await writeFile(envFile, 'RESEND_API_KEY=synthetic-forbidden-provider-key\n', { mode: 0o600, flag: 'wx' });
    try {
      const run = fixture.start(); expect((await run.done).code).toBe(1);
      expect(run.events).toEqual([]); expect(run.errors).not.toContain('synthetic-forbidden-provider-key');
      await removed(fixture.plan);
    } finally { await rm(envFile); }
  }, 15000);
});
