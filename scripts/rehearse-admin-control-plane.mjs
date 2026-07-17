import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) throw new Error("DATABASE_URL is required for the admin control-plane migration rehearsal.");

const schemaName = `jitm_admin_control_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrationName = "20260717050000_admin_control_plane";

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
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(executable, ["prisma", ...args], {
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
       WHERE table_schema = $1 AND table_name = 'PlatformSetting'
     ) AS "exists"`,
    [schemaName]
  );
  if (!table.rows[0]?.exists) throw new Error("Admin control-plane migration did not create PlatformSetting.");

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
    `INSERT INTO "PlatformSetting"
       ("id", "key", "category", "label", "value", "isPublic", "createdAt", "updatedAt")
     VALUES
       ('rehearsal-platform-setting', 'feature.rehearsal', 'Feature flags', 'Rehearsal', 'true'::jsonb, false, $1, $1)`,
    [now]
  );
  const saved = await client.query(`SELECT "value", "isPublic" FROM "PlatformSetting" WHERE "key" = 'feature.rehearsal'`);
  if (saved.rows[0]?.value !== true || saved.rows[0]?.isPublic !== false) {
    throw new Error("PlatformSetting did not accept a durable JSON configuration write.");
  }

  console.log(`Admin control-plane migration rehearsal passed in schema ${schemaName}.`);
} finally {
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
  await client.end().catch(() => undefined);
}
