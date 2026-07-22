DO $$ BEGIN
  CREATE TYPE "WeekendScheduling" AS ENUM ('KEEP', 'NEXT_MONDAY', 'PREVIOUS_FRIDAY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UserPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en-US',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserPreference_userId_key" ON "UserPreference"("userId");

CREATE TABLE IF NOT EXISTS "WorkspacePreference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "defaultFollowUpMinutes" INTEGER NOT NULL DEFAULT 600,
  "quietHoursStart" INTEGER NOT NULL DEFAULT 1200,
  "quietHoursEnd" INTEGER NOT NULL DEFAULT 480,
  "weekendScheduling" "WeekendScheduling" NOT NULL DEFAULT 'KEEP',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspacePreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspacePreference_workspaceId_key" ON "WorkspacePreference"("workspaceId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserPreference_userId_fkey') THEN
    ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspacePreference_workspaceId_fkey') THEN
    ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspacePreference_minutes_check') THEN
    ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_minutes_check" CHECK (
      "defaultFollowUpMinutes" BETWEEN 0 AND 1439 AND
      "quietHoursStart" BETWEEN 0 AND 1439 AND
      "quietHoursEnd" BETWEEN 0 AND 1439
    );
  END IF;
END $$;
