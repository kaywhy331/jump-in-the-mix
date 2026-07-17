import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  collectDatabaseSnapshot,
  databaseIdentity,
  postgresCliUrl,
  quoteIdentifier
} from "./lib/postgres-ops.mjs";
import { sendOpsAlert } from "./lib/ops-alert.mjs";

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

async function columnExists(client, schema, table, column) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
     ) AS "exists"`,
    [schema, table, column]
  );
  return Boolean(result.rows[0]?.exists);
}

async function assertNoOrphans(client, schema, relation) {
  const requiredColumns = [relation.childColumn, relation.parentColumn];
  const ready = await tableExists(client, schema, relation.child)
    && await tableExists(client, schema, relation.parent)
    && await columnExists(client, schema, relation.child, requiredColumns[0])
    && await columnExists(client, schema, relation.parent, requiredColumns[1]);
  if (!ready) return { relation: relation.label, skipped: true };

  const child = `${quoteIdentifier(schema)}.${quoteIdentifier(relation.child)}`;
  const parent = `${quoteIdentifier(schema)}.${quoteIdentifier(relation.parent)}`;
  const childColumn = quoteIdentifier(relation.childColumn);
  const parentColumn = quoteIdentifier(relation.parentColumn);
  const result = await client.query(
    `SELECT COUNT(*)::int AS "count"
     FROM ${child} c
     LEFT JOIN ${parent} p ON c.${childColumn} = p.${parentColumn}
     WHERE c.${childColumn} IS NOT NULL AND p.${parentColumn} IS NULL`
  );
  const count = Number(result.rows[0]?.count ?? 0);
  if (count) throw new Error(`${relation.label} has ${count} orphaned row(s).`);
  return { relation: relation.label, skipped: false, count };
}

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
    const relations = [
      { label: "Contact.workspaceId → Workspace.id", child: "Contact", childColumn: "workspaceId", parent: "Workspace", parentColumn: "id" },
      { label: "Group.workspaceId → Workspace.id", child: "Group", childColumn: "workspaceId", parent: "Workspace", parentColumn: "id" },
      { label: "ContactGroupState.groupId → Group.id", child: "ContactGroupState", childColumn: "groupId", parent: "Group", parentColumn: "id" },
      { label: "JumpDate.contactId → Contact.id", child: "JumpDate", childColumn: "contactId", parent: "Contact", parentColumn: "id" },
      { label: "Mix.workspaceId → Workspace.id", child: "Mix", childColumn: "workspaceId", parent: "Workspace", parentColumn: "id" },
      { label: "MixStep.mixId → Mix.id", child: "MixStep", childColumn: "mixId", parent: "Mix", parentColumn: "id" },
      { label: "MixAssignment.mixId → Mix.id", child: "MixAssignment", childColumn: "mixId", parent: "Mix", parentColumn: "id" },
      { label: "Jump.contactId → Contact.id", child: "Jump", childColumn: "contactId", parent: "Contact", parentColumn: "id" },
      { label: "Jump.mixId → Mix.id", child: "Jump", childColumn: "mixId", parent: "Mix", parentColumn: "id" },
      { label: "Jump.mixStepId → MixStep.id", child: "Jump", childColumn: "mixStepId", parent: "MixStep", parentColumn: "id" },
      { label: "Jump.stepVersionId → StepVersion.id", child: "Jump", childColumn: "stepVersionId", parent: "StepVersion", parentColumn: "id" },
      { label: "SupportTicket.workspaceId → Workspace.id", child: "SupportTicket", childColumn: "workspaceId", parent: "Workspace", parentColumn: "id" },
      { label: "Referral.referrerWorkspaceId → Workspace.id", child: "Referral", childColumn: "referrerWorkspaceId", parent: "Workspace", parentColumn: "id" },
      { label: "Referral.referredWorkspaceId → Workspace.id", child: "Referral", childColumn: "referredWorkspaceId", parent: "Workspace", parentColumn: "id" }
    ];
    const relationChecks = [];
    for (const relation of relations) relationChecks.push(await assertNoOrphans(client, identity.schema, relation));

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
      criticalTableCounts: snapshot.tableCounts,
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
