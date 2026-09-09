ALTER TYPE "EmailSuppressionReason" ADD VALUE 'PROVIDER_SUPPRESSION';
ALTER TYPE "WaitlistStatus" ADD VALUE 'SUPPRESSED';
CREATE TYPE "EmailCategory" AS ENUM ('AUTH', 'ACCESS_CONFIRMATION', 'INVITATION', 'PRODUCT');

CREATE TABLE "EmailMessage" (
  "id" TEXT NOT NULL,
  "recipientHash" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "category" "EmailCategory" NOT NULL,
  "firstAttemptAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "providerId" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "delayedAt" TIMESTAMP(3),
  "bouncedAt" TIMESTAMP(3),
  "complainedAt" TIMESTAMP(3),
  "suppressedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailMessage_providerId_key" ON "EmailMessage"("providerId");
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");
CREATE INDEX "EmailMessage_recipientHash_idx" ON "EmailMessage"("recipientHash");

CREATE TABLE "EmailSendAttempt" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "category" "EmailCategory" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSendAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailSendAttempt_createdAt_category_idx" ON "EmailSendAttempt"("createdAt", "category");
ALTER TABLE "EmailSendAttempt" ADD CONSTRAINT "EmailSendAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailProviderEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "providerId" TEXT,
  "recipientHashes" TEXT[],
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailProviderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailProviderEvent_providerId_occurredAt_idx" ON "EmailProviderEvent"("providerId", "occurredAt");
CREATE INDEX "EmailProviderEvent_receivedAt_idx" ON "EmailProviderEvent"("receivedAt");

ALTER TABLE "WaitlistDelivery" ADD COLUMN "emailMessageId" TEXT;
CREATE UNIQUE INDEX "WaitlistDelivery_emailMessageId_key" ON "WaitlistDelivery"("emailMessageId");
ALTER TABLE "WaitlistDelivery" ADD CONSTRAINT "WaitlistDelivery_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
