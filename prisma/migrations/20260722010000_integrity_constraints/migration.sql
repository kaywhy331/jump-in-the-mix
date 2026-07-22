-- Normalize repeated-value primary flags before enforcing one primary row per Contact.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "contactId"
    ORDER BY "isPrimary" DESC, "createdAt" ASC, "id" ASC
  ) AS position
  FROM "ContactEmail"
)
UPDATE "ContactEmail" AS target
SET "isPrimary" = (ranked.position = 1)
FROM ranked
WHERE target."id" = ranked."id"
  AND target."isPrimary" IS DISTINCT FROM (ranked.position = 1);

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "contactId"
    ORDER BY "isPrimary" DESC, "createdAt" ASC, "id" ASC
  ) AS position
  FROM "ContactPhone"
)
UPDATE "ContactPhone" AS target
SET "isPrimary" = (ranked.position = 1)
FROM ranked
WHERE target."id" = ranked."id"
  AND target."isPrimary" IS DISTINCT FROM (ranked.position = 1);

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "contactId"
    ORDER BY "isPrimary" DESC, "createdAt" ASC, "id" ASC
  ) AS position
  FROM "ContactAddress"
)
UPDATE "ContactAddress" AS target
SET "isPrimary" = (ranked.position = 1)
FROM ranked
WHERE target."id" = ranked."id"
  AND target."isPrimary" IS DISTINCT FROM (ranked.position = 1);

CREATE UNIQUE INDEX "ContactEmail_one_primary_per_contact"
  ON "ContactEmail" ("contactId") WHERE "isPrimary" = true;
CREATE UNIQUE INDEX "ContactPhone_one_primary_per_contact"
  ON "ContactPhone" ("contactId") WHERE "isPrimary" = true;
CREATE UNIQUE INDEX "ContactAddress_one_primary_per_contact"
  ON "ContactAddress" ("contactId") WHERE "isPrimary" = true;

-- Inactive malformed assignments cannot produce work and can be removed safely.
DELETE FROM "MixAssignment"
WHERE "isActive" = false
  AND (("contactId" IS NULL AND "groupId" IS NULL) OR ("contactId" IS NOT NULL AND "groupId" IS NOT NULL));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MixAssignment"
    WHERE ("contactId" IS NULL AND "groupId" IS NULL)
       OR ("contactId" IS NOT NULL AND "groupId" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'MixAssignment rows must target exactly one Contact or Contact Group.';
  END IF;
END $$;

ALTER TABLE "MixAssignment"
  ADD CONSTRAINT "MixAssignment_exactly_one_target"
  CHECK (("contactId" IS NOT NULL)::int + ("groupId" IS NOT NULL)::int = 1);

-- Normalize sequence positions, then prevent duplicate positions among active steps.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "mixId"
    ORDER BY "sortOrder" ASC, "createdAt" ASC, "id" ASC
  ) AS next_order
  FROM "MixStep"
  WHERE "isActive" = true
)
UPDATE "MixStep" AS target
SET "sortOrder" = ranked.next_order
FROM ranked
WHERE target."id" = ranked."id"
  AND target."sortOrder" <> ranked.next_order;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MixStep"
    WHERE "dayOffset" < -365 OR "dayOffset" > 365
  ) THEN
    RAISE EXCEPTION 'MixStep day offsets must be between -365 and 365 before this migration can continue.';
  END IF;
END $$;

ALTER TABLE "MixStep"
  ADD CONSTRAINT "MixStep_day_offset_range" CHECK ("dayOffset" BETWEEN -365 AND 365),
  ADD CONSTRAINT "MixStep_send_time_range" CHECK ("sendTimeMinutes" IS NULL OR "sendTimeMinutes" BETWEEN 0 AND 1439);

CREATE UNIQUE INDEX "MixStep_active_sort_order_unique"
  ON "MixStep" ("mixId", "sortOrder") WHERE "isActive" = true;

-- Populate logical month/day values for full dates and deactivate malformed active dates.
UPDATE "JumpDate"
SET
  "month" = EXTRACT(MONTH FROM "dateValue")::int,
  "day" = EXTRACT(DAY FROM "dateValue")::int
WHERE "dateValue" IS NOT NULL
  AND ("month" IS NULL OR "day" IS NULL);

UPDATE "JumpDate"
SET "isActive" = false
WHERE "isActive" = true
  AND (
    ("recurrence" = 'NONE' AND "dateValue" IS NULL)
    OR "month" IS NULL
    OR "day" IS NULL
    OR "month" < 1
    OR "month" > 12
    OR "day" < 1
    OR "day" > CASE
      WHEN "month" = 2 THEN 29
      WHEN "month" IN (4, 6, 9, 11) THEN 30
      ELSE 31
    END
  );

ALTER TABLE "JumpDate"
  ADD CONSTRAINT "JumpDate_active_calendar_shape" CHECK (
    "isActive" = false OR (
      "month" BETWEEN 1 AND 12
      AND "day" BETWEEN 1 AND CASE
        WHEN "month" = 2 THEN 29
        WHEN "month" IN (4, 6, 9, 11) THEN 30
        ELSE 31
      END
      AND ("recurrence" <> 'NONE' OR "dateValue" IS NOT NULL)
    )
  ),
  ADD CONSTRAINT "JumpDate_time_range" CHECK ("timeMinutes" IS NULL OR "timeMinutes" BETWEEN 0 AND 1439);

-- Lock fields must be paired, and terminal jobs must not retain a lease.
UPDATE "Job"
SET "lockedAt" = NULL, "lockedBy" = NULL
WHERE ("lockedAt" IS NULL) <> ("lockedBy" IS NULL)
   OR "completedAt" IS NOT NULL
   OR "failedAt" IS NOT NULL;

ALTER TABLE "Job"
  ADD CONSTRAINT "Job_lock_fields_paired" CHECK (("lockedAt" IS NULL) = ("lockedBy" IS NULL)),
  ADD CONSTRAINT "Job_attempt_bounds" CHECK ("attempts" >= 0 AND "maxAttempts" > 0);

CREATE INDEX "Job_claim_ready_idx"
  ON "Job" ("runAt", "createdAt")
  WHERE "completedAt" IS NULL AND "failedAt" IS NULL;

CREATE INDEX "JumpDate_contact_active_idx" ON "JumpDate" ("contactId", "isActive");
