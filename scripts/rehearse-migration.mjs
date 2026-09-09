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
const hostedAuthMigration = "20260904180000_hosted_auth";
const automaticDeliveryMigration = "20260904190000_automatic_delivery_and_reviews";
const dormantFeatureRetirementMigration = "20260904200000_retire_dormant_features";
const requiredMigrations = [
  baselineMigration,
  forwardMigration,
  mixTemplateMigration,
  supportMigration,
  referralMigration,
  contactGroupActivationMigration,
  accountDeletionWorkflowMigration,
  productPlatformMigration,
  hostedAuthMigration,
  automaticDeliveryMigration,
  dormantFeatureRetirementMigration,
  "20260908000000_referral_access_invites",
  "20260908120000_waitlist_waves",
  "20260908160000_staff_permissions",
  "20260908200000_invitation_preferences",
  "20260908230000_email_delivery_controls",
  "20260908233000_optional_email_preferences",
  "20260909000000_account_access_controls",
  "20260909010000_staff_invitations",
  "20260909020000_admission_controls",
  "20260909030000_library_revisions",
  "20260909031000_catalog_retirement_history",
  "20260909040000_system_mix_releases",
  "20260909050000_report_storage",
  "20260909051000_report_storage_observations",
  "20260909060000_support_case_scope",
  "20260909070000_email_suppression_review",
  "20260909080000_invitation_delivery_generations",
  "20260909090000_operational_alerts",
  "20260909100000_private_data_retention",
  "20260909110000_support_email_outbox",
  "20260909120000_import_crash_recovery",
  "20260909130000_workspace_history_erasure"
];
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const schemaName = `jitm_rehearsal_${suffix}`;
const greenfieldSchemaName = `jitm_greenfield_${suffix}`;
const retiredTables = [
  "IntegrationConnection",
  "ExternalContactLink",
  "SyncRun",
  "OAuthState",
  "MessagingIdentity",
  "ChannelLinkCode",
  "CaptureDraft",
  "AiMixDraft",
  "Subscription",
  "WebhookEvent",
  "ReferralAccount",
  "Referral",
  "ReferralReward",
  "AccountDeletionRevocation",
  "UserContactLayout",
  "SharedMixContributorProfile",
  "SharedMixVote"
];

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

