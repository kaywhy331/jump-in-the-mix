-- CreateEnum
CREATE TYPE "JourneyEventType" AS ENUM ('CONTACT_RECEIVED', 'CONVERSATION_STARTED', 'MEETING_SCHEDULED', 'SALE_CONFIRMED', 'WORK_COMPLETED', 'PLAN_COMPLETED', 'TIME_IN_STAGE', 'MANUAL');

-- CreateTable
CREATE TABLE "JourneyPreference" (
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyPreference_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "JourneyStage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "planId" TEXT,

    CONSTRAINT "JourneyStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromStageId" TEXT NOT NULL,
    "toStageId" TEXT NOT NULL,
    "eventType" "JourneyEventType" NOT NULL,
    "afterDays" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JourneyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactJourney" (
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "managedAssignmentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContactJourney_pkey" PRIMARY KEY ("contactId")
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" "JourneyEventType" NOT NULL,
    "source" TEXT NOT NULL,
    "resultingStageId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeReceipt" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "contactId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeIdentity" (
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "IntakeIdentity_pkey" PRIMARY KEY ("connectionId","externalId")
);

-- CreateTable
CREATE TABLE "CalendarPreference" (
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,

    CONSTRAINT "CalendarPreference_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "urlEncrypted" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "connectionId" TEXT,
    "externalUid" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyStage_workspaceId_position_idx" ON "JourneyStage"("workspaceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyStage_workspaceId_name_key" ON "JourneyStage"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "JourneyRule_workspaceId_enabled_idx" ON "JourneyRule"("workspaceId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRule_fromStageId_eventType_key" ON "JourneyRule"("fromStageId", "eventType");

-- CreateIndex
CREATE INDEX "ContactJourney_workspaceId_stageId_stageSince_idx" ON "ContactJourney"("workspaceId", "stageId", "stageSince");

-- CreateIndex
CREATE INDEX "JourneyEvent_contactId_occurredAt_idx" ON "JourneyEvent"("contactId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEvent_workspaceId_eventKey_key" ON "JourneyEvent"("workspaceId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeConnection_tokenHash_key" ON "IntakeConnection"("tokenHash");

-- CreateIndex
CREATE INDEX "IntakeConnection_workspaceId_createdAt_idx" ON "IntakeConnection"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeReceipt_connectionId_status_createdAt_idx" ON "IntakeReceipt"("connectionId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeReceipt_connectionId_eventKey_key" ON "IntakeReceipt"("connectionId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarPreference_tokenHash_key" ON "CalendarPreference"("tokenHash");

-- CreateIndex
CREATE INDEX "CalendarConnection_workspaceId_enabled_idx" ON "CalendarConnection"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "CalendarEntry_workspaceId_startsAt_endsAt_idx" ON "CalendarEntry"("workspaceId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "CalendarEntry_contactId_startsAt_idx" ON "CalendarEntry"("contactId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEntry_connectionId_externalUid_key" ON "CalendarEntry"("connectionId", "externalUid");

-- AddForeignKey
ALTER TABLE "JourneyPreference" ADD CONSTRAINT "JourneyPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStage" ADD CONSTRAINT "JourneyStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStage" ADD CONSTRAINT "JourneyStage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Mix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRule" ADD CONSTRAINT "JourneyRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRule" ADD CONSTRAINT "JourneyRule_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "JourneyStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRule" ADD CONSTRAINT "JourneyRule_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "JourneyStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactJourney" ADD CONSTRAINT "ContactJourney_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactJourney" ADD CONSTRAINT "ContactJourney_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactJourney" ADD CONSTRAINT "ContactJourney_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "JourneyStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeConnection" ADD CONSTRAINT "IntakeConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeReceipt" ADD CONSTRAINT "IntakeReceipt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntakeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeReceipt" ADD CONSTRAINT "IntakeReceipt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeIdentity" ADD CONSTRAINT "IntakeIdentity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntakeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeIdentity" ADD CONSTRAINT "IntakeIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarPreference" ADD CONSTRAINT "CalendarPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
