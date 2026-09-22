CREATE TABLE "MegaMixInstallation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "blueprintId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "mixIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MegaMixInstallation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MegaMixInstallation_workspaceId_blueprintId_key" ON "MegaMixInstallation"("workspaceId", "blueprintId");
ALTER TABLE "MegaMixInstallation" ADD CONSTRAINT "MegaMixInstallation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
