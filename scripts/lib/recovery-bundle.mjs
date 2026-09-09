import { createHash } from "node:crypto";
import { basename } from "node:path";
import { verifyBackupManifestAuthentication } from "./backup-manifest.mjs";
import { readRecoveryState, recoveryStateDigest, validateRecoveryState } from "./recovery-state.mjs";

export const backupRecoveryStatePath = archive => `${archive}.recovery-state.enc`;
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Complete row hashes in the evidence must reproduce the archive manifest's
// table digests, including tables whose private contents are not in the evidence.
export function assertRecoverySnapshot(state, snapshot) {
  validateRecoveryState(state);
  const names = Object.keys(state.tables).sort();
  assert(snapshot?.schema === state.schema && snapshot.capturedAt === state.capturedAt && snapshot.contentHashAlgorithm === "sha256-jsonb-sorted-v1" && Array.isArray(snapshot.tableNames) && JSON.stringify(names) === JSON.stringify([...snapshot.tableNames].sort()) && snapshot.tableCount === names.length, "Recovery evidence and archive do not describe the same snapshot.");
  for (const name of names) {
    const rows = state.tables[name].rows;
    const digest = createHash("sha256");
    for (const value of rows.map(row => row.digest).sort()) digest.update(`${value}\n`);
    assert(snapshot.tableCounts?.[name] === String(rows.length) && snapshot.tableDigests?.[name] === digest.digest("hex"), "Recovery evidence does not match the archive's complete table contents.");
  }
}

export function recoveryBundleDescriptor(state, snapshot, { file, bytes, sha256 }) {
  assertRecoverySnapshot(state, snapshot);
  assert(typeof file === "string" && basename(file) === file && Number.isSafeInteger(bytes) && bytes > 0 && hash(sha256), "Recovery evidence file metadata is invalid.");
  return { version: 1, file, bytes, sha256, stateId: state.id, stateDigest: recoveryStateDigest(state), capturedAt: state.capturedAt, schemaHash: state.schemaHash, rows: state.rowCount, tables: Object.keys(state.tables).length };
}

export async function readBackupRecoveryState(archive, manifest, key, { signal } = {}) {
  assert(manifest?.manifestVersion === 2 && verifyBackupManifestAuthentication(manifest, key), "A recovery bundle requires an authenticated backup manifest.");
  const proof = manifest.recoveryState;
  const path = backupRecoveryStatePath(archive);
  assert(proof && proof.version === 1 && proof.file === basename(path) && Number.isSafeInteger(proof.bytes) && proof.bytes > 0 && hash(proof.sha256) && hash(proof.stateDigest) && hash(proof.schemaHash), "Recovery bundle metadata is missing or invalid. Keep all original bundle filenames together.");
  const state = await readRecoveryState(path, key, { signal, expectedSha256: proof.sha256, expectedBytes: proof.bytes });
  assert(state.sourceHash === manifest.source?.operationsSourceHash, "Recovery bundle source identity does not match.");
  const expected = recoveryBundleDescriptor(state, manifest.source, { file: basename(path), bytes: proof.bytes, sha256: proof.sha256 });
  assert(recoveryStateDigest(proof) === recoveryStateDigest(expected), "Recovery bundle evidence binding does not match.");
  return state;
}
