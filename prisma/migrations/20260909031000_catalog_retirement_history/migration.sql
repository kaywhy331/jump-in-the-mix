-- Move the old seed-time retirement to a one-time, recorded transition. Future
-- setup runs must respect a subsequent authorized administrator publication.
WITH retired AS (
  UPDATE "SharedMix" SET status = 'UNPUBLISHED', "updatedAt" = CURRENT_TIMESTAMP
    WHERE id IN ('shared_new_lead', 'shared_referral', 'shared_client_onboarding', 'shared_renewal_checkin')
      AND status = 'APPROVED' RETURNING id
), changed AS (
  UPDATE "SharedMixMetadata" m SET "controlRevision" = m."controlRevision" + 1,
    "publishedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    FROM retired r WHERE m."sharedMixId" = r.id
    RETURNING m."sharedMixId", m.version, m."controlRevision"
)
INSERT INTO "SharedMixRelease" (id, "sharedMixId", version, action, "controlRevision", reason)
  SELECT 'retired-' || md5("sharedMixId"), "sharedMixId", version, 'UNPUBLISH', "controlRevision",
    'One-time retirement of the legacy consulting catalog previously handled by setup.' FROM changed;
