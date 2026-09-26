-- Preserve only an allowlisted marketing scenario identifier and version.
-- Existing waitlist entries, invitations, and accounts continue with no choice.
ALTER TABLE "WaitlistEntry"
  ADD COLUMN "marketingScenario" TEXT,
  ADD COLUMN "marketingScenarioVersion" INTEGER;
ALTER TABLE "ReferralAccessInvite"
  ADD COLUMN "marketingScenario" TEXT,
  ADD COLUMN "marketingScenarioVersion" INTEGER;
CREATE TABLE "WorkspaceMarketingPreference" (
  "workspaceId" TEXT NOT NULL PRIMARY KEY REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "scenario" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_marketing_scenario_check"
  CHECK (("marketingScenario" IS NULL AND "marketingScenarioVersion" IS NULL) OR
         ("marketingScenario" IN ('real-estate','consulting','photography','painting','recruiting') AND "marketingScenarioVersion" = 1));
ALTER TABLE "ReferralAccessInvite" ADD CONSTRAINT "ReferralAccessInvite_marketing_scenario_check"
  CHECK (("marketingScenario" IS NULL AND "marketingScenarioVersion" IS NULL) OR
         ("marketingScenario" IN ('real-estate','consulting','photography','painting','recruiting') AND "marketingScenarioVersion" = 1));
ALTER TABLE "WorkspaceMarketingPreference" ADD CONSTRAINT "WorkspaceMarketingPreference_scenario_check"
  CHECK ("scenario" IN ('real-estate','consulting','photography','painting','recruiting') AND "version" = 1);
