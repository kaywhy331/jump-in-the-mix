-- PRD core-foundation forward migration
-- Designed for populated databases originally provisioned through `prisma db push`.
-- Every additive object is guarded so preview/staging databases that already
-- received selected fields through db push can still enter migration history.

-- Preserve separately scoped private relationship notes.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "privateNotes" TEXT;

-- Permit historical inactive Mix sequence rows while keeping active ordering fast.
ALTER TABLE "MixStep" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MixStep" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "MixStep"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL;
ALTER TABLE "MixStep" ALTER COLUMN "updatedAt" SET NOT NULL;
DROP INDEX IF EXISTS "MixStep_mixId_sortOrder_key";
CREATE INDEX IF NOT EXISTS "MixStep_mixId_isActive_sortOrder_idx" ON "MixStep"("mixId", "isActive", "sortOrder");

-- Persistent authentication throttling.
CREATE TABLE IF NOT EXISTS "AuthRateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthRateLimit_key_key" ON "AuthRateLimit"("key");
CREATE INDEX IF NOT EXISTS "AuthRateLimit_scope_updatedAt_idx" ON "AuthRateLimit"("scope", "updatedAt");
CREATE INDEX IF NOT EXISTS "AuthRateLimit_blockedUntil_idx" ON "AuthRateLimit"("blockedUntil");

-- Contact-specific Mix stops.
CREATE TABLE IF NOT EXISTS "MixStop" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mixId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stoppedByUserId" TEXT,
    "reason" TEXT,
    "stoppedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MixStop_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MixStop_workspaceId_mixId_contactId_key" ON "MixStop"("workspaceId", "mixId", "contactId");
CREATE INDEX IF NOT EXISTS "MixStop_workspaceId_contactId_stoppedAt_idx" ON "MixStop"("workspaceId", "contactId", "stoppedAt");
CREATE INDEX IF NOT EXISTS "MixStop_workspaceId_mixId_stoppedAt_idx" ON "MixStop"("workspaceId", "mixId", "stoppedAt");

-- Communication action history remains independent from task completion status.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JumpActionType') THEN
    CREATE TYPE "JumpActionType" AS ENUM ('OPENED', 'COPIED', 'COMPOSED', 'CALLED', 'VOICEMAIL_STARTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "JumpActionEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jumpId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "JumpActionType" NOT NULL,
    "channel" "Channel",
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JumpActionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "JumpActionEvent_workspaceId_occurredAt_idx" ON "JumpActionEvent"("workspaceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "JumpActionEvent_jumpId_occurredAt_idx" ON "JumpActionEvent"("jumpId", "occurredAt");

-- Fixed-date broadcasts use a logical local date, local time, and IANA timezone.
CREATE TABLE IF NOT EXISTS "MixBroadcastSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mixId" TEXT NOT NULL,
    "localDate" TIMESTAMP(3) NOT NULL,
    "timeMinutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MixBroadcastSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MixBroadcastSchedule_mixId_key" ON "MixBroadcastSchedule"("mixId");
CREATE INDEX IF NOT EXISTS "MixBroadcastSchedule_workspaceId_localDate_idx" ON "MixBroadcastSchedule"("workspaceId", "localDate");
CREATE INDEX IF NOT EXISTS "MixBroadcastSchedule_workspaceId_mixId_idx" ON "MixBroadcastSchedule"("workspaceId", "mixId");

-- Time-limited, audited, view-only administrator support sessions.
CREATE TABLE IF NOT EXISTS "AdminImpersonation" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminImpersonation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminImpersonation_tokenHash_key" ON "AdminImpersonation"("tokenHash");
CREATE INDEX IF NOT EXISTS "AdminImpersonation_actorUserId_expiresAt_idx" ON "AdminImpersonation"("actorUserId", "expiresAt");
CREATE INDEX IF NOT EXISTS "AdminImpersonation_targetUserId_workspaceId_expiresAt_idx" ON "AdminImpersonation"("targetUserId", "workspaceId", "expiresAt");
CREATE INDEX IF NOT EXISTS "AdminImpersonation_workspaceId_endedAt_idx" ON "AdminImpersonation"("workspaceId", "endedAt");
