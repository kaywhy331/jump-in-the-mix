CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Contact_displayName_trgm_idx" ON "Contact" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_company_trgm_idx" ON "Contact" USING GIN ("company" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_publicNotes_trgm_idx" ON "Contact" USING GIN ("publicNotes" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_privateNotes_trgm_idx" ON "Contact" USING GIN ("privateNotes" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ContactEmail_email_trgm_idx" ON "ContactEmail" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ContactPhone_phone_trgm_idx" ON "ContactPhone" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ContactCustomFieldValue_value_trgm_idx" ON "ContactCustomFieldValue" USING GIN ("value" gin_trgm_ops);

CREATE TYPE "ContactImportBatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED');

CREATE TABLE "ContactImportBatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "importId" TEXT NOT NULL,
  "sourceFileName" TEXT,
  "status" "ContactImportBatchStatus" NOT NULL DEFAULT 'QUEUED',
  "totalRows" INTEGER NOT NULL,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "mergedCount" INTEGER NOT NULL DEFAULT 0,
  "replacedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "results" JSONB,
  "errorSummary" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactImportBatch_workspaceId_importId_key" ON "ContactImportBatch"("workspaceId", "importId");
CREATE INDEX "ContactImportBatch_workspaceId_createdAt_idx" ON "ContactImportBatch"("workspaceId", "createdAt");
CREATE INDEX "ContactImportBatch_status_createdAt_idx" ON "ContactImportBatch"("status", "createdAt");

ALTER TABLE "ContactImportBatch"
  ADD CONSTRAINT "ContactImportBatch_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactImportBatch"
  ADD CONSTRAINT "ContactImportBatch_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactImportBatch"
  ADD CONSTRAINT "ContactImportBatch_counts_check"
  CHECK (
    "totalRows" >= 0 AND "processedRows" >= 0 AND "processedRows" <= "totalRows"
    AND "createdCount" >= 0 AND "mergedCount" >= 0 AND "replacedCount" >= 0
    AND "skippedCount" >= 0 AND "failedCount" >= 0
  );
ALTER TABLE "ContactImportBatch"
  ADD CONSTRAINT "ContactImportBatch_completion_check"
  CHECK (
    ("status" IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED') AND "completedAt" IS NOT NULL)
    OR ("status" IN ('QUEUED', 'RUNNING') AND "completedAt" IS NULL)
  );
