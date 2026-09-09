import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, open, readFile, writeFile, unlink, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { Client } from "pg";

const integer = (name, fallback, min, max) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
};
async function main() {
  const source = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(source.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(source.hostname) || !/^\/jitm_design_[a-zA-Z0-9_]+$/.test(source.pathname)) throw new Error("Use an explicitly named loopback jitm_design_ database. Only its server connection is used; fixtures go into a new database.");
  const profile = { accounts: integer("LOAD_FIXTURE_ACCOUNTS", 5, 2, 10), contactsPerAccount: integer("LOAD_FIXTURE_CONTACTS", 1000, 100, 5000), historyPerContact: integer("LOAD_FIXTURE_HISTORY", 24, 1, 100), mixesPerAccount: integer("LOAD_FIXTURE_MIXES", 30, 2, 100), beatsPerMix: 6 };
  if (profile.accounts * profile.contactsPerAccount * (profile.historyPerContact + 1) > 600_000) throw new Error("Keep the fixture at or below 600,000 follow-ups per rehearsal.");
  const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
  const artifact = await mkdtemp(join(tmpdir(), "jitm-customer-load-"));
  const log = await open(join(artifact, "runtime.log"), "w", 0o600);
  const accountsPath = join(artifact, "accounts.json");
  const database = `jitm_design_load_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  source.pathname = "/postgres"; source.search = "";
  const admin = new Client({ connectionString: source.href });
  let db, web, exited, created = false, canceled = false;
  const children = new Set();
  const checkCanceled = () => { if (canceled) throw new Error("Customer load rehearsal canceled."); };
  const command = (args, env) => new Promise((resolveCommand, reject) => {
    checkCanceled();
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", log.fd, log.fd] }); children.add(child);
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.once("error", reject); child.once("close", code => { children.delete(child); clearTimeout(timeout); code === 0 && !canceled ? resolveCommand() : reject(new Error("Fixture command failed or was canceled; inspect the private runtime log.")); });
  });
  const stop = async () => {
    if (!web || web.exitCode !== null || web.signalCode !== null) return;
    web.kill("SIGTERM"); const timer = setTimeout(() => web.kill("SIGKILL"), 10_000);
    try { await exited; } finally { clearTimeout(timer); }
  };
  const cancel = () => { canceled = true; for (const child of children) child.kill("SIGTERM"); void stop(); };
  process.once("SIGTERM", cancel); process.once("SIGINT", cancel);
  try {
    checkCanceled(); await admin.connect(); await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`); created = true;
    source.pathname = `/${database}`;
    const reservation = createServer(); await new Promise((resolvePort, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolvePort); });
    const port = reservation.address().port; await new Promise(resolvePort => reservation.close(resolvePort));
    const origin = `http://127.0.0.1:${port}`;
    const env = { ...process.env, DATABASE_URL: source.href, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port), APP_URL: origin, AUTH_COOKIE_NAME: "jitm_load_session", PILOT_MODE: "true", PRIVATE_TEST_MODE: "false", DEMO_MODE: "false", AUTH_REQUIRE_EMAIL_VERIFICATION: "false", AUTH_REQUIRE_ADMIN_MFA: "true", AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"), DATA_ENCRYPTION_KEY: randomBytes(32).toString("hex"), RESEND_API_KEY: "", RESEND_RECOVERY_API_KEY: "", RESEND_WEBHOOK_SECRET: "", EMAIL_FROM: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "", WEB_PUSH_VAPID_PRIVATE_KEY: "", WEB_PUSH_VAPID_PUBLIC_KEY: "", OPS_ALERT_WEBHOOK_URL: "", NETLIFY_WORKER_SECRET: "", WORKER_DISPATCH_MODE: "", LOAD_SMOKE_URL: origin, LOAD_SMOKE_MODE: "customer", LOAD_SMOKE_ACCOUNTS_FILE: accountsPath };
    await command(["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
    db = new Client({ connectionString: source.href }); await db.connect();
    await db.query("SET TIME ZONE 'UTC'");
    const accounts = [];
    for (let account = 0; account < profile.accounts; account++) {
      checkCanceled();
      const marker = `LOAD_${database.slice(-10)}_${String(account).padStart(2, "0")}`;
      const token = randomBytes(32).toString("base64url");
      accounts.push({ marker, cookie: `jitm_load_session=${token}` });
      await db.query('INSERT INTO "User" (id,email,name,"emailVerifiedAt","updatedAt") VALUES ($1,$2,$1,now(),now())', [marker, `${marker.toLowerCase()}@example.test`]);
      await db.query('INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ($1,$1,$1,$1,now())', [marker]);
      await db.query('INSERT INTO "WorkspaceMember" (id,"workspaceId","userId",role) VALUES ($1,$1,$1,\'OWNER\')', [marker]);
      await db.query('INSERT INTO "WorkspaceProfile" ("workspaceId","onboardingDone","onboardingStep","updatedAt") VALUES ($1,true,5,now())', [marker]);
      await db.query('INSERT INTO "UserPreference" (id,"userId",timezone,"updatedAt") VALUES ($1,$1,\'UTC\',now())', [marker]);
      await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt") VALUES ($1,$1,$2,now()+interval \'1 hour\')', [marker, createHash("sha256").update(token).digest("hex")]);
      await db.query(`INSERT INTO "Contact" (id,"workspaceId","displayName",company,"publicNotes","updatedAt") SELECT $1||'_c_'||n,$1,'Load contact '||lpad(n::text,5,'0'),'Synthetic company '||(n%20),'Synthetic relationship note for a performance rehearsal. '||repeat('Discussed a future follow-up. ',8),now() FROM generate_series(1,$2::int) n`, [marker, profile.contactsPerAccount]);
      await db.query(`INSERT INTO "ContactEmail" (id,"contactId",email,normalized,"isPrimary") SELECT id,id,lower(id)||'@example.test',lower(id)||'@example.test',true FROM "Contact" WHERE "workspaceId"=$1`, [marker]);
      await db.query(`INSERT INTO "Group" (id,"workspaceId",name,"updatedAt") SELECT $1||'_g_'||n,$1,'Load tag '||n,now() FROM generate_series(1,8) n`, [marker]);
      await db.query(`INSERT INTO "ContactGroupMembership" (id,"contactId","groupId") SELECT $1||'_g_c_'||n,$1||'_c_'||n,$1||'_g_'||(1+n%8) FROM generate_series(1,$2::int) n`, [marker, profile.contactsPerAccount]);
      await db.query(`INSERT INTO "Mix" (id,"workspaceId",name,"triggerMode",status,"updatedAt") SELECT $1||'_m_'||n,$1,'Load mix '||lpad(n::text,3,'0'),'MANUAL_START',CASE WHEN n%3=0 THEN 'DRAFT'::"MixStatus" ELSE 'ACTIVE'::"MixStatus" END,now() FROM generate_series(1,$2::int) n`, [marker, profile.mixesPerAccount]);
      await db.query(`INSERT INTO "StepTemplate" (id,"workspaceId",name,channel,"updatedAt") SELECT $1||'_t_'||n,$1,'Load beat '||n,'EMAIL',now() FROM generate_series(1,6) n`, [marker]);
      await db.query(`INSERT INTO "StepVersion" (id,"stepTemplateId",version,subject,body) SELECT id,id,1,'Following up',repeat('This is a synthetic message for the local rehearsal. ',6) FROM "StepTemplate" WHERE "workspaceId"=$1`, [marker]);
      await db.query(`INSERT INTO "MixStep" (id,"mixId","stepVersionId","dayOffset","sortOrder","updatedAt") SELECT m.id||'_s_'||n,m.id,$1||'_t_'||n,n*7,n,now() FROM "Mix" m CROSS JOIN generate_series(1,6) n WHERE m."workspaceId"=$1`, [marker]);
      await db.query(`INSERT INTO "MixAssignment" (id,"assignmentKey","workspaceId","mixId","contactId","startDate","updatedAt") SELECT $1||'_a_'||n,$1||'_a_'||n,$1,$1||'_m_'||(1+n%$3::int),$1||'_c_'||n,now()-interval '180 days',now() FROM generate_series(1,$2::int) n`, [marker, profile.contactsPerAccount, profile.mixesPerAccount]);
      await db.query(`INSERT INTO "Jump" (id,"workspaceId","contactId","mixId","mixStepId","stepVersionId","scheduledAt",status,reason,"templateSnapshot","renderedSnapshot","completedAt","uniquenessKey","updatedAt") SELECT $1||'_j_'||c||'_'||h,$1,$1||'_c_'||c,$1||'_m_'||(1+c%$4::int),$1||'_m_'||(1+c%$4::int)||'_s_'||(1+h%6),$1||'_t_'||(1+h%6),now()+((CASE WHEN h=0 THEN c%10-3 ELSE -h*7 END)||' days')::interval,CASE WHEN h=0 THEN 'PENDING'::"JumpStatus" WHEN h%7=0 THEN 'SKIPPED'::"JumpStatus" ELSE 'DONE'::"JumpStatus" END,'Synthetic load rehearsal',jsonb_build_object('subject','Following up','body',repeat('Synthetic follow-up content. ',10)),jsonb_build_object('subject','Following up','body',repeat('Synthetic follow-up content. ',10)),CASE WHEN h=0 THEN NULL ELSE now()-(h*7||' days')::interval END,$1||'_j_'||c||'_'||h,now() FROM generate_series(1,$2::int) c CROSS JOIN generate_series(0,$3::int) h`, [marker, profile.contactsPerAccount, profile.historyPerContact, profile.mixesPerAccount]);
    }
    checkCanceled(); await db.query('ANALYZE');
    await writeFile(accountsPath, JSON.stringify({ origin, accounts }), { mode: 0o600 });
    const webNodeOptions = ["--max-semi-space-size=8"];
    web = spawn(process.execPath, [...webNodeOptions, ".next/standalone/server.js"], { env, stdio: ["ignore", log.fd, log.fd] });
    exited = new Promise(resolveExit => web.once("close", resolveExit));
    web.once("error", error => { void log.write(`Server start failed: ${error.code ?? "unknown"}\n`); });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { const response = await fetch(`${origin}/api/health/ready`, { signal: AbortSignal.timeout(1500) }); ready = response.status === 200 && (await response.json()).status === "ready"; } catch {}
      if (ready || web.exitCode !== null || web.signalCode !== null) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 200));
    }
    checkCanceled();
    if (!ready) throw new Error("The packaged server did not pass readiness; inspect the private runtime log.");
    console.error("Customer load fixtures ready; starting the authenticated probe.");
    const result = await new Promise((resolveProbe, reject) => {
      const probe = spawn(process.execPath, ["scripts/load-smoke.mjs"], { env, stdio: ["ignore", "pipe", log.fd] });
      children.add(probe);
      let output = '';
      probe.stdout.on('data', chunk => { output += chunk; });
      probe.once('error', reject); probe.once('close', code => { children.delete(probe); try { checkCanceled(); resolveProbe({ code, report: JSON.parse(output) }); } catch { reject(new Error('The load probe failed or was canceled; inspect the private runtime log.')); } });
    });
    const bytes = Number((await db.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
    let peakRssKiB = null;
    try { peakRssKiB = Number((await readFile(`/proc/${web.pid}/status`, 'utf8')).match(/^VmHWM:\s+(\d+)/m)?.[1]) || null; } catch {}
    const evidence = { buildId, profile, fixtureDatabaseBytes: bytes, serverPeakRssKiB: peakRssKiB, webNodeOptions, node: process.version, ...result.report };
    await writeFile(join(artifact, 'report.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
    if (process.env.LOAD_FIXTURE_REPORT_FILE) await copyFile(join(artifact, 'report.json'), resolve(process.env.LOAD_FIXTURE_REPORT_FILE));
    console.log(JSON.stringify({ report: join(artifact, 'report.json'), profile, fixtureDatabaseBytes: bytes, serverPeakRssKiB: peakRssKiB, passed: evidence.passed, routes: Object.fromEntries(Object.entries(evidence.routes).map(([name, data]) => [name, { completed: data.completed, failed: data.failed, p95Ms: data.latencyMs.p95, bytesP95: data.responseBytes.p95 }])) }, null, 2));
    if (result.code !== 0) process.exitCode = 1;
  } finally {
    await stop();
    await unlink(accountsPath).catch(() => {});
    await db?.end();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end(); await log.close();
    process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel);
    console.log(`Owned load fixtures removed. Private evidence: ${artifact}`);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Customer load rehearsal failed.'); process.exitCode = 1; });
