-- A Mix can name the Contact stage its people are in (2026-10-07, D35; JITM-09 §2.79). Additive only: one nullable
-- column the previous release's code never reads, its index and a SET NULL foreign key.

-- AlterTable
ALTER TABLE "Mix" ADD COLUMN "stageId" TEXT;

-- CreateIndex
CREATE INDEX "Mix_stageId_idx" ON "Mix"("stageId");

-- AddForeignKey
ALTER TABLE "Mix" ADD CONSTRAINT "Mix_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "JourneyStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
