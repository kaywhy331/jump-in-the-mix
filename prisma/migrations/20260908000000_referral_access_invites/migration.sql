ALTER TABLE "User" ADD COLUMN "referralInvitesIssued" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_referralInvitesIssued_check" CHECK ("referralInvitesIssued" >= 0 AND "referralInvitesIssued" <= 5);
CREATE TABLE "ReferralAccessInvite" (
  "id" TEXT NOT NULL,
  "inviterUserId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "lastSentAt" TIMESTAMP(3),
  "tokenHash" TEXT NOT NULL,
  "tokenCiphertext" TEXT NOT NULL,
  "acceptedUserId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralAccessInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralAccessInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReferralAccessInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReferralAccessInvite_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReferralAccessInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReferralAccessInvite_tokenHash_key" ON "ReferralAccessInvite"("tokenHash");
CREATE UNIQUE INDEX "ReferralAccessInvite_acceptedUserId_key" ON "ReferralAccessInvite"("acceptedUserId");
CREATE UNIQUE INDEX "ReferralAccessInvite_inviterUserId_contactId_key" ON "ReferralAccessInvite"("inviterUserId", "contactId");
CREATE INDEX "ReferralAccessInvite_workspaceId_createdAt_idx" ON "ReferralAccessInvite"("workspaceId", "createdAt");
