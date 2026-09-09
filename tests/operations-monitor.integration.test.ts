import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { collectOperationsSignals } from "../src/lib/operations-signals";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { createOperationsFixture } from "./helpers/operations-fixture";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const execute = promisify(execFile);
it.skipIf(!local)("runs the independent CLI against a real local health endpoint and records bounded aggregate notifications", async () => {
  const f = await createOperationsFixture(), directory = await mkdtemp(join(tmpdir(), "jitm-monitor-cli-"));
  const payloads: string[] = [];
  const server = createServer((request, response) => { if (request.url === "/api/health/ready") { response.end('{"status":"ready"}'); return; } let body = ""; request.on("data", chunk => { body += chunk; }); request.on("end", () => { payloads.push(body); response.end("ok"); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number }, origin = `http://127.0.0.1:${address.port}`;
  try {
    const env = { ...process.env, APP_URL: origin, OPS_ALERT_WEBHOOK_URL: `${origin}/sink`, OPS_MONITOR_STATE_FILE: join(directory, "state.json"), OPS_DATABASE_LIMIT_BYTES: "1000000000000", OPS_BACKUP_RECEIPT_FILE: "", OPS_RESTORE_RECEIPT_FILE: "" };
    const first = await execute(process.execPath, ["--import", "tsx", "scripts/check-operations.ts"], { env, timeout: 30000 });
    expect(first.stdout).toContain('"status":"observed"'); expect(payloads.length).toBeGreaterThan(0);
    expect(await prisma.operationsCheck.count()).toBe(11); expect((await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "web" } })).state).toBe("OK");
    expect((await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } })).state).toBe("CRITICAL");
    const count = payloads.length; await execute(process.execPath, ["--import", "tsx", "scripts/check-operations.ts"], { env, timeout: 30000 }); expect(payloads).toHaveLength(count);
    expect(payloads.join("\n")).not.toMatch(/example.test|password|token|postgresql|\/sink/);
    // A wrong, closed database port exercises the monitor's independent fallback.
    const database = new URL(process.env.DATABASE_URL!); database.port = "1";
    await expect(execute(process.execPath, ["--import", "tsx", "scripts/check-operations.ts"], { env: { ...env, DATABASE_URL: database.href }, timeout: 30000 })).rejects.toMatchObject({ code: 1 });
    expect(payloads.map(body => JSON.parse(body).check)).toContain("monitor");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); await f.cleanup(); }
}, 60000);


it.skipIf(!local)("the independent monitor works with column-level grants and cannot read customer data or forge a staff audit actor", async () => {
  const f = await createOperationsFixture(), directory = await mkdtemp(join(tmpdir(), "jitm-monitor-role-"));
  const role = `jitm_monitor_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: process.env.DATABASE_URL }); await admin.connect();
  let restricted: Client | undefined;
  try {
    await admin.query(`CREATE ROLE "${role}" LOGIN`);
    const sql = (await readFile("infra/operations/monitor-grants.sql", "utf8")).replaceAll(':"monitor_role"', `"${role}"`).replaceAll(':"app_schema"', '"public"');
    await admin.query(sql);
    const url = new URL(process.env.DATABASE_URL!); url.username = role; url.password = "";
    restricted = new Client({ connectionString: url.href }); await restricted.connect();
    for (const sql of ['SELECT email FROM "User"', 'SELECT "messageCiphertext" FROM "WaitlistDelivery"', 'SELECT body FROM \"SupportTicketMessage\"', 'SELECT \"messageCiphertext\" FROM \"SupportEmailDelivery\"', 'SELECT payload FROM "Job"', 'SELECT key FROM "AuthRateLimit"']) await expect(restricted.query(sql)).rejects.toMatchObject({ code: "42501" });
    await expect(restricted.query(`INSERT INTO "PlatformAuditEvent" (id,"actorUserId",action,"entityType") VALUES ('forbidden-actor', $1,'ops.forged','OperationsCheck')`, [f.user.id])).rejects.toMatchObject({ code: "42501" });
    const metadataClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }), log: [] });
    try { await collectOperationsSignals({ webReady: null, backupAgeHours: null, restoreAgeDays: null, notificationsConfigured: false }, new Date(), metadataClient); }
    finally { await metadataClient.$disconnect(); }
    const result = await execute(process.execPath, ["--import", "tsx", "scripts/check-operations.ts"], { env: { ...process.env, DATABASE_URL: url.href, APP_URL: "", OPS_ALERT_WEBHOOK_URL: "", OPS_MONITOR_STATE_FILE: join(directory, "state.json"), OPS_DATABASE_LIMIT_BYTES: "1000000000000", OPS_BACKUP_RECEIPT_FILE: "", OPS_RESTORE_RECEIPT_FILE: "" }, timeout: 30000 });
    expect(result.stdout).toContain('"status":"observed"'); expect(await prisma.operationsCheck.count()).toBe(11);
  } finally {
    await restricted?.end(); await admin.query(`DROP OWNED BY "${role}"`); await admin.query(`DROP ROLE "${role}"`); await admin.end(); await rm(directory, { recursive: true, force: true }); await f.cleanup();
  }
}, 45000);
