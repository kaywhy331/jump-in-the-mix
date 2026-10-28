# Contact hierarchy — October 28, 2026

Local candidate for JITM-UX-03-EXEC (`job_445605886f56`, native task `task_23b2e998c387`, Dispatch `ctx_a2a4de49f9f6`). Kevin authorized this phase on October 27. The assigned isolated workspace began clean at prerequisite candidate `1804bd0a404b7db56eccbd692480267a6677c46e`, whose parent is current main `5f85ee71f405244de97110417cf3b33506e9315f`. The prerequisite's final source manifest matched every supplied file before editing. The final local candidate SHA and source hashes are recorded in the Hub handoff.

**Acceptance status: BLOCKED.** The requested local UI candidate is implemented, but ten required browser cases retain protected pre-rollout expectations. The task prohibits changing those tests without additional authorization; the coordinator question remains unanswered. This is not a green-test or release-ready claim.

## Scope

VERIFIED-CODE: The contact keeps identity, current stage and communication controls first, followed by lasting notes beside Next, one grouped Mixes region, Recent activity and secondary details/history. Dated stage history uses recorded transitions, including returns; it no longer synthesizes a current-stage event or displays hypothetical future stages as a timeline. Empty Coming up is omitted.

VERIFIED-CODE: Current Mixes includes active or waiting work using the existing enrollment reader and UX01 projection. Completed rows require settled follow-up or recorded finished-run evidence with no current work; stopped/inactive rows remain separate. Known archived Mixes appear only when an obligation remains, with an explicit archived label and no Mix reactivation controls. One-time pseudo-Mixes remain excluded. Existing workflow, stop/remove, occurrence and Undo contracts are unchanged.

VERIFIED-CODE: No Mix uses neutral enrollment copy and color. A one-time follow-up remains actionable through UX01 without implying enrollment. The Contacts row emphasizes its shared next-action status. Activity combines channel and event, names completion as owner-recorded, and distinguishes it from delivery. Phone formatting changes display only: stored values and existing tel/sms recipients remain untouched, and unparseable values retain their original display. Single-page and empty results omit pagination while preserving the live result announcement.

The work follows WF-01/02/03/04 and the `jitm-ui-change`, `jitm-copy` and `jitm-feature` skills, through the dispatched-worker path in `orca-tokenpak` and `orca-fleet`. Relevant rules include JITM-00 §2.2–2.8, JITM-04 §2.3/2.6–2.12, JITM-05 §2, JITM-06 §2.13/2.19/2.21/2.28/2.31, JITM-07 §2.13/2.17, JITM-08 §2.19, JITM-09 §2.32/2.76–2.79, JITM-10 §2.1–2.15/2.20, JITM-11 §2.9–2.18/2.34/2.48, JITM-12 §2.8–2.10/2.14/2.18–2.22, JITM-13 and JITM-16 §2.5–2.10.

## Proposed standards alignment

The task authorizes the hierarchy departure and prohibits editing the standards or original export. Proposed alignment text for JITM-07/JITM-09:

> A contact profile presents identity, current stage and communication controls, lasting notes near Next, the shared next action, one Mixes region grouped into Current Mixes (active or waiting), Completed and other inactive records, Recent activity, and secondary details/history. Stage history shows only dated recorded changes, including returns; current stage is separate and possible future stages have no invented dates. A known archived Mix remains visible only while an outstanding obligation needs attention, clearly labeled as archived without reactivating it. No Mix describes enrollment neutrally and does not imply that one-time follow-ups are unavailable. An action-gap message requires an existing unmet follow-up expectation. Activity names its channel and event and distinguishes recorded completion from delivery. Contacts emphasize one next-action status, format phone display without changing handoff values, and omit pagination for zero or one page while retaining result announcements.

Visual references: Contact/DarkContact, Contacts/DarkContacts and DesktopContacts/DarkDesktopContacts in the existing design export. Semantic tokens, shared controls, the desktop details rail and phone-first layout are reused.

## Verification

VERIFIED-RUNTIME: Focused checks passed 44/44 tests across presentation, existing profile occurrence/stage history, Mix row/status labels and phone-number suites. Standalone typecheck passed. Full check passed generation, schema/syntax/import checks, typecheck and all 2,506 tests (321 files; 75 existing tests and nine files skipped). That production build passed. Final review then added recorded FINISHED-run evidence, including runs with no follow-up rows; a fresh typecheck, the same 44 focused tests and a fresh production build passed after that read-only correction. The complete unit suite was not repeated after that correction; the final browser grouping fixture exercises it against the database. Logs: `.artifacts/ux03/check.log`, `final-typecheck.log`, `final-focused.log` and `final-build.log`.

VERIFIED-RUNTIME: The first three-spec desktop/mobile browser batch passed 37 tests with one existing viewport skip and no retries. It covers the added hierarchy fixtures, shared next actions and the preserved profile Mixes suite, including notes expansion, Calendar destination, DNC, stop/resume/remove, keyboard and 200% text. Evidence: `browser-core.log`.

