import "dotenv/config";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { decryptFile, sha256File } from "./lib/backup-archive.mjs";
import {
  assertDatabaseEmpty,
  assertBackupManifest,
  collectDatabaseSnapshot,
  commandVersion,
  compareSnapshots,
  databaseIdentity,
  normalizePgRestoreSql,
  postgresCliEnv,
  runCommand,
  sameDatabase
} from "./lib/postgres-ops.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";
import { beginRecoveryHold, recordRecoveryVerification } from "./lib/recovery-hold.mjs";
import { verifyBackupManifestAuthentication } from "./lib/backup-manifest.mjs";
import { privateJson } from "./lib/operations-artifacts.mjs";
import { readBackupRecoveryState } from "./lib/recovery-bundle.mjs";
import { captureRecoveryState, recoveryStateDigest, recoveryTargetDigest } from "./lib/recovery-state.mjs";

function argument(name) {
  const direct = process.argv.find((item) => item.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadManifest(path) {
  const manifest = await privateJson(path);
  assertBackupManifest(manifest);
  return manifest;
}

async function main() {
  const archiveInput = argument("--input");
  if (!archiveInput) throw new Error("Pass the encrypted archive with --input <path>.");
  const archivePath = resolve(archiveInput);
  await access(archivePath);

  const targetUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!targetUrl) throw new Error("RESTORE_DATABASE_URL is required. Database credentials are not accepted as command-line arguments.");
  if (process.env.DATABASE_URL && sameDatabase(process.env.DATABASE_URL, targetUrl)) {
    throw new Error("Restore target must be a different database from DATABASE_URL. In-place production restores are intentionally blocked.");
  }
  const target = databaseIdentity(targetUrl);

  const manifestFile = resolve(argument("--manifest") ?? `${archivePath}.manifest.json`);
  const manifest = await loadManifest(manifestFile);
  const manifestAuthenticated = verifyBackupManifestAuthentication(manifest);
  if (target.schema !== manifest.source.schema) {
    throw new Error("Restore target schema must match the backup source schema. Use that schema in a separate empty database.");
  }
  const checksum = await sha256File(archivePath);
  if (checksum !== manifest.archive.sha256) {
    throw new Error("Encrypted archive checksum does not match its manifest.");
  }
  // When present, the signed sidecar is mandatory and verified before touching
  // the target. A plain legacy archive remains supported without this proof.
  const recoveryState = Object.hasOwn(manifest, "recoveryState") ? await readBackupRecoveryState(archivePath, manifest) : null;

  await assertDatabaseEmpty(targetUrl);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "jitm-restore-"));
  const rawDumpPath = join(temporaryDirectory, "database.dump");
  const sqlDumpPath = join(temporaryDirectory, "database.sql");
  try {
    const [pgRestoreVersion, psqlVersion] = await Promise.all([
      commandVersion("pg_restore"),
      commandVersion("psql")
    ]);
    await decryptFile(archivePath, rawDumpPath);
    // The hold lives in database metadata outside the restored application
    // schema. Restore/verification failures leave it in place.
    const recovery = await beginRecoveryHold(targetUrl, { archiveSha256: checksum, sourceHash: manifestAuthenticated ? manifest.source.operationsSourceHash ?? null : null, requireNoOtherClients: true });
    await runCommand("pg_restore", [
      "--clean",
      "--if-exists",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--file",
      sqlDumpPath,
      rawDumpPath
    ]);
    const generatedSql = await readFile(sqlDumpPath, "utf8");
    const transactionTimeoutRemoved = /^SET transaction_timeout = 0;\r?\n/mu.test(generatedSql);
    const compatibleSql = normalizePgRestoreSql(generatedSql, {
      schema: target.schema,
      requiredExtensions: manifest.source.requiredExtensions ?? ["pg_trgm"]
    });
    if (compatibleSql !== generatedSql) await writeFile(sqlDumpPath, compatibleSql, "utf8");
    await runCommand("psql", [
      "-d",
      target.database,
      "--single-transaction",
      "--set",
      "ON_ERROR_STOP=1",
      "--file",
      sqlDumpPath
    ], { env: postgresCliEnv(targetUrl) });

    const restored = await collectDatabaseSnapshot(targetUrl);
    const differences = compareSnapshots(manifest.source, restored);
    if (differences.length) {
      throw new Error(`Restored database did not match the backup manifest: ${differences.join("; ")}`);
    }
    let recoverySnapshot;
    if (recoveryState) {
      const actual = await captureRecoveryState(targetUrl, { targetHold: recovery });
      if (recoveryTargetDigest(actual) !== recoveryTargetDigest(recoveryState)) throw new Error("Restored rows and schema do not match the bundled recovery evidence. Keep the target held.");
      recoverySnapshot = { version: 1, stateId: recoveryState.id, stateDigest: recoveryStateDigest(recoveryState), sourceCapturedAt: recoveryState.capturedAt, schemaHash: recoveryState.schemaHash, targetDigest: recoveryTargetDigest(actual) };
    }
    await recordRecoveryVerification(targetUrl, recovery, { manifestAuthenticated, contentVerified: Boolean(manifest.source.tableDigests), recoverySnapshot });

    console.log(JSON.stringify({
      status: "ok",
      recovery: "held",
      recoveryId: recovery.id,
      targetDatabase: target.database,
      targetSchema: target.schema,
      tableCount: restored.tableCount,
      appliedMigrations: restored.appliedMigrationNames.length,
      pgRestoreVersion,
      psqlVersion,
      compatibilitySettingsRemoved: transactionTimeoutRemoved ? ["transaction_timeout=0"] : [],
      restoredExtensions: manifest.source.requiredExtensions ?? ["pg_trgm"],
      contentVerified: Boolean(manifest.source.tableDigests),
      manifestVerified: true,
      manifestAuthenticated,
      ...(recoverySnapshot ? { recoverySnapshotVerified: true, stateId: recoverySnapshot.stateId, sourceCapturedAt: recoverySnapshot.sourceCapturedAt, applicationReady: false, continuousCoverage: false } : {})
    }, null, 2));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Restore failed: ${message}`);
  await sendOpsAlert({
    title: "Database restore failed",
    summary: "The isolated restore command failed. Review its private runner logs.",
    details: { command: "db:restore" }
  });
  process.exitCode = 1;
});
