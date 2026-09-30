-- Plans and Stripe billing (2026-09-29, docs/PRICING_DECISION_2026-09-29.md). Additive only: the previous release's
-- code never reads these tables, and charging stays off until BILLING_ENABLED is set.

-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('FREE', 'PLUS', 'PRO');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- A workspace without a row is on Free; only a verified Stripe subscription moves it to a paid plan.
CREATE TABLE "WorkspaceBilling" (
    "workspaceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "plan" "BillingPlan" NOT NULL DEFAULT 'FREE',
    "interval" "BillingInterval",
    "subscriptionStatus" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceBilling_pkey" PRIMARY KEY ("workspaceId")
);

-- Each verified Stripe event is processed once; a retried delivery finds its id.
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customerId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceBilling_stripeCustomerId_key" ON "WorkspaceBilling"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceBilling_stripeSubscriptionId_key" ON "WorkspaceBilling"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_receivedAt_idx" ON "StripeWebhookEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "WorkspaceBilling" ADD CONSTRAINT "WorkspaceBilling_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
