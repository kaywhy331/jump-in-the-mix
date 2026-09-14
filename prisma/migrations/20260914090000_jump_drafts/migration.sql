-- Owner-edited follow-up text, one row per follow-up and channel family, stored in the same
-- double-brace token form the step editor validates. The rendered message is a projection over
-- the bound contact and business context at read time and is never stored here. Rows cascade
-- with their follow-up and workspace; a stale revision is refused by the application.
CREATE TYPE "PreparationFamily" AS ENUM ('TEXT', 'EMAIL', 'CALL');

CREATE TABLE "JumpDraft" (
    "jumpId" TEXT NOT NULL,
    "family" "PreparationFamily" NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "script" TEXT,
    "stepVersionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JumpDraft_pkey" PRIMARY KEY ("jumpId","family")
);

CREATE INDEX "JumpDraft_workspaceId_updatedAt_idx" ON "JumpDraft"("workspaceId", "updatedAt");

ALTER TABLE "JumpDraft" ADD CONSTRAINT "JumpDraft_jumpId_fkey" FOREIGN KEY ("jumpId") REFERENCES "Jump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JumpDraft" ADD CONSTRAINT "JumpDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
