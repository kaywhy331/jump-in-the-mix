import { readFile, writeFile, mkdir, open, unlink, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import { quoteIdentifier } from './lib/postgres-ops.mjs';
import { grantRuntimeRole } from './lib/runtime-database-role.mjs';
import { seedCustomerLoadFixture } from './lib/customer-load-fixture.mjs';
import { readPrivateLoadPlan, loadDatabaseName, loadRoleName, loadOwnershipMarker, loadWorkerConfiguration, isolatedLoadEnvironment } from './lib/hosted-load-plan.mjs';
import { recoveryHoldQuery } from '../src/lib/recovery-hold-query.mjs';

const emit = value => console.log(JSON.stringify(value));
async function main() {
  const [planFile, outputArg] = process.argv.slice(2);
  if (!planFile || !outputArg || process.argv.length !== 4) throw new Error('Provide private plan and empty output directory paths.');
  const plan = await readPrivateLoadPlan(planFile);
  if (plan.expectedCommit && process.env.RENDER_GIT_COMMIT !== plan.expectedCommit) throw new Error('Hosted build differs from the reviewed release.');
  // Next also loads files from its packaged directory; dotenv's disabled path
  // alone does not prevent those files from restoring production credentials.
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const found = await lstat(join('.next/standalone', name)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (found) throw new Error('Packaged environment files must be absent from the isolated web build.');
  }
  const output = resolve(outputArg); await mkdir(output, { mode: 0o700 });
  const config = loadWorkerConfiguration(plan), env = isolatedLoadEnvironment(config), origin = env.APP_URL;
  const database = loadDatabaseName(plan.id), role = loadRoleName(plan.id), marker = loadOwnershipMarker(plan);
  const owner = new Client({ connectionString: plan.sourceUrl, connectionTimeoutMillis: 5000, query_timeout: 30000 });
  const abort = new AbortController(), log = await open(join(output, 'process.log'), 'wx', 0o600);
  let db, web, webExit, createdDatabase = false, createdRole = false, closing = false, input, timer, phase = 'source-preflight';
  const checkCanceled = () => { if (closing) throw new Error('Qualification canceled.'); };
  const stopWeb = async (signal = 'SIGTERM') => {
    if (!web || web.exitCode !== null || web.signalCode !== null) return;
    web.kill(signal); const kill = setTimeout(() => web.kill('SIGKILL'), 5000);
    try { await webExit; } finally { clearTimeout(kill); }
  };
  const cancel = () => { closing = true; abort.abort(); input?.close(); void stopWeb(); };
  owner.on('error', cancel);
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
  timer = setTimeout(cancel, Date.parse(plan.expiresAt) - Date.now());
  async function startWeb() {
    checkCanceled();
    const reservation = createServer();
    await new Promise((resolvePort, reject) => { reservation.once('error', reject); reservation.listen(plan.port, '127.0.0.1', resolvePort); });
    await new Promise(resolvePort => reservation.close(resolvePort));
    checkCanceled();
    const started = performance.now();
    web = spawn(process.execPath, ['--max-semi-space-size=8', '.next/standalone/server.js'], { env, stdio: ['ignore', log.fd, log.fd] });
    webExit = new Promise(resolveExit => { web.once('exit', resolveExit); web.once('error', resolveExit); });
    while (!closing && performance.now() - started < 60000 && web.exitCode === null && web.signalCode === null) {
      try { const response = await fetch(origin + '/api/health/ready', { signal: AbortSignal.timeout(2000) }); const body = await response.json(); if (response.status === 200 && body.status === 'ready') return Math.round(performance.now() - started); } catch {}
      await new Promise(resolveWait => setTimeout(resolveWait, 200));
    }
    throw new Error('Fixture web process did not become ready.');
  }
  async function snapshot() {
    const cgroup = {};
    for (const name of ['memory.max', 'memory.peak', 'memory.events', 'cpu.max', 'cpu.stat']) cgroup[name] = await readFile('/sys/fs/cgroup/' + name, 'utf8').catch(() => null);
    const status = web?.pid ? await readFile(`/proc/${web.pid}/status`, 'utf8').catch(() => '') : '';
    return { event: 'snapshot', id: plan.id, at: new Date().toISOString(), cgroup, webPeakRssKiB: Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]) || null,
      databaseBytes: Number((await db.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes),
      jobs: (await db.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE "completedAt" IS NOT NULL)::int AS completed, count(*) FILTER (WHERE "failedAt" IS NOT NULL)::int AS failed, count(*) FILTER (WHERE "lockedAt" IS NOT NULL AND "completedAt" IS NULL AND "failedAt" IS NULL)::int AS running FROM "Job"')).rows[0],
      imports: (await db.query('SELECT status,count(*)::int AS batches FROM "ContactImportBatch" GROUP BY status')).rows,
      contacts: (await db.query('SELECT count(*)::int AS total FROM "Contact"')).rows[0].total };
  }
  try {
    await owner.connect();
    checkCanceled();
    const authority = (await owner.query(`SELECT pg_has_role(current_user,d.datdba,'USAGE') AS owns_source, r.rolcreatedb OR r.rolsuper AS creates_databases, r.rolcreaterole OR r.rolsuper AS creates_roles FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`)).rows[0];
    if (!authority?.owns_source || !authority.creates_databases || !authority.creates_roles || (await owner.query(recoveryHoldQuery)).rowCount) throw new Error('Reviewed available-source owner authority is required.');
    if ((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount || (await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) throw new Error('Fixture identifiers already exist; do not reuse them.');
    phase = 'create-database';
    await owner.query(`CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE template0`); createdDatabase = true;
    await owner.query(`COMMENT ON DATABASE ${quoteIdentifier(database)} IS '${marker}'`);
    checkCanceled();
    const targetOwner = new URL(plan.sourceUrl); targetOwner.pathname = `/${database}`;
    phase = 'migrate-fixture';
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: targetOwner.href }, timeout: 120000, maxBuffer: 2 * 1024 * 1024, signal: abort.signal });
    db = new Client({ connectionString: targetOwner.href, connectionTimeoutMillis: 5000, query_timeout: 60000 }); db.on('error', cancel); await db.connect();
    phase = 'restrict-role';
    const password = new URL(config.runtimeUrl).password;
    checkCanceled();
    await owner.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${password}' VALID UNTIL '${new Date(plan.expiresAt).toISOString()}'`); createdRole = true;
    await owner.query(`COMMENT ON ROLE ${quoteIdentifier(role)} IS '${marker}'`);
    const scope = await grantRuntimeRole(db, { role });
    phase = 'source-isolation';
    const sourceAccess = (await owner.query(`SELECT
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND CASE WHEN c.relkind IN ('r','p','v','m','f') THEN has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END) AS tables,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'SELECT,USAGE,UPDATE') ELSE false END) AS sequences,
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE')) AS definers,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege($1,n.oid,'CREATE')) AS schema_create,
      has_database_privilege($1,current_database(),'CREATE') AS database_create`, [role])).rows[0];
    if (Object.values(sourceAccess).some(Boolean)) throw new Error('Fixture role has source application privileges.');
    phase = 'seed-fixture';
    await db.query("SET TIME ZONE 'UTC'");
    const accounts = await seedCustomerLoadFixture(db, { database, profile: plan.profile, checkCanceled });
    phase = 'analyze-fixture';
    await db.query('ANALYZE');
    await writeFile(join(output, 'accounts.json'), JSON.stringify({ origin, accounts }), { mode: 0o600, flag: 'wx' });
    await writeFile(join(output, 'worker.json'), JSON.stringify(config), { mode: 0o600, flag: 'wx' });
    phase = 'web-start';
    const readyMs = await startWeb();
    emit({ event: 'ready', id: plan.id, buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), commit: process.env.RENDER_GIT_COMMIT ?? null, readyMs, profile: plan.profile, fixtureRoleRestricted: scope.ready, sourceCustomerReadDenied: true });
    phase = 'observations';
    emit(await snapshot());
    input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of input) {
      if (closing || line === 'stop') break;
      if (line === 'snapshot') emit(await snapshot());
      else if (line === 'restart' || line === 'crash-restart') {
        await stopWeb(line === 'crash-restart' ? 'SIGKILL' : 'SIGTERM');
        emit({ event: 'restarted', id: plan.id, kind: line, readyMs: await startWeb() });
      } else emit({ event: 'invalid-command' });
    }
  } catch (error) {
    emit({ event: 'failed', id: plan.id, phase, code: /^[A-Z0-9]{5}$/.test(error.code ?? '') ? error.code : null, reason: error.message === 'Query read timeout' ? 'query-timeout' : null });
    throw error;
  } finally {
    clearTimeout(timer); closing = true; input?.close(); abort.abort();
    await stopWeb(); await db?.end().catch(() => {});
    let databaseRemoved = !createdDatabase, roleRemoved = !createdRole;
    try {
      if (createdDatabase) {
        const found = (await owner.query(`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1`, [database])).rows[0];
        if (found && found.marker !== marker) throw new Error('Fixture ownership marker changed; cleanup requires operator review.');
        if (found) await owner.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`);
        databaseRemoved = true;
      }
      if (createdRole) {
        const found = (await owner.query(`SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1`, [role])).rows[0];
        if (found && found.marker !== marker) throw new Error('Fixture role ownership marker changed; cleanup requires operator review.');
        if (found) await owner.query(`DROP ROLE ${quoteIdentifier(role)}`);
        roleRemoved = true;
      }
    } finally {
      const closed = await Promise.allSettled([owner.end(), log.close()]);
      let credentialsRemoved = true;
      for (const name of ['accounts.json', 'worker.json']) {
        try { await unlink(join(output, name)); } catch (error) { if (error.code !== 'ENOENT') credentialsRemoved = false; }
      }
      process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel);
      emit({ event: 'cleanup', id: plan.id, databaseRemoved, roleRemoved, credentialsRemoved });
      if (!credentialsRemoved) throw new Error('Private fixture files require operator cleanup.');
      if (closed.some(result => result.status === 'rejected')) throw new Error('Fixture connection or log closure failed.');
    }
  }
}
main().catch(() => { console.error('Isolated hosted fixture failed. Inspect its private log and exact ownership receipt before retrying.'); process.exitCode = 1; });
