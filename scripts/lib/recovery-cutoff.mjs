import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Client } from "pg";
import { parseBackupKey } from "./backup-archive.mjs";
import { verifyBackupManifestAuthentication } from "./backup-manifest.mjs";
import { assertRecoverySnapshot } from "./recovery-bundle.mjs";
import { adminDatabaseUrl, databaseIdentity, postgresCliUrl, quoteIdentifier } from "./postgres-ops.mjs";
import { operationsSourceHash } from "./operations-artifacts.mjs";
import { captureRecoveryStateInTransaction, recoveryStateDigest, recoveryTargetDigest } from "./recovery-state.mjs";
import { requireRecoveryRelease } from "./recovery-restrictions.mjs";

const TTL = 30 * 60_000;
const SETTING = "jitm.recovery_source_cutoff";
const PLAN = "jitm.recovery-source-cutoff-plan", RECEIPT = "jitm.recovery-source-cutoff-receipt";
const RESUME = "jitm.recovery-source-resume-receipt";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function sign(value, key) {
  const { authentication: _, ...payload } = value;
  const derived = createHmac("sha256", parseBackupKey(key)).update(value.purpose).digest();
  return createHmac("sha256", derived).update(recoveryStateDigest(payload)).digest("hex");
}
function authenticate(value, purpose, key) {
  assert(value?.version === 1 && value.purpose === purpose && /^[a-f0-9]{64}$/.test(value.authentication ?? "") && timingSafeEqual(Buffer.from(value.authentication, "hex"), Buffer.from(sign(value, key), "hex")), "Source cutoff evidence could not be authenticated.");
  assert(value.applicationReady === false && value.releaseAllowed === false, "A source cutoff never authorizes target reopening.");
}
async function connect(url) {
  const client = new Client({ connectionString: postgresCliUrl(url), connectionTimeoutMillis: 5000, statement_timeout: 15_000, application_name: "jitm-recovery-source-cutoff" });
  client.on("error", () => undefined); await client.connect().catch(async error => { await client.end().catch(() => undefined); throw error; }); return client;
}
async function database(client, sourceUrl) {
  const result = await client.query(`SELECT d.oid,d.datname,d.datallowconn,d.datistemplate,d.xmin::text AS "catalogVersion",pg_snapshot_xmax(pg_current_snapshot())::text AS "observedXid",
    d.datdba=r.oid OR r.rolsuper AS owned FROM pg_database d CROSS JOIN pg_roles r
    WHERE d.datname=$1 AND r.rolname=current_user`, [databaseIdentity(sourceUrl).database]);
  const row = result.rows[0];
  assert(row?.owned && !row.datistemplate && !["postgres", "template0", "template1"].includes(row.datname), "Source finalization requires its database owner and a dedicated application database.");
  return row;
}
async function marker(client, oid, setting = SETTING) {
  const result = await client.query(`SELECT value FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) value
    WHERE s.setdatabase=$1 AND s.setrole=0 AND left(value,length($2::text))=$2`, [oid, `${setting}=`]);
  if (!result.rowCount) return null;
  assert(result.rowCount === 1 && result.rows[0].value.length < 32768, "Source cutoff metadata needs operator review.");
  return JSON.parse(result.rows[0].value.slice(setting.length + 1));
}
async function writeMarker(client, value, databaseName = null) {
  const result = await client.query("SELECT format('ALTER DATABASE %I SET jitm.recovery_source_cutoff TO %L',COALESCE($2::text,current_database()),$1::text) AS sql", [JSON.stringify(value), databaseName]);
  await client.query(result.rows[0].sql);
}
async function quiet(client, row) {
  // A transaction may cache statistics. Re-read after disabling connections.
  await client.query("SELECT pg_stat_clear_snapshot()");
  assert(!(await client.query("SELECT 1 FROM pg_stat_activity WHERE datid=$1 AND pid<>pg_backend_pid() AND backend_type IS DISTINCT FROM 'autovacuum worker' LIMIT 1", [row.oid])).rowCount, "Stop all other source clients before finalizing the source.");
  assert(!(await client.query("SELECT 1 FROM pg_prepared_xacts WHERE database=$1 LIMIT 1", [row.datname])).rowCount, "Resolve prepared source transactions before finalization.");
  // Select only public catalog fields, never subscription connection strings.
  assert(!(await client.query("SELECT oid FROM pg_subscription WHERE subdbid=$1 LIMIT 1", [row.oid])).rowCount, "Replication subscriptions require a separate finalization procedure.");
}
function binding(sourceUrl, state, manifest, key) {
  assert(databaseIdentity(sourceUrl).schema === "public" && manifest?.manifestVersion === 2 && verifyBackupManifestAuthentication(manifest, key), "Finalization requires an authenticated complete recovery bundle.");
  assertRecoverySnapshot(state, manifest.source);
  const result = { sourceHash: operationsSourceHash(sourceUrl), archiveSha256: manifest.archive.sha256, stateDigest: recoveryStateDigest(state), contentDigest: recoveryTargetDigest(state), capturedAt: state.capturedAt };
  assert(state.sourceHash === result.sourceHash && manifest.source.operationsSourceHash === result.sourceHash && manifest.recoveryState?.stateDigest === result.stateDigest && manifest.recoveryState.schemaHash === state.schemaHash, "The recovery bundle does not match the source identity.");
  assert(Date.parse(state.capturedAt) <= Date.now() + 300_000, "The recovery bundle has a future capture time.");
  return result;
}
function sameBinding(value, expected) {
  assert(Object.entries(expected).every(([key, data]) => value[key] === data), "The source or recovery bundle changed. Prepare a new plan.");
}
async function matchingSnapshot(client, sourceUrl, expected, signal) {
  await requireRecoveryRelease(client);
  const extensions = (await client.query("SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql','pg_trgm')")).rows;
  assert(!extensions.length, "Source extensions require a reviewed finalization policy.");
  const current = await captureRecoveryStateInTransaction(client, sourceUrl, { signal });
  assert(recoveryTargetDigest(current) === expected.contentDigest, "Source contents changed after the bundle was captured. Capture a new bundle before finalization.");
  return current;
}

