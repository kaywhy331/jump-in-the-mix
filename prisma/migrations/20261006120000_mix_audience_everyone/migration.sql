-- A Mix's "Everyone" audience includes people added later (2026-10-05, D34; JITM-09 §2.78). Additive: a
-- column with a default, which the previous release's code never reads.

-- AlterTable
ALTER TABLE "Mix" ADD COLUMN "audienceEveryone" BOOLEAN NOT NULL DEFAULT false;

-- Until now "Everyone" was saved only as one audience assignment per person at save time. A Mix with any
-- such assignment still on was saved with Everyone, so it keeps that audience and now includes newcomers.
UPDATE "Mix" m SET "audienceEveryone" = true
WHERE EXISTS (
  SELECT 1 FROM "MixAssignment" a
  WHERE a."mixId" = m.id AND a."isActive" AND a."contactId" IS NOT NULL AND a."assignmentKey" LIKE '%:audience:%'
);
