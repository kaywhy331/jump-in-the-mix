-- A tag added while its Mix is paused moves its members to the Mix's stage when the Mix resumes (2026-10-07, D65;
-- JITM-09 §2.79). Additive: a column with a default, which the previous release's code never reads.

-- AlterTable
ALTER TABLE "MixAssignment" ADD COLUMN "addedWhilePaused" BOOLEAN NOT NULL DEFAULT false;
