-- A beat of a plan bound to an appointment can be timed in elapsed minutes from the appointment's
-- start or end, or in elapsed minutes after the visit is marked completed, instead of by a
-- calendar-day rule. Existing beats keep the calendar-day rule.
CREATE TYPE "StepAnchor" AS ENUM ('CALENDAR_DAY', 'APPOINTMENT_START', 'APPOINTMENT_END', 'VISIT_COMPLETED');
ALTER TABLE "MixStep" ADD COLUMN "anchor" "StepAnchor" NOT NULL DEFAULT 'CALENDAR_DAY';
ALTER TABLE "MixStep" ADD COLUMN "offsetMinutes" INTEGER;
