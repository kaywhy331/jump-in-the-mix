# Production design release — September 19, 2026

The supplied redesign is live at https://jumpinthemix.com/. The owner explicitly requested the live customer site. Both Render services run the same release. No Netlify deployment was published during this release.

| Item | Verified value |
| --- | --- |
| Release commit | `2c029bccdb4704c24bb2d66c138687f6624398bb` |
| Release branch | `release/design-adoption-20260919` |
| Previous production commit | `a0bf38bb116de342e33290d4f75abe80f2c7359c` |
| Web deploy | `dep-dancg7bbc2fs73dumil0` |
| Web live at | `2026-09-19T17:39:46.123987Z` |
| Worker deploy | `dep-dancedrtqb8s73befm70` |
| Worker live at | `2026-09-19T17:33:54.653198Z` |

The isolated release was based on the existing live revision and matched the tested workspace. Production schema, migration bytes and dependencies are unchanged. No migration or infrastructure change was required. The original working tree was preserved, and Render automatic deployments remain off.

## Hosted verification

- Both provider builds and the web pre-deployment checks passed. The worker processed one scoped no-op test job, which was removed without creating a follow-up or delivery.
- All four health routes returned 200. Public pages returned 200, and protected pages redirected unauthenticated requests to login.
- The deployed source matched 655 recorded files. All 19 checked CSS, JavaScript and font assets matched the actual server build. All 61 migrations matched, with no missing or mismatched migration.
- Nine public browser checks passed: homepage/demo at 320px, 390px and 1440px in light/dark appearances, plus five profession pages. Explicit appearance overrides survived reload and returned to System mode. The demo sent no POST requests and recorded no automated accessibility violations or browser errors.
- A temporary synthetic account passed actual production password sign-in and onboarding, persisted all three purposes, and prepared one follow-up. The invitation form remained usable on mobile.
- Sixteen authenticated design checks passed across Today, Contacts, Journey, Mixes, Calendar, preferences, More and Help at desktop/light and mobile/dark sizes. These checks found no horizontal overflow, automated WCAG A/AA violations or browser errors. Journey displayed four real stages and the synthetic person's membership.
- The temporary account, workspace, contact and follow-up were removed. Final checks found no remaining release-test users, workspaces or jobs. The six recorded baseline table counts were unchanged.

Earlier checks during the rollout reached the retiring instance; verification was repeated against the new revision. Browser checks were updated to wait for hydration and follow the current onboarding disclosure and required plan-review checkbox. The final checks passed without a follow-up application change.

These checks do not establish physical-device acceptance or measured customer outcomes. The browser-local appearance, existing-Mix touchpoints and unresolved inactivity-trigger assumptions remain documented in [the implementation report](DESIGN_ADOPTION_2026-09-19.md).

## Evidence and rollback

Evidence is retained in ignored `.artifacts/design-deployment-20260919/`: `release.json`, `postflight.json`, `worker-smoke.json`, `live-browser.json`, `authenticated-smoke.json`, `final-verification.json`, screenshots and source hashes. Private credentials and account identifiers are not release assets.

The application rollback target is `a0bf38bb116de342e33290d4f75abe80f2c7359c` for both Render services; it uses the same database schema. No rollback was needed.
