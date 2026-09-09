import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, connect } from "node:net";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beginRecoveryHold } from "../scripts/lib/recovery-hold.mjs";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local || process.env.RUN_RECOVERY_WEB_TESTS !== "true").sequential("packaged web recovery boundary", () => {
  const database = `jitm_design_webhold_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const token = randomBytes(32).toString("base64url"), magic = randomBytes(32).toString("base64url");
  let admin, sql, source, proxy, child, origin, output = "", offline = false;
  const sockets = new Set();
  beforeAll(async () => {
    source = new URL(process.env.DATABASE_URL); source.pathname = "/postgres"; source.search = "";
    admin = new Client({ connectionString: source.href }); await admin.connect(); await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    source.pathname = `/${database}`;
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: source.href }, timeout: 45_000 });
    sql = new Client({ connectionString: source.href }); await sql.connect(); await sql.query("SET TIME ZONE 'UTC'");
    await sql.query(`INSERT INTO "User" (id,email,name,"emailVerifiedAt","updatedAt") VALUES ('restore-user','restore@example.test','PRIVATE_RESTORED_OWNER',now(),now());
      INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ('restore-workspace','PRIVATE_RESTORED_WORKSPACE','restore-workspace','restore-user',now());
      INSERT INTO "WorkspaceMember" (id,"workspaceId","userId",role) VALUES ('restore-member','restore-workspace','restore-user','OWNER');
      INSERT INTO "WorkspaceProfile" ("workspaceId","onboardingDone","onboardingStep","updatedAt") VALUES ('restore-workspace',true,5,now());
      INSERT INTO "Contact" (id,"workspaceId","displayName","updatedAt") VALUES ('restore-contact','restore-workspace','PRIVATE_RESTORED_CONTACT',now());`);
    await sql.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt") VALUES (\'restore-session\',\'restore-user\',$1,now()+interval \'1 hour\')', [createHash("sha256").update(token).digest("hex")]);
    await sql.query('INSERT INTO "VerificationToken" (id,email,"tokenHash",purpose,"expiresAt") VALUES (\'restore-magic\',\'restore@example.test\',$1,\'magic_login\',now()+interval \'1 hour\')', [createHash("sha256").update(magic).digest("hex")]);
    proxy = createServer(incoming => {
      if (offline) { incoming.destroy(); return; }
      const upstream = connect({ host: source.hostname, port: Number(source.port) });
      for (const socket of [incoming, upstream]) {
        sockets.add(socket); socket.on("error", () => { incoming.destroy(); upstream.destroy(); });
        socket.on("close", () => { sockets.delete(socket); incoming.destroy(); upstream.destroy(); });
      }
      incoming.pipe(upstream); upstream.pipe(incoming);
    });
    await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
    const portProbe = createServer(); await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
    const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve)); origin = `http://127.0.0.1:${port}`;
    const viaProxy = new URL(source); viaProxy.port = String(proxy.address().port);
    child = spawn(process.execPath, [".next/standalone/server.js"], { env: {
      ...process.env, DATABASE_URL: viaProxy.href, NODE_ENV: "production", APP_URL: origin, HOSTNAME: "127.0.0.1", PORT: String(port), PILOT_MODE: "true", DEMO_MODE: "false", PRIVATE_TEST_MODE: "false",
      AUTH_COOKIE_NAME: "jitm_recovery_session", AUTH_REQUIRE_ADMIN_MFA: "true", DATA_ENCRYPTION_KEY: "recovery-test-key-".repeat(3), AUTH_RATE_LIMIT_SECRET: "recovery-rate-key-".repeat(3),
      RESEND_API_KEY: "", EMAIL_FROM: "", RESEND_RECOVERY_API_KEY: "", OPS_ALERT_WEBHOOK_URL: "", NETLIFY_WORKER_SECRET: "", WORKER_DISPATCH_MODE: "off", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", WEB_PUSH_VAPID_PRIVATE_KEY: "", WEB_PUSH_VAPID_PUBLIC_KEY: ""
    }, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + String(chunk)).slice(-6000); });
    await until(async () => { try { return (await fetch(`${origin}/api/health/live`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } });
  }, 60_000);
  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once("exit", resolve)); child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 4000); await stopped; clearTimeout(timer);
    }
    for (const socket of sockets) socket.destroy(); if (proxy) await new Promise(resolve => proxy.close(resolve));
    await sql?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); await admin.end(); }
  }, 15_000);
  async function until(predicate, timeout = 15_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Packaged recovery verification timed out: ${output.slice(-1500)}`);
  }
  const request = (path, options = {}) => fetch(`${origin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(7000), ...options, headers: { cookie: `jitm_recovery_session=${token}`, origin, ...options.headers } });
  it("blocks restored pages, tokens and mutations immediately and survives a real connection outage", async () => {
    const open = await request("/contacts"); expect(open.status).toBe(200); expect(await open.text()).toContain("PRIVATE_RESTORED_CONTACT");
    const held = await beginRecoveryHold(source.href, { archiveSha256: "a".repeat(64), sourceHash: "b".repeat(64) });
    for (const path of ["/", "/contacts", "/contacts/restore-contact.png", "/account/tickets", "/api/contacts/import", `/api/auth/magic?token=${magic}`, "/login"]) {
      const response = await request(path); expect(response.status, path).toBe(503); expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await response.text(); expect(body).not.toContain("PRIVATE_RESTORED"); expect(body).not.toContain(held.id);
    }
    expect((await request("/register", { method: "POST", headers: { "next-action": "old-action" }, body: "old-form" })).status).toBe(503);
    expect((await request("/api/webhooks/resend", { method: "POST", body: "{}" })).status).toBe(503);
    expect((await request("/api/health/live")).status).toBe(200);
    const health = await request("/api/health/ready"); expect(health.status).toBe(503); expect((await health.json()).checks.database).toBe("recovery-held");
    expect((await sql.query('SELECT count(*)::int AS count FROM "Session"')).rows[0].count).toBe(1);
    expect((await sql.query('SELECT "usedAt" FROM "VerificationToken" WHERE id=\'restore-magic\'')).rows[0].usedAt).toBeNull();
    // Only a disposable guard fixture is released here. This is not a production
    // reconciliation or release procedure; no restored customer database opens.
    await sql.query(`ALTER DATABASE "${database}" RESET jitm.recovery_hold`);
    const resumed = await request("/contacts"); expect(resumed.status).toBe(200); expect(await resumed.text()).toContain("PRIVATE_RESTORED_CONTACT");
    offline = true; for (const socket of sockets) socket.destroy();
    const stopped = await request("/contacts"); expect(stopped.status).toBe(503); expect(await stopped.text()).not.toContain("PRIVATE_RESTORED");
    offline = false;
    await until(async () => (await request("/contacts")).status === 200);
  }, 40_000);
});
