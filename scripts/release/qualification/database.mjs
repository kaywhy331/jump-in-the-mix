import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { command } from '../jobs/read-only.mjs';
import { settings as catalog } from '../jobs/settings.mjs';
import { grantRuntimeRole } from '../../lib/runtime-database-role.mjs';
import { quoteIdentifier } from '../../lib/postgres-ops.mjs';

// Runs only as an explicit fixture command, never inside a catalog job.
const ownerUrl=process.env.MIGRATION_DATABASE_URL;
assert.equal(new URL(ownerUrl).hostname,process.env.QUALIFICATION_DATABASE_HOST,'Docker synthetic database only');
const db=new Client({connectionString:ownerUrl});
await db.connect();
try {
  const action=process.argv[2];
  if (action === 'setup') {
    await mkdir('.artifacts/qualification',{recursive:true});
    const config='.artifacts/qualification/prisma.config.ts';
    await writeFile(config,"import {defineConfig} from 'prisma/config'; export default defineConfig({schema:'/previous/prisma',migrations:{path:'/previous/prisma/migrations'},datasource:{url:process.env.DATABASE_URL}});\n");
    await command(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--config',config],{...process.env,DATABASE_URL:ownerUrl});
    const runtime=new URL(process.env.DATABASE_URL), backup=new URL(process.env.BACKUP_DATABASE_URL);
    for (const url of [runtime,backup]) {
      assert.match(url.password,/^[a-f0-9]+$/);
      await db.query(`CREATE ROLE ${quoteIdentifier(url.username)} LOGIN NOINHERIT PASSWORD '${url.password}'`);
    }
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    const database=(await db.query('SELECT current_database() AS name')).rows[0].name;
    await db.query(`REVOKE CREATE ON DATABASE ${quoteIdentifier(database)} FROM PUBLIC`);
    await grantRuntimeRole(db,{role:runtime.username});
    const role=quoteIdentifier(backup.username);
    await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await db.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
    await db.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${role}`);
    await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO ${role}`);
    await db.query(`INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('baseline-owner','baseline@example.invalid','Synthetic baseline',now())`);
  } else if (action === 'count-drift') {
    await db.query(`INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('count-drift','drift@example.invalid','Synthetic drift',now())`);
  } else if (action === 'recovery-hold') {
    const database=(await db.query('SELECT current_database() AS name')).rows[0].name;
    await db.query(`ALTER DATABASE ${quoteIdentifier(database)} SET jitm.recovery_hold='qualification'`);
  } else if (action === 'leftover-synthetic') {
    // A volatile table keeps counts unchanged, isolating the residue assertion.
    await db.query(`INSERT INTO "Job" (id,task,payload,"completedAt","updatedAt") VALUES ($1,'fixture-residue','{}',now(),now())`,[`${catalog.syntheticPrefix}orphan`]);
  } else if (action === 'idle') {
    const pending=(await db.query('SELECT count(*)::int AS n FROM "Job" WHERE "completedAt" IS NULL AND "failedAt" IS NULL')).rows[0].n;
    const heartbeat=(await db.query('SELECT count(*)::int AS n FROM "WorkerHeartbeat" WHERE status=\'RUNNING\'')).rows[0].n;
    assert.equal(pending,0); assert.equal(heartbeat,1);
  } else if (action === 'clean') {
    const {residue}=await import('../jobs/synthetic.mjs');
    await residue(db,catalog.syntheticPrefix);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n,1);
  } else if (action === 'migration-absent') {
    assert.equal((await db.query('SELECT to_regclass(\'public."QualificationObject"\') AS relation')).rows[0].relation,null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n,1);
  } else throw Error('Unknown fixture action');
  console.log(JSON.stringify({fixture:action,ok:true}));
} finally { await db.end(); }
