import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { productionConfigurationIssues } from "../../src/lib/env.ts";
import { decryptWithSecret, encryptWithSecret } from "../../src/lib/integration-crypto.ts";
import { generateTotpSecret, verifyTotpCode } from "../../src/lib/totp.ts";
import { reportDefinitionKey } from "../../src/lib/report-storage-policy.ts";
import { parseBackupKey } from "./backup-archive.mjs";
import { operationsSourceHash } from "./operations-artifacts.mjs";
import { postgresCliUrl, quoteIdentifier, sameDatabase } from "./postgres-ops.mjs";
import { verifySourceCutoff } from "./recovery-cutoff.mjs";
import { readRecoveryHold } from "./recovery-hold.mjs";
import { requireRecoveryRelease } from "./recovery-restrictions.mjs";
import { captureRecoveryStateInTransaction, recoveryStateDigest, recoveryTargetDigest } from "./recovery-state.mjs";
import { verifyTargetCutoffBinding } from "./recovery-target-cutoff.mjs";

const TTL = 30 * 60_000, PLAN = "jitm.recovery-release-plan", RECEIPT = "jitm.recovery-release", SETTING = "jitm.recovery_release";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function signature(value, key) {
  const { authentication: _, ...payload } = value;
  const derived = createHmac("sha256", parseBackupKey(key)).update(value.purpose).digest();
  return createHmac("sha256", derived).update(recoveryStateDigest(payload)).digest("hex");
}
const signed = (value, key) => ({ ...value, authentication: signature(value, key) });
function authenticate(value, purpose, key) {
  assert(value?.version === 1 && value.purpose === purpose && /^[a-f0-9]{64}$/.test(value.authentication ?? "") && timingSafeEqual(Buffer.from(value.authentication, "hex"), Buffer.from(signature(value, key), "hex")), "The recovery release artifact could not be authenticated.");
}
function configuration(source, targetUrl, key) {
  const environment = { ...source, NODE_ENV: "production", DATABASE_URL: targetUrl };
  assert(productionConfigurationIssues(environment).length === 0 && (source.AUTH_REQUIRE_ADMIN_MFA ?? "true").toLowerCase() === "true", "The intended runtime configuration must pass production checks and require staff MFA.");
  // Bind the entire supplied runtime configuration subset, including provider
  // credentials, without publishing secrets or permitting offline guesses.
  const names = Object.keys(source).filter(name => /^(APP_URL|PILOT_MODE|DEMO_MODE|AUTH_|DATA_ENCRYPTION_KEY|RESEND_|EMAIL_|PRIVATE_TEST_|TWILIO_|WEB_PUSH_|WORKER_|NETLIFY_WORKER_|REPORT_)/.test(name)).sort();
  const digest = createHmac("sha256", parseBackupKey(key)).update("jitm.recovery-runtime").update(JSON.stringify(names.map(name => [name, source[name]]))).digest("hex");
  return { digest, origin: new URL(source.APP_URL).origin, encryptionKey: source.DATA_ENCRYPTION_KEY, authSecret: source.AUTH_RATE_LIMIT_SECRET?.trim() || source.DATA_ENCRYPTION_KEY?.trim() };
}
async function quietTarget(client) {
  assert(!(await client.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type<>'autovacuum worker' LIMIT 1")).rowCount, "Stop other target clients before releasing recovery.");
  assert(!(await client.query("SELECT 1 FROM pg_prepared_xacts WHERE database=current_database() LIMIT 1")).rowCount, "Resolve prepared target transactions before recovery release.");
  assert(!(await client.query("SELECT 1 FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database()) LIMIT 1")).rowCount, "Remove target subscriptions before recovery release.");
}
async function retainedCiphertexts(client, encryptionKey, signal) {
  let count = 0;
  for (const [table, column] of [["ReferralAccessInvite", "tokenCiphertext"], ["WaitlistDelivery", "messageCiphertext"], ["SupportEmailDelivery", "messageCiphertext"], ["ReportExport", "contentCiphertext"]]) {
    await client.query(`DECLARE recovery_ciphertext NO SCROLL CURSOR FOR SELECT ${quoteIdentifier(column)} AS value FROM public.${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IS NOT NULL AND ${quoteIdentifier(column)}<>''`);
    for (;;) {
      signal?.throwIfAborted();
      const batch = (await client.query("FETCH FORWARD 100 FROM recovery_ciphertext")).rows;
      if (!batch.length) break;
      for (const row of batch) { decryptWithSecret(row.value, encryptionKey); count++; }
    }
    await client.query("CLOSE recovery_ciphertext");
  }
  return count;
}
async function withTarget(sourceUrl, targetUrl, sourceReceipt, options, work) {
  const { key, signal } = options;
  signal?.throwIfAborted();
  assert(!sameDatabase(sourceUrl, targetUrl), "Recovery requires separate source and target databases.");
  await verifySourceCutoff(sourceUrl, sourceReceipt, { key, signal });
  const client = new Client({ connectionString: postgresCliUrl(targetUrl), connectionTimeoutMillis: 5000, statement_timeout: 15_000, application_name: "jitm-recovery-release" });
  client.on("error", () => undefined); await client.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(814733,7)");
    const database = (await client.query("SELECT d.oid, d.datdba=r.oid OR r.rolsuper AS allowed FROM pg_database d CROSS JOIN pg_roles r WHERE d.datname=current_database() AND r.rolname=current_user")).rows[0];
    assert(database?.allowed, "Recovery release requires the target database owner.");
    const hold = await readRecoveryHold(client);
    const result = await work(client, hold, database.oid);
    signal?.throwIfAborted(); await verifySourceCutoff(sourceUrl, sourceReceipt, { key, signal });
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}
async function checkHeldTarget(client, hold, sourceReceipt, targetUrl, config, options) {
  const cutoff = verifyTargetCutoffBinding(hold, sourceReceipt, targetUrl, options.key);
  await quietTarget(client);
  const names = (await client.query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','f') ORDER BY c.relname")).rows.map(row => row.name);
  assert(names.length && names.length <= 500, "Target table inventory is unsupported.");
  await client.query(`LOCK TABLE ${names.map(name => `public.${quoteIdentifier(name)}`).join(",")} IN ACCESS EXCLUSIVE MODE`);
  await requireRecoveryRelease(client);
  const state = await captureRecoveryStateInTransaction(client, targetUrl, { targetHold: hold, signal: options.signal });
  assert(recoveryTargetDigest(state) === cutoff.targetDigest, "The target changed after cutoff binding. Keep it held and review the change.");
  await retainedCiphertexts(client, config.encryptionKey, options.signal);
  return cutoff;
}

/** Preparation writes no database rows. Enrollment is returned separately and
 * must be saved privately; neither it nor credential hashes belong in logs. */
export async function prepareRecoveryRelease(sourceUrl, targetUrl, sourceReceipt, { environment = process.env, ownerEmail, ...options } = {}) {
  const config = configuration(environment, targetUrl, options.key);
  assert(typeof ownerEmail === "string" && ownerEmail.length <= 320, "Choose an existing verified recovery Owner email.");
  return withTarget(sourceUrl, targetUrl, sourceReceipt, options, async (client, hold, targetOid) => {
    const cutoff = await checkHeldTarget(client, hold, sourceReceipt, targetUrl, config, options);
    const owner = (await client.query('SELECT id,email FROM public."User" WHERE email=$1 AND "emailVerifiedAt" IS NOT NULL AND "suspendedAt" IS NULL', [ownerEmail.trim().toLowerCase()])).rows[0];
    assert(owner, "The recovery Owner must be an existing verified, unsuspended account.");
    const password = randomBytes(24).toString("base64url"), secret = generateTotpSecret();
    const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g).join("-"));
    const credentials = { passwordHash: await bcrypt.hash(password, 12), secretCiphertext: encryptWithSecret({ secret }, config.encryptionKey), recoveryCodeHashes: recoveryCodes.map(code => createHmac("sha256", config.authSecret).update(code.replaceAll("-", "")).digest("hex")) };
    const now = new Date(), id = randomUUID();
    const plan = signed({ version: 1, purpose: PLAN, id, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL).toISOString(), recoveryId: hold.id, targetOid, targetSourceHash: operationsSourceHash(targetUrl), sourceReceiptDigest: recoveryStateDigest(sourceReceipt), cutoffDigest: recoveryStateDigest(cutoff), beforeDigest: cutoff.targetDigest, configurationDigest: config.digest, origin: config.origin, ownerId: owner.id, credentials, effects: { restoreOneOwnerWithFreshPasswordAndVerifiedMfa: true, rotateDisabledIntakeTokens: true, clearDisabledCalendarUrls: true, queueFollowUpPreparation: true, discardOldWorkerHeartbeats: true, preserveAdmissionAndMessagingPauses: true, releaseDatabaseHold: true }, releaseAllowed: false }, options.key);
    const uri = new URL(`otpauth://totp/${encodeURIComponent(`Jump in the Mix:${owner.email}`)}`);
    for (const [name, value] of Object.entries({ secret, issuer: "Jump in the Mix", algorithm: "SHA1", digits: "6", period: "30" })) uri.searchParams.set(name, value);
    return { plan, enrollment: { version: 1, planId: id, origin: config.origin, email: owner.email, password, secret, otpAuthUri: uri.toString(), recoveryCodes, expiresAt: plan.expiresAt } };
  });
}

