import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) throw new Error("DATABASE_URL is required for the administrator MFA migration rehearsal.");

const schemaName = `jitm_admin_mfa_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrationName = "20260717070000_admin_mfa";

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

  for (const tableName of ["AdminMfaCredential", "AdminMfaSession"]) {
    const table = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2
       ) AS "exists"`,
      [schemaName, tableName]
    );
    if (!table.rows[0]?.exists) throw new Error(`Administrator MFA migration did not create ${tableName}.`);
  }

  const migration = await client.query(
    `SELECT "finished_at", "rolled_back_at"
     FROM "${schemaName}"."_prisma_migrations"
     WHERE "migration_name" = $1`,
    [migrationName]
  );
  if (!migration.rows[0]?.finished_at || migration.rows[0]?.rolled_back_at) {
    throw new Error(`Migration ${migrationName} was not applied successfully.`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query(
    `INSERT INTO "AdminMfaCredential"
       ("userId", "secretCiphertext", "recoveryCodeHashes", "enabledAt", "lastUsedCounter", "createdAt", "updatedAt")
     VALUES
       ('rehearsal-admin', 'encrypted-secret', ARRAY['recovery-hash'], $1, 12345, $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "AdminMfaSession"
       ("sessionId", "userId", "verifiedAt", "expiresAt", "createdAt")
     VALUES
       ('rehearsal-admin-session', 'rehearsal-admin', $1, $2, $1)`,
    [now, expiresAt]
  );

  const saved = await client.query(
    `SELECT c."lastUsedCounter", cardinality(c."recoveryCodeHashes") AS "recoveryCount", s."expiresAt"
     FROM "AdminMfaCredential" c
     JOIN "AdminMfaSession" s ON s."userId" = c."userId"
     WHERE c."userId" = 'rehearsal-admin'`
  );
  if (saved.rows[0]?.lastUsedCounter !== 12345 || saved.rows[0]?.recoveryCount !== 1 || !(saved.rows[0]?.expiresAt instanceof Date)) {
    throw new Error("Administrator MFA migration did not accept durable credential and step-up writes.");
  }

  console.log(`Administrator MFA migration rehearsal passed in schema ${schemaName}.`);
} finally {
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
  await client.end().catch(() => undefined);
}
