-- Add the moderation state used when a Community submission needs review.
ALTER TYPE "SharedMixStatus" ADD VALUE IF NOT EXISTS 'FLAGGED';

-- Contributor profiles remain workspace-scoped and contain only explicitly public fields.
ALTER TABLE "WorkspaceProfile"
  ADD COLUMN "communityProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "communityDisplayName" TEXT,
  ADD COLUMN "communityTitle" TEXT,
  ADD COLUMN "communityBio" TEXT,
  ADD COLUMN "communityAvatarUrl" TEXT,
  ADD COLUMN "communityWebsite" TEXT;

-- Shared Mixes are immutable snapshots from the importing workspace's point of view.
ALTER TABLE "SharedMix"
  ADD COLUMN "publisherMixId" TEXT,
  ADD COLUMN "sourceMixId" TEXT,
  ADD COLUMN "isPlatform" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "triggerMode" "MixTriggerMode" NOT NULL DEFAULT 'MANUAL_START',
  ADD COLUMN "dateTypeName" TEXT,
  ADD COLUMN "dateTypeSlug" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "voteCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "featuredAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "moderationNote" TEXT;

ALTER TABLE "SharedMixImport"
  ADD COLUMN "sharedMixVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "SharedMix"
SET "isPlatform" = true,
    "publishedAt" = CASE WHEN "status" = 'APPROVED' THEN COALESCE("publishedAt", "createdAt") ELSE "publishedAt" END
WHERE "publisherWorkspaceId" IS NULL;

CREATE TABLE "SharedMixVote" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sharedMixId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharedMixVote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SharedMixVote"
  ADD CONSTRAINT "SharedMixVote_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SharedMixVote"
  ADD CONSTRAINT "SharedMixVote_sharedMixId_fkey"
  FOREIGN KEY ("sharedMixId") REFERENCES "SharedMix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "SharedMix_status_category_idx";

CREATE UNIQUE INDEX "SharedMix_publisherWorkspaceId_publisherMixId_key"
  ON "SharedMix"("publisherWorkspaceId", "publisherMixId");
CREATE INDEX "SharedMix_isPlatform_status_category_idx"
  ON "SharedMix"("isPlatform", "status", "category");
CREATE INDEX "SharedMix_voteCount_importCount_idx"
  ON "SharedMix"("voteCount", "importCount");
CREATE UNIQUE INDEX "SharedMixVote_workspaceId_sharedMixId_key"
  ON "SharedMixVote"("workspaceId", "sharedMixId");
CREATE INDEX "SharedMixVote_sharedMixId_createdAt_idx"
  ON "SharedMixVote"("sharedMixId", "createdAt");
