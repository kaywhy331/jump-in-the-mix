CREATE TYPE "EmailSuppressionReason" AS ENUM ('INVITATION_OPTOUT', 'HARD_BOUNCE', 'COMPLAINT');

ALTER TABLE "WaitlistEntry" ADD COLUMN "withdrawnAt" TIMESTAMP(3);

CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" "EmailSuppressionReason" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSuppression_email_reason_key" ON "EmailSuppression"("email", "reason");
