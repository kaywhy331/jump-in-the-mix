ALTER TABLE "WorkspaceProfile" ADD COLUMN "useCases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ReferralAccessInvite" ALTER COLUMN "recipientEmail" DROP NOT NULL;
ALTER TABLE "ReferralAccessInvite" ADD COLUMN "recipientPhone" TEXT;
ALTER TABLE "ReferralAccessInvite" ADD COLUMN "manualDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReferralAccessInvite" ADD CONSTRAINT "ReferralAccessInvite_recipient_check" CHECK ("recipientEmail" IS NOT NULL OR ("manualDelivery" AND "recipientPhone" IS NOT NULL));
ALTER TABLE "Jump" ADD COLUMN "accessInviteId" TEXT;
CREATE UNIQUE INDEX "Jump_accessInviteId_key" ON "Jump"("accessInviteId");
ALTER TABLE "Jump" ADD CONSTRAINT "Jump_accessInviteId_fkey" FOREIGN KEY ("accessInviteId") REFERENCES "ReferralAccessInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
