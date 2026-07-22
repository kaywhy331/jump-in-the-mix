CREATE TYPE "ContactPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "ContactRelationshipState" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "preferredChannel" "Channel",
  "priority" "ContactPriority" NOT NULL DEFAULT 'NORMAL',
  "doNotContact" BOOLEAN NOT NULL DEFAULT FALSE,
  "relationshipStatus" TEXT,
  "nextCommitmentAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactRelationshipState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactRelationshipState_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "ContactRelationshipState_contactId_key" ON "ContactRelationshipState"("contactId");
CREATE INDEX "ContactRelationshipState_workspaceId_ownerUserId_priority_idx" ON "ContactRelationshipState"("workspaceId", "ownerUserId", "priority");
CREATE INDEX "ContactRelationshipState_workspaceId_doNotContact_idx" ON "ContactRelationshipState"("workspaceId", "doNotContact");
CREATE INDEX "ContactRelationshipState_workspaceId_nextCommitmentAt_idx" ON "ContactRelationshipState"("workspaceId", "nextCommitmentAt");
ALTER TABLE "ContactRelationshipState" ADD CONSTRAINT "ContactRelationshipState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactRelationshipState" ADD CONSTRAINT "ContactRelationshipState_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactRelationshipState" ADD CONSTRAINT "ContactRelationshipState_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserContactLayout" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "cardOrder" TEXT[] NOT NULL,
  "collapsedCards" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserContactLayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserContactLayout_userId_workspaceId_key" ON "UserContactLayout"("userId", "workspaceId");
CREATE INDEX "UserContactLayout_workspaceId_idx" ON "UserContactLayout"("workspaceId");
ALTER TABLE "UserContactLayout" ADD CONSTRAINT "UserContactLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserContactLayout" ADD CONSTRAINT "UserContactLayout_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContactSavedView" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactSavedView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactSavedView_userId_workspaceId_name_key" ON "ContactSavedView"("userId", "workspaceId", "name");
CREATE INDEX "ContactSavedView_workspaceId_userId_createdAt_idx" ON "ContactSavedView"("workspaceId", "userId", "createdAt");
CREATE UNIQUE INDEX "ContactSavedView_one_default_per_workspace_user" ON "ContactSavedView"("userId", "workspaceId") WHERE "isDefault" = TRUE;
ALTER TABLE "ContactSavedView" ADD CONSTRAINT "ContactSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactSavedView" ADD CONSTRAINT "ContactSavedView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContactMergeRecord" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "survivorContactId" TEXT NOT NULL,
  "mergedContactId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "mergeSummary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactMergeRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContactMergeRecord_workspaceId_createdAt_idx" ON "ContactMergeRecord"("workspaceId", "createdAt");
CREATE INDEX "ContactMergeRecord_survivorContactId_idx" ON "ContactMergeRecord"("survivorContactId");
CREATE INDEX "ContactMergeRecord_mergedContactId_idx" ON "ContactMergeRecord"("mergedContactId");
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_survivorContactId_fkey" FOREIGN KEY ("survivorContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_mergedContactId_fkey" FOREIGN KEY ("mergedContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
