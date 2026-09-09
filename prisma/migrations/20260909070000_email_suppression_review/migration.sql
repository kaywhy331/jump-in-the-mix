ALTER TABLE "EmailSuppression" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastTriggeredAt" TIMESTAMP(3), ADD COLUMN "clearedAt" TIMESTAMP(3);
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_revision_check" CHECK ("revision" >= 1);
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_optout_check" CHECK ("clearedAt" IS NULL OR reason <> 'INVITATION_OPTOUT');
CREATE INDEX "EmailSuppression_clearedAt_createdAt_idx" ON "EmailSuppression"("clearedAt", "createdAt");