/** Read-only plan. Running services must already be stopped by the operator. */
export async function prepareSourceCutoff(sourceUrl, state, manifest, { key, signal } = {}) {
  signal?.throwIfAborted(); const expected = binding(sourceUrl, state, manifest, key), client = await connect(sourceUrl);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const row = await database(client, sourceUrl); await quiet(client, row);
    assert(row.datallowconn && !await marker(client, row.oid), "This source already has finalization metadata. Review it through the maintenance database.");
    await matchingSnapshot(client, sourceUrl, expected, signal);
    const now = new Date();
    const plan = { version: 1, purpose: PLAN, id: randomUUID(), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL).toISOString(), databaseOid: row.oid, ...expected,
      effects: { disableSourceConnections: true, sourceRemainsOfflineOnLateFailure: true, sourceDataMutations: 0, targetDataMutations: 0 }, applicationReady: false, releaseAllowed: false };
    return { ...plan, authentication: sign(plan, key) };
  } finally { await client.query("ROLLBACK").catch(() => undefined); await client.end(); }
}

/** Verify through another database: the finalized source accepts no connections. */
export async function verifySourceCutoff(sourceUrl, receipt, { key, signal } = {}) {
  signal?.throwIfAborted(); authenticate(receipt, RECEIPT, key);
  assert(receipt.sourceHash === operationsSourceHash(sourceUrl), "The cutoff identifies a different source.");
  const client = await connect(adminDatabaseUrl(sourceUrl));
  try {
    const row = await database(client, sourceUrl); await quiet(client, row);
    assert(typeof receipt.catalogTransactionId === "string" && /^\d{1,20}$/.test(receipt.catalogTransactionId), "The source catalog revision is missing.");
    const elapsedTransactions = BigInt(row.observedXid) - BigInt(receipt.catalogTransactionId);
    assert(elapsedTransactions >= 0n && elapsedTransactions < 1_000_000_000n && row.catalogVersion === receipt.databaseCatalogVersion && row.oid === receipt.databaseOid && row.datallowconn === false && recoveryStateDigest(await marker(client, row.oid)) === recoveryStateDigest(receipt), "The source is no longer finalized or its committed receipt changed.");
    return { status: "source-offline-verified", receipt, applicationReady: false, releaseAllowed: false };
  } finally { await client.end(); }
}

