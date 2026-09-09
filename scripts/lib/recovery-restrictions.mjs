import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Client } from "pg";
import { parseBackupKey } from "./backup-archive.mjs";
import { postgresCliUrl, quoteIdentifier } from "./postgres-ops.mjs";
import { captureRecoveryState, captureRecoveryStateInTransaction, compareRecoveryState, recoveryIdentitySql, recoveryStateDigest, recoveryTargetDigest } from "./recovery-state.mjs";
import { readRecoveryHold, writeRecoveryHold } from "./recovery-hold.mjs";
import { schemaRelease } from "../generate-schema-release.mjs";

const TTL = 30 * 60_000;
const HASH = /^[a-f0-9]{64}$/;
const PURPOSE = "jitm.recovery-restrictions-plan";
const REAUTH_TABLES = ["AdminImpersonation", "AdminMfaSession", "AdminMfaCredential", "AuthOAuthState", "AuthIdentity", "VerificationToken", "PushSubscription", "Session", "CalendarPreference"];
const textIdHash = id => createHash("sha256").update(`{"id": ${JSON.stringify(id)}}`).digest("hex");
const rows = (state, table) => state.tables[table].rows;
const byKey = (state, table) => new Map(rows(state, table).map(row => [row.key, row]));
const mac = (plan, key) => {
  const { authentication: _, ...payload } = plan;
  const derived = createHmac("sha256", parseBackupKey(key)).update("jitm.recovery.restrictions.v1").digest();
  return createHmac("sha256", derived).update(recoveryStateDigest(payload)).digest("hex");
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const integer = value => Number.isInteger(value) && value >= 0 && value < 2147483647;
const email = value => typeof value === "string" && value.length <= 320 && value === value.trim().toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const time = value => value === null || (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)));

function validateSafetyValues(state) {
  for (const row of rows(state, "User")) assert(email(row.state.email) && time(row.state.emailVerifiedAt) && time(row.state.suspendedAt) && integer(row.state.accessRevision) && integer(row.state.referralInvitesIssued), "Account recovery values require review.");
  for (const row of rows(state, "Contact")) assert(typeof row.state.workspaceId === "string" && time(row.state.archivedAt), "Contact recovery values require review.");
  for (const row of rows(state, "ContactRelationshipState")) assert(typeof row.state.doNotContact === "boolean" && integer(row.state.version) && typeof row.state.contactId === "string" && typeof row.state.workspaceId === "string", "Recipient recovery values require review.");
  for (const row of rows(state, "EmailSuppression")) assert(email(row.state.email) && ["INVITATION_OPTOUT", "HARD_BOUNCE", "COMPLAINT", "PROVIDER_SUPPRESSION"].includes(row.state.reason) && time(row.state.clearedAt) && time(row.state.lastTriggeredAt) && integer(row.state.revision) && row.state.revision >= 1, "Suppression recovery values require review.");
  for (const row of rows(state, "WaitlistEntry")) assert(email(row.state.email) && ["WAITING", "ACCESS_GRANTED", "JOINED", "WITHDRAWN", "SUPPRESSED"].includes(row.state.status) && ["verifiedAt", "withdrawnAt", "accessGrantedAt", "joinedAt"].every(field => time(row.state[field])), "Waitlist recovery values require review.");
}

