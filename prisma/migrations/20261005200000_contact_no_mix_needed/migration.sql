-- The owner's confirmation that a person needs no Mix (2026-10-05, D33). Additive only: a nullable
-- column on an existing table, which the previous release's code never reads.

-- AlterTable
ALTER TABLE "ContactRelationshipState" ADD COLUMN "noMixNeededAt" TIMESTAMP(3);
