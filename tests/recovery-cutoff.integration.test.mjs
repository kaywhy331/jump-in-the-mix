import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backupRecoveryStatePath, readBackupRecoveryState } from "../scripts/lib/recovery-bundle.mjs";
import { applySourceCutoff, prepareSourceCutoff, resumePendingSource, verifySourceCutoff } from "../scripts/lib/recovery-cutoff.mjs";
import { targetRecoveryCutoff } from "../scripts/lib/recovery-target-cutoff.mjs";
import { applyRecoveryRelease, prepareRecoveryRelease } from "../scripts/lib/recovery-release.mjs";
import { decryptWithSecret, encryptWithSecret } from "../src/lib/integration-crypto.ts";
import { generateTotpCode, verifyTotpCode } from "../src/lib/totp.ts";
import bcrypt from "bcryptjs";
import { reportDefinitionKey } from "../src/lib/report-storage-policy.ts";
import { readRecoveryHold, writeRecoveryHold } from "../scripts/lib/recovery-hold.mjs";
import { captureRecoveryState, recoveryTargetDigest } from "../scripts/lib/recovery-state.mjs";
import { adminDatabaseUrl, databaseUrlWithDatabase, postgresCliUrl, quoteIdentifier, runCommand } from "../scripts/lib/postgres-ops.mjs";

