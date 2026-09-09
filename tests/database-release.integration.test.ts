import { randomUUID } from "node:crypto";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { schemaRelease } from "../src/generated/schema-release";
import { checkDatabaseRelease } from "../src/lib/database-release";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("release schema checks and worker startup on PostgreSQL", () => {
  const database = `jitm_design_release_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const restore: Array<() => Promise<unknown>> = [];
  let admin: Client, sql: Client, db: PrismaClient, url: URL, child: ChildProcess | undefined;
  let workerOutput = "";
  beforeAll(async () => {
    url = new URL(process.env.DATABASE_URL!); url.pathname = "/postgres"; url.search = "";
    admin = new Client({ connectionString: url.href }); await admin.connect(); await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    url.pathname = `/${database}`;
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.href }, timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
    sql = new Client({ connectionString: url.href }); await sql.connect();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }), log: [] });
  }, 60_000);
  async function stopWorker() {
    const target = child; child = undefined;
    if (!target || target.exitCode !== null || target.signalCode !== null) return;
    const done = new Promise<void>(resolve => target.once("exit", () => resolve()));
    target.kill("SIGTERM");
    const timeout = setTimeout(() => target.kill("SIGKILL"), 4000);
    try { await done; } finally { clearTimeout(timeout); }
  }
  afterEach(async () => {
    await stopWorker();
    for (const reset of restore.splice(0).reverse()) await reset();
    await sql.query('DELETE FROM "Job"'); await sql.query('DELETE FROM "WorkerHeartbeat"');
  });
  afterAll(async () => { await stopWorker(); await db?.$disconnect(); await sql?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); await admin.end(); } });
  const inspect = (requireHistory = true) => checkDatabaseRelease(db, { requireHistory });
  async function changeMigration(data: { checksum?: string; pending?: boolean; rolledBack?: boolean }) {
    const latest = schemaRelease.migrations.at(-1)!;
    const old = (await sql.query('SELECT checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1', [latest.name])).rows[0];
    await sql.query('UPDATE "_prisma_migrations" SET checksum=$2, finished_at=$3, rolled_back_at=$4 WHERE migration_name=$1', [latest.name, data.checksum ?? old.checksum, data.pending ? null : old.finished_at, data.rolledBack ? new Date() : old.rolled_back_at]);
    const reset = () => sql.query('UPDATE "_prisma_migrations" SET checksum=$2, finished_at=$3, rolled_back_at=$4 WHERE migration_name=$1', [latest.name, old.checksum, old.finished_at, old.rolled_back_at]);
    restore.push(reset); return reset;
  }
  async function until(predicate: () => Promise<boolean> | boolean, timeout = 15_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Worker verification timed out. Output: ${workerOutput.slice(-1000)}`);
  }
  function startWorker() {
    workerOutput = "";
    child = spawn(process.execPath, ["--import", "tsx", "src/worker/index.ts"], { env: { ...process.env, DATABASE_URL: url.href, NODE_ENV: "production", DATA_ENCRYPTION_KEY: "release-test-only", AUTH_RATE_LIMIT_SECRET: "release-test-only", RESEND_API_KEY: "", RESEND_RECOVERY_API_KEY: "", EMAIL_FROM: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", WEB_PUSH_VAPID_PRIVATE_KEY: "", WEB_PUSH_VAPID_PUBLIC_KEY: "", OPS_ALERT_WEBHOOK_URL: "", NETLIFY_WORKER_SECRET: "", WORKER_DISPATCH_MODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream?.on("data", chunk => { workerOutput = (workerOutput + String(chunk)).slice(-8000); });
    return child;
  }
  it("qualifies the installed release and every required model column and enum value", async () => {
    expect(await inspect()).toEqual({ status: "ready", required: schemaRelease.migrations.length, missing: 0, mismatched: 0 });
    expect(new Set(schemaRelease.columns.map(item => item.table)).size).toBeGreaterThan(90);
  });
  it.each(["{}", "", "off", "malformed"])("holds recovery for any persistent metadata value (%s)", async value => {
    restore.push(() => sql.query(`ALTER DATABASE "${database}" RESET jitm.recovery_hold`));
    await sql.query(`ALTER DATABASE "${database}" SET jitm.recovery_hold TO '${value}'`);
    expect(await inspect()).toMatchObject({ status: "recovery-held", missing: 0, mismatched: 0 });
    expect((await inspect(false)).status).toBe("recovery-held");
  });
  it("keeps a restored database held despite a session override, including for a restricted runtime role", async () => {
    const role = `recovery_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE ROLE "${role}" LOGIN`);
    restore.push(() => sql.query(`ALTER DATABASE "${database}" RESET jitm.recovery_hold`));
    await sql.query(`ALTER DATABASE "${database}" SET jitm.recovery_hold TO 'held'`);
    const restrictedUrl = new URL(url); restrictedUrl.username = role; restrictedUrl.password = "";
    const limited = new Client({ connectionString: restrictedUrl.href }); await limited.connect();
    const restricted = new PrismaClient({ adapter: new PrismaPg({ connectionString: restrictedUrl.href }), log: [] });
    try {
      await limited.query("SET jitm.recovery_hold TO ''");
      expect((await limited.query("SELECT current_setting('jitm.recovery_hold') AS value")).rows[0].value).toBe("");
      const { recoveryHoldQuery } = await import("../src/lib/recovery-hold-query.mjs");
      expect((await limited.query(recoveryHoldQuery)).rows).toHaveLength(1);
      expect((await checkDatabaseRelease(restricted)).status).toBe("recovery-held");
      await expect(limited.query(`ALTER DATABASE "${database}" RESET jitm.recovery_hold`)).rejects.toThrow("owner");
    } finally { await restricted.$disconnect(); await limited.end(); await admin.query(`DROP ROLE "${role}"`); }
  });
  it("does not start a real worker or claim restored jobs during a recovery hold", async () => {
    restore.push(() => sql.query(`ALTER DATABASE "${database}" RESET jitm.recovery_hold`));
    await sql.query(`ALTER DATABASE "${database}" SET jitm.recovery_hold TO 'held'`);
    const job = await db.job.create({ data: { task: "restored-job", payload: {} } });
    startWorker(); await until(() => workerOutput.includes("recovery-held"));
    expect(await db.workerHeartbeat.count()).toBe(0); expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(0);
    await stopWorker();
  }, 20_000);
  it("requires production migration history while preserving fully shaped db:push development databases", async () => {
    await sql.query('ALTER TABLE "_prisma_migrations" RENAME TO "_test_history"'); restore.push(() => sql.query('ALTER TABLE "_test_history" RENAME TO "_prisma_migrations"'));
    expect((await inspect()).status).toBe("missing-history"); expect((await inspect(false)).status).toBe("ready");
  });
  it("holds a release with an interrupted migration", async () => { await changeMigration({ pending: true }); expect((await inspect()).status).toBe("migration-in-progress"); });
  it("rejects changed migration SQL instead of trusting a matching name", async () => { await changeMigration({ checksum: "0".repeat(64) }); expect(await inspect()).toMatchObject({ status: "migration-mismatch", mismatched: 1 }); });
  it("does not treat a rolled-back required migration as installed", async () => { await changeMigration({ rolledBack: true }); expect(await inspect()).toMatchObject({ status: "pending-migrations", missing: 1 }); });
  it("rejects a conflicting successful duplicate even when an older matching checksum remains", async () => {
    const id = randomUUID(); restore.push(() => sql.query('DELETE FROM "_prisma_migrations" WHERE id=$1', [id]));
    await sql.query('INSERT INTO "_prisma_migrations" (id,migration_name,checksum,started_at,finished_at) VALUES ($1,$2,$3,now(),now())', [id, schemaRelease.migrations.at(-1)!.name, "b".repeat(64)]);
    expect(await inspect()).toMatchObject({ status: "migration-mismatch", mismatched: 1 });
  });
  it("allows an additive newer release but waits while any migration is unfinished", async () => {
    const id = randomUUID(); restore.push(() => sql.query('DELETE FROM "_prisma_migrations" WHERE id=$1', [id]));
    await sql.query('INSERT INTO "_prisma_migrations" (id,migration_name,checksum,started_at,finished_at) VALUES ($1,$2,$3,now(),now())', [id, "29990101000000_future_additive", "a".repeat(64)]);
    expect((await inspect()).status).toBe("ready");
    await sql.query('UPDATE "_prisma_migrations" SET finished_at=NULL WHERE id=$1', [id]); expect((await inspect()).status).toBe("migration-in-progress");
  });
  it.each(["column", "type", "list", "enum"])("detects %s drift even when the migration ledger claims success", async kind => {
    if (kind === "column") { await sql.query('ALTER TABLE "SupportEmailDelivery" RENAME COLUMN "leaseId" TO "_test_lease"'); restore.push(() => sql.query('ALTER TABLE "SupportEmailDelivery" RENAME COLUMN "_test_lease" TO "leaseId"')); }
    if (kind === "type") { await sql.query('ALTER TABLE "User" ALTER COLUMN name TYPE varchar'); restore.push(() => sql.query('ALTER TABLE "User" ALTER COLUMN name TYPE text')); }
    if (kind === "list") { await sql.query('ALTER TABLE "User" ALTER COLUMN name TYPE text[] USING ARRAY[name]'); restore.push(() => sql.query('ALTER TABLE "User" ALTER COLUMN name TYPE text USING name[1]')); }
    if (kind === "enum") { await sql.query(`ALTER TYPE "SupportEmailDeliveryStatus" RENAME VALUE 'REVIEW' TO '_TEST_REVIEW'`); restore.push(() => sql.query(`ALTER TYPE "SupportEmailDeliveryStatus" RENAME VALUE '_TEST_REVIEW' TO 'REVIEW'`)); }
    expect(await inspect()).toMatchObject({ status: "schema-mismatch", missing: 1 });
  });
  it("rejects unsafe schema identifiers before making a query", async () => { await expect(checkDatabaseRelease(db, { schema: 'public";DROP SCHEMA public' })).rejects.toThrow("Invalid database schema"); expect((await inspect()).status).toBe("ready"); });
  it("returns a bounded, content-free unavailable state for an unreadable database", async () => {
    const role = `release_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE ROLE "${role}" LOGIN`);
    const restrictedUrl = new URL(url); restrictedUrl.username = role; restrictedUrl.password = "";
    const restricted = new PrismaClient({ adapter: new PrismaPg({ connectionString: restrictedUrl.href }), log: [] });
    try { expect(await checkDatabaseRelease(restricted, { requireHistory: true })).toMatchObject({ status: "unavailable", missing: 0, mismatched: 0 }); }
    finally { await restricted.$disconnect(); await admin.query(`DROP ROLE "${role}"`); }
  });
  it("starts a real worker only after migration completion, without claiming the queued job or advertising health early", async () => {
    const reset = await changeMigration({ pending: true });
    const job = await db.job.create({ data: { task: "release-test-unsupported-task", payload: {} } });
    startWorker(); await until(() => workerOutput.includes("waiting for database release verification"));
    expect(await db.workerHeartbeat.count()).toBe(0); expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(0);
    await reset();
    await until(async () => await db.workerHeartbeat.count({ where: { status: "RUNNING" } }) === 1);
    await until(async () => (await db.job.findUniqueOrThrow({ where: { id: job.id } })).attempts > 0);
    await stopWorker(); expect((await db.workerHeartbeat.findFirstOrThrow()).status).toBe("STOPPED");
  }, 30_000);
  it("handles shutdown during a pending-migration wait without writing a heartbeat", async () => {
    await changeMigration({ pending: true }); const process = startWorker();
    await until(() => workerOutput.includes("waiting for database release verification"));
    await stopWorker(); expect(process.exitCode).toBe(0); expect(await db.workerHeartbeat.count()).toBe(0);
  }, 20_000);
});
