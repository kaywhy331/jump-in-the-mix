-- Preserve Contact Groups while allowing a workspace to select which groups
-- remain active under the current plan allowance.
CREATE TABLE "ContactGroupState" (
    "groupId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactGroupState_pkey" PRIMARY KEY ("groupId")
);

CREATE INDEX "ContactGroupState_workspaceId_isActive_idx"
    ON "ContactGroupState"("workspaceId", "isActive");
