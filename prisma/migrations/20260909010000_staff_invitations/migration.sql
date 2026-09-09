CREATE TABLE "StaffInvitation" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "grants" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "denies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "issuerUserId" TEXT NOT NULL,
  "issuerRevision" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffInvitation_initial_role_check" CHECK ("role" <> 'OWNER')
);
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_email_createdAt_idx" ON "StaffInvitation"("email", "createdAt");
CREATE INDEX "StaffInvitation_issuerUserId_acceptedAt_idx" ON "StaffInvitation"("issuerUserId", "acceptedAt");
CREATE INDEX "StaffInvitation_expiresAt_idx" ON "StaffInvitation"("expiresAt");
ALTER TABLE "WaitlistDelivery" ALTER COLUMN "inviteId" DROP NOT NULL;
ALTER TABLE "WaitlistDelivery" ADD COLUMN "staffInvitationId" TEXT;
CREATE UNIQUE INDEX "WaitlistDelivery_staffInvitationId_key" ON "WaitlistDelivery"("staffInvitationId");
ALTER TABLE "WaitlistDelivery" ADD CONSTRAINT "WaitlistDelivery_staffInvitationId_fkey" FOREIGN KEY ("staffInvitationId") REFERENCES "StaffInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistDelivery" ADD CONSTRAINT "WaitlistDelivery_one_invitation_check" CHECK (("inviteId" IS NOT NULL) <> ("staffInvitationId" IS NOT NULL));
