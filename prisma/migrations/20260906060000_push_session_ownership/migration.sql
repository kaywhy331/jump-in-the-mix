-- Existing devices have no proven browser session. Keep their receipts, but
-- require a fresh device opt-in before sending to an unbound subscription.
ALTER TABLE "PushSubscription" ADD COLUMN "sessionId" TEXT;
CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
