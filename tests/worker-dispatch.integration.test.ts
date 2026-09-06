import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { dispatchWorkerPass } from "@/lib/worker-dispatch";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("durable worker dispatch coordination", () => {
  let userId: string; let workspaceId: string; let foreignId: string;
  const scopes = ["background-dispatch", "background-dispatch-trailing"];
  const fetchMock = vi.fn();
  beforeEach(async () => {
    vi.stubEnv("WORKER_DISPATCH_MODE", "netlify");
    vi.stubEnv("NETLIFY_WORKER_SECRET", "integration-test-worker-secret-".repeat(2));
    vi.stubEnv("APP_URL", "https://dispatch.example.test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset().mockImplementation(async () => new Response(null, { status: 202 }));
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { email: `dispatch-${suffix}@example.com`, name: "Dispatch fixture" } });
    userId = user.id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Dispatch fixture", slug: `dispatch-${suffix}` } })).id;
    foreignId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Other fixture", slug: `other-dispatch-${suffix}` } })).id;
    await prisma.authRateLimit.deleteMany({ where: { scope: { in: scopes } } });
  });
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.authRateLimit.deleteMany({ where: { scope: { in: scopes } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("excludes another workspace, future retries, failed jobs, and live leases", async () => {
    await prisma.job.create({ data: { workspaceId: foreignId, task: "dispatch.test", payload: {} } });
    await prisma.job.createMany({ data: [
      { workspaceId, task: "dispatch.test", payload: {}, runAt: new Date(Date.now() + 60_000) },
      { workspaceId, task: "dispatch.test", payload: {}, failedAt: new Date() },
      { workspaceId, task: "dispatch.test", payload: {}, completedAt: new Date() }
    ] });
    const locked = await prisma.job.create({ data: { workspaceId, task: "dispatch.test", payload: {}, lockedAt: new Date(), lockedBy: "another-worker" } });
    expect(await dispatchWorkerPass({ workspaceId, queuedOnly: true })).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
    await prisma.job.update({ where: { id: locked.id }, data: { lockedAt: new Date(Date.now() - 11 * 60_000) } });
    expect(await dispatchWorkerPass({ workspaceId, queuedOnly: true })).toBe("accepted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: locked.id } })).lockedBy).toBe("another-worker");
  });
  it("leaves durable work pending when a handoff fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const job = await prisma.job.create({ data: { workspaceId, task: "dispatch.test", payload: {} } });
    fetchMock.mockRejectedValue(new Error("unavailable"));
    expect(await dispatchWorkerPass({ workspaceId, queuedOnly: true })).toBe("failed");
    expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ completedAt: null, failedAt: null, lockedAt: null, attempts: 0 });
  });
  it("coordinates concurrent callers with one immediate and one trailing request", async () => {
    const job = await prisma.job.create({ data: { workspaceId, task: "dispatch.test", payload: {} } });
    const times: number[] = [];
    fetchMock.mockImplementation(async () => { times.push(Date.now()); return new Response(null, { status: 202 }); });
    const results = await Promise.all(Array.from({ length: 3 }, () => dispatchWorkerPass({ workspaceId, queuedOnly: true })));
    expect(results.filter(result => result === "accepted")).toHaveLength(2);
    expect(results.filter(result => result === "throttled")).toHaveLength(1);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(10_000);
    // A successful HTTP handoff still must not claim completion of the job.
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).completedAt).toBeNull();
  }, 25_000);
});
