import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { Client } from "pg";

const PRISMA_ONLY_QUERY_PARAMETERS = [
  "schema",
  "pgbouncer",
  "connection_limit",
  "pool_timeout",
  "connect_timeout"
];

export function databaseIdentity(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    protocol: url.protocol,
    host: url.hostname,
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\//u, "")),
    schema: url.searchParams.get("schema") || "public"
  };
}

export function postgresCliUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  for (const key of PRISMA_ONLY_QUERY_PARAMETERS) url.searchParams.delete(key);
  return url.toString();
}

export function postgresCliEnv(databaseUrl) {
  const url = new URL(databaseUrl);
  const env = {
    PGHOST: decodeURIComponent(url.hostname),
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//u, ""))
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);

  const mappings = {
    sslmode: "PGSSLMODE",
    sslcert: "PGSSLCERT",
    sslkey: "PGSSLKEY",
    sslrootcert: "PGSSLROOTCERT",
    application_name: "PGAPPNAME"
  };
  for (const [queryParameter, environmentName] of Object.entries(mappings)) {
    const value = url.searchParams.get(queryParameter);
    if (value) env[environmentName] = value;
  }
  return env;
}

export function databaseUrlWithDatabase(databaseUrl, databaseName, schema = "public") {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  url.searchParams.set("schema", schema);
  return url.toString();
}

export function adminDatabaseUrl(databaseUrl) {
  const identity = databaseIdentity(databaseUrl);
  const adminName = identity.database === "postgres" ? "template1" : "postgres";
  return databaseUrlWithDatabase(databaseUrl, adminName, "public");
}

export function sameDatabase(leftUrl, rightUrl) {
  const left = databaseIdentity(leftUrl);
  const right = databaseIdentity(rightUrl);
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const SUPPORTED_RESTORE_EXTENSIONS = new Set(["pg_trgm"]);

export function normalizePgRestoreSql(sql, { schema = "public", requiredExtensions = [] } = {}) {
  // Newer pg_dump releases emit this harmless session setting even when the
  // target is PostgreSQL 16, where the setting does not exist. Only remove the
  // disabled default; a non-zero value must remain visible and fail closed.
  let normalized = String(sql).replace(/^SET transaction_timeout = 0;\r?\n/gmu, "");
  if (!requiredExtensions.length) return normalized;
  for (const extension of requiredExtensions) {
    if (!SUPPORTED_RESTORE_EXTENSIONS.has(extension)) {
      throw new Error(`Backup requires unsupported PostgreSQL extension ${extension}.`);
    }
  }
  const statements = requiredExtensions
    .map((extension) => `CREATE EXTENSION IF NOT EXISTS ${quoteIdentifier(extension)} WITH SCHEMA "public";`)
    .join("\n");
  if (schema !== "public") return `${statements}\n${normalized}`;

  const publicSchema = /^CREATE SCHEMA (?:public|"public");\r?\n/mu;
  if (!publicSchema.test(normalized)) throw new Error("Restore SQL does not recreate the expected public schema.");
  normalized = normalized.replace(publicSchema, (statement) => `${statement}${statements}\n`);
  return normalized;
}

export async function runCommand(command, args, options = {}) {
  options.signal?.throwIfAborted();
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, PGCONNECT_TIMEOUT: "15", ...(options.env ?? {}) },
      cwd: options.cwd ?? process.cwd(),
      shell: false,
      signal: options.signal
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    }
    let failure;
    child.on("error", error => { failure = error; });
    // Wait for process/stdio closure after cancellation before callers remove
    // private dump files or close the exporting snapshot transaction.
    child.on("close", (code) => {
      if (failure) { reject(failure); return; }
      if (options.signal?.aborted) { reject(options.signal.reason); return; }
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      }
    });
  });
}

export async function commandVersion(command) {
  const result = await runCommand(command, ["--version"], { capture: true });
  return result.stdout.trim() || result.stderr.trim();
}

const CONTENT_HASH_ALGORITHM = "sha256-jsonb-sorted-v1";

