import { spawn } from "node:child_process";
import { Client } from "pg";

export const CRITICAL_TABLES = [
  "User",
  "Workspace",
  "WorkspaceMember",
  "Contact",
  "ContactEmail",
  "ContactPhone",
  "ContactAddress",
  "ContactCustomFieldDefinition",
  "ContactCustomFieldValue",
  "Group",
  "ContactGroupMembership",
  "ContactGroupState",
  "DateType",
  "JumpDate",
  "StepTemplate",
  "StepVersion",
  "Mix",
  "MixStep",
  "MixAssignment",
  "Jump",
  "Job",
  "WorkerHeartbeat",
  "IntegrationConnection",
  "ExternalContactLink",
  "SyncRun",
  "SharedMixMetadata",
  "SupportTicket",
  "SupportTicketMessage",
  "ReferralAccount",
  "Referral",
  "ReferralReward",
  "PlatformSetting",
  "AdminMfaCredential",
  "AdminMfaSession",
  "AuditLog",
  "WebhookEvent"
];

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
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, PGCONNECT_TIMEOUT: "15", ...(options.env ?? {}) },
      cwd: options.cwd ?? process.cwd(),
      shell: false
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
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

async function tableExists(client, schema, table) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'
     ) AS "exists"`,
    [schema, table]
  );
  return Boolean(result.rows[0]?.exists);
}

async function countTable(client, schema, table) {
  const result = await client.query(`SELECT COUNT(*)::text AS "count" FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`);
  return String(result.rows[0]?.count ?? "0");
}

export async function collectDatabaseSnapshot(databaseUrl, tables = CRITICAL_TABLES) {
  const identity = databaseIdentity(databaseUrl);
  const client = new Client({ connectionString: postgresCliUrl(databaseUrl) });
  await client.connect();
  try {
    const versionResult = await client.query("SHOW server_version");
    const extensionResult = await client.query(
      "SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY extname"
    );
    const tableCounts = {};
    for (const table of tables) {
      if (await tableExists(client, identity.schema, table)) {
        tableCounts[table] = await countTable(client, identity.schema, table);
      }
    }

    let appliedMigrationNames = [];
    let failedMigrationCount = 0;
    if (await tableExists(client, identity.schema, "_prisma_migrations")) {
      const migrations = await client.query(
        `SELECT "migration_name", "finished_at", "rolled_back_at"
         FROM ${quoteIdentifier(identity.schema)}."_prisma_migrations"
         ORDER BY "started_at"`
      );
      appliedMigrationNames = migrations.rows
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => String(row.migration_name));
      failedMigrationCount = migrations.rows.filter((row) => !row.finished_at && !row.rolled_back_at).length;
    }

    const tableTotal = await client.query(
      `SELECT COUNT(*)::int AS "count"
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [identity.schema]
    );

    return {
      database: identity.database,
      schema: identity.schema,
      serverVersion: String(versionResult.rows[0]?.server_version ?? "unknown"),
      tableCount: Number(tableTotal.rows[0]?.count ?? 0),
      tableCounts,
      appliedMigrationNames,
      failedMigrationCount,
      requiredExtensions: extensionResult.rows.map((row) => String(row.extname))
    };
  } finally {
    await client.end();
  }
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
