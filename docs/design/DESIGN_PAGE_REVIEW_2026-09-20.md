# Design page review — September 20, 2026

This pass continues the existing redesign, preserving the supplied [export](jump-in-the-mix-designs/index.html) and prior working-tree changes. The export and [design guidelines](DESIGN_GUIDELINES.md) remain the standing UI authority in `AGENTS.md`. The saved Quick Add, activation and quiet-day decisions were retrieved from the implementation records and retained.

The final local build is `E5xBAv-7dqHQIQZc0c8Zt`. Open the [reference/current comparison and route gallery](../../.artifacts/design-page-review-20260920/index.html) for the screenshots. The gallery contains fictional local fixtures; it does not include private environment or session files.

## Changes in this pass

- **Journey selection:** the map previously took the first six touchpoints, and the page truncated that list further when quiet-day suggestions were enabled. Selecting a later Mix opened its roster without showing its node. The bounded map now always includes the selected Mix and the enabled quiet-day node. The complete touchpoint list remains available.
- **Journey node spacing:** upper and lower touchpoint rows now distribute their nodes independently and center a single node. This removes asymmetric sparse rows and prevents lower nodes from sharing a position. Stage movements and real contact counts retain their existing meaning.
- **Journey desktop workspace:** the page now uses the 1672px maximum shared by the supplied multi-column workspaces, removing the extra centered margins that narrowed the map and roster at 1920px. The phone/tablet structures remain responsive.
- **Quiet-day typography:** names use Instrument Sans and the directory-row hierarchy. Newsreader remains for personal wording, messages and notes.
- **Continuing guidance:** the selected-node, row-spacing, width and typography rules are recorded in `DESIGN_GUIDELINES.md` so later UI changes retain them.

The existing homepage and five profession pages, theme controls, Today review/Undo, Contacts directory/profile, Mix editor, Calendar agenda/editor, Quick Add and secondary-page components were exercised with this build. This pass does not claim to have newly authored those earlier implementations.

## Verification

| Check | Result |
| --- | --- |
| Optimized production build | Passed, including Next.js TypeScript checks. |
| Explicit TypeScript check | Passed using the isolated build's incremental cache. |
| Schema, syntax and local imports/Server Action boundaries | Passed. |
| Focused unit checks | 17 passed: Journey layout and timing, contact sequence matching, and demo behavior. |
| Browser workflows | 39 distinct checks passed across the main run and focused follow-up. |
| All-page route scan | 188 checks across 84 page templates, 93 URLs and 94 authentication states; desktop/light at 1440px and narrow-phone/dark at 320px. |
| Core workspace/editor captures | 56 checks at 390/1920px in both themes, with no reported overflow, browser exceptions or automated WCAG A/AA violations. |
| Responsive boundaries | 168 checks across Today, Mixes, Calendar and Journey in both themes, from 320px to 3840px, including navigation and pane breakpoints. |
| Additional captures | Six homepage views at 390/834/1920px, eight quiet-day views at 320/390/834/1440px, tablet/landscape Journey views and selected-touchpoint regressions. |

The route checks found no remaining unexpected server failures, page overflow, browser exceptions, automated WCAG A/AA violations or covered centers among the sampled actions. The responsive checks also verified minimum editor widths and header containment. Screenshot inspection covered the changed Journey/quiet-day views alongside Today review, Contacts, Mixes, Calendar, Quick Add, homepage and representative account/settings/help/staff pages. The gallery supports further visual review of every captured route; automated results alone do not establish visual fidelity.

The first browser run passed 28 of 29 cases. The added selected-touchpoint case used a selector that also matched the empty-state heading; correcting it produced the passing follow-up. The local runtime stopped during the final scan, and 22 staff checks returned 503. Restarting the same build and rerunning those checks passed all 22. An interrupted standalone typecheck was rerun successfully with the build cache. These initial results remain in the artifact directory, alongside the accepted results. A final two-case browser rerun also exited successfully after all its checks passed.

Evidence: `verification.json`, `coverage.json`, `routes.json`, `routes-rerun.log`, `screens.json`, `boundaries.json`, `boundaries-final.log`, `browser.log`, `browser-journey-final.log`, `browser-final.log`, `unit.log`, `build-final.log`, `typecheck-final.log`, `static.log` and the screenshots under `.artifacts/design-page-review-20260920/`.

## Design/function assumptions

The owner was asked about browser-specific versus account-synchronized themes and Monday versus Sunday Journey weeks. No answer was available during this pass, so existing behavior is retained: System/Light/Dark is browser-local; Journey weeks start Monday, with Today and Tomorrow taking precedence. These are implementation assumptions, not newly approved decisions.

General touchpoints still represent independent Mixes and their existing assignments. A separate general-purpose touchpoint type remains a product decision. Quiet-day suggestions already have their separately approved lifecycle. Map counts describe actual records; the map displays at most six touchpoints while the list exposes all of them. Stage dots and selection describe the current roster page, with full filtered counts labeled separately.

The previously approved [combined Quick Add and activation preferences](QUICK_ADD_AND_ACTIVATION_2026-09-20.md), [quiet-day rules](QUIET_DAY_TOUCHPOINTS_2026-09-20.md), and fictional three-Beat public demo contract remain in force. No sample metrics or new sending behavior were introduced.

## Release scope

This is a local implementation and verification pass; no deployment or customer database mutation was performed. The existing three pending migrations for Quick Add, activation preferences and quiet-day settings still need the release process described in their implementation records. Any staging deployment must use the explicit Netlify test site in `AGENTS.md`.

