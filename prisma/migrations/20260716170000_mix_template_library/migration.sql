CREATE TYPE "SharedMixReviewState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'UNPUBLISHED', 'FLAGGED');

CREATE TABLE "SharedMixMetadata" (
  "sharedMixId" TEXT NOT NULL,
  "publisherWorkspaceId" TEXT,
  "publisherMixId" TEXT,
  "sourceMixId" TEXT,
  "isPlatform" BOOLEAN NOT NULL DEFAULT false,
  "triggerMode" "MixTriggerMode" NOT NULL DEFAULT 'MANUAL_START',
  "dateTypeName" TEXT,
  "dateTypeSlug" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "voteCount" INTEGER NOT NULL DEFAULT 0,
  "reviewState" "SharedMixReviewState" NOT NULL DEFAULT 'PENDING',
  "featuredAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "moderationNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SharedMixMetadata_pkey" PRIMARY KEY ("sharedMixId")
);

CREATE TABLE "SharedMixContributorProfile" (
  "workspaceId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "displayName" TEXT,
  "title" TEXT,
  "bio" TEXT,
  "avatarUrl" TEXT,
  "website" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SharedMixContributorProfile_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "SharedMixVote" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sharedMixId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharedMixVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedMixImportMetadata" (
  "importId" TEXT NOT NULL,
  "sharedMixVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharedMixImportMetadata_pkey" PRIMARY KEY ("importId")
);

CREATE UNIQUE INDEX "SharedMixMetadata_publisherWorkspaceId_publisherMixId_key"
  ON "SharedMixMetadata"("publisherWorkspaceId", "publisherMixId");
CREATE INDEX "SharedMixMetadata_isPlatform_reviewState_idx"
  ON "SharedMixMetadata"("isPlatform", "reviewState");
CREATE INDEX "SharedMixMetadata_voteCount_publishedAt_idx"
  ON "SharedMixMetadata"("voteCount", "publishedAt");
CREATE UNIQUE INDEX "SharedMixVote_workspaceId_sharedMixId_key"
  ON "SharedMixVote"("workspaceId", "sharedMixId");
CREATE INDEX "SharedMixVote_sharedMixId_createdAt_idx"
  ON "SharedMixVote"("sharedMixId", "createdAt");

INSERT INTO "SharedMixMetadata" (
  "sharedMixId",
  "publisherWorkspaceId",
  "isPlatform",
  "triggerMode",
  "version",
  "voteCount",
  "reviewState",
  "publishedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "publisherWorkspaceId",
  CASE WHEN "publisherWorkspaceId" IS NULL THEN true ELSE false END,
  'MANUAL_START'::"MixTriggerMode",
  1,
  0,
  CASE
    WHEN "status" = 'APPROVED' THEN 'APPROVED'::"SharedMixReviewState"
    WHEN "status" = 'REJECTED' THEN 'REJECTED'::"SharedMixReviewState"
    WHEN "status" = 'UNPUBLISHED' THEN 'UNPUBLISHED'::"SharedMixReviewState"
    ELSE 'PENDING'::"SharedMixReviewState"
  END,
  CASE WHEN "status" = 'APPROVED' THEN "createdAt" ELSE NULL END,
  "createdAt",
  "updatedAt"
FROM "SharedMix"
ON CONFLICT ("sharedMixId") DO NOTHING;
