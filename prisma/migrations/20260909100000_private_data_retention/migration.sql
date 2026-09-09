-- Add markers only. Cleanup is performed later by the bounded worker pass.
ALTER TABLE "EmailMessage" ALTER COLUMN "recipientHash" DROP NOT NULL;
ALTER TABLE "EmailMessage" ADD COLUMN "detailsRetiredAt" TIMESTAMP(3);
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_retired_details_check" CHECK (
  ("detailsRetiredAt" IS NULL AND "recipientHash" IS NOT NULL) OR
  ("detailsRetiredAt" IS NOT NULL AND "recipientHash" IS NULL AND "providerId" IS NULL)
);
CREATE INDEX "EmailMessage_detailsRetiredAt_createdAt_idx" ON "EmailMessage"("detailsRetiredAt", "createdAt");
ALTER TABLE "EmailProviderEvent" ADD COLUMN "detailsRetiredAt" TIMESTAMP(3);
ALTER TABLE "EmailProviderEvent" ADD CONSTRAINT "EmailProviderEvent_retired_details_check" CHECK (
  "detailsRetiredAt" IS NULL OR ("providerId" IS NULL AND cardinality("recipientHashes")=0)
);
CREATE INDEX "EmailProviderEvent_detailsRetiredAt_receivedAt_idx" ON "EmailProviderEvent"("detailsRetiredAt", "receivedAt");
ALTER TABLE "WaitlistDelivery" ADD COLUMN "payloadPurgedAt" TIMESTAMP(3);
ALTER TABLE "WaitlistDelivery" ADD CONSTRAINT "WaitlistDelivery_purged_payload_check" CHECK (
  "payloadPurgedAt" IS NULL OR ("messageCiphertext"='' AND status IN ('SENT','CANCELED') AND "leaseId" IS NULL AND "lockedAt" IS NULL)
);
CREATE INDEX "WaitlistDelivery_payloadPurgedAt_updatedAt_idx" ON "WaitlistDelivery"("payloadPurgedAt", "updatedAt");
ALTER TABLE "ReferralAccessInvite" ADD COLUMN "tokenPurgedAt" TIMESTAMP(3);
ALTER TABLE "ReferralAccessInvite" ADD CONSTRAINT "ReferralAccessInvite_purged_token_check" CHECK (
  "tokenPurgedAt" IS NULL OR ("tokenCiphertext"='' AND ("acceptedAt" IS NOT NULL OR "revokedAt" IS NOT NULL))
);
CREATE INDEX "ReferralAccessInvite_tokenPurgedAt_createdAt_idx" ON "ReferralAccessInvite"("tokenPurgedAt", "createdAt");
CREATE INDEX "SupportTicket_status_lastActivityAt_idx" ON "SupportTicket"(status, "lastActivityAt");
CREATE TABLE "DataRetentionState" (
  id TEXT NOT NULL PRIMARY KEY,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  counts JSONB,
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
