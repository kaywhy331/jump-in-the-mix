CREATE TYPE "WeekendScheduling" AS ENUM ('KEEP', 'NEXT_MONDAY', 'PREVIOUS_FRIDAY');

CREATE TABLE "UserPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en-US',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

ALTER TABLE "UserPreference"
  ADD CONSTRAINT "UserPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspacePreference" (
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

CREATE UNIQUE INDEX "WorkspacePreference_workspaceId_key" ON "WorkspacePreference"("workspaceId");

ALTER TABLE "WorkspacePreference"
  ADD CONSTRAINT "WorkspacePreference_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
