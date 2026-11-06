import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, cp, symlink, mkdir, writeFile, appendFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { bind } from '../../candidate.mjs';
import { requiredChecks } from '../../workflow.mjs';
import { grantRuntimeRole } from '../../../lib/runtime-database-role.mjs';
import { quoteIdentifier, databaseUrlWithDatabase } from '../../../lib/postgres-ops.mjs';
import { command } from '../read-only.mjs';
import { backupGrants } from '../migrate.mjs';

test('local PostgreSQL: additive migration process, new objects and backup access', {skip:!process.env.RELEASE_TEST_ADMIN_URL},async () => {
  const adminUrl = process.env.RELEASE_TEST_ADMIN_URL;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(adminUrl).hostname));
  const suffix = randomUUID().replaceAll('-','');
  const database = `jitm_design_release_${suffix}`, role = `jitm_release_${suffix}`, backupRole = `jitm_backup_${suffix}`;
  const directory = await mkdtemp(join(tmpdir(),'jitm-release-migrate-'));
  const admin = new Client({connectionString:adminUrl,connectionTimeoutMillis:5000});
  const ownerUrl = databaseUrlWithDatabase(adminUrl,database);
  const runtime = new URL(ownerUrl); runtime.username = role; runtime.password = randomUUID();
  const backupUrl = new URL(ownerUrl); backupUrl.username = backupRole; backupUrl.password = randomUUID();
  const env = {...process.env,DATABASE_URL:runtime.href,MIGRATION_DATABASE_URL:ownerUrl,BACKUP_DATABASE_URL:backupUrl.href};
  const local = (file,args,variables=env) => command(file,args,variables,directory);
  const git = (...args) => local('git',args);
  let owner;
  await admin.connect();
  try {
    await command('git',['clone','--shared','--no-hardlinks','--quiet',process.cwd(),directory]);
    // Include the exact working candidate when running before the slice commit.
    await cp('scripts/release/jobs',join(directory,'scripts/release/jobs'),{recursive:true});
    await symlink(join(process.cwd(),'node_modules'),join(directory,'node_modules'));
    // The repository ignores a node_modules directory; this fixture uses a
    // symlink, which needs an explicit local-only exclude to stay clean.
    await appendFile(join(directory,'.git/info/exclude'),'\n/node_modules\n');
    await git('config','user.name','Synthetic qualification');
    await git('config','user.email','fixture@example.invalid');
    await git('add','scripts/release/jobs');
    await git('commit','--allow-empty','-m','Synthetic catalog baseline');
    const previous = (await git('rev-parse','HEAD')).trim();
    await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    for (const [name,password] of [[role,runtime.password],[backupRole,backupUrl.password]]) {
      await admin.query(`CREATE ROLE ${quoteIdentifier(name)} LOGIN NOINHERIT PASSWORD '${password}'`);
    }
    await local(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{...env,DATABASE_URL:ownerUrl});
    owner = new Client({connectionString:ownerUrl}); await owner.connect();
    await owner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await owner.query(`REVOKE CREATE ON DATABASE ${quoteIdentifier(database)} FROM PUBLIC`);
    await grantRuntimeRole(owner,{role});
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(backupRole)}`);
    await owner.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(backupRole)}`);
    await owner.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(backupRole)}`);
    await owner.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdentifier(backupRole)}`);
    const last = (await readdir(join(directory,'prisma/migrations'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort().at(-1);
    const migration = `${last}_catalog_fixture`;
    await mkdir(join(directory,'prisma/migrations',migration));
    await writeFile(join(directory,'prisma/migrations',migration,'migration.sql'),'CREATE TABLE "ReleaseCatalogFixture" ("id" TEXT NOT NULL, CONSTRAINT "ReleaseCatalogFixture_pkey" PRIMARY KEY ("id"));\n');
    await writeFile(join(directory,'prisma/release-catalog-fixture.prisma'),'model ReleaseCatalogFixture {\n  id String @id\n}\n');
    await git('add','prisma'); await git('commit','-m','Synthetic additive migration');
    await local(process.execPath,['node_modules/prisma/build/index.js','generate']);
    await local(process.execPath,['scripts/generate-schema-release.mjs']);
    let sha = (await git('rev-parse','HEAD')).trim();
    let baseline = null;
    const invoke = async (step,succeeds=true) => {
      const context = {operation_id:`2.1.${step}`,candidate_sha:sha,previous_sha:previous,candidate_binding:await bind(directory,sha,sha),
        release_started_at:new Date(Date.now()-1000).toISOString(),receipt_prefix:'JITM_RELEASE_RECEIPT:',checks:requiredChecks[step],baseline_counts_sha256:step==='preflight'?null:baseline};
      const variables = {...env,JITM_RELEASE_CONTEXT:Buffer.from(JSON.stringify(context)).toString('base64')};
      if (!succeeds) {await assert.rejects(local(process.execPath,[`scripts/release/jobs/${step}.mjs`],variables),e=>e.code===1 && e.stdout==='');return;}
      const output=await local(process.execPath,[`scripts/release/jobs/${step}.mjs`],variables);
      assert.equal(output.trim().split('\n').length,1);
      return JSON.parse(output.slice(context.receipt_prefix.length));
    };
    baseline = (await invoke('preflight')).counts_sha256;
    assert.equal((await invoke('migrate')).counts_sha256,baseline);
    assert.equal((await invoke('final')).counts_sha256,baseline);
    await backupGrants(env);
    await owner.query(`REVOKE SELECT ON public."ReleaseCatalogFixture" FROM ${quoteIdentifier(backupRole)}`);
    await assert.rejects(backupGrants(env));
    await owner.query(`GRANT SELECT ON public."ReleaseCatalogFixture" TO ${quoteIdentifier(backupRole)}`);
    // Re-running an already applied migration is refused, not silently certified.
    await invoke('migrate',false);
    await owner.query('INSERT INTO public."ReleaseCatalogFixture" (id) VALUES (\'unmarked-synthetic-row\')');
    await invoke('final',false);
    await owner.query('DELETE FROM public."ReleaseCatalogFixture"');
    await writeFile(join(directory,'prisma/migrations',migration,'migration.sql'),'DROP TABLE "User";\n');
    await git('add','prisma'); await git('commit','-m','Synthetic rejected destructive migration');
    sha=(await git('rev-parse','HEAD')).trim();
    await invoke('migrate',false);
    assert.equal((await owner.query(`SELECT to_regclass('public."User"') IS NOT NULL AS present`)).rows[0].present,true);
  } finally {
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    for (const name of [role,backupRole]) await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(name)}`);
    await admin.end(); await rm(directory,{recursive:true,force:true});
  }
});
