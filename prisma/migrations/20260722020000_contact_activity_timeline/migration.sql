DO $$ BEGIN
  CREATE TYPE "ContactActivityKind" AS ENUM ('JUMP_OUTCOME', 'CUSTOMER_NOTE', 'PRIVATE_UPDATE', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ContactActivityVisibility" AS ENUM ('WORKSPACE', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "JumpOutcome" AS ENUM ('COMPLETED', 'CONNECTED', 'LEFT_VOICEMAIL', 'NO_ANSWER', 'NOT_SENT', 'WRONG_NUMBER', 'RESCHEDULED', 'SKIPPED', 'REOPENED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ContactActivity" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "jumpId" TEXT,
  "actorUserId" TEXT,
  "kind" "ContactActivityKind" NOT NULL,
  "outcome" "JumpOutcome",
  "channel" "Channel",
  "visibility" "ContactActivityVisibility" NOT NULL DEFAULT 'WORKSPACE',
  "summary" TEXT,
  "nextCommitmentAt" TIMESTAMP(3),
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactActivity_workspaceId_occurredAt_idx" ON "ContactActivity"("workspaceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ContactActivity_contactId_occurredAt_idx" ON "ContactActivity"("contactId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ContactActivity_jumpId_occurredAt_idx" ON "ContactActivity"("jumpId", "occurredAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_workspaceId_fkey') THEN
    ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_contactId_fkey') THEN
    ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_jumpId_fkey') THEN
    ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_jumpId_fkey" FOREIGN KEY ("jumpId") REFERENCES "Jump"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_actorUserId_fkey') THEN
    ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContactActivity_summary_length_check') THEN
    ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_summary_length_check" CHECK ("summary" IS NULL OR char_length("summary") <= 4000);
  END IF;
END $$;
