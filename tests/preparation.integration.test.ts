import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { readPreparationStatus, retryPreparation } from "@/lib/preparation";
import { cleanupOperationalData } from "@/lib/operational-retention";
import type { Prisma } from "@/generated/prisma/client";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("follow-up preparation", () => {
  let workspaceId: string, userId: string, foreignId: string;
  const ago = (ms: number) => new Date(Date.now() - ms);
  const job = (data: Partial<Prisma.JobUncheckedCreateInput> = {}) => prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: {}, ...data } });
  beforeEach(async () => {
    const suffix = randomUUID();
    userId = (await prisma.user.create({ data: { email: `prepare-${suffix}@example.com`, name: "Preparation fixture" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Preparation", slug: `prepare-${suffix}` } })).id;
    foreignId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Foreign", slug: `foreign-prepare-${suffix}` } })).id;
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignId].filter(Boolean) } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("scopes pending work to the business and contact, including broad work", async () => {
    await job({ workspaceId: foreignId }); await job({ task: "send-notifications" });
    await job({ payload: { contactId: "other" } });
    expect((await readPreparationStatus(workspaceId, "person")).state).toBe("ready");
    expect((await readPreparationStatus(workspaceId)).state).toBe("preparing");
    await job({ payload: { mixId: "plan" } });
    expect((await readPreparationStatus(workspaceId, "person")).state).toBe("preparing");
    expect((await readPreparationStatus(workspaceId, "' OR true --")).state).toBe("preparing");
  });
  it("keeps future retries and active leases pending and flags delays", async () => {
    const pending = await job({ lockedAt: new Date(), lockedBy: "worker", runAt: new Date(Date.now() + 120_000) });
    expect((await readPreparationStatus(workspaceId)).state).toBe("preparing");
    await prisma.job.update({ where: { id: pending.id }, data: { attempts: 1 } });
    expect((await readPreparationStatus(workspaceId)).state).toBe("delayed");
    await prisma.job.update({ where: { id: pending.id }, data: { attempts: 0, createdAt: ago(61_000) } });
    expect((await readPreparationStatus(workspaceId)).state).toBe("delayed");
  });
  it("reports failure until a later success covers both contact and plan", async () => {
    const failed = await job({ payload: { contactId: "person", mixId: "plan" }, createdAt: ago(4000), failedAt: ago(3000), lastError: "private diagnostics" });
    await job({ workspaceId: foreignId, completedAt: new Date() });
    await job({ payload: { contactId: "other", mixId: "plan" }, completedAt: new Date() });
    await job({ payload: { contactId: "person", mixId: "other" }, completedAt: new Date() });
    expect((await readPreparationStatus(workspaceId, "person")).state).toBe("failed");
    const status = await readPreparationStatus(workspaceId);
    expect(Object.keys(status).sort()).toEqual(["observedAt", "state"]);
    await job({ payload: { contactId: "person" }, completedAt: new Date() });
    expect((await readPreparationStatus(workspaceId)).state).toBe("ready");
    expect((await prisma.job.findUniqueOrThrow({ where: { id: failed.id } })).lastError).toBe("private diagnostics");
  });
  it("does not let a narrow or earlier success repair a broad failure", async () => {
    await job({ failedAt: ago(2000), createdAt: ago(4000) });
    await job({ payload: { contactId: "person" }, completedAt: new Date() });
    await job({ payload: { mixId: "plan" }, completedAt: new Date() });
    await job({ createdAt: ago(5000), completedAt: new Date() });
    expect((await readPreparationStatus(workspaceId, "person")).state).toBe("failed");
    await prisma.workspacePreference.create({ data: { workspaceId, lastReconciledAt: new Date() } });
    expect((await readPreparationStatus(workspaceId)).state).toBe("ready");
  });
  it("deduplicates concurrent retries and retains failed receipts", async () => {
    const failed = await job({ failedAt: ago(1000), attempts: 8, lastError: "retained" });
    const results = await Promise.all([retryPreparation(workspaceId, userId), retryPreparation(workspaceId, userId), retryPreparation(workspaceId, userId)]);
    expect(results.every(result => result.state === "preparing")).toBe(true);
    expect(await prisma.job.count({ where: { workspaceId, completedAt: null, failedAt: null } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "follow-up.preparation.retry" } })).toBe(1);
    expect(await prisma.job.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({ attempts: 8, lastError: "retained" });
    const pending = await prisma.job.findFirstOrThrow({ where: { workspaceId, failedAt: null } });
    await prisma.job.update({ where: { id: pending.id }, data: { completedAt: new Date() } });
    expect((await readPreparationStatus(workspaceId)).state).toBe("ready");
  });
  it("does not reset backoff, leases, or enqueue unnecessary work", async () => {
    expect((await retryPreparation(workspaceId, userId)).state).toBe("ready");
    expect(await prisma.job.count({ where: { workspaceId } })).toBe(0);
    const pending = await job({ attempts: 2, runAt: new Date(Date.now()+300_000), lockedBy: "worker", lockedAt: new Date() });
    await job({ failedAt: new Date() });
    expect((await retryPreparation(workspaceId, userId)).state).toBe("delayed");
    expect(await prisma.job.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ runAt: pending.runAt, attempts: 2, lockedBy: "worker" });
    expect(await prisma.job.count({ where: { workspaceId } })).toBe(2);
  });
  it("keeps resolution evidence across routine retention cleanup", async () => {
    const day = 86_400_000;
    await job({ createdAt: ago(51*day), failedAt: ago(50*day) });
    const success = await job({ createdAt: ago(41*day), completedAt: ago(40*day) });
    const unrelated = await job({ task: "unrelated", completedAt: ago(40*day) });
    const expired = await job({ completedAt: ago(91*day) });
    // This cleanup is permitted only on the isolated local fixture database.
    await cleanupOperationalData(new Date());
    expect(await prisma.job.findUnique({ where: { id: success.id } })).not.toBeNull();
    expect(await prisma.job.findUnique({ where: { id: unrelated.id } })).toBeNull();
    expect(await prisma.job.findUnique({ where: { id: expired.id } })).toBeNull();
    expect((await readPreparationStatus(workspaceId)).state).toBe("ready");
  });
});
