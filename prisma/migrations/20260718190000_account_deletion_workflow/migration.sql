CREATE TABLE "AccountDeletionAudit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AccountDeletionAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountDeletionRevocation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "connectionFingerprint" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "credentialsCiphertext" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountDeletionRevocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionAudit_requestId_key" ON "AccountDeletionAudit"("requestId");
CREATE INDEX "AccountDeletionAudit_subjectHash_createdAt_idx" ON "AccountDeletionAudit"("subjectHash", "createdAt");
CREATE INDEX "AccountDeletionAudit_status_createdAt_idx" ON "AccountDeletionAudit"("status", "createdAt");
CREATE UNIQUE INDEX "AccountDeletionRevocation_requestId_connectionFingerprint_key" ON "AccountDeletionRevocation"("requestId", "connectionFingerprint");
CREATE INDEX "AccountDeletionRevocation_status_nextAttemptAt_idx" ON "AccountDeletionRevocation"("status", "nextAttemptAt");
