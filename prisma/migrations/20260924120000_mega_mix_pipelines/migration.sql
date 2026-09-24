-- Named Mega-Mixes: a workspace's Mixes grouped into pipelines that are shown, numbered,
-- exported and shared together. A Mix belongs to one Mega-Mix at most.
CREATE TABLE "MegaMixPipeline" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "origin" TEXT,
    "originFingerprint" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MegaMixPipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MegaMixPipelineMix" (
    "mixId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "MegaMixPipelineMix_pkey" PRIMARY KEY ("mixId")
);

CREATE INDEX "MegaMixPipeline_workspaceId_updatedAt_idx" ON "MegaMixPipeline"("workspaceId", "updatedAt");
CREATE UNIQUE INDEX "MegaMixPipeline_workspaceId_name_key" ON "MegaMixPipeline"("workspaceId", "name");
CREATE INDEX "MegaMixPipelineMix_pipelineId_position_idx" ON "MegaMixPipelineMix"("pipelineId", "position");

ALTER TABLE "MegaMixPipeline" ADD CONSTRAINT "MegaMixPipeline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MegaMixPipelineMix" ADD CONSTRAINT "MegaMixPipelineMix_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "MegaMixPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MegaMixPipelineMix" ADD CONSTRAINT "MegaMixPipelineMix_mixId_fkey" FOREIGN KEY ("mixId") REFERENCES "Mix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every installed mega-mix becomes a named Mega-Mix holding the Mixes it created that still exist.
INSERT INTO "MegaMixPipeline" ("id", "workspaceId", "name", "origin", "createdAt", "updatedAt")
SELECT i."id", i."workspaceId",
  CASE i."blueprintId" WHEN 'contractor' THEN 'Contractor' WHEN 'real-estate' THEN 'Real estate' WHEN 'consultant' THEN 'Consultant'
    WHEN 'photographer' THEN 'Photographer' WHEN 'recruiter' THEN 'Recruiter' ELSE initcap(replace(i."blueprintId", '-', ' ')) END,
  'BLUEPRINT:' || i."blueprintId", i."createdAt", i."createdAt"
FROM "MegaMixInstallation" i
ON CONFLICT DO NOTHING;

INSERT INTO "MegaMixPipelineMix" ("mixId", "pipelineId", "position")
SELECT m."id", p."id", (row_number() OVER (PARTITION BY p."id" ORDER BY m."createdAt", m."id"))::INTEGER
FROM "MegaMixPipeline" p
JOIN "MegaMixInstallation" i ON i."id" = p."id"
CROSS JOIN LATERAL jsonb_each_text(i."mixIds") AS entry(key, value)
JOIN "Mix" m ON m."id" = entry.value AND m."workspaceId" = i."workspaceId"
ON CONFLICT DO NOTHING;
