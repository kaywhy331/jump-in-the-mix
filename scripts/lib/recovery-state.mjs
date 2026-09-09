import { createHash, createHmac, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { decryptFile, encryptFile, parseBackupKey, sha256File } from "./backup-archive.mjs";
import { databaseIdentity, postgresCliUrl, quoteIdentifier } from "./postgres-ops.mjs";
import { operationsSourceHash, privateJson } from "./operations-artifacts.mjs";
import { readRecoveryHold } from "./recovery-hold.mjs";
import { verifyBackupManifestAuthentication } from "./backup-manifest.mjs";

export const MAX_RECOVERY_STATE_BYTES = 128 * 1024 * 1024;
export const MAX_RECOVERY_STATE_ROWS = 1_000_000;
const HASH = /^[a-f0-9]{64}$/;
const PURPOSE = "jitm.recovery-state";

// Values needed by typed reconciliation. No passwords, session/token hashes,
// MFA material, endpoint credentials, contact notes or frozen email bodies.
export const RECOVERY_SAFETY_FIELDS = Object.freeze({
  User: ["email", "emailVerifiedAt", "suspendedAt", "accessRevision", "isPlatformAdmin", "referralInvitesIssued"],
  Workspace: ["ownerId"], WorkspaceMember: ["workspaceId", "userId", "role"],
  StaffMembership: ["userId", "role", "status", "grants", "denies", "revision"],
  AccountDeletionAudit: ["subjectHash", "status", "completedAt"],
  Contact: ["workspaceId", "archivedAt"],
  ContactRelationshipState: ["workspaceId", "contactId", "doNotContact", "version"],
  WaitlistEntry: ["email", "status", "verifiedAt", "withdrawnAt", "accessGrantedAt", "joinedAt"],
  EmailSuppression: ["email", "reason", "revision", "lastTriggeredAt", "clearedAt"],
  ReferralAccessInvite: ["inviterUserId", "recipientEmail", "acceptedUserId", "acceptedAt", "revokedAt"],
  StaffInvitation: ["email", "acceptedAt", "revokedAt"],
  WaitlistDelivery: ["inviteId", "staffInvitationId", "status", "generation", "emailMessageId", "attempts", "firstAttemptAt"],
  SupportEmailDelivery: ["messageId", "status", "generation", "emailMessageId", "attempts", "firstAttemptAt", "acceptedAt"],
  EmailMessage: ["acceptedAt", "deliveredAt", "bouncedAt", "complainedAt", "suppressedAt", "failedAt", "detailsRetiredAt"],
  AutomatedDelivery: ["workspaceId", "jumpId", "status", "attempts", "deliveredAt"],
  Jump: ["workspaceId", "contactId", "status", "scheduledAt", "completedAt", "completionMethod"],
  AutomationPreference: ["workspaceId", "enabled", "emailEnabled", "smsEnabled"],
  NotificationPreference: ["workspaceId", "userId", "emailDigestEnabled", "pushEnabled", "weeklyReportEnabled"],
  IntakeConnection: ["workspaceId", "enabled"], CalendarConnection: ["workspaceId", "enabled"],
  Mix: ["workspaceId", "status"],
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
export const recoveryStateDigest = digest;
export const recoveryTargetDigest = state => digest({ schemaHash: state.schemaHash, tables: state.tables });
export function recoveryIdentitySql(keys, alias = "t") {
  if (!/^[a-z]+$/.test(alias)) throw new Error("Invalid recovery query alias.");
  const fields = keys.flatMap(name => [`'${name.replaceAll("'", "''")}'`, `${alias}.${quoteIdentifier(name)}::text`]);
  return `encode(sha256(convert_to(jsonb_build_object(${fields.join(",")})::text,'UTF8')),'hex')`;
}
const shapeOf = tables => Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, { keys: table.keys, columns: table.columns }]));
const stateKey = key => createHmac("sha256", parseBackupKey(key)).update("jitm.recovery.state.v1").digest();
const safetyFields = name => Object.hasOwn(RECOVERY_SAFETY_FIELDS, name) ? RECOVERY_SAFETY_FIELDS[name] : [];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const validTime = value => typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateRecoveryState(state) {
  if (!exactKeys(state, ["version", "purpose", "id", "sourceHash", "schema", "capturedAt", "schemaHash", "rowCount", "tables"]) || state.version !== 1 || state.purpose !== PURPOSE || !/^[a-f0-9-]{36}$/.test(state.id) || !HASH.test(state.sourceHash) || state.schema !== "public" || !validTime(state.capturedAt) || !HASH.test(state.schemaHash) || !object(state.tables)) throw new Error("Recovery state format is invalid.");
  const entries = Object.entries(state.tables);
  if (!entries.length || entries.length > 500) throw new Error("Recovery state table inventory is invalid.");
  let count = 0;
  for (const [name, table] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name) || !exactKeys(table, ["keys", "columns", "rows"]) || !Array.isArray(table.keys) || !table.keys.length || !Array.isArray(table.columns) || !table.columns.length || !Array.isArray(table.rows)) throw new Error("Recovery state table shape is invalid.");
    const columns = table.columns.map(column => column.name);
    if (new Set(columns).size !== columns.length || new Set(table.keys).size !== table.keys.length || table.keys.some(key => !columns.includes(key)) || table.columns.some(column => !exactKeys(column, ["name", "type", "nullable"]) || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(column.name) || typeof column.type !== "string" || column.type.length > 256 || typeof column.nullable !== "boolean")) throw new Error("Recovery state columns are invalid.");
    const safety = safetyFields(name);
    if (safety.some(field => !columns.includes(field))) throw new Error("Recovery state omits a required safety field.");
    const seen = new Set();
    for (const row of table.rows) {
      if (++count > MAX_RECOVERY_STATE_ROWS || !exactKeys(row, ["key", "digest", "state"]) || !HASH.test(row.key) || !HASH.test(row.digest) || !exactKeys(row.state, safety)) throw new Error("Recovery state row is invalid.");
      if (seen.has(row.key)) throw new Error("Recovery state contains duplicate row identities."); seen.add(row.key);
    }
  }
  if (Object.keys(RECOVERY_SAFETY_FIELDS).some(name => !Object.hasOwn(state.tables, name)) || state.rowCount !== count || state.schemaHash !== digest(shapeOf(state.tables))) throw new Error("Recovery state inventory is incomplete.");
  return state;
}

