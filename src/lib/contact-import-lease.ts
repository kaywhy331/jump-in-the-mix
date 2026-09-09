import type { Prisma } from "@/generated/prisma/client";

export type ImportJobLease = { jobId: string; leaseId: string };
export type ImportRowLease = ImportJobLease & { batchId: string };
export class ImportInterruptedError extends Error {
  constructor() { super("The import was canceled or this worker no longer owns its active job."); }
}

// The job lock precedes the batch lock in execution, cancellation and recovery.
// A row commit holds both, so cancellation/takeover is ordered with its effects.
export async function lockImportJob(tx: Prisma.TransactionClient, batchId: string, lease: ImportJobLease, workspaceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Job" WHERE id=${lease.jobId} AND "lockedBy"=${lease.leaseId}
      AND task='contact-import' AND "workspaceId"=${workspaceId} AND payload->>'batchId'=${batchId}
      AND "completedAt" IS NULL AND "failedAt" IS NULL
      AND "lockedAt">(${new Date(Date.now() - 10 * 60_000).toISOString()}::timestamptz AT TIME ZONE 'UTC')
    FOR UPDATE`;
  if (!rows.length) throw new ImportInterruptedError();
}

export async function lockRunningImport(tx: Prisma.TransactionClient, batchId: string, workspaceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "ContactImportBatch" WHERE id=${batchId} AND "workspaceId"=${workspaceId}
      AND status='RUNNING' AND "canceledAt" IS NULL FOR UPDATE`;
  if (!rows.length) throw new ImportInterruptedError();
  return tx.contactImportBatch.findUniqueOrThrow({ where: { id: batchId }, select: { id: true, importId: true, actorUserId: true } });
}
