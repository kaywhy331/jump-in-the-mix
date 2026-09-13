-- One row per handoff gesture: the exact content, channel and recipient handed to the phone,
-- created once from a client-generated id. A retry with the same payload is acknowledged, a retry
-- with a different payload is refused, and an outcome may only attach its reference and time.
-- The recipient is encrypted beside a normalized hash and minimized after the retention window.
CREATE TABLE "JumpAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jumpId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "family" "PreparationFamily" NOT NULL,
    "recipientCiphertext" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "script" TEXT,
    "draftRevision" INTEGER,
    "stepVersionId" TEXT NOT NULL,
    "contextVersions" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeActivityId" TEXT,
    "recordedAt" TIMESTAMP(3),
    "recipientRetiredAt" TIMESTAMP(3),

    CONSTRAINT "JumpAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JumpAttempt_jumpId_createdAt_idx" ON "JumpAttempt"("jumpId", "createdAt");

CREATE INDEX "JumpAttempt_workspaceId_createdAt_idx" ON "JumpAttempt"("workspaceId", "createdAt");

ALTER TABLE "JumpAttempt" ADD CONSTRAINT "JumpAttempt_jumpId_fkey" FOREIGN KEY ("jumpId") REFERENCES "Jump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JumpAttempt" ADD CONSTRAINT "JumpAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The opened, copied, composed and called telemetry can point at the attempt it belongs to.
ALTER TABLE "JumpActionEvent" ADD COLUMN "attemptId" TEXT;
