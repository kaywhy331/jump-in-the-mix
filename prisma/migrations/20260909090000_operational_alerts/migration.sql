CREATE TABLE "OperationsMonitor" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'primary',
  "leaseId" TEXT, "leaseUntil" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "observedAt" TIMESTAMP(3), "lastError" TEXT
);
CREATE TABLE "OperationsCheck" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "state" TEXT NOT NULL CHECK ("state" IN ('OK', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  "episode" INTEGER NOT NULL DEFAULT 0 CHECK ("episode" >= 0),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" >= 1),
  "evidence" JSONB NOT NULL,
  "openedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
  "observedAt" TIMESTAMP(3) NOT NULL, "changedAt" TIMESTAMP(3) NOT NULL,
  "acknowledgedAt" TIMESTAMP(3), "acknowledgedBy" TEXT, "nextReminderAt" TIMESTAMP(3)
);
CREATE TABLE "OperationsNotice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL REFERENCES "OperationsCheck"("code") ON DELETE CASCADE ON UPDATE CASCADE,
  "episode" INTEGER NOT NULL CHECK ("episode" >= 1),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('OPENED','CHANGED','REMINDER','RESOLVED')),
  "state" TEXT NOT NULL CHECK ("state" IN ('OK', 'WARNING', 'CRITICAL', 'UNKNOWN')),
  "evidence" JSONB NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','SENDING','SENT','FAILED','CANCELED')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" TEXT, "lockedAt" TIMESTAMP(3), "acceptedAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OperationsNotice_status_nextAttemptAt_idx" ON "OperationsNotice"("status","nextAttemptAt");
CREATE INDEX "OperationsNotice_code_episode_idx" ON "OperationsNotice"("code","episode");
