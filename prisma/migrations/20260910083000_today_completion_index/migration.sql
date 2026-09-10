-- Date-filtered completion counts and daily history must not scan older payloads.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE INDEX "Jump_workspaceId_status_completedAt_idx" ON "Jump"("workspaceId", "status", "completedAt");
COMMIT;
