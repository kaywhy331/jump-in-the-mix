-- CreateEnum
CREATE TYPE "AccessInviteSource" AS ENUM ('REFERRAL', 'WAITLIST_FIFO', 'WAITLIST_RANDOM', 'WAITLIST_MANUAL');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'ACCESS_GRANTED', 'JOINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WaitlistDeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'REVIEW', 'CANCELED');

-- AlterTable
ALTER TABLE "ReferralAccessInvite" ADD COLUMN     "source" "AccessInviteSource" NOT NULL DEFAULT 'REFERRAL',
ADD COLUMN     "waveId" TEXT,
ALTER COLUMN "inviterUserId" DROP NOT NULL,
ALTER COLUMN "workspaceId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "verifiedAt" TIMESTAMP(3),
    "accessGrantedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistSchedule" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistWave" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "fifoCount" INTEGER NOT NULL DEFAULT 0,
    "randomCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistWave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistDelivery" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "messageCiphertext" TEXT NOT NULL,
    "status" "WaitlistDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "providerId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entryId" TEXT,
    "inviteId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_verifiedAt_createdAt_idx" ON "WaitlistEntry"("status", "verifiedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistWave_scheduledFor_key" ON "WaitlistWave"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistDelivery_inviteId_key" ON "WaitlistDelivery"("inviteId");

-- CreateIndex
CREATE INDEX "WaitlistDelivery_status_nextAttemptAt_idx" ON "WaitlistDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WaitlistAudit_createdAt_idx" ON "WaitlistAudit"("createdAt");

-- CreateIndex
CREATE INDEX "ReferralAccessInvite_recipientEmail_acceptedAt_revokedAt_idx" ON "ReferralAccessInvite"("recipientEmail", "acceptedAt", "revokedAt");

-- AddForeignKey
ALTER TABLE "ReferralAccessInvite" ADD CONSTRAINT "ReferralAccessInvite_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "WaitlistWave"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistDelivery" ADD CONSTRAINT "WaitlistDelivery_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ReferralAccessInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
