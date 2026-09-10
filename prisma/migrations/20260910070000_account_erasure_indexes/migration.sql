-- Cascading account deletion otherwise scans the remaining follow-up table
-- once per mix/beat/version, and the contact table once per deleted referrer.
-- Keep the additive change atomic and fail promptly on a busy table.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE INDEX "Contact_referredByContactId_idx" ON "Contact"("referredByContactId");
CREATE INDEX "Jump_mixId_idx" ON "Jump"("mixId");
CREATE INDEX "Jump_mixStepId_idx" ON "Jump"("mixStepId");
CREATE INDEX "Jump_stepVersionId_idx" ON "Jump"("stepVersionId");
COMMIT;
