-- This migration deliberately removes retired product surfaces and their data.
-- Take and verify an encrypted database backup before applying it to an existing deployment.

-- Keep only platform-curated ready-made plans. Community submissions were never
-- part of the supported product and have no customer-facing route.
DELETE FROM "SharedMixImportMetadata"
WHERE "importId" IN (
  SELECT i."id"
  FROM "SharedMixImport" i
  JOIN "SharedMix" s ON s."id" = i."sharedMixId"
  WHERE s."publisherWorkspaceId" IS NOT NULL
);
DELETE FROM "SharedMixImport"
WHERE "sharedMixId" IN (
  SELECT "id" FROM "SharedMix" WHERE "publisherWorkspaceId" IS NOT NULL
);
DELETE FROM "SharedMixVote"
WHERE "sharedMixId" IN (
  SELECT "id" FROM "SharedMix" WHERE "publisherWorkspaceId" IS NOT NULL
);
DELETE FROM "SharedMixMetadata"
WHERE "sharedMixId" IN (
  SELECT "id" FROM "SharedMix" WHERE "publisherWorkspaceId" IS NOT NULL
);
DELETE FROM "SharedMix" WHERE "publisherWorkspaceId" IS NOT NULL;

DROP TABLE "SharedMixVote";
DROP TABLE "SharedMixContributorProfile";
DROP TABLE "UserContactLayout";

ALTER TABLE "SharedMixMetadata"
  DROP COLUMN "publisherWorkspaceId",
  DROP COLUMN "publisherMixId",
  DROP COLUMN "isPlatform",
  DROP COLUMN "voteCount",
  DROP COLUMN "reviewState",
  DROP COLUMN "reviewedAt",
  DROP COLUMN "reviewedByUserId",
  DROP COLUMN "moderationNote";
CREATE INDEX "SharedMixMetadata_featuredAt_publishedAt_idx"
  ON "SharedMixMetadata"("featuredAt", "publishedAt");

ALTER TABLE "SharedMix" DROP COLUMN "publisherWorkspaceId";
ALTER TABLE "SharedMix" DROP COLUMN "rating";

-- Remove the inactive billing, provider-sync, capture, webhook, and reward stores.
DROP TABLE "SyncRun";
DROP TABLE "ExternalContactLink";
DROP TABLE "OAuthState";
DROP TABLE "MessagingIdentity";
DROP TABLE "ChannelLinkCode";
DROP TABLE "CaptureDraft";
DROP TABLE "AiMixDraft";
DROP TABLE "AccountDeletionRevocation";
DROP TABLE "Subscription";
DROP TABLE "WebhookEvent";
DROP TABLE "IntegrationConnection";
DROP TABLE "ReferralReward";
DROP TABLE "Referral";
DROP TABLE "ReferralAccount";

ALTER TABLE "Workspace"
  DROP COLUMN "planTier",
  DROP COLUMN "subscriptionStatus",
  DROP COLUMN "stripeCustomerId",
  DROP COLUMN "stripeSubscriptionId",
  DROP COLUMN "currentPeriodEnd",
  DROP COLUMN "cancelAtPeriodEnd";

-- Consolidate enum values before recreating the smaller supported enums.
UPDATE "Contact" SET "source" = 'MANUAL'
WHERE "source"::text IN ('GOOGLE', 'OUTLOOK', 'AI');
UPDATE "JumpDate" SET "source" = 'MANUAL'
WHERE "source"::text IN ('GOOGLE', 'OUTLOOK', 'AI');
ALTER TABLE "Contact" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "JumpDate" ALTER COLUMN "source" DROP DEFAULT;
ALTER TYPE "ContactSource" RENAME TO "ContactSource_retired";
CREATE TYPE "ContactSource" AS ENUM ('MANUAL', 'CSV', 'WEBSITE', 'WHATSAPP', 'API');
ALTER TABLE "Contact" ALTER COLUMN "source" TYPE "ContactSource"
  USING ("source"::text::"ContactSource");
ALTER TABLE "JumpDate" ALTER COLUMN "source" TYPE "ContactSource"
  USING ("source"::text::"ContactSource");
ALTER TABLE "Contact" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
ALTER TABLE "JumpDate" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
DROP TYPE "ContactSource_retired";

UPDATE "AuditLog" SET "actorType" = 'SYSTEM'
WHERE "actorType"::text IN ('AI', 'WEBHOOK');
ALTER TYPE "AuditActorType" RENAME TO "AuditActorType_retired";
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'ADMIN');
ALTER TABLE "AuditLog" ALTER COLUMN "actorType" TYPE "AuditActorType"
  USING ("actorType"::text::"AuditActorType");
DROP TYPE "AuditActorType_retired";

UPDATE "SupportTicket" SET "category" = 'GENERAL'
WHERE "category"::text IN ('BILLING', 'AI');
ALTER TYPE "SupportTicketCategory" RENAME TO "SupportTicketCategory_retired";
CREATE TYPE "SupportTicketCategory" AS ENUM (
  'GENERAL',
  'ACCOUNT',
  'CONTACTS',
  'JUMPS',
  'MIXES',
  'JUMP_DATES',
  'TEMPLATES',
  'IMPORTS_SYNC',
  'PRIVACY_SECURITY',
  'BUG',
  'FEATURE_REQUEST'
);
ALTER TABLE "SupportTicket" ALTER COLUMN "category" TYPE "SupportTicketCategory"
  USING ("category"::text::"SupportTicketCategory");
DROP TYPE "SupportTicketCategory_retired";

UPDATE "WorkspaceMember" SET "role" = 'OWNER'
WHERE "role"::text <> 'OWNER';
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "WorkspaceRole" RENAME TO "WorkspaceRole_retired";
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER');
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" TYPE "WorkspaceRole"
  USING ("role"::text::"WorkspaceRole");
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'OWNER';
DROP TYPE "WorkspaceRole_retired";

UPDATE "SharedMix" SET "status" = 'UNPUBLISHED'
WHERE "status"::text <> 'APPROVED';
ALTER TABLE "SharedMix" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "SharedMixStatus" RENAME TO "SharedMixStatus_retired";
CREATE TYPE "SharedMixStatus" AS ENUM ('APPROVED', 'UNPUBLISHED');
ALTER TABLE "SharedMix" ALTER COLUMN "status" TYPE "SharedMixStatus"
  USING ("status"::text::"SharedMixStatus");
ALTER TABLE "SharedMix" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
DROP TYPE "SharedMixStatus_retired";

DROP TYPE "SharedMixReviewState";
DROP TYPE "PlanTier";
DROP TYPE "SubscriptionStatus";
DROP TYPE "IntegrationProvider";
DROP TYPE "IntegrationStatus";
DROP TYPE "DraftStatus";
DROP TYPE "WebhookProvider";
DROP TYPE "ReferralStatus";
DROP TYPE "ReferralRewardRecipient";
DROP TYPE "ReferralRewardStatus";
