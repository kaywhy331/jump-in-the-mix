-- Community Marketplace: listings of an author's live Mix or Mega-Mix, favorites,
-- copies added from a listing, and reports with staff review. Additive only.
CREATE TYPE "MarketplaceListingKind" AS ENUM ('MIX', 'MEGA_MIX');

CREATE TYPE "MarketplaceListingStatus" AS ENUM ('LIVE', 'UNSHARED', 'HIDDEN');

CREATE TYPE "MarketplaceReportReason" AS ENUM ('PRIVATE_INFO', 'OFFENSIVE', 'SPAM', 'MISLEADING', 'COPYRIGHT', 'OTHER');

CREATE TYPE "MarketplaceReportStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

CREATE TABLE "MarketplaceAuthor" (
    "workspaceId" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAuthor_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "kind" "MarketplaceListingKind" NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "mixId" TEXT,
    "pipelineId" TEXT,
    "summary" TEXT,
    "industry" TEXT,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'LIVE',
    "hiddenReason" "MarketplaceReportReason",
    "hiddenAt" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "mixCount" INTEGER NOT NULL DEFAULT 1,
    "beatCount" INTEGER NOT NULL DEFAULT 0,
    "channels" TEXT[],
    "fingerprint" TEXT NOT NULL,
    "contentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceFavorite" (
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceFavorite_pkey" PRIMARY KEY ("listingId","userId")
);

CREATE TABLE "MarketplaceImport" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mixId" TEXT,
    "pipelineId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceReport" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reporterWorkspaceId" TEXT NOT NULL,
    "reason" "MarketplaceReportReason" NOT NULL,
    "details" TEXT,
    "status" "MarketplaceReportStatus" NOT NULL DEFAULT 'OPEN',
    "autoHidden" BOOLEAN NOT NULL DEFAULT false,
    "authorSeenAt" TIMESTAMP(3),
    "authorEmailedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceListing_mixId_key" ON "MarketplaceListing"("mixId");

CREATE UNIQUE INDEX "MarketplaceListing_pipelineId_key" ON "MarketplaceListing"("pipelineId");

CREATE INDEX "MarketplaceListing_status_kind_publishedAt_idx" ON "MarketplaceListing"("status", "kind", "publishedAt");

CREATE INDEX "MarketplaceListing_workspaceId_idx" ON "MarketplaceListing"("workspaceId");

CREATE INDEX "MarketplaceFavorite_userId_workspaceId_idx" ON "MarketplaceFavorite"("userId", "workspaceId");

CREATE INDEX "MarketplaceImport_workspaceId_listingId_idx" ON "MarketplaceImport"("workspaceId", "listingId");

CREATE INDEX "MarketplaceImport_listingId_idx" ON "MarketplaceImport"("listingId");

CREATE INDEX "MarketplaceReport_status_createdAt_idx" ON "MarketplaceReport"("status", "createdAt");

CREATE UNIQUE INDEX "MarketplaceReport_listingId_reporterUserId_key" ON "MarketplaceReport"("listingId", "reporterUserId");

ALTER TABLE "MarketplaceAuthor" ADD CONSTRAINT "MarketplaceAuthor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "MegaMixPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceFavorite" ADD CONSTRAINT "MarketplaceFavorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceFavorite" ADD CONSTRAINT "MarketplaceFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceFavorite" ADD CONSTRAINT "MarketplaceFavorite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceImport" ADD CONSTRAINT "MarketplaceImport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceImport" ADD CONSTRAINT "MarketplaceImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceReport" ADD CONSTRAINT "MarketplaceReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