/** Cancel only an incomplete finalization, never a successfully finalized source. */
export async function resumePendingSource(sourceUrl, plan, { key, operator, reason, signal } = {}) {
  signal?.throwIfAborted(); authenticate(plan, PLAN, key);
  assert(plan.sourceHash === operationsSourceHash(sourceUrl), "The plan identifies another source.");
  assert(typeof operator === "string" && operator.trim().length >= 2 && operator.length <= 100 && typeof reason === "string" && reason.trim().length >= 8 && reason.length <= 500, "Record the recovery operator and reason.");
  const planDigest = recoveryStateDigest(plan), client = await connect(adminDatabaseUrl(sourceUrl));
  try {
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(814733,8)");
    const row = await database(client, sourceUrl), pending = await marker(client, row.oid);
    assert(row.oid === plan.databaseOid, "The source database identity changed.");
    if (!pending) {
      const prior = await marker(client, row.oid, "jitm.recovery_source_resume");
      authenticate(prior, RESUME, key);
      assert(row.datallowconn && prior.planDigest === planDigest, "No matching incomplete finalization can be resumed.");
      await client.query("COMMIT"); return { status: "already-resumed", receipt: prior, applicationReady: false, releaseAllowed: false };
    }
    assert(!row.datallowconn && pending.status === "pending" && pending.planDigest === planDigest, "Only this plan's incomplete source finalization can be resumed.");
    await quiet(client, row); signal?.throwIfAborted();
    const value = { version: 1, purpose: RESUME, planDigest, databaseOid: row.oid, sourceHash: plan.sourceHash, resumedAt: new Date().toISOString(), operator: operator.trim(), reason: reason.trim(), applicationReady: false, releaseAllowed: false };
    const receipt = { ...value, authentication: sign(value, key) };
    const command = (await client.query("SELECT format('ALTER DATABASE %I SET jitm.recovery_source_resume TO %L',$1::text,$2::text) AS sql", [row.datname, JSON.stringify(receipt)])).rows[0].sql;
    await client.query(command);
    await client.query(`ALTER DATABASE ${quoteIdentifier(row.datname)} RESET jitm.recovery_source_cutoff`);
    await client.query(`ALTER DATABASE ${quoteIdentifier(row.datname)} ALLOW_CONNECTIONS true`);
    signal?.throwIfAborted(); await client.query("COMMIT");
    return { status: "source-resumed", receipt, applicationReady: false, releaseAllowed: false };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

export async function applySourceCutoff(sourceUrl, state, manifest, plan, { key, operator, reason, signal } = {}) {
  signal?.throwIfAborted(); authenticate(plan, PLAN, key);
  const expected = binding(sourceUrl, state, manifest, key); sameBinding(plan, expected);
  assert(typeof operator === "string" && operator.trim().length >= 2 && operator.length <= 100 && typeof reason === "string" && reason.trim().length >= 8 && reason.length <= 500, "Record the recovery operator and reason.");
  const planDigest = recoveryStateDigest(plan);
  // Recover a committed receipt after a lost stdout/file write, without trying
  // to reconnect to or reenable the closed source. Pending markers are refused.
  const maintenance = await connect(adminDatabaseUrl(sourceUrl));
  let prior;
  try {
    const row = await database(maintenance, sourceUrl); prior = await marker(maintenance, row.oid);
    const resumed = await marker(maintenance, row.oid, "jitm.recovery_source_resume");
    assert(resumed?.planDigest !== planDigest, "This finalization plan was canceled. Prepare a new plan.");
  }
  finally { await maintenance.end(); }
  if (prior) {
    authenticate(prior, RECEIPT, key); assert(prior.planDigest === planDigest, "The source was finalized by another plan.");
    await verifySourceCutoff(sourceUrl, prior, { key, signal });
    return { status: "already-finalized", receipt: prior, applicationReady: false, releaseAllowed: false };
  }
  assert(Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) === TTL && Date.parse(plan.createdAt) <= Date.now() && Date.parse(plan.expiresAt) > Date.now(), "The source finalization plan expired.");
  const client = await connect(sourceUrl);
  try {
    await client.query("SELECT pg_advisory_lock(814733,8)");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const row = await database(client, sourceUrl); await quiet(client, row);
    assert(row.oid === plan.databaseOid && row.datallowconn && !await marker(client, row.oid), "The reviewed source database changed.");
    await matchingSnapshot(client, sourceUrl, expected, signal);
    await client.query("ROLLBACK"); signal?.throwIfAborted();
    // Commit denial BEFORE the final comparison. Existing clients are checked
    // again afterward; no success is reported if a connection raced the denial.
    // PostgreSQL requires changing ALLOW_CONNECTIONS from another database.
    // Keep the original source session open for the final content comparison.
    const controller = await connect(adminDatabaseUrl(sourceUrl)); let catalogTransactionId;
    try {
      await controller.query("BEGIN");
      catalogTransactionId = (await controller.query("SELECT pg_current_xact_id()::text AS xid")).rows[0].xid;
      await writeMarker(controller, { version: 1, status: "pending", planDigest, ...expected }, row.datname);
      await controller.query(`ALTER DATABASE ${quoteIdentifier(row.datname)} ALLOW_CONNECTIONS false`);
      await controller.query("COMMIT");
    } catch (error) { await controller.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { await controller.end(); }
    signal?.throwIfAborted();
    await client.query("BEGIN"); await quiet(client, row);
    const names = (await client.query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','f') ORDER BY c.relname")).rows.map(item => item.name);
    assert(names.length && names.length <= 500, "Source table inventory is unsupported.");
    await client.query(`LOCK TABLE ${names.map(name => `public.${quoteIdentifier(name)}`).join(",")} IN ACCESS EXCLUSIVE MODE`);
    const final = await matchingSnapshot(client, sourceUrl, expected, signal);
    const boundary = await database(client, sourceUrl);
    assert(boundary.datallowconn === false && boundary.catalogVersion === String(BigInt(catalogTransactionId) % 4294967296n), "The source connection barrier changed during finalization.");
    const value = { version: 1, purpose: RECEIPT, id: randomUUID(), planDigest, databaseOid: row.oid, databaseCatalogVersion: boundary.catalogVersion, catalogTransactionId, ...expected, finalizedAt: final.capturedAt,
      operator: operator.trim(), reason: reason.trim(), sourceConnectionsDisabled: true, sourceDataMutations: 0, targetDataMutations: 0, applicationReady: false, releaseAllowed: false };
    const receipt = { ...value, authentication: sign(value, key) };
    await writeMarker(client, receipt); signal?.throwIfAborted(); await client.query("COMMIT");
    return { status: "source-finalized", receipt, applicationReady: false, releaseAllowed: false };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}