VERIFIED-RUNTIME: The first visual matrix passed 56/56 cases with zero scoped axe violations: both themes; widths 320, 390, 599, 600, 601, 767, 768, 834, 900, 901, 1194, 1199, 1200, 1279, 1280, 1440, 1699, 1700, 1839, 1840, 1920, 2199 and 2200; 200% text at 320/390/834/1700; and a 1366×600 short window. It asserts reflow, hierarchy ordering, 44px controls, 13px text, visible focus, keyboard disclosure and theme colors. Representative light phone, dark desktop and narrow 200% screenshots were inspected. The initial harness serialization error (`__name is not defined`) was corrected in private test instrumentation, with the failed log retained.

VERIFIED-RUNTIME: After the final grouping correction and rebuild, the complete 56-case visual matrix passed again with zero scoped accessibility violations (`final-visual.log`, `visual-assertions.json`, `screenshots/`). All 15 application/test file hashes match `validation-source-manifest.json` captured for the final build/browser run; only this implementation record changed afterward. No standards, export, skills, agent instructions, schema, dependency lockfile or production settings changed.

Validation uses only the owned loopback `jitm_design_ux03` database at port 55443. One heavy validation process runs at a time with `NODE_OPTIONS=--max-old-space-size=2560`. Evidence remains in private `.artifacts/ux03/`; no synthetic data or local-only source is committed.

BLOCKED-TOOL: Native browser discovery reported `browser_unavailable: Browser automation is unavailable on this host.` Installed browser automation is the justified fallback; URL, interaction, assertion and screenshot receipts are retained. Scoped native-runtime and loopback process access uses automatic approval review without changing credentials, permissions, hooks or services.

BLOCKED: The final eight-spec desktop/mobile batch completed with **67 passed, 17 existing project/viewport skips and 10 failed**, with retries disabled. Both core accessibility projects passed. The final new grouping fixture also passed for a FINISHED Journey run without follow-up rows. Every failure diagnostic was inspected; all ten concern protected assertions for the previous presentation:

| Protected test | Failure | Required follow-up |
| --- | --- | --- |
| `e2e/live-search-contact-layout.spec.ts:86`, desktop | Requires Stage and History in the removed primary wrapper and notes within Details | Authorize label/relocation assertions matching the requested hierarchy, retaining content and controls |
| `e2e/no-mix-status.spec.ts:77`, `:313`, `:327`, `:354`, both projects | Exact old sheet copy or Today warning regex | Authorize only neutral-copy expectations; retain the lifecycle and navigation assertions |
| `e2e/contacts-bulk-placement.spec.ts:155`, desktop | Dereferences absent `.pagination-bar` with three contacts | Authorize a second-page fixture so the existing pagination/bar geometry assertions remain meaningful |

The named contact-profile notes test needed no selector change and still passes unchanged. The protected browser suites and occurrence fixtures are byte-identical to the prerequisite. Only the two explicitly authorized existing unit expectations changed; no timeout, threshold or existing skip changed. Failed artifacts remain in `.artifacts/ux03/final-browser-failure-artifacts/` and `final-browser.log`. These failures are not classified as flaky or pre-existing; they are unresolved acceptance conflicts caused by the requested new presentation.

Coordinator question `relay_eaec511ea7b0` and its follow-up escalations identify the exact missing authorization. Resumed waits returned no answer, and a fresh Hub read still shows the required owner input unanswered. The local candidate is preserved for narrow test alignment and a rerun, not declared complete.

## Changed-file manifest

- `src/components/ContactProfile.tsx`: hierarchy, real stage history, phone display, shared projection input and empty-section removal.
- `src/components/ContactMixes.tsx`: current/completed/inactive grouping and archived Mix controls.
- `src/components/ContactTimeline.tsx`: channel/event labels and recorded-outcome wording.
- `src/components/ContactsBulkWorkspace.tsx`: dominant next-action status and neutral enrollment fallback.
- `src/app/(app)/contacts/page.tsx`: conditional pagination with announcements retained.
- `src/lib/contact-mix-rows.ts`: existing lifecycle reader and projection-backed grouping.
- `src/lib/contact-mix-row-labels.ts`: grouping and archived outstanding-obligation labels.
- `src/lib/contact-mix-status-labels.ts`: neutral singular/plural enrollment copy.
- `src/lib/phone-number.ts`: display-only national/international formatting with safe fallback.
- `src/styles/contacts-workspace.css`, `src/styles/contacts-bulk.css`: semantic presentation styles.
- `tests/contact-mix-status-labels.test.ts`, `tests/contact-mix-row-labels.test.ts`: the two explicitly authorized expectation updates.
- `tests/contact-presentation.test.ts`, `e2e/contact-hierarchy.spec.ts`: new grouping, archive, stage-return, one-time action, pagination and phone fixtures.
- This implementation record.

## Follow-ups and NOT RUN

NOT RUN: Baseline production-build comparison for these deterministic old-expectation conflicts; they remain blocked rather than waived as pre-existing failures. Production deploy/smoke, merge, push, hosted CI, public messaging, connector activation, load qualification, migration/restore rehearsal, public-page performance and physical-device tests. These are outside the local application UI task. Independent QA and the proposed standards alignment belong in coordinator follow-up work. The final Hub handoff records cleanup of owned dependencies/build output and the exact final Git status.
