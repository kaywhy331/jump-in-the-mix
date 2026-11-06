import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { bind } from '../../candidate.mjs';
import { requiredChecks } from '../../workflow.mjs';
import { grantRuntimeRole } from '../../../lib/runtime-database-role.mjs';
import { quoteIdentifier, databaseUrlWithDatabase } from '../../../lib/postgres-ops.mjs';
import { command, git } from '../read-only.mjs';

test('local PostgreSQL: actual preflight/final processes, grants, checksums and residue', { skip: !process.env.RELEASE_TEST_ADMIN_URL }, async () => {
  const adminUrl = process.env.RELEASE_TEST_ADMIN_URL;
  const target = new URL(adminUrl);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname), 'Local synthetic database only');
  const suffix = randomUUID().replaceAll('-','');
  const name = `jitm_design_release_${suffix}`, role = `jitm_release_${suffix}`;
  const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  const ownerUrl = databaseUrlWithDatabase(adminUrl,name);
  const runtime = new URL(ownerUrl); runtime.username = role; runtime.password = randomUUID();
  let owner;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
    // Ephemeral synthetic role; no existing role or database is changed.
    await admin.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN NOINHERIT PASSWORD '${runtime.password}'`);
    await command(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{ ...process.env,DATABASE_URL:ownerUrl });
    owner = new Client({connectionString:ownerUrl}); await owner.connect();
    await owner.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await owner.query(`REVOKE CREATE ON DATABASE ${quoteIdentifier(name)} FROM PUBLIC`);
    await grantRuntimeRole(owner,{role});
    const sha = (await git('rev-parse','HEAD')).trim();
    const binding = await bind(process.cwd(),sha,sha);
    const base = {candidate_sha:sha,previous_sha:sha,candidate_binding:binding,release_started_at:new Date().toISOString(),receipt_prefix:'JITM_RELEASE_RECEIPT:'};
    let baseline = null;
    const invoke = async (step, succeeds = true) => {
      const context = {...base,operation_id:`1.1.${step}`,checks:requiredChecks[step],baseline_counts_sha256:step === 'preflight' ? null : baseline};
      const env = {...process.env,DATABASE_URL:runtime.href,JITM_RELEASE_CONTEXT:Buffer.from(JSON.stringify(context)).toString('base64')};
      if (!succeeds) { await assert.rejects(command(process.execPath,[`scripts/release/jobs/${step}.mjs`],env), error => error.code === 1 && error.stdout === ''); return; }
      const output = await command(process.execPath,[`scripts/release/jobs/${step}.mjs`],env);
      const lines = output.trim().split('\n'); assert.equal(lines.length,1); assert.ok(lines[0].startsWith(base.receipt_prefix));
      return JSON.parse(lines[0].slice(base.receipt_prefix.length));
    };
    baseline = (await invoke('preflight')).counts_sha256;
    assert.equal((await invoke('final')).counts_sha256,baseline);
    await owner.query(`ALTER DATABASE ${quoteIdentifier(name)} SET jitm.recovery_hold='qualification'`);
    await invoke('preflight',false);
    await invoke('final',false);
    await owner.query(`ALTER DATABASE ${quoteIdentifier(name)} RESET jitm.recovery_hold`);
    await owner.query('UPDATE public._prisma_migrations SET checksum=$1 WHERE migration_name=(SELECT min(migration_name) FROM public._prisma_migrations)',['bad']);
    await invoke('final',false);
    const migration = (await owner.query('SELECT min(migration_name) AS name FROM public._prisma_migrations')).rows[0].name;
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    await owner.query('UPDATE public._prisma_migrations SET checksum=$1 WHERE migration_name=$2',[createHash('sha256').update(await readFile(`prisma/migrations/${migration}/migration.sql`)).digest('hex'),migration]);
    await owner.query(`INSERT INTO public."AuthRateLimit" (id,key,scope,"updatedAt","blockedUntil") VALUES ('synthetic-limit','synthetic-limit','test',now(),now()+interval '1 minute')`);
    await invoke('final',false);
    await owner.query('DELETE FROM public."AuthRateLimit"');
    for (const [id,task,failedAt] of [['ordinary-id','jitm.release.probe.test',null],['ordinary-id','ordinary-task',new Date()],['jitm-release-orphan','ordinary-task',null]]) {
      await owner.query('INSERT INTO public."Job" (id,task,payload,"updatedAt","failedAt") VALUES ($1,$2,\'{}\',now(),$3)',[id,task,failedAt]);
      await invoke('final',false); await owner.query('DELETE FROM public."Job"');
    }
    await owner.query(`INSERT INTO public."User" (id,email,name,"updatedAt") VALUES ('ordinary-test','no-recipient.invalid','test',now())`);
    await invoke('final',false); await owner.query('DELETE FROM public."User"');
    await owner.query(`REVOKE SELECT ON public."User" FROM ${quoteIdentifier(role)}`);
    await invoke('final',false); await grantRuntimeRole(owner,{role});
    assert.equal((await invoke('final')).counts_sha256,baseline);
  } finally {
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
    await admin.end();
  }
});
