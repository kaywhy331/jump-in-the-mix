import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) throw new Error("DATABASE_URL is required for the worker-heartbeat migration rehearsal.");

const schemaName = `jitm_worker_heartbeat_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrationName = "20260717140000_worker_heartbeat";

function databaseUrlForSchema(schema) {
  const url = new URL(rootUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function pgConnectionUrl() {
  const url = new URL(rootUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

function runPrisma(args, databaseUrl) {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit"
  });
}

const client = new Client({ connectionString: pgConnectionUrl() });
try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  runPrisma(["migrate", "deploy"], databaseUrlForSchema(schemaName));

  const table = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'WorkerHeartbeat'
     ) AS "exists"`,
    [schemaName]
  );
  if (!table.rows[0]?.exists) throw new Error("Worker heartbeat migration did not create WorkerHeartbeat.");

  const migration = await client.query(
    `SELECT "finished_at", "rolled_back_at"
     FROM "${schemaName}"."_prisma_migrations"
     WHERE "migration_name" = $1`,
    [migrationName]
  );
  if (!migration.rows[0]?.finished_at || migration.rows[0]?.rolled_back_at) {
    throw new Error(`Migration ${migrationName} was not applied successfully.`);
  }

  const now = new Date().toISOString();
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query(
    `INSERT INTO "WorkerHeartbeat"
       ("id", "workerId", "status", "startedAt", "lastSeenAt", "lastJobAt", "metadata", "createdAt", "updatedAt")
     VALUES
       ('rehearsal-worker-heartbeat', 'worker-rehearsal', 'RUNNING', $1, $1, $1, '{"node":"rehearsal"}'::jsonb, $1, $1)`,
    [now]
  );
  const saved = await client.query(`SELECT "status", "workerId", "metadata" FROM "WorkerHeartbeat" WHERE "id" = 'rehearsal-worker-heartbeat'`);
  if (saved.rows[0]?.status !== "RUNNING" || saved.rows[0]?.workerId !== "worker-rehearsal" || saved.rows[0]?.metadata?.node !== "rehearsal") {
    throw new Error("WorkerHeartbeat did not accept a durable heartbeat write.");
  }

  console.log(`Worker-heartbeat migration rehearsal passed in schema ${schemaName}.`);
} finally {
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
  await client.end().catch(() => undefined);
}
