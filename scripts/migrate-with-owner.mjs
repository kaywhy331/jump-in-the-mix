import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { databaseIdentity, sameDatabase } from './lib/postgres-ops.mjs';
import { grantRuntimeRole, inspectRuntimeRole } from './lib/runtime-database-role.mjs';
import { recoveryHoldQuery } from '../src/lib/recovery-hold-query.mjs';

// Run only in the reviewed release's isolated migration job. The owner URL must
// never be stored in the web/worker environment or passed as a command argument.
const runtimeUrl = process.env.DATABASE_URL, ownerUrl = process.env.MIGRATION_DATABASE_URL;
let owner, runtime;
try {
  if (process.argv.length !== 2 || !runtimeUrl || !ownerUrl || !sameDatabase(runtimeUrl, ownerUrl) || databaseIdentity(runtimeUrl).schema !== 'public' || databaseIdentity(ownerUrl).schema !== 'public') throw new Error('One database/schema and separate credentials are required.');
  const role = decodeURIComponent(new URL(runtimeUrl).username);
  if (role === decodeURIComponent(new URL(ownerUrl).username)) throw new Error('The application must not use its migration credential.');
  owner = new Client({ connectionString: ownerUrl, connectionTimeoutMillis: 5000, query_timeout: 15000 }); await owner.connect();
  runtime = new Client({ connectionString: runtimeUrl, connectionTimeoutMillis: 5000, query_timeout: 15000 }); await runtime.connect();
  const actual = (await runtime.query('SELECT current_user AS name')).rows[0].name;
  if (actual !== role || !(await inspectRuntimeRole(runtime, { role })).boundary) throw new Error('Restricted runtime credential required before migration.');
  if ((await runtime.query(recoveryHoldQuery)).rowCount) throw new Error('Normal deployment must not migrate a recovery-held database.');
  const allowed = (await owner.query(`SELECT pg_has_role(current_user,datdba,'USAGE') AS allowed FROM pg_database WHERE datname=current_database()`)).rows[0]?.allowed;
  if (!allowed) throw new Error('Migration owner required.');
  const cleanEnv = { ...process.env }; delete cleanEnv.MIGRATION_DATABASE_URL;
  await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...cleanEnv, DATABASE_URL: ownerUrl }, timeout: 5 * 60_000, maxBuffer: 2 * 1024 * 1024
  });
  const grants = await grantRuntimeRole(owner, { role });
  await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/verify-database-release.ts'], {
    env: { ...cleanEnv, DATABASE_URL: runtimeUrl }, timeout: 30000, maxBuffer: 128 * 1024
  });
  console.log(JSON.stringify({ status: 'migrated-and-runtime-verified', role, tables: grants.tables.total, historyReadOnly: grants.history.readable && !grants.history.writable }));
} catch { console.error('Isolated migration failed. Keep the existing release and inspect private operator diagnostics.'); process.exitCode = 1; }
finally { await runtime?.end(); await owner?.end(); }
