CREATE TABLE "MixWorkflow" (
  "workspaceId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "configuration" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MixWorkflow_pkey" PRIMARY KEY ("workspaceId"),
  CONSTRAINT "MixWorkflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "MixWorkflowInstance" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "admissionKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "definition" JSONB NOT NULL,
  "state" JSONB NOT NULL,
  "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MixWorkflowInstance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MixWorkflowInstance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MixWorkflowInstance_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MixWorkflowInstance_workspaceId_admissionKey_key" ON "MixWorkflowInstance"("workspaceId", "admissionKey");
CREATE INDEX "MixWorkflowInstance_workspaceId_contactId_status_idx" ON "MixWorkflowInstance"("workspaceId", "contactId", "status");
CREATE INDEX "MixWorkflowInstance_status_nextCheckAt_idx" ON "MixWorkflowInstance"("status", "nextCheckAt");
ALTER TABLE "Jump" ADD COLUMN "workflowInstanceId" TEXT,
  ADD COLUMN "workflowVisitId" TEXT,
  ADD COLUMN "workflowManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Jump" ADD CONSTRAINT "Jump_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "MixWorkflowInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Jump_workflowInstanceId_workflowVisitId_idx" ON "Jump"("workflowInstanceId", "workflowVisitId");
