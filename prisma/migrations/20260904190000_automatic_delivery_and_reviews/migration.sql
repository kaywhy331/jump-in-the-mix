CREATE TYPE "AutomatedDeliveryStatus" AS ENUM ('PROCESSING', 'DELIVERED', 'FAILED', 'CANCELED');

ALTER TABLE "ReviewRequest" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "ReviewRequest" SET "expiresAt" = "createdAt" + INTERVAL '30 days' WHERE "expiresAt" IS NULL;
ALTER TABLE "ReviewRequest" ALTER COLUMN "expiresAt" SET NOT NULL;
CREATE INDEX "ReviewRequest_expiresAt_idx" ON "ReviewRequest"("expiresAt");

CREATE TABLE "AutomatedDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "jumpId" TEXT NOT NULL,
  "channel" "Channel" NOT NULL,
  "status" "AutomatedDeliveryStatus" NOT NULL DEFAULT 'PROCESSING',
  "reviewEligibleAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "providerId" TEXT,
  "error" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomatedDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomatedDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomatedDelivery_jumpId_fkey" FOREIGN KEY ("jumpId") REFERENCES "Jump"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomatedDelivery_attempts_check" CHECK ("attempts" >= 1)
);

CREATE UNIQUE INDEX "AutomatedDelivery_jumpId_key" ON "AutomatedDelivery"("jumpId");
CREATE INDEX "AutomatedDelivery_workspaceId_createdAt_idx" ON "AutomatedDelivery"("workspaceId", "createdAt");
CREATE INDEX "AutomatedDelivery_status_reviewEligibleAt_idx" ON "AutomatedDelivery"("status", "reviewEligibleAt");
CREATE INDEX "AutomatedDelivery_lockedAt_idx" ON "AutomatedDelivery"("lockedAt");
