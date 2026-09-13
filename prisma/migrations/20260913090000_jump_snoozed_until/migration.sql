-- A snooze is a user-owned not-before time. Reconciliation keeps it instead of writing the computed time back.
ALTER TABLE "Jump" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