Missing/expired-token pages and redirects were checked as rendered states; this is not a new qualification of every invitation or recovery lifecycle. Browser emulation and automated accessibility scans do not establish physical-device or manual screen-reader acceptance. Existing external qualification work remains separate.

## Page inventory

Each template below was exercised at 1440px/light and 320px/dark. Dynamic templates used the URLs in `coverage.json`; public token fallbacks and intentional not-found states are distinguished in `routes.json`. Profession pages include all five supported slugs, and onboarding includes both signed-out and signed-in states.

| Page template | Result |
| --- | --- |
| `/account` | Passed in both widths/themes |
| `/account/preferences` | Passed in both widths/themes |
| `/account/tickets/[ticketId]` | Passed in both widths/themes |
| `/account/tickets` | Passed in both widths/themes |
| `/calendar` | Passed in both widths/themes |
| `/contacts/[contactId]/edit` | Passed in both widths/themes |
| `/contacts/[contactId]` | Passed in both widths/themes |
| `/contacts/archived` | Passed in both widths/themes |
| `/contacts/custom-fields` | Passed in both widths/themes |
| `/contacts/duplicates` | Passed in both widths/themes |
| `/contacts/import` | Passed in both widths/themes |
| `/contacts/new` | Passed in both widths/themes |
| `/contacts` | Passed in both widths/themes |
| `/help` | Passed in both widths/themes |
| `/journey` | Passed in both widths/themes |
| `/jumps` | Passed in both widths/themes |
| `/mixes/[mixId]/edit` | Passed in both widths/themes |
| `/mixes/new` | Passed in both widths/themes |
| `/mixes` | Passed in both widths/themes |
| `/mixes/system` | Passed in both widths/themes |
| `/more` | Passed in both widths/themes |
| `/settings/business` | Passed in both widths/themes |
| `/settings/connections` | Passed in both widths/themes |
| `/settings/journey` | Passed in both widths/themes |
| `/settings/jump-date-types` | Passed in both widths/themes |
| `/settings/notifications` | Passed in both widths/themes |
| `/settings` | Passed in both widths/themes |
| `/settings/sending` | Passed in both widths/themes |
| `/templates/[sharedMixId]/use` | Passed in both widths/themes |
| `/templates` | Passed in both widths/themes |
| `/account/admin-mfa` | Passed in both widths/themes |
| `/admin/access/[inviteId]` | Passed in both widths/themes |
| `/admin/access` | Passed in both widths/themes |
| `/admin/access-denied` | Passed in both widths/themes |
| `/admin/admission` | Passed in both widths/themes |
| `/admin/audit` | Passed in both widths/themes |
| `/admin/email` | Passed in both widths/themes |
| `/admin/email/recovery/[deliveryId]` | Passed in both widths/themes |
| `/admin/email/recovery` | Passed in both widths/themes |
| `/admin/email/suppressions/[suppressionId]` | Passed in both widths/themes |
| `/admin/email/suppressions` | Passed in both widths/themes |
| `/admin/operations/alerts` | Passed in both widths/themes |
| `/admin/operations` | Passed in both widths/themes |
| `/admin` | Passed in both widths/themes |
| `/admin/reports/exports` | Passed in both widths/themes |
| `/admin/reports/history/[snapshotId]` | Passed in both widths/themes |
| `/admin/reports/history` | Passed in both widths/themes |
| `/admin/reports` | Passed in both widths/themes |
| `/admin/settings` | Passed in both widths/themes |
| `/admin/support/[ticketId]` | Passed in both widths/themes |
| `/admin/support` | Passed in both widths/themes |
| `/admin/system-mix` | Passed in both widths/themes |
| `/admin/team` | Passed in both widths/themes |
| `/admin/templates/[sharedMixId]/edit` | Passed in both widths/themes |
| `/admin/templates/new` | Passed in both widths/themes |
| `/admin/templates` | Passed in both widths/themes |
| `/admin/users/[userId]` | Passed in both widths/themes |
| `/admin/users` | Passed in both widths/themes |
| `/admin/waitlist` | Passed in both widths/themes |
| `/account/deleted` | Passed in both widths/themes |
| `/contact` | Passed in both widths/themes |
| `/faq` | Passed in both widths/themes |
| `/features/follow-up-reminders` | Passed in both widths/themes |
| `/follow-up-templates/estimate-follow-up` | Passed in both widths/themes |
| `/follow-up-templates` | Passed in both widths/themes |
| `/follow-up-templates/proposal-follow-up` | Passed in both widths/themes |
| `/for/[profession]` | Passed in both widths/themes |
| `/forgot-password` | Passed in both widths/themes |
| `/lead/[connectionId]` | Passed in both widths/themes |
| `/login` | Passed in both widths/themes |
| `/offline` | Passed in both widths/themes |
| `/onboarding` | Passed in both widths/themes |
| `/` | Passed in both widths/themes |
| `/privacy` | Passed in both widths/themes |
| `/register` | Passed in both widths/themes |
| `/reset-password` | Passed in both widths/themes |
| `/review/[token]` | Passed in both widths/themes |
| `/signed-out` | Passed in both widths/themes |
| `/staff/accept` | Passed in both widths/themes |
| `/terms` | Passed in both widths/themes |
| `/verify-email/pending` | Passed in both widths/themes |
| `/waitlist/confirm` | Passed in both widths/themes |
| `/waitlist/leave` | Passed in both widths/themes |
| `/waitlist` | Passed in both widths/themes |
