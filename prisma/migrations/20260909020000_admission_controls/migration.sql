CREATE TABLE "AdmissionPolicy" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "accountCeiling" INTEGER NOT NULL DEFAULT 0,
  "outstandingCeiling" INTEGER NOT NULL DEFAULT 0,
  "collectionPaused" BOOLEAN NOT NULL DEFAULT false,
  "grantsPaused" BOOLEAN NOT NULL DEFAULT false,
  "referralsPaused" BOOLEAN NOT NULL DEFAULT false,
  "redemptionPaused" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdmissionPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdmissionPolicy_singleton" CHECK ("id" = 'default'),
  CONSTRAINT "AdmissionPolicy_limits" CHECK (
    "accountCeiling" BETWEEN 0 AND 1000000 AND
    "outstandingCeiling" BETWEEN 0 AND "accountCeiling" AND "revision" >= 0
  )
);
-- Existing links remain usable. Only new issuance needs configured ceilings.
INSERT INTO "AdmissionPolicy" ("updatedAt") VALUES (CURRENT_TIMESTAMP);
CREATE INDEX "ReferralAccessInvite_outstanding" ON "ReferralAccessInvite" ("id")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
