-- Release B (2026-09-25). Additive only: the previous release's code never reads these columns.

-- The country for phone numbers saved without a country code (ISO 3166-1 alpha-2). North America by default.
ALTER TABLE "WorkspacePreference" ADD COLUMN "phoneRegion" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "WorkspacePreference" ADD CONSTRAINT "WorkspacePreference_phoneRegion_check" CHECK ("phoneRegion" ~ '^[A-Z]{2}$');

-- A Google or Apple sign-in started from an invitation carries it through the provider round trip.
ALTER TABLE "AuthOAuthState" ADD COLUMN "inviteTokenHash" TEXT, ADD COLUMN "inviteId" TEXT;

-- After staff uphold a report, the author can ask for another review; the staff reply lives on the listing.
ALTER TABLE "MarketplaceListing"
  ADD COLUMN "reviewRequestedAt" TIMESTAMP(3),
  ADD COLUMN "reviewRequestNote" TEXT,
  ADD COLUMN "reviewedFingerprint" TEXT,
  ADD COLUMN "reviewResponseNote" TEXT,
  ADD COLUMN "reviewRespondedAt" TIMESTAMP(3),
  ADD COLUMN "reviewResponseSeenAt" TIMESTAMP(3);
