import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const removesOne = () => ({ deleteMany: vi.fn(async () => ({ count: 1 })) });
  return {
    prisma: {
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
      reportExport: removesOne(),
      reportDailySnapshot: removesOne(),
      reportStorageObservation: removesOne(),
      job: removesOne(),
      workerHeartbeat: removesOne(),
      session: removesOne(),
      authOAuthState: removesOne(),
      stripeWebhookEvent: removesOne(),
      authRateLimit: { deleteMany: vi.fn(async () => ({ count: 3 })) }
    },
    runDataRetention: vi.fn(async () => ({ emailDetails: 2 })),
    deleteExpiredImportSafeKeys: vi.fn(async () => 4)
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: state.prisma }));
vi.mock("@/lib/data-retention", () => ({ runDataRetention: state.runDataRetention }));
vi.mock("@/lib/import-receipt-retention", () => ({ deleteExpiredImportSafeKeys: state.deleteExpiredImportSafeKeys }));

import { cleanupOperationalData } from "@/lib/operational-retention";

const now = new Date("2026-09-24T12:00:00Z");
const otherPasses = [
  state.prisma.reportExport, state.prisma.reportDailySnapshot, state.prisma.reportStorageObservation,
  state.prisma.job, state.prisma.workerHeartbeat, state.prisma.session, state.prisma.authOAuthState, state.prisma.stripeWebhookEvent
].map((model) => model.deleteMany);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("cleanupOperationalData", () => {
  it("removes rate-limit rows whose window opened over 48 hours ago unless they are still blocked", async () => {
    await expect(cleanupOperationalData(now)).resolves.toBe(8 + 4 + 2 + 3);
    expect(state.prisma.authRateLimit.deleteMany).toHaveBeenCalledTimes(1);
    expect(state.prisma.authRateLimit.deleteMany).toHaveBeenCalledWith({
      where: {
        windowStartedAt: { lt: new Date("2026-09-22T12:00:00Z") },
        OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }]
      }
    });
  });

  it("forgets Stripe event ids after 90 days, long after Stripe stops retrying", async () => {
    await cleanupOperationalData(now);
    expect(state.prisma.stripeWebhookEvent.deleteMany).toHaveBeenCalledWith({ where: { receivedAt: { lt: new Date("2026-06-26T12:00:00Z") } } });
  });

  it("removes expired OAuth sign-in states", async () => {
    await cleanupOperationalData(now);
    expect(state.prisma.authOAuthState.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
  });

  it("runs the rate-limit purge after every other pass", async () => {
    await cleanupOperationalData(now);
    const purgeOrder = state.prisma.authRateLimit.deleteMany.mock.invocationCallOrder[0];
    expect(state.runDataRetention.mock.invocationCallOrder[0]).toBeLessThan(purgeOrder);
    for (const pass of otherPasses) expect(pass.mock.invocationCallOrder[0]).toBeLessThan(purgeOrder);
    expect(state.deleteExpiredImportSafeKeys.mock.invocationCallOrder[0]).toBeLessThan(purgeOrder);
  });

  it("finishes the other passes and reports when the rate-limit purge fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.prisma.authRateLimit.deleteMany.mockRejectedValueOnce(new Error("relation is locked"));
    await expect(cleanupOperationalData(now)).resolves.toBe(8 + 4 + 2);
    for (const pass of otherPasses) expect(pass).toHaveBeenCalledTimes(1);
    expect(state.runDataRetention).toHaveBeenCalledWith(now);
    expect(error).toHaveBeenCalledWith("Stale rate-limit cleanup failed; the other retention passes completed.");
  });
});
