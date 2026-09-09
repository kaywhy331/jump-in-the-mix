ALTER TABLE "CalendarConnection" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "CalendarEntry" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "ContactJourney_automatic_lastCheckedAt_idx" ON "ContactJourney"("automatic", "lastCheckedAt");
