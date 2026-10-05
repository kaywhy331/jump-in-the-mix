-- Personal keys for adding contact cards shared from a phone (2026-10-05). Additive only: the previous
-- release's code never reads this table. Only a SHA-256 hash of each key is stored.

-- CreateTable
CREATE TABLE "ContactShareKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ContactShareKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactShareKey_tokenHash_key" ON "ContactShareKey"("tokenHash");

-- CreateIndex
CREATE INDEX "ContactShareKey_userId_idx" ON "ContactShareKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactShareKey_workspaceId_userId_key" ON "ContactShareKey"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "ContactShareKey" ADD CONSTRAINT "ContactShareKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShareKey" ADD CONSTRAINT "ContactShareKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
