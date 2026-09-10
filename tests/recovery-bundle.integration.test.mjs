import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateBackupManifest } from "../scripts/lib/backup-manifest.mjs";
import { sha256File } from "../scripts/lib/backup-archive.mjs";
import { backupRecoveryStatePath, readBackupRecoveryState } from "../scripts/lib/recovery-bundle.mjs";
import { captureRecoveryState, recoveryStateDigest, recoveryTargetDigest, writeRecoveryState } from "../scripts/lib/recovery-state.mjs";
import { readRecoveryHold } from "../scripts/lib/recovery-hold.mjs";
import { adminDatabaseUrl, assertDatabaseEmpty, databaseUrlWithDatabase, postgresCliUrl, quoteIdentifier, runCommand } from "../scripts/lib/postgres-ops.mjs";

const baseUrl = process.env.RECOVERY_TEST_DATABASE_URL;
if (baseUrl && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname)) throw new Error("Recovery bundle tests require loopback PostgreSQL.");
describe.skipIf(!baseUrl).sequential("complete recovery bundles", () => {
  const suffix = randomUUID().replaceAll("-", ""), key = randomBytes(32).toString("hex"), owned = [], processes = [];
  let admin, source, directory, sourceUrl, olderTarget, targetUrl, emptyTarget, archive, manifest, state, shim, realDump;
  const environment = overrides => ({ ...process.env, DATABASE_URL: sourceUrl, BACKUP_ENCRYPTION_KEY: key, OPS_ALERT_WEBHOOK_URL: "", OPS_BACKUP_RECEIPT_FILE: "", OPS_RESTORE_RECEIPT_FILE: "", ...overrides });
  const cli = (script, args, overrides = {}) => runCommand(process.execPath, [script, ...args], { capture: true, env: environment(overrides) });
  async function database(label) {
    // Hosted and recovery hosts need not share a database's default collation.
    const locale = label === "source" ? "LOCALE_PROVIDER icu ICU_LOCALE 'en-US'" : "LOCALE_PROVIDER libc LC_COLLATE 'C' LC_CTYPE 'C'";
    const name = `jitm_bundle_${suffix}_${label}`; await admin.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0 ENCODING 'UTF8' ${locale}`); owned.push(name); return databaseUrlWithDatabase(baseUrl, name);
  }
  async function inspect(url, work) { const db = new Client({ connectionString: postgresCliUrl(url) }); await db.connect(); try { await db.query("SET TIME ZONE 'UTC'"); return await work(db); } finally { await db.end(); } }
  async function waitFor(path) {
    const until = Date.now() + 25_000;
    while (Date.now() < until) { if (await stat(path).catch(() => null)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error("Backup fixture did not reach its owned dump process.");
  }
  function start(args, overrides) {
    const child = spawn(process.execPath, ["scripts/backup-database.mjs", ...args], { env: environment(overrides), stdio: ["ignore", "pipe", "pipe"] }); let output = "";
    child.stdout.on("data", value => { output = (output + value).slice(-10000); }); child.stderr.on("data", value => { output = (output + value).slice(-10000); });
    const finished = new Promise(resolve => child.once("close", code => resolve({ code, output }))); processes.push({ child, finished });
    return { child, finished };
  }
  async function copyBundle(label) {
    const folder = join(directory, label); await mkdir(folder, { mode: 0o700 });
    const destination = join(folder, basename(archive));
    for (const extension of ["", ".manifest.json", ".recovery-state.enc"]) await copyFile(archive + extension, destination + extension);
    return destination;
  }
  async function rejectsBeforeTargetWrite(path) {
    await expect(cli("scripts/restore-database.mjs", ["--input", path], { RESTORE_DATABASE_URL: emptyTarget })).rejects.toThrow();
    await assertDatabaseEmpty(emptyTarget);
    expect(await inspect(emptyTarget, readRecoveryHold)).toBeNull();
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "jitm-bundle-test-"));
    admin = new Client({ connectionString: postgresCliUrl(adminDatabaseUrl(baseUrl)) }); await admin.connect();
    sourceUrl = await database("source"); olderTarget = await database("older"); targetUrl = await database("target"); emptyTarget = await database("empty");
    await cli("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
    source = new Client({ connectionString: postgresCliUrl(sourceUrl) }); await source.connect();
    await source.query(`SET TIME ZONE 'UTC';
      INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('existing','existing@example.test','Existing',now()),('deleted','deleted@example.test','Deleted later',now());
      INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ('workspace','Bundle fixture','bundle-fixture','existing',now());
      INSERT INTO "Contact" (id,"workspaceId","displayName","privateNotes","updatedAt") VALUES ('contact','workspace','Old contact name','PRIVATE_NOTE_REMOVED_LATER',now());
      INSERT INTO "EmailMessage" (id,"payloadHash","recipientHash",category,"firstAttemptAt") VALUES ('message',repeat('a',64),repeat('b',64),'INVITATION',now());
      INSERT INTO "WaitlistEntry" (id,email,status,"updatedAt") VALUES ('waiting','waiting@example.test','WAITING',now()),('A-b','one@example.test','WAITING',now()),('aB','two@example.test','WAITING',now()),('ab','three@example.test','WAITING',now());`);
    await cli("scripts/backup-database.mjs", ["--output", join(directory, "older.enc"), "--retention-days", "0"]);
    await source.query(`BEGIN;
      DELETE FROM "User" WHERE id='deleted';
      INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('new','new@example.test','Created after old backup',now());
      UPDATE "Contact" SET "displayName"='Corrected contact name',"privateNotes"=NULL,"updatedAt"=now();
      UPDATE "EmailMessage" SET "acceptedAt"=now(),"providerId"='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      UPDATE "WaitlistEntry" SET status='WITHDRAWN',"withdrawnAt"=now(),"updatedAt"=now();
      COMMIT;`);
    realDump = (await runCommand("which", ["pg_dump"], { capture: true })).stdout.trim();
    shim = join(directory, "bin"); await mkdir(shim, { mode: 0o700 });
    await writeFile(join(shim, "pg_dump"), `#!/usr/bin/env node
const fs = require('node:fs/promises'), { spawn } = require('node:child_process');
(async () => {
  if (!process.argv.includes('--version')) {
    await fs.writeFile(process.env.BUNDLE_TEST_MARKER, String(process.pid), {flag:'wx',mode:0o600});
    const end = Date.now()+30000;
    while (!(await fs.stat(process.env.BUNDLE_TEST_RELEASE).catch(()=>null))) {
      if(Date.now()>end) throw new Error('Owned dump fixture timed out');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
  const child = spawn(process.env.BUNDLE_TEST_REAL_DUMP,process.argv.slice(2),{stdio:'inherit'});
  child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
})().catch(()=>{process.exitCode=1;});
`, { mode: 0o700 });
    archive = join(directory, "current.jitm-backup.enc");
  }, 60_000);
  afterAll(async () => {
    for (const entry of processes) if (entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill("SIGTERM");
    await Promise.all(processes.map(entry => entry.finished));
    await source?.end();
    if (admin) { for (const name of owned.reverse()) await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`); await admin.end(); }
    if (directory) await rm(directory, { recursive: true, force: true });
  }, 30_000);

  it("captures matching full archive and recovery evidence despite a later concurrent commit", async () => {
    const marker = join(directory, "capture.marker"), release = join(directory, "capture.release");
    const job = start(["--with-recovery-state", "--output", archive, "--retention-days", "0"], { PATH: `${shim}:${process.env.PATH}`, BUNDLE_TEST_REAL_DUMP: realDump, BUNDLE_TEST_MARKER: marker, BUNDLE_TEST_RELEASE: release });
    await waitFor(marker);
    await source.query(`UPDATE "Contact" SET "displayName"='Changed after captured snapshot'; INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('after-capture','later@example.test','Outside the captured point',now());`);
    await writeFile(release, "continue", { mode: 0o600 });
    const result = await job.finished; expect(result.code, result.output).toBe(0);
    manifest = JSON.parse(await readFile(`${archive}.manifest.json`, "utf8"));
    state = await readBackupRecoveryState(archive, manifest, key);
    expect(manifest.recoveryState).toMatchObject({ version: 1, capturedAt: manifest.source.capturedAt, rows: state.rowCount, tables: 99 });
    expect(state.tables.User.rows).toHaveLength(2);
    expect((await captureRecoveryState(sourceUrl)).tables.User.rows).toHaveLength(3);
    for (const path of [archive, `${archive}.manifest.json`, backupRecoveryStatePath(archive)]) expect((await stat(path)).mode & 0o077).toBe(0);
    expect(JSON.stringify(state)).not.toContain("PRIVATE_NOTE_REMOVED_LATER");
  }, 40_000);

  it("restores corrected contents, newer accounts and actual receipt history, then restricts access while held", async () => {
    await cli("scripts/restore-database.mjs", ["--input", join(directory, "older.enc")], { RESTORE_DATABASE_URL: olderTarget });
    await inspect(olderTarget, async db => {
      expect((await db.query('SELECT "privateNotes" FROM "Contact"')).rows[0].privateNotes).toBe("PRIVATE_NOTE_REMOVED_LATER");
      expect((await db.query('SELECT id FROM "User" WHERE id=\'deleted\'')).rowCount).toBe(1);
      expect((await db.query('SELECT "acceptedAt" FROM "EmailMessage"')).rows[0].acceptedAt).toBeNull();
    });
    const output = await cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl });
    expect(output.stdout).toContain('"recoverySnapshotVerified": true'); expect(output.stdout).toContain('"applicationReady": false');
    const hold = await inspect(targetUrl, async db => {
      expect((await db.query('SELECT "displayName","privateNotes" FROM "Contact"')).rows[0]).toEqual({ displayName: "Corrected contact name", privateNotes: null });
      expect((await db.query('SELECT id FROM "User" ORDER BY id')).rows.map(row => row.id)).toEqual(["existing", "new"]);
      expect((await db.query('SELECT "acceptedAt","providerId" FROM "EmailMessage"')).rows[0]).toEqual({ acceptedAt: expect.any(Date), providerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
      expect((await db.query('SELECT status FROM "WaitlistEntry" WHERE id=\'waiting\'')).rows[0].status).toBe("WITHDRAWN");
      return readRecoveryHold(db);
    });
    expect(hold.recoverySnapshot).toMatchObject({ stateId: state.id, stateDigest: recoveryStateDigest(state), targetDigest: recoveryTargetDigest(state) });
    const restoredState = await captureRecoveryState(targetUrl, { targetHold: hold });
    expect(restoredState.tables.WaitlistEntry.rows.map(row => row.key)).not.toEqual(state.tables.WaitlistEntry.rows.map(row => row.key));
    expect(recoveryTargetDigest(restoredState)).toBe(recoveryTargetDigest(state));
    const plan = join(directory, "restrictions.json"), receipt = join(directory, "restricted.json");
    const args = ["--state", backupRecoveryStatePath(archive), "--backup-manifest", `${archive}.manifest.json`];
    await cli("scripts/reconcile-recovery-state.mjs", [...args, "--output", plan], { RESTORE_DATABASE_URL: targetUrl });
    await cli("scripts/reconcile-recovery-state.mjs", [...args, "--apply", "--plan", plan, "--operator", "Bundle fixture", "--reason", "Restrict the complete restored snapshot", "--output", receipt], { RESTORE_DATABASE_URL: targetUrl });
    const finalHold = await inspect(targetUrl, readRecoveryHold);
    expect(finalHold.id).toBe(hold.id); expect(finalHold.restrictions.beforeDigest).toBe(hold.recoverySnapshot.targetDigest);
    expect(finalHold.restrictions.releaseAllowed).toBe(false);
  }, 60_000);

  it("refuses missing, symlinked, corrupted and substituted sidecars before any target writes", async () => {
    for (const kind of ["missing", "symlink", "corrupt", "substitute"]) {
      const path = await copyBundle(kind), sidecar = backupRecoveryStatePath(path); await rm(sidecar);
      if (kind === "symlink") await symlink(backupRecoveryStatePath(archive), sidecar);
      if (kind === "corrupt") { const bytes = await readFile(backupRecoveryStatePath(archive)); bytes[bytes.length - 1] ^= 1; await writeFile(sidecar, bytes); }
      if (kind === "substitute") await writeRecoveryState(await captureRecoveryState(sourceUrl), sidecar, key);
      await rejectsBeforeTargetWrite(path);
    }
  }, 30_000);

  it("checks complete-row digests and prevents a signed descriptor from selecting another path", async () => {
    const path = await copyBundle("digest-conflict"), altered = structuredClone(state);
    altered.tables.Contact.rows[0].digest = "f".repeat(64);
    await rm(backupRecoveryStatePath(path)); await writeRecoveryState(altered, backupRecoveryStatePath(path), key);
    const proof = structuredClone(manifest);
    proof.recoveryState.sha256 = await sha256File(backupRecoveryStatePath(path)); proof.recoveryState.bytes = (await stat(backupRecoveryStatePath(path))).size; proof.recoveryState.stateDigest = recoveryStateDigest(altered);
    proof.authentication = authenticateBackupManifest(proof, key);
    await writeFile(`${path}.manifest.json`, JSON.stringify(proof)); await rejectsBeforeTargetWrite(path);
    const traversal = await copyBundle("path-conflict"), redirected = structuredClone(manifest);
    redirected.recoveryState.file = "../current.jitm-backup.enc.recovery-state.enc"; redirected.authentication = authenticateBackupManifest(redirected, key);
    await writeFile(`${traversal}.manifest.json`, JSON.stringify(redirected)); await rejectsBeforeTargetWrite(traversal);
  }, 30_000);

  it.each(["", ".recovery-state.enc", ".manifest.json"])("preserves an existing %s output and removes only its own incomplete publication", async extension => {
    const folder = join(directory, `collision-${randomUUID()}`); await mkdir(folder); const path = join(folder, "collision.jitm-backup.enc");
    await writeFile(path + extension, "existing private evidence", { mode: 0o600 });
    await expect(cli("scripts/backup-database.mjs", ["--with-recovery-state", "--output", path, "--retention-days", "0"])).rejects.toThrow();
    expect(await readFile(path + extension, "utf8")).toBe("existing private evidence");
    expect(await readdir(folder)).toEqual([basename(path + extension)]);
  }, 30_000);

  it("retires each expired bundle's fixed adjacent sidecar without following manifest paths", async () => {
    const older = await copyBundle("retention"), folder = join(directory, "retention"), old = new Date(Date.now() - 3 * 86400_000);
    await utimes(older, old, old);
    const next = join(folder, "next.jitm-backup.enc");
    await cli("scripts/backup-database.mjs", ["--with-recovery-state", "--output", next, "--retention-days", "1"]);
    expect((await readdir(folder)).sort()).toEqual([basename(next), basename(next) + ".manifest.json", basename(next) + ".recovery-state.enc"].sort());
    expect(await readBackupRecoveryState(next, JSON.parse(await readFile(`${next}.manifest.json`, "utf8")), key)).toBeTruthy();
  }, 30_000);

  it("cancels an active dump process and removes owned staging without publishing or replacing the success receipt", async () => {
    const temporary = join(directory, "cancel-temp"); await mkdir(temporary, { mode: 0o700 });
    const output = join(directory, "canceled.enc"), marker = join(directory, "cancel.marker"), receipt = join(directory, "last-success.json");
    await writeFile(receipt, "previous successful receipt", { mode: 0o600 });
    const job = start(["--with-recovery-state", "--output", output, "--retention-days", "0"], { TMPDIR: temporary, PATH: `${shim}:${process.env.PATH}`, BUNDLE_TEST_REAL_DUMP: realDump, BUNDLE_TEST_MARKER: marker, BUNDLE_TEST_RELEASE: join(directory, "never-release"), OPS_BACKUP_RECEIPT_FILE: receipt });
    await waitFor(marker); const dumpPid = Number(await readFile(marker, "utf8")); job.child.kill("SIGTERM");
    expect((await job.finished).code).toBe(130);
    expect(() => process.kill(dumpPid, 0)).toThrow();
    expect(await readdir(temporary)).toEqual([]);
    expect(await stat(output).catch(() => null)).toBeNull();
    expect(await readFile(receipt, "utf8")).toBe("previous successful receipt");
  }, 40_000);
});
