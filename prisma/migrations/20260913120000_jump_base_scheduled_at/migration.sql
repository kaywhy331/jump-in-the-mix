-- The scheduler's base instant, kept beside the effective due time so a snooze can be checked
-- against it without recomputing the schedule. Rows written before this column carried no snooze,
-- so their effective time is their base.
ALTER TABLE "Jump" ADD COLUMN "baseScheduledAt" TIMESTAMP(3);
UPDATE "Jump" SET "baseScheduledAt" = "scheduledAt" WHERE "baseScheduledAt" IS NULL;
