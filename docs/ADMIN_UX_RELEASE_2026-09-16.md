# Admin UI and workflow release — September 16, 2026

All implementation items A01–A26 and X01–X05 from the [admin audit checklist](ADMIN_UX_IMPLEMENTATION_2026-09-16.md) are deployed to the stable test site: [open administration](https://jump-in-the-mix-test.netlify.app/admin). This records verified implementation and deployment; staff task-time improvements have not been measured.

## Release identity

- [PR #80](https://github.com/kaywhy331/jump-in-the-mix/pull/80), merged into the existing integrated `fix/invitation-admission-authorization` branch.
- Checked head: `dbf0c6ddf807df37bf2239e35cdd33344bcec878`; application merge: `55a391496757e277aa586d2f00fdb413b3dbac92`.
- Site: `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`; published deploy: `6aab1cebfdb7da946d82c417`.
- Published at: 2026-09-16T22:50:51.836Z. Previous published deploy for rollback: `6aa99626d303505e51d13d2d`.
- This documentation receipt follows the application deployment and does not change the deployed application.

## Verification

- [Full repository CI](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/35155490864) passed on the final head: 1,259 unit/integration tests and 296 browser checks, plus performance and image gates. CI recorded nine conditional service-test skips; the admin fixture suites ran separately from the general browser suite. Security checks and production, backup and monitor image builds passed.
- Local production build, TypeScript, schema/syntax/import/Server Action checks passed. The six new workflow regressions passed on desktop and mobile, including temporary session-check failure/retry, isolation between staff sessions, MFA return, reply-and-resolve, concurrent settings changes, and bounded export polling.
- [Synthetic local evidence](admin-ux-implementation-2026-09-16/verification.json) covers 38 route and interaction checks, with additional role and sensitive-action browser journeys. Narrow layouts and dark-theme accessibility checks passed in the tested states.
- Live verification used real password sign-in and MFA with a temporary synthetic admin, then checked 29 admin route states at desktop and 390 px widths. The account and its sessions/MFA credentials were removed afterward. No customer messages or invitations were sent by this smoke.
- All 15 checked deployed CSS/JavaScript assets matched the isolated release build byte for byte; no failed browser assets were recorded.
- Readiness and recovery-boundary checks passed. A worker heartbeat followed publication, and 4 distinct heartbeats were observed over 5 later samples while the smoke made no application requests. Each sample stayed within the configured 180-second freshness threshold.
- Production dependency audit passed its high/critical gate. One existing moderate `baseline-browser-mapping` advisory remains documented in the implementation checklist.

## Database and rollback

No schema migration or database-history rewrite was needed. The release verifier matched all 60 required migrations. The documented staging-only historical newline for `20260906010000_customer_journey_intake_calendar` was restored only in the isolated staging build copy before generating its manifest; committed SQL was unchanged. See [the existing migration exception](HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md).

If application rollback is required, first verify the dedicated test-site identity and current published deploy, then restore `6aa99626d303505e51d13d2d` on this same site and recheck readiness, browser assets and worker health. Keep the database schema and history intact. The customer site is a separate release destination.
