import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupOperationalData } from "@/lib/operational-retention";
import { Prisma } from "@/generated/prisma/client";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("operational retention", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it("removes stale rate-limit rows but keeps active blocks and windows younger than 48 hours", async () => {
    const now = new Date();
    const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
    const scope = `retention-test-${randomUUID()}`;
    const row = (windowStartedAt: Date, blockedUntil: Date | null) =>
      prisma.authRateLimit.create({ data: { key: randomUUID(), scope, attempts: 3, windowStartedAt, blockedUntil } });
    const staleOpen = await row(hoursAgo(49), null);
    const staleExpiredBlock = await row(hoursAgo(49), hoursAgo(1));
    const staleActiveBlock = await row(hoursAgo(49), hoursAgo(-1));
    const recentOpen = await row(hoursAgo(47), null);
    const retention = await prisma.dataRetentionState.findUnique({ where: { id: "primary" } });
    const auditIds = (await prisma.platformAuditEvent.findMany({ where: { action: "privacy.retention.complete" }, select: { id: true } })).map((event) => event.id);
    try {
      // This cleanup is permitted only on the isolated local fixture database.
      await cleanupOperationalData(now);
      const remaining = (await prisma.authRateLimit.findMany({ where: { scope }, select: { id: true } })).map((entry) => entry.id).sort();
      expect(remaining).toEqual([staleActiveBlock.id, recentOpen.id].sort());
      expect(remaining).not.toContain(staleOpen.id);
      expect(remaining).not.toContain(staleExpiredBlock.id);
    } finally {
      await prisma.authRateLimit.deleteMany({ where: { scope } });
      await prisma.dataRetentionState.deleteMany({ where: { id: "primary" } });
      if (retention) await prisma.dataRetentionState.create({ data: { ...retention, counts: retention.counts ?? Prisma.DbNull } });
      await prisma.platformAuditEvent.deleteMany({ where: { action: "privacy.retention.complete", id: { notIn: auditIds } } });
    }
  });
});