/** One read-only PostgreSQL snapshot, bounded cursor reads, no row-content output. */
export async function captureRecoveryState(databaseUrl, { targetHold = null, signal } = {}) {
  signal?.throwIfAborted();
  const identity = databaseIdentity(databaseUrl);
  if (identity.schema !== "public") throw new Error("Recovery state currently requires the public application schema.");
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl), connectionTimeoutMillis: 5000, statement_timeout: 15_000, application_name: "jitm-recovery-state" });
  client.on("error", () => undefined);
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return await captureRecoveryStateInTransaction(client, databaseUrl, { targetHold, signal });
  } finally { await client.query("ROLLBACK").catch(() => undefined); await client.end(); }
}

// Caller must own a repeatable-read transaction or hold every application table
// locked against writes. This does not begin, commit or roll back that transaction.
export async function captureRecoveryStateInTransaction(client, databaseUrl, { targetHold = null, signal } = {}) {
    const identity = databaseIdentity(databaseUrl), started = Date.now();
    if (identity.schema !== "public") throw new Error("Recovery state currently requires the public application schema.");
    signal?.throwIfAborted();
    // Refuse a filtered snapshot; this setting does not grant an RLS bypass.
    await client.query("SET LOCAL row_security = off");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL DateStyle = 'ISO, YMD'");
    await client.query("SET LOCAL IntervalStyle = 'postgres'");
    await client.query("SET LOCAL extra_float_digits = 3");
    await client.query("SET LOCAL bytea_output = 'hex'");
    const hold = await readRecoveryHold(client);
    if (targetHold ? !hold || hold.id !== targetHold.id || hold.archiveSha256 !== targetHold.archiveSha256 : hold !== null) throw new Error(targetHold ? "The target recovery hold changed." : "A held database cannot supply authoritative recovery state.");
    const capturedAt = (await client.query("SELECT transaction_timestamp() AS time")).rows[0].time.toISOString();
    const inventory = (await client.query(`SELECT c.relname AS name, c.relkind AS kind,
      EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) AS inherited,
      (SELECT jsonb_agg(a.attname ORDER BY k.ordinality) FROM pg_catalog.pg_index x CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY k(num,ordinality) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE x.indrelid=c.oid AND x.indisprimary AND k.ordinality<=x.indnkeyatts) AS keys,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') ORDER BY c.relname COLLATE "C"`, [identity.schema])).rows;
    if (!inventory.length || inventory.length > 500) throw new Error("Recovery state table inventory is unsupported.");
    const tables = Object.create(null); let rowCount = 0, bytes = 0;
    for (const table of inventory) {
      if (table.kind !== "r" || table.inherited || !table.keys?.length) throw new Error("Recovery state requires ordinary tables with primary keys. Review the schema before recovery.");
      const fields = safetyFields(table.name);
      if (fields.some(field => !table.columns.some(column => column.name === field))) throw new Error("A required recovery safety column is missing.");
      // Names come from the catalog and are separately quoted as identifiers and literals.
      // Hash text-valued primary keys inside PostgreSQL: preserve large numeric
      // identities and avoid exporting sensitive identifiers from future tables.
      const projection = (names, identity = false) => names.length ? `jsonb_build_object(${names.flatMap(name => [`'${name.replaceAll("'", "''")}'`, `t.${quoteIdentifier(name)}${identity ? "::text" : ""}`]).join(",")})` : "'{}'::jsonb";
      await client.query(`DECLARE recovery_rows NO SCROLL CURSOR FOR SELECT ${recoveryIdentitySql(table.keys)} AS key, encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest, ${projection(fields)} AS state FROM ${quoteIdentifier(identity.schema)}.${quoteIdentifier(table.name)} t ORDER BY ${table.keys.map(key => `t.${quoteIdentifier(key)}`).join(",")}`);
      const rows = [];
      while (true) {
        signal?.throwIfAborted();
        if (Date.now() - started > 300_000) throw new Error("Recovery state capture exceeded its time limit.");
        const batch = (await client.query("FETCH FORWARD 500 FROM recovery_rows")).rows;
        if (!batch.length) break;
        for (const row of batch) {
          rowCount++; bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
          if (rowCount > MAX_RECOVERY_STATE_ROWS || bytes > MAX_RECOVERY_STATE_BYTES - 1024 * 1024) throw new Error("Recovery state exceeds its supported size. Keep recovery held and use a reviewed larger-data procedure.");
          rows.push(row);
        }
      }
      await client.query("CLOSE recovery_rows");
      tables[table.name] = { keys: table.keys, columns: table.columns, rows };
    }
    const state = { version: 1, purpose: PURPOSE, id: randomUUID(), sourceHash: operationsSourceHash(databaseUrl), schema: identity.schema, capturedAt, schemaHash: digest(shapeOf(tables)), rowCount, tables };
    signal?.throwIfAborted();
    return validateRecoveryState(state);
}

