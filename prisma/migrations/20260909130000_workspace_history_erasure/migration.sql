-- Historical workflow tables predate workspace foreign keys. Remove only
-- already-orphaned rows, then prevent deletion/concurrent writers creating more.
BEGIN;
LOCK TABLE "ContactGroupState", "JumpActionEvent", "MixBroadcastSchedule", "MixStop" IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM "ContactGroupState" t WHERE NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w.id=t."workspaceId");
DELETE FROM "JumpActionEvent" t WHERE NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w.id=t."workspaceId");
DELETE FROM "MixBroadcastSchedule" t WHERE NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w.id=t."workspaceId");
DELETE FROM "MixStop" t WHERE NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w.id=t."workspaceId");
ALTER TABLE "ContactGroupState" ADD CONSTRAINT "ContactGroupState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "JumpActionEvent" ADD CONSTRAINT "JumpActionEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "MixBroadcastSchedule" ADD CONSTRAINT "MixBroadcastSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "MixStop" ADD CONSTRAINT "MixStop_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE;
COMMIT;
