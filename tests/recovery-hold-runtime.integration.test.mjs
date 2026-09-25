import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, connect } from "node:net";
import { Client } from "pg";
import { createServer as httpsServer, request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beginRecoveryHold } from "../scripts/lib/recovery-hold.mjs";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local || process.env.RUN_RECOVERY_WEB_TESTS !== "true").sequential.each([false, true])("packaged HTTPS recovery boundary (private site: %s)", privateSite => {
  const database = `jitm_design_webhold_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const token = randomBytes(32).toString("base64url"), magic = randomBytes(32).toString("base64url"), signInMagic = randomBytes(32).toString("base64url");
  let admin, sql, source, proxy, child, origin, termination, certDir, ca, output = "", offline = false, stalled = false;
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
    await sql.query('INSERT INTO "VerificationToken" (id,email,"tokenHash",purpose,"expiresAt") VALUES (\'restore-magic-signin\',\'restore@example.test\',$1,\'magic_login\',now()+interval \'1 hour\')', [createHash("sha256").update(signInMagic).digest("hex")]);
    await sql.query('UPDATE "User" SET "passwordHash"=$1 WHERE id=\'restore-user\'', [await bcrypt.hash("RecoveryFixture123!", 10)]);
    proxy = createServer(incoming => {
      if (stalled) { sockets.add(incoming); incoming.on("error", () => {}); incoming.on("close", () => sockets.delete(incoming)); return; }
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
    const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
    certDir = await mkdtemp(`${tmpdir()}/jitm-recovery-tls-`);
    await promisify(execFile)("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${certDir}/key.pem`, "-out", `${certDir}/cert.pem`, "-days", "1", "-subj", "/CN=recovery.example.test", "-addext", "subjectAltName=DNS:recovery.example.test"]);
    ca = await readFile(`${certDir}/cert.pem`);
    termination = httpsServer({ key: await readFile(`${certDir}/key.pem`), cert: ca }, (req, res) => {
      const upstream = httpRequest({ hostname: "127.0.0.1", port, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    await new Promise(resolve => termination.listen(0, "127.0.0.1", resolve));
    origin = `https://recovery.example.test:${termination.address().port}`;
    const viaProxy = new URL(source); viaProxy.port = String(proxy.address().port);
    child = spawn(process.execPath, [".next/standalone/server.js"], { env: {
      ...process.env, DATABASE_URL: viaProxy.href, NODE_ENV: "production", APP_URL: origin, HOSTNAME: "0.0.0.0", RECOVERY_BOUNDARY_PATH: "", PORT: String(port), PILOT_MODE: "false", DEMO_MODE: "false", PRIVATE_TEST_MODE: String(privateSite), PRIVATE_TEST_USERNAME: "fixture", PRIVATE_TEST_PASSWORD: "fixture-private-secret-".repeat(3), PRIVATE_TEST_EXPIRES_AT: "",
      AUTH_COOKIE_NAME: "jitm_recovery_session", AUTH_REQUIRE_ADMIN_MFA: "true", DATA_ENCRYPTION_KEY: "recovery-test-key-".repeat(3), AUTH_RATE_LIMIT_SECRET: "recovery-rate-key-".repeat(3),
      RESEND_API_KEY: "local-fixture-disabled", EMAIL_FROM: "fixture@example.test", RESEND_WEBHOOK_SECRET: "local-fixture-disabled", AUTH_REQUIRE_EMAIL_VERIFICATION: "true", PUBLIC_OPERATOR_NAME: "Synthetic fixture", PUBLIC_SUPPORT_EMAIL: "support@example.test", PUBLIC_BACKUP_RETENTION_NOTICE: "Local disposable fixture with no retained backups.", RESEND_RECOVERY_API_KEY: "", OPS_ALERT_WEBHOOK_URL: "", NETLIFY_WORKER_SECRET: "", WORKER_DISPATCH_MODE: "off", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", WEB_PUSH_VAPID_PRIVATE_KEY: "", WEB_PUSH_VAPID_PUBLIC_KEY: ""
    }, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + String(chunk)).slice(-6000); });
    await until(async () => { try { return (await request("/api/health/live")).ok; } catch { return false; } });
  }, 60_000);
  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once("exit", resolve)); child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 4000); await stopped; clearTimeout(timer);
    }
    if (termination) await new Promise(resolve => termination.close(resolve));
    if (certDir) await rm(certDir, { recursive: true, force: true });
    for (const socket of sockets) socket.destroy(); if (proxy) await new Promise(resolve => proxy.close(resolve));
    await sql?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); await admin.end(); }
  }, 15_000);
  async function until(predicate, timeout = 15_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Packaged recovery verification timed out: ${output.slice(-1500)}`);
  }
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const req = httpsRequest(`${origin}${path}`, { ca, lookup: (_host, _options, callback) => callback(null, [{ address: "127.0.0.1", family: 4 }]), ...options, headers: { ...(privateSite ? { authorization: `Basic ${Buffer.from(`fixture:${"fixture-private-secret-".repeat(3)}`).toString("base64")}` } : {}), cookie: `jitm_recovery_session=${token}`, origin, ...options.headers } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(name, item);
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers }));
      });
    });
    req.on("error", reject); req.setTimeout(10_000, () => req.destroy(new Error("Request deadline exceeded")));
    req.end(options.body);
  });
  it("blocks restored pages, tokens and mutations immediately and survives a real connection outage", async () => {
    if (privateSite) expect((await request("/login", { headers: { authorization: "" } })).status).toBe(401);
    await sql.query('INSERT INTO "WorkerHeartbeat" (id,"workerId","updatedAt") VALUES (\'fixture-heartbeat\',\'fixture-worker\',now())');
    expect((await request("/api/health/worker")).status).toBe(200);
    const login = await request("/login", { headers: { cookie: "" } });
    expect(login.status).toBe(200);
    expect(await login.text()).toContain("Sign in");
    // The login form is a client-side React action, so a scripted POST cannot reach it any more;
    // a magic link exercises session creation on the packaged server instead.
    const signedIn = await request(`/api/auth/magic?token=${signInMagic}`, { headers: { cookie: "" } });
    expect([302, 303, 307].includes(signedIn.status), `magic sign-in answered ${signedIn.status}`).toBe(true);
    const sessionCookie = signedIn.headers.getSetCookie().find(value => value.startsWith("jitm_recovery_session="))?.split(";")[0];
    expect(sessionCookie, JSON.stringify({ location: signedIn.headers.get("location"), cookieNames: signedIn.headers.getSetCookie().map(c => c.split("=")[0]) })).toBeTruthy();
    const authenticated = await request("/contacts", { headers: { cookie: sessionCookie } });
    expect(authenticated.status).toBe(200); expect(await authenticated.text()).toContain("PRIVATE_RESTORED_CONTACT");
    expect((await request("/api/contacts/import", { headers: { cookie: "" } })).status).toBe(401);
    const imported = await request("/api/contacts/import", { method: "POST", headers: { cookie: sessionCookie, "content-type": "application/json" }, body: JSON.stringify({ mode: "commit", importId: "recovery-fixture", items: [{ record: { rowId: "1", sourceRow: 1, source: "CSV", firstName: "Recovery", lastName: "Workflow", displayName: "Recovery Workflow", company: null, publicNotes: null, emails: [], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId: "1", action: "CREATE", targetContactId: null } }] }) });
    expect(imported.status, await imported.text()).toBe(200);
    expect((await sql.query('SELECT count(*)::int AS count FROM "Contact" WHERE "displayName"=\'Recovery Workflow\'')).rows[0].count).toBe(1);
    expect((await request("/api/contacts/import", { method: "POST", headers: { origin: "https://attacker.test", "content-type": "application/json" }, body: "{}" })).status).toBe(403);
    const open = await request("/contacts"); expect(open.status).toBe(200); expect(await open.text()).toContain("PRIVATE_RESTORED_CONTACT");
    const held = await beginRecoveryHold(source.href, { archiveSha256: "a".repeat(64), sourceHash: "b".repeat(64) });
    // The public homepage stays up during a hold since the homepage program (594a1bb); it must
    // answer without any restored private content and remain uncacheable.
    const home = await request("/"); expect(home.status, "/").toBe(200); expect(await home.text()).not.toContain("PRIVATE_RESTORED");
    for (const path of ["/contacts", "/contacts/restore-contact.png", "/account/tickets", "/api/contacts/import", `/api/auth/magic?token=${magic}`, "/login", "/api/health/worker"]) {
      const response = await request(path); expect(response.status, path).toBe(503); expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await response.text(); expect(body).not.toContain("PRIVATE_RESTORED"); expect(body).not.toContain(held.id);
    }
    expect((await request("/register", { method: "POST", headers: { "next-action": "old-action" }, body: "old-form" })).status).toBe(503);
    expect((await request("/api/webhooks/resend", { method: "POST", body: "{}" })).status).toBe(503);
    expect((await request("/api/health/live")).status).toBe(200);
    const health = await request("/api/health/ready"); expect(health.status).toBe(503); expect((await health.json()).checks.database).toBe("recovery-held");
    expect((await sql.query('SELECT count(*)::int AS count FROM "Session"')).rows[0].count).toBe(2);
    expect((await sql.query('SELECT "usedAt" FROM "VerificationToken" WHERE id=\'restore-magic\'')).rows[0].usedAt).toBeNull();
    // Only a disposable guard fixture is released here. This is not a production
    // reconciliation or release procedure; no restored customer database opens.
    await sql.query(`ALTER DATABASE "${database}" RESET jitm.recovery_hold`);
    const resumed = await request("/contacts"); expect(resumed.status).toBe(200); expect(await resumed.text()).toContain("PRIVATE_RESTORED_CONTACT");
    offline = true; for (const socket of sockets) socket.destroy();
    for (const path of ["/login", "/contacts", "/api/health/worker", "/api/contacts/import"]) {
      const stopped = await request(path, path === "/api/contacts/import" ? { method: "POST", body: "{}" } : {});
      expect(stopped.status, path).toBe(503); expect(await stopped.text()).not.toContain("PRIVATE_RESTORED");
    }
    offline = false;
    stalled = true; for (const socket of sockets) socket.destroy();
    for (const path of ["/login", "/contacts", "/api/health/worker", "/api/contacts/import"]) {
      const started = Date.now();
      const response = await request(path, path === "/api/contacts/import" ? { method: "POST", body: "{}" } : {});
      expect(response.status, path).toBe(503);
      expect(Date.now() - started).toBeLessThan(9000);
    }
    stalled = false; for (const socket of sockets) socket.destroy();
    await until(async () => (await request("/contacts")).status === 200);
  }, 90_000);
});
