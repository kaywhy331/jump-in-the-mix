-- The owner records what happened at a visit. A missed visit holds its bound follow-ups; a
-- completed one lets the beats before it lapse and the ones after it run. Both are journey events
-- the owner's stage rules can act on.
ALTER TYPE "JourneyEventType" ADD VALUE IF NOT EXISTS 'MEETING_COMPLETED';
ALTER TYPE "JourneyEventType" ADD VALUE IF NOT EXISTS 'MEETING_NO_SHOW';
ALTER TABLE "CalendarEntry" ADD COLUMN "outcome" TEXT;
ALTER TABLE "CalendarEntry" ADD COLUMN "outcomeAt" TIMESTAMP(3);