const baseUrl = process.env.RECOVERY_TEST_DATABASE_URL;
if (baseUrl && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname)) throw new Error("Source finalization tests require loopback PostgreSQL.");
describe.skipIf(!baseUrl).sequential("reviewed source finalization", () => {
  const suffix = randomUUID().replaceAll("-", ""), templateName = `jitm_cutoff_${suffix}`, key = randomBytes(32).toString("hex");
  const options = { key, operator: "Recovery fixture", reason: "Finalize the reviewed local source" };
  const runtime = { ...process.env, APP_URL: "http://127.0.0.1:3112", PILOT_MODE: "true", DEMO_MODE: "false", AUTH_REQUIRE_ADMIN_MFA: "true", AUTH_RATE_LIMIT_SECRET: "recovery-release-fixture-auth-secret-32", DATA_ENCRYPTION_KEY: "recovery-release-fixture-data-key-32" };
  let admin, directory, sourceUrl, sourceName, archive, manifest, state, plan, counter = 0;
  const clients = [];
  const extraDatabases = [];
  async function connect(url = sourceUrl) { const client = new Client({ connectionString: postgresCliUrl(url) }); client.on("error", () => undefined); await client.connect(); clients.push(client); return client; }
  const cli = (script, args, overrides = {}) => runCommand(process.execPath, [script, ...args], { capture: true, env: { DATABASE_URL: sourceUrl, BACKUP_ENCRYPTION_KEY: key, OPS_ALERT_WEBHOOK_URL: "", OPS_BACKUP_RECEIPT_FILE: "", OPS_RESTORE_RECEIPT_FILE: "", ...overrides } });
  const apply = (value = plan, more = {}) => applySourceCutoff(sourceUrl, state, manifest, value, { ...options, ...more });
  const allowed = async () => (await admin.query("SELECT datallowconn FROM pg_database WHERE datname=$1", [sourceName])).rows[0].datallowconn;
  async function restoredTarget({ restrict = true } = {}) {
    const name = `${sourceName}_target`, url = databaseUrlWithDatabase(baseUrl, name);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0`); extraDatabases.push(name);
    await cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: url });
    if (restrict) {
      const args = ["--state", backupRecoveryStatePath(archive), "--backup-manifest", `${archive}.manifest.json`], targetPlan = join(directory, `target-plan-${counter}.json`);
      await cli("scripts/reconcile-recovery-state.mjs", [...args, "--output", targetPlan], { RESTORE_DATABASE_URL: url });
      await cli("scripts/reconcile-recovery-state.mjs", [...args, "--apply", "--plan", targetPlan, "--operator", options.operator, "--reason", options.reason, "--output", join(directory, `target-restrictions-${counter}.json`)], { RESTORE_DATABASE_URL: url });
    }
    return url;
  }
  async function marker() {
    const result = await admin.query("SELECT value FROM pg_db_role_setting s JOIN pg_database d ON d.oid=s.setdatabase CROSS JOIN LATERAL unnest(s.setconfig) value WHERE d.datname=$1 AND value LIKE 'jitm.recovery_source_cutoff=%'", [sourceName]);
    return result.rowCount ? JSON.parse(result.rows[0].value.split("=").slice(1).join("=")) : null;
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "jitm-cutoff-test-"));
    admin = new Client({ connectionString: postgresCliUrl(adminDatabaseUrl(baseUrl)) }); await admin.connect();
    await admin.query(`CREATE DATABASE ${quoteIdentifier(templateName)} TEMPLATE template0`);
    sourceUrl = databaseUrlWithDatabase(baseUrl, templateName);
    await cli("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
    const fixture = await connect();
    await fixture.query(`INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('fixture','cutoff@example.test','PRIVATE_CUSTOMER',now());
      INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ('workspace','PRIVATE_WORKSPACE','cutoff','fixture',now());
      INSERT INTO "Contact" (id,"workspaceId","displayName","privateNotes","updatedAt") VALUES ('contact','workspace','PRIVATE_CONTACT','PRIVATE_NOTE',now());`);
    await fixture.query(`UPDATE "User" SET "emailVerifiedAt"=now();
      INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('other','other@example.test','Other fixture',now());
      INSERT INTO "StaffMembership" (id,"userId",role,"updatedAt") VALUES ('old-owner','other','OWNER',now());
      INSERT INTO "IntakeConnection" (id,"workspaceId",name,kind,"tokenHash","tokenEncrypted") VALUES ('intake','workspace','Old intake','webhook','old-token-hash','old-token');
      INSERT INTO "CalendarConnection" (id,"workspaceId",name,"urlEncrypted") VALUES ('calendar','workspace','Old calendar','old-url');
      INSERT INTO "WorkerHeartbeat" (id,"workerId","updatedAt") VALUES ('old-worker','old-worker',now());`);
    await fixture.query('INSERT INTO "ReferralAccessInvite" (id,"recipientEmail","tokenHash","tokenCiphertext","acceptedAt") VALUES (\'accepted\',\'accepted@example.test\',\'accepted-hash\',$1,now())', [encryptWithSecret("retained-accepted-token", runtime.DATA_ENCRYPTION_KEY)]);
    await fixture.query('INSERT INTO "ReportDailySnapshot" (id,day,"definitionKey","updatedAt") VALUES (\'report\',current_date,$1,now())', [reportDefinitionKey()]);
    await fixture.end(); clients.length = 0;
  }, 60_000);
  beforeEach(async () => {
    sourceName = `${templateName}_${++counter}`; sourceUrl = databaseUrlWithDatabase(baseUrl, sourceName);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(sourceName)} TEMPLATE ${quoteIdentifier(templateName)}`);
    archive = join(directory, `${counter}.jitm-backup.enc`);
    await cli("scripts/backup-database.mjs", ["--with-recovery-state", "--output", archive, "--retention-days", "0"]);
    manifest = JSON.parse(await readFile(`${archive}.manifest.json`, "utf8")); state = await readBackupRecoveryState(archive, manifest, key);
    plan = await prepareSourceCutoff(sourceUrl, state, manifest, options);
  }, 30_000);
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const client of clients.splice(0)) await client.end().catch(() => undefined);
    for (const name of extraDatabases.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
    if (sourceName) await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(sourceName)} WITH (FORCE)`);
  });
  afterAll(async () => {
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(templateName)} WITH (FORCE)`); await admin.end(); }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("finalizes through the actual CLI, rejects new connections, verifies and recovers the same signed receipt", async () => {
    const planPath = join(directory, "reviewed.json"), receiptPath = join(directory, "receipt.json"), verifiedPath = join(directory, "verified.json");
    await cli("scripts/finalize-recovery-source.mjs", ["--input", archive, "--output", planPath]);
    expect(await allowed()).toBe(true); expect(await marker()).toBeNull();
    const result = await cli("scripts/finalize-recovery-source.mjs", ["--input", archive, "--apply", "--plan", planPath, "--operator", options.operator, "--reason", options.reason, "--output", receiptPath]);
    expect(result.stdout).toContain('"source-finalized"');
    const completed = JSON.parse(await readFile(receiptPath, "utf8"));
    expect(completed).toMatchObject({ status: "source-finalized", applicationReady: false, releaseAllowed: false, receipt: { sourceDataMutations: 0, targetDataMutations: 0, archiveSha256: manifest.archive.sha256, contentDigest: recoveryTargetDigest(state) } });
    expect(await allowed()).toBe(false); expect(await marker()).toEqual(completed.receipt);
    const rejected = new Client({ connectionString: postgresCliUrl(sourceUrl) });
    await expect(rejected.connect()).rejects.toThrow("not currently accepting connections"); await rejected.end();
    await cli("scripts/finalize-recovery-source.mjs", ["--verify", "--receipt", receiptPath, "--output", verifiedPath]);
    expect(JSON.parse(await readFile(verifiedPath, "utf8"))).toMatchObject({ status: "source-offline-verified", applicationReady: false });
    expect((await stat(receiptPath)).mode & 0o077).toBe(0);
    const privateOutput = JSON.stringify(completed);
    for (const secret of ["PRIVATE_CUSTOMER", "PRIVATE_CONTACT", "PRIVATE_NOTE", "cutoff@example.test", key]) expect(privateOutput).not.toContain(secret);
    const retry = await apply(JSON.parse(await readFile(planPath, "utf8")));
    expect(retry.status).toBe("already-finalized"); expect(retry.receipt).toEqual(completed.receipt);
    // Fixture-only reenablement proves that the live verifier rejects reopening.
    await admin.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} ALLOW_CONNECTIONS true`);
    await expect(verifySourceCutoff(sourceUrl, completed.receipt, options)).rejects.toThrow("no longer finalized");
    expect(recoveryTargetDigest(await captureRecoveryState(sourceUrl))).toBe(recoveryTargetDigest(state));
    const writer = await connect(); await writer.query('UPDATE "Contact" SET "privateNotes"=NULL'); await writer.end(); clients.length = 0;
    await admin.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} ALLOW_CONNECTIONS false`);
    expect(await marker()).toEqual(completed.receipt);
    await expect(verifySourceCutoff(sourceUrl, completed.receipt, options)).rejects.toThrow("no longer finalized");
    await expect(apply(JSON.parse(await readFile(planPath, "utf8")))).rejects.toThrow("no longer finalized");
  }, 30_000);

  it("rejects tampered, wrong-key and expired plans before disabling the source", async () => {
    await expect(apply({ ...plan, archiveSha256: "0".repeat(64) })).rejects.toThrow("authenticated");
    await expect(apply(plan, { key: randomBytes(32).toString("hex") })).rejects.toThrow("authenticated");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(plan.expiresAt) + 1);
    await expect(apply()).rejects.toThrow("expired");
    vi.restoreAllMocks(); expect(await allowed()).toBe(true); expect(await marker()).toBeNull();
  });

  it("refuses changed content and connected clients without closing the source", async () => {
    const writer = await connect();
    await expect(apply()).rejects.toThrow("other source clients");
    await writer.query('UPDATE "Contact" SET "privateNotes"=NULL'); await writer.end(); clients.length = 0;
    await expect(apply()).rejects.toThrow("contents changed");
    await expect(prepareSourceCutoff(sourceUrl, state, manifest, options)).rejects.toThrow("contents changed");
    expect(await allowed()).toBe(true); expect(await marker()).toBeNull();
  });

  it("refuses held sources, changed release checksums and another source identity", async () => {
    const source = await connect();
    await source.query("ALTER DATABASE " + quoteIdentifier(sourceName) + " SET jitm.recovery_hold TO 'malformed'"); await source.end(); clients.length = 0;
    await expect(apply()).rejects.toThrow("hold metadata");
    await admin.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} RESET jitm.recovery_hold`);
    const changed = await connect(); await changed.query('UPDATE "_prisma_migrations" SET checksum=repeat(\'a\',64) WHERE migration_name=\'20260909130000_workspace_history_erasure\''); await changed.end(); clients.length = 0;
    await expect(apply()).rejects.toThrow("migrations");
    await expect(applySourceCutoff(databaseUrlWithDatabase(baseUrl, templateName), state, manifest, plan, options)).rejects.toThrow("source identity");
    expect(await allowed()).toBe(true);
  });

  it("leaves a pending closed source on cancellation after connection denial and refuses a success retry", async () => {
    const stop = new AbortController(), original = Client.prototype.query; let closing = false;
    vi.spyOn(Client.prototype, "query").mockImplementation(async function (query, ...args) {
      const result = await original.call(this, query, ...args);
      if (typeof query === "string" && query.includes("ALLOW_CONNECTIONS false")) closing = true;
      if (closing && query === "COMMIT") { closing = false; stop.abort(); }
      return result;
    });
    await expect(apply(plan, { signal: stop.signal })).rejects.toThrow(); vi.restoreAllMocks();
    expect(await allowed()).toBe(false); expect(await marker()).toMatchObject({ status: "pending" });
    await expect(apply()).rejects.toThrow("authenticated");
    const planPath = join(directory, "resume-plan.json"), resumedPath = join(directory, "resumed.json");
    await writeFile(planPath, JSON.stringify(plan));
    await cli("scripts/finalize-recovery-source.mjs", ["--resume-source", "--plan", planPath, "--operator", options.operator, "--reason", "Resume the source after an interrupted finalization", "--output", resumedPath]);
    const resumed = JSON.parse(await readFile(resumedPath, "utf8"));
    expect(resumed).toMatchObject({ status: "source-resumed", applicationReady: false, releaseAllowed: false });
    expect(await allowed()).toBe(true); expect(await marker()).toBeNull();
    expect(recoveryTargetDigest(await captureRecoveryState(sourceUrl))).toBe(recoveryTargetDigest(state));
    expect(await resumePendingSource(sourceUrl, plan, options)).toMatchObject({ status: "already-resumed", receipt: resumed.receipt });
    await expect(apply()).rejects.toThrow("was canceled");
    expect(await prepareSourceCutoff(sourceUrl, state, manifest, options)).toMatchObject({ applicationReady: false });
  });

  it("detects a writer committing between the precheck and connection denial", async () => {
    const original = Client.prototype.query; let injected = false;
    vi.spyOn(Client.prototype, "query").mockImplementation(async function (query, ...args) {
      if (!injected && typeof query === "string" && query.includes("ALLOW_CONNECTIONS false")) {
        injected = true; const writer = await connect(); await original.call(writer, 'UPDATE "Contact" SET "privateNotes"=NULL'); await writer.end(); clients.length = 0;
      }
      return original.call(this, query, ...args);
    });
    await expect(apply()).rejects.toThrow("contents changed"); vi.restoreAllMocks();
    expect(injected).toBe(true); expect(await allowed()).toBe(false); expect(await marker()).toMatchObject({ status: "pending" });
  });

  it("detects an already-admitted connection racing the denial without terminating it", async () => {
    const original = Client.prototype.query; let late;
    vi.spyOn(Client.prototype, "query").mockImplementation(async function (query, ...args) {
      if (!late && typeof query === "string" && query.includes("ALLOW_CONNECTIONS false")) late = await connect();
      return original.call(this, query, ...args);
    });
    await expect(apply()).rejects.toThrow("other source clients"); vi.restoreAllMocks();
    expect(await allowed()).toBe(false); expect(await marker()).toMatchObject({ status: "pending" });
    expect((await late.query("SELECT 1 AS active")).rows[0].active).toBe(1);
    await expect(resumePendingSource(sourceUrl, plan, options)).rejects.toThrow("other source clients");
  });

  it("does not record success if the final metadata transaction fails", async () => {
    const original = Client.prototype.query;
    vi.spyOn(Client.prototype, "query").mockImplementation(async function (query, ...args) {
      if (typeof query === "string" && query.startsWith("SELECT format(") && args[0]?.[0]?.includes('"purpose":"jitm.recovery-source-cutoff-receipt"')) throw new Error("Injected final receipt failure");
      return original.call(this, query, ...args);
    });
    await expect(apply()).rejects.toThrow("Injected final receipt failure"); vi.restoreAllMocks();
    expect(await allowed()).toBe(false); expect(await marker()).toMatchObject({ status: "pending" });
  });

  it("refuses a preexisting output before applying the reviewed finalization", async () => {
    const planPath = join(directory, "collision-plan.json"), output = join(directory, "existing-evidence.json");
    await writeFile(planPath, JSON.stringify(plan)); await writeFile(output, "Preserve this evidence", { mode: 0o600 });
    await expect(cli("scripts/finalize-recovery-source.mjs", ["--input", archive, "--apply", "--plan", planPath, "--operator", options.operator, "--reason", options.reason, "--output", output])).rejects.toThrow();
    expect(await readFile(output, "utf8")).toBe("Preserve this evidence"); expect(await allowed()).toBe(true); expect(await marker()).toBeNull();
  });

  it("rejects edited receipts and source metadata rather than trusting a saved success flag", async () => {
    const result = await apply();
    await expect(resumePendingSource(sourceUrl, plan, options)).rejects.toThrow("incomplete source finalization");
    await expect(verifySourceCutoff(sourceUrl, { ...result.receipt, contentDigest: "0".repeat(64) }, options)).rejects.toThrow("authenticated");
    await admin.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} RESET jitm.recovery_source_cutoff`);
    await expect(verifySourceCutoff(sourceUrl, result.receipt, options)).rejects.toThrow("no longer finalized");
    expect(await allowed()).toBe(false);
  });

  it("refuses a non-owner and even a disabled replication subscription", async () => {
    const role = `jitm_cutoff_reader_${suffix}`;
    await admin.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN`);
    try {
      const url = new URL(sourceUrl); url.username = role; url.password = "";
      await expect(prepareSourceCutoff(url.toString(), state, manifest, options)).rejects.toThrow("database owner");
    } finally { await admin.query(`DROP ROLE ${quoteIdentifier(role)}`); }
    const client = await connect();
    // CI's default PostgreSQL disables two-phase commit; the local qualification
    // server enables it and exercises a real prepared transaction here.
    if (Number((await client.query("SHOW max_prepared_transactions")).rows[0].max_prepared_transactions) > 0) {
      const gid = `cutoff-${suffix}-${counter}`;
      await client.query('BEGIN; UPDATE "Contact" SET "privateNotes"=NULL');
      await client.query(`PREPARE TRANSACTION '${gid}'`); await client.end(); clients.length = 0;
      try { await expect(apply()).rejects.toThrow("prepared source transactions"); expect(await allowed()).toBe(true); }
      finally {
        const rollback = await connect(); await rollback.query(`ROLLBACK PREPARED '${gid}'`); await rollback.end(); clients.length = 0;
      }
    } else { await client.end(); clients.length = 0; }
    const subscriber = await connect();
    await subscriber.query(`CREATE SUBSCRIPTION cutoff_fixture CONNECTION 'host=invalid.example.test dbname=unused' PUBLICATION unused WITH (connect=false,enabled=false,create_slot=false,slot_name=NONE)`);
    await subscriber.end(); clients.length = 0;
    try {
      await expect(apply()).rejects.toThrow("subscriptions"); expect(await allowed()).toBe(true); expect(await marker()).toBeNull();
    } finally {
      const cleanup = await connect(); await cleanup.query("DROP SUBSCRIPTION cutoff_fixture"); await cleanup.end(); clients.length = 0;
    }
  });

  it("binds the exact restricted target through the CLI and rechecks both databases without reopening", async () => {
    const url = await restoredTarget(), cutoff = await apply();
    const receiptPath = join(directory, `source-cutoff-${counter}.json`), boundPath = join(directory, `bound-cutoff-${counter}.json`);
    await writeFile(receiptPath, JSON.stringify(cutoff), { mode: 0o600 });
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, { ...options, verifyOnly: true })).rejects.toThrow("no bound cutoff");
    const observer = await connect(url), hold = await readRecoveryHold(observer); await observer.end(); clients.length = 0;
    const before = recoveryTargetDigest(await captureRecoveryState(url, { targetHold: hold }));
    const connected = await connect(url);
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, options)).rejects.toThrow("other target clients");
    await connected.end(); clients.length = 0;
    await cli("scripts/finalize-recovery-source.mjs", ["--bind-target", "--receipt", receiptPath, "--operator", options.operator, "--reason", "Bind the restored database to its final source cutoff", "--output", boundPath], { RESTORE_DATABASE_URL: url });
    const bound = JSON.parse(await readFile(boundPath, "utf8"));
    expect(bound).toMatchObject({ status: "target-cutoff-bound", applicationReady: false, releaseAllowed: false, receipt: { recoveryId: hold.id, targetDigest: before, restrictionPlanDigest: hold.restrictions.planDigest } });
    const view = await connect(url), currentHold = await readRecoveryHold(view); await view.end(); clients.length = 0;
    expect(currentHold.cutoff).toEqual(bound.receipt);
    expect(recoveryTargetDigest(await captureRecoveryState(url, { targetHold: currentHold }))).toBe(before);
    expect(await targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, options)).toMatchObject({ status: "already-bound", receipt: bound.receipt });
    const verifiedPath = join(directory, `target-verified-${counter}.json`);
    await cli("scripts/finalize-recovery-source.mjs", ["--verify-target", "--receipt", receiptPath, "--output", verifiedPath], { RESTORE_DATABASE_URL: url });
    expect(JSON.parse(await readFile(verifiedPath, "utf8"))).toMatchObject({ status: "target-cutoff-verified", applicationReady: false });
    await admin.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} ALLOW_CONNECTIONS true`);
    await admin.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} ALLOW_CONNECTIONS false`);
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, { ...options, verifyOnly: true })).rejects.toThrow("no longer finalized");
  }, 30_000);

  it("refuses missing lineage, altered target receipts and target data changed after restrictions", async () => {
    const url = await restoredTarget(), cutoff = await apply();
    const inspect = async work => { const client = await connect(url); try { return await work(client); } finally { await client.end(); clients.length = 0; } };
    const original = await inspect(readRecoveryHold);
    await inspect(client => writeRecoveryHold(client, { ...original, recoverySnapshot: undefined }));
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, options)).rejects.toThrow("complete recovery bundle");
    await inspect(client => writeRecoveryHold(client, { ...original, restrictions: undefined }));
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, options)).rejects.toThrow("Restrictions must");
    await inspect(client => writeRecoveryHold(client, { ...original, restrictions: { ...original.restrictions, beforeDigest: "0".repeat(64) } }));
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, options)).rejects.toThrow("Restrictions must");
    await inspect(client => writeRecoveryHold(client, original));
    const bound = await targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, options);
    await inspect(client => writeRecoveryHold(client, { ...original, cutoff: { ...bound.receipt, operator: "Tampered operator" } }));
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, { ...options, verifyOnly: true })).rejects.toThrow("authenticated");
    await inspect(client => writeRecoveryHold(client, { ...original, cutoff: bound.receipt }));
    await inspect(client => client.query('UPDATE "Contact" SET "privateNotes"=NULL'));
    await expect(targetRecoveryCutoff(sourceUrl, url, cutoff.receipt, options)).rejects.toThrow("no longer matches");
    expect((await inspect(readRecoveryHold)).id).toBe(original.id);
  }, 30_000);

  async function releaseFixture() {
    const url = await restoredTarget(), source = (await apply()).receipt;
    await targetRecoveryCutoff(sourceUrl, url, source, options);
    const prepared = await prepareRecoveryRelease(sourceUrl, url, source, { ...options, environment: runtime, ownerEmail: "cutoff@example.test" });
    const release = (overrides = {}, value = prepared.plan) => applyRecoveryRelease(sourceUrl, url, source, value, { ...options, environment: runtime, mfaCode: generateTotpCode(prepared.enrollment.secret), ...overrides });
    const inspect = async work => { const client = await connect(url); try { return await work(client); } finally { await client.end(); clients.length = 0; } };
    return { url, source, ...prepared, release, inspect };
  }

  it("reopens atomically with usable fresh Owner credentials, preserved content, disabled connections and one preparation job", async () => {
    const f = await releaseFixture(), beforeHold = await f.inspect(readRecoveryHold);
    expect((await f.inspect(client => client.query('SELECT "passwordHash" FROM "User" WHERE id=\'fixture\''))).rows[0].passwordHash).toBeNull();
    const completed = await f.release();
    expect(completed).toMatchObject({ status: "target-released", readinessVerified: false, receipt: { admissionsPaused: true, customerMessagingPaused: true, counts: { rotatedIntakeTokens: 1, clearedCalendarUrls: 1, removedOldHeartbeats: 1, queuedPreparation: 1, queuedReports: 1 } } });
    expect(await f.inspect(readRecoveryHold)).toBeNull();
    expect(completed.receipt.recoveryId).toBe(beforeHold.id);
    const user = (await f.inspect(client => client.query('SELECT * FROM "User" WHERE id=\'fixture\''))).rows[0];
    expect(await bcrypt.compare(f.enrollment.password, user.passwordHash)).toBe(true);
    const mfa = (await f.inspect(client => client.query('SELECT * FROM "AdminMfaCredential"'))).rows[0];
    expect(decryptWithSecret(mfa.secretCiphertext, runtime.DATA_ENCRYPTION_KEY).secret).toBe(f.enrollment.secret);
    expect(verifyTotpCode(f.enrollment.secret, generateTotpCode(f.enrollment.secret, (mfa.lastUsedCounter + 1) * 30_000), { at: (mfa.lastUsedCounter + 1) * 30_000, lastUsedCounter: mfa.lastUsedCounter })).not.toBeNull();
    const staff = (await f.inspect(client => client.query('SELECT "userId",role,status,grants,denies FROM "StaffMembership" ORDER BY "userId"'))).rows;
    expect(staff).toEqual([{ userId: "fixture", role: "OWNER", status: "ACTIVE", grants: [], denies: [] }, { userId: "other", role: "OWNER", status: "DISABLED", grants: [], denies: [] }]);
    const intake = (await f.inspect(client => client.query('SELECT * FROM "IntakeConnection"'))).rows[0];
    expect(intake.enabled).toBe(false); expect(intake.tokenHash).not.toBe("old-token-hash");
    expect(decryptWithSecret(intake.tokenEncrypted, runtime.DATA_ENCRYPTION_KEY)).toHaveLength(43);
    expect((await f.inspect(client => client.query('SELECT "urlEncrypted",enabled FROM "CalendarConnection"'))).rows[0]).toEqual({ urlEncrypted: null, enabled: false });
    expect((await f.inspect(client => client.query('SELECT "privateNotes" FROM "Contact"'))).rows[0].privateNotes).toBe("PRIVATE_NOTE");
    expect((await f.inspect(client => client.query('SELECT "collectionPaused","grantsPaused","referralsPaused","redemptionPaused" FROM "AdmissionPolicy"'))).rows[0]).toEqual({ collectionPaused: true, grantsPaused: true, referralsPaused: true, redemptionPaused: true });
    await f.inspect(client => client.query('UPDATE "Contact" SET "privateNotes"=\'New live edit\''));
    expect(await f.release({ mfaCode: "expired" })).toEqual({ status: "already-released", receipt: completed.receipt, readinessVerified: false });
    expect((await f.inspect(client => client.query('SELECT count(*)::int AS count FROM "Job"'))).rows[0].count).toBe(2);
    await runCommand(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", 'const {runWorkerPass}=await import("./src/worker/index.ts"); const {prisma}=await import("./src/lib/prisma.ts"); try { await runWorkerPass({budgetMs:15000,maxJobs:25}); } finally { await prisma.$disconnect(); }'], { capture: true, env: { ...runtime, DATABASE_URL: f.url, NODE_ENV: "production", RESEND_API_KEY: "", RESEND_RECOVERY_API_KEY: "", EMAIL_FROM: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", WEB_PUSH_VAPID_PRIVATE_KEY: "", WEB_PUSH_VAPID_PUBLIC_KEY: "", OPS_ALERT_WEBHOOK_URL: "", WORKER_DISPATCH_MODE: "", NETLIFY_WORKER_SECRET: "" } });
    const recoveredJobs = (await f.inspect(client => client.query('SELECT "completedAt","failedAt" FROM "Job" WHERE id LIKE $1', [`recovery:${beforeHold.id}%`]))).rows;
    expect(recoveredJobs).toHaveLength(2);
    expect(recoveredJobs.every(job => job.completedAt !== null && job.failedAt === null)).toBe(true);
    expect((await f.inspect(client => client.query('SELECT count(*)::int AS count FROM "WorkerHeartbeat" WHERE "workerId"<>\'old-worker\''))).rows[0].count).toBeGreaterThan(0);
  }, 90_000);

  it("rejects modified plans, changed runtime keys, expired enrollment and invalid MFA without releasing", async () => {
    const f = await releaseFixture(), held = await f.inspect(readRecoveryHold);
    await expect(f.release({}, { ...f.plan, ownerId: "other" })).rejects.toThrow("authenticated");
    await expect(f.release({ environment: { ...runtime, AUTH_RATE_LIMIT_SECRET: "changed-runtime-authentication-secret" } })).rejects.toThrow("configuration");
    await expect(f.release({ mfaCode: "invalid" })).rejects.toThrow("authenticator");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.plan.expiresAt) + 1);
    await expect(f.release()).rejects.toThrow("expired"); vi.restoreAllMocks();
    expect(await f.inspect(readRecoveryHold)).toEqual(held);
    expect((await f.inspect(client => client.query('SELECT count(*)::int AS count FROM "AdminMfaCredential"'))).rows[0].count).toBe(0);
  }, 30_000);

  it("refuses an unusable retained-data key, ineligible Owner, altered data, and a source reopened after planning", async () => {
    const f = await releaseFixture();
    await expect(prepareRecoveryRelease(sourceUrl, f.url, f.source, { ...options, environment: { ...runtime, DATA_ENCRYPTION_KEY: "wrong-retained-data-encryption-key-32" }, ownerEmail: "cutoff@example.test" })).rejects.toThrow("decrypted");
    await expect(prepareRecoveryRelease(sourceUrl, f.url, f.source, { ...options, environment: runtime, ownerEmail: "other@example.test" })).rejects.toThrow("verified");
    await f.inspect(client => client.query('UPDATE "Contact" SET "privateNotes"=NULL'));
    await expect(f.release()).rejects.toThrow("target changed");
    await admin.query(`ALTER DATABASE ${quoteIdentifier(sourceName)} ALLOW_CONNECTIONS true`);
    await expect(f.release()).rejects.toThrow("no longer finalized");
    expect(await f.inspect(readRecoveryHold)).not.toBeNull();
  }, 30_000);

  it("rolls back late interruption and a source reopened during release without leaving partial access or jobs", async () => {
    const f = await releaseFixture(), held = await f.inspect(readRecoveryHold), original = Client.prototype.query;
    const stop = new AbortController();
    vi.spyOn(Client.prototype, "query").mockImplementation(async function (query, ...args) {
      const result = await original.call(this, query, ...args);
      if (typeof query === "string" && query.includes("RESET jitm.recovery_hold") && query.startsWith("ALTER DATABASE")) stop.abort();
      return result;
    });
    await expect(f.release({ signal: stop.signal })).rejects.toThrow(); vi.restoreAllMocks();
    expect(await f.inspect(readRecoveryHold)).toEqual(held);
    expect((await f.inspect(client => client.query('SELECT count(*)::int AS count FROM "AdminMfaCredential"'))).rows[0].count).toBe(0);
    vi.spyOn(Client.prototype, "query").mockImplementation(async function (query, ...args) {
      const result = await original.call(this, query, ...args);
      if (typeof query === "string" && query.startsWith('INSERT INTO public."PlatformAuditEvent"')) await original.call(admin, `ALTER DATABASE ${quoteIdentifier(sourceName)} ALLOW_CONNECTIONS true`);
      return result;
    });
    await expect(f.release()).rejects.toThrow("no longer finalized"); vi.restoreAllMocks();
    expect(await f.inspect(readRecoveryHold)).toEqual(held);
    expect((await f.inspect(client => client.query('SELECT count(*)::int AS count FROM "Job"'))).rows[0].count).toBe(0);
  }, 30_000);

  it("uses private CLI enrollment and verification files, refuses collisions, and retrieves a lost release result", async () => {
    const url = await restoredTarget(), source = await apply();
    await targetRecoveryCutoff(sourceUrl, url, source.receipt, options);
    const sourcePath = join(directory, "release-source.json"), planPath = join(directory, "release-plan.json"), enrollmentPath = join(directory, "enrollment.json"), verificationPath = join(directory, "verification.json"), output = join(directory, "release-result.json");
    await writeFile(sourcePath, JSON.stringify(source), { mode: 0o600 });
    const command = args => runCommand(process.execPath, ["--import", "tsx", "scripts/reopen-recovery-target.mjs", "--receipt", sourcePath, ...args], { capture: true, env: { ...runtime, DATABASE_URL: sourceUrl, RESTORE_DATABASE_URL: url, BACKUP_ENCRYPTION_KEY: key } });
    const prepareArgs = ["--owner-email", "cutoff@example.test", "--output", planPath, "--enrollment-output", enrollmentPath];
    const prepared = await command(prepareArgs);
    expect(prepared.stdout).toContain('"release-plan-ready"');
    const enrollment = JSON.parse(await readFile(enrollmentPath, "utf8")), savedPlan = await readFile(planPath, "utf8");
    expect((await stat(enrollmentPath)).mode & 0o077).toBe(0);
    await expect(command(prepareArgs)).rejects.toThrow(); expect(await readFile(planPath, "utf8")).toBe(savedPlan);
    await writeFile(verificationPath, JSON.stringify({ planId: enrollment.planId, code: generateTotpCode(enrollment.secret) }), { mode: 0o600 });
    const applyArgs = ["--apply", "--plan", planPath, "--verification-file", verificationPath, "--operator", options.operator, "--reason", options.reason, "--output", output];
    const released = await command(applyArgs);
    expect(released.stdout).toContain('"target-released"');
    for (const secret of [enrollment.password, enrollment.secret, enrollment.email, key, "PRIVATE_NOTE"]) expect(prepared.stdout + released.stdout + await readFile(output, "utf8")).not.toContain(secret);
    applyArgs[applyArgs.length - 1] = join(directory, "retrieved-release.json");
    expect((await command(applyArgs)).stdout).toContain('"already-released"');
  }, 30_000);
});
