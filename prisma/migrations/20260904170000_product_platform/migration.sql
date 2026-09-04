-- Consolidate display and scheduling preferences before removing duplicate profile fields.
INSERT INTO "UserPreference" ("id", "userId", "locale", "timezone", "createdAt", "updatedAt")
SELECT 'pref_' || md5(u."id"), u."id", 'en-US', COALESCE(p."timezone", 'UTC'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN "Workspace" w ON w."ownerId" = u."id"
LEFT JOIN "WorkspaceProfile" p ON p."workspaceId" = w."id"
WHERE NOT EXISTS (SELECT 1 FROM "UserPreference" up WHERE up."userId" = u."id");

UPDATE "UserPreference" up
SET "timezone" = p."timezone", "updatedAt" = CURRENT_TIMESTAMP
FROM "Workspace" w
JOIN "WorkspaceProfile" p ON p."workspaceId" = w."id"
WHERE up."userId" = w."ownerId" AND up."timezone" = 'UTC' AND p."timezone" IS NOT NULL;

INSERT INTO "WorkspacePreference" ("id", "workspaceId", "defaultFollowUpMinutes", "quietHoursStart", "quietHoursEnd", "weekendScheduling", "createdAt", "updatedAt")
SELECT 'schedule_' || md5(w."id"), w."id", 600, COALESCE(p."quietHoursStart", 1200), COALESCE(p."quietHoursEnd", 480), 'KEEP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace" w
LEFT JOIN "WorkspaceProfile" p ON p."workspaceId" = w."id"
WHERE NOT EXISTS (SELECT 1 FROM "WorkspacePreference" wp WHERE wp."workspaceId" = w."id");

ALTER TABLE "WorkspacePreference" ADD COLUMN IF NOT EXISTS "nextReconcileAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WorkspacePreference" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceProfile" ADD COLUMN IF NOT EXISTS "reviewUrl" TEXT;
ALTER TABLE "WorkspaceProfile" DROP COLUMN IF EXISTS "timezone";
ALTER TABLE "WorkspaceProfile" DROP COLUMN IF EXISTS "quietHoursStart";
ALTER TABLE "WorkspaceProfile" DROP COLUMN IF EXISTS "quietHoursEnd";

-- Remove legacy status aliases while retaining action-event COPIED as a useful audit event.
UPDATE "Jump" SET "status" = 'PENDING' WHERE "status" = 'COPIED';
UPDATE "Jump" SET "status" = 'DONE' WHERE "status" = 'SENT';
ALTER TABLE "Jump" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "JumpStatus" RENAME TO "JumpStatus_legacy";
CREATE TYPE "JumpStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED', 'CANCELED');
ALTER TABLE "Jump" ALTER COLUMN "status" TYPE "JumpStatus" USING ("status"::text::"JumpStatus");
ALTER TABLE "Jump" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "JumpStatus_legacy";

CREATE TYPE "NotificationDeliveryKind" AS ENUM ('DAILY_DIGEST', 'DUE_PUSH', 'WEEKLY_REPORT');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'SKIPPED', 'FAILED');
CREATE TYPE "ReviewRequestStatus" AS ENUM ('READY', 'OPENED', 'HAPPY', 'NEEDS_ATTENTION', 'REVIEW_CLICKED', 'REFERRAL_CLICKED');

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
  "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT true,
  "digestHour" INTEGER NOT NULL DEFAULT 7,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_digestHour_check" CHECK ("digestHour" BETWEEN 0 AND 23),
  CONSTRAINT "NotificationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationPreference_workspaceId_key" ON "NotificationPreference"("workspaceId");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

INSERT INTO "NotificationPreference" ("id", "workspaceId", "userId", "createdAt", "updatedAt")
SELECT 'notify_' || md5(w."id"), w."id", w."ownerId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Workspace" w;

CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_workspaceId_userId_idx" ON "PushSubscription"("workspaceId", "userId");

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "NotificationDeliveryKind" NOT NULL,
  "localDate" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "providerId" TEXT,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationDelivery_workspaceId_kind_localDate_key" ON "NotificationDelivery"("workspaceId", "kind", "localDate");
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");
CREATE INDEX "NotificationDelivery_lockedAt_idx" ON "NotificationDelivery"("lockedAt");

CREATE TABLE "AutomationPreference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "reviewWindowMinutes" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomationPreference_reviewWindow_check" CHECK ("reviewWindowMinutes" BETWEEN 5 AND 1440)
);
CREATE UNIQUE INDEX "AutomationPreference_workspaceId_key" ON "AutomationPreference"("workspaceId");

CREATE TABLE "ReviewRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "ReviewRequestStatus" NOT NULL DEFAULT 'READY',
  "rating" INTEGER,
  "feedback" TEXT,
  "openedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "reviewClickedAt" TIMESTAMP(3),
  "referralClickedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReviewRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReviewRequest_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "ReviewRequest_tokenHash_key" ON "ReviewRequest"("tokenHash");
CREATE INDEX "ReviewRequest_workspaceId_createdAt_idx" ON "ReviewRequest"("workspaceId", "createdAt");
CREATE INDEX "ReviewRequest_contactId_createdAt_idx" ON "ReviewRequest"("contactId", "createdAt");

-- Hosted-scale search indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX IF NOT EXISTS "Contact_displayName_trgm_idx" ON "Contact" USING GIN ("displayName" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_company_trgm_idx" ON "Contact" USING GIN ("company" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_publicNotes_trgm_idx" ON "Contact" USING GIN ("publicNotes" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_privateNotes_trgm_idx" ON "Contact" USING GIN ("privateNotes" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ContactEmail_email_trgm_idx" ON "ContactEmail" USING GIN ("email" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ContactPhone_phone_trgm_idx" ON "ContactPhone" USING GIN ("phone" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ContactCustomFieldValue_value_trgm_idx" ON "ContactCustomFieldValue" USING GIN ("value" public.gin_trgm_ops);
