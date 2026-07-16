-- PRE-TRAFFIC ROLLBACK ONLY
--
-- Prefer restoring the validated pre-deployment backup after production traffic
-- has reached the new schema. This script intentionally refuses to recreate the
-- legacy MixStep ordering constraint when duplicate sort positions exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MixStep"
    GROUP BY "mixId", "sortOrder"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot restore legacy MixStep uniqueness while duplicate mixId/sortOrder rows exist. Restore the pre-deployment backup instead.';
  END IF;
END $$;

DROP TABLE IF EXISTS "AdminImpersonation";
DROP TABLE IF EXISTS "MixBroadcastSchedule";
DROP TABLE IF EXISTS "JumpActionEvent";
DROP TABLE IF EXISTS "MixStop";
DROP TABLE IF EXISTS "AuthRateLimit";
DROP TYPE IF EXISTS "JumpActionType";

DROP INDEX IF EXISTS "MixStep_mixId_isActive_sortOrder_idx";
ALTER TABLE "MixStep" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "MixStep" DROP COLUMN IF EXISTS "isActive";
CREATE UNIQUE INDEX IF NOT EXISTS "MixStep_mixId_sortOrder_key" ON "MixStep"("mixId", "sortOrder");

ALTER TABLE "Contact" DROP COLUMN IF EXISTS "privateNotes";
