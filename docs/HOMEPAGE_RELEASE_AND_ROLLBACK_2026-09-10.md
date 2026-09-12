# Homepage release and rollback

September 10, 2026

## Deployment destinations

Testing and staging use the stable URL https://jump-in-the-mix-test.netlify.app/ (site ID `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`). Publish to that test site's primary URL using its explicit site ID. An unpublished preview is an intermediate artifact, not the testing handoff. The customer site is https://jumpinthemix.com/; the local Netlify link may point to that separate site.

The September 10 staging database contains migration `20260906010000_customer_journey_intake_calendar` with one extra trailing newline relative to the current working tree. Its stored SHA-256 is `bd95076c17c8b59373808e7cf4f5413661413980fdfc22c59b6ef09963669484`; the current working-tree file is `2a477774ca7621ede25bc11072596ef8160217212326175d32ed569acc348d2c`. These differ only in that trailing newline. Staging builds must restore the historically applied bytes in an isolated build copy before generating the release manifest. Do not rewrite successful migration history or change customer-release checksums to accommodate staging. The isolated September 10 artifact passes the live database release verifier: 49 required, zero missing, zero mismatched.

## Release order

1. Back up the target database and verify that its recovery catalog is clear.
2. Apply `20260910120000_marketing_scenario_continuity` before serving the revised application. The migration is additive: two nullable fields on waitlist entries, two nullable fields on access invitations, and one optional workspace preference table.
3. Deploy a preview, then verify `/`, all five `/for/...` routes, an unknown profession 404, `/waitlist`, `/privacy`, and `/login`. Do not submit real customer data from the preview.
4. Run a controlled waitlist-to-onboarding journey against an isolated or designated test database and captured mail. Confirm scenario continuity, generic public receipts, one-use tokens, starter use/change/skip, and the Today “Not yet” outcome.
5. Promote the exact qualified artifact. Recheck indexing policy, access policy, privacy copy, health checks, and the six landing routes.

## Rollback

September 11 staging publication: `6aa4abe3b05d02176f9629c1` at https://jump-in-the-mix-test.netlify.app/ (commit `594a1bb`: FAQ page, five-per-row professions, accessible date picker, appointment buffers). Prior published artifact: `6aa4216f983dd200b31fe98b`. Before this publication the test database applied `20260911090000_appointment_buffer` with the site's own `DATABASE_URL`, which on the test topology is the Neon owner role; no backup was taken because `pg_dump` is not installed on the deploying machine and the migration is additive. The release check reported 50 required migrations, none missing, none mismatched. Live verification covered every landing route, `/faq`, `/login`, `/waitlist`, readiness, an unknown-profession 404, all 13 referenced assets, the open-beat styling, the picker at phone width and the FAQ answers.

September 10 staging publication: `6aa32e1fbb7c5f721697143e` at https://jump-in-the-mix-test.netlify.app/. Prior stable staging artifact: `6a9f4700d38bd2b08e552efa`. These IDs belong to the test site only. After any rollback, verify readiness; the older staging artifact's migration checksum may predate the historical-byte restoration documented above.

Roll back the application artifact to the prior deploy while leaving the additive migration in place. Older code ignores the nullable scenario fields and optional table, so this restores the prior public experience without deleting waitlist, invitation, or workspace data.

Do not drop the new columns or table during an incident rollback. Remove them only in a separately reviewed cleanup after verifying that no retained scenario preference is needed. The current release has no new video or analytics collector to disable; the CSS scene compositions and local browser event adapter disappear with the application rollback.

## Release boundaries

- Public sandbox drafts and fictional contacts remain client memory only.
- The durable preference contains only an allowlisted scenario identifier and version.
- A request receipt, provider acceptance, confirmation, invitation, account creation, handoff request, user-recorded send, provider delivery, and reply remain distinct states.
- Production promotion requires a migrated database. A static or application-only preview does not qualify the database journey.
