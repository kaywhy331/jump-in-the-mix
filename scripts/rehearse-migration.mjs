import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const rootUrl = process.env.DATABASE_URL;
if (!rootUrl) throw new Error("DATABASE_URL is required for the migration rehearsal.");

const baselineSqlPath = "prisma/migrations/20260715000000_existing_mvp_baseline/migration.sql";
const rollbackPath = "prisma/migrations/20260716020000_prd_core_foundation/rollback.sql";
const baselineMigration = "20260715000000_existing_mvp_baseline";
const forwardMigration = "20260716020000_prd_core_foundation";
const mixTemplateMigration = "20260716170000_mix_template_library";
const supportMigration = "20260716210000_support_center";
const referralMigration = "20260717010000_referral_rewards";
const contactGroupActivationMigration = "20260717120000_contact_group_activation";
const accountDeletionWorkflowMigration = "20260718190000_account_deletion_workflow";
const productPlatformMigration = "20260904170000_product_platform";
const requiredMigrations = [
  baselineMigration,
  forwardMigration,
  mixTemplateMigration,
  supportMigration,
  referralMigration,
  contactGroupActivationMigration,
  accountDeletionWorkflowMigration,
  productPlatformMigration
];
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const schemaName = `jitm_rehearsal_${suffix}`;
const greenfieldSchemaName = `jitm_greenfield_${suffix}`;

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

