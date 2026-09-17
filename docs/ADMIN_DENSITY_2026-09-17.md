# Admin layout and density revision — September 17, 2026

The September 16 release improved workflow behavior but left too much space and explanatory copy ahead of the work. This revision addresses that visual gap. The [original page-by-page audit](ADMIN_UX_AUDIT_2026-09-16.md) and release records remain intact.

## Acceptance criteria

At a 1366 × 768 desktop viewport, the title, main status, relevant controls and initial useful records should be visible without scrolling. Reports must show their headline and primary domain metrics; Admission and Library options must expose their save controls. Long queues use compact rows and keyboard-accessible scrolling within the results area, with pagination outside it. Detail forms show the record beside its actions. Mobile layouts prioritize content, retain usable touch controls and must not cause horizontal page overflow. Longer records, expanded diagnostics and narrow screens can still require scrolling.

## Scope

- Shared staff header, navigation, tabs, cards, form spacing and queue rows.
- Overview: concise status notes and actions; compact summary strip.
- Customers and invitations: short headers, common filters first, record details beside actions.
- Support: compact ticket rows, concise activity age, secondary filters on demand, conversation and reply side by side on wide screens, latest message visible on opening, assignment and customer-view controls in disclosures.
- Waitlist: eligibility and capacity status, selection/review controls before the results, bounded desktop queue, separate schedule details.
- Content: compact library results, secondary filters, parallel draft/beat editing, persistent desktop save bar, shorter wording editor and version sections.
- Reports: compact date controls, first-screen metrics and trend, separate detail tables and definitions. Denominators, observation times and current-versus-saved limits remain explicit.
- Operations and email: compact metrics and diagnostics, aligned allowance/health panels, focused recovery and suppression review.
- Team, audit, options and MFA: concise copy, compact staff disclosures, bounded option/audit lists and shorter security guidance.

Copy changes are grounded in current behavior. The supplied copy references informed clarity and removal of redundant lines; no fictional customer profiles or marketing claims were used to justify admin behavior. Sending, access, publication, concurrency, passwords and MFA safeguards remain enforced. Admission uses “Not paused” separately from available capacity, so zero capacity cannot be mistaken for an open invitation flow.

## Verification

The local production build, TypeScript validation and schema/syntax/import checks passed. All 51 selected desktop browser workflows passed across the initial run and corrected rerun. Four stale test interactions were updated for shorter labels, live filtering and disclosure controls; behavioral assertions remain. A new browser regression verifies first-screen report metrics, admission controls, option saves and email allowance at 1366 × 768. It also checks that tabbing through the library editor keeps fields visible above its sticky save bar.

[Measurements](admin-density-2026-09-17/measurements.json) cover 38 page/view states at 1366 × 768 and 390 × 844. Every route returned 200 with no horizontal page overflow. These local measurements exclude the private test banner; the live release check includes it and separately verifies that all primary report metrics fit in the viewport. The fixture includes 103 support tickets, library content, waitlist entries, saved reports, delivery review and suppression records.

| View | Before: document height | After: document height | First-screen result |
| --- | ---: | ---: | --- |
| Overview | 1,060 px | 768 px | Summary, attention queue and quick actions visible |
| Support | 5,450 px | 834 px | Five complete tickets; first row starts at 402 px instead of 663 px |
| Ticket | 2,537 px | 964 px | Conversation, reply buttons, triage and status actions visible |
| Waitlist | 1,819 px | 932 px | Capacity, search, selection and review controls before the queue |
| Library | 3,463 px | 864 px | Compact rows; filters and creation action visible |
| Invitation wording | 1,596 px | 861 px | Content fields and draft save visible |
| Reports | 3,212 px | 1,049 px | All 13 headline/growth metrics visible; last value ends at 727 px |
| Admission | 2,543 px | 814 px | Readiness and form together; save ends at 753 px |
| Library options | 2,120 px | 773 px | Both save buttons end at 712 px |

Document-height reductions include bounded lists and collapsed secondary sections. They do not mean records were removed or that all content fits in one screen. Extra scrolling remains for long messages, multiple beats, expanded diagnostics, validation notices, zoom and mobile forms. These are synthetic fixture observations, not measured improvements in administrator task time.

Visual comparisons: [Support before](admin-density-2026-09-17/before-support.png) / [after](admin-density-2026-09-17/desktop-final-support.png), [Reports before](admin-density-2026-09-17/before-reports.png) / [after](admin-density-2026-09-17/desktop-final-reports.png), [Admission before](admin-density-2026-09-17/before-admission.png) / [after](admin-density-2026-09-17/desktop-final-admission.png). Mobile: [Overview](admin-density-2026-09-17/mobile-overview.png), [Support](admin-density-2026-09-17/mobile-support.png).

