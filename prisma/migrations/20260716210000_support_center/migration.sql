CREATE TYPE "SupportTicketCategory" AS ENUM (
  'GENERAL',
  'ACCOUNT',
  'BILLING',
  'CONTACTS',
  'JUMPS',
  'MIXES',
  'JUMP_DATES',
  'TEMPLATES',
  'AI',
  'IMPORTS_SYNC',
  'PRIVACY_SECURITY',
  'BUG',
  'FEATURE_REQUEST'
);

CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'WAITING_ON_SUPPORT', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportMessageAuthorType" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "SupportEmailStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SENT', 'PREVIEWED', 'FAILED');

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" "SupportTicketCategory" NOT NULL,
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "authorType" "SupportMessageAuthorType" NOT NULL,
  "body" TEXT NOT NULL,
  "emailStatus" "SupportEmailStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "emailProviderId" TEXT,
  "emailError" TEXT,
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");
CREATE INDEX "SupportTicket_workspaceId_requesterUserId_lastActivityAt_idx"
  ON "SupportTicket"("workspaceId", "requesterUserId", "lastActivityAt");
CREATE INDEX "SupportTicket_status_priority_lastActivityAt_idx"
  ON "SupportTicket"("status", "priority", "lastActivityAt");
CREATE INDEX "SupportTicket_category_status_idx" ON "SupportTicket"("category", "status");
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");
CREATE INDEX "SupportTicketMessage_authorUserId_createdAt_idx" ON "SupportTicketMessage"("authorUserId", "createdAt");
CREATE INDEX "SupportTicketMessage_emailStatus_createdAt_idx" ON "SupportTicketMessage"("emailStatus", "createdAt");

ALTER TABLE "SupportTicketMessage"
  ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
