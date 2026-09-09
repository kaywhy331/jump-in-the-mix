import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer, connect, type Socket } from "node:net";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("unattended worker processes on PostgreSQL", () => {
  const database = `jitm_design_runtime_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  let admin: Client, sql: Client, gate: Client, db: PrismaClient, url: URL;
  const children: ChildProcess[] = [], output = new Map<ChildProcess, string>();
  const sockets = new Set<Socket>(); let proxyOffline = false;
  const proxy = createServer(incoming => {
    if (proxyOffline) { incoming.destroy(); return; }
    const upstream = connect({ host: url.hostname, port: Number(url.port) });
    for (const socket of [incoming, upstream]) { sockets.add(socket); socket.on("error", () => { incoming.destroy(); upstream.destroy(); }); socket.on("close", () => { sockets.delete(socket); incoming.destroy(); upstream.destroy(); }); }
    incoming.pipe(upstream); upstream.pipe(incoming);
  });
  beforeAll(async () => {
    url = new URL(process.env.DATABASE_URL!); url.pathname = "/postgres"; url.search = "";
    admin = new Client({ connectionString: url.href }); await admin.connect(); await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    url.pathname = `/${database}`;
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.href }, timeout: 45_000 });
    sql = new Client({ connectionString: url.href }); gate = new Client({ connectionString: url.href });
    await sql.connect(); await gate.connect(); await sql.query("SET TIME ZONE 'UTC'");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }), log: [] });
    await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  }, 60_000);
  async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const done = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill(signal);
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await done; } finally { clearTimeout(timer); }
  }
  afterEach(async () => {
    await Promise.all(children.splice(0).map(child => stop(child)));
    for (const socket of sockets) socket.destroy(); proxyOffline = false;
    await gate.query("SELECT pg_advisory_unlock_all()");
    await sql.query('DROP TRIGGER IF EXISTS worker_import_gate ON "IdempotencyKey"'); await sql.query('DROP FUNCTION IF EXISTS worker_import_gate()');
    await db.contactImportBatch.deleteMany(); await db.workspacePreference.deleteMany(); await db.workspace.deleteMany(); await db.user.deleteMany();
    await db.job.deleteMany(); await db.workerHeartbeat.deleteMany(); output.clear();
  });
  afterAll(async () => {
    await Promise.all(children.map(child => stop(child))); for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
    await db?.$disconnect(); await gate?.end(); await sql?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); await admin.end(); }
  });
  function start(viaProxy = false) {
    const target = new URL(url); if (viaProxy) target.port = String((proxy.address() as { port: number }).port);
    const child = spawn(process.execPath, ["--import", "tsx", "src/worker/index.ts"], { env: {
      ...process.env, DATABASE_URL: target.href, NODE_ENV: "production", APP_URL: "http://127.0.0.1:1", DATA_ENCRYPTION_KEY: "runtime-test-only", AUTH_RATE_LIMIT_SECRET: "runtime-test-only",
      RESEND_API_KEY: "", RESEND_RECOVERY_API_KEY: "", EMAIL_FROM: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", WEB_PUSH_VAPID_PRIVATE_KEY: "", WEB_PUSH_VAPID_PUBLIC_KEY: "", OPS_ALERT_WEBHOOK_URL: "", NETLIFY_WORKER_SECRET: "", WORKER_DISPATCH_MODE: "off"
    }, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child); output.set(child, "");
    for (const stream of [child.stdout, child.stderr]) stream?.on("data", chunk => output.set(child, (output.get(child)! + String(chunk)).slice(-8000)));
    return child;
  }
  async function until(predicate: () => Promise<boolean> | boolean, timeout = 20_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Worker runtime verification timed out. ${[...output.values()].join("\n").slice(-3000)}`);
  }
  async function ready(child: ChildProcess) { await until(() => output.get(child)!.includes("Jump worker started.")); await until(async () => await db.workerHeartbeat.count() > 0); }
  async function fixture() {
    const id = randomUUID();
    const user = await db.user.create({ data: { name: "Worker owner", email: `${id}@example.test` } });
    const workspace = await db.workspace.create({ data: { name: "Worker runtime", slug: id, ownerId: user.id, profile: { create: {} } } });
    const contact = await db.contact.create({ data: { workspaceId: workspace.id, displayName: "Runtime contact" } });
    const template = await db.stepTemplate.create({ data: { workspaceId: workspace.id, name: "Runtime follow-up", channel: "EMAIL" } });
    const version = await db.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hello {{First Name}}" } });
    const mix = await db.mix.create({ data: { workspaceId: workspace.id, name: "Runtime Mix", triggerMode: "MANUAL_START", status: "ACTIVE" } });
    await db.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    await db.mixAssignment.create({ data: { assignmentKey: randomUUID(), workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, startDate: new Date() } });
    return { user, workspace, contact, mix };
  }
  it("runs a future job only when due, with two workers and no web requests", async () => {
    const f = await fixture(); const first = start(), second = start(); await ready(first); await ready(second);
    const job = await db.job.create({ data: { workspaceId: f.workspace.id, task: "generate-jumps", payload: { contactId: f.contact.id }, runAt: new Date(Date.now() + 4000) } });
    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(await db.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 0, completedAt: null }); expect(await db.jump.count()).toBe(0);
    await until(async () => Boolean((await db.job.findUnique({ where: { id: job.id } }))?.completedAt));
    expect(await db.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 1, failedAt: null, lockedBy: null });
    expect(await db.jump.count({ where: { contactId: f.contact.id } })).toBe(1);
  }, 35_000);
  it("settles an exhausted stale lease without repeating customer effects", async () => {
    const f = await fixture();
    const job = await db.job.create({ data: { workspaceId: f.workspace.id, task: "generate-jumps", payload: { contactId: f.contact.id }, attempts: 8, maxAttempts: 8, lockedBy: "dead-worker", lockedAt: new Date(Date.now() - 11 * 60_000) } });
    await ready(start()); await until(async () => Boolean((await db.job.findUnique({ where: { id: job.id } }))?.failedAt));
    expect(await db.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 8, completedAt: null, lockedBy: null, lastError: expect.stringContaining("attempt limit") });
    expect(await db.jump.count()).toBe(0);
  }, 30_000);
  it("survives a real SIGKILL between imported rows and resumes only after lease expiry", async () => {
    const f = await fixture(), importId = `runtime_${randomUUID()}`;
    const rows = ["first", "second"].map((name, index) => ({ record: { rowId: name, sourceRow: index + 2, source: "CSV", displayName: name, firstName: null, lastName: null, company: null, publicNotes: null, emails: [], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId: name, action: "CREATE", targetContactId: null } }));
    const batch = await db.contactImportBatch.create({ data: { workspaceId: f.workspace.id, actorUserId: f.user.id, importId, totalRows: 2, payload: { items: rows, initialResults: [] }, results: [] } });
    const job = await db.job.create({ data: { workspaceId: f.workspace.id, task: "contact-import", payload: { batchId: batch.id } } });
    await gate.query("SELECT pg_advisory_lock(772382)");
    await sql.query(`CREATE FUNCTION worker_import_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key LIKE '%:second' THEN PERFORM pg_advisory_xact_lock(772382); END IF; RETURN NEW; END $$`);
    await sql.query('CREATE TRIGGER worker_import_gate BEFORE INSERT ON "IdempotencyKey" FOR EACH ROW EXECUTE FUNCTION worker_import_gate()');
    const first = start(); await ready(first);
    await until(async () => (await sql.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=772382 AND NOT granted")).rowCount === 1);
    await stop(first, "SIGKILL"); await gate.query("SELECT pg_advisory_unlock(772382)");
    expect(await db.idempotencyKey.count()).toBe(1);
    const second = start(); await ready(second); await new Promise(resolve => setTimeout(resolve, 2500));
    expect(await db.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 1, completedAt: null });
    // Expiry is controlled to keep CI bounded; process death and restart are real.
    await db.job.update({ where: { id: job.id }, data: { lockedAt: new Date(Date.now() - 11 * 60_000) } });
    await until(async () => Boolean((await db.job.findUnique({ where: { id: job.id } }))?.completedAt));
    expect(await db.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 2, failedAt: null });
    expect(await db.contactImportBatch.findUnique({ where: { id: batch.id } })).toMatchObject({ status: "COMPLETED", processedRows: 2, createdCount: 2 });
    expect(await db.idempotencyKey.count()).toBe(2); expect(await db.auditLog.count({ where: { action: "contact.import.create" } })).toBe(2);
    expect(await db.contact.count()).toBe(3);
  }, 40_000);
  it("recovers queued work after a connection outage and supervisor restart", async () => {
    const f = await fixture(), first = start(true); await ready(first);
    const job = await db.job.create({ data: { workspaceId: f.workspace.id, task: "generate-jumps", payload: { contactId: f.contact.id }, runAt: new Date(Date.now() + 4000) } });
    proxyOffline = true; for (const socket of sockets) socket.destroy();
    await until(() => first.exitCode !== null || first.signalCode !== null, 30_000);
    expect(first.exitCode).not.toBe(0);
    expect(await db.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 0, completedAt: null });
    proxyOffline = false; const second = start(true); await ready(second);
    await until(async () => Boolean((await db.job.findUnique({ where: { id: job.id } }))?.completedAt));
    expect(await db.jump.count()).toBe(1); expect(await db.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 1, failedAt: null });
  }, 55_000);
  it.skipIf(process.env.RUN_WORKER_UNATTENDED_TESTS !== "true")("repeats periodic preparation at the real five-minute interval without web traffic", async () => {
    const f = await fixture();
    await db.workspacePreference.create({ data: { workspaceId: f.workspace.id, nextReconcileAt: new Date() } });
    await ready(start());
    await until(async () => Boolean((await db.workspacePreference.findUnique({ where: { workspaceId: f.workspace.id } }))?.lastReconciledAt));
    const first = (await db.workspacePreference.findUniqueOrThrow({ where: { workspaceId: f.workspace.id } })).lastReconciledAt!;
    const contact = await db.contact.create({ data: { workspaceId: f.workspace.id, displayName: "Next interval contact" } });
    await db.mixAssignment.create({ data: { assignmentKey: randomUUID(), workspaceId: f.workspace.id, mixId: f.mix.id, contactId: contact.id, startDate: new Date() } });
    await new Promise(resolve => setTimeout(resolve, 4000));
    expect(await db.jump.count({ where: { contactId: contact.id } })).toBe(0); expect(await db.job.count({ where: { workspaceId: f.workspace.id } })).toBe(0);
    await until(async () => (await db.jump.count({ where: { contactId: contact.id } })) === 1, 330_000);
    await until(async () => (await db.workspacePreference.findUniqueOrThrow({ where: { workspaceId: f.workspace.id } })).lastReconciledAt!.getTime() > first.getTime());
    const second = (await db.workspacePreference.findUniqueOrThrow({ where: { workspaceId: f.workspace.id } })).lastReconciledAt!;
    expect(second.getTime() - first.getTime()).toBeGreaterThanOrEqual(300_000);
    expect(await db.jump.count()).toBe(2);
  }, 360_000);
});
