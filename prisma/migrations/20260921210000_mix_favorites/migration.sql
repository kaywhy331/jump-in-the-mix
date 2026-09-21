CREATE TABLE "MixFavorite" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mixId" TEXT,
  "sharedMixId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MixFavorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MixFavorite_one_target_check" CHECK (("mixId" IS NOT NULL) <> ("sharedMixId" IS NOT NULL)),
  CONSTRAINT "MixFavorite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MixFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MixFavorite_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MixFavorite_sharedMixId_fkey" FOREIGN KEY ("sharedMixId") REFERENCES "SharedMix"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MixFavorite_workspaceId_userId_mixId_key" ON "MixFavorite"("workspaceId", "userId", "mixId");
CREATE UNIQUE INDEX "MixFavorite_workspaceId_userId_sharedMixId_key" ON "MixFavorite"("workspaceId", "userId", "sharedMixId");
CREATE INDEX "MixFavorite_workspaceId_userId_idx" ON "MixFavorite"("workspaceId", "userId");
