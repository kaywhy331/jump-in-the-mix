-- Stop and drain every older worker before applying this release. Earlier
-- import code committed contacts separately from retry receipts; an interrupted
-- batch cannot prove which unreported rows already wrote contacts. Preserve
-- its saved results for review and require a new import for remaining rows.
WITH closed AS (
  UPDATE "ContactImportBatch" b SET
    status = 'CANCELED',
    "canceledAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    "completedAt" = COALESCE(b."completedAt", CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    "errorSummary" = 'This earlier interrupted import needs review. Check your contacts and saved results, then start a new import for any remaining rows.'
  WHERE b."canceledAt" IS NULL AND (
    b.status IN ('RUNNING', 'FAILED') OR
    (b.status = 'QUEUED' AND (b."startedAt" IS NOT NULL OR EXISTS (
      SELECT 1 FROM "Job" j WHERE j."workspaceId" = b."workspaceId"
        AND j.task = 'contact-import' AND j.payload->>'batchId' = b.id AND j.attempts > 0
    )))
  ) RETURNING b.id, b."workspaceId"
), stopped AS (
  UPDATE "Job" j SET
    "failedAt" = COALESCE(j."failedAt", CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "lockedAt" = NULL, "lockedBy" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    "lastError" = 'Earlier interrupted import closed for review. Review contacts and saved results before importing remaining rows.'
  FROM closed b WHERE j."workspaceId" = b."workspaceId" AND j.task = 'contact-import'
    AND j.payload->>'batchId' = b.id AND j."completedAt" IS NULL
  RETURNING j.id
)
INSERT INTO "AuditLog" (id, "workspaceId", "actorType", action, "entityType", "entityId", source, metadata, "createdAt")
SELECT 'import-recovery-' || b.id, b."workspaceId", 'SYSTEM', 'contact.import.recovery-required',
  'ContactImportBatch', b.id, 'migration.import-recovery',
  '{"reason":"Earlier contact writes and retry receipts were not atomic; review before importing remaining rows."}'::jsonb,
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM closed b JOIN "Workspace" w ON w.id = b."workspaceId";
