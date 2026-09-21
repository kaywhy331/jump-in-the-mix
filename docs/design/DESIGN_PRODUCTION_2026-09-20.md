# Production design detail release — September 20, 2026

The [pane, popup and control refinements](DESIGN_DETAIL_REVIEW_2026-09-20.md) are live at [jumpinthemix.com](https://jumpinthemix.com/). This follows the owner's explicit request to deploy to the main site. The separate [Netlify test deployment](DESIGN_DEPLOYMENT_2026-09-20.md) is not the production destination.

| Item | Published value |
| --- | --- |
| Code revision | `7e37d73616b5e2553a8d6c4ea134b2a89ba15bee` |
| Release branch | `release/design-details-20260920` |
| Web deploy | `dep-dao3qv0ae00c73alp8kg` |
| Web live at | `2026-09-20T20:13:01.510531Z` |
| Worker deploy | `dep-dao3q5gae00c73almceg` |
| Worker live at | `2026-09-20T20:09:03.814144Z` |

The isolated release was based on the current production web revision and matches the locally reviewed application. Source schema, migration bytes, dependencies and deployment configuration are unchanged. No migration was needed. The original working tree was preserved; Render automatic deployments remain off.

## Production checks

- Production was healthy before rollout. The September 20 encrypted backup and its recovery-state bundle were recorded as stored at `10:17:34.468Z`, against the expected production database identity.
- The worker build passed. The new worker completed one scoped no-op job targeting verified nonexistent contact and Mix IDs. The job was removed; no follow-up or delivery was created.
- The web build and pre-deployment checks passed. All 61 migrations match, with zero missing or mismatched entries.
- Liveness, readiness, worker health and recovery-boundary endpoints return 200. Public documents and login return 200; protected pages redirect unauthenticated requests to login.
- Hosted verification matches all 731 source-manifest files and 20 served CSS, JavaScript and font assets to the release. The active build ID is `r6koxX_HCHsvIzjRuITwq`.
- Twelve public-page checks pass at phone/desktop widths in both themes, including appearance persistence, all three demo channel previews and phone menu dismissal. No browser exceptions, failed assets, write requests or automated WCAG A/AA violations were recorded. The Netlify stable-domain hydration warning did not reproduce on production.
- A temporary synthetic account passed real password sign-in and onboarding, saved all three purposes and prepared one follow-up. Thirty-two authenticated page checks passed across Today, Contacts, Journey, Mixes, Calendar, preferences, More and Help at 390/1920px in both themes. No horizontal overflow, browser exceptions or automated accessibility violations were recorded.
- The synthetic user, workspace, contact and follow-up were removed. Final verification found no release-test users, workspaces or jobs, and the six baseline table counts were unchanged. All four health endpoints still returned 200 after cleanup.

These checks cover the deployed release and supplement the detailed local popup and breakpoint checks. They do not establish physical-device acceptance or measured customer outcomes. The existing review-before-activation behavior and unresolved Quick Add/inactivity contracts remain as documented in the design review.

The production database is separate from the quota-exhausted Netlify test database. Hosted verification results are recorded independently; the staging outage is not a production health result.

## Evidence and rollback

Evidence is retained under ignored `.artifacts/design-production-20260920/`: release and deployment receipts, source hashes, backup record, database preflight, worker smoke, hosted verification, browser results and screenshots. Private credentials and account identifiers must not be shared.

The same-schema rollback targets are web revision `0ae2250094b25a0d570974f040641d78fbddff65` and worker revision `72c2be51b5991f3cba7f3a8c0b28c58471f917d5`, their respective versions before this release. Rollback changes application deployments, not database history.
