import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { PreparationStatus } from "@/lib/preparation-types";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;

// Read this before reading the follow-ups it describes. A completion between
// queries may leave a conservative preparing state, never a stale empty/ready one.
export async function readPreparationStatus(workspaceId: string, contactId?: string, db: Reader = prisma): Promise<PreparationStatus> {
  const now = new Date();
  const scope = contactId ? Prisma.sql`AND (j.payload ->> 'contactId' IS NULL OR j.payload ->> 'contactId' = ${contactId})` : Prisma.empty;
  const [result] = await db.$queryRaw<Array<{ pending: boolean; delayed: boolean; failed: boolean }>>(Prisma.sql`
    WITH relevant AS (
      SELECT j."createdAt", j.attempts, j."completedAt", j."failedAt", j.payload FROM "Job" j
      WHERE j."workspaceId" = ${workspaceId} AND j.task = 'generate-jumps' AND j."completedAt" IS NULL ${scope}
    )
    SELECT
      EXISTS (SELECT 1 FROM relevant WHERE "completedAt" IS NULL AND "failedAt" IS NULL) AS pending,
      EXISTS (SELECT 1 FROM relevant WHERE "completedAt" IS NULL AND "failedAt" IS NULL
        AND ("createdAt" < ${new Date(now.getTime() - 60_000)} OR attempts > 0)) AS delayed,
      EXISTS (
        SELECT 1 FROM relevant f WHERE f."failedAt" IS NOT NULL AND f."completedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "WorkspacePreference" p WHERE p."workspaceId" = ${workspaceId}
          AND p."lastReconciledAt" >= f."failedAt")
        AND NOT EXISTS (
          SELECT 1 FROM "Job" s WHERE s."workspaceId" = ${workspaceId} AND s.task = 'generate-jumps'
          AND s."completedAt" >= f."failedAt" AND s."createdAt" >= f."createdAt"
          AND (s.payload ->> 'contactId' IS NULL OR s.payload ->> 'contactId' = f.payload ->> 'contactId')
          AND (s.payload ->> 'mixId' IS NULL OR s.payload ->> 'mixId' = f.payload ->> 'mixId')
        )
      ) AS failed
  `);
  return { state: result.pending ? (result.delayed ? "delayed" : "preparing") : result.failed ? "failed" : "ready", observedAt: now.toISOString() };
}

// Retain failed receipts and enqueue a fresh, idempotent workspace preparation.
// A contact can be affected by a workspace-wide failure, so a narrow retry would
// not necessarily repair the work shown on that contact's page.
export async function retryPreparation(workspaceId: string, actorUserId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    const status = await readPreparationStatus(workspaceId, undefined, tx);
    if (status.state !== "failed") return status;
    await tx.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
    await tx.auditLog.create({ data: { workspaceId, actorUserId, actorType: "USER", action: "follow-up.preparation.retry", entityType: "Workspace", entityId: workspaceId, source: "follow-up.preparation" } });
    return { state: "preparing", observedAt: new Date().toISOString() } satisfies PreparationStatus;
  });
}
