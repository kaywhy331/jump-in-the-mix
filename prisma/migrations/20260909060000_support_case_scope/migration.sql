ALTER TABLE "SupportTicket" ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "assignmentRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignmentRevision_check" CHECK ("assignmentRevision" >= 0);
CREATE INDEX "SupportTicket_assignedToUserId_status_idx" ON "SupportTicket"("assignedToUserId", "status");
ALTER TABLE "AdminImpersonation" ADD COLUMN "ticketId" TEXT, ADD COLUMN "actorSessionId" TEXT;
-- Existing grants have no proven case or originating session. Preserve their audit
-- history, but require a newly authorized case-bound view after this upgrade.
UPDATE "AdminImpersonation" SET "endedAt" = CURRENT_TIMESTAMP WHERE "endedAt" IS NULL;
ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_actorSessionId_fkey"
  FOREIGN KEY ("actorSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AdminImpersonation_ticketId_endedAt_idx" ON "AdminImpersonation"("ticketId", "endedAt");
CREATE INDEX "AdminImpersonation_actorSessionId_idx" ON "AdminImpersonation"("actorSessionId");
