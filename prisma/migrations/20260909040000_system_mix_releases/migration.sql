CREATE TABLE "SystemMixConfig" (
  "id" TEXT PRIMARY KEY DEFAULT 'referral' CHECK (id = 'referral'),
  "publishedVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("publishedVersion" > 0),
  "draftVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("draftVersion" > 0),
  "controlRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("controlRevision" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "SystemMixRevision" (
  "id" TEXT PRIMARY KEY, "systemMixId" TEXT NOT NULL DEFAULT 'referral',
  "version" INTEGER NOT NULL CHECK (version > 0), "subject" TEXT NOT NULL, "body" TEXT NOT NULL,
  "actorUserId" TEXT, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("systemMixId") REFERENCES "SystemMixConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SystemMixRevision_systemMixId_version_key" ON "SystemMixRevision"("systemMixId", "version");
CREATE TABLE "SystemMixRelease" (
  "id" TEXT PRIMARY KEY, "systemMixId" TEXT NOT NULL DEFAULT 'referral',
  "version" INTEGER NOT NULL CHECK (version > 0), "action" TEXT NOT NULL CHECK (action IN ('PUBLISH', 'ROLLBACK')),
  "controlRevision" INTEGER NOT NULL CHECK ("controlRevision" >= 0), "actorUserId" TEXT, "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("systemMixId") REFERENCES "SystemMixConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SystemMixRelease_systemMixId_controlRevision_key" ON "SystemMixRelease"("systemMixId", "controlRevision");
CREATE INDEX "SystemMixRelease_systemMixId_version_idx" ON "SystemMixRelease"("systemMixId", "version");
INSERT INTO "SystemMixConfig" (id, "updatedAt") VALUES ('referral', CURRENT_TIMESTAMP);
INSERT INTO "SystemMixRevision" (id, version, subject, body, reason) VALUES (
  'system-mix-baseline', 1, '{{Sender Name}} invited you to Jump in the Mix',
  $intro$Hi {{Contact Name}},

I’m using Jump in the Mix to stay in touch with the people in my circle. It’s free and invitation-only, and I’d like to share one of my five personal invitations with you.

{{Sender Name}}$intro$,
  'Migration baseline of existing application wording; no new review inferred.'
);
INSERT INTO "SystemMixRelease" (id, version, action, "controlRevision", reason)
  VALUES ('system-mix-baseline', 1, 'PUBLISH', 0, 'Migration record of existing application wording.');
CREATE TRIGGER immutable_system_mix_revision BEFORE UPDATE OR DELETE ON "SystemMixRevision"
  FOR EACH ROW EXECUTE FUNCTION reject_library_history_rewrite();
CREATE TRIGGER immutable_system_mix_release BEFORE UPDATE OR DELETE ON "SystemMixRelease"
  FOR EACH ROW EXECUTE FUNCTION reject_library_history_rewrite();
-- Historical frozen messages remain unchanged; their release version is unknown.
ALTER TABLE "ReferralAccessInvite" ADD COLUMN "systemMixVersion" INTEGER CHECK ("systemMixVersion" IS NULL OR "systemMixVersion" > 0);
