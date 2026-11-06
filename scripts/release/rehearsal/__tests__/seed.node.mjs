import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, seedRows } from '../seed.mjs';
import { settings as catalog } from '../../jobs/settings.mjs';
import { settings, renderStub, synthetic } from './fixtures.mjs';

test('seed checks previous deployments before creating one job with unmarked rows', async () => {
  const s = settings(), stub = renderStub(s);
  await seed(s, stub.io);
  assert.equal(stub.jobs.size, 1);
  assert.equal(stub.io.report.seed.unmarked_rows, true);
  const creation = stub.calls.findIndex(c => c.method === 'POST');
  assert.equal(stub.calls.slice(0, creation).filter(c => c.path.endsWith('/deploys')).length, 2);
  assert.equal([...stub.jobs.values()][0].context.previous_sha, s.rehearsal.previous_sha);
});
for (const fault of ['wrongPrevious', 'wrongOwner', 'markedSeed', 'crossJob']) {
  test(`seed refuses ${fault}`, async () => {
    const s = settings(), stub = renderStub(s, { [fault]: true });
    await assert.rejects(seed(s, stub.io));
    if (['wrongPrevious', 'wrongOwner'].includes(fault)) assert.equal(stub.jobs.size, 0);
  });
}
test('seed refuses production domain before API calls', async () => {
  const s = settings(), stub = renderStub(s); s.site_url = 'https://jumpinthemix.com';
  await assert.rejects(seed(s, stub.io)); assert.equal(stub.calls.length, 0);
});
function databaseFixture(faults = {}) {
  const statements = [], events = [], contacts = [], jumps = [];
  const context = { mode: 'seed', previous_sha: synthetic(20), operator_sha: synthetic(20), database_host: 'db.example.test' };
  const env = { JITM_REHEARSAL: 'true', DATABASE_URL: 'postgresql://db.example.test/rehearsal' };
  const db = { query: async (sql, args = []) => {
    statements.push({ sql, args });
    if (sql.startsWith('SELECT 1 FROM "User"')) return { rowCount: faults.existingUser ? 1 : 0 };
    if (faults.writeFailure && sql.startsWith('INSERT')) throw Error('synthetic SQL failure');
    if (sql.startsWith('INSERT INTO "Contact"')) contacts.push(args);
    if (sql.startsWith('INSERT INTO "Jump"')) jumps.push({ status: args[6], manualOnly: true });
    if (sql.startsWith('SELECT 1 FROM "Contact"')) return { rowCount: contacts.length };
    if (sql.startsWith('SELECT status')) return { rows: jumps };
    return { rowCount: 1, rows: [] };
  } };
  const io = {
    git: async (...args) => { events.push(args[0]); return args[0] === 'rev-parse' ? context.operator_sha : ''; },
    releaseSchema: async sha => { assert.equal(sha, context.previous_sha); return { previous: true }; },
    migrations: async (_, a, b) => { assert.equal(a, b); assert.ok(a.previous); events.push('migrations'); },
    schemaReady: async () => events.push('schema'), noRecoveryHold: async () => events.push('hold'),
    transact: async action => { events.push('BEGIN'); try { await action(db); events.push('COMMIT'); } catch (error) { events.push('ROLLBACK'); throw error; } },
  };
  return { context, env, io, statements, events, contacts, jumps };
}
test('baseline SQL is transactional, schema-bound, nontrivial, unmarked and has no recipients', async () => {
  const f = databaseFixture();
  assert.deepEqual(await seedRows(f.context, f.io, f.env), { previous_commit: true, unmarked_rows: true, nontrivial: true });
  assert.equal(f.contacts.length, 3);
  assert.deepEqual(f.jumps.map(j => j.status), ['PENDING', 'DONE', 'SKIPPED']);
  assert.equal(f.events.at(-1), 'COMMIT');
  for (const { sql, args } of f.statements) {
    assert.ok(!/DELETE|UPDATE|passwordHash|ContactEmail|ContactPhone/.test(sql));
    for (const arg of args) assert.ok(!String(arg).startsWith(catalog.syntheticPrefix));
  }
  const user = f.statements.find(s => s.sql.startsWith('INSERT INTO "User"'));
  assert.match(user.args[1], /@example\.invalid$/);
  assert.ok(user.sql.includes('"suspendedAt"'));
});
test('opt-in, database and image identity are required before a transaction', async () => {
  for (const fault of ['optIn', 'database', 'image']) {
    const f = databaseFixture();
    if (fault === 'optIn') f.env.JITM_REHEARSAL = 'false';
    if (fault === 'database') f.env.DATABASE_URL = 'postgresql://wrong.example.test/rehearsal';
    if (fault === 'image') f.io.git = async () => synthetic(20);
    await assert.rejects(seedRows(f.context, f.io, f.env));
    assert.ok(!f.events.includes('BEGIN'));
  }
});
test('existing data and SQL failures refuse without commit', async () => {
  for (const fault of ['existingUser', 'writeFailure']) {
    const f = databaseFixture({ [fault]: true });
    await assert.rejects(seedRows(f.context, f.io, f.env));
    assert.equal(f.events.at(-1), 'ROLLBACK');
    assert.ok(!f.events.includes('COMMIT'));
  }
});
