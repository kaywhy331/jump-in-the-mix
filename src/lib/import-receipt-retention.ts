import type { Prisma } from "@/generated/prisma/client";

export function deleteExpiredImportSafeKeys(tx: Prisma.TransactionClient, now: Date) {
  return tx.$executeRaw`
    DELETE FROM "IdempotencyKey" k WHERE k.id IN (
      SELECT candidate.id FROM "IdempotencyKey" candidate
      WHERE candidate."expiresAt" < (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND NOT EXISTS (
          SELECT 1 FROM "ContactImportBatch" b JOIN "Job" j
            ON j."workspaceId"=b."workspaceId" AND j.task='contact-import' AND j.payload->>'batchId'=b.id
          WHERE b."workspaceId"=candidate."workspaceId" AND b."importId"=split_part(candidate.key, ':', 2)
            AND split_part(candidate.key, ':', 1)='contact-import'
            AND b.status IN ('QUEUED','RUNNING','FAILED') AND b."canceledAt" IS NULL AND j."completedAt" IS NULL
        )
      ORDER BY candidate."expiresAt", candidate.id LIMIT 1000
    )`;
}
