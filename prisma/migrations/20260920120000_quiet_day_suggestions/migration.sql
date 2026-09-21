ALTER TABLE "WorkspacePreference" ADD COLUMN "quietDaysEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "quietDays" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_quietDays_check" CHECK ("quietDays" BETWEEN 1 AND 365);