/** Discover every declared relationship, including composite and cross-schema keys. */
export async function verifyForeignKeys(client, schema) {
  const inventory = await client.query(`
    SELECT fk.oid, fk.conname AS name, fk.confmatchtype AS match,
      cn.nspname AS child_schema, child.relname AS child_table,
      pn.nspname AS parent_schema, parent.relname AS parent_table,
      array_agg(ca.attname::text ORDER BY key.position) AS child_columns,
      array_agg(pa.attname::text ORDER BY key.position) AS parent_columns,
      array_agg(op.oprname::text ORDER BY key.position) AS operators,
      array_agg(opn.nspname::text ORDER BY key.position) AS operator_schemas
    FROM pg_constraint fk
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace cn ON cn.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = fk.confrelid
    JOIN pg_namespace pn ON pn.oid = parent.relnamespace
    CROSS JOIN LATERAL unnest(fk.conkey, fk.confkey, fk.conpfeqop)
      WITH ORDINALITY AS key(child_attnum, parent_attnum, operator_oid, position)
    JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = key.child_attnum
    JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = key.parent_attnum
    JOIN pg_operator op ON op.oid = key.operator_oid
    JOIN pg_namespace opn ON opn.oid = op.oprnamespace
    WHERE fk.contype = 'f' AND cn.nspname = $1
    GROUP BY fk.oid, fk.conname, fk.confmatchtype, cn.nspname, child.relname, pn.nspname, parent.relname
    ORDER BY cn.nspname, child.relname, fk.conname`, [schema]);
  const checks = [];
  for (const relation of inventory.rows) {
    if (!["s", "f"].includes(relation.match)) throw new Error(`Unsupported foreign-key match type for ${relation.name}.`);
    const child = `${quoteIdentifier(relation.child_schema)}.${quoteIdentifier(relation.child_table)}`;
    const parent = `${quoteIdentifier(relation.parent_schema)}.${quoteIdentifier(relation.parent_table)}`;
    const allPresent = relation.child_columns.map(column => `c.${quoteIdentifier(column)} IS NOT NULL`).join(" AND ");
    const anyPresent = relation.child_columns.map(column => `c.${quoteIdentifier(column)} IS NOT NULL`).join(" OR ");
    const join = relation.child_columns.map((column, index) =>
      `p.${quoteIdentifier(relation.parent_columns[index])} OPERATOR(${quoteIdentifier(relation.operator_schemas[index])}.${relation.operators[index]}) c.${quoteIdentifier(column)}`
    ).join(" AND ");
    const missingParent = `((${allPresent}) AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE ${join}))`;
    // MATCH SIMPLE exempts any nullable key; MATCH FULL exempts only all-null keys.
    const invalid = relation.match === "f"
      ? `((${anyPresent}) AND NOT (${allPresent})) OR ${missingParent}` : missingParent;
    const result = await client.query(`SELECT COUNT(*)::text AS count FROM ${child} c WHERE ${invalid}`);
    const count = result.rows[0].count;
    const label = `${relation.child_schema}.${relation.child_table}.${relation.name}`;
    if (count !== "0") throw new Error(`${label} has ${count} row(s) violating its foreign key.`);
    checks.push({ relation: label, skipped: false, count: 0 });
  }
  return checks;
}

async function tableContent(client, schema, table, signal) {
  // Hash rows in PostgreSQL so contact details and credentials never leave the
  // database during verification. A cursor bounds memory for large tables.
  await client.query(`DECLARE jitm_backup_rows NO SCROLL CURSOR FOR
    SELECT row_hash FROM (
      SELECT encode(sha256(convert_to(to_jsonb(r)::text, 'UTF8')), 'hex') AS row_hash
      FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} r
    ) hashes ORDER BY row_hash COLLATE "C"`);
  const digest = createHash("sha256");
  let count = 0n;
  try {
    while (true) {
      signal?.throwIfAborted();
      const batch = await client.query("FETCH FORWARD 1000 FROM jitm_backup_rows");
      if (!batch.rows.length) break;
      for (const row of batch.rows) digest.update(`${row.row_hash}\n`);
      count += BigInt(batch.rows.length);
    }
  } finally { await client.query("CLOSE jitm_backup_rows"); }
  return { count: count.toString(), sha256: digest.digest("hex") };
}