export function restrictionPlan(current, restored, { hold, manifest, key, now = new Date(), id = randomUUID() }) {
  const review = compareRecoveryState(current, restored, { hold, manifest, key, now });
  validateSafetyValues(current); validateSafetyValues(restored);
  assert(["User", "Workspace", "Contact"].every(table => restored.tables[table].keys.join() === "id" && restored.tables[table].columns.some(column => column.name === "id" && column.type === "text")), "Recovery identity schema requires a new policy version.");
  const users = byKey(current, "User"), workspaces = byKey(current, "Workspace");
  const restoredUsers = byKey(restored, "User");
  assert(rows(restored, "Workspace").every(row => restoredUsers.has(textIdHash(row.state.ownerId))), "Workspace ownership cannot be matched to the restored account identities.");
  const missing = new Set(rows(restored, "User").filter(row => !users.has(row.key)).map(row => row.key));
  const deletedWorkspaces = rows(restored, "Workspace").filter(row => missing.has(textIdHash(row.state.ownerId)));
  const ownershipConflicts = deletedWorkspaces.filter(row => workspaces.has(row.key)).length;
  const effects = {
    deletedAccounts: missing.size, deletedOwnedWorkspaces: deletedWorkspaces.length, ownershipConflicts,
    accountsRequiringFreshSignIn: rows(restored, "User").length - missing.size,
    correctedAccountEmails: rows(restored, "User").filter(row => users.has(row.key) && users.get(row.key).state.email !== row.state.email).length,
    raisedLifetimeInviteCounts: rows(restored, "User").filter(row => users.has(row.key) && users.get(row.key).state.referralInvitesIssued > row.state.referralInvitesIssued).length,
    disabledStaffMemberships: rows(restored, "StaffMembership").length,
    removedCredentials: Object.fromEntries(REAUTH_TABLES.map(table => [table, rows(restored, table).length])),
    revokeAllUnusedCustomerAndStaffInvitations: true, cancelUnfinishedJobsAndCustomerOutboundWork: true,
    pauseAdmissionNotificationsAutomationAndConnections: true,
    preserveOrStrengthenRecipientRestrictions: true,
  };
  const plan = { version: 1, purpose: PURPOSE, id, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL).toISOString(), recoveryId: hold.id, archiveSha256: hold.archiveSha256, sourceHash: current.sourceHash, targetSourceHash: restored.sourceHash, stateDigest: review.stateDigest, targetDigest: review.targetDigest, effects, differences: review.tables, applicationReady: false, releaseAllowed: false };
  return { ...plan, authentication: mac(plan, key) };
}

function verifyPlan(plan, key) {
  assert(plan?.version === 1 && plan.purpose === PURPOSE && HASH.test(plan.authentication ?? "") && timingSafeEqual(Buffer.from(plan.authentication, "hex"), Buffer.from(mac(plan, key), "hex")), "Recovery plan could not be authenticated.");
  assert(Number.isFinite(Date.parse(plan.createdAt)) && Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) === TTL && plan.applicationReady === false && plan.releaseAllowed === false, "Recovery plan format is invalid.");
}

export async function prepareRestrictionPlan(databaseUrl, current, manifest, key, { signal } = {}) {
  signal?.throwIfAborted();
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl), connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  client.on("error", () => undefined);
  await client.connect().catch(async error => { await client.end().catch(() => undefined); throw error; }); let hold;
  try { await requireRecoveryRelease(client); hold = await readRecoveryHold(client); } finally { await client.end(); }
  assert(hold, "The target must remain held.");
  const restored = await captureRecoveryState(databaseUrl, { targetHold: hold, signal });
  return restrictionPlan(current, restored, { hold, manifest, key });
}

