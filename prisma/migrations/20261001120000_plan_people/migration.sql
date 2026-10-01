-- Plan limits (2026-10-01, docs/PRICING_DECISION_2026-09-29.md). Additive only: the previous release's code never
-- reads this table. The worker fills it on its next pass; while billing is off it counts everyone and skips no one.

-- The people who have follow-ups on, as the plan counts them.
CREATE TABLE "PlanPerson" (
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanPerson_pkey" PRIMARY KEY ("workspaceId","contactId")
);

-- CreateIndex
CREATE INDEX "PlanPerson_contactId_idx" ON "PlanPerson"("contactId");

-- AddForeignKey
ALTER TABLE "PlanPerson" ADD CONSTRAINT "PlanPerson_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPerson" ADD CONSTRAINT "PlanPerson_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
