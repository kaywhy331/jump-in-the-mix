import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { schemaRelease } from "@/generated/schema-release";
import { prisma } from "@/lib/prisma";
import { recoveryHoldQuery } from "@/lib/recovery-hold-query.mjs";

export type DatabaseReleaseStatus = "ready" | "recovery-held" | "missing-history" | "pending-migrations" | "migration-in-progress" | "migration-mismatch" | "schema-mismatch" | "unavailable";
export type DatabaseReleaseResult = { status: DatabaseReleaseStatus; required: number; missing: number; mismatched: number };

// This is a deployment check, never a migration runner. It performs bounded
// metadata reads without touching customer rows or exposing schema names publicly.
export async function checkDatabaseRelease(db: PrismaClient = prisma, options: { requireHistory?: boolean; schema?: string } = {}): Promise<DatabaseReleaseResult> {
  const schema = options.schema ?? "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema)) throw new Error("Invalid database schema for release verification.");
  const result = (status: DatabaseReleaseStatus, missing = 0, mismatched = 0): DatabaseReleaseResult => ({ status, required: schemaRelease.migrations.length, missing, mismatched });
  const requireHistory = options.requireHistory ?? process.env.NODE_ENV === "production";
  try {
    return await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
      if ((await tx.$queryRawUnsafe<Array<{ value: string }>>(recoveryHoldQuery)).length) return result("recovery-held");
      const history = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${schema} AND c.relname='_prisma_migrations' AND c.relkind='r') AS exists`;
      if (!history[0]?.exists && requireHistory) return result("missing-history", schemaRelease.migrations.length);
      if (history[0]?.exists) {
        // The identifier is validated above; all actual values remain parameters.
        const rows = await tx.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>(Prisma.sql`SELECT migration_name, checksum, finished_at, rolled_back_at FROM ${Prisma.raw(`"${schema}"."_prisma_migrations"`)} ORDER BY started_at DESC LIMIT 2000`);
        if (rows.length === 2000) return result("unavailable");
        if (rows.some(row => !row.finished_at && !row.rolled_back_at)) return result("migration-in-progress");
        const applied = rows.filter(row => row.finished_at && !row.rolled_back_at);
        const missing = schemaRelease.migrations.filter(item => !applied.some(row => row.migration_name === item.name)).length;
        const mismatched = schemaRelease.migrations.filter(item => applied.some(row => row.migration_name === item.name && row.checksum !== item.checksum)).length;
        if (mismatched) return result("migration-mismatch", missing, mismatched);
        if (missing) return result("pending-migrations", missing);
      }
      const shape = await tx.$queryRaw<Array<{ missing: number }>>`
        SELECT count(*)::int AS missing FROM jsonb_to_recordset(${JSON.stringify(schemaRelease.columns)}::jsonb) AS expected("table" text,"column" text,"type" text,list boolean,"enum" boolean)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
          JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
          JOIN pg_catalog.pg_type base ON base.oid=CASE WHEN t.typelem<>0 THEN t.typelem ELSE t.oid END
          JOIN pg_catalog.pg_namespace tn ON tn.oid=base.typnamespace
          WHERE n.nspname=${schema} AND c.relname=expected."table" AND c.relkind IN ('r','p') AND a.attname=expected."column"
            AND a.attnum>0 AND NOT a.attisdropped AND base.typname=expected."type" AND (t.typelem<>0)=expected.list
            AND tn.nspname=CASE WHEN expected."enum" THEN ${schema} ELSE 'pg_catalog' END
        )`;
      const values = await tx.$queryRaw<Array<{ missing: number }>>`
        SELECT count(*)::int AS missing FROM jsonb_to_recordset(${JSON.stringify(schemaRelease.enums)}::jsonb) AS expected("type" text,"value" text)
        WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_type t ON t.typnamespace=n.oid JOIN pg_catalog.pg_enum e ON e.enumtypid=t.oid
          WHERE n.nspname=${schema} AND t.typname=expected."type" AND e.enumlabel=expected."value")`;
      const missingShape = (shape[0]?.missing ?? 1) + (values[0]?.missing ?? 1);
      return missingShape ? result("schema-mismatch", missingShape) : result("ready");
    }, { isolationLevel: "RepeatableRead", timeout: 12_000, maxWait: 5_000 });
  } catch { return result("unavailable"); }
}

export class DatabaseReleaseError extends Error {
  constructor(public readonly status: DatabaseReleaseStatus) {
    super(status === "recovery-held"
      ? "Database release is not ready (recovery-held). Keep the target isolated and follow the recovery runbook before running background work."
      : `Database release is not ready (${status}). Apply and verify this release's migrations before running background work.`);
  }
}

export async function requireDatabaseRelease() {
  const state = await checkDatabaseRelease();
  if (state.status !== "ready") throw new DatabaseReleaseError(state.status);
}

export async function waitForDatabaseRelease(options: { stopping: () => boolean; onWait: (status: DatabaseReleaseStatus) => void; timeoutMs?: number; intervalMs?: number }) {
  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60_000);
  let lastStatus: DatabaseReleaseStatus | undefined;
  while (!options.stopping()) {
    const result = await checkDatabaseRelease();
    if (result.status === "ready") return true;
    if (result.status !== lastStatus) { options.onWait(result.status); lastStatus = result.status; }
    if (Date.now() >= deadline) throw new DatabaseReleaseError(result.status);
    // A normal signal can stop the startup wait within two seconds.
    await new Promise(resolve => setTimeout(resolve, Math.min(options.intervalMs ?? 2000, Math.max(0, deadline - Date.now()))));
  }
  return false;
}
