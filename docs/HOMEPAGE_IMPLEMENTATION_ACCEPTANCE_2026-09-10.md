# Homepage implementation acceptance record

September 10, 2026 · Working record

This record maps the roadmap gates to reviewable evidence. “Implemented” means the product behavior exists. “Qualified” requires the listed test or observation. External human research and longitudinal cohort evaluation cannot be replaced by code assertions.

## Current staging review

Published September 10 to **https://jump-in-the-mix-test.netlify.app/**, deployment `6aa32e1fbb7c5f721697143e`. This is the user-designated stable testing/staging URL. The customer site https://jumpinthemix.com/ was not deployed in this operation.

This artifact includes the copy corrections, editor-focus fix, and stored-scenario version validation. The Netlify adapter build, TypeScript, server/background functions, and edge packaging passed. Authenticated checks against the stable URL returned 200 for all six landing routes, login, waitlist, readiness, and recovery-boundary endpoints; an unknown profession returned 404. Browser verification completed the consulting sandbox on a 390px viewport and confirmed focus returns to the editor. Homepage HTML contains the revised one-person access copy and invitation-email disclosure. No access form was submitted.

Live database qualification passed with 49 required migrations, zero missing and zero mismatched. The isolated build restored the exact historical trailing newline for one staging migration; the source migration and database history were preserved. See [release notes](HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md#deployment-destinations). Prior stable test deployment: `6a9f4700d38bd2b08e552efa`. The older unpublished preview below is historical evidence, not the current review URL. Human research and manual accessibility acceptance remain open.

| Gate | Status | Evidence or remaining requirement |
| --- | --- | --- |
| P0 evidence and copy contract | Sources reconciled; owner decisions pending | Both Joanna Wiebe reference files are now supplied and indexed; P0.1 is complete. The copy matrix records source reconciliation and remaining editorial findings. P0.3/P0.5 owner decisions remain open. |
| P1 first useful prototype | Implemented; human gates pending | Browser coverage exercises all states, both choices, switching, access navigation, and desktop/mobile use. P1.3–P1.5 require 10 suitable participants and owner review. |
| P2 shared public experience | Implemented and browser-qualified | `/`, five profession routes, 404 behavior, distinct metadata, sandbox state, request inspection, anchors, no-JavaScript reading/navigation/form rendering, and draft reset are covered in `e2e/homepage-conversion.spec.ts` and `e2e/product-demo.spec.ts`. |
| P3 access and measurement | Implemented; continuity qualified | Inline form-state unit tests, bounded local event tests, privacy-signal tests, additive schema, and the isolated-database continuity fixture pass. No collector is enabled, so funnel rates remain unavailable. |
| P4 invitation to first action | Implemented; participant gate pending | Scenario context reaches registration/onboarding, a relevant starter is offered with use/change/skip, one-person context is accepted, and the competing referral prompt is deferred. The isolated waitlist-to-account continuity path passes. Existing Today behavior remains covered; P4.6 participant sessions remain. |
| P5 release qualification | Technical evidence recorded; final acceptance remains | Static checks, typecheck, the complete local database-aware unit/integration suite, six-route viewport/no-JavaScript browser checks, production build, Lighthouse, deployed preview, and visual review have receipts below. Copy sources are now available; final editorial reconciliation, participant acceptance, and manual screen-reader review remain open. September 11 added automated keyboard, focus-order, announcement, target-size and open-picker scan coverage for the follow-up date picker and the demo's handoff row (see below). |
| P6 evaluate and expand | Awaiting observation windows | Research protocol and metrics are defined. This phase requires 15 further participants plus mature 7/14/28-day cohorts and cannot be truthfully completed during implementation. |

## Automated qualification receipt

- `npm run validate:static`: schema, syntax, imports, and Server Action boundary passed.
- `npm run typecheck`: passed.
- Focused marketing, waitlist, referral, and recovery suites: 52/52 passed across five files.
- `npm run build` with a non-routable local compile-time database URL: passed; 90 routes were generated after the recovery boundary endpoint was added. Optional build-time catalog reads failed closed as expected.
- Isolated scenario continuity: all 49 migrations applied to a fresh temporary schema on the dedicated test cluster; the targeted waitlist → invitation → account fixture passed in 8.69 seconds (1 passed, 24 unrelated cases skipped), and the schema was removed. A broad run through the remote relay exceeded several legacy 5-second local timing assumptions, so it is not counted as a full database-suite pass.
- Complete local database qualification: PostgreSQL 18 was provisioned ephemerally outside the repository, all 49 migrations applied to a fresh `jitm_design_homepage` database, and `npm test` passed 998 tests across 129 files with 67 intentionally gated skips and zero failures. The temporary cluster was stopped and removed. This run also corrected the runtime-role table count for the new model and aligned the private-deployment fixture with the recovery-boundary client.
- Targeted Playwright: all applicable homepage/sandbox journeys passed on desktop and Pixel 7. The six routes pass 320/390/768/1440 layout checks in both color preferences, 200% reflow equivalence, focused-editor fit, keyboard state transitions, no-JavaScript reading/navigation/form rendering, bounded event payloads, privacy signals, and axe WCAG scans with no violations. A dedicated accessibility-tree journey verifies the editor and action names, focus movement after each state transition, polite live regions, final status role, and the explicit no-send announcement (4/4 product-demo tests passed).
- Visual review: full-page 1440px homepage and Pixel 7 painting-route captures show the complete five-chapter hierarchy with no clipped controls or horizontal overflow. New scenes are CSS/live-text compositions, so blocked media and reduced motion do not remove content.
- Lighthouse mobile lab, three runs per route (18 reports): every route scored 100 performance and 96 accessibility, with median LCP from 1,189–1,230ms and CLS 0. Reports are under `.artifacts/lighthouse/`.
- Netlify adapter build: passed with the Next.js server handler and both background functions. Moving the recovery database query behind a bounded internal Node endpoint removed `pg` from the edge proxy bundle; focused fail-closed tests pass.
- Unpublished Netlify test preview: `6aa30312af109100ea2e07d4`. The dedicated test database accepted all pending additive migrations through `20260910120000_marketing_scenario_continuity`. All six authenticated landing GETs, `/login`, `/waitlist`, the recovery boundary, and all 13 referenced CSS/JavaScript assets returned success; an unknown profession returned 404; and the consulting sandbox completed in a Pixel 7 browser context. `/privacy` remains intentionally unavailable on this private site because it lacks public-operator configuration. No form was submitted and the preview was not promoted.

## External acceptance inputs

### September 10 continuation verification

Recovered the original full-roadmap objective and checked the current worktree. Fixed a keyboard-focus gap: Back to edit, Edit this example, and Reset from a later state now focus the message editor. Switching professions preserves focus on the selected profession button, including when restoring a completed example. Initial rendering does not move focus.

Typecheck, static validation, and all 52 focused marketing/waitlist/referral/recovery tests passed. Five existing desktop/mobile sandbox journeys passed, including the explicit viewport/axe matrix; its duplicate mobile invocation was intentionally skipped. The expanded focus journey passed on both desktop and Pixel 7 after correcting an ambiguous test locator. These checks used a local development server with an unreachable database URL and submitted no forms. The earlier production build, Lighthouse, and deployed-preview receipts above predate this focus fix; this continuation did not redeploy or repeat database qualification.

The full roadmap remains incomplete until the external inputs below and outstanding owner decisions in P0 are resolved. Automated focus and accessibility-tree checks do not close the manual screen-reader gate.

### September 10 copy follow-through

Resolved both source-review findings in the shared six-route experience: the access introduction now starts with one person, and the sending FAQ explains reviewed System Mix invitation email alongside default messaging-app handoffs and optional provider sending. Added a linked headline brief with 25 scored candidates, three distinct hypotheses, unchanged controls, and participant comparison instructions. These are editorial deliverables, not research results; the current headline remains unchanged.

Verification for this copy revision: typecheck passed; 29 tests passed across system invitation actions/content, invitation mail, and marketing scenarios. The existing six-route journey passed on desktop and Pixel 7 (2/2 tests), including unknown-route 404. Browser inspection verified the new access copy and expanded FAQ without horizontal overflow at 320/390/1440px. All 25 headline score totals were checked. No forms were submitted. Production build/deployment receipts above predate this revision; no deployment occurred.

### Full-goal audit: scenario contract

The renewed completion audit found that stored scenario versions were persisted but not checked when preparing invitations, creating accounts, or showing/using an onboarding starter. Those boundaries now accept only a canonical scenario ID at supported version 1. Unsupported, missing, and retired context falls back to neutral setup without blocking a valid account invitation. Public route aliases remain accepted when making a fresh selection. Stored historical versions are not silently upgraded.

Verification: typecheck passed; 58 focused tests across five files passed, including unsupported-version and account-provisioning regression cases. A fresh production build passed and generated 90 routes. The build used an unreachable loopback database; optional catalog reads failed closed, so this is build evidence rather than renewed database-journey qualification. No deployment or live invitation was performed.

P0.3 reviewable implementation decisions:

| Scenario | Starter | Channel | Content boundary |
| --- | --- | --- | --- |
| Real estate | Reconnect at the agreed time | SMS | Possible move; ask whether timing changed. |
| Consulting | Revisit a business milestone | Email | Revisit the discussed milestone; no assumed current project. |
| Photography | Clarify an open inquiry | Email | Coverage options; no assumed booking. |
| Painting | Follow up on an estimate | SMS | Scope comparison; no assumed accepted estimate. |
| Recruiting | Reconnect at the candidate’s timing | Email | Requested timing; no assumed open role. |

All five starters contain one action at the user-selected follow-up date, with real-contact template fields rather than the fictional identity. Existing starter definitions were revised during implementation; no further content revision was identified in this mapping review. The neutral fallback does not choose a profession-specific starter from unsupported stored context. Generic public receipts remain necessary to avoid revealing existing-account or waitlist status. Duplicate public requests preserve existing preferences. Demo drafts reset on refresh and never enter the durable preference. The privacy page discloses functional scenario continuity. These are implementation decisions ready for the P0.3 owner review, not a fabricated owner sign-off.

There are 13 unchecked criteria: P0.3/P0.5 owner decisions; P1.3–P1.5 and P4.6 initial participant sessions; P5.2 manual screen-reader review; P5.7 release-specific policy/content acceptance; P6.1–P6.5 further participant and cohort evaluation. The current research files contain protocols and blank worksheets, not results. No participant coordinator has yet been identified in this thread. No actual screen-reader session was performed in this audit. Existing preview receipts predate the latest edits, so they cannot establish final release acceptance.

### September 11 keyboard and screen-reader coverage (P5.2)

The follow-up date and time picker added on September 11 is the newest interactive surface on the six landing routes and in the app, so P5.2 evidence was extended to it and to the demo's handoff row. These are automated checks against a local development server, not a screen-reader session.

- Keyboard: the day grid and the time grid each keep a single tab stop (the current choice, else today, else the first day that can still be picked). Arrow keys step days and weeks, Home and End move to the ends of the week, Page Up and Page Down change the month; in the time grid the arrows step slots and rows and pass over taken or buffered slots. A move before the earliest allowed day lands on that day, so focus never disappears into disabled cells.
- Focus order: opening lands on the current choice; picking a date advances to the time view with focus on the current time; picking a time closes the panel and returns focus to the trigger that now shows the value; Escape and Done return focus to the trigger that opened the panel; switching views with the Date/Time tabs leaves focus on the tab. Before this change an inline pick dropped focus to the document body.
- Announcements: a visually hidden status region reads "Date set to …. Now choose a time." and "Time set to … on …" after each pick; the month heading was already live. Today's cell is labelled ", today". The quick choices, view tabs, day grid and time grid are named groups, and the day grid carries a hidden usage hint.
- Targets and contrast: every control in the panel is at least 44px tall (tabs, chips, Done, month arrows, days, slots). Day cells keep a fluid width so seven columns fit 320px and stay at least 24px wide on the Pixel 7 layout. Outside-month days no longer rely on an opacity fade that put them below 4.5:1. The open beat's gray title on its new light-blue frame computes to about 5.5:1 and the brand-colored beat number to about 6.9:1.
- Handoff row: on phone widths the channel action had been shrinking to about 24px with its label hidden while the secondary buttons kept theirs. Now the secondary buttons go icon-only below 480px (their names stay on the buttons), the channel action keeps a visible label and a 44px minimum, and below 370px the row wraps so the channel action takes a full line above the four icons instead of clipping. Measured at 320, 360, 390, 412 and 480px: every control 44px or taller and wider, label visible, no horizontal overflow.
- Automated evidence (September 11, local dev server): `e2e/product-demo.spec.ts` now includes the keyboard journey above on desktop and Pixel 7, the 44px target check for the handoff row and the picker's closed, date and time states on Pixel 7, and the 320/390/768/1440 axe scan covering the open date view and time view as well as the closed beat: 20 passed, 2 project-specific skips. `e2e/homepage-conversion.spec.ts` and `e2e/profession-pages.spec.ts`: 11 passed. Unit: `tests/when-picker.test.ts` (keyboard target helpers), `tests/product-demo.test.ts` and `tests/calendar-availability.test.ts`: 25 passed. Typecheck and the production build passed.
- Still open for P5.2: an actual screen-reader session (VoiceOver, NVDA or TalkBack) over selection, editor, preview, dates, form errors and recovery. The app-side sheet variant of the picker shares this code, but its browser journeys (`customer-journey`, `sheet-interactions`) need the seeded database and were not run here. The demo's recorded-time editor, the onboarding follow-up date and the broadcast date fields still use native inputs.

### External inputs still needed

- Both Joanna Wiebe files were supplied and reviewed later on September 10. The missing-source dependency is closed; the [copy matrix reconciliation](HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md#supplied-source-reconciliation) records remaining editorial and validation work before final copy acceptance.
- Recruit five suitable participants in each of the five professions using the prepared protocol.
- Complete a manual screen-reader review of the selection, editor, preview, next-step, error and recovery journeys.
- After launch, allow the defined cohort windows to mature before recording P6 keep/change/stop decisions.

See [release and rollback](HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md) for deployment order and safe rollback.
