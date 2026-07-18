CREATE TYPE "ReferralStatus" AS ENUM ('ATTRIBUTED', 'QUALIFIED', 'REVOKED');
CREATE TYPE "ReferralRewardRecipient" AS ENUM ('REFERRER', 'REFERRED');
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'ACTIVE', 'BANKED', 'CONSUMED', 'CAPPED', 'REVOKED');

CREATE TABLE "ReferralAccount" (
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "plusExpiresAt" TIMESTAMP(3),
  "bankedDays" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralAccount_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "codeUsed" TEXT NOT NULL,
  "referrerWorkspaceId" TEXT NOT NULL,
  "referredWorkspaceId" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'ATTRIBUTED',
  "qualifiedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralReward" (
  "id" TEXT NOT NULL,
  "referralId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "recipient" "ReferralRewardRecipient" NOT NULL,
  "days" INTEGER NOT NULL DEFAULT 30,
  "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralAccount_code_key" ON "ReferralAccount"("code");
CREATE INDEX "ReferralAccount_plusExpiresAt_idx" ON "ReferralAccount"("plusExpiresAt");
CREATE UNIQUE INDEX "Referral_referredWorkspaceId_key" ON "Referral"("referredWorkspaceId");
CREATE INDEX "Referral_referrerWorkspaceId_status_createdAt_idx" ON "Referral"("referrerWorkspaceId", "status", "createdAt");
CREATE INDEX "Referral_status_qualifiedAt_idx" ON "Referral"("status", "qualifiedAt");
CREATE UNIQUE INDEX "ReferralReward_referralId_recipient_key" ON "ReferralReward"("referralId", "recipient");
CREATE INDEX "ReferralReward_workspaceId_status_createdAt_idx" ON "ReferralReward"("workspaceId", "status", "createdAt");
CREATE INDEX "ReferralReward_endsAt_status_idx" ON "ReferralReward"("endsAt", "status");

ALTER TABLE "ReferralReward"
  ADD CONSTRAINT "ReferralReward_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "Referral"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