export async function applyRestrictionPlan(databaseUrl, current, manifest, plan, { key, operator, reason, signal } = {}) {
  signal?.throwIfAborted();
  verifyPlan(plan, key);
  assert(typeof operator === "string" && operator.trim().length >= 2 && operator.length <= 100 && typeof reason === "string" && reason.trim().length >= 8 && reason.length <= 500, "Record the recovery operator and a concise reason.");
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl), connectionTimeoutMillis: 5000, statement_timeout: 15_000, application_name: "jitm-recovery-restrictions" });
  client.on("error", () => undefined); await client.connect().catch(async error => { await client.end().catch(() => undefined); throw error; });
  try {
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(814733,7)");
    const owned = (await client.query("SELECT d.datdba=r.oid OR r.rolsuper AS allowed FROM pg_database d CROSS JOIN pg_roles r WHERE d.datname=current_database() AND r.rolname=current_user")).rows[0]?.allowed;
    assert(owned, "Recovery apply requires the target database owner.");
    assert(!(await client.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid() LIMIT 1")).rowCount, "Stop other target clients before applying recovery corrections.");
    let hold = await readRecoveryHold(client); assert(hold?.id === plan.recoveryId, "The target recovery hold changed.");
    // Read committed plus all-table write exclusion gives a fresh, stable view
    // after waiting for locks. New clients cannot race reviewed row mutations.
    const names = (await client.query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','f') ORDER BY c.relname")).rows.map(row => row.name);
    assert(names.length && names.length <= 500, "Recovery table inventory is unsupported.");
    await client.query(`LOCK TABLE ${names.map(name => `public.${quoteIdentifier(name)}`).join(",")} IN ACCESS EXCLUSIVE MODE`);
    await requireRecoveryRelease(client);
    const before = await captureRecoveryStateInTransaction(client, databaseUrl, { targetHold: hold, signal });
    const binding = compareRecoveryState(current, before, { hold, manifest, key });
    assert(plan.stateDigest === binding.stateDigest && plan.targetSourceHash === binding.targetSourceHash && plan.archiveSha256 === binding.archiveSha256 && plan.sourceHash === binding.sourceHash, "Recovery plan source or target binding changed.");
    const planDigest = recoveryStateDigest(plan);
    if (hold.restrictions?.planDigest === planDigest) {
      assert(hold.restrictions.afterDigest === recoveryTargetDigest(before), "The target changed after the previous recovery apply. Review it again.");
      await client.query("COMMIT"); return { status: "already-applied", ...hold.restrictions, applicationReady: false, releaseAllowed: false };
    }
    assert(Date.parse(plan.createdAt) <= Date.now() + 300_000 && Date.parse(plan.expiresAt) > Date.now(), "Recovery plan expired. Generate and review a fresh plan.");
    const expected = restrictionPlan(current, before, { hold, manifest, key, now: new Date(plan.createdAt), id: plan.id });
    assert(recoveryStateDigest(expected) === planDigest, "The reviewed recovery target changed. Generate a fresh plan.");
    assert(plan.effects.ownershipConflicts === 0, "An account's workspace changed ownership. Resolve ownership before deleting the account.");
    const counts = Object.create(null), exec = async (name, sql, values = []) => {
      signal?.throwIfAborted(); const result = await client.query(sql, values); counts[name] = (counts[name] ?? 0) + result.rowCount; return result.rowCount;
    };
    // Temporary projection is authenticated source data, never executable SQL.
    await client.query('CREATE TEMP TABLE recovery_source ("table" text NOT NULL, key text NOT NULL, state jsonb NOT NULL, PRIMARY KEY ("table",key)) ON COMMIT DROP');
    for (const [table, data] of Object.entries(current.tables)) {
      if (!["User", "WorkspaceMember", "Contact", "ContactRelationshipState", "WaitlistEntry", "EmailSuppression"].includes(table)) continue;
      for (let i = 0; i < data.rows.length; i += 500) {
        signal?.throwIfAborted();
        await client.query('INSERT INTO recovery_source SELECT $1,r.key,r.state FROM jsonb_to_recordset($2::jsonb) AS r(key text,state jsonb)', [table, JSON.stringify(data.rows.slice(i, i + 500).map(row => ({ key: row.key, state: row.state })))]);
      }
    }
    const userKey = recoveryIdentitySql(["id"], "u");
    await client.query(`CREATE TEMP TABLE recovery_deleted_users ON COMMIT DROP AS SELECT u.id,u.email FROM public."User" u WHERE NOT EXISTS (SELECT 1 FROM recovery_source s WHERE s."table"='User' AND s.key=${userKey})`);
    for (const table of REAUTH_TABLES) await exec(`cleared${table}`, `DELETE FROM public.${quoteIdentifier(table)}`);
    await exec("disabledStaff", `UPDATE public."StaffMembership" SET status='DISABLED',revision=revision+1,"updatedAt"=now()`);
    // A two-step update supports legitimate email swaps without violating the
    // immediate unique constraint. The temporary addresses never commit.
    await exec("temporaryEmails", `UPDATE public."User" u SET email='recovery-'||gen_random_uuid()::text||'@invalid' WHERE NOT EXISTS (SELECT 1 FROM recovery_source s WHERE s."table"='User' AND s.key=${userKey} AND u.email=s.state->>'email')`);
    await exec("securedAccounts", `UPDATE public."User" u SET email=s.state->>'email',"emailVerifiedAt"=(s.state->>'emailVerifiedAt')::timestamp,"passwordHash"=NULL,"isPlatformAdmin"=false,"suspendedAt"=COALESCE(u."suspendedAt",(s.state->>'suspendedAt')::timestamp),"accessRevision"=GREATEST(u."accessRevision",(s.state->>'accessRevision')::int)+1,"referralInvitesIssued"=GREATEST(u."referralInvitesIssued",(s.state->>'referralInvitesIssued')::int),"updatedAt"=now() FROM recovery_source s WHERE s."table"='User' AND s.key=${userKey}`);
    await exec("removedMemberships", `DELETE FROM public."WorkspaceMember" t WHERE NOT EXISTS (SELECT 1 FROM recovery_source s WHERE s."table"='WorkspaceMember' AND s.key=${recoveryIdentitySql(["id"])} AND s.state=jsonb_build_object('workspaceId',t."workspaceId",'userId',t."userId",'role',t.role))`);
    await exec("removedRecipientStaffInvites", 'DELETE FROM public."StaffInvitation" WHERE email IN (SELECT email FROM recovery_deleted_users)');
    await exec("removedDeletedUserMessages", 'DELETE FROM public."SupportTicketMessage" WHERE "authorUserId" IN (SELECT id FROM recovery_deleted_users)');
    await exec("removedDeletedUserSupport", 'DELETE FROM public."SupportTicket" WHERE "requesterUserId" IN (SELECT id FROM recovery_deleted_users) OR "workspaceId" IN (SELECT id FROM public."Workspace" WHERE "ownerId" IN (SELECT id FROM recovery_deleted_users))');
    await exec("removedDeletedUserWaitlist", 'DELETE FROM public."WaitlistEntry" WHERE email IN (SELECT email FROM recovery_deleted_users)');
    await exec("clearedSettingAuthors", 'UPDATE public."PlatformSetting" SET "updatedByUserId"=NULL WHERE "updatedByUserId" IN (SELECT id FROM recovery_deleted_users)');
    await exec("deletedWorkspaces", 'DELETE FROM public."Workspace" WHERE "ownerId" IN (SELECT id FROM recovery_deleted_users)');
    await exec("deletionReceipts", `INSERT INTO public."AccountDeletionAudit" (id,"requestId","subjectHash",status,"createdAt","completedAt",metadata) SELECT gen_random_uuid()::text,$1||':'||id,encode(sha256(convert_to('account-deletion:'||id,'UTF8')),'hex'),'COMPLETED',now(),now(),jsonb_build_object('source','recovery','recoveryId',$1::text) FROM recovery_deleted_users ON CONFLICT ("requestId") DO NOTHING`, [hold.id]);
    await exec("deletedAccounts", 'DELETE FROM public."User" WHERE id IN (SELECT id FROM recovery_deleted_users)');
    await exec("archivedContacts", `UPDATE public."Contact" t SET "archivedAt"=(s.state->>'archivedAt')::timestamp,"updatedAt"=now() FROM recovery_source s WHERE s."table"='Contact' AND s.key=${recoveryIdentitySql(["id"])} AND s.state->>'archivedAt' IS NOT NULL AND t."archivedAt" IS NULL`);
    await exec("blockedContacts", `INSERT INTO public."ContactRelationshipState" (id,"workspaceId","contactId","doNotContact",version,"updatedAt") SELECT gen_random_uuid()::text,c."workspaceId",c.id,true,(s.state->>'version')::int,now() FROM recovery_source s JOIN public."Contact" c ON c.id=s.state->>'contactId' AND c."workspaceId"=s.state->>'workspaceId' WHERE s."table"='ContactRelationshipState' AND s.state->>'doNotContact'='true' ON CONFLICT ("contactId") DO UPDATE SET "doNotContact"=true,version=GREATEST("ContactRelationshipState".version,EXCLUDED.version)+1,"updatedAt"=now()`);
    await exec("canceledBlockedJumps", `UPDATE public."Jump" j SET status='CANCELED',"completionMethod"='recovery_do_not_contact',"completedAt"=NULL,"updatedAt"=now() WHERE j.status='PENDING' AND EXISTS (SELECT 1 FROM public."ContactRelationshipState" s WHERE s."contactId"=j."contactId" AND s."doNotContact")`);
    await exec("activeSuppressions", `INSERT INTO public."EmailSuppression" (id,email,reason,revision,"lastTriggeredAt","clearedAt") SELECT gen_random_uuid()::text,s.state->>'email',(s.state->>'reason')::public."EmailSuppressionReason",GREATEST(1,(s.state->>'revision')::int),(s.state->>'lastTriggeredAt')::timestamp,NULL FROM recovery_source s WHERE s."table"='EmailSuppression' AND s.state->>'clearedAt' IS NULL ON CONFLICT (email,reason) DO UPDATE SET "clearedAt"=NULL,revision=GREATEST("EmailSuppression".revision,EXCLUDED.revision)+1,"lastTriggeredAt"=GREATEST("EmailSuppression"."lastTriggeredAt",EXCLUDED."lastTriggeredAt")`);
    await exec("restrictedWaitlist", `INSERT INTO public."WaitlistEntry" (id,email,status,"verifiedAt","withdrawnAt","accessGrantedAt","joinedAt","updatedAt") SELECT gen_random_uuid()::text,s.state->>'email',(s.state->>'status')::public."WaitlistStatus",(s.state->>'verifiedAt')::timestamp,(s.state->>'withdrawnAt')::timestamp,(s.state->>'accessGrantedAt')::timestamp,(s.state->>'joinedAt')::timestamp,now() FROM recovery_source s WHERE s."table"='WaitlistEntry' AND s.state->>'status'<>'WAITING' ON CONFLICT (email) DO UPDATE SET status=CASE WHEN "WaitlistEntry".status IN ('WITHDRAWN','SUPPRESSED') THEN "WaitlistEntry".status ELSE EXCLUDED.status END,"withdrawnAt"=COALESCE("WaitlistEntry"."withdrawnAt",EXCLUDED."withdrawnAt"),"updatedAt"=now()`);
    await applyGlobalPauses(exec);
    await exec("audit", `INSERT INTO public."PlatformAuditEvent" (id,action,"entityType","entityId",reason,"afterData") VALUES ($1,'recovery.restrictions.apply','Recovery',$2,$3,$4::jsonb)`, [randomUUID(), hold.id, reason.trim(), JSON.stringify({ operator: operator.trim(), planDigest, sourceStateDigest: binding.stateDigest, counts, releaseAllowed: false })]);
    const after = await captureRecoveryStateInTransaction(client, databaseUrl, { targetHold: hold, signal });
    const receipt = { version: 1, planDigest, stateDigest: binding.stateDigest, beforeDigest: binding.targetDigest, afterDigest: recoveryTargetDigest(after), completedAt: new Date().toISOString(), operator: operator.trim(), counts, releaseAllowed: false };
    hold = { ...hold, restrictions: receipt };
    signal?.throwIfAborted();
    await writeRecoveryHold(client, hold);
    await client.query("COMMIT");
    return { status: "applied-held", ...receipt, applicationReady: false };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

export async function requireRecoveryRelease(client) {
  const actual = (await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM public."_prisma_migrations" LIMIT 2001')).rows;
  assert(actual.length < 2001 && !actual.some(row => !row.finished_at && !row.rolled_back_at), "Resolve unfinished migration history before recovery corrections.");
  assert(schemaRelease().migrations.every(required => actual.some(row => row.migration_name === required.name && row.checksum === required.checksum && row.finished_at && !row.rolled_back_at) && !actual.some(row => row.migration_name === required.name && row.finished_at && !row.rolled_back_at && row.checksum !== required.checksum)), "Apply and verify this release's migrations while keeping the target held.");
  const constraints = (await client.query(`SELECT c.relname AS name FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=f.conkey[1] JOIN pg_attribute p ON p.attrelid=f.confrelid AND p.attnum=f.confkey[1] WHERE n.nspname='public' AND f.contype='f' AND f.confrelid='public."Workspace"'::regclass AND f.confdeltype='c' AND f.convalidated AND array_length(f.conkey,1)=1 AND a.attname='workspaceId' AND p.attname='id'`)).rows.map(row => row.name);
  assert(["ContactGroupState", "JumpActionEvent", "MixBroadcastSchedule", "MixStop"].every(name => constraints.includes(name)), "Workspace erasure constraints must be present before recovery corrections.");
}

async function applyGlobalPauses(exec) {
  await exec("revokedCustomerInvites", `UPDATE public."ReferralAccessInvite" SET "revokedAt"=COALESCE("revokedAt",now()),"tokenCiphertext"='',"tokenPurgedAt"=COALESCE("tokenPurgedAt",now()) WHERE "acceptedAt" IS NULL`);
  await exec("revokedStaffInvites", `UPDATE public."StaffInvitation" SET "revokedAt"=COALESCE("revokedAt",now()),"updatedAt"=now() WHERE "acceptedAt" IS NULL`);
  await exec("canceledInvites", `UPDATE public."WaitlistDelivery" SET status='CANCELED',"leaseId"=NULL,"lockedAt"=NULL,"messageCiphertext"='',"payloadPurgedAt"=COALESCE("payloadPurgedAt",now()),"lastError"='Canceled during recovery.',"updatedAt"=now() WHERE status IN ('QUEUED','SENDING','REVIEW')`);
  await exec("canceledSupport", `UPDATE public."SupportEmailDelivery" SET status='CANCELED',"leaseId"=NULL,"leaseUntil"=NULL,"messageCiphertext"='',"lastError"='Canceled during recovery.',"updatedAt"=now() WHERE status IN ('QUEUED','SENDING','REVIEW')`);
  await exec("canceledSummaries", `UPDATE public."NotificationDelivery" SET status='SKIPPED',"lockedAt"=NULL,"lockedBy"=NULL,error='Canceled during recovery.',"updatedAt"=now() WHERE status<>'DELIVERED'`);
  await exec("canceledAutomation", `UPDATE public."AutomatedDelivery" SET status='CANCELED',"lockedAt"=NULL,"lockedBy"=NULL,error='Canceled during recovery.',"updatedAt"=now() WHERE status<>'DELIVERED'`);
  await exec("canceledImports", `UPDATE public."ContactImportBatch" SET status='CANCELED',"canceledAt"=COALESCE("canceledAt",now()),"completedAt"=COALESCE("completedAt",now()),"errorSummary"='Canceled during recovery. Review saved results before starting another import.',"updatedAt"=now() WHERE status IN ('QUEUED','RUNNING','FAILED')`);
  await exec("removedPendingJobs", 'DELETE FROM public."Job" WHERE "completedAt" IS NULL');
  await exec("disabledAutomation", 'UPDATE public."AutomationPreference" SET enabled=false,"emailEnabled"=false,"smsEnabled"=false,"updatedAt"=now()');
  await exec("disabledNotifications", 'UPDATE public."NotificationPreference" SET "emailDigestEnabled"=false,"pushEnabled"=false,"weeklyReportEnabled"=false,"updatedAt"=now()');
  await exec("disabledIntake", 'UPDATE public."IntakeConnection" SET enabled=false');
  await exec("disabledCalendar", 'UPDATE public."CalendarConnection" SET enabled=false');
  await exec("removedPublicReviews", 'DELETE FROM public."ReviewRequest"');
  await exec("pausedAdmission", `INSERT INTO public."AdmissionPolicy" (id,"collectionPaused","grantsPaused","referralsPaused","redemptionPaused","updatedAt") VALUES ('default',true,true,true,true,now()) ON CONFLICT (id) DO UPDATE SET "collectionPaused"=true,"grantsPaused"=true,"referralsPaused"=true,"redemptionPaused"=true,revision="AdmissionPolicy".revision+1,"updatedAt"=now()`);
  await exec("pausedWaves", `INSERT INTO public."WaitlistSchedule" (id,"nextRunAt",paused,"updatedAt") VALUES ('default',now()+interval '7 days',true,now()) ON CONFLICT (id) DO UPDATE SET paused=true,"updatedAt"=now()`);
}