async function snapshotInTransaction(client, identity, capturedAt, signal) {
  const versionResult = await client.query("SHOW server_version");
  const extensionResult = await client.query("SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY extname");
  const inventory = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name COLLATE "C"`, [identity.schema]
  );
  const tableNames = inventory.rows.map(row => row.table_name);
  const tableCounts = Object.create(null), tableDigests = Object.create(null);
  for (const table of tableNames) {
    signal?.throwIfAborted();
    const content = await tableContent(client, identity.schema, table, signal);
    tableCounts[table] = content.count;
    tableDigests[table] = content.sha256;
  }
  let appliedMigrationNames = [], failedMigrationCount = 0;
  if (tableNames.includes("_prisma_migrations")) {
    const migrations = await client.query(
      `SELECT "migration_name", "finished_at", "rolled_back_at" FROM ${quoteIdentifier(identity.schema)}."_prisma_migrations"
       ORDER BY "started_at", "migration_name"`
    );
    appliedMigrationNames = migrations.rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => String(row.migration_name));
    failedMigrationCount = migrations.rows.filter(row => !row.finished_at && !row.rolled_back_at).length;
  }
  return {
    database: identity.database, schema: identity.schema, capturedAt,
    serverVersion: String(versionResult.rows[0]?.server_version ?? "unknown"),
    tableCount: tableNames.length, tableNames, tableCounts, tableDigests,
    contentHashAlgorithm: CONTENT_HASH_ALGORITHM,
    appliedMigrationNames, failedMigrationCount,
    requiredExtensions: extensionResult.rows.map(row => String(row.extname))
  };
}

/** Keep the exported read-only transaction open until pg_dump has consumed it.
 * Normal application writes may continue; metadata and archive share one view. */
export async function withDatabaseSnapshot(databaseUrl, consume, { signal, statementTimeout } = {}) {
  signal?.throwIfAborted();
  const identity = databaseIdentity(databaseUrl);
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl), connectionTimeoutMillis: 5000, ...(statementTimeout ? { statement_timeout: statementTimeout } : {}) });
  client.on("error", () => undefined);
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL DateStyle = 'ISO, YMD'");
    await client.query("SET LOCAL IntervalStyle = 'postgres'");
    await client.query("SET LOCAL extra_float_digits = 3");
    await client.query("SET LOCAL bytea_output = 'hex'");
    const exported = await client.query("SELECT pg_export_snapshot() AS id, transaction_timestamp() AS captured_at");
    const snapshot = await snapshotInTransaction(client, identity, exported.rows[0].captured_at.toISOString(), signal);
    signal?.throwIfAborted();
    return await consume({ client, snapshot, snapshotId: exported.rows[0].id });
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

export async function collectDatabaseSnapshot(databaseUrl) {
  return withDatabaseSnapshot(databaseUrl, ({ snapshot }) => snapshot);
}

export async function assertDatabaseEmpty(databaseUrl) {
  const identity = databaseIdentity(databaseUrl);
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl) });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
         AND table_schema NOT LIKE 'pg_toast%'
       ORDER BY table_schema, table_name`
    );
    if (result.rows.length) {
      const sample = result.rows.slice(0, 5).map((row) => `${row.table_schema}.${row.table_name}`).join(", ");
      throw new Error(`Restore target ${identity.database} is not empty; found ${result.rows.length} user table(s), including ${sample}.`);
    }
  } finally {
    await client.end();
  }
}

export function compareSnapshots(expected, actual) {
  const differences = [];
  if (actual.failedMigrationCount !== 0) {
    differences.push(`restored database has ${actual.failedMigrationCount} unfinished migration(s)`);
  }
  if (expected.tableCount !== actual.tableCount) {
    differences.push(`table count expected ${expected.tableCount}, restored ${actual.tableCount}`);
  }

  if (expected.tableNames && JSON.stringify(expected.tableNames) !== JSON.stringify(actual.tableNames)) {
    differences.push("application table inventory differs");
  }
  if (expected.tableDigests) {
    if (expected.contentHashAlgorithm !== CONTENT_HASH_ALGORITHM || actual.contentHashAlgorithm !== CONTENT_HASH_ALGORITHM) {
      differences.push("table content hash algorithm differs or is unsupported");
    }
    for (const [table, digest] of Object.entries(expected.tableDigests)) {
      if (digest !== actual.tableDigests?.[table]) differences.push(`${table} row contents differ`);
    }
  }

  const expectedMigrations = expected.appliedMigrationNames ?? [];
  const actualMigrations = actual.appliedMigrationNames ?? [];
  if (JSON.stringify(expectedMigrations) !== JSON.stringify(actualMigrations)) {
    differences.push("applied Prisma migration history differs");
  }
  const expectedExtensions = expected.requiredExtensions ?? [];
  const actualExtensions = actual.requiredExtensions ?? [];
  if (JSON.stringify(expectedExtensions) !== JSON.stringify(actualExtensions)) {
    differences.push("required PostgreSQL extensions differ");
  }

  for (const [table, expectedCount] of Object.entries(expected.tableCounts ?? {})) {
    const actualCount = actual.tableCounts?.[table];
    if (actualCount === undefined) {
      differences.push(`${table} is missing from the restored database`);
    } else if (String(actualCount) !== String(expectedCount)) {
      differences.push(`${table} row count expected ${expectedCount}, restored ${actualCount}`);
    }
  }
  return differences;
}

export function assertBackupManifest(manifest) {
  const source = manifest?.source;
  if (![1, 2].includes(manifest?.manifestVersion) || !/^[a-f0-9]{64}$/u.test(manifest?.archive?.sha256 ?? "")
    || !source || typeof source.schema !== "string" || !source.schema) {
    throw new Error("Backup manifest is missing required version, checksum, or source snapshot fields.");
  }
  // Existing version-one archives retain their original count-based checks.
  if (manifest.manifestVersion === 1) return;
  const names = source.tableNames;
  if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== "string" || !name)
    || new Set(names).size !== names.length || source.tableCount !== names.length
    || source.contentHashAlgorithm !== CONTENT_HASH_ALGORITHM
    || !Array.isArray(source.appliedMigrationNames) || !Number.isInteger(source.failedMigrationCount)
    || !source.tableCounts || !source.tableDigests
    || Object.keys(source.tableCounts).length !== names.length || Object.keys(source.tableDigests).length !== names.length
    || names.some(name => !/^\d+$/u.test(String(source.tableCounts[name] ?? "")) || !/^[a-f0-9]{64}$/u.test(source.tableDigests[name] ?? ""))) {
    throw new Error("Version-two backup manifest must verify the inventory, row counts, and contents of every table.");
  }
}
