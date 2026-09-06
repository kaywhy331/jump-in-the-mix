import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  collectDatabaseSnapshot,
  databaseIdentity,
  postgresCliUrl,
  quoteIdentifier,
  verifyForeignKeys
} from "./lib/postgres-ops.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";

async function main() {
  const databaseUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("RESTORE_DATABASE_URL is required. Database credentials are not accepted as command-line arguments.");
  const identity = databaseIdentity(databaseUrl);
  const snapshot = await collectDatabaseSnapshot(databaseUrl);
  if (!snapshot.tableCount) throw new Error("Restored database contains no application tables.");
  if (!snapshot.appliedMigrationNames.length) throw new Error("Restored database has no applied Prisma migration history.");
  if (snapshot.failedMigrationCount) throw new Error(`Restored database has ${snapshot.failedMigrationCount} unfinished migration(s).`);

  const client = new Client({ connectionString: postgresCliUrl(databaseUrl) });
  await client.connect();
  try {
    const relationChecks = await verifyForeignKeys(client, identity.schema);

    const smokeId = randomUUID();
    const smokeTable = quoteIdentifier(`jitm_restore_smoke_${smokeId.replaceAll("-", "")}`);
    await client.query("BEGIN");
    try {
      await client.query(`CREATE TEMP TABLE ${smokeTable} (id text PRIMARY KEY, created_at timestamptz NOT NULL)`);
      await client.query(`INSERT INTO ${smokeTable} (id, created_at) VALUES ($1, NOW())`, [smokeId]);
      const write = await client.query(`SELECT id FROM ${smokeTable} WHERE id = $1`, [smokeId]);
      if (write.rows[0]?.id !== smokeId) throw new Error("Restored database transaction smoke write was not readable.");
    } finally {
      await client.query("ROLLBACK");
    }

    console.log(JSON.stringify({
      status: "ok",
      database: identity.database,
      schema: identity.schema,
      tableCount: snapshot.tableCount,
      appliedMigrations: snapshot.appliedMigrationNames.length,
      tableCounts: snapshot.tableCounts,
      relationChecks
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Restored database smoke test failed: ${message}`);
  await sendOpsAlert({
    title: "Restored database smoke test failed",
    summary: message,
    details: { command: "db:smoke-restored" }
  });
  process.exitCode = 1;
});