async function tableExists(client, tableName, schema = schemaName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS "exists"`,
    [schema, tableName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(client, tableName, columnName, schema = schemaName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
     ) AS "exists"`,
    [schema, tableName, columnName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function indexExists(client, indexName, schema = schemaName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = $1 AND indexname = $2
     ) AS "exists"`,
    [schema, indexName]
  );
  return Boolean(result.rows[0]?.exists);
}

function assertRequiredMigrations(names, context) {
  const missing = requiredMigrations.filter((migration) => !names.includes(migration));
  if (missing.length) {
    throw new Error(`${context} did not finish required migrations ${missing.join(", ")}; received ${names.join(", ")}.`);
  }
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
    `INSERT INTO "WorkspaceProfile" ("workspaceId", "timezone", "quietHoursStart", "quietHoursEnd", "company", "createdAt", "updatedAt")
     VALUES ('legacy-workspace', 'America/Chicago', 1260, 420, 'Legacy Plumbing', $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "Contact" ("id", "workspaceId", "firstName", "displayName", "company", "publicNotes", "source", "createdAt", "updatedAt")
     VALUES ('legacy-contact', 'legacy-workspace', 'Jordan', 'Jordan Legacy', 'Legacy Co', 'Preserve this note', 'MANUAL', $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "Group" ("id", "workspaceId", "name", "description", "createdAt", "updatedAt")
     VALUES ('legacy-group', 'legacy-workspace', 'Legacy Group', 'Preserve this group', $1, $1)`,
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
  await client.query(
    `INSERT INTO "Jump" ("id", "workspaceId", "contactId", "mixId", "mixStepId", "stepVersionId", "scheduledAt", "status", "reason", "templateSnapshot", "renderedSnapshot", "uniquenessKey", "createdAt", "updatedAt")
     VALUES
       ('legacy-copied-jump', 'legacy-workspace', 'legacy-contact', 'legacy-mix', 'legacy-mix-step', 'legacy-version', $1, 'COPIED', 'Legacy copied', '{}'::jsonb, '{}'::jsonb, 'legacy-copied', $1, $1),
       ('legacy-sent-jump', 'legacy-workspace', 'legacy-contact', 'legacy-mix', 'legacy-mix-step', 'legacy-version', $1, 'SENT', 'Legacy sent', '{}'::jsonb, '{}'::jsonb, 'legacy-sent', $1, $1)`,
    [now]
  );
}

async function assertForwardState(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  for (const table of [
    "AuthRateLimit",
    "MixStop",
    "JumpActionEvent",
    "MixBroadcastSchedule",
    "AdminImpersonation",
    "SharedMixMetadata",
    "SharedMixContributorProfile",
    "SharedMixVote",
    "SharedMixImportMetadata",
    "SupportTicket",
    "SupportTicketMessage",
    "ReferralAccount",
    "Referral",
    "ReferralReward",
    "ContactGroupState",
    "AccountDeletionAudit",
    "AccountDeletionRevocation",
    "NotificationPreference",
    "PushSubscription",
    "NotificationDelivery",
    "AutomationPreference",
    "ReviewRequest"
  ]) {
    if (!(await tableExists(client, table))) throw new Error(`Expected migrated table ${table}.`);
  }
  for (const [table, column] of [["Contact", "privateNotes"], ["MixStep", "isActive"], ["MixStep", "updatedAt"]]) {
    if (!(await columnExists(client, table, column))) throw new Error(`Expected migrated column ${table}.${column}.`);
  }
  if (await indexExists(client, "MixStep_mixId_sortOrder_key")) throw new Error("Legacy MixStep uniqueness index should be removed.");
  if (!(await indexExists(client, "MixStep_mixId_isActive_sortOrder_idx"))) throw new Error("Active MixStep ordering index is missing.");
  if (!(await indexExists(client, "Contact_displayName_trgm_idx"))) throw new Error("Hosted contact search index is missing.");
  for (const column of ["timezone", "quietHoursStart", "quietHoursEnd"]) {
    if (await columnExists(client, "WorkspaceProfile", column)) throw new Error(`Duplicate WorkspaceProfile.${column} was not removed.`);
  }
  for (const column of ["nextReconcileAt", "lastReconciledAt"]) {
    if (!(await columnExists(client, "WorkspacePreference", column))) throw new Error(`WorkspacePreference.${column} is missing.`);
  }

  const contact = await client.query(`SELECT "displayName", "publicNotes", "privateNotes" FROM "Contact" WHERE "id" = 'legacy-contact'`);
  if (contact.rows[0]?.displayName !== "Jordan Legacy" || contact.rows[0]?.publicNotes !== "Preserve this note" || contact.rows[0]?.privateNotes !== null) {
    throw new Error("Legacy Contact data was not preserved through migration.");
  }
  const mixStep = await client.query(`SELECT "isActive", "updatedAt" FROM "MixStep" WHERE "id" = 'legacy-mix-step'`);
  if (mixStep.rows[0]?.isActive !== true || !(mixStep.rows[0]?.updatedAt instanceof Date)) {
    throw new Error("Legacy MixStep was not backfilled correctly.");
  }
  const displayPreference = await client.query(`SELECT "timezone" FROM "UserPreference" WHERE "userId" = 'legacy-user'`);
  const schedulePreference = await client.query(`SELECT "quietHoursStart", "quietHoursEnd" FROM "WorkspacePreference" WHERE "workspaceId" = 'legacy-workspace'`);
  if (displayPreference.rows[0]?.timezone !== "America/Chicago" || schedulePreference.rows[0]?.quietHoursStart !== 1260 || schedulePreference.rows[0]?.quietHoursEnd !== 420) {
    throw new Error("Legacy timezone and quiet-hour preferences were not preserved.");
  }
  const jumpStatuses = await client.query(`SELECT "id", "status"::text AS "status" FROM "Jump" WHERE "id" LIKE 'legacy-%-jump' ORDER BY "id"`);
  if (jumpStatuses.rows[0]?.status !== "PENDING" || jumpStatuses.rows[1]?.status !== "DONE") {
    throw new Error("Legacy Jump statuses were not consolidated.");
  }
  const migrations = await client.query(`SELECT "migration_name", "finished_at", "rolled_back_at" FROM "_prisma_migrations" ORDER BY "started_at"`);
  const names = migrations.rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name);
  assertRequiredMigrations(names, "Populated deployment");

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
  await client.query(
    `INSERT INTO "SupportTicket" ("id", "reference", "workspaceId", "requesterUserId", "title", "category", "priority", "status", "lastActivityAt", "createdAt", "updatedAt")
     VALUES ('rehearsal-ticket', 'JITM-REHEARSAL', 'legacy-workspace', 'legacy-user', 'Migration rehearsal ticket', 'GENERAL', 'NORMAL', 'OPEN', $1, $1, $1)
     ON CONFLICT ("reference") DO NOTHING`,
    [now]
  );
  await client.query(
    `INSERT INTO "SupportTicketMessage" ("id", "ticketId", "authorUserId", "authorType", "body", "emailStatus", "createdAt")
     VALUES ('rehearsal-ticket-message', 'rehearsal-ticket', 'legacy-user', 'USER', 'Migration rehearsal message', 'NOT_REQUESTED', $1)
     ON CONFLICT ("id") DO NOTHING`,
    [now]
  );
  const supportThread = await client.query(
    `SELECT t."reference", m."body"
     FROM "SupportTicket" t
     JOIN "SupportTicketMessage" m ON m."ticketId" = t."id"
     WHERE t."id" = 'rehearsal-ticket'`
  );
  if (supportThread.rows[0]?.reference !== "JITM-REHEARSAL" || supportThread.rows[0]?.body !== "Migration rehearsal message") {
    throw new Error("Support ticket migration did not accept a durable thread write.");
  }

  await client.query(
    `INSERT INTO "ReferralAccount" ("workspaceId", "code", "bankedDays", "createdAt", "updatedAt")
     VALUES ('legacy-workspace', 'LEGACYREF1', 30, $1, $1)
     ON CONFLICT ("workspaceId") DO NOTHING`,
    [now]
  );
  await client.query(
    `INSERT INTO "Referral" ("id", "codeUsed", "referrerWorkspaceId", "referredWorkspaceId", "status", "qualifiedAt", "createdAt", "updatedAt")
     VALUES ('rehearsal-referral', 'LEGACYREF1', 'legacy-workspace', 'rehearsal-friend-workspace', 'QUALIFIED', $1, $1, $1)
     ON CONFLICT ("id") DO NOTHING`,
    [now]
  );
  await client.query(
    `INSERT INTO "ReferralReward" ("id", "referralId", "workspaceId", "recipient", "days", "status", "appliedAt", "createdAt", "updatedAt")
     VALUES
       ('rehearsal-referrer-reward', 'rehearsal-referral', 'legacy-workspace', 'REFERRER', 30, 'BANKED', $1, $1, $1),
       ('rehearsal-friend-reward', 'rehearsal-referral', 'rehearsal-friend-workspace', 'REFERRED', 30, 'ACTIVE', $1, $1, $1)
     ON CONFLICT ("id") DO NOTHING`,
    [now]
  );
  const referralThread = await client.query(
    `SELECT a."code", r."status", COUNT(w."id")::int AS "rewardCount"
     FROM "ReferralAccount" a
     JOIN "Referral" r ON r."referrerWorkspaceId" = a."workspaceId"
     JOIN "ReferralReward" w ON w."referralId" = r."id"
     WHERE a."workspaceId" = 'legacy-workspace'
     GROUP BY a."code", r."status"`
  );
  if (referralThread.rows[0]?.code !== "LEGACYREF1" || referralThread.rows[0]?.status !== "QUALIFIED" || referralThread.rows[0]?.rewardCount !== 2) {
    throw new Error("Referral migration did not accept a qualified attribution and both reward records.");
  }

  await client.query(
    `INSERT INTO "ContactGroupState" ("groupId", "workspaceId", "isActive", "createdAt", "updatedAt")
     VALUES ('legacy-group', 'legacy-workspace', false, $1, $1)
     ON CONFLICT ("groupId") DO UPDATE SET "isActive" = EXCLUDED."isActive", "updatedAt" = EXCLUDED."updatedAt"`,
    [now]
  );
  const groupState = await client.query(
    `SELECT "workspaceId", "isActive" FROM "ContactGroupState" WHERE "groupId" = 'legacy-group'`
  );
  if (groupState.rows[0]?.workspaceId !== "legacy-workspace" || groupState.rows[0]?.isActive !== false) {
    throw new Error("Contact Group activation migration did not accept a durable inactive-state write.");
  }
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

async function assertGreenfieldState(client) {
  for (const table of [
    "User",
    "Workspace",
    "Contact",
    "Mix",
    "Jump",
    "AuthRateLimit",
    "AdminImpersonation",
    "SharedMixMetadata",
    "SupportTicket",
    "SupportTicketMessage",
    "ReferralAccount",
    "Referral",
    "ReferralReward",
    "ContactGroupState",
    "AccountDeletionAudit",
    "AccountDeletionRevocation",
    "NotificationPreference",
    "PushSubscription",
    "NotificationDelivery",
    "AutomationPreference",
    "ReviewRequest"
  ]) {
    if (!(await tableExists(client, table, greenfieldSchemaName))) {
      throw new Error(`Greenfield migration did not create ${table}.`);
    }
  }
  if (!(await columnExists(client, "Contact", "privateNotes", greenfieldSchemaName))) {
    throw new Error("Greenfield migration did not create Contact.privateNotes.");
  }
  if (await columnExists(client, "WorkspaceProfile", "timezone", greenfieldSchemaName)) {
    throw new Error("Greenfield migration retained duplicate WorkspaceProfile.timezone.");
  }
  if (!(await columnExists(client, "WorkspacePreference", "nextReconcileAt", greenfieldSchemaName))) {
    throw new Error("Greenfield migration did not create per-workspace reconciliation scheduling.");
  }
  const migrations = await client.query(
    `SELECT "migration_name", "finished_at", "rolled_back_at"
     FROM "${greenfieldSchemaName}"."_prisma_migrations"
     ORDER BY "started_at"`
  );
  const names = migrations.rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name);
  assertRequiredMigrations(names, "Greenfield deployment");
}

const databaseUrl = databaseUrlForSchema(schemaName);
const admin = new Client({ connectionString: pgConnectionUrl() });

try {
  await admin.connect();

  // Existing populated MVP database path.
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  await admin.query(`SET search_path TO "${schemaName}"`);
  await admin.query(readFileSync(baselineSqlPath, "utf8"));
  await seedLegacyDatabase(admin);
  runPrisma(["migrate", "resolve", "--applied", baselineMigration], databaseUrl);
  runPrisma(["migrate", "deploy"], databaseUrl);
  await assertForwardState(admin);

  await admin.query(`SET search_path TO "${schemaName}"`);
  await admin.query(readFileSync(rollbackPath, "utf8"));
  await assertRollbackState(admin);

  // Isolated rehearsal only: retain the applied baseline and remove the core
  // forward record so that guarded migration can be exercised a second time.
  // Later independent migrations remain applied and their data must survive.
  await admin.query(
    `DELETE FROM "${schemaName}"."_prisma_migrations" WHERE "migration_name" = $1`,
    [forwardMigration]
  );
  runPrisma(["migrate", "deploy"], databaseUrl);
  await assertForwardState(admin);

  // Clean database path proves the committed baseline and every forward
  // migration can provision the complete application without db push.
  await admin.query(`CREATE SCHEMA "${greenfieldSchemaName}"`);
  runPrisma(["migrate", "deploy"], databaseUrlForSchema(greenfieldSchemaName));
  await assertGreenfieldState(admin);

  console.log(`Migration rehearsal passed in populated schema ${schemaName} and clean schema ${greenfieldSchemaName}.`);
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
  await admin.query(`DROP SCHEMA IF EXISTS "${greenfieldSchemaName}" CASCADE`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