export async function applyRecoveryRelease(sourceUrl, targetUrl, sourceReceipt, plan, { environment = process.env, mfaCode, operator, reason, ...options } = {}) {
  authenticate(plan, PLAN, options.key);
  assert(typeof operator === "string" && operator.trim().length >= 2 && operator.length <= 100 && typeof reason === "string" && reason.trim().length >= 8 && reason.length <= 500, "Record the recovery operator and reason.");
  const config = configuration(environment, targetUrl, options.key), planDigest = recoveryStateDigest(plan);
  assert(plan.configurationDigest === config.digest && plan.targetSourceHash === operationsSourceHash(targetUrl) && plan.sourceReceiptDigest === recoveryStateDigest(sourceReceipt), "The reviewed runtime configuration, source or target changed.");
  return withTarget(sourceUrl, targetUrl, sourceReceipt, options, async (client, hold, targetOid) => {
    assert(plan.targetOid === targetOid, "The target database identity changed.");
    if (!hold) {
      const values = (await client.query("SELECT value FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) value WHERE s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) AND s.setrole=0 AND left(value,length($1::text))=$1", [`${SETTING}=`])).rows;
      assert(values.length === 1, "No matching committed recovery release exists.");
      const receipt = JSON.parse(values[0].value.slice(SETTING.length + 1)); authenticate(receipt, RECEIPT, options.key);
      assert(receipt.planDigest === planDigest && receipt.targetOid === targetOid && receipt.targetSourceHash === plan.targetSourceHash, "The committed recovery release belongs to another plan.");
      // This retrieves a historical commit, not a new readiness observation.
      return { status: "already-released", receipt, readinessVerified: false };
    }
    assert(plan.releaseAllowed === false && Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) === TTL && Date.parse(plan.createdAt) <= Date.now() + 300_000 && Date.parse(plan.expiresAt) > Date.now(), "The recovery release plan expired or is invalid. Prepare fresh enrollment.");
    const cutoff = await checkHeldTarget(client, hold, sourceReceipt, targetUrl, config, options);
    assert(hold.id === plan.recoveryId && recoveryStateDigest(cutoff) === plan.cutoffDigest && cutoff.targetDigest === plan.beforeDigest, "The recovery release plan no longer matches the held target.");
    const secret = decryptWithSecret(plan.credentials.secretCiphertext, config.encryptionKey).secret;
    const counter = verifyTotpCode(secret, typeof mfaCode === "string" ? mfaCode : "");
    assert(counter !== null, "Verify the newly enrolled authenticator before reopening.");
    const owner = (await client.query('UPDATE public."User" SET "passwordHash"=$2,"isPlatformAdmin"=true,"accessRevision"="accessRevision"+1,"updatedAt"=now() WHERE id=$1 AND "emailVerifiedAt" IS NOT NULL AND "suspendedAt" IS NULL RETURNING id', [plan.ownerId, plan.credentials.passwordHash])).rows[0];
    assert(owner, "The reviewed recovery Owner is no longer eligible.");
    await client.query('INSERT INTO public."AdminMfaCredential" ("userId","secretCiphertext","recoveryCodeHashes","enabledAt","lastUsedCounter","updatedAt") VALUES ($1,$2,$3,now(),$4,now())', [owner.id, plan.credentials.secretCiphertext, plan.credentials.recoveryCodeHashes, counter]);
    await client.query('INSERT INTO public."StaffMembership" (id,"userId",role,status,grants,denies,"updatedAt") VALUES ($1,$2,\'OWNER\',\'ACTIVE\',\'{}\',\'{}\',now()) ON CONFLICT ("userId") DO UPDATE SET role=\'OWNER\',status=\'ACTIVE\',grants=\'{}\',denies=\'{}\',revision="StaffMembership".revision+1,"updatedAt"=now()', [randomUUID(), owner.id]);
    const counts = { rotatedIntakeTokens: 0 };
    await client.query('DECLARE recovery_intake NO SCROLL CURSOR FOR SELECT id FROM public."IntakeConnection"');
    for (;;) {
      options.signal?.throwIfAborted();
      const batch = (await client.query("FETCH FORWARD 100 FROM recovery_intake")).rows;
      if (!batch.length) break;
      for (const row of batch) {
        const token = randomBytes(32).toString("base64url");
        await client.query('UPDATE public."IntakeConnection" SET "tokenHash"=$2,"tokenEncrypted"=$3,enabled=false WHERE id=$1', [row.id, createHash("sha256").update(token).digest("hex"), encryptWithSecret(token, config.encryptionKey)]);
        counts.rotatedIntakeTokens++;
      }
    }
    await client.query("CLOSE recovery_intake");
    counts.clearedCalendarUrls = (await client.query('UPDATE public."CalendarConnection" SET "urlEncrypted"=NULL,enabled=false')).rowCount;
    counts.removedOldHeartbeats = (await client.query('DELETE FROM public."WorkerHeartbeat"')).rowCount;
    counts.queuedPreparation = (await client.query('INSERT INTO public."Job" (id,"workspaceId",task,payload,"updatedAt") SELECT $1||\':\'||w.id,w.id,\'generate-jumps\',\'{}\'::jsonb,now() FROM public."Workspace" w JOIN public."User" u ON u.id=w."ownerId" WHERE u."suspendedAt" IS NULL', [`recovery:${hold.id}`])).rowCount;
    counts.queuedReports = (await client.query('INSERT INTO public."Job" (id,task,payload,"maxAttempts","updatedAt") SELECT $1||s.id,\'admin-report-snapshot\',jsonb_build_object(\'snapshotId\',s.id),3,now() FROM public."ReportDailySnapshot" s WHERE s."jobId" IS NULL AND s.status IN (\'QUEUED\',\'RUNNING\',\'FAILED\') AND s."definitionKey"=$2', [`recovery:${hold.id}:report:`, reportDefinitionKey(environment)])).rowCount;
    await client.query('UPDATE public."ReportDailySnapshot" s SET "jobId"=j.id,status=\'QUEUED\',"updatedAt"=now() FROM public."Job" j WHERE j.id=$1||s.id AND s."jobId" IS NULL', [`recovery:${hold.id}:report:`]);
    counts.failedObsoleteReports = (await client.query('UPDATE public."ReportDailySnapshot" SET status=\'FAILED\',"updatedAt"=now() WHERE "jobId" IS NULL AND status IN (\'QUEUED\',\'RUNNING\')')).rowCount;
    await client.query('UPDATE public."ReportSchedule" SET "nextRunAt"=now()');
    await client.query('UPDATE public."WorkspacePreference" SET "nextReconcileAt"=now(),"lastReconciledAt"=NULL,"updatedAt"=now()');
    const receiptId = randomUUID();
    await client.query('INSERT INTO public."PlatformAuditEvent" (id,"actorUserId",action,"entityType","entityId",reason,"afterData") VALUES ($1,$2,\'recovery.target.release\',\'Recovery\',$3,$4,$5::jsonb)', [receiptId, owner.id, hold.id, reason.trim(), JSON.stringify({ planDigest, operator: operator.trim(), counts, admissionsPaused: true, customerMessagingPaused: true })]);
    const after = await captureRecoveryStateInTransaction(client, targetUrl, { targetHold: hold, signal: options.signal });
    const receipt = signed({ version: 1, purpose: RECEIPT, id: receiptId, recoveryId: hold.id, targetOid, targetSourceHash: plan.targetSourceHash, sourceReceiptDigest: plan.sourceReceiptDigest, cutoffDigest: plan.cutoffDigest, planDigest, configurationDigest: config.digest, beforeDigest: plan.beforeDigest, afterDigest: recoveryTargetDigest(after), releasedAt: new Date().toISOString(), operator: operator.trim(), reason: reason.trim(), counts, admissionsPaused: true, customerMessagingPaused: true, releaseAllowed: true }, options.key);
    await quietTarget(client);
    const setting = (await client.query("SELECT format('ALTER DATABASE %I SET jitm.recovery_release TO %L',current_database(),$1::text) AS sql", [JSON.stringify(receipt)])).rows[0].sql;
    await client.query(setting);
    await client.query((await client.query("SELECT format('ALTER DATABASE %I RESET jitm.recovery_hold',current_database()) AS sql")).rows[0].sql);
    return { status: "target-released", receipt, readinessVerified: false };
  });
}
