# Admin layout and density revision — September 17, 2026

The September 16 release improved workflow behavior but left too much space and explanatory copy ahead of the work. This revision addresses that visual gap. The [original page-by-page audit](ADMIN_UX_AUDIT_2026-09-16.md) and release records remain intact.

## Acceptance criteria

At a 1366 × 768 desktop viewport, the title, main status, relevant controls and initial useful records should be visible without scrolling. Reports must show their headline and primary domain metrics; Admission and Library options must expose their save controls. Long queues use compact rows and keyboard-accessible scrolling within the results area, with pagination outside it. Detail forms show the record beside its actions. Mobile layouts prioritize content, retain usable touch controls and must not cause horizontal page overflow. Longer records, expanded diagnostics and narrow screens can still require scrolling.

## Scope

- Shared staff header, navigation, tabs, cards, form spacing and queue rows.
- Overview: concise status notes and actions; compact summary strip.
- Customers and invitations: short headers, common filters first, record details beside actions.
- Support: compact ticket rows, concise activity age, secondary filters on demand, reply and triage together, assignment and customer-view controls in disclosures.
- Waitlist: eligibility and capacity status, selection/review controls before the results, bounded desktop queue, separate schedule details.
- Content: compact library results, secondary filters, parallel draft/beat editing, persistent desktop save bar, shorter wording editor and version sections.
- Reports: compact date controls, first-screen metrics and trend, separate detail tables and definitions. Denominators, observation times and current-versus-saved limits remain explicit.
- Operations and email: compact metrics and diagnostics, aligned allowance/health panels, focused recovery and suppression review.
- Team, audit, options and MFA: concise copy, compact staff disclosures, bounded option/audit lists and shorter security guidance.

Copy changes are grounded in current behavior. The supplied copy references informed clarity and removal of redundant lines; no fictional customer profiles or marketing claims were used to justify admin behavior. Sending, access, publication, concurrency, passwords and MFA safeguards remain enforced. Admission uses “Not paused” separately from available capacity, so zero capacity cannot be mistaken for an open invitation flow.

## Verification

The local production build, TypeScript validation and schema/syntax/import checks passed. All 51 selected desktop browser workflows passed across the initial run and corrected rerun. Four stale test interactions were updated for shorter labels, live filtering and disclosure controls; behavioral assertions remain. A new browser regression verifies first-screen report metrics, admission controls, option saves and email allowance at 1366 × 768. It also checks that tabbing through the library editor keeps fields visible above its sticky save bar.

[Measurements](admin-density-2026-09-17/measurements.json) cover 38 page/view states at 1366 × 768 and 390 × 844. Every route returned 200 with no horizontal page overflow. The fixture includes 103 support tickets, library content, waitlist entries, saved reports, delivery review and suppression records.

| View | Before: document height | After: document height | First-screen result |
| --- | ---: | ---: | --- |
| Overview | 1,060 px | 768 px | Summary, attention queue and quick actions visible |
| Support | 5,450 px | 834 px | Five complete tickets; first row starts at 402 px instead of 663 px |
| Ticket | 2,537 px | 892 px | Conversation, reply buttons, triage and status actions visible |
| Waitlist | 1,819 px | 932 px | Capacity, search, selection and review controls before the queue |
| Library | 3,463 px | 864 px | Compact rows; filters and creation action visible |
| Invitation wording | 1,596 px | 861 px | Content fields and draft save visible |
| Reports | 3,212 px | 1,049 px | All 13 headline/growth metrics visible; last value ends at 727 px |
| Admission | 2,543 px | 814 px | Readiness and form together; save ends at 753 px |
| Library options | 2,120 px | 773 px | Both save buttons end at 712 px |

Document-height reductions include bounded lists and collapsed secondary sections. They do not mean records were removed or that all content fits in one screen. Extra scrolling remains for long messages, multiple beats, expanded diagnostics, validation notices, zoom and mobile forms. These are synthetic fixture observations, not measured improvements in administrator task time.

Visual comparisons: [Support before](admin-density-2026-09-17/before-support.png) / [after](admin-density-2026-09-17/desktop-final-support.png), [Reports before](admin-density-2026-09-17/before-reports.png) / [after](admin-density-2026-09-17/desktop-final-reports.png), [Admission before](admin-density-2026-09-17/before-admission.png) / [after](admin-density-2026-09-17/desktop-final-admission.png). Mobile: [Overview](admin-density-2026-09-17/mobile-overview.png), [Support](admin-density-2026-09-17/mobile-support.png).

The mobile workflow suite passed 49 tests; two desktop-specific viewport checks were skipped as intended. The [accessibility sweep](admin-density-2026-09-17/accessibility.json) checked all 38 views in light desktop and dark 320 px layouts, with zero automated WCAG-tagged violations. Support and option lists can be scrolled and exited with the keyboard. A manual focus check caught the sticky save bar covering editor inputs; the corrected layout passed its new regression and the six affected light/dark view checks. No browser JavaScript errors were recorded in those sweeps. Automated scans are not a complete accessibility certification.

## Release validation

The isolated release-test fixture now handles cancellation during its initial snapshot. Previously, a signal arriving after “ready” but before the command listener existed could leave cleanup waiting indefinitely. The strengthened cancellation regression reproduced the 90-second timeout before the fix and passed afterward. All seven fixture lifecycle tests then passed locally; no application workflow or permission check was bypassed.

Repository CI and test-site publication are pending. Their results and deployment identity will be recorded before handoff.