export async function writeRecoveryState(state, output, key, { signal } = {}) {
  signal?.throwIfAborted();
  validateRecoveryState(state);
  const text = JSON.stringify(state);
  if (Buffer.byteLength(text) > MAX_RECOVERY_STATE_BYTES) throw new Error("Recovery state exceeds its supported size.");
  const temporary = await mkdtemp(join(tmpdir(), "jitm-recovery-state-"));
  try {
    const plain = join(temporary, "state.json");
    await writeFile(plain, text, { flag: "wx", mode: 0o600 });
    signal?.throwIfAborted();
    await encryptFile(plain, output, stateKey(key), { signal });
    if (signal?.aborted) { await rm(output, { force: true }); signal.throwIfAborted(); }
    return { stateId: state.id, capturedAt: state.capturedAt, sourceHash: state.sourceHash, sha256: await sha256File(output), rows: state.rowCount, tables: Object.keys(state.tables).length };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function readRecoveryState(input, key, { signal, expectedSha256, expectedBytes } = {}) {
  signal?.throwIfAborted();
  if (expectedSha256 !== undefined && !HASH.test(expectedSha256) || expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)) throw new Error("Recovery state file binding is invalid.");
  const temporary = await mkdtemp(join(tmpdir(), "jitm-recovery-state-"));
  try {
    // Snapshot a bounded regular file through one descriptor before decryption.
    const encrypted = join(temporary, "state.enc"), plain = join(temporary, "state.json");
    const source = await open(input, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await source.stat();
      if (!info.isFile() || info.size > MAX_RECOVERY_STATE_BYTES + 128 || expectedBytes !== undefined && info.size !== expectedBytes) throw new Error("Recovery state file is invalid.");
      const target = await open(encrypted, "wx", 0o600);
      try {
        let bytes = 0; const buffer = Buffer.alloc(128 * 1024), hash = createHash("sha256");
        while (true) {
          signal?.throwIfAborted();
          const { bytesRead } = await source.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
          bytes += bytesRead; if (bytes > MAX_RECOVERY_STATE_BYTES + 128) throw new Error("Recovery state file is too large.");
          hash.update(buffer.subarray(0, bytesRead));
          await target.writeFile(buffer.subarray(0, bytesRead));
        }
        if (expectedBytes !== undefined && bytes !== expectedBytes || expectedSha256 !== undefined && hash.digest("hex") !== expectedSha256) throw new Error("Recovery state file does not match its signed archive binding.");
      } finally { await target.close(); }
    } finally { await source.close(); }
    await decryptFile(encrypted, plain, stateKey(key));
    signal?.throwIfAborted();
    return validateRecoveryState(await privateJson(plain, MAX_RECOVERY_STATE_BYTES));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

/** Counts only: no identifiers, email addresses, tokens or row contents in reports. */
export function compareRecoveryState(current, restored, { hold, manifest, key, now = new Date() }) {
  validateRecoveryState(current); validateRecoveryState(restored);
  if (manifest?.manifestVersion !== 2 || !verifyBackupManifestAuthentication(manifest, key)) throw new Error("An authenticated current-format backup manifest is required.");
  if (!hold || hold.manifestAuthenticated !== true || hold.contentVerified !== true || hold.sourceHash !== current.sourceHash || manifest.source?.operationsSourceHash !== current.sourceHash || hold.archiveSha256 !== manifest.archive?.sha256) throw new Error("Recovery evidence does not identify the held archive and source.");
  if (!validTime(manifest.source.capturedAt) || Date.parse(current.capturedAt) < Date.parse(manifest.source.capturedAt) || Date.parse(current.capturedAt) > now.getTime() + 300_000) throw new Error("Recovery state does not cover the backup time or has a future timestamp.");
  if (current.schemaHash !== restored.schemaHash) throw new Error("Recovery schemas differ. Migrate and review the target while keeping it held.");
  const tables = Object.create(null);
  for (const [name, before] of Object.entries(restored.tables)) {
    const latest = new Map(current.tables[name].rows.map(row => [row.key, row]));
    const changes = { restoredRows: before.rows.length, sourceRows: latest.size, missingFromSource: 0, missingFromRestore: 0, changedRows: 0, unchangedRows: 0, safetyFieldsChanged: Object.create(null) };
    for (const row of before.rows) {
      const key = row.key, next = latest.get(key);
      if (!next) { changes.missingFromSource++; continue; }
      latest.delete(key);
      if (row.digest === next.digest) { changes.unchangedRows++; continue; }
      changes.changedRows++;
      for (const field of safetyFields(name)) if (canonical(row.state[field]) !== canonical(next.state[field])) changes.safetyFieldsChanged[field] = (changes.safetyFieldsChanged[field] ?? 0) + 1;
    }
    changes.missingFromRestore = latest.size; tables[name] = changes;
  }
  return { version: 1, purpose: "jitm.recovery-review", createdAt: now.toISOString(), recoveryId: hold.id, archiveSha256: hold.archiveSha256, sourceHash: current.sourceHash, stateId: current.id, stateCapturedAt: current.capturedAt, stateDigest: digest(current), targetDigest: digest({ schemaHash: restored.schemaHash, tables: restored.tables }), targetSourceHash: restored.sourceHash,
    applicationReady: false, mutationsApplied: 0, releaseAllowed: false, continuousCoverage: false, tables };
}
