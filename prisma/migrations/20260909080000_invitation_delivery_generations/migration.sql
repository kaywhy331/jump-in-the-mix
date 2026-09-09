ALTER TABLE "WaitlistDelivery" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "generationStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "WaitlistDelivery" SET "generationStartedAt" = "createdAt";
ALTER TABLE "WaitlistDelivery" ADD CONSTRAINT "WaitlistDelivery_generation_check" CHECK ("generation" >= 1);

CREATE TABLE "InvitationDeliveryHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deliveryId" TEXT NOT NULL REFERENCES "WaitlistDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "generation" INTEGER NOT NULL CHECK ("generation" >= 1),
  "emailMessageId" TEXT NOT NULL,
  "status" "WaitlistDeliveryStatus" NOT NULL CHECK ("status" IN ('REVIEW', 'SENT')),
  "attempts" INTEGER NOT NULL CHECK ("attempts" >= 0),
  "firstAttemptAt" TIMESTAMP(3),
  "generationStartedAt" TIMESTAMP(3) NOT NULL,
  "providerId" TEXT,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InvitationDeliveryHistory_emailMessageId_key" ON "InvitationDeliveryHistory"("emailMessageId");
CREATE UNIQUE INDEX "InvitationDeliveryHistory_deliveryId_generation_key" ON "InvitationDeliveryHistory"("deliveryId", "generation");
