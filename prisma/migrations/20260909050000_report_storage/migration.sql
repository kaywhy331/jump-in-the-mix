-- Add report storage only; preserve existing custom constraints and indexes.
-- CreateTable
CREATE TABLE "ReportExport" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorSessionId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fromDay" DATE NOT NULL,
    "throughDay" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "jobId" TEXT,
    "contentCiphertext" TEXT,
    "generatedAt" TIMESTAMP(3),
    "byteCount" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDailySnapshot" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "jobId" TEXT,
    "payload" JSONB,
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL DEFAULT 'daily',
    "definitionKey" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportExport_jobId_key" ON "ReportExport"("jobId");

-- CreateIndex
CREATE INDEX "ReportExport_expiresAt_idx" ON "ReportExport"("expiresAt");

-- CreateIndex
CREATE INDEX "ReportExport_actorUserId_createdAt_idx" ON "ReportExport"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportExport_status_createdAt_idx" ON "ReportExport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportExport_actorSessionId_requestKey_key" ON "ReportExport"("actorSessionId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDailySnapshot_jobId_key" ON "ReportDailySnapshot"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDailySnapshot_day_definitionKey_key" ON "ReportDailySnapshot"("day", "definitionKey");

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_actorSessionId_fkey" FOREIGN KEY ("actorSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDailySnapshot" ADD CONSTRAINT "ReportDailySnapshot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_state_check" CHECK (
  status IN ('QUEUED','RUNNING','READY','FAILED','CANCELLED') AND "throughDay">="fromDay" AND "throughDay"-"fromDay"<366
  AND ("byteCount" IS NULL OR "byteCount" BETWEEN 0 AND 524288)
  AND ("contentCiphertext" IS NULL OR octet_length("contentCiphertext")<=1048576)
  AND (status<>'READY' OR ("contentCiphertext" IS NOT NULL AND "generatedAt" IS NOT NULL AND "byteCount" IS NOT NULL))
);
ALTER TABLE "ReportDailySnapshot" ADD CONSTRAINT "ReportDailySnapshot_state_check" CHECK (
  status IN ('QUEUED','RUNNING','READY','FAILED') AND "definitionKey" ~ '^[a-f0-9]{64}$'
  AND (payload IS NULL OR octet_length(payload::text)<=1048576)
  AND (status<>'READY' OR (payload IS NOT NULL AND "observedAt" IS NOT NULL))
);
