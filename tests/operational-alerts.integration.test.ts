import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("@/lib/env", async original => { const mod = await original<typeof import("../src/lib/env")>(); return { ...mod, env: { ...mod.env, requireAdminMfa: true, dataEncryptionKey: "ops-alert-test-key", emailDailyLimit: 90, emailMonthlyLimit: 2700, emailDailyAuthReserve: 20, emailMonthlyAuthReserve: 300 } }; });
import { prisma } from "../src/lib/prisma";
import { acquireOperationsMonitor, saveOperationsObservations, acknowledgeOperationsCheck, deliverOperationsNotices } from "../src/lib/operations-alerts";
import { collectOperationsSignals } from "../src/lib/operations-signals";
import { healthyOperationsObservations, createOperationsFixture } from "./helpers/operations-fixture";
import { type OperationsObservation } from "../src/lib/operations-policy";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("durable independent operations alerts", () => {
  let f: Awaited<ReturnType<typeof createOperationsFixture>>, time: number;
  beforeEach(async () => {
    f = await createOperationsFixture(); time = Date.now();
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "http://127.0.0.1:9876/controlled-test-sink"); vi.stubEnv("OPS_DATABASE_LIMIT_BYTES", "1000000000000");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  });
  afterEach(async () => { await f.cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const problem = (): OperationsObservation[] => healthyOperationsObservations().map(item => item.code === "worker" ? { ...item, state: "CRITICAL", evidence: { ageSeconds: 300, limitSeconds: 90 } } : item);
  async function observe(observations = problem(), advance = 1000) { time += advance; const now = new Date(time), lease = await acquireOperationsMonitor(now); expect(lease).toBeTruthy(); return saveOperationsObservations(lease!, observations, new Date(++time)); }
  async function acknowledge() { const row = await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } }); return acknowledgeOperationsCheck({ ...f.actor, code: row.code, expectedRevision: row.revision, reason: "Investigating the worker process and its supervisor" }); }
  it("collects aggregate real database signals, missing evidence and essential-email capacity", async () => {
    const now = new Date();
    await prisma.workerHeartbeat.create({ data: { workerId: f.user.id, startedAt: now, lastSeenAt: now } });
    await prisma.job.create({ data: { id: `${f.user.id}-failed`, task: "fixture", payload: {}, failedAt: now, lastError: "PRIVATE_CUSTOMER_DETAIL_DO_NOT_LEAK" } });
    await prisma.authRateLimit.create({ data: { key: `${f.user.id}-mfa`, scope: "auth.admin-mfa.verify", blockedUntil: new Date(Date.now() + 600_000) } });
    const invitation = await f.invitation(false);
    await prisma.emailSendAttempt.createMany({ data: Array.from({ length: 56 }, () => ({ messageId: invitation.record.id, category: "INVITATION" as const })) });
    const result = await collectOperationsSignals({ webReady: false, backupAgeHours: null, restoreAgeDays: 40, notificationsConfigured: false }, now);
    const byCode = new Map(result.map(row => [row.code, row]));
    expect(byCode.get("web")?.state).toBe("CRITICAL"); expect(byCode.get("worker")?.state).toBe("OK");
    expect(byCode.get("jobs")?.evidence.failed).toBe(1); expect(byCode.get("invitations")?.evidence.review).toBe(1);
    expect(byCode.get("email")?.state).toBe("WARNING"); expect(byCode.get("email")?.evidence.dayOtherLimit).toBe(70);
    expect(byCode.get("backup")?.state).toBe("UNKNOWN"); expect(byCode.get("restore")?.state).toBe("CRITICAL");
    expect(byCode.get("mfa")?.evidence.blocked).toBe(1); expect(byCode.get("notifications")?.state).toBe("UNKNOWN");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CUSTOMER|example.test|password|token/);
  });
  it("claims one monitor, fences expired leases and never publishes partial observations", async () => {
    const start = new Date(time), claims = await Promise.all([acquireOperationsMonitor(start), acquireOperationsMonitor(start)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(saveOperationsObservations(claims.find(Boolean)!, problem().slice(1), new Date(time + 1))).rejects.toThrow("complete");
    const replacement = await acquireOperationsMonitor(new Date(time + 121000)); expect(replacement).toBeTruthy();
    await expect(saveOperationsObservations(claims.find(Boolean)!, problem(), new Date(time + 122000))).rejects.toThrow("lease");
    expect(await prisma.operationsCheck.count()).toBe(0);
    await saveOperationsObservations(replacement!, problem(), new Date(time + 122000)); expect(await prisma.operationsCheck.count()).toBe(11);
  });
  it("deduplicates unchanged conditions and schedules a single daily reminder", async () => {
    await observe(); const initial = await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } });
    for (let i = 0; i < 3; i++) await observe();
    expect(await prisma.operationsNotice.count()).toBe(1);
    expect((await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } })).revision).toBe(initial.revision);
    await observe(problem(), 24 * 3600_000); expect(await prisma.operationsNotice.count({ where: { kind: "REMINDER" } })).toBe(1);
    await observe(); expect(await prisma.operationsNotice.count({ where: { kind: "REMINDER" } })).toBe(1);
  });
  it("acknowledges once with an audit, stops reminders and keeps the problem open", async () => {
    await observe(); const outcomes = await Promise.allSettled([acknowledge(), acknowledge()]); expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } }); expect(row.state).toBe("CRITICAL"); expect(row.acknowledgedAt).not.toBeNull();
    expect(await prisma.operationsNotice.count({ where: { status: "QUEUED" } })).toBe(0);
    await observe(problem(), 24 * 3600_000); expect(await prisma.operationsNotice.count({ where: { kind: "REMINDER" } })).toBe(0);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { actorUserId: f.user.id, action: "ops.check.acknowledge" } }); expect(audit.afterData).toMatchObject({ resolved: false });
  });
  it.each(["permission", "read-permission", "session", "mfa", "credential", "suspended", "unverified", "stale"])("requires current authority and current evidence for acknowledgment: %s", async condition => {
    await observe(); const row = await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } });
    if (condition === "permission" || condition === "read-permission") await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: [condition === "permission" ? "operations.manage" : "operations.read"] } });
    if (condition === "session") await prisma.session.delete({ where: { id: f.session.id } });
    if (condition === "mfa") await prisma.adminMfaSession.deleteMany({ where: { userId: f.user.id } });
    if (condition === "credential") await prisma.adminMfaCredential.update({ where: { userId: f.user.id }, data: { enabledAt: null } });
    if (condition === "suspended") await prisma.user.update({ where: { id: f.user.id }, data: { suspendedAt: new Date() } });
    if (condition === "unverified") await prisma.user.update({ where: { id: f.user.id }, data: { emailVerifiedAt: null } });
    if (condition === "stale") await observe(problem().map(item => item.code === "worker" ? { ...item, evidence: { ageSeconds: 900, limitSeconds: 90 } } : item));
    await expect(acknowledgeOperationsCheck({ ...f.actor, code: "worker", expectedRevision: row.revision, reason: "Review this current worker incident before acknowledging" })).rejects.toThrow();
    expect((await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } })).acknowledgedAt).toBeNull();
  });
  it("reopens a new incident and resets acknowledgment on severity escalation", async () => {
    await observe(problem().map(item => item.code === "worker" ? { ...item, state: "WARNING" } : item)); await acknowledge();
    await observe(); expect((await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } })).acknowledgedAt).toBeNull();
    await acknowledge(); await observe(healthyOperationsObservations()); await observe();
    expect((await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } }))).toMatchObject({ episode: 2, acknowledgedAt: null, state: "CRITICAL" });
  });
  it("sends no recovery notice for an unattempted warning, but reconciles uncertain deliveries with recovery", async () => {
    await observe(); await observe(healthyOperationsObservations()); expect(await prisma.operationsNotice.count({ where: { kind: "RESOLVED" } })).toBe(0);
    await observe(); vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret-token and private@example.test"); }));
    await deliverOperationsNotices(new Date(time)); await observe(healthyOperationsObservations());
    expect(await prisma.operationsNotice.count({ where: { kind: "RESOLVED", status: "QUEUED" } })).toBe(1);
    expect((await prisma.operationsNotice.findMany()).every(row => !row.lastError?.includes("secret-token"))).toBe(true);
  });
  it("uses one event ID for bounded retries and never exports private records or the destination", async () => {
    await observe(); const request = vi.fn(async () => new Response(null, { status: 503 })); vi.stubGlobal("fetch", request);
    for (let i = 0; i < 6; i++) { await deliverOperationsNotices(new Date(time)); time += 3600_000; }
    expect(request).toHaveBeenCalledTimes(5);
    const bodies = request.mock.calls.map(args => JSON.parse((args as unknown as [unknown, RequestInit])[1].body as string));
    expect(new Set(bodies.map(body => body.eventId)).size).toBe(1);
    expect(JSON.stringify(bodies)).not.toMatch(/example.test|controlled-test-sink|password|token/);
    expect((await prisma.operationsNotice.findFirstOrThrow()).status).toBe("FAILED");
  });
  it("preserves acknowledgment when the endpoint accepts an in-flight notice", async () => {
    await observe(); vi.stubGlobal("fetch", vi.fn(async () => { await acknowledge(); return new Response(null, { status: 200 }); }));
    await deliverOperationsNotices(new Date(time));
    const row = await prisma.operationsNotice.findFirstOrThrow(); expect(row.status).toBe("CANCELED"); expect(row.acceptedAt).not.toBeNull();
  });
  it("does not spend attempts when no webhook is configured and expires notices without replay", async () => {
    await observe(); vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "");
    expect(await deliverOperationsNotices(new Date(time))).toEqual({ accepted: 0, configured: false }); expect(fetch).not.toHaveBeenCalled();
    await observe(problem(), 25 * 3600_000); const original = await prisma.operationsNotice.findFirstOrThrow({ orderBy: { createdAt: "asc" } }); expect(original).toMatchObject({ status: "FAILED", attempts: 0 });
  });
  it("rejects private or partial evidence before any durable mutation", async () => {
    const observations = problem(); Object.assign(observations[0].evidence, { email: f.email });
    const lease = await acquireOperationsMonitor(new Date(time));
    await expect(saveOperationsObservations(lease!, observations, new Date(time + 1))).rejects.toThrow("evidence"); expect(await prisma.operationsCheck.count()).toBe(0);
  });
});
