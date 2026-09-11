import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRuntimeRole, inspectRuntimeRole } from '../scripts/lib/runtime-database-role.mjs';
import { quoteIdentifier } from '../scripts/lib/postgres-ops.mjs';
import { schemaRelease } from '../scripts/generate-schema-release.mjs';

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? '');
describe.skipIf(!local).sequential('restricted production database credential', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const database = `jitm_design_runtime_${suffix}`, role = `jitm_runtime_${suffix}`;
  const password = randomBytes(24).toString('hex');
  let admin, owner, runtime, source, runtimeUrl, child, workerOutput = '';
  const execute = promisify(execFile);
  const env = () => ({ ...process.env, DATABASE_URL: runtimeUrl.href, NETLIFY_DB_URL: '', RECOVERY_TEST_DATABASE_URL: '', NODE_ENV: 'production', DATA_ENCRYPTION_KEY: '0'.repeat(64), AUTH_RATE_LIMIT_SECRET: 'runtime-test-fixture', RESEND_API_KEY: '', RESEND_RECOVERY_API_KEY: '', EMAIL_FROM: '', OPS_ALERT_WEBHOOK_URL: '', OPS_ALERT_SNS_TOPIC_ARN: '', BACKUP_S3_BUCKET: '', NETLIFY_WORKER_SECRET: '', WORKER_DISPATCH_MODE: 'off', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', WEB_PUSH_VAPID_PRIVATE_KEY: '', WEB_PUSH_VAPID_PUBLIC_KEY: '' });
  beforeAll(async () => {
    source = new URL(process.env.DATABASE_URL); source.pathname = '/postgres'; source.search = '';
    admin = new Client({ connectionString: source.href }); await admin.connect();
    await admin.query(`CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE template0`);
    source.pathname = `/${database}`;
    await execute(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: source.href }, timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    owner = new Client({ connectionString: source.href }); await owner.connect();
    await owner.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    runtimeUrl = new URL(source); runtimeUrl.username = role; runtimeUrl.password = password;
    runtime = new Client({ connectionString: runtimeUrl.href }); await runtime.connect();
  }, 60000);
  async function stopWorker() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const done = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
    try { await done; } finally { clearTimeout(timer); }
  }
  afterAll(async () => {
    await stopWorker(); await runtime?.end(); await owner?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`); await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`); await admin.end(); }
  }, 15000);
  it('grants application DML and read-only migration evidence without ownership', async () => {
    expect((await inspectRuntimeRole(owner, { role })).ready).toBe(false);
    const proof = await grantRuntimeRole(owner, { role });
    expect(proof).toMatchObject({ boundary: true, ready: true, tables: { total: 99, readable: 99, writable: 99, elevated: false }, history: { readable: true, writable: false } });
    expect(await inspectRuntimeRole(runtime, { role })).toEqual(proof);
  });
  it('executes customer reads/writes and transactional worker locking', async () => {
    await runtime.query('BEGIN');
    try {
      await runtime.query(`INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('runtime-user','runtime@example.test','Runtime test',now());
        INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ('runtime-workspace','Runtime','runtime-workspace','runtime-user',now());
        INSERT INTO "Contact" (id,"workspaceId","displayName","updatedAt") VALUES ('runtime-contact','runtime-workspace','Before',now());
        UPDATE "Contact" SET "displayName"='After' WHERE id='runtime-contact';`);
      expect((await runtime.query(`SELECT "displayName" FROM "Contact" WHERE id='runtime-contact' FOR UPDATE SKIP LOCKED`)).rows[0].displayName).toBe('After');
      await runtime.query('SELECT pg_advisory_xact_lock(823741)');
      expect((await runtime.query(`DELETE FROM "Contact" WHERE id='runtime-contact'`)).rowCount).toBe(1);
    } finally { await runtime.query('ROLLBACK'); }
  });
  it('denies schema changes, history rewrites, role escalation and recovery-hold removal', async () => {
    const ownerName = (await owner.query('SELECT current_user AS name')).rows[0].name;
    for (const statement of [
      `CREATE TABLE public.runtime_forbidden (id int)`,
      `ALTER TABLE "User" ADD COLUMN runtime_forbidden text`,
      `UPDATE "_prisma_migrations" SET checksum=checksum WHERE false`,
      `TRUNCATE "User" CASCADE`,
      `SET ROLE ${quoteIdentifier(ownerName)}`,
      `ALTER DATABASE ${quoteIdentifier(database)} RESET jitm.recovery_hold`
    ]) {
      await expect(runtime.query(statement), statement).rejects.toMatchObject({ code: '42501' });
    }
    // PostgreSQL reports an ineffective GRANT as a warning, so inspect the ACL.
    const acl = async () => (await owner.query(`SELECT relacl::text AS acl FROM pg_class WHERE oid='"User"'::regclass`)).rows[0].acl;
    const before = await acl();
    await runtime.query('GRANT SELECT ON "User" TO PUBLIC');
    expect(await acl()).toBe(before);
    // Session custom settings cannot erase the persistent catalog hold.
    await owner.query(`ALTER DATABASE ${quoteIdentifier(database)} SET jitm.recovery_hold='fixture-held'`);
    try {
      await runtime.query("SET jitm.recovery_hold='' ");
      const verify = await execute(process.execPath, ['--import', 'tsx', 'scripts/verify-database-release.ts'], { env: env(), timeout: 20000 }).catch(error => error);
      expect(verify.code).toBe(1); expect(verify.stdout).toContain('recovery-held');
    } finally { await owner.query(`ALTER DATABASE ${quoteIdentifier(database)} RESET jitm.recovery_hold`); }
  }, 25000);
  it('permits release verification and the real production catalog installer', async () => {
    const verified = await execute(process.execPath, ['--import', 'tsx', 'scripts/verify-database-release.ts'], { env: env(), timeout: 20000 });
    expect(verified.stdout).toContain('"status":"ready"');
    const seeded = await execute(process.execPath, ['--import', 'tsx', 'scripts/seed-application-catalog.ts'], { env: env(), timeout: 30000 });
    expect(seeded.stderr).toBe('');
    expect(JSON.parse(seeded.stdout).plansCreated).toBe(40);
    expect((await runtime.query('SELECT migration_name AS name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows).toEqual(schemaRelease().migrations);
  }, 55000);
  it('preserves safe grants for new migration-owned tables and sequences', async () => {
    await owner.query('CREATE TABLE runtime_future (id serial PRIMARY KEY, value text)');
    try {
      const row = await runtime.query("INSERT INTO runtime_future(value) VALUES ('fixture') RETURNING id");
      expect(row.rows[0].id).toBe(1);
      await expect(runtime.query("SELECT setval('runtime_future_id_seq',100)")).rejects.toMatchObject({ code: '42501' });
      expect((await grantRuntimeRole(owner, { role })).ready).toBe(true);
    } finally { await owner.query('DROP TABLE runtime_future'); }
  });
  it('refuses broader existing roles and callable security-definer functions', async () => {
    await owner.query(`ALTER ROLE ${quoteIdentifier(role)} INHERIT`);
    try { await expect(grantRuntimeRole(owner, { role })).rejects.toThrow('Dedicated restricted role'); }
    finally { await owner.query(`ALTER ROLE ${quoteIdentifier(role)} NOINHERIT`); }
    await owner.query('CREATE FUNCTION runtime_definer_fixture() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$');
    try {
      expect((await inspectRuntimeRole(runtime, { role })).ready).toBe(false);
      await expect(grantRuntimeRole(owner, { role })).rejects.toThrow('Dedicated restricted role');
    } finally { await owner.query('DROP FUNCTION runtime_definer_fixture()'); }
  });
  it('does not accept owner credentials when verifying runtime deployment', async () => {
    const command = ['scripts/configure-runtime-database.mjs', `--role=${role}`];
    const good = await execute(process.execPath, command, { env: env(), timeout: 20000 });
    expect(JSON.parse(good.stdout).ready).toBe(true);
    const bad = await execute(process.execPath, command, { env: { ...env(), DATABASE_URL: source.href }, timeout: 20000 }).catch(error => error);
    expect(bad.code).toBe(1); expect(bad.stderr).not.toContain(password); expect(bad.stdout).toBe('');
  }, 45000);
  it('runs the separate owner migration job and rejects reused runtime ownership', async () => {
    const command = ['scripts/migrate-with-owner.mjs'];
    const bad = await execute(process.execPath, command, { env: { ...env(), MIGRATION_DATABASE_URL: runtimeUrl.href }, timeout: 20000 }).catch(error => error);
    expect(bad.code).toBe(1); expect(bad.stderr).not.toContain(password);
    const good = await execute(process.execPath, command, { env: { ...env(), MIGRATION_DATABASE_URL: source.href }, timeout: 30000 });
    expect(JSON.parse(good.stdout)).toMatchObject({ status: 'migrated-and-runtime-verified', role, historyReadOnly: true });
    expect((await inspectRuntimeRole(runtime, { role })).ready).toBe(true);
  }, 55000);
  it('runs the actual worker and records a clean shutdown with the restricted credential', async () => {
    await runtime.query(`INSERT INTO "Job" (id,task,payload,"updatedAt") VALUES ('runtime-worker-job','runtime-test-unsupported-task','{}',now())`);
    child = spawn(process.execPath, ['--import', 'tsx', 'src/worker/index.ts'], { env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { workerOutput = (workerOutput + String(chunk)).slice(-5000); });
    const deadline = Date.now() + 20000;
    let claimed = false;
    while (Date.now() < deadline) {
      claimed = (await runtime.query(`SELECT attempts > 0 AS claimed FROM "Job" WHERE id='runtime-worker-job'`)).rows[0]?.claimed;
      if (claimed) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    expect(claimed, workerOutput).toBe(true);
    await stopWorker();
    expect((await runtime.query('SELECT status FROM "WorkerHeartbeat"')).rows.some(row => row.status === 'STOPPED')).toBe(true);
  }, 25000);
});
