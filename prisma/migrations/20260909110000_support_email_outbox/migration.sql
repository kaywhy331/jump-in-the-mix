ALTER TABLE "SupportTicketMessage" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "SupportTicketMessage_requestKey_key" ON "SupportTicketMessage"("requestKey");
CREATE TYPE "SupportEmailDeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'REVIEW', 'CANCELED');
CREATE TABLE "SupportEmailDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES "SupportTicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "status" "SupportEmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "messageCiphertext" TEXT NOT NULL,
  "emailMessageId" TEXT NOT NULL,
  "issuerUserId" TEXT NOT NULL,
  "issuerRevision" INTEGER,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "firstAttemptAt" TIMESTAMP(3),
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "providerId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportEmailDelivery_valid_generation" CHECK ("generation">=1 AND "attempts">=0),
  CONSTRAINT "SupportEmailDelivery_valid_lease" CHECK (("status"='SENDING' AND "leaseId" IS NOT NULL AND "leaseUntil" IS NOT NULL) OR ("status"<>'SENDING' AND "leaseId" IS NULL AND "leaseUntil" IS NULL)),
  CONSTRAINT "SupportEmailDelivery_frozen_send" CHECK ("status" NOT IN ('QUEUED','SENDING') OR length("messageCiphertext")>0)
);
CREATE UNIQUE INDEX "SupportEmailDelivery_emailMessageId_key" ON "SupportEmailDelivery"("emailMessageId");
CREATE UNIQUE INDEX "SupportEmailDelivery_messageId_generation_key" ON "SupportEmailDelivery"("messageId","generation");
CREATE INDEX "SupportEmailDelivery_status_availableAt_idx" ON "SupportEmailDelivery"("status","availableAt");
CREATE INDEX "SupportEmailDelivery_status_leaseUntil_idx" ON "SupportEmailDelivery"("status","leaseUntil");
-- Legacy requests did not save their provider key or frozen payload. Never replay them automatically.
INSERT INTO "SupportEmailDelivery" ("id","messageId","status","messageCiphertext","emailMessageId","issuerUserId","lastError","createdAt","updatedAt")
SELECT 'legacy-support-' || id, id, 'REVIEW', '', 'legacy-support-' || id, "authorUserId",
  'Legacy email has no saved delivery key. Review the provider history before preparing another notification.', "createdAt", CURRENT_TIMESTAMP
FROM "SupportTicketMessage" WHERE "authorType"='ADMIN' AND "emailStatus" IN ('PENDING','FAILED','PREVIEWED');
UPDATE "SupportTicketMessage" SET "emailStatus"='FAILED', "emailError"='Legacy email needs review; no automatic retry will be sent.'
WHERE "authorType"='ADMIN' AND "emailStatus"='PENDING';
