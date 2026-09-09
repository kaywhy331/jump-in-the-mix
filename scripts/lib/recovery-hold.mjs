import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { postgresCliUrl } from "./postgres-ops.mjs";
import { recoveryHoldQuery, recoveryHoldSetting } from "../../src/lib/recovery-hold-query.mjs";

export async function writeRecoveryHold(client, hold) {
  // PostgreSQL quotes the value under this connection's string-literal settings.
  // Bind to the database actually connected, including through a connection proxy.
  const command = (await client.query("SELECT format('ALTER DATABASE %I SET jitm.recovery_hold TO %L', current_database(), $1::text) AS sql", [JSON.stringify(hold)])).rows[0].sql;
  await client.query(command);
}

export async function readRecoveryHold(client) {
  const rows = (await client.query(recoveryHoldQuery)).rows;
  if (!rows.length) return null;
  if (rows.length !== 1) throw new Error("Recovery hold metadata is invalid. Keep the target isolated.");
  let value;
  try { value = JSON.parse(rows[0].value.slice(recoveryHoldSetting.length + 1)); } catch { throw new Error("Recovery hold metadata is invalid. Keep the target isolated."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 || typeof value.id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value.id) || !/^[a-f0-9]{64}$/.test(value.archiveSha256) || (value.sourceHash !== null && !/^[a-f0-9]{64}$/.test(value.sourceHash)) || !Number.isFinite(Date.parse(value.startedAt))) throw new Error("Recovery hold metadata is invalid. Keep the target isolated.");
  return value;
}

export async function beginRecoveryHold(databaseUrl, { archiveSha256, sourceHash = null, requireNoOtherClients = false }) {
  if (!/^[a-f0-9]{64}$/.test(archiveSha256) || (sourceHash !== null && !/^[a-f0-9]{64}$/.test(sourceHash))) throw new Error("Recovery source identifiers are invalid.");
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl), connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(814733, 7)");
    if (requireNoOtherClients && (await client.query("SELECT 1 FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid() LIMIT 1")).rows.length) throw new Error("Stop other clients connected to the restore target before loading data.");
    const existing = await readRecoveryHold(client);
    if (existing) {
      if (existing.archiveSha256 !== archiveSha256 || existing.sourceHash !== sourceHash) throw new Error("This target already has a different recovery hold. Use a separate empty database.");
      await client.query("COMMIT"); return existing;
    }
    const hold = { version: 1, id: randomUUID(), archiveSha256, sourceHash, startedAt: new Date().toISOString() };
    await writeRecoveryHold(client, hold);
    await client.query("COMMIT"); return hold;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

export async function recordRecoveryVerification(databaseUrl, expected, proof) {
  if (typeof proof.manifestAuthenticated !== "boolean" || typeof proof.contentVerified !== "boolean") throw new Error("Recovery verification is incomplete.");
  if (proof.recoverySnapshot && (proof.manifestAuthenticated !== true || proof.contentVerified !== true || proof.recoverySnapshot.version !== 1 || !["stateDigest", "schemaHash", "targetDigest"].every(field => /^[a-f0-9]{64}$/.test(proof.recoverySnapshot[field])) || !Number.isFinite(Date.parse(proof.recoverySnapshot.sourceCapturedAt)) || !/^[a-f0-9-]{36}$/.test(proof.recoverySnapshot.stateId))) throw new Error("Recovery snapshot verification is incomplete.");
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl), connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await client.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(814733, 7)");
    const hold = await readRecoveryHold(client);
    if (!hold || hold.id !== expected.id || hold.archiveSha256 !== expected.archiveSha256) throw new Error("The recovery hold changed during verification. Keep the target isolated.");
    const verified = { ...hold, verifiedAt: new Date().toISOString(), manifestAuthenticated: proof.manifestAuthenticated, contentVerified: proof.contentVerified, ...(proof.recoverySnapshot ? { recoverySnapshot: proof.recoverySnapshot } : {}) };
    await writeRecoveryHold(client, verified);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}
