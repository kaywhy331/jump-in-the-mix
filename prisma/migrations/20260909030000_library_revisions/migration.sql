ALTER TABLE "SharedMixMetadata" ADD COLUMN "draftVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "controlRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "SharedMixRevision" (
  "id" TEXT PRIMARY KEY, "sharedMixId" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "snapshot" JSONB NOT NULL, "actorUserId" TEXT, "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("sharedMixId") REFERENCES "SharedMix"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SharedMixRevision_sharedMixId_version_key" ON "SharedMixRevision"("sharedMixId", "version");
CREATE TABLE "SharedMixRelease" (
  "id" TEXT PRIMARY KEY, "sharedMixId" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "action" TEXT NOT NULL CHECK ("action" IN ('PUBLISH', 'ROLLBACK', 'UNPUBLISH')),
  "controlRevision" INTEGER NOT NULL, "actorUserId" TEXT, "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("sharedMixId") REFERENCES "SharedMix"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SharedMixRelease_sharedMixId_controlRevision_key" ON "SharedMixRelease"("sharedMixId", "controlRevision");
CREATE INDEX "SharedMixRelease_sharedMixId_version_idx" ON "SharedMixRelease"("sharedMixId", "version");
INSERT INTO "SharedMixMetadata" ("sharedMixId", "updatedAt")
  SELECT id, CURRENT_TIMESTAMP FROM "SharedMix" ON CONFLICT ("sharedMixId") DO NOTHING;
UPDATE "SharedMixMetadata" SET "version" = GREATEST("version", 1), "draftVersion" = GREATEST("version", 1);
INSERT INTO "SharedMixRevision" (id, "sharedMixId", version, snapshot, reason, "createdAt")
  SELECT 'baseline-' || md5(s.id), s.id, m.version,
    jsonb_build_object('title', s.title, 'description', s.description, 'category', s.category,
      'industry', COALESCE(s.industry, 'Any business'), 'framework', s.framework, 'steps', s.steps,
      'triggerMode', m."triggerMode", 'dateTypeName', m."dateTypeName", 'dateTypeSlug', m."dateTypeSlug", 'featured', m."featuredAt" IS NOT NULL),
    'Migration snapshot of existing library content; earlier versions are unavailable.', s."updatedAt"
  FROM "SharedMix" s JOIN "SharedMixMetadata" m ON m."sharedMixId" = s.id;
INSERT INTO "SharedMixRelease" (id, "sharedMixId", version, action, "controlRevision", reason, "createdAt")
  SELECT 'baseline-' || md5(s.id), s.id, m.version, 'PUBLISH', 0,
    'Migration record of existing publication; no new review inferred.', COALESCE(m."publishedAt", s."updatedAt")
  FROM "SharedMix" s JOIN "SharedMixMetadata" m ON m."sharedMixId" = s.id WHERE s.status = 'APPROVED';
-- Content/release records cannot be rewritten. Removing the parent during an
-- explicit database maintenance operation still permits cascading cleanup.
CREATE FUNCTION reject_library_history_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Library history is immutable; create a new revision or release';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_library_revision BEFORE UPDATE OR DELETE ON "SharedMixRevision"
  FOR EACH ROW EXECUTE FUNCTION reject_library_history_rewrite();
CREATE TRIGGER immutable_library_release BEFORE UPDATE OR DELETE ON "SharedMixRelease"
  FOR EACH ROW EXECUTE FUNCTION reject_library_history_rewrite();
