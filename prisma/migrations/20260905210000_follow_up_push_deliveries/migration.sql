CREATE TABLE "FollowUpPushDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "jumpId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FollowUpPushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowUpPushDelivery_subscriptionId_jumpId_scheduledAt_key" ON "FollowUpPushDelivery"("subscriptionId", "jumpId", "scheduledAt");
CREATE INDEX "FollowUpPushDelivery_workspaceId_status_idx" ON "FollowUpPushDelivery"("workspaceId", "status");
CREATE INDEX "FollowUpPushDelivery_jumpId_idx" ON "FollowUpPushDelivery"("jumpId");
ALTER TABLE "FollowUpPushDelivery" ADD CONSTRAINT "FollowUpPushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpPushDelivery" ADD CONSTRAINT "FollowUpPushDelivery_jumpId_fkey" FOREIGN KEY ("jumpId") REFERENCES "Jump"("id") ON DELETE CASCADE ON UPDATE CASCADE;
