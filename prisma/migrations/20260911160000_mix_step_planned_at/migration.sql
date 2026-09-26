-- A beat may go out at one specific instant instead of a day offset from the trigger.
ALTER TABLE "MixStep" ADD COLUMN "plannedAt" TIMESTAMP(3);
