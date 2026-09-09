import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyRestrictionPlan, prepareRestrictionPlan } from "../scripts/lib/recovery-restrictions.mjs";
import { MAX_RECOVERY_STATE_BYTES, captureRecoveryState, compareRecoveryState, readRecoveryState, validateRecoveryState, writeRecoveryState } from "../scripts/lib/recovery-state.mjs";
import { beginRecoveryHold, readRecoveryHold } from "../scripts/lib/recovery-hold.mjs";
import { encryptFile } from "../scripts/lib/backup-archive.mjs";
import { adminDatabaseUrl, databaseUrlWithDatabase, postgresCliUrl, quoteIdentifier, runCommand } from "../scripts/lib/postgres-ops.mjs";

const baseUrl = process.env.RECOVERY_TEST_DATABASE_URL;
if (baseUrl && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname)) throw new Error("Recovery state tests require a loopback database server.");
describe.skipIf(!baseUrl).sequential("authenticated recovery state and held-target review", () => {
  const suffix = randomUUID().replaceAll("-", ""), sourceName = `jitm_recovery_test_${suffix}`, targetName = `jitm_recovery_test_${suffix}_target`;
  const key = randomBytes(32).toString("hex");
  let admin, source, target, sourceUrl, targetUrl, directory, manifest, hold, current, restored, archive;
  const cli = (script, args, overrides = {}) => runCommand(process.execPath, [script, ...args], { capture: true, env: { DATABASE_URL: sourceUrl, RESTORE_DATABASE_URL: targetUrl, BACKUP_ENCRYPTION_KEY: key, OPS_ALERT_WEBHOOK_URL: "", OPS_BACKUP_RECEIPT_FILE: "", OPS_RESTORE_RECEIPT_FILE: "", ...overrides } });
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "jitm-recovery-state-test-"));
    admin = new Client({ connectionString: postgresCliUrl(adminDatabaseUrl(baseUrl)) }); await admin.connect();
    sourceUrl = databaseUrlWithDatabase(baseUrl, sourceName); targetUrl = databaseUrlWithDatabase(baseUrl, targetName);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(sourceName)} TEMPLATE template0`);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(targetName)} TEMPLATE template0`);
    await cli("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
    source = new Client({ connectionString: postgresCliUrl(sourceUrl) }); await source.connect();
    await source.query(`SET TIME ZONE 'UTC';
      INSERT INTO "User" (id,email,name,"passwordHash","updatedAt","referralInvitesIssued") VALUES ('survivor','before@example.test','PRIVATE_CUSTOMER_NAME','PRIVATE_PASSWORD_HASH',now(),1),('deleted','current@example.test','Deleted fixture',NULL,now(),0);
      INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ('workspace','PRIVATE_WORKSPACE','source-workspace','survivor',now()),('deleted-workspace','Deleted workspace','deleted-workspace','deleted',now());
      INSERT INTO "WorkspaceMember" (id,"workspaceId","userId") VALUES ('member','workspace','survivor');
      INSERT INTO "ContactGroupState" ("groupId","workspaceId","updatedAt") VALUES ('deleted-group','deleted-workspace',now());
      INSERT INTO "JumpActionEvent" (id,"workspaceId","jumpId",action,metadata) VALUES ('deleted-event','deleted-workspace','deleted-jump','OPENED','{"note":"PRIVATE_DELETED_EVENT"}');
      INSERT INTO "MixBroadcastSchedule" (id,"workspaceId","mixId","localDate","timeMinutes",timezone,"updatedAt") VALUES ('deleted-broadcast','deleted-workspace','deleted-mix',now(),600,'UTC',now());
      INSERT INTO "MixStop" (id,"workspaceId","mixId","contactId",reason,"updatedAt") VALUES ('deleted-stop','deleted-workspace','deleted-mix','deleted-contact','PRIVATE_DELETED_REASON',now());
      INSERT INTO "StaffMembership" (id,"userId",role,status,grants,denies,"updatedAt") VALUES ('staff','survivor','OPERATOR','ACTIVE',ARRAY['users.read'],ARRAY[]::text[],now());
      INSERT INTO "Contact" (id,"workspaceId","displayName","privateNotes","updatedAt") VALUES ('contact','workspace','PRIVATE_CONTACT_NAME','PRIVATE_CONTACT_NOTE',now());
      INSERT INTO "ContactEmail" (id,"contactId",label,email,normalized,"isPrimary") VALUES ('contact-email','contact','WORK','PRIVATE_ADDRESS@example.test','private_address@example.test',true);
      INSERT INTO "ContactRelationshipState" (id,"workspaceId","contactId","updatedAt") VALUES ('relationship','workspace','contact',now());
      INSERT INTO "WaitlistEntry" (id,email,status,"verifiedAt","updatedAt") VALUES ('waiting','recipient@example.test','WAITING',now(),now());
      INSERT INTO "EmailMessage" (id,"payloadHash","recipientHash",category,"firstAttemptAt") VALUES ('email','PRIVATE_PAYLOAD_HASH','PRIVATE_RECIPIENT_HASH','INVITATION',now());
      INSERT INTO "Session" (id,"userId","tokenHash","expiresAt") VALUES ('session','survivor','PRIVATE_SESSION_HASH',now()+interval '1 day');
      INSERT INTO "AdminMfaCredential" ("userId","secretCiphertext","enabledAt","updatedAt") VALUES ('survivor','PRIVATE_MFA_SECRET',now(),now());
      INSERT INTO "AdminMfaSession" ("sessionId","userId","expiresAt") VALUES ('session','survivor',now()+interval '1 hour');
      INSERT INTO "AuthIdentity" (id,"userId",provider,"providerAccountId",email,"updatedAt") VALUES ('identity','survivor','GOOGLE','PRIVATE_PROVIDER_ACCOUNT','before@example.test',now());
      INSERT INTO "AuthOAuthState" (id,provider,"stateHash","codeVerifier",nonce,"expiresAt") VALUES ('oauth','GOOGLE','PRIVATE_OAUTH_HASH','PRIVATE_VERIFIER','PRIVATE_NONCE',now()+interval '1 hour');
      INSERT INTO "CalendarPreference" ("workspaceId","tokenHash","tokenEncrypted") VALUES ('workspace','PRIVATE_FEED_HASH','PRIVATE_FEED_SECRET');
      INSERT INTO "PushSubscription" (id,"workspaceId","userId","sessionId",endpoint,p256dh,auth,"updatedAt") VALUES ('push','workspace','survivor','session','https://push.example.test/PRIVATE_PUSH','PRIVATE_PUSH_KEY','PRIVATE_PUSH_AUTH',now());
      INSERT INTO "VerificationToken" (id,email,"tokenHash",purpose,"expiresAt") VALUES ('verification','before@example.test','PRIVATE_TOKEN_HASH','magic-login',now()+interval '1 day');
      INSERT INTO "AutomationPreference" (id,"workspaceId",enabled,"emailEnabled","updatedAt") VALUES ('automation','workspace',true,true,now());
      INSERT INTO "NotificationPreference" (id,"workspaceId","userId","emailDigestEnabled","pushEnabled","weeklyReportEnabled","updatedAt") VALUES ('notifications','workspace','survivor',true,true,true,now());
      INSERT INTO "NotificationDelivery" (id,"workspaceId","userId",kind,"localDate","updatedAt") VALUES ('summary','workspace','survivor','DAILY_DIGEST','2026-09-09',now());
      INSERT INTO "SupportTicket" (id,reference,"workspaceId","requesterUserId",title,category,"updatedAt") VALUES ('support','JITM-RECOVERY','workspace','survivor','PRIVATE_SUPPORT_TITLE','ACCOUNT',now());
      INSERT INTO "SupportTicketMessage" (id,"ticketId","authorUserId","authorType",body,"emailStatus") VALUES ('support-message','support','survivor','USER','PRIVATE_SUPPORT_BODY','PENDING');
      INSERT INTO "SupportEmailDelivery" (id,"messageId","messageCiphertext","emailMessageId","issuerUserId","issuerRevision","updatedAt") VALUES ('support-delivery','support-message','PRIVATE_SUPPORT_EMAIL','support-email','survivor',1,now());
      INSERT INTO "IntakeConnection" (id,"workspaceId",name,kind,"tokenHash","tokenEncrypted") VALUES ('intake','workspace','Intake fixture','CRM','PRIVATE_INTAKE_HASH','PRIVATE_INTAKE_SECRET');
      INSERT INTO "CalendarConnection" (id,"workspaceId",name,"urlEncrypted") VALUES ('calendar','workspace','Calendar fixture','PRIVATE_CALENDAR_URL');
      INSERT INTO "StepTemplate" (id,"workspaceId",name,channel,"updatedAt") VALUES ('step-template','workspace','Recovery fixture','EMAIL',now());
      INSERT INTO "StepVersion" (id,"stepTemplateId",version,body) VALUES ('step-version','step-template',1,'PRIVATE_SEND_BODY');
      INSERT INTO "Mix" (id,"workspaceId",name,"triggerMode",status,"updatedAt") VALUES ('mix','workspace','Recovery fixture','MANUAL_START','ACTIVE',now());
      INSERT INTO "MixStep" (id,"mixId","stepVersionId","dayOffset","sortOrder","updatedAt") VALUES ('mix-step','mix','step-version',0,0,now());
      INSERT INTO "Jump" (id,"workspaceId","contactId","mixId","mixStepId","stepVersionId","scheduledAt",reason,"templateSnapshot","renderedSnapshot","uniquenessKey","updatedAt") VALUES ('jump','workspace','contact','mix','mix-step','step-version',now(),'Recovery fixture','{}','{}','recovery-jump',now());
      INSERT INTO "AutomatedDelivery" (id,"workspaceId","jumpId",channel,"reviewEligibleAt","updatedAt") VALUES ('automatic','workspace','jump','EMAIL',now(),now());
      INSERT INTO "ReviewRequest" (id,"workspaceId","contactId","tokenHash","expiresAt","updatedAt") VALUES ('public-review','workspace','contact','PRIVATE_REVIEW_TOKEN',now()+interval '1 day',now());
      INSERT INTO "Job" (id,"workspaceId",task,payload,"updatedAt") VALUES ('restored-job','workspace','contact-import','{"batchId":"restored-import"}',now());
      INSERT INTO "ContactImportBatch" (id,"workspaceId","actorUserId","importId","totalRows",payload,"updatedAt") VALUES ('restored-import','workspace','survivor','old-import',1,'{"rows":[{"name":"PRIVATE_IMPORT"}]}',now());
      INSERT INTO "ReferralAccessInvite" (id,"inviterUserId","workspaceId","contactId","recipientEmail","tokenHash","tokenCiphertext") VALUES ('restored-invite','survivor','workspace','contact','recipient@example.test','PRIVATE_INVITE_HASH','PRIVATE_ACCESS_URL');
      INSERT INTO "WaitlistDelivery" (id,"inviteId","messageCiphertext","updatedAt") VALUES ('restored-delivery','restored-invite','PRIVATE_FROZEN_EMAIL',now());
      CREATE TABLE "FutureRecoveryData" (tenant text NOT NULL, external text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY (tenant,external) INCLUDE (payload));
      INSERT INTO "FutureRecoveryData" VALUES ('one','PRIVATE_FUTURE_ID','{"note":"PRIVATE_FUTURE_PAYLOAD"}'),('one','b','{}');`);
    archive = join(directory, "before.enc");
    await cli("scripts/backup-database.mjs", ["--output", archive, "--retention-days", "0"]);
    manifest = JSON.parse(await readFile(`${archive}.manifest.json`, "utf8"));
    await cli("scripts/restore-database.mjs", ["--input", archive]);
    target = new Client({ connectionString: postgresCliUrl(targetUrl) }); await target.connect();
    hold = await readRecoveryHold(target);
    await source.query(`BEGIN;
      DELETE FROM "Workspace" WHERE id='deleted-workspace'; DELETE FROM "User" WHERE id='deleted';
      UPDATE "User" SET email='current@example.test',"suspendedAt"=now(),"accessRevision"=3,"referralInvitesIssued"=5 WHERE id='survivor';
      INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('new-user','new@example.test','New fixture',now());
      UPDATE "StaffMembership" SET status='DISABLED',revision=2 WHERE id='staff';
      UPDATE "Contact" SET "privateNotes"=NULL,"archivedAt"=now() WHERE id='contact'; DELETE FROM "ContactEmail" WHERE id='contact-email';
      UPDATE "ContactRelationshipState" SET "doNotContact"=true,version=2 WHERE id='relationship';
      UPDATE "WaitlistEntry" SET status='WITHDRAWN',"withdrawnAt"=now() WHERE id='waiting';
      INSERT INTO "EmailSuppression" (id,email,reason) VALUES ('suppression','recipient@example.test','INVITATION_OPTOUT');
      UPDATE "EmailMessage" SET "acceptedAt"=now() WHERE id='email';
      DELETE FROM "Session"; DELETE FROM "VerificationToken";
      UPDATE "FutureRecoveryData" SET payload='{"cleared":true}' WHERE external='PRIVATE_FUTURE_ID'; DELETE FROM "FutureRecoveryData" WHERE external='b';
      COMMIT;`);
    current = await captureRecoveryState(sourceUrl);
    restored = await captureRecoveryState(targetUrl, { targetHold: hold });
  }, 120_000);
  afterAll(async () => {
    await source?.end().catch(() => undefined); await target?.end().catch(() => undefined);
    if (admin) {
      for (const name of [targetName, sourceName]) await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
      await admin.end();
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("captures all tables and composite identities without copying contact content or access secrets", () => {
    expect(Object.keys(current.tables)).toHaveLength(100);
    expect(current.tables.FutureRecoveryData.keys).toEqual(["tenant", "external"]);
    expect(current.tables.FutureRecoveryData.rows[0].key).toMatch(/^[a-f0-9]{64}$/);
    const text = JSON.stringify(current);
    for (const value of ["PRIVATE_CUSTOMER_NAME", "PRIVATE_CONTACT_NAME", "PRIVATE_CONTACT_NOTE", "PRIVATE_ADDRESS", "PRIVATE_FUTURE_ID", "PRIVATE_FUTURE_PAYLOAD", "PRIVATE_PASSWORD_HASH", "PRIVATE_SESSION_HASH", "PRIVATE_TOKEN_HASH", "PRIVATE_PAYLOAD_HASH"]) expect(text).not.toContain(value);
    expect(current.tables.User.rows.find(row => row.state.email === "current@example.test").state).toMatchObject({ referralInvitesIssued: 5, accessRevision: 3 });
  });
  it("reports post-backup deletion, withdrawal, revoked access and accepted sends without exposing row identities", () => {
    const report = compareRecoveryState(current, restored, { hold, manifest, key });
    expect(report).toMatchObject({ applicationReady: false, mutationsApplied: 0, releaseAllowed: false, continuousCoverage: false, recoveryId: hold.id });
    expect(report.tables.User).toMatchObject({ missingFromSource: 1, missingFromRestore: 1, changedRows: 1, safetyFieldsChanged: { referralInvitesIssued: 1, suspendedAt: 1, email: 1 } });
    expect(report.tables.ContactEmail.missingFromSource).toBe(1);
    expect(report.tables.Session.missingFromSource).toBe(1);
    expect(report.tables.VerificationToken.missingFromSource).toBe(1);
    expect(report.tables.ContactRelationshipState.safetyFieldsChanged.doNotContact).toBe(1);
    expect(report.tables.StaffMembership.safetyFieldsChanged.status).toBe(1);
    expect(report.tables.WaitlistEntry.safetyFieldsChanged.status).toBe(1);
    expect(report.tables.EmailSuppression.missingFromRestore).toBe(1);
    expect(report.tables.EmailMessage.safetyFieldsChanged.acceptedAt).toBe(1);
    expect(report.tables.FutureRecoveryData).toMatchObject({ changedRows: 1, missingFromSource: 1 });
    const text = JSON.stringify(report); for (const value of ["@example.test", "survivor", "contact-email", "PRIVATE_"]) expect(text).not.toContain(value);
  });
  it("encrypts with a separate purpose, rejects wrong keys/tampering/symlinks and preserves existing outputs", async () => {
    const file = join(directory, "state.enc"); await writeRecoveryState(current, file, key);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readRecoveryState(file, key)).toEqual(current);
    const bytes = await readFile(file);
    await expect(writeRecoveryState(current, file, key)).rejects.toThrow(); expect(await readFile(file)).toEqual(bytes);
    await expect(readRecoveryState(file, randomBytes(32).toString("hex"))).rejects.toThrow();
    const altered = Buffer.from(bytes); altered[altered.length - 1] ^= 1; await writeFile(join(directory, "tampered.enc"), altered);
    await expect(readRecoveryState(join(directory, "tampered.enc"), key)).rejects.toThrow();
    await symlink(file, join(directory, "linked.enc")); await expect(readRecoveryState(join(directory, "linked.enc"), key)).rejects.toThrow();
    const plain = join(directory, "raw.json"), raw = join(directory, "ordinary-backup-key.enc");
    await writeFile(plain, JSON.stringify(current), { mode: 0o600 }); await encryptFile(plain, raw, key);
    await expect(readRecoveryState(raw, key)).rejects.toThrow();
    const oversized = join(directory, "oversized.enc"), large = await open(oversized, "wx", 0o600);
    try { await large.truncate(MAX_RECOVERY_STATE_BYTES + 129); } finally { await large.close(); }
    await expect(readRecoveryState(oversized, key)).rejects.toThrow("invalid");
  });
  it.each(["source", "archive", "unsigned", "older", "future", "hold", "shape"])("rejects invalid %s evidence", kind => {
    const proof = structuredClone(manifest), candidate = structuredClone(current), targetState = structuredClone(restored), targetHold = structuredClone(hold);
    if (kind === "source") candidate.sourceHash = "0".repeat(64);
    if (kind === "archive") targetHold.archiveSha256 = "0".repeat(64);
    if (kind === "unsigned") delete proof.authentication;
    if (kind === "older") candidate.capturedAt = new Date(Date.parse(manifest.source.capturedAt) - 1000).toISOString();
    if (kind === "future") candidate.capturedAt = "2999-01-01T00:00:00.000Z";
    if (kind === "hold") targetHold.contentVerified = false;
    if (kind === "shape") targetState.schemaHash = "0".repeat(64);
    expect(() => compareRecoveryState(candidate, targetState, { hold: targetHold, manifest: proof, key })).toThrow();
  });
  it("rejects incomplete inventories, duplicate identities and mismatched row counts", () => {
    const missing = structuredClone(current); delete missing.tables.User; expect(() => validateRecoveryState(missing)).toThrow();
    const duplicate = structuredClone(current); duplicate.tables.User.rows.push(duplicate.tables.User.rows[0]); expect(() => validateRecoveryState(duplicate)).toThrow();
    const count = structuredClone(current); count.rowCount++; expect(() => validateRecoveryState(count)).toThrow();
  });
  it("runs both operator commands without mutating the held target or reporting readiness", async () => {
    const file = join(directory, "cli-state.enc"), report = join(directory, "review.json");
    await cli("scripts/export-recovery-state.mjs", ["--output", file]);
    const reviewed = await cli("scripts/review-recovery-state.mjs", ["--state", file, "--backup-manifest", `${archive}.manifest.json`, "--output", report]);
    expect(reviewed.stdout).toContain('"status":"review-required"');
    expect(JSON.parse(await readFile(report, "utf8"))).toMatchObject({ mutationsApplied: 0, releaseAllowed: false });
    expect((await stat(report)).mode & 0o777).toBe(0o600);
    expect(await readRecoveryHold(target)).toEqual(hold);
    const after = await captureRecoveryState(targetUrl, { targetHold: hold });
    expect(after.tables).toEqual(restored.tables);
    await expect(cli("scripts/review-recovery-state.mjs", ["--state", file, "--backup-manifest", `${archive}.manifest.json`, "--output", report])).rejects.toThrow();
  }, 30_000);
  it("refuses a held source and unsupported tables instead of omitting evidence", async () => {
    await beginRecoveryHold(sourceUrl, { archiveSha256: "f".repeat(64) });
    try { await expect(captureRecoveryState(sourceUrl)).rejects.toThrow("authoritative"); }
    finally { await source.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} RESET jitm.recovery_hold`); }
    await source.query('CREATE TABLE "MissingRecoveryKey" (value text)');
    try { await expect(captureRecoveryState(sourceUrl)).rejects.toThrow("primary keys"); }
    finally { await source.query('DROP TABLE "MissingRecoveryKey"'); }
  });
  it("uses read-only credentials and refuses row-security filtering", async () => {
    const role = `recovery_reader_${suffix}`;
    const password = randomBytes(24).toString("hex");
    await admin.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN PASSWORD '${password}'`);
    const readerUrl = new URL(sourceUrl); readerUrl.username = role; readerUrl.password = password;
    try {
      await source.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(role)}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(role)}`);
      const read = await captureRecoveryState(readerUrl.href); expect(read.tables).toEqual(current.tables);
      await source.query('ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY');
      await expect(captureRecoveryState(readerUrl.href)).rejects.toThrow("row-level security");
    } finally {
      await source.query('ALTER TABLE "Contact" DISABLE ROW LEVEL SECURITY');
      await source.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${quoteIdentifier(role)}; REVOKE USAGE ON SCHEMA public FROM ${quoteIdentifier(role)}`);
      await admin.query(`DROP ROLE ${quoteIdentifier(role)}`);
    }
  });
  it("preserves large numeric identities across cursor batches and encrypted file chunks", async () => {
    await source.query('CREATE TABLE "LargeRecoveryIdentity" (id bigint PRIMARY KEY); INSERT INTO "LargeRecoveryIdentity" SELECT 9007199254740992+n FROM generate_series(0,600) AS n');
    try {
      const captured = await captureRecoveryState(sourceUrl), rows = captured.tables.LargeRecoveryIdentity.rows;
      expect(rows).toHaveLength(601);
      expect(rows[0].key).toBe(createHash("sha256").update('{"id": "9007199254740992"}').digest("hex"));
      expect(rows[1].key).toBe(createHash("sha256").update('{"id": "9007199254740993"}').digest("hex"));
      const path = join(directory, "chunked-state.enc"); await writeRecoveryState(captured, path, key);
      expect((await stat(path)).size).toBeGreaterThan(128 * 1024);
      expect((await readRecoveryState(path, key)).tables.LargeRecoveryIdentity.rows).toEqual(rows);
    } finally { await source.query('DROP TABLE "LargeRecoveryIdentity"'); }
  });
  it("interrupts the actual export process, closes its snapshot and leaves no successful output", async () => {
    const path = join(directory, "interrupted.enc");
    await source.query('BEGIN'); await source.query('LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE');
    const child = spawn(process.execPath, ["scripts/export-recovery-state.mjs", "--output", path], { env: { ...process.env, DATABASE_URL: sourceUrl, BACKUP_ENCRYPTION_KEY: key }, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
    const exited = new Promise((resolve, reject) => { child.once("exit", code => resolve(code)); child.once("error", reject); });
    try {
      let blocked = false; const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        blocked = (await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name='jitm-recovery-state' AND wait_event_type='Lock'", [sourceName])).rowCount > 0;
        if (blocked) break; await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(blocked).toBe(true); child.kill("SIGTERM");
      // Let the pending read finish; cancellation must prevent publishing it.
      await source.query('ROLLBACK'); expect(await exited).toBe(130);
      expect(output).not.toContain('"status":"captured"'); await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name='jitm-recovery-state'", [sourceName])).rowCount).toBe(0);
    } finally { await source.query('ROLLBACK').catch(() => undefined); if (child.exitCode === null) child.kill("SIGKILL"); await exited.catch(() => undefined); }
  }, 30_000);
  it("keeps cross-table state consistent while an existing writer commits during capture", async () => {
    const before = await captureRecoveryState(sourceUrl);
    await source.query('BEGIN'); await source.query('LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE');
    const pending = captureRecoveryState(sourceUrl); let result;
    try {
      const deadline = Date.now() + 10_000; let blocked = false;
      while (Date.now() < deadline) {
        blocked = (await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name='jitm-recovery-state' AND wait_event_type='Lock'", [sourceName])).rowCount > 0;
        if (blocked) break; await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(blocked).toBe(true);
      await source.query('UPDATE "User" SET "accessRevision"="accessRevision"+1 WHERE id=$1', ['survivor']);
      await source.query('UPDATE "Contact" SET "archivedAt"=NULL WHERE id=$1', ['contact']);
      await source.query('COMMIT'); result = await pending;
      expect(result.tables.User.rows).toEqual(before.tables.User.rows);
      expect(result.tables.Contact.rows).toEqual(before.tables.Contact.rows);
    } finally { await source.query('ROLLBACK').catch(() => undefined); await pending.catch(() => undefined); }
    const after = await captureRecoveryState(sourceUrl); expect(after.tables.User.rows).not.toEqual(result.tables.User.rows);
  }, 30_000);

  async function detached(work) {
    await target.end();
    try { return await work(); }
    finally { target = new Client({ connectionString: postgresCliUrl(targetUrl) }); await target.connect(); }
  }
  const apply = plan => applyRestrictionPlan(targetUrl, current, manifest, plan, { key, operator: "Recovery test operator", reason: "Qualified isolated recovery restrictions" });
  it("rejects other clients, edited or expired plans, stale target data and missing erasure constraints", async () => {
    const plan = await prepareRestrictionPlan(targetUrl, current, manifest, key);
    const signal = AbortSignal.abort(new Error("Canceled fixture"));
    await expect(prepareRestrictionPlan(targetUrl, current, manifest, key, { signal })).rejects.toThrow("Canceled fixture");
    await expect(applyRestrictionPlan(targetUrl, current, manifest, plan, { key, signal })).rejects.toThrow("Canceled fixture");
    const malformed = structuredClone(current); malformed.tables.EmailSuppression.rows[0].state.revision = 0;
    await expect(prepareRestrictionPlan(targetUrl, malformed, manifest, key)).rejects.toThrow("Suppression recovery");
    await expect(apply(plan)).rejects.toThrow("other target clients");
    const altered = structuredClone(plan); altered.effects.deletedAccounts = 0;
    await expect(detached(() => apply(altered))).rejects.toThrow("authenticated");
    try {
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 31 * 60_000);
      await expect(detached(() => apply(plan))).rejects.toThrow("expired");
    } finally { vi.useRealTimers(); }
    await target.query('UPDATE "User" SET name=$1 WHERE id=$2', ['Changed after review', 'survivor']);
    try { await expect(detached(() => apply(plan))).rejects.toThrow("target changed"); }
    finally { await target.query('UPDATE "User" SET name=$1 WHERE id=$2', ['PRIVATE_CUSTOMER_NAME', 'survivor']); }
    await target.query('ALTER TABLE "ContactGroupState" DROP CONSTRAINT "ContactGroupState_workspaceId_fkey"');
    try { await expect(prepareRestrictionPlan(targetUrl, current, manifest, key)).rejects.toThrow("erasure constraints"); }
    finally { await target.query('ALTER TABLE "ContactGroupState" ADD CONSTRAINT "ContactGroupState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE'); }
    expect((await captureRecoveryState(targetUrl, { targetHold: hold })).tables).toEqual(restored.tables);
  }, 30_000);
  it("refuses erasing a deleted account's workspace when the newer source retains that workspace", async () => {
    await source.query(`INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ('deleted-workspace','Transferred workspace','transferred-workspace','survivor',now())`);
    try {
      const transferred = await captureRecoveryState(sourceUrl), plan = await prepareRestrictionPlan(targetUrl, transferred, manifest, key);
      expect(plan.effects.ownershipConflicts).toBe(1);
      await expect(detached(() => applyRestrictionPlan(targetUrl, transferred, manifest, plan, { key, operator: "Recovery test", reason: "Owned transfer refusal fixture" }))).rejects.toThrow("changed ownership");
    } finally { await source.query('DELETE FROM "Workspace" WHERE id=$1', ['deleted-workspace']); }
  }, 30_000);
  it("rolls back every correction and the receipt when a deletion fails", async () => {
    const plan = await prepareRestrictionPlan(targetUrl, current, manifest, key);
    await target.query(`CREATE FUNCTION recovery_fail_deletion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture recovery failure'; END $$;
      CREATE TRIGGER recovery_fail_deletion BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION recovery_fail_deletion()`);
    try { await expect(detached(() => apply(plan))).rejects.toThrow("fixture recovery failure"); }
    finally { await target.query('DROP TRIGGER recovery_fail_deletion ON "User"; DROP FUNCTION recovery_fail_deletion()'); }
    expect((await captureRecoveryState(targetUrl, { targetHold: hold })).tables).toEqual(restored.tables);
    expect(await readRecoveryHold(target)).toEqual(hold);
  }, 30_000);
  it("applies the reviewed restrictions through the real CLI once, keeping access held and omitted content unresolved", async () => {
    const statePath = join(directory, "apply-state.enc"), planPath = join(directory, "apply-plan.json"), receiptPath = join(directory, "apply-receipt.json");
    await writeRecoveryState(current, statePath, key);
    const args = ["--state", statePath, "--backup-manifest", `${archive}.manifest.json`];
    await cli("scripts/reconcile-recovery-state.mjs", [...args, "--output", planPath]);
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    expect(plan.effects).toMatchObject({ deletedAccounts: 1, deletedOwnedWorkspaces: 1, raisedLifetimeInviteCounts: 1, ownershipConflicts: 0 });
    const operator = "Recovery\\O'Neil", quotedUrl = new URL(targetUrl); quotedUrl.searchParams.set("options", "-c standard_conforming_strings=off");
    await detached(() => cli("scripts/reconcile-recovery-state.mjs", [...args, "--apply", "--plan", planPath, "--operator", operator, "--reason", "Reconcile isolated old backup", "--output", receiptPath], { RESTORE_DATABASE_URL: quotedUrl.href }));
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    expect(receipt).toMatchObject({ status: "applied-held", applicationReady: false, releaseAllowed: false, counts: { deletedAccounts: 1, deletedWorkspaces: 1 } });
    expect(receipt.operator).toBe(operator);
    expect((await target.query('SELECT email,"passwordHash","suspendedAt","referralInvitesIssued","accessRevision" FROM "User" WHERE id=$1', ['survivor'])).rows[0]).toMatchObject({ email: "current@example.test", passwordHash: null, referralInvitesIssued: 5, accessRevision: 4, suspendedAt: expect.any(Date) });
    for (const table of ["User", "Workspace"]) expect((await target.query(`SELECT 1 FROM "${table}" WHERE id LIKE 'deleted%'`)).rowCount).toBe(0);
    for (const table of ["ContactGroupState", "JumpActionEvent", "MixBroadcastSchedule", "MixStop"]) expect((await target.query(`SELECT 1 FROM "${table}" WHERE "workspaceId"='deleted-workspace'`)).rowCount).toBe(0);
    for (const table of ["Session", "VerificationToken", "AdminMfaCredential", "AdminMfaSession", "AuthIdentity", "AuthOAuthState", "CalendarPreference", "PushSubscription", "ReviewRequest"]) expect((await target.query(`SELECT 1 FROM "${table}"`)).rowCount).toBe(0);
    expect((await target.query('SELECT status FROM "StaffMembership"')).rows[0].status).toBe("DISABLED");
    expect((await target.query('SELECT "doNotContact" FROM "ContactRelationshipState"')).rows[0].doNotContact).toBe(true);
    expect((await target.query('SELECT status FROM "WaitlistEntry"')).rows[0].status).toBe("WITHDRAWN");
    expect((await target.query('SELECT "clearedAt" FROM "EmailSuppression"')).rows[0].clearedAt).toBeNull();
    expect((await target.query('SELECT status,"messageCiphertext" FROM "WaitlistDelivery"')).rows[0]).toEqual({ status: "CANCELED", messageCiphertext: "" });
    expect((await target.query('SELECT status,"messageCiphertext" FROM "SupportEmailDelivery"')).rows[0]).toEqual({ status: "CANCELED", messageCiphertext: "" });
    expect((await target.query('SELECT status FROM "AutomatedDelivery"')).rows[0].status).toBe("CANCELED");
    expect((await target.query('SELECT status FROM "NotificationDelivery"')).rows[0].status).toBe("SKIPPED");
    expect((await target.query('SELECT status FROM "Jump"')).rows[0].status).toBe("CANCELED");
    expect((await target.query('SELECT enabled FROM "IntakeConnection"')).rows[0].enabled).toBe(false);
    expect((await target.query('SELECT enabled FROM "CalendarConnection"')).rows[0].enabled).toBe(false);
    expect((await target.query('SELECT "revokedAt","tokenCiphertext" FROM "ReferralAccessInvite"')).rows[0]).toMatchObject({ revokedAt: expect.any(Date), tokenCiphertext: "" });
    expect((await target.query('SELECT status FROM "ContactImportBatch"')).rows[0].status).toBe("CANCELED");
    expect((await target.query('SELECT 1 FROM "Job" WHERE "completedAt" IS NULL')).rowCount).toBe(0);
    expect((await target.query('SELECT enabled FROM "AutomationPreference"')).rows[0].enabled).toBe(false);
    expect((await target.query('SELECT "emailDigestEnabled","pushEnabled","weeklyReportEnabled" FROM "NotificationPreference"')).rows[0]).toEqual({ emailDigestEnabled: false, pushEnabled: false, weeklyReportEnabled: false });
    expect((await target.query('SELECT "redemptionPaused","grantsPaused" FROM "AdmissionPolicy"')).rows[0]).toEqual({ redemptionPaused: true, grantsPaused: true });
    expect((await target.query('SELECT paused FROM "WaitlistSchedule"')).rows[0].paused).toBe(true);
    expect((await target.query('SELECT "privateNotes" FROM "Contact" WHERE id=$1', ['contact'])).rows[0].privateNotes).toBe("PRIVATE_CONTACT_NOTE");
    const afterHold = await readRecoveryHold(target); expect(afterHold.id).toBe(hold.id); expect(afterHold.restrictions.afterDigest).toBe(receipt.afterDigest);
    const after = await captureRecoveryState(targetUrl, { targetHold: afterHold });
    const retry = join(directory, "apply-receipt-retry.json");
    await detached(() => cli("scripts/reconcile-recovery-state.mjs", [...args, "--apply", "--plan", planPath, "--operator", "Recovery fixture", "--reason", "Check same committed recovery", "--output", retry]));
    expect(JSON.parse(await readFile(retry, "utf8")).status).toBe("already-applied");
    expect((await captureRecoveryState(targetUrl, { targetHold: afterHold })).tables).toEqual(after.tables);
    expect((await target.query(`SELECT count(*)::int AS count FROM "PlatformAuditEvent" WHERE action='recovery.restrictions.apply'`)).rows[0].count).toBe(1);
  }, 40_000);
});
