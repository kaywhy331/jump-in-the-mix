import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptFile, sha256File } from "../scripts/lib/backup-archive.mjs";
import { readRecoveryHold } from "../scripts/lib/recovery-hold.mjs";
import {
  adminDatabaseUrl, assertDatabaseEmpty, collectDatabaseSnapshot, compareSnapshots,
  databaseUrlWithDatabase, postgresCliEnv, postgresCliUrl, quoteIdentifier,
  runCommand, verifyForeignKeys, withDatabaseSnapshot
} from "../scripts/lib/postgres-ops.mjs";

// Opt in only against loopback PostgreSQL with CREATE DATABASE permission.
// All fixtures live in uniquely named databases owned and removed by this suite.
const baseUrl = process.env.RECOVERY_TEST_DATABASE_URL;
if (baseUrl && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Recovery integration tests require a loopback database server.");
}
describe.skipIf(!baseUrl)("encrypted PostgreSQL recovery", () => {
  let admin, source, directory, sourceUrl;
  const owned = [];
  const key = randomBytes(32).toString("hex");
  async function database() {
    const name = `jitm_recovery_test_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0`);
    owned.push(name);
    return databaseUrlWithDatabase(baseUrl, name);
  }
  function cli(script, args = [], env = {}) {
    return runCommand(process.execPath, [script, ...args], {
      capture: true,
      env: { DATABASE_URL: sourceUrl, BACKUP_ENCRYPTION_KEY: key, OPS_ALERT_WEBHOOK_URL: "", OPS_BACKUP_RECEIPT_FILE: "", OPS_RESTORE_RECEIPT_FILE: "", ...env }
    });
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "jitm-recovery-test-"));
    admin = new Client({ connectionString: postgresCliUrl(adminDatabaseUrl(baseUrl)) });
    await admin.connect();
    sourceUrl = await database();
    source = new Client({ connectionString: postgresCliUrl(sourceUrl) });
    await source.connect();
    await source.query(`
      CREATE TABLE "FutureJourneyData" (id int PRIMARY KEY, note text, updated_at timestamptz, payload jsonb);
      INSERT INTO "FutureJourneyData" VALUES
        (2, 'second', '2026-09-06T02:00:00+02', '{"nested":[1,2]}'),
        (1, 'first', '2026-09-06T00:00:00Z', '{"value":true}');
      CREATE TABLE "_prisma_migrations" (migration_name text, started_at timestamptz, finished_at timestamptz, rolled_back_at timestamptz);
      INSERT INTO "_prisma_migrations" VALUES ('recovery_fixture', now(), now(), null);
    `);
  }, 30000);
  afterAll(async () => {
    await source?.end();
    try {
      for (const name of owned) await admin.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`);
    } finally {
      await admin?.end();
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }, 30000);

  it("discovers new tables, ignores row order, and detects same-count content changes", async () => {
    const before = await collectDatabaseSnapshot(sourceUrl);
    expect(before.tableNames).toEqual(["FutureJourneyData", "_prisma_migrations"]);
    expect(before.tableCounts.FutureJourneyData).toBe("2");
    await source.query(`BEGIN; CREATE TEMP TABLE reordered AS SELECT * FROM "FutureJourneyData" ORDER BY id;
      DELETE FROM "FutureJourneyData"; INSERT INTO "FutureJourneyData" SELECT * FROM reordered; DROP TABLE reordered; COMMIT;`);
    expect(compareSnapshots(before, await collectDatabaseSnapshot(sourceUrl))).toEqual([]);
    await source.query(`UPDATE "FutureJourneyData" SET note = 'changed' WHERE id = 1`);
    expect(compareSnapshots(before, await collectDatabaseSnapshot(sourceUrl))).toEqual(["FutureJourneyData row contents differ"]);
  }, 30000);

  it("checks discovered composite, nullable, cross-schema, and unvalidated foreign keys", async () => {
    await source.query(`CREATE SCHEMA related;
      CREATE TABLE related.parent (a int, b int, PRIMARY KEY (a,b));
      INSERT INTO related.parent VALUES (1,2);
      CREATE TABLE "SimpleChild" (x int, y int);
      INSERT INTO "SimpleChild" VALUES (2,1), (null,8), (null,null), (9,9);
      ALTER TABLE "SimpleChild" ADD CONSTRAINT "reversed key" FOREIGN KEY (y,x) REFERENCES related.parent (a,b) NOT VALID;
      CREATE TABLE "FullChild" (x int, y int);
      INSERT INTO "FullChild" VALUES (1,2), (null,null);
      ALTER TABLE "FullChild" ADD CONSTRAINT "full key" FOREIGN KEY (x,y) REFERENCES related.parent (a,b) MATCH FULL NOT VALID;`);
    try {
      await expect(verifyForeignKeys(source, "public")).rejects.toThrow(/reversed key.*1 row/u);
      await source.query('DELETE FROM "SimpleChild" WHERE x = 9');
      expect(await verifyForeignKeys(source, "public")).toHaveLength(2);
      // Insert a legacy partially-null row before declaring its constraint.
      await source.query(`ALTER TABLE "FullChild" DROP CONSTRAINT "full key";
        INSERT INTO "FullChild" VALUES (1,null);
        ALTER TABLE "FullChild" ADD CONSTRAINT "full key" FOREIGN KEY (x,y) REFERENCES related.parent (a,b) MATCH FULL NOT VALID;`);
      await expect(verifyForeignKeys(source, "public")).rejects.toThrow(/full key.*1 row/u);
    } finally {
      await source.query('DROP TABLE "SimpleChild", "FullChild"; DROP SCHEMA related CASCADE');
    }
  }, 30000);

  it("uses an exported snapshot even when another connection commits before pg_dump", async () => {
    const archive = join(directory, "concurrent.enc"), dump = join(directory, "concurrent.dump");
    const expected = await withDatabaseSnapshot(sourceUrl, async ({ snapshot, snapshotId }) => {
      await source.query(`INSERT INTO "FutureJourneyData" VALUES (3, 'committed later', now(), '{}')`);
      await runCommand("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--schema", '"public"', "--strict-names", "--snapshot", snapshotId, "--file", dump], { capture: true, env: postgresCliEnv(sourceUrl) });
      return snapshot;
    });
    expect((await collectDatabaseSnapshot(sourceUrl)).tableCounts.FutureJourneyData).toBe("3");
    await encryptFile(dump, archive, key);
    await writeFile(`${archive}.manifest.json`, JSON.stringify({ manifestVersion: 2, archive: { sha256: await sha256File(archive) }, source: expected }));
    const targetUrl = await database();
    const restored = await cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl });
    expect(restored.stdout).toContain('"contentVerified": true');
    expect(compareSnapshots(expected, await collectDatabaseSnapshot(targetUrl))).toEqual([]);
  }, 30000);

  it("round-trips the current manifest and smoke test; protects same and nonempty databases", async () => {
    const archive = join(directory, "current.enc");
    await cli("scripts/backup-database.mjs", ["--output", archive, "--retention-days", "0"]);
    const manifest = JSON.parse(await readFile(`${archive}.manifest.json`, "utf8"));
    expect(manifest.manifestVersion).toBe(2);
    expect(manifest.source.captureMethod).toBe("exported-postgres-snapshot");
    expect(manifest.authentication).toMatchObject({ version: 1, algorithm: "hmac-sha256" });
    await expect(cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: sourceUrl })).rejects.toThrow(/different database/u);
    const targetUrl = await database();
    await cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl });
    expect(compareSnapshots(manifest.source, await collectDatabaseSnapshot(targetUrl))).toEqual([]);
    const held = new Client({ connectionString: postgresCliUrl(targetUrl) }); await held.connect();
    try { expect(await readRecoveryHold(held)).toMatchObject({ archiveSha256: manifest.archive.sha256, sourceHash: manifest.source.operationsSourceHash, manifestAuthenticated: true, contentVerified: true, verifiedAt: expect.any(String) }); }
    finally { await held.end(); }
    await expect(cli("scripts/backup-database.mjs", ["--output", join(directory, "held-source.enc")], { DATABASE_URL: targetUrl })).rejects.toThrow("recovery hold");
    expect((await cli("scripts/smoke-restored-database.mjs", [], { RESTORE_DATABASE_URL: targetUrl })).stdout).toContain('"status": "ok"');
    await expect(cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl })).rejects.toThrow(/not empty/u);
    const wrongSchema = new URL(await database()); wrongSchema.searchParams.set("schema", "different");
    await expect(cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: wrongSchema.toString() })).rejects.toThrow(/schema must match/u);
    await assertDatabaseEmpty(wrongSchema.toString());
  }, 30000);

  it("records backup evidence only after success and qualifies a separate restore before recording its receipt", async () => {
    const archive = join(directory, `ops-${randomUUID()}.jitm-backup.enc`), backupReceipt = join(directory, `backup-${randomUUID()}.json`), restoreReceipt = join(directory, `restore-${randomUUID()}.json`);
    await cli("scripts/backup-database.mjs", ["--output", archive, "--retention-days", "0"], { OPS_BACKUP_RECEIPT_FILE: backupReceipt });
    const backup = JSON.parse(await readFile(backupReceipt, "utf8"));
    expect(backup).toMatchObject({ version: 1, kind: "backup", archivePath: archive }); expect(backup.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    const { readOperationsArtifactAges } = await import("../scripts/lib/operations-artifacts.mjs");
    expect((await readOperationsArtifactAges(sourceUrl, new Date(), { OPS_BACKUP_RECEIPT_FILE: backupReceipt })).backupAgeHours).toBeLessThan(1);
    const targetUrl = await database();
    await cli("scripts/qualify-backup.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl, OPS_RESTORE_RECEIPT_FILE: restoreReceipt });
    const proof = JSON.parse(await readFile(restoreReceipt, "utf8"));
    expect(proof).toMatchObject({ kind: "restore", sourceHash: backup.sourceHash, archiveSha256: backup.archiveSha256, contentVerified: true, foreignKeysVerified: true });
    expect((await readOperationsArtifactAges(sourceUrl, new Date(), { OPS_RESTORE_RECEIPT_FILE: restoreReceipt })).restoreAgeDays).toBeLessThan(1);
    // The now-populated target cannot be restored again. Preserve the last successful proof.
    await expect(cli("scripts/qualify-backup.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl, OPS_RESTORE_RECEIPT_FILE: restoreReceipt })).rejects.toThrow();
    expect(JSON.parse(await readFile(restoreReceipt, "utf8"))).toEqual(proof);
    expect((await readOperationsArtifactAges(targetUrl, new Date(), { OPS_BACKUP_RECEIPT_FILE: backupReceipt, OPS_RESTORE_RECEIPT_FILE: restoreReceipt }))).toEqual({ backupAgeHours: null, restoreAgeDays: null });
  });

  it("restores legacy manifests and rejects tampering or a wrong key before writing data", async () => {
    const archive = join(directory, "legacy-source.enc");
    await cli("scripts/backup-database.mjs", ["--output", archive, "--retention-days", "0"]);
    const manifest = JSON.parse(await readFile(`${archive}.manifest.json`, "utf8"));
    const legacy = structuredClone(manifest); legacy.manifestVersion = 1;
    delete legacy.authentication;
    delete legacy.source.tableDigests; delete legacy.source.tableNames; delete legacy.source.contentHashAlgorithm;
    const legacyPath = join(directory, "legacy.json"); await writeFile(legacyPath, JSON.stringify(legacy));
    const restored = await cli("scripts/restore-database.mjs", ["--input", archive, "--manifest", legacyPath], { RESTORE_DATABASE_URL: await database() });
    expect(restored.stdout).toContain('"contentVerified": false');
    const targetUrl = await database();
    await expect(cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex") })).rejects.toThrow(/authenticated/u);
    await assertDatabaseEmpty(targetUrl);
    const corrupt = join(directory, "tampered.enc");
    const bytes = await readFile(archive); bytes[Math.floor(bytes.length / 2)] ^= 1;
    await writeFile(corrupt, bytes);
    await expect(cli("scripts/restore-database.mjs", ["--input", corrupt, "--manifest", `${archive}.manifest.json`], { RESTORE_DATABASE_URL: targetUrl })).rejects.toThrow(/checksum/u);
    manifest.archive.sha256 = await sha256File(corrupt);
    const corruptManifest = join(directory, "tampered.json"); await writeFile(corruptManifest, JSON.stringify(manifest));
    await expect(cli("scripts/restore-database.mjs", ["--input", corrupt, "--manifest", corruptManifest], { RESTORE_DATABASE_URL: targetUrl })).rejects.toThrow(/authenticated/u);
    await assertDatabaseEmpty(targetUrl);
  }, 30000);
  it("requires other target clients to be stopped before loading restored data", async () => {
    const archive = join(directory, "target-clients.enc"); await cli("scripts/backup-database.mjs", ["--output", archive]);
    const targetUrl = await database();
    const connected = new Client({ connectionString: postgresCliUrl(targetUrl) }); await connected.connect();
    try {
      await expect(cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl })).rejects.toThrow("Stop other clients");
      expect(await readRecoveryHold(connected)).toBeNull(); await assertDatabaseEmpty(targetUrl);
    } finally { await connected.end(); }
    await cli("scripts/restore-database.mjs", ["--input", archive], { RESTORE_DATABASE_URL: targetUrl });
  }, 30000);
});
