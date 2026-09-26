import { readFileSync } from "node:fs";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client";
import { REPORT_EXPORT_TASK, REPORT_SNAPSHOT_TASK } from "../src/lib/report-storage-policy";

// The worker claims due, unfinished jobs through the partial index a hand-written migration creates
// (20260722010000_integrity_constraints). Prisma does not describe it, so `prisma db push` databases
// lack it (docs/DATABASE_HAND_WRITTEN_OBJECTS.md); this checks the migrated database has it and that
// PostgreSQL can serve the claim query with it. The job table is tiny in tests, so the plan is read
// with sequential scans switched off rather than trusting the planner's choice on a few rows.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const INDEX = 'CREATE INDEX "Job_claim_ready_idx" ON public."Job" USING btree ("runAt", "createdAt") WHERE (("completedAt" IS NULL) AND ("failedAt" IS NULL))';

describe.skipIf(!local)("job claim index", () => {
  let sql: Client, db: PrismaClient;
  const queries: Array<{ query: string; params: string }> = [];
  beforeAll(async () => {
    sql = new Client({ connectionString: process.env.DATABASE_URL }); await sql.connect();
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }), log: [{ emit: "event", level: "query" }] });
    client.$on("query", event => { queries.push({ query: event.query, params: event.params }); });
    db = client;
  });
  afterAll(async () => { await db?.$disconnect(); await sql?.end(); });

  // The first claim query of claimJob in src/worker/index.ts (customer work, run on every loop), built
  // by Prisma exactly as the worker builds it. The report fallback filters on two task names and may
  // equally use Job_workspaceId_task_idx.
  async function claimQuery() {
    const now = new Date(), staleBefore = new Date(now.getTime() - 10 * 60_000);
    queries.length = 0;
    await db.job.findFirst({
      where: { completedAt: null, failedAt: null, task: { notIn: [REPORT_EXPORT_TASK, REPORT_SNAPSHOT_TASK] }, runAt: { lte: now }, OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
      orderBy: [{ runAt: "asc" }, { createdAt: "asc" }]
    });
    const claim = queries.find(entry => /FROM "public"\."Job"/.test(entry.query) && /ORDER BY/.test(entry.query));
    if (!claim) throw new Error(`The claim query was not logged: ${queries.map(entry => entry.query).join("\n")}`);
    return { query: claim.query, params: JSON.parse(claim.params) as unknown[] };
  }

  async function planWithoutSequentialScans(query: string, params: unknown[]) {
    await sql.query("BEGIN");
    try {
      await sql.query("SET LOCAL enable_seqscan = off");
      const { rows } = await sql.query(`EXPLAIN (FORMAT JSON) ${query}`, params);
      return JSON.stringify(rows[0]["QUERY PLAN"]);
    } finally {
      await sql.query("ROLLBACK");
    }
  }

  it("keeps its definition in the migrated database", async () => {
    const { rows } = await sql.query("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Job' AND indexname = 'Job_claim_ready_idx'");
    expect(rows.map(row => row.indexdef)).toEqual([INDEX]);
  });

  it("is what the worker's claim filter and order are written against", () => {
    const worker = readFileSync("src/worker/index.ts", "utf8");
    const claim = worker.slice(worker.indexOf("async function claimJob()"), worker.indexOf("type ClaimedJob"));
    expect(claim.match(/completedAt: null,?\s*failedAt: null/g)?.length).toBeGreaterThanOrEqual(3);
    expect(claim.match(/runAt: \{ lte: now \}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(claim.match(/orderBy: \[\{ runAt: "asc" \}, \{ createdAt: "asc" \}\]/g)).toHaveLength(2);
  });

  it("serves the worker's claim query", async () => {
    const { query, params } = await claimQuery();
    expect(query).toMatch(/ORDER BY "public"\."Job"\."runAt" ASC, "public"\."Job"\."createdAt" ASC/);
    const plan = await planWithoutSequentialScans(query, params);
    expect(plan).toContain('"Index Name":"Job_claim_ready_idx"');
  });
});
