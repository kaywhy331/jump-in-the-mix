import { createHmac, timingSafeEqual } from "node:crypto";
import { Client } from "pg";
import { parseBackupKey } from "./backup-archive.mjs";
import { operationsSourceHash } from "./operations-artifacts.mjs";
import { postgresCliUrl, quoteIdentifier, sameDatabase } from "./postgres-ops.mjs";
import { verifySourceCutoff } from "./recovery-cutoff.mjs";
import { readRecoveryHold, writeRecoveryHold } from "./recovery-hold.mjs";
import { requireRecoveryRelease } from "./recovery-restrictions.mjs";
import { captureRecoveryStateInTransaction, recoveryStateDigest, recoveryTargetDigest } from "./recovery-state.mjs";

const PURPOSE = "jitm.recovery-target-cutoff";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function sign(value, key) {
  const { authentication: _, ...payload } = value;
  const derived = createHmac("sha256", parseBackupKey(key)).update(PURPOSE).digest();
  return createHmac("sha256", derived).update(recoveryStateDigest(payload)).digest("hex");
}
function verify(value, key) {
  assert(value?.version === 1 && value.purpose === PURPOSE && /^[a-f0-9]{64}$/.test(value.authentication ?? "") && timingSafeEqual(Buffer.from(value.authentication, "hex"), Buffer.from(sign(value, key), "hex")), "The target cutoff could not be authenticated.");
  assert(value.applicationReady === false && value.releaseAllowed === false, "A bound cutoff cannot authorize reopening.");
}
function lineage(hold, source) {
  assert(hold?.manifestAuthenticated === true && hold.contentVerified === true && hold.sourceHash === source.sourceHash && hold.archiveSha256 === source.archiveSha256, "The target hold identifies another archive or source.");
  assert(hold.recoverySnapshot?.stateDigest === source.stateDigest && hold.recoverySnapshot.targetDigest === source.contentDigest, "The target must have a verified complete recovery bundle.");
  assert(hold.restrictions?.stateDigest === source.stateDigest && hold.restrictions.beforeDigest === source.contentDigest && hold.restrictions.releaseAllowed === false, "Restrictions must have been applied directly to the complete matching restore.");
}

export function verifyTargetCutoffBinding(hold, source, targetUrl, key) {
  lineage(hold, source);
  verify(hold.cutoff, key);
  const receipt = hold.cutoff;
  assert(receipt.recoveryId === hold.id && receipt.archiveSha256 === hold.archiveSha256 && receipt.sourceHash === source.sourceHash && receipt.stateDigest === source.stateDigest && receipt.targetSourceHash === operationsSourceHash(targetUrl) && receipt.targetDigest === hold.restrictions.afterDigest && receipt.sourceReceiptDigest === recoveryStateDigest(source) && receipt.restrictionPlanDigest === hold.restrictions.planDigest, "The target cutoff binding changed.");
  return receipt;
}

/** Bind or reverify evidence while retaining the hold; never modifies application rows. */
export async function targetRecoveryCutoff(sourceUrl, targetUrl, sourceReceipt, { key, operator, reason, signal, verifyOnly = false } = {}) {
  signal?.throwIfAborted();
  assert(!sameDatabase(sourceUrl, targetUrl), "Recovery requires separate source and target databases.");
  await verifySourceCutoff(sourceUrl, sourceReceipt, { key, signal });
  if (!verifyOnly) assert(typeof operator === "string" && operator.trim().length >= 2 && operator.length <= 100 && typeof reason === "string" && reason.trim().length >= 8 && reason.length <= 500, "Record the target recovery operator and reason.");
  const client = new Client({ connectionString: postgresCliUrl(targetUrl), connectionTimeoutMillis: 5000, statement_timeout: 15_000, application_name: "jitm-recovery-target-cutoff" });
  client.on("error", () => undefined); await client.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(814733,7)");
    const owned = (await client.query("SELECT d.datdba=r.oid OR r.rolsuper AS allowed FROM pg_database d CROSS JOIN pg_roles r WHERE d.datname=current_database() AND r.rolname=current_user")).rows[0]?.allowed;
    assert(owned, "Target cutoff checks require the target database owner.");
    assert(!(await client.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid() LIMIT 1")).rowCount, "Stop other target clients before binding recovery evidence.");
    const hold = await readRecoveryHold(client); lineage(hold, sourceReceipt);
    const names = (await client.query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','f') ORDER BY c.relname")).rows.map(row => row.name);
    assert(names.length && names.length <= 500, "Target table inventory is unsupported.");
    await client.query(`LOCK TABLE ${names.map(name => `public.${quoteIdentifier(name)}`).join(",")} IN ${verifyOnly ? "SHARE" : "ACCESS EXCLUSIVE"} MODE`);
    await requireRecoveryRelease(client);
    const current = await captureRecoveryStateInTransaction(client, targetUrl, { targetHold: hold, signal });
    const targetDigest = recoveryTargetDigest(current), sourceReceiptDigest = recoveryStateDigest(sourceReceipt);
    assert(targetDigest === hold.restrictions.afterDigest, "The target no longer matches the committed restriction receipt.");
    // The source can be administratively reopened during a long target scan.
    // Verify its catalog-bound receipt again before recording this observation.
    await verifySourceCutoff(sourceUrl, sourceReceipt, { key, signal });
    if (hold.cutoff) {
      verify(hold.cutoff, key);
      assert(hold.cutoff.recoveryId === hold.id && hold.cutoff.targetSourceHash === operationsSourceHash(targetUrl) && hold.cutoff.targetDigest === targetDigest && hold.cutoff.sourceReceiptDigest === sourceReceiptDigest && hold.cutoff.restrictionPlanDigest === hold.restrictions.planDigest, "The target cutoff binding changed.");
      await client.query("COMMIT");
      return { status: verifyOnly ? "target-cutoff-verified" : "already-bound", receipt: hold.cutoff, applicationReady: false, releaseAllowed: false };
    }
    assert(!verifyOnly, "The target has no bound cutoff receipt.");
    const value = { version: 1, purpose: PURPOSE, recoveryId: hold.id, archiveSha256: hold.archiveSha256, sourceHash: sourceReceipt.sourceHash, targetSourceHash: operationsSourceHash(targetUrl), sourceReceiptDigest, restrictionPlanDigest: hold.restrictions.planDigest, stateDigest: sourceReceipt.stateDigest, targetDigest, verifiedAt: new Date().toISOString(), operator: operator.trim(), reason: reason.trim(), applicationReady: false, releaseAllowed: false };
    const receipt = { ...value, authentication: sign(value, key) };
    signal?.throwIfAborted(); await writeRecoveryHold(client, { ...hold, cutoff: receipt }); await client.query("COMMIT");
    return { status: "target-cutoff-bound", receipt, applicationReady: false, releaseAllowed: false };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}
