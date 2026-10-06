-- Where new contacts go (2026-10-05, D34; JITM-09 §2.78). Additive only: a new enum and columns with defaults
-- or nulls, which the previous release's code never reads. The default, NONE, keeps today's behavior.

-- CreateEnum
CREATE TYPE "NewContactPlacement" AS ENUM ('NONE', 'MIX', 'ASK');

-- AlterTable
ALTER TABLE "WorkspacePreference" ADD COLUMN "newContactPlacement" "NewContactPlacement" NOT NULL DEFAULT 'NONE',
ADD COLUMN "newContactMixId" TEXT;

-- AlterTable
ALTER TABLE "IntakeConnection" ADD COLUMN "newContactPlacement" "NewContactPlacement",
ADD COLUMN "newContactMixId" TEXT;

-- AddForeignKey
ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_newContactMixId_fkey" FOREIGN KEY ("newContactMixId") REFERENCES "Mix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeConnection" ADD CONSTRAINT "IntakeConnection_newContactMixId_fkey" FOREIGN KEY ("newContactMixId") REFERENCES "Mix"("id") ON DELETE SET NULL ON UPDATE CASCADE;
