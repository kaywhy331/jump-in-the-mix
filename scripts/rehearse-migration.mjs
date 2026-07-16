import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) throw new Error("DATABASE_URL is required for the migration rehearsal.");

const artifactsDir = ".artifacts";
const legacySchemaPath = `${artifactsDir}/main-schema.prisma`;
const rollbackPath = "prisma/migrations/20260716020000_prd_core_foundation/rollback.sql";
const schemaName = `jitm_rehearsal_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

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

function ensureLegacySchemaSnapshot() {
  if (existsSync(legacySchemaPath)) return;
  mkdirSync(artifactsDir, { recursive: true });
  const executable = process.platform === "win32" ? "git.exe" : "git";
  const content = execFileSync(executable, ["show", "origin/main:prisma/schema.prisma"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  writeFileSync(legacySchemaPath, content, "utf8");
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS "exists"`,
    [schemaName, tableName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(client, tableName, columnName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
     ) AS "exists"`,
    [schemaName, tableName, columnName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function indexExists(client, indexName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = $1 AND indexname = $2
     ) AS "exists"`,
    [schemaName, indexName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function seedLegacyDatabase(client) {
  const now = new Date().toISOString();
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query(
    `INSERT INTO "User" ("id", "email", "passwordHash", "name", "emailVerifiedAt", "isPlatformAdmin", "createdAt", "updatedAt")
     VALUES ('legacy-user', 'legacy@example.com', 'test-only', 'Legacy Owner', $1, false, $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "planTier", "subscriptionStatus", "cancelAtPeriodEnd", "createdAt", "updatedAt")
     VALUES ('legacy-workspace', 'Legacy Workspace', 'legacy-workspace', 'legacy-user', 'PLUS', 'ACTIVE', false, $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
     VALUES ('legacy-membership', 'legacy-workspace', 'legacy-user', 'OWNER', $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "Contact" ("id", "workspaceId", "firstName", "displayName", "company", "publicNotes", "source", "createdAt", "updatedAt")
     VALUES ('legacy-contact', 'legacy-workspace', 'Jordan', 'Jordan Legacy', 'Legacy Co', 'Preserve this note', 'MANUAL', $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "StepTemplate" ("id", "workspaceId", "name", "channel", "isActive", "currentVersion", "createdAt", "updatedAt")
     VALUES ('legacy-template', 'legacy-workspace', 'Legacy SMS', 'SMS', true, 1, $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "StepVersion" ("id", "stepTemplateId", "version", "body", "longSms", "includeOptOut", "createdAt")
     VALUES ('legacy-version', 'legacy-template', 1, 'Hello {{First Name}}', false, false, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "Mix" ("id", "workspaceId", "name", "triggerMode", "status", "includeFutureGroupMembers", "source", "createdAt", "updatedAt")
     VALUES ('legacy-mix', 'legacy-workspace', 'Legacy Mix', 'MANUAL_START', 'ACTIVE', false, 'USER', $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "MixStep" ("id", "mixId", "stepVersionId", "dayOffset", "sortOrder", "createdAt")
     VALUES ('legacy-mix-step', 'legacy-mix', 'legacy-version', 0, 1, $1)`,
    [now]
  );
}

async function assertForwardState(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  for (const table of ["AuthRateLimit", "MixStop", "JumpActionEvent", "MixBroadcastSchedule", "AdminImpersonation"]) {
    if (!(await tableExists(client, table))) throw new Error(`Expected migrated table ${table}.`);
  }
  for (const [table, column] of [["Contact", "privateNotes"], ["MixStep", "isActive"], ["MixStep", "updatedAt"]]) {
    if (!(await columnExists(client, table, column))) throw new Error(`Expected migrated column ${table}.${column}.`);
  }
  if (await indexExists(client, "MixStep_mixId_sortOrder_key")) throw new Error("Legacy MixStep uniqueness index should be removed.");
  if (!(await indexExists(client, "MixStep_mixId_isActive_sortOrder_idx"))) throw new Error("Active MixStep ordering index is missing.");

  const contact = await client.query(`SELECT "displayName", "publicNotes", "privateNotes" FROM "Contact" WHERE "id" = 'legacy-contact'`);
  if (contact.rows[0]?.displayName !== "Jordan Legacy" || contact.rows[0]?.publicNotes !== "Preserve this note" || contact.rows[0]?.privateNotes !== null) {
    throw new Error("Legacy Contact data was not preserved through migration.");
  }
  const mixStep = await client.query(`SELECT "isActive", "updatedAt" FROM "MixStep" WHERE "id" = 'legacy-mix-step'`);
  if (mixStep.rows[0]?.isActive !== true || !(mixStep.rows[0]?.updatedAt instanceof Date)) {
    throw new Error("Legacy MixStep was not backfilled correctly.");
  }
  const migrations = await client.query(`SELECT "migration_name", "finished_at", "rolled_back_at" FROM "_prisma_migrations" ORDER BY "started_at"`);
  const names = migrations.rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name);
  if (!names.includes("20260715000000_existing_mvp_baseline") || !names.includes("20260716020000_prd_core_foundation")) {
    throw new Error(`Expected both migrations to finish; received ${names.join(", ")}.`);
  }

  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO "AuthRateLimit" ("id", "key", "scope", "attempts", "windowStartedAt", "createdAt", "updatedAt")
     VALUES ('rehearsal-rate-limit', 'hashed-key', 'migration.rehearsal', 1, $1, $1, $1)
     ON CONFLICT ("key") DO NOTHING`,
    [now]
  );
  await client.query(
    `INSERT INTO "AdminImpersonation" ("id", "tokenHash", "actorUserId", "targetUserId", "workspaceId", "reason", "expiresAt", "lastSeenAt", "createdAt")
     VALUES ('rehearsal-impersonation', 'hashed-token', 'legacy-user', 'legacy-user', 'legacy-workspace', 'Migration rehearsal only', $1, $2, $2)
     ON CONFLICT ("tokenHash") DO NOTHING`,
    [new Date(Date.now() + 60_000).toISOString(), now]
  );
}

async function assertRollbackState(client) {
  for (const table of ["AuthRateLimit", "MixStop", "JumpActionEvent", "MixBroadcastSchedule", "AdminImpersonation"]) {
    if (await tableExists(client, table)) throw new Error(`Rollback left table ${table} behind.`);
  }
  for (const [table, column] of [["Contact", "privateNotes"], ["MixStep", "isActive"], ["MixStep", "updatedAt"]]) {
    if (await columnExists(client, table, column)) throw new Error(`Rollback left column ${table}.${column} behind.`);
  }
  if (!(await indexExists(client, "MixStep_mixId_sortOrder_key"))) throw new Error("Rollback did not restore legacy MixStep uniqueness.");
  const contact = await client.query(`SELECT "displayName", "publicNotes" FROM "${schemaName}"."Contact" WHERE "id" = 'legacy-contact'`);
  if (contact.rows[0]?.displayName !== "Jordan Legacy" || contact.rows[0]?.publicNotes !== "Preserve this note") {
    throw new Error("Rollback did not preserve legacy Contact data.");
  }
}

ensureLegacySchemaSnapshot();
const databaseUrl = databaseUrlForSchema(schemaName);
const admin = new Client({ connectionString: pgConnectionUrl() });

try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  runPrisma(["db", "push", "--schema", legacySchemaPath, "--accept-data-loss"], databaseUrl);
  await seedLegacyDatabase(admin);

  runPrisma(["migrate", "deploy"], databaseUrl);
  await assertForwardState(admin);

  await admin.query(`SET search_path TO "${schemaName}"`);
  await admin.query(readFileSync(rollbackPath, "utf8"));
  await assertRollbackState(admin);

  await admin.query(
    `DELETE FROM "${schemaName}"."_prisma_migrations"
     WHERE "migration_name" IN ('20260715000000_existing_mvp_baseline', '20260716020000_prd_core_foundation')`
  );
  runPrisma(["migrate", "deploy"], databaseUrl);
  await assertForwardState(admin);

  console.log(`Migration rehearsal passed in schema ${schemaName}.`);
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}