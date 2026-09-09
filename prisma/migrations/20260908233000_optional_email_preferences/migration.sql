-- New preferences require an explicit choice for optional email summaries.
-- Existing members keep their saved choices.
ALTER TABLE "NotificationPreference" ALTER COLUMN "emailDigestEnabled" SET DEFAULT false;
ALTER TABLE "NotificationPreference" ALTER COLUMN "weeklyReportEnabled" SET DEFAULT false;