async function columnIsNullable(client, tableName, columnName, schema = schemaName) {
  const result = await client.query(
    `SELECT is_nullable = 'YES' AS "nullable"
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, tableName, columnName]
  );
  return Boolean(result.rows[0]?.nullable);
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
    `INSERT INTO "User" ("id", "email", "passwordHash", "name", "emailVerifiedAt", "isPlatformAdmin", "createdAt", "updatedAt")
     VALUES ('legacy-admin', 'legacy-admin@example.test', 'test-only', 'Legacy Admin', $1, true, $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "planTier", "subscriptionStatus", "cancelAtPeriodEnd", "createdAt", "updatedAt")
     VALUES ('legacy-workspace', 'Legacy Workspace', 'legacy-workspace', 'legacy-user', 'PLUS', 'ACTIVE', false, $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
     VALUES ('legacy-membership', 'legacy-workspace', 'legacy-user', 'MEMBER', $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "WorkspaceProfile" ("workspaceId", "timezone", "quietHoursStart", "quietHoursEnd", "company", "createdAt", "updatedAt")
     VALUES ('legacy-workspace', 'America/Chicago', 1260, 420, 'Legacy Plumbing', $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "Contact" ("id", "workspaceId", "firstName", "displayName", "company", "publicNotes", "source", "createdAt", "updatedAt")
     VALUES ('legacy-contact', 'legacy-workspace', 'Jordan', 'Jordan Legacy', 'Legacy Co', 'Preserve this note', 'GOOGLE', $1, $1)`,
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
  await client.query(
    `INSERT INTO "SharedMix" ("id", "publisherWorkspaceId", "title", "description", "category", "durationDays", "steps", "status", "createdAt", "updatedAt")
     VALUES
       ('legacy-curated-plan', NULL, 'Curated plan', 'Preserve this curated ready-made plan.', 'General / Other', 0, '[]'::jsonb, 'APPROVED', $1, $1),
       ('legacy-community-plan', 'legacy-workspace', 'Community plan', 'Remove this retired community submission.', 'General / Other', 0, '[]'::jsonb, 'PENDING', $1, $1)`,
    [now]
  );
  await client.query(
    `INSERT INTO "SharedMixImport" ("id", "importKey", "workspaceId", "sharedMixId", "createdAt")
     VALUES ('legacy-community-import', 'legacy-community-import', 'legacy-workspace', 'legacy-community-plan', $1)`,
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
    "SharedMixImportMetadata",
    "SupportTicket",
    "SupportTicketMessage",
    "ContactGroupState",
    "AccountDeletionAudit",
    "NotificationPreference",
    "PushSubscription",
    "NotificationDelivery",
    "AutomationPreference",
    "ReviewRequest",
    "AuthIdentity",
    "AuthOAuthState",
    "AutomatedDelivery",
    "ReferralAccessInvite", "WaitlistEntry", "WaitlistWave", "WaitlistSchedule", "WaitlistDelivery", "WaitlistAudit",
    "StaffMembership", "StaffInvitation", "AdmissionPolicy", "SharedMixRevision", "SharedMixRelease", "SystemMixConfig", "SystemMixRevision", "SystemMixRelease", "PlatformAuditEvent", "EmailSuppression", "EmailMessage", "EmailSendAttempt", "EmailProviderEvent", "InvitationDeliveryHistory", "OperationsMonitor", "OperationsCheck", "OperationsNotice"
  ]) {
    if (!(await tableExists(client, table))) throw new Error(`Expected migrated table ${table}.`);
  }
  for (const table of retiredTables) {
    if (await tableExists(client, table)) throw new Error(`Retired table ${table} still exists.`);
  }
  for (const [table, column] of [["Contact", "privateNotes"], ["MixStep", "isActive"], ["MixStep", "updatedAt"], ["User", "suspendedAt"], ["User", "accessRevision"]]) {
    if (!(await columnExists(client, table, column))) throw new Error(`Expected migrated column ${table}.${column}.`);
  }
  if (!(await columnIsNullable(client, "User", "passwordHash"))) throw new Error("Hosted passwordless accounts require nullable User.passwordHash.");
  if (await indexExists(client, "MixStep_mixId_sortOrder_key")) throw new Error("Legacy MixStep uniqueness index should be removed.");
  if (!(await indexExists(client, "MixStep_mixId_isActive_sortOrder_idx"))) throw new Error("Active MixStep ordering index is missing.");
  if (!(await indexExists(client, "Contact_displayName_trgm_idx"))) throw new Error("Hosted contact search index is missing.");
  for (const column of ["timezone", "quietHoursStart", "quietHoursEnd"]) {
    if (await columnExists(client, "WorkspaceProfile", column)) throw new Error(`Duplicate WorkspaceProfile.${column} was not removed.`);
  }
  for (const column of ["nextReconcileAt", "lastReconciledAt"]) {
    if (!(await columnExists(client, "WorkspacePreference", column))) throw new Error(`WorkspacePreference.${column} is missing.`);
  }
  for (const column of ["planTier", "subscriptionStatus", "stripeCustomerId", "stripeSubscriptionId", "currentPeriodEnd", "cancelAtPeriodEnd"]) {
    if (await columnExists(client, "Workspace", column)) throw new Error(`Retired Workspace.${column} still exists.`);
  }
  for (const column of ["publisherWorkspaceId", "publisherMixId", "isPlatform", "voteCount", "reviewState", "reviewedAt", "reviewedByUserId", "moderationNote"]) {
    if (await columnExists(client, "SharedMixMetadata", column)) throw new Error(`Retired SharedMixMetadata.${column} still exists.`);
  }

  const admission = await client.query(`SELECT "accountCeiling", "outstandingCeiling", "redemptionPaused", "collectionPaused" FROM "AdmissionPolicy" WHERE id = 'default'`);
  if (admission.rowCount !== 1 || admission.rows[0].accountCeiling !== 0 || admission.rows[0].outstandingCeiling !== 0 || admission.rows[0].redemptionPaused || admission.rows[0].collectionPaused) {
    throw new Error("Admission upgrade must default closed to new grants while preserving collection and issued links.");
  }
  const preservedLibrary = await client.query(`SELECT s.id FROM "SharedMix" s JOIN "SharedMixMetadata" m ON m."sharedMixId" = s.id LEFT JOIN "SharedMixRevision" r ON r."sharedMixId" = s.id AND r.version = m."draftVersion" WHERE r.id IS NULL OR r.snapshot->'steps' IS DISTINCT FROM s.steps::jsonb`);
  if (preservedLibrary.rowCount) throw new Error("Library migration lost the current content snapshot.");
  const staff = await client.query(`SELECT "role"::text, "status"::text, "grants", "denies" FROM "StaffMembership" WHERE "userId" = 'legacy-admin'`);
  if (staff.rows[0]?.role !== "OPERATOR" || staff.rows[0]?.status !== "ACTIVE" || staff.rows[0]?.grants.length || staff.rows[0]?.denies.length) {
    throw new Error("Legacy administrator must migrate to Operator with no additional permissions.");
  }
  if ((await client.query(`SELECT 1 FROM "StaffMembership" WHERE "userId" = 'legacy-user' OR "role" = 'OWNER'`)).rowCount) {
    throw new Error("Migration inferred staff or Owner access.");
  }
  if (!(await columnExists(client, "WaitlistEntry", "withdrawnAt"))) throw new Error("Waitlist withdrawal timestamp is missing.");
  if (!(await columnIsNullable(client, "ReferralAccessInvite", "inviterUserId"))) throw new Error("Platform grants must not consume a member's invitation allowance.");

  const contact = await client.query(`SELECT "displayName", "publicNotes", "privateNotes", "source"::text AS "source" FROM "Contact" WHERE "id" = 'legacy-contact'`);
  if (contact.rows[0]?.displayName !== "Jordan Legacy" || contact.rows[0]?.publicNotes !== "Preserve this note" || contact.rows[0]?.privateNotes !== null || contact.rows[0]?.source !== "MANUAL") {
    throw new Error("Legacy Contact data was not preserved through migration.");
  }
  const membership = await client.query(`SELECT "role"::text AS "role" FROM "WorkspaceMember" WHERE "id" = 'legacy-membership'`);
  if (membership.rows[0]?.role !== "OWNER") throw new Error("Legacy workspace role was not consolidated to owner.");
  const curatedPlan = await client.query(`SELECT "title" FROM "SharedMix" WHERE "id" = 'legacy-curated-plan'`);
  if (curatedPlan.rows[0]?.title !== "Curated plan") throw new Error("Curated ready-made plan was not preserved.");
  if ((await client.query(`SELECT 1 FROM "SharedMix" WHERE "id" = 'legacy-community-plan'`)).rowCount) {
    throw new Error("Retired community plan was not removed.");
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
    "ContactGroupState",
    "AccountDeletionAudit",
    "NotificationPreference",
    "PushSubscription",
    "NotificationDelivery",
    "AutomationPreference",
    "ReviewRequest",
    "AuthIdentity",
    "AuthOAuthState",
    "AutomatedDelivery",
    "ReferralAccessInvite", "WaitlistEntry", "WaitlistWave", "WaitlistSchedule", "WaitlistDelivery", "WaitlistAudit",
    "StaffMembership", "StaffInvitation", "AdmissionPolicy", "SharedMixRevision", "SharedMixRelease", "SystemMixConfig", "SystemMixRevision", "SystemMixRelease", "PlatformAuditEvent", "EmailSuppression", "EmailMessage", "EmailSendAttempt", "EmailProviderEvent", "InvitationDeliveryHistory", "OperationsMonitor", "OperationsCheck", "OperationsNotice"
  ]) {
    if (!(await tableExists(client, table, greenfieldSchemaName))) {
      throw new Error(`Greenfield migration did not create ${table}.`);
    }
  }
  for (const table of retiredTables) {
    if (await tableExists(client, table, greenfieldSchemaName)) {
      throw new Error(`Greenfield migration retained retired table ${table}.`);
    }
  }
  if (!(await columnExists(client, "Contact", "privateNotes", greenfieldSchemaName))) {
    throw new Error("Greenfield migration did not create Contact.privateNotes.");
  }
  if (!(await columnIsNullable(client, "User", "passwordHash", greenfieldSchemaName))) {
    throw new Error("Greenfield migration did not permit passwordless accounts.");
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

async function rehearseSystemMixUpgrade(client) {
  // Disposable schema only: reconstruct the immediately preceding schema and
  // prove an already-prepared invitation survives this additive upgrade.
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query("BEGIN");
  try {
    await client.query('DROP TABLE "SystemMixRelease", "SystemMixRevision", "SystemMixConfig"');
    await client.query('ALTER TABLE "ReferralAccessInvite" DROP COLUMN "systemMixVersion"');
    await client.query(`INSERT INTO "ReferralAccessInvite" (id, "recipientEmail", "tokenHash", "tokenCiphertext") VALUES ('system-upgrade-invite', 'migration@example.test', 'migration-token-hash', 'preserved-token-ciphertext')`);
    await client.query(`INSERT INTO "WaitlistDelivery" (id, "inviteId", "messageCiphertext", "updatedAt") VALUES ('system-upgrade-delivery', 'system-upgrade-invite', 'preserved-frozen-payload', CURRENT_TIMESTAMP)`);
    await client.query(readFileSync("prisma/migrations/20260909040000_system_mix_releases/migration.sql", "utf8"));
    const result = await client.query(`SELECT i."systemMixVersion", i."tokenCiphertext", d."messageCiphertext", d.status::text FROM "ReferralAccessInvite" i JOIN "WaitlistDelivery" d ON d."inviteId" = i.id WHERE i.id = 'system-upgrade-invite'`);
    const row = result.rows[0];
    if (!row || row.systemMixVersion !== null || row.tokenCiphertext !== "preserved-token-ciphertext" || row.messageCiphertext !== "preserved-frozen-payload" || row.status !== "QUEUED") throw new Error("System Mix upgrade changed a previously frozen invitation.");
    const baseline = await client.query(`SELECT r.subject, c."publishedVersion" FROM "SystemMixConfig" c JOIN "SystemMixRevision" r ON r."systemMixId" = c.id AND r.version = c."publishedVersion" WHERE c.id = 'referral'`);
    if (baseline.rows[0]?.publishedVersion !== 1 || baseline.rows[0]?.subject !== "{{Sender Name}} invited you to Jump in the Mix") throw new Error("System Mix migration did not install the existing wording baseline.");
    await client.query(`DELETE FROM "ReferralAccessInvite" WHERE id = 'system-upgrade-invite'`);
    await client.query("COMMIT");
    console.log("System Mix upgrade preserved an existing frozen invitation and its access token.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function rehearseReportStorageUpgrade(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query("BEGIN");
  try {
    const baseline = await client.query(`SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Contact") AS contacts, (SELECT count(*) FROM "Jump") AS jumps`);
    await client.query('DROP TABLE "ReportExport", "ReportDailySnapshot", "ReportSchedule"');
    await client.query(readFileSync("prisma/migrations/20260909050000_report_storage/migration.sql", "utf8"));
    const after = await client.query(`SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Contact") AS contacts, (SELECT count(*) FROM "Jump") AS jumps`);
    if (JSON.stringify(baseline.rows) !== JSON.stringify(after.rows)) throw new Error("Report storage migration changed customer row counts.");
    await client.query(`INSERT INTO "Session" (id,"userId","tokenHash","expiresAt") VALUES ('report-session','legacy-user','report-session-token',CURRENT_TIMESTAMP+interval '1 day')`);
    await client.query(`INSERT INTO "ReportExport" (id,"actorUserId","actorSessionId","requestKey","fromDay","throughDay","expiresAt","updatedAt") VALUES ('report-export','legacy-user','report-session','request','2026-01-01','2026-01-31',CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP)`);
    await client.query("SAVEPOINT invalid_report");
    try {
      await client.query(`UPDATE "ReportExport" SET status='READY' WHERE id='report-export'`);
      throw new Error("Database accepted a ready report without encrypted content.");
    } catch (error) { if (error.code !== "23514") throw error; await client.query("ROLLBACK TO SAVEPOINT invalid_report"); }
    await client.query(`DELETE FROM "Session" WHERE id='report-session'`);
    if ((await client.query(`SELECT id FROM "ReportExport" WHERE id='report-export'`)).rowCount) throw new Error("Deleting a session retained its report content.");
    await client.query("ROLLBACK");
    console.log("Report storage upgrade preserved customer rows and enforced ready-state/session-cascade constraints.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function rehearseSupportCaseUpgrade(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query("BEGIN");
  try {
    await client.query('ALTER TABLE "AdminImpersonation" DROP COLUMN "ticketId", DROP COLUMN "actorSessionId"');
    await client.query('ALTER TABLE "SupportTicket" DROP COLUMN "assignedToUserId", DROP COLUMN "assignmentRevision"');
    await client.query(`INSERT INTO "SupportTicket" (id, reference, "workspaceId", "requesterUserId", title, category, "updatedAt") VALUES ('case-upgrade', 'CASE-UPGRADE', 'legacy-workspace', 'legacy-user', 'Existing request', 'GENERAL', CURRENT_TIMESTAMP)`);
    await client.query(`INSERT INTO "SupportTicketMessage" (id,"ticketId","authorUserId","authorType",body) VALUES ('case-message','case-upgrade','legacy-user','USER','Preserve this private conversation')`);
    await client.query(`INSERT INTO "AdminImpersonation" (id,"tokenHash","actorUserId","targetUserId","workspaceId",reason,"expiresAt") VALUES ('case-old-view','case-old-hash','legacy-user','legacy-user','legacy-workspace','Existing view without a proven case',CURRENT_TIMESTAMP+interval '1 hour')`);
    await client.query(readFileSync("prisma/migrations/20260909060000_support_case_scope/migration.sql", "utf8"));
    const view = (await client.query(`SELECT "endedAt", "ticketId", "actorSessionId" FROM "AdminImpersonation" WHERE id='case-old-view'`)).rows[0];
    const ticket = (await client.query(`SELECT "assignedToUserId", "assignmentRevision", m.body FROM "SupportTicket" t JOIN "SupportTicketMessage" m ON m."ticketId"=t.id WHERE t.id='case-upgrade'`)).rows[0];
    if (!view.endedAt || view.ticketId !== null || view.actorSessionId !== null || ticket.assignedToUserId !== null || ticket.assignmentRevision !== 0 || ticket.body !== 'Preserve this private conversation') throw new Error("Support upgrade failed to preserve the thread or invalidate unscoped access.");
    await client.query("ROLLBACK");
    console.log("Support case upgrade preserved private threads and ended legacy unscoped views.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function rehearseSuppressionReviewUpgrade(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query("BEGIN");
  try {
    await client.query('ALTER TABLE "EmailSuppression" DROP COLUMN revision, DROP COLUMN "lastTriggeredAt", DROP COLUMN "clearedAt"');
    await client.query(`INSERT INTO "EmailSuppression" (id,email,reason) VALUES ('suppression-upgrade','suppression-upgrade@example.test','HARD_BOUNCE'), ('optout-upgrade','optout-upgrade@example.test','INVITATION_OPTOUT')`);
    await client.query(readFileSync("prisma/migrations/20260909070000_email_suppression_review/migration.sql", "utf8"));
    const row = (await client.query(`SELECT reason::text,revision,"clearedAt","lastTriggeredAt" FROM "EmailSuppression" WHERE id='suppression-upgrade'`)).rows[0];
    if (row.reason !== 'HARD_BOUNCE' || row.revision !== 1 || row.clearedAt !== null || row.lastTriggeredAt !== null) throw new Error("Suppression upgrade changed an existing recipient block.");
    await client.query("SAVEPOINT invalid_clearance");
    try {
      await client.query(`UPDATE "EmailSuppression" SET "clearedAt"=CURRENT_TIMESTAMP WHERE id='optout-upgrade'`);
      throw new Error("Database accepted an administrator clearance of recipient opt-out.");
    } catch (error) { if (error.code !== "23514") throw error; await client.query("ROLLBACK TO SAVEPOINT invalid_clearance"); }
    await client.query("ROLLBACK");
    console.log("Suppression review upgrade preserved active blocks and prevents clearing recipient opt-out.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function rehearseInvitationGenerationUpgrade(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query("BEGIN");
  try {
    await client.query('DROP TABLE "InvitationDeliveryHistory"');
    await client.query('ALTER TABLE "WaitlistDelivery" DROP COLUMN generation, DROP COLUMN "generationStartedAt"');
    await client.query(`INSERT INTO "ReferralAccessInvite" (id,"recipientEmail","tokenHash","tokenCiphertext") VALUES ('repeat-upgrade-invite','repeat-upgrade@example.test','repeat-upgrade-hash','preserved-grant-ciphertext')`);
    await client.query(`INSERT INTO "WaitlistDelivery" (id,"inviteId","messageCiphertext",status,attempts,"firstAttemptAt","createdAt","updatedAt") VALUES ('repeat-upgrade-delivery','repeat-upgrade-invite','preserved-message-ciphertext','REVIEW',8,'2026-09-01','2026-08-31','2026-09-03')`);
    const original = (await client.query(`SELECT "firstAttemptAt" FROM "WaitlistDelivery" WHERE id='repeat-upgrade-delivery'`)).rows[0];
    await client.query(readFileSync("prisma/migrations/20260909080000_invitation_delivery_generations/migration.sql", "utf8"));
    const row = (await client.query(`SELECT generation,"generationStartedAt","createdAt",status::text,attempts,"messageCiphertext","firstAttemptAt" FROM "WaitlistDelivery" WHERE id='repeat-upgrade-delivery'`)).rows[0];
    if (row.generation !== 1 || row.generationStartedAt.getTime() !== row.createdAt.getTime() || row.status !== 'REVIEW' || row.attempts !== 8 || row.messageCiphertext !== 'preserved-message-ciphertext' || row.firstAttemptAt.getTime() !== original.firstAttemptAt.getTime()) throw new Error("Invitation generation upgrade changed original delivery evidence.");
    await client.query("SAVEPOINT invalid_generation");
    try {
      await client.query(`UPDATE "WaitlistDelivery" SET generation=0 WHERE id='repeat-upgrade-delivery'`);
      throw new Error("Database accepted an invalid delivery generation.");
    } catch (error) { if (error.code !== "23514") throw error; await client.query("ROLLBACK TO SAVEPOINT invalid_generation"); }
    await client.query("ROLLBACK");
    console.log("Invitation generation upgrade preserved frozen content, original clocks and review state.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function rehearseSupportEmailUpgrade(client) {
  await client.query("BEGIN");
  try {
    await client.query('DROP TABLE "SupportEmailDelivery"');
    await client.query('DROP TYPE "SupportEmailDeliveryStatus"');
    await client.query('ALTER TABLE "SupportTicketMessage" DROP COLUMN "requestKey"');
    const ticket = (await client.query('SELECT id FROM "SupportTicket" LIMIT 1')).rows[0].id;
    for (const status of ['PENDING', 'FAILED', 'PREVIEWED', 'SENT']) {
      await client.query(`INSERT INTO "SupportTicketMessage" (id,"ticketId","authorUserId","authorType",body,"emailStatus","emailProviderId") VALUES ($1,$2,'legacy-admin','ADMIN','Preserved private reply',$3,'preserved-provider')`, ['support-upgrade-' + status, ticket, status]);
    }
    await client.query(readFileSync("prisma/migrations/20260909110000_support_email_outbox/migration.sql", "utf8"));
    const rows = (await client.query(`SELECT d.status::text, d."messageCiphertext", d."leaseId", m.body, m."emailProviderId" FROM "SupportEmailDelivery" d JOIN "SupportTicketMessage" m ON m.id=d."messageId" WHERE m.id LIKE 'support-upgrade-%'`)).rows;
    if (rows.length !== 3 || rows.some(row => row.status !== 'REVIEW' || row.messageCiphertext !== '' || row.leaseId || row.body !== 'Preserved private reply' || row.emailProviderId !== 'preserved-provider')) throw new Error("Support upgrade replayed or changed a legacy notification.");
    for (const statement of [
      `UPDATE "SupportEmailDelivery" SET status='QUEUED' WHERE "messageId"='support-upgrade-PENDING'`,
      `UPDATE "SupportEmailDelivery" SET status='SENDING', "messageCiphertext"='frozen' WHERE "messageId"='support-upgrade-PENDING'`,
      `UPDATE "SupportEmailDelivery" SET generation=0 WHERE "messageId"='support-upgrade-PENDING'`
    ]) {
      await client.query("SAVEPOINT invalid_support_delivery");
      try { await client.query(statement); throw new Error("Database accepted an invalid support delivery."); }
      catch (error) { if (error.code !== "23514") throw error; await client.query("ROLLBACK TO SAVEPOINT invalid_support_delivery"); }
    }
    console.log("Support notification upgrade preserved conversation and provider facts, held legacy sends for review, and enforced lease/content invariants.");
  } finally { await client.query("ROLLBACK"); }
}

async function rehearsePrivateRetentionUpgrade(client) {
  await client.query("BEGIN");
  try {
    await client.query('DROP TABLE "DataRetentionState"');
    await client.query('ALTER TABLE "EmailMessage" DROP CONSTRAINT "EmailMessage_retired_details_check", DROP COLUMN "detailsRetiredAt", ALTER COLUMN "recipientHash" SET NOT NULL');
    await client.query('ALTER TABLE "EmailProviderEvent" DROP CONSTRAINT "EmailProviderEvent_retired_details_check", DROP COLUMN "detailsRetiredAt"');
    await client.query('ALTER TABLE "WaitlistDelivery" DROP CONSTRAINT "WaitlistDelivery_purged_payload_check", DROP COLUMN "payloadPurgedAt"');
    await client.query('ALTER TABLE "ReferralAccessInvite" DROP CONSTRAINT "ReferralAccessInvite_purged_token_check", DROP COLUMN "tokenPurgedAt"');
    await client.query('DROP INDEX "SupportTicket_status_lastActivityAt_idx"');
    await client.query(`INSERT INTO "ReferralAccessInvite" (id,"recipientEmail","tokenHash","tokenCiphertext") VALUES ('retention-upgrade-invite','retention-upgrade@example.test','retention-upgrade-hash','preserved-token')`);
    await client.query(`INSERT INTO "EmailMessage" (id,"recipientHash","payloadHash",category,"firstAttemptAt","createdAt") VALUES ('retention-upgrade-message','preserved-recipient-hash','preserved-payload-hash','INVITATION','2020-01-01','2020-01-01')`);
    await client.query(`INSERT INTO "WaitlistDelivery" (id,"inviteId","emailMessageId","messageCiphertext",status,attempts,generation,"firstAttemptAt","updatedAt") VALUES ('retention-upgrade-delivery','retention-upgrade-invite','retention-upgrade-message','preserved-private-message','REVIEW',8,2,'2020-01-01',CURRENT_TIMESTAMP)`);
    await client.query(`INSERT INTO "EmailProviderEvent" (id,type,"providerId","recipientHashes","occurredAt") VALUES ('retention-upgrade-event','email.delivered','preserved-provider-id',ARRAY['preserved-recipient-hash'],'2020-01-02')`);
    const originalAttempt = (await client.query(`SELECT "firstAttemptAt" FROM "EmailMessage" WHERE id='retention-upgrade-message'`)).rows[0].firstAttemptAt;
    await client.query(readFileSync("prisma/migrations/20260909100000_private_data_retention/migration.sql", "utf8"));
    const message = (await client.query(`SELECT "recipientHash","payloadHash","detailsRetiredAt","firstAttemptAt" FROM "EmailMessage" WHERE id='retention-upgrade-message'`)).rows[0];
    const delivery = (await client.query(`SELECT "messageCiphertext","payloadPurgedAt",status::text,attempts,generation FROM "WaitlistDelivery" WHERE id='retention-upgrade-delivery'`)).rows[0];
    if (message.recipientHash !== 'preserved-recipient-hash' || message.payloadHash !== 'preserved-payload-hash' || message.detailsRetiredAt || message.firstAttemptAt.getTime() !== originalAttempt.getTime() || delivery.messageCiphertext !== 'preserved-private-message' || delivery.payloadPurgedAt || delivery.status !== 'REVIEW' || delivery.attempts !== 8 || delivery.generation !== 2) throw new Error("Retention migration altered existing private content, delivery evidence or retry clocks.");
    if ((await client.query('SELECT count(*)::int AS count FROM "DataRetentionState"')).rows[0].count !== 0) throw new Error("Retention migration fabricated a successful cleanup checkpoint.");
    for (const statement of [
      `UPDATE "EmailMessage" SET "detailsRetiredAt"=CURRENT_TIMESTAMP WHERE id='retention-upgrade-message'`,
      `UPDATE "EmailProviderEvent" SET "detailsRetiredAt"=CURRENT_TIMESTAMP WHERE id='retention-upgrade-event'`,
      `UPDATE "WaitlistDelivery" SET "payloadPurgedAt"=CURRENT_TIMESTAMP WHERE id='retention-upgrade-delivery'`,
      `UPDATE "ReferralAccessInvite" SET "tokenPurgedAt"=CURRENT_TIMESTAMP WHERE id='retention-upgrade-invite'`
    ]) {
      await client.query("SAVEPOINT invalid_retention");
      try { await client.query(statement); throw new Error("Database accepted an inconsistent retention marker."); }
      catch (error) { if (error.code !== "23514") throw error; await client.query("ROLLBACK TO SAVEPOINT invalid_retention"); }
    }
    console.log("Private retention upgrade preserved frozen content and retry clocks, seeded no success, and rejected inconsistent tombstones.");
  } finally { await client.query("ROLLBACK"); }
}

async function rehearseOperationalAlertsUpgrade(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query("BEGIN");
  try {
    await client.query('DROP TABLE "OperationsNotice", "OperationsCheck", "OperationsMonitor"');
    await client.query(`INSERT INTO "ReferralAccessInvite" (id,"recipientEmail","tokenHash","tokenCiphertext") VALUES ('ops-upgrade-invite','ops-upgrade@example.test','ops-upgrade-hash','preserved-access-ciphertext')`);
    await client.query(`INSERT INTO "WaitlistDelivery" (id,"inviteId","messageCiphertext",status,attempts,generation,"updatedAt") VALUES ('ops-upgrade-delivery','ops-upgrade-invite','preserved-invitation','REVIEW',8,2,CURRENT_TIMESTAMP)`);
    await client.query(readFileSync("prisma/migrations/20260909090000_operational_alerts/migration.sql", "utf8"));
    const row = (await client.query(`SELECT generation,status::text,attempts,"messageCiphertext" FROM "WaitlistDelivery" WHERE id='ops-upgrade-delivery'`)).rows[0];
    const count = (await client.query('SELECT count(*)::int AS count FROM "OperationsCheck"')).rows[0].count;
    if (count !== 0 || row.generation !== 2 || row.status !== 'REVIEW' || row.attempts !== 8 || row.messageCiphertext !== 'preserved-invitation') throw new Error("Operational alerts upgrade changed an invitation or fabricated health evidence.");
    await client.query("SAVEPOINT invalid_ops_state");
    try {
      await client.query(`INSERT INTO "OperationsCheck" (code,state,evidence,"observedAt","changedAt") VALUES ('test','UNVERIFIED_SUCCESS','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
      throw new Error("Database accepted an unsupported operational state.");
    } catch (error) { if (error.code !== "23514") throw error; await client.query("ROLLBACK TO SAVEPOINT invalid_ops_state"); }
    await client.query("ROLLBACK");
    console.log("Operational alerts upgrade preserved invitations and requires actual health observations.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function rehearseWorkspaceErasureUpgrade(client) {
  await client.query(`SET search_path TO "${schemaName}"`);
  await client.query("BEGIN");
  const tables = ["ContactGroupState", "JumpActionEvent", "MixBroadcastSchedule", "MixStop"];
  try {
    for (const table of tables) await client.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${table}_workspaceId_fkey"`);
    await client.query(`INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ('erasure-workspace','Erasure fixture','erasure-fixture','legacy-user',now())`);
    for (const workspace of ['erasure-workspace', 'already-deleted-workspace']) {
      await client.query('INSERT INTO "ContactGroupState" ("groupId","workspaceId","updatedAt") VALUES ($1,$2,now())', [`erasure-group-${workspace}`, workspace]);
      await client.query(`INSERT INTO "JumpActionEvent" (id,"workspaceId","jumpId",action,metadata) VALUES ($1,$2,$3,'OPENED','{"note":"Preserve valid fixture"}')`, [`erasure-event-${workspace}`, workspace, `jump-${workspace}`]);
      await client.query('INSERT INTO "MixBroadcastSchedule" (id,"workspaceId","mixId","localDate","timeMinutes",timezone,"updatedAt") VALUES ($1,$2,$3,now(),600,$4,now())', [`erasure-broadcast-${workspace}`, workspace, `mix-${workspace}`, 'UTC']);
      await client.query('INSERT INTO "MixStop" (id,"workspaceId","mixId","contactId",reason,"updatedAt") VALUES ($1,$2,$3,$4,$5,now())', [`erasure-stop-${workspace}`, workspace, `mix-${workspace}`, `contact-${workspace}`, 'Preserve valid fixture']);
    }
    const sql = readFileSync('prisma/migrations/20260909130000_workspace_history_erasure/migration.sql', 'utf8').replace(/^BEGIN;|^COMMIT;/gm, '');
    await client.query(sql);
    for (const table of tables) {
      const result = await client.query(`SELECT "workspaceId" FROM "${table}" WHERE "workspaceId" IN ('erasure-workspace','already-deleted-workspace')`);
      if (result.rows.length !== 1 || result.rows[0].workspaceId !== 'erasure-workspace') throw new Error('Workspace erasure upgrade did not preserve the owned fixture and remove its orphan.');
    }
    await client.query(`DELETE FROM "Workspace" WHERE id='erasure-workspace'`);
    for (const table of tables) if ((await client.query(`SELECT 1 FROM "${table}" WHERE "workspaceId"='erasure-workspace'`)).rowCount) throw new Error('Workspace deletion left legacy history behind.');
    await client.query('SAVEPOINT late_erasure_write');
    try {
      await client.query(`INSERT INTO "ContactGroupState" ("groupId","workspaceId","updatedAt") VALUES ('late-erasure-write','erasure-workspace',now())`);
      throw new Error('A late write recreated erased workspace history.');
    } catch (error) { if (error.code !== '23503') throw error; await client.query('ROLLBACK TO SAVEPOINT late_erasure_write'); }
    await client.query('ROLLBACK');
    console.log('Workspace erasure upgrade preserved owned history, removed only orphaned history, cascaded deletion and rejected a late write.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
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
  await rehearseWorkspaceErasureUpgrade(admin);
  // Exercise the current upgrade before the historical core rollback drops its
  // original impersonation table. Later migration records survive that rehearsal.
  await rehearseSupportEmailUpgrade(admin);
  await rehearsePrivateRetentionUpgrade(admin);
  await rehearseSupportCaseUpgrade(admin);

  await admin.query(`SET search_path TO "${schemaName}"`);
  await admin.query(readFileSync(rollbackPath, "utf8"));
  await assertRollbackState(admin);
  // The historical rollback drops three workflow tables. Rewind the dependent
  // erasure migration too, in this disposable schema only, before rebuilding.
  await admin.query('ALTER TABLE "ContactGroupState" DROP CONSTRAINT "ContactGroupState_workspaceId_fkey"');

  // Isolated rehearsal only: retain the applied baseline and remove the core
  // forward record so that guarded migration can be exercised a second time.
  // Later independent migrations remain applied and their data must survive.
  await admin.query(
    `DELETE FROM "${schemaName}"."_prisma_migrations" WHERE "migration_name" IN ($1,$2)`,
    [forwardMigration, "20260909130000_workspace_history_erasure"]
  );
  runPrisma(["migrate", "deploy"], databaseUrl);
  await assertForwardState(admin);

  // Clean database path proves the committed baseline and every forward
  // migration can provision the complete application without db push.
  await rehearseSystemMixUpgrade(admin);
  await rehearseReportStorageUpgrade(admin);
  await rehearseSuppressionReviewUpgrade(admin);
  await rehearseInvitationGenerationUpgrade(admin);
  await rehearseOperationalAlertsUpgrade(admin);
  await admin.query(`CREATE SCHEMA "${greenfieldSchemaName}"`);
  runPrisma(["migrate", "deploy"], databaseUrlForSchema(greenfieldSchemaName));
  await assertGreenfieldState(admin);

  console.log(`Migration rehearsal passed in populated schema ${schemaName} and clean schema ${greenfieldSchemaName}.`);
} finally {
  await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
  await admin.query(`DROP SCHEMA IF EXISTS "${greenfieldSchemaName}" CASCADE`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