The mobile workflow suite passed 49 tests; two desktop-specific viewport checks were skipped as intended. The [accessibility sweep](admin-density-2026-09-17/accessibility.json) checked all 38 views in light desktop and dark 320 px layouts, with zero automated WCAG-tagged violations. Support and option lists can be scrolled and exited with the keyboard. A manual focus check caught the sticky save bar covering editor inputs; the corrected layout passed its new regression and the six affected light/dark view checks. No browser JavaScript errors were recorded in those sweeps. Automated scans are not a complete accessibility certification.

A [nine-message conversation](admin-density-2026-09-17/conversation.png) also passed [four light/dark desktop/320 px checks](admin-density-2026-09-17/conversation.json). The thread opens at the latest message; desktop reply buttons end at 602 px, and triage/status controls fit above the fold. The desktop/mobile reply regression covers opening the latest message, retaining the draft through triage, returning to the latest message, and revealing the newly saved reply.

## Release validation

The isolated release-test fixture now handles cancellation during its initial snapshot. Previously, a signal arriving after “ready” but before the command listener existed could leave cleanup waiting indefinitely. The strengthened cancellation regression reproduced the 90-second timeout before the fix and passed afterward. All seven fixture lifecycle tests then passed locally; no application workflow or permission check was bypassed.

The full CI browser run also exposed a heading selector that matched both the shortened “Support” page title and a support-ticket title. The security journey now targets the exact level-one heading and opens the customer-view disclosure explicitly. Its local rerun passed enrollment, recovery-code verification, view-only mutation rejection and return to the queue.

Operational-alert assertions now use the shorter status messages while retaining database-state, stale-data, permission and health-endpoint checks. All eight desktop/mobile alert checks and all 12 remaining staff, customer-access, email and waitlist checks passed in a fresh local database, which was removed afterward. A scan of browser assertions found no remaining references to removed copy.

All six release checks passed on the final head, including [full repository CI](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/35246447860), security checks, and production/backup/monitor images. CI covered migrations, unit/integration tests, the production build, recovery and load rehearsals, browser journeys, and Lighthouse budgets. It recorded 1,259 unit/integration passes (9 skips), and 228 + 57 + 12 browser passes; the main browser run also skipped 186 opt-in or project-specific cases.

[PR #81](https://github.com/kaywhy331/jump-in-the-mix/pull/81) is merged into the existing integrated `fix/invitation-admission-authorization` branch. The revision is published to [the stable test admin](https://jump-in-the-mix-test.netlify.app/admin).

- Checked head: `b316ee3bf7bcf81199b9e747e82cbd68f39a5766`; application merge: `e1ec120d93cbb198d1786d35e0fb29658e97813b`.
- Dedicated site: `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`; published deploy: `6aac226885ac27ab196bd257`; publication recorded at 2026-09-17T17:25:32.319Z.
- Rollback deployment: `6aab1cebfdb7da946d82c417` on this same site.
- Live verification used password sign-in and MFA with a temporary synthetic admin, checked 29 page states at 1366 × 768 and 390 × 844, and confirmed all 13 primary growth-report metrics fit above the desktop fold. The synthetic account and its credentials/sessions were removed. The smoke sent no customer messages or invitations.
- All 15 checked CSS/JavaScript assets matched the prepared release build byte for byte. No failed browser assets were recorded.
- Readiness, recovery-boundary and final worker health passed. A heartbeat followed publication; 4 distinct heartbeats stayed within the 180-second freshness threshold across 5 later samples without application traffic.

The first publication failed its live asset check because a prebuilt deploy used the configured `.next` directory instead of Netlify’s generated static output. The previous test deployment was restored and the failed deploy removed. The same verified build was then published with `netlify deploy --no-build --dir .netlify/static --prod --site 8fd20ccd-5c35-47e5-99ce-98e5670d52fe`. The final password/MFA, route and asset checks passed.

No schema migration or database-history rewrite was needed. All 60 required migrations matched. The documented historical trailing newline for `20260906010000_customer_journey_intake_calendar` was restored only in the isolated staging build before generating its manifest; committed SQL was unchanged. See [the existing staging exception](HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md).

If rollback is needed, verify the dedicated test-site identity and current deployment, restore `6aab1cebfdb7da946d82c417`, and repeat readiness, asset and worker checks. Preserve the database schema and history. This receipt follows publication and changes documentation only.
