import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { ImportCommitItem } from "../src/lib/contact-import-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("import crash recovery on PostgreSQL", () => {
  const database = `jitm_design_import_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  let admin: Client, sql: Client, gate: Client, db: PrismaClient, url: URL;
  let jobs: typeof import("../src/lib/contact-import-jobs");
  let service: typeof import("../src/lib/contact-import-service");
  let retention: typeof import("../src/lib/import-receipt-retention");
  beforeAll(async () => {
    url = new URL(process.env.DATABASE_URL!); url.pathname = "/postgres"; url.search = "";
    admin = new Client({ connectionString: url.href }); await admin.connect();
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`); url.pathname = `/${database}`;
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.href }, timeout: 45_000 });
    sql = new Client({ connectionString: url.href }); gate = new Client({ connectionString: url.href });
    await sql.connect(); await gate.connect(); await sql.query("SET TIME ZONE 'UTC'");
    vi.stubEnv("DATABASE_URL", url.href);
    db = (await import("../src/lib/prisma")).prisma;
    jobs = await import("../src/lib/contact-import-jobs"); service = await import("../src/lib/contact-import-service");
    retention = await import("../src/lib/import-receipt-retention");
  }, 60_000);
  afterEach(async () => {
    await gate.query("SELECT pg_advisory_unlock_all()");
    await sql.query('DROP TRIGGER IF EXISTS import_receipt_fault ON "IdempotencyKey"');
    await sql.query('DROP FUNCTION IF EXISTS import_receipt_fault()');
    await db.contactImportBatch.deleteMany(); await db.workspace.deleteMany(); await db.user.deleteMany();
  });
  afterAll(async () => {
    await db?.$disconnect(); await gate?.end(); await sql?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); await admin.end(); }
    vi.unstubAllEnvs();
  });
  function item(rowId = "row-first"): ImportCommitItem {
    return { record: { rowId, sourceRow: 2, source: "CSV", displayName: rowId, firstName: null, lastName: null, company: null, publicNotes: null, emails: [], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId, action: "CREATE", targetContactId: null } };
  }
  async function fixture(items = [item()]) {
    const id = randomUUID();
    const user = await db.user.create({ data: { email: `${id}@example.test`, name: "Import owner" } });
    const workspace = await db.workspace.create({ data: { name: "Import recovery", slug: id, ownerId: user.id, profile: { create: {} } } });
    const input = { workspaceId: workspace.id, actorUserId: user.id, importId: `import_${id}`, items };
    const batch = await jobs.queueContactImportBatch(input);
    const job = await db.job.findFirstOrThrow({ where: { workspaceId: workspace.id, task: "contact-import" } });
    const lease = { jobId: job.id, leaseId: `fixture:${id}` };
    await db.job.update({ where: { id: job.id }, data: { lockedBy: lease.leaseId, lockedAt: new Date(), attempts: 1 } });
    return { input, batch, job, lease, user, workspace };
  }
  async function until(predicate: () => Promise<boolean>, timeout = 6000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
    throw new Error("PostgreSQL import gate timed out");
  }
  async function installFault(body: string) {
    await sql.query(`CREATE FUNCTION import_receipt_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} RETURN NEW; END $$`);
    await sql.query('CREATE TRIGGER import_receipt_fault BEFORE INSERT ON "IdempotencyKey" FOR EACH ROW EXECUTE FUNCTION import_receipt_fault()');
  }
  it("rolls back contact, dates, audit and preparation when the receipt cannot commit", async () => {
    const row = item(); row.record.jumpDates = [{ dateTypeId: null, dateTypeName: "Recovery anniversary", label: null, dateValue: "2026-01-12", month: 1, day: 12, recurrence: "YEARLY" }];
    const f = await fixture([row]);
    await installFault("RAISE EXCEPTION 'synthetic receipt failure';");
    await expect(jobs.runContactImportBatch(f.batch.id, f.lease)).rejects.toThrow();
    expect(await db.contact.count()).toBe(0); expect(await db.jumpDate.count()).toBe(0);
    expect(await db.dateType.count({ where: { workspaceId: f.workspace.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "contact.import.create" } })).toBe(0);
    expect(await db.job.count({ where: { task: "generate-jumps" } })).toBe(0);
    expect(await db.idempotencyKey.count()).toBe(0);
    expect(await jobs.getContactImportBatch(f.workspace.id, f.batch.id)).toMatchObject({ processedRows: 0, failedCount: 0, status: "RUNNING" });
    await sql.query('DROP TRIGGER import_receipt_fault ON "IdempotencyKey"');
    await jobs.runContactImportBatch(f.batch.id, f.lease);
    expect(await db.contact.count()).toBe(1); expect(await db.jumpDate.count()).toBe(1);
    expect(await jobs.getContactImportBatch(f.workspace.id, f.batch.id)).toMatchObject({ status: "COMPLETED", createdCount: 1 });
  });
  it("serializes concurrent retries of a row without an email or phone", async () => {
    const f = await fixture();
    const input = { ...f.input, importId: `sync_${randomUUID()}`, timezone: "UTC" };
    const responses = await Promise.all(Array.from({ length: 8 }, () => service.commitContactImportBatch(input)));
    expect(new Set(responses.map(rows => rows[0].contactId)).size).toBe(1);
    expect(await db.contact.count()).toBe(1); expect(await db.idempotencyKey.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "contact.import.create" } })).toBe(1);
    expect(await db.job.count({ where: { task: "generate-jumps" } })).toBe(1);
  });
  it.each(["MERGE", "REPLACE"] as const)("rolls back an interrupted %s and applies it once on retry", async action => {
    const row = item(), f = await fixture([row]);
    const contact = await db.contact.create({ data: { workspaceId: f.workspace.id, displayName: "Original", publicNotes: "Original note" } });
    row.record.displayName = "Updated"; row.record.publicNotes = "Imported note";
    row.record.emails = [{ value: "imported@example.test", label: null, isPrimary: true }];
    row.resolution = { rowId: row.record.rowId, action, targetContactId: contact.id };
    await installFault("RAISE EXCEPTION 'synthetic receipt failure';");
    const importId = `sync_${randomUUID()}`;
    const commit = () => service.commitContactImportBatch({ ...f.input, importId, items: [row], timezone: "UTC" });
    await expect(commit()).rejects.toThrow();
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ displayName: "Original", publicNotes: "Original note" });
    expect(await db.contactEmail.count()).toBe(0); expect(await db.job.count({ where: { task: "generate-jumps" } })).toBe(0);
    await sql.query('DROP TRIGGER import_receipt_fault ON "IdempotencyKey"');
    const result = await commit(); expect(result[0]).toMatchObject({ status: action === "MERGE" ? "MERGED" : "REPLACED", contactId: contact.id });
    expect(await commit()).toEqual(result);
    const saved = await db.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(saved.publicNotes!.match(/Imported note/g)).toHaveLength(1);
    expect(await db.contact.count()).toBe(1); expect(await db.contactEmail.count()).toBe(1);
    expect(await db.job.count({ where: { task: "generate-jumps" } })).toBe(1);
  });
  it("queues one batch under concurrent requests and rejects repeated row identifiers", async () => {
    const f = await fixture();
    const input = { ...f.input, importId: `second_${randomUUID()}` };
    const batches = await Promise.all(Array.from({ length: 6 }, () => jobs.queueContactImportBatch(input)));
    expect(new Set(batches.map(batch => batch.id)).size).toBe(1);
    expect(await db.job.count({ where: { task: "contact-import", payload: { path: ["batchId"], equals: batches[0].id } } })).toBe(1);
    await expect(jobs.queueContactImportBatch({ ...input, importId: `third_${randomUUID()}`, items: [item(), item()] })).rejects.toThrow("identifier");
  });
  it("prevents the synchronous endpoint from bypassing a saved batch or its cancellation", async () => {
    const f = await fixture();
    for (const status of ["QUEUED", "RUNNING", "CANCELED"] as const) {
      await db.contactImportBatch.update({ where: { id: f.batch.id }, data: { status, completedAt: status === "CANCELED" ? new Date() : null, canceledAt: status === "CANCELED" ? new Date() : null } });
      await expect(service.commitContactImportBatch({ ...f.input, timezone: "UTC" })).rejects.toThrow("saved batch");
    }
    expect(await db.contact.count()).toBe(0); expect(await db.idempotencyKey.count()).toBe(0);
  });
  it.each(["expired", "foreign", "failed", "completed"])("rejects a %s lease before writing contacts", async kind => {
    const f = await fixture();
    await db.job.update({ where: { id: f.job.id }, data: kind === "expired" ? { lockedAt: new Date(Date.now() - 11 * 60_000) } : kind === "foreign" ? { lockedBy: "another-worker" } : kind === "failed" ? { failedAt: new Date() } : { completedAt: new Date() } });
    await expect(jobs.runContactImportBatch(f.batch.id, f.lease)).rejects.toThrow("no longer owns");
    expect(await db.contact.count()).toBe(0);
  });
  it.each(["cancel", "takeover"])("fences a running chunk when %s wins after a committed row", async operation => {
    const f = await fixture([item(), item("row-second")]);
    const key = 772381;
    await gate.query("SELECT pg_advisory_lock($1)", [key]);
    await installFault(`IF NEW.key LIKE '%:row-first' THEN PERFORM pg_advisory_xact_lock(${key}); END IF;`);
    const sqlPid = (await sql.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const oldRun = jobs.runContactImportBatch(f.batch.id, f.lease).then(() => null, error => error);
    await until(async () => (await sql.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted", [key])).rowCount === 1);
    const nextLease = { jobId: f.job.id, leaseId: "replacement-worker" };
    const change = operation === "cancel" ? jobs.cancelContactImportBatch(f.workspace.id, f.batch.id) : sql.query('UPDATE "Job" SET "lockedBy"=$2, "lockedAt"=($3::timestamptz AT TIME ZONE \'UTC\'), attempts=2 WHERE id=$1', [f.job.id, nextLease.leaseId, new Date().toISOString()]);
    if (operation === "cancel") await until(async () => (await sql.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=814733 AND objid=1 AND NOT granted")).rowCount! > 0);
    else await until(async () => (await gate.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [sqlPid])).rows[0]?.wait_event_type === "Lock");
    await gate.query("SELECT pg_advisory_unlock($1)", [key]); await change;
    expect(await oldRun).toBeInstanceOf(Error);
    expect(await db.contact.count()).toBe(1); expect(await db.idempotencyKey.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "contact.import.completed" } })).toBe(0);
    if (operation === "cancel") {
      expect(await jobs.getContactImportBatch(f.workspace.id, f.batch.id)).toMatchObject({ status: "CANCELED", processedRows: 1, createdCount: 1 });
      await expect(jobs.runContactImportBatch(f.batch.id, f.lease)).rejects.toThrow("no longer owns");
    } else {
      await jobs.runContactImportBatch(f.batch.id, nextLease);
      expect(await db.contact.count()).toBe(2);
      expect(await jobs.getContactImportBatch(f.workspace.id, f.batch.id)).toMatchObject({ status: "COMPLETED", processedRows: 2, createdCount: 2 });
      expect(await db.auditLog.count({ where: { action: "contact.import.completed" } })).toBe(1);
    }
  }, 15_000);
  it("retains expired receipts for a resumable failed import and deletes them after cancellation", async () => {
    const f = await fixture();
    await db.contactImportBatch.update({ where: { id: f.batch.id }, data: { status: "RUNNING" } });
    await service.commitContactImportBatch({ ...f.input, timezone: "UTC", background: { ...f.lease, batchId: f.batch.id } });
    const expired = new Date(Date.now() - 86_400_000);
    await db.idempotencyKey.updateMany({ data: { expiresAt: expired } });
    await db.contactImportBatch.update({ where: { id: f.batch.id }, data: { status: "FAILED", completedAt: new Date() } });
    await db.job.update({ where: { id: f.job.id }, data: { failedAt: new Date(), lockedBy: null, lockedAt: null } });
    await db.idempotencyKey.createMany({ data: [
      { workspaceId: f.workspace.id, key: `contact-import:${f.input.importId.replaceAll("_", "x")}:row-first`, expiresAt: expired },
      { workspaceId: f.workspace.id, key: "unrelated:expired", expiresAt: expired }
    ] });
    expect(await db.$transaction(tx => retention.deleteExpiredImportSafeKeys(tx, new Date()))).toBe(2);
    expect(await db.idempotencyKey.count()).toBe(1);
    await db.contactImportBatch.update({ where: { id: f.batch.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    expect(await retention.deleteExpiredImportSafeKeys(db, new Date())).toBe(1);
  });
  it("bounds receipt cleanup without removing unexpired records", async () => {
    const f = await fixture(), expired = new Date(Date.now() - 1000);
    await db.idempotencyKey.createMany({ data: Array.from({ length: 1005 }, (_, i) => ({ workspaceId: f.workspace.id, key: `expired:${i}`, expiresAt: expired })) });
    await db.idempotencyKey.create({ data: { workspaceId: f.workspace.id, key: "future:keep", expiresAt: new Date(Date.now() + 86_400_000) } });
    expect(await retention.deleteExpiredImportSafeKeys(db, new Date())).toBe(1000);
    expect(await retention.deleteExpiredImportSafeKeys(db, new Date())).toBe(5);
    expect(await db.idempotencyKey.count()).toBe(1);
  });
  it("closes ambiguous older imports during upgrade while preserving completed and untouched work", async () => {
    const fixtures = [];
    for (const status of ["RUNNING", "FAILED", "QUEUED", "COMPLETED", "PARTIAL", "CANCELED", "QUEUED"] as const) {
      const f = await fixture(); fixtures.push(f);
      const started = fixtures.length !== 3;
      await db.contactImportBatch.update({ where: { id: f.batch.id }, data: { status, startedAt: started ? new Date() : null, completedAt: ["COMPLETED", "PARTIAL", "FAILED", "CANCELED"].includes(status) ? new Date() : null, processedRows: 1, createdCount: 1, results: [{ rowId: "saved", sourceRow: 1, status: "CREATED", contactId: "saved-contact", message: "Saved before upgrade" }], ...(status === "CANCELED" ? { canceledAt: new Date() } : {}) } });
      if (!started) await db.job.update({ where: { id: f.job.id }, data: { attempts: 0, lockedAt: null, lockedBy: null } });
    }
    await sql.query(await readFile("prisma/migrations/20260909120000_import_crash_recovery/migration.sql", "utf8"));
    for (const [index, f] of fixtures.entries()) {
      const batch = await db.contactImportBatch.findUniqueOrThrow({ where: { id: f.batch.id } });
      expect(batch.processedRows).toBe(1); expect(batch.createdCount).toBe(1);
      expect(batch.results).toMatchObject([{ contactId: "saved-contact", message: "Saved before upgrade" }]);
      if ([0, 1, 6].includes(index)) {
        expect(batch.status).toBe("CANCELED"); expect(batch.errorSummary).toContain("needs review");
        const job = await db.job.findUniqueOrThrow({ where: { id: f.job.id } });
        expect(job.failedAt).not.toBeNull(); expect(job.lockedBy).toBeNull();
      } else expect(batch.status).toBe(["RUNNING", "FAILED", "QUEUED", "COMPLETED", "PARTIAL", "CANCELED", "QUEUED"][index]);
    }
    expect(await db.auditLog.count({ where: { action: "contact.import.recovery-required" } })).toBe(3);
    await sql.query(await readFile("prisma/migrations/20260909120000_import_crash_recovery/migration.sql", "utf8"));
    expect(await db.auditLog.count({ where: { action: "contact.import.recovery-required" } })).toBe(3);
  });
});
