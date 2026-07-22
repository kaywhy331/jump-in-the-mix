CREATE TYPE "WeekendScheduling" AS ENUM ('KEEP', 'NEXT_MONDAY', 'PREVIOUS_FRIDAY');
CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "UserPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activeWorkspaceId" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'en-US',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");
CREATE INDEX "UserPreference_activeWorkspaceId_idx" ON "UserPreference"("activeWorkspaceId");
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_activeWorkspaceId_fkey" FOREIGN KEY ("activeWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkspacePreference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "defaultFollowUpMinutes" INTEGER NOT NULL DEFAULT 600,
  "quietHoursStart" INTEGER NOT NULL DEFAULT 1200,
  "quietHoursEnd" INTEGER NOT NULL DEFAULT 480,
  "weekendScheduling" "WeekendScheduling" NOT NULL DEFAULT 'KEEP',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspacePreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspacePreference_minutes_check" CHECK (
    "defaultFollowUpMinutes" BETWEEN 0 AND 1439
    AND "quietHoursStart" BETWEEN 0 AND 1439
    AND "quietHoursEnd" BETWEEN 0 AND 1439
  )
);
CREATE UNIQUE INDEX "WorkspacePreference_workspaceId_key" ON "WorkspacePreference"("workspaceId");
ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "dailyDigest" BOOLEAN NOT NULL DEFAULT TRUE,
  "overdueReminders" BOOLEAN NOT NULL DEFAULT TRUE,
  "upcomingDates" BOOLEAN NOT NULL DEFAULT TRUE,
  "integrationFailures" BOOLEAN NOT NULL DEFAULT TRUE,
  "importComplete" BOOLEAN NOT NULL DEFAULT TRUE,
  "supportReplies" BOOLEAN NOT NULL DEFAULT TRUE,
  "billingAlerts" BOOLEAN NOT NULL DEFAULT TRUE,
  "securityAlerts" BOOLEAN NOT NULL DEFAULT TRUE,
  "digestMinutes" INTEGER NOT NULL DEFAULT 480,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_digestMinutes_check" CHECK ("digestMinutes" BETWEEN 0 AND 1439)
);
CREATE UNIQUE INDEX "NotificationPreference_userId_workspaceId_key" ON "NotificationPreference"("userId", "workspaceId");
CREATE INDEX "NotificationPreference_workspaceId_idx" ON "NotificationPreference"("workspaceId");
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationEvent_userId_readAt_createdAt_idx" ON "NotificationEvent"("userId", "readAt", "createdAt");
CREATE INDEX "NotificationEvent_workspaceId_createdAt_idx" ON "NotificationEvent"("workspaceId", "createdAt");
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceInvitation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "tokenHash" TEXT NOT NULL,
  "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");
CREATE UNIQUE INDEX "WorkspaceInvitation_pending_workspace_email_key" ON "WorkspaceInvitation"("workspaceId", lower("email")) WHERE "status" = 'PENDING';
CREATE INDEX "WorkspaceInvitation_workspaceId_status_createdAt_idx" ON "WorkspaceInvitation"("workspaceId", "status", "createdAt");
CREATE INDEX "WorkspaceInvitation_email_status_idx" ON "WorkspaceInvitation"("email", "status");
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserMfaCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "secretCiphertext" TEXT NOT NULL,
  "recoveryCodeHashes" JSONB NOT NULL,
  "enabledAt" TIMESTAMP(3),
  "lastUsedStep" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserMfaCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserMfaCredential_userId_key" ON "UserMfaCredential"("userId");
ALTER TABLE "UserMfaCredential" ADD CONSTRAINT "UserMfaCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserMfaSession" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMfaSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserMfaSession_sessionId_key" ON "UserMfaSession"("sessionId");
CREATE INDEX "UserMfaSession_userId_expiresAt_idx" ON "UserMfaSession"("userId", "expiresAt");
ALTER TABLE "UserMfaSession" ADD CONSTRAINT "UserMfaSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMfaSession" ADD CONSTRAINT "UserMfaSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
