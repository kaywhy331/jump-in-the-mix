import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { ImportCommitItem } from "../src/lib/contact-import-service";

// Release C-1 (C8): contact imports commit under a per-workspace key, (814734, hashtext(workspaceId)),
// instead of the global access lock (814733, 1). Suspension, account deletion and cancelling take
// that key after the access lock. The choreography below relies on PostgreSQL granting a released
// advisory lock to its waiters in the order they queued.
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: (key: string) => cookieJar.has(key) ? { value: cookieJar.get(key) } : undefined, set: (key: string, value: string) => cookieJar.set(key, value), delete: (key: string) => cookieJar.delete(key) }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Import lock test" }) }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, requireAdminMfa: false } };
});

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("per-workspace import locks on PostgreSQL", () => {
  const database = `jitm_design_locks_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const password = "Local import lock test 25!";
  const sessions: Client[] = [];
  let admin: Client, sql: Client, db: PrismaClient, url: URL, passwordHash: string;
  let jobs: typeof import("../src/lib/contact-import-jobs");
  let service: typeof import("../src/lib/contact-import-service");
  let users: typeof import("../src/lib/user-admin");
  let deletion: typeof import("../src/lib/account-deletion");
  let auth: typeof import("../src/lib/auth");
  let locks: typeof import("../src/lib/access-lock");
  beforeAll(async () => {
    url = new URL(process.env.DATABASE_URL!); url.pathname = "/postgres"; url.search = "";
    admin = new Client({ connectionString: url.href }); await admin.connect();
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`); url.pathname = `/${database}`;
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.href }, timeout: 45_000 });
    sql = new Client({ connectionString: url.href }); await sql.connect();
    vi.stubEnv("DATABASE_URL", url.href);
    db = (await import("../src/lib/prisma")).prisma;
    jobs = await import("../src/lib/contact-import-jobs"); service = await import("../src/lib/contact-import-service");
    users = await import("../src/lib/user-admin"); deletion = await import("../src/lib/account-deletion");
    auth = await import("../src/lib/auth"); locks = await import("../src/lib/access-lock");
    passwordHash = await bcrypt.hash(password, 4);
  }, 60_000);
  afterEach(async () => {
    // Ending a session rolls back its transaction and frees whatever it held or queued for.
    await Promise.all(sessions.splice(0).map(client => client.end().catch(() => undefined)));
    cookieJar.clear();
  });
  afterAll(async () => {
    await db?.$disconnect(); await sql?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); await admin.end(); }
    vi.unstubAllEnvs();
  });

  function item(rowId: string): ImportCommitItem {
    return { record: { rowId, sourceRow: 2, source: "CSV", displayName: rowId, firstName: null, lastName: null, company: null, publicNotes: null, emails: [], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId, action: "CREATE", targetContactId: null } };
  }
  async function owner() {
    const id = randomUUID();
    const user = await db.user.create({ data: { email: `${id}@example.test`, name: "Import owner", passwordHash, emailVerifiedAt: new Date() } });
    const workspace = await db.workspace.create({ data: { name: "Import locks", slug: id, ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } }, profile: { create: {} } } });
    return { user, workspace, commit: (rows: string[]) => service.commitContactImportBatch({ workspaceId: workspace.id, actorUserId: user.id, timezone: "UTC", importId: `direct_${randomUUID()}`, items: rows.map(item) }) };
  }
  async function running(f: Awaited<ReturnType<typeof owner>>, rows = ["row-first", "row-second"]) {
    const batch = await jobs.queueContactImportBatch({ workspaceId: f.workspace.id, actorUserId: f.user.id, importId: `batch_${randomUUID()}`, items: rows.map(item) });
    const job = await db.job.findFirstOrThrow({ where: { workspaceId: f.workspace.id, task: "contact-import", payload: { path: ["batchId"], equals: batch.id } } });
    const lease = { jobId: job.id, leaseId: `locks:${randomUUID()}` };
    await db.job.update({ where: { id: job.id }, data: { lockedBy: lease.leaseId, lockedAt: new Date(), attempts: 1 } });
    return { batch, lease };
  }
  async function session() {
    const client = new Client({ connectionString: url.href }); await client.connect(); sessions.push(client);
    await client.query("BEGIN");
    return client;
  }
  /** Another session that takes, or queues for, a workspace's import key inside a transaction. */
  async function holder(workspaceId: string) {
    const client = await session();
    const acquired = client.query("SELECT pg_advisory_xact_lock(814734, hashtext($1))", [workspaceId]);
    acquired.catch(() => undefined); // a failed test ends the session while it still queues
    return { acquired, release: async () => { await acquired; await client.query("COMMIT"); } };
  }
  async function waiters(workspaceId: string): Promise<number> {
    return (await sql.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=814734 AND objid=hashtext($1)::oid AND NOT granted", [workspaceId])).rows[0].n;
  }
  async function until(predicate: () => Promise<boolean>, timeout = 6000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
    throw new Error("PostgreSQL lock choreography timed out");
  }
  /** A background import whose opening transaction has run and whose first row is queued behind `relay`. */
  async function midChunk(f: Awaited<ReturnType<typeof owner>>) {
    const { batch, lease } = await running(f);
    const gate = await holder(f.workspace.id); await gate.acquired;
    const run = jobs.runContactImportBatch(batch.id, lease).then(() => null, (error: unknown) => error);
    await until(async () => await waiters(f.workspace.id) === 1);
    const relay = await holder(f.workspace.id);
    await until(async () => await waiters(f.workspace.id) === 2);
    await gate.release(); await relay.acquired;
    await until(async () => await waiters(f.workspace.id) === 1);
    return { batch, run, relay };
  }

  it("runs a whole import, queued or direct, while another session holds the access lock", async () => {
    const f = await owner();
    const { batch, lease } = await running(f);
    const access = await session();
    await access.query("SELECT pg_advisory_xact_lock(814733, 1)");
    await jobs.runContactImportBatch(batch.id, lease);
    expect(await f.commit(["row-direct"])).toMatchObject([{ status: "CREATED" }]);
    await access.query("COMMIT");
    expect(await jobs.getContactImportBatch(f.workspace.id, batch.id)).toMatchObject({ status: "COMPLETED", processedRows: 2, createdCount: 2 });
    expect(await db.contact.count({ where: { workspaceId: f.workspace.id } })).toBe(3);
  }, 20_000);

  it("overlaps two workspaces' imports and lets a sign-in through while a row is in progress", async () => {
    const a = await owner(), b = await owner();
    const { batch, lease } = await running(b);
    // Hold workspace A's row so that A's import row stops at its first insert, holding A's key.
    const stall = await session();
    await stall.query('SELECT id FROM "Workspace" WHERE id=$1 FOR UPDATE', [a.workspace.id]);
    const first = a.commit(["a-first"]);
    await until(async () => {
      const rows = (await sql.query("SELECT a.wait_event_type FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND l.classid=814734 AND l.objid=hashtext($1)::oid AND l.granted", [a.workspace.id])).rows;
      return rows.length === 1 && rows[0].wait_event_type === "Lock";
    });
    expect(await b.commit(["b-direct"])).toMatchObject([{ status: "CREATED" }]);
    await jobs.runContactImportBatch(batch.id, lease);
    expect(await auth.createSession(b.user.id)).toEqual(expect.any(String));
    // Rows of one workspace still commit one at a time.
    const second = a.commit(["a-second"]);
    await until(async () => await waiters(a.workspace.id) === 1);
    expect(await db.contact.count({ where: { workspaceId: a.workspace.id } })).toBe(0);
    await stall.query("COMMIT");
    expect(await first).toMatchObject([{ status: "CREATED" }]); expect(await second).toMatchObject([{ status: "CREATED" }]);
    expect(await db.contact.count({ where: { workspaceId: a.workspace.id } })).toBe(2);
    expect(await jobs.getContactImportBatch(b.workspace.id, batch.id)).toMatchObject({ status: "COMPLETED", createdCount: 2 });
    expect(await db.contact.count({ where: { workspaceId: b.workspace.id } })).toBe(3);
  }, 20_000);

  it("suspends after the row in progress and stops the next row", async () => {
    const a = await owner();
    const staffId = randomUUID();
    const staff = await db.user.create({ data: { email: `staff-${staffId}@example.test`, name: "Operator", passwordHash, emailVerifiedAt: new Date(), staffMembership: { create: { role: "OPERATOR" } } } });
    const staffSession = await db.session.create({ data: { userId: staff.id, tokenHash: createHash("sha256").update(staffId).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    const gate = await holder(a.workspace.id); await gate.acquired;
    const rows = a.commit(["before-suspension", "after-suspension"]);
    await until(async () => await waiters(a.workspace.id) === 1);
    const suspension = users.manageUserAccess({ actorUserId: staff.id, actorSessionId: staffSession.id, targetUserId: a.user.id, expectedRevision: 0, operation: "suspend", reason: "Investigating an account during an import", password });
    // The suspension holds the access lock and queues on the workspace key behind the first row.
    await until(async () => await waiters(a.workspace.id) === 2);
    expect((await db.user.findUniqueOrThrow({ where: { id: a.user.id } })).suspendedAt).toBeNull();
    await gate.release();
    expect(await suspension).toMatchObject({ revision: 1 });
    expect(await rows).toMatchObject([{ rowId: "before-suspension", status: "CREATED" }, { rowId: "after-suspension", status: "FAILED", message: "This account cannot import contacts right now." }]);
    expect(await db.contact.count({ where: { workspaceId: a.workspace.id } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: a.user.id } })).suspendedAt).not.toBeNull();
  }, 20_000);

  it("deletes an account after the running row commits and ends the import without a deadlock", async () => {
    const a = await owner();
    const { run, relay } = await midChunk(a);
    const deleted = deletion.deleteAccountData(a.user.id, `locks-${randomUUID()}`);
    await until(async () => await waiters(a.workspace.id) === 2);
    expect(await db.user.count({ where: { id: a.user.id } })).toBe(1);
    await relay.release();
    expect(await deleted).toMatchObject({ deleted: true });
    const stopped = await run;
    expect(stopped).toBeInstanceOf(Error); expect((stopped as Error).message).toContain("no longer owns");
    expect(await db.workspace.count({ where: { id: a.workspace.id } })).toBe(0);
    expect(await db.contact.count({ where: { workspaceId: a.workspace.id } })).toBe(0);
    expect(await db.job.count({ where: { workspaceId: a.workspace.id } })).toBe(0);
  }, 20_000);

  it("cancels after the running row commits, keeps that row and stops the chunk", async () => {
    const a = await owner();
    const { batch, run, relay } = await midChunk(a);
    const canceled = jobs.cancelContactImportBatch(a.workspace.id, batch.id);
    await until(async () => await waiters(a.workspace.id) === 2);
    await relay.release();
    expect(await canceled).toBe(true);
    const stopped = await run;
    expect(stopped).toBeInstanceOf(Error); expect((stopped as Error).message).toContain("no longer owns");
    const saved = await jobs.getContactImportBatch(a.workspace.id, batch.id);
    expect(saved).toMatchObject({ status: "CANCELED", processedRows: 1, createdCount: 1 });
    expect(saved?.results.map(row => row.rowId)).toEqual(["row-first"]);
    expect(await db.contact.findMany({ where: { workspaceId: a.workspace.id }, select: { displayName: true } })).toEqual([{ displayName: "row-first" }]);
  }, 20_000);

  it("takes several workspaces' keys in key order", async () => {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const ordered: Array<{ id: string; objid: string }> = (await sql.query("SELECT id, hashtext(id)::oid::text AS objid FROM unnest($1::text[]) AS id ORDER BY hashtext(id)", [ids])).rows;
    const gate = await holder(ordered[2].id); await gate.acquired;
    const locking = db.$transaction(tx => locks.lockWorkspaceImports(tx, [...ids].reverse().concat(ids[0])), { timeout: 10_000 });
    await until(async () => await waiters(ordered[2].id) === 1);
    const held = (await sql.query(`SELECT objid::text AS objid FROM pg_locks WHERE locktype='advisory' AND classid=814734 AND granted
      AND pid=(SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=814734 AND objid=hashtext($1)::oid AND NOT granted)`, [ordered[2].id])).rows;
    expect(held.map(row => row.objid).sort()).toEqual([ordered[0].objid, ordered[1].objid].sort());
    await gate.release();
    await locking;
  }, 20_000);
});
