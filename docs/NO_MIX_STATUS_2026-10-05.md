# No Mix status — 2026-10-05

**Status:** built on branch `feat/no-mix-status-20261005` (PR #125) against `main` at 262892e, with the fixes from its WF-05 review of 2026-10-06. Not merged and not released.

**Decisions:** D33 ([owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md)). Kevin asked for this: "If there is no mix assigned to a contact, then the contact should show something that the contat has no mix … Ideally everyone should be in the journey OR marked as a status/label/ or confirmation where they are not in a mix." D44–D47 (2026-10-06) are his answers to the review's questions.

**Rules:** JITM-09 §2.76–§2.77 and §2.24, and JITM-05 §2.3. This is the first build slice in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md).

## What changed

**One definition.** `src/lib/contact-mix-status.ts` decides the status in a single SQL expression, so the Contacts row, filter and count, the profile, Today and Journey always agree.

- **In a Mix:** at least one Mix still has work to come for the person. Any of these counts:
  - a pending Beat in a Mix that isn't one-time;
  - Journey work that is running or paused;
  - Beats a paused Mix holds for someone still in it and not stopped (D45). Pausing cancels the future ones, the worker's next pass cancels the overdue ones, and resuming brings the same rows back;
  - a Mix whose Beats for the person are being prepared, while a preparation job is still to run. A job that names the person and that Mix counts, which covers a start, a restart and a bulk start. A job for the whole Mix or the whole account counts only for a Mix started by hand that has a calendar-day Beat and has prepared nothing for them yet. A finished or failed job ends it;
  - a date-based Mix, running or paused, waiting for a repeating or future date of theirs.

  One-time follow-ups don't count, and neither does a finished or stopped Mix. A paused Mix counts for all of its people (D45).
- **No Mix:** none of the above applies.
- **No Mix needed:** the owner confirmed it. The confirmation is stored as `ContactRelationshipState.noMixNeededAt`. It counts only while no Mix work has started or resumed for the person since it was set: a Beat created, brought back from a hold or done after it, or Journey work started after it. Joining a Mix, or a paused Mix resuming for them, makes it lapse without any write. A one-time follow-up never clears it.
- **Do not contact:** the row shows "Do not contact" instead of a Mix status. These people are not counted.
- **Archived** people are left out.

**Contacts:**
- **Rows** show "No Mix" in the warning color, or "No Mix needed" muted, next to the stage. For someone in a Mix, the row is unchanged. With enlarged text the row's parts wrap instead of clipping.
- **The summary** offers "{n} with No Mix" among the people the current search and filters show, and the link keeps them (D47).
- **The filter sheet** has a Mix filter: Any, In a Mix, No Mix, or No Mix needed. Each count covers the people the other filters show (D47). Saved views keep it.
- **The selection bar** has a Mix sheet with two choices:
  - **Add to the Mix**, which asks for a start day like the profile does and says "Anyone who already finished this Mix starts it again. Anyone still in it keeps their start." The plan, Do not contact and stopped-Mix checks refuse the whole batch, naming the person, before anything is saved. Otherwise it acts at once. The notice names the Mix and what happened to each group of people, for example "Estimate follow-up started for 3 people. 1 was already in it and keeps their start. Beats timed from an appointment wait until you line each person up with a visit." It offers Undo (D46).
  - **Undo** ends the starts that action made: the assignments it created or reactivated go inactive, the follow-ups still to come from them are cancelled, and a saved date the start wrote for someone without one is removed. Completed and skipped follow-ups and history are never touched. People who were already in the Mix, and starts changed since, are left as they are, and a second tap ends nothing. Follow-ups a tag still runs for someone come back on the next preparation pass. The record of what the action started is one audit log row.
  - **Mark No Mix needed.** It acts at once, and the notice offers Undo (JITM-08 §2.5). Anyone already in a Mix, marked Do not contact or already marked No Mix needed is left as they are, and the notice counts each reason, as in "2 people are marked No Mix needed. Left as they are: 1 already in a Mix, 1 marked Do not contact." "Removed" appears only when the confirmation was removed for someone.

  Both return to the same list with its filters and the docked person, never with an earlier notice (D47).

**Profile:**
- A "No Mix" chip, or a neutral "No Mix needed" chip, sits beside the stage chip.
- The chip opens "What's next for {name}", described as "No Mix has work to come for this person." (D44). It offers:
  - start a Mix;
  - schedule a one-time follow-up;
  - mark No Mix needed, or remove it.
- The Start a follow-up sheet offers the same confirmation.
- Docked beside Contacts, its actions return to the list with its filters and the person still docked (D47).

**Today:** after Quiet-day check-ins, one line reads "{n} people have No Mix, so no Mix will remind you about them." ("1 person has No Mix, …" for one), with Review (D44). Review opens the Contacts filter. If the count fails, only the line is hidden.

**Journey People:** a "No Mix" person status appears in the count strip and the status filter. It is never counted per Mix.

**Shared Mix start:** profile Start and bulk Add use one start routine, `startMixForContact` in `src/lib/contact-mix-actions.ts`. It returns what the start did: started, already running, saved date kept or date written, the start day the confirmation names, and whether any Beat is timed from an appointment. Its behavior for a single person is unchanged. A bulk start queues one preparation job for the Mix, listing the people it started, instead of one job per person (PERF-01).

**Schema:** one nullable column, added by `prisma/migrations/20261005200000_contact_no_mix_needed`. It is additive; the previous release never reads it. The account export already includes the whole relationship state, so the export picks up the new field without a change. The review fixes add no schema change.

**Rollback:** the column stays. Roll back by redeploying the previous commit. Stored confirmations are inert under the old code and apply again on re-promotion. No reverse migration (JITM-14 §2.24). A bulk start's Undo record is an ordinary audit log row, which the old code ignores.

## Review fixes (2026-10-06)

The WF-05 review of a05b189 requested changes (1 HIGH, 5 MEDIUM, 8 LOW). Each fix is its own commit on this branch.

| Finding | Fix | Commit |
|---|---|---|
| TRU-01 (HIGH) | Today and the What's next sheet say that no Mix will remind you, which stays true when a one-time follow-up is coming (D44) | 797af8f |
| DEF-01 | The grace follows the preparation job, not any write to the assignment; a general job never counts for a date-based or visit-timed Mix | 7055362, bf4392f |
| DEF-02 | A paused Mix counts for all of its people, and No Mix needed lapses when it resumes (D45) | 5b2d968 |
| BLK-01 | `startMixForContact` returns its outcome; the bulk notice is built from it and names the Mix | ae6dbbb |
| SEC-01 | Both actions use `requireWritableWorkspace()`; the No Mix return also accepts Today | 4418686 |
| LAY-01 | The row summary and the summary bar wrap at large text sizes; Contacts joins the 320px enlarged-text check; a keyboard-only browser pass | 9360e6b, 3a3799d |
| UX-01 | Bulk Add offers Undo and warns about restarts (D46) | e550099 |
| UX-02 | Counts and the link follow the current search and filters; returns carry only the filters and the docked person (D47) | 6b7ad17 |
| VOC-01 | The filter's first option reads Any (JITM-09 §2.77) | cddc5b5 |
| COPY-01 | Each skip reason is counted on its own; "removed" only when it was | fe57103 |
| A11Y-01 | The disabled Add to the Mix is linked to its reason with `aria-describedby` | 0974901 |
| PERF-01 | One preparation job per bulk start, a date clause that starts from the person's dates, a catch on the Contacts count, and EXPLAIN ANALYZE timings (below) | f0aee69 |
| DOC-01 | JITM-09 5.0.0 (§2.24 tags, §2.76, §2.77, §6), JITM-05 2.1.2, D44–D47, and this record | 5953a70 and this commit |
| TST-01 | New cases: billing on, a stopped Mix, a date-based Mix, a double submit, and the DEF-01, DEF-02, BLK-01 and D46 cases | 8f1b86a and the commits above |
| Audit wait | The No Mix accessibility audit waits up to two seconds for running animations before axe | fdc3415 |

## Not in this slice

These come with the next build slice (P4–P6 in the decisions record):
- the end-of-Mix question in JITM-09 §2.77;
- the new-contact setting in §2.78;
- "Everyone" including people added later.

## Verification

### Review fixes, 2026-10-06

Run on TrixBot on 2026-10-06 against the local PostgreSQL 17.10 (`jitm-postgres`, 127.0.0.1:5432), in fresh `jitm_design_nms1006b_*` databases, with the environment of CI's `validate` job under `env -i`. The code under test is 3a3799d; the commit that carries this record changes only `docs/` (VERIFIED-RUNTIME, `git diff --stat`). No production, hosted database or service was touched.

| Check | Label | Result |
|---|---|---|
| `npm run typecheck` | VERIFIED-RUNTIME | Passed on 5953a70 and again on the final head. |
| `npm run validate:static` | VERIFIED-RUNTIME | Passed: the schema is valid and imports across 655 files resolve, with the Server Action boundary verified. Rerun on the final head. |
| `node scripts/check-standards.mjs` | VERIFIED-RUNTIME | Passed with one warning: JITM-09 has 318 lines, over the 300-line target. Rerun on the final head. |
| Full `vitest run` with CI's unit-step environment, on a fresh migrated database, in nine calls | VERIFIED-RUNTIME; 4 files BLOCKED | 308 files: 301 passed, 4 failed, 3 skipped. Tests: 2,281 passed, 24 failed, 41 skipped. All 24 failures are `spawn pg_dump ENOENT` in the four backup and recovery suites. The host has no PostgreSQL client tools, so they are BLOCKED by the environment (JITM-12 §2.17), exactly as in the run on a05b189. |
| New and changed suites | VERIFIED-RUNTIME | `contact-mix-status.integration` 12/12, `contact-mix-status-lifecycle.integration` 3/3 (the real Mix save, pause, resume, per-person stop and the worker's preparation call), `contact-no-mix-actions.integration` 15/15, `contact-mix-status-labels` 5/5, `workflow-analytics` 5/5. |
| The new tests catch the old code | VERIFIED-RUNTIME | With a05b189's `src/lib/contact-mix-status.ts` swapped back in, both DEF-01 lifecycle cases fail, and so do the D45 lifecycle case, the paused-Mix status case and the restored-row lapse case. |
| `npm run build` | VERIFIED-RUNTIME | Passed (Next.js 16.3.6) on 5953a70 with the migrated browser database; the app code has not changed since. A first attempt before that database existed also passed but logged Prisma errors from static generation, so the build was repeated in CI's order. |
| Browser specs: the record's 18 specs on desktop-chromium and mobile-chromium, against the standalone server on 127.0.0.1:3141, with no retries | VERIFIED-RUNTIME | Desktop: 127 passed, 8 skipped, 1 failed. Mobile: 95 passed, 40 skipped, 1 failed. The two failures are classified below. |
| Desktop failure: `no-mix-status.spec.ts`, the new keyboard pass | VERIFIED-RUNTIME, fixed in the test | It pressed Tab before the page had focus. The first key press made the account boundary re-check the browser and hold the page inert, so Tab never reached the chip. The pass now starts at the skip link once the check is done (3a3799d), and passed. |
| Mobile failure: `journey-connections.spec.ts:312` | VERIFIED-RUNTIME, order-dependent | "Selected path" did not appear after a path was chosen. It passed alone twice. Nothing in this change touches Journey editing (JITM-12 §2.14). |
| `no-mix-status.spec.ts` on the code under test | VERIFIED-RUNTIME | Rerun whole on 3a3799d, after the keyboard fix: desktop 7/7 passed; mobile 3 passed, with the 4 desktop-only cases skipped. |
| `design-correction.spec.ts` | VERIFIED-RUNTIME | 14/14 on each project, including `:111`. The known flake is described under Found, not fixed. |
| Accessibility | VERIFIED-RUNTIME | `no-mix-status.spec.ts` runs axe (WCAG 2.0, 2.1 and 2.2 AA) on the filtered list and on the profile with the sheet open, at 1280 and 390, in light and dark, after the bounded animation wait: no violations. `accessibility.spec.ts` passed (desktop 2, mobile 1, plus 1 desktop-only case skipped). |
| 320px with 200% text | VERIFIED-RUNTIME | The enlarged-text case of `sheet-interactions.spec.ts` now includes `/contacts` with a No Mix row and a No Mix needed row. It passed in light and dark on both projects: no sideways scroll, each label whole and inside its row. |
| Keyboard only | VERIFIED-RUNTIME | The keyboard pass reaches the chip with Tab and shows its focus ring, then opens the What's next sheet and tabs through its controls; Escape returns focus to the chip. It then selects a person, opens the bulk Mix sheet and tabs through it, marks No Mix needed and presses Undo, all from the keyboard (desktop). |
| Screenshots | VERIFIED-RUNTIME, inspected | Production build with synthetic people, light and dark, at 320, 900 and 901, and at 320 with 200% text. They cover the Contacts list, the profile and its What's next sheet, and the Today line, plus the filter sheet and the bulk Mix sheet at 320 and 901 and the bulk notice and its Undo notice at 901. They were compared with the export's Contacts screens: the row is still name, then stage · next. The chip is 44px tall at 320 and 900 and 30px at 901. Nothing scrolls sideways. At 200% text with this change's row styles removed, "No Mix needed" is cut off at the edge and the sort control is clipped; with them, both wrap. Two visible effects of the wrap: at 200% text the "·" stays at the end of the first line, and at 320px, when the "with No Mix" link shows, the sort control moves to its own line. The captures stay private in `.artifacts/` (JITM-12 §2.19). |
| EXPLAIN ANALYZE on a synthetic 5,000-person account | VERIFIED-RUNTIME | Fresh `jitm_design_nms1006b_perf` database: 5,000 people, 41,600 follow-ups and 12,301 assignments, across an Everyone Mix, a date-based Everyone Mix, a paused Mix and a tag's Mix. Median execution of three runs is shown below. A page of 50 statuses takes about 5 ms. The whole-account count takes 37 ms, or 81 ms while preparation is pending, against 30 ms for a05b189's definition on the same data. Counting among 2,500 filtered people takes 9 ms. The plans use hashed sub-plans for pending Beats and Journey work, one-time init plans for the "anything paused" and "anything preparing" guards, and per-person index scans; no loop is larger than the number of people. |
| Schema | VERIFIED-RUNTIME | `git diff a05b189 <head> -- prisma` is empty, so the migration is unchanged. Both test databases were migrated with `npm run db:deploy` (75 migrations). |

| Query (5,000 people) | No preparation pending | Preparation pending | a05b189, either state |
|---|---|---|---|
| Counts for the whole account | 36.7 ms | 81.3 ms | 28.8–30.3 ms |
| Counts among 2,500 filtered people | 8.8 ms | 8.9 ms | not supported |
| Filter ids for No Mix | 36.1 ms | 80.5 ms | 28.0–28.6 ms |
| A page of 50 statuses | 5.0 ms | 5.1 ms | 4.8–4.9 ms |

### First build, 2026-10-05 (base 8bee3b1)

Superseded by the run above for the code it changed; kept as history. All of it was run on TrixBot against the local `jitm_design_local` database.

| Check | Label | Result |
|---|---|---|
| `npm run typecheck` | VERIFIED | Passed. |
| `npm run validate:static` | VERIFIED | Passed. |
| Full `vitest run` on the design database | VERIFIED | 288 files passed on the first run. Nine failed only for environment reasons: eight because CI's encryption keys were absent, and the staff-access suite because it needs an empty catalog. With CI's environment the eight passed (50 tests), and staff-access passed through `npm run test:isolated` (9 tests). |
| New tests | VERIFIED | `tests/contact-mix-status.integration.test.ts` (9), `tests/contact-no-mix-actions.integration.test.ts` (6), and a Journey No Mix case in `tests/workflow-analytics.test.ts`. |
| `npm run build` | VERIFIED | Passed. |
| `db:rehearse-migration`, `db:deploy`, `db:verify-release` | VERIFIED | The rehearsal passed, and the release check reported `{"status":"ready","required":75,"missing":0,"mismatched":0}`. |
| Browser specs, desktop and mobile, against the production standalone build with CI's environment | VERIFIED | Covered: `a2-contacts`, `contact-lifecycle-management`, `core-flows`, `core-ux-friction`, `live-search-contact-layout`, `sheet-interactions`, `a2-css-checks`, `follow-up-drafts`, `design-correction`, `journey-analytics`, `preparation`, `quiet-days`, `accessibility`, `journey-connections`, `visual-fitment`, `phone-contacts`, `contact-search-import-jobs` and the new `no-mix-status`. Everything passed except one mobile case, `design-correction.spec.ts:111` (the completion confirmation). It passed alone twice, so it is classified as order-dependent (JITM-12 §2.14). |
| Accessibility of the new elements | VERIFIED | `no-mix-status.spec.ts` runs axe (WCAG 2.0, 2.1 and 2.2 AA) on the filtered list and on the profile with the sheet open, in light and dark, at 1280 and 390. No violations. The chip is at least 44px tall on phones. |
| Screenshots | VERIFIED, inspected | Production build with synthetic people, light and dark, at 390, 834, 1194 and 1920. They cover the Contacts list, the filter sheet, the bulk Mix sheet at 390 and 1920, the profile with each chip, the What's next sheet, the Today line and Journey at 390 and 1920. They match the export's Contacts row anatomy, with the stage chip pattern reused for the Mix chip. The captures stay private in `.artifacts/` (JITM-12 §2.19). |

## Found, not fixed

- **The "Add phone or email" link fails axe's 24px target-size and target-offset check.** It is the existing link on a Contacts row for someone with no phone or email, and it sits too close to the name link above it. It is INFERRED to exist already, because that row's markup for someone in a Mix is unchanged from `origin/main`. It belongs in a separate fix. The new tests give their people a phone so the audit covers this change.
- **Scale.** The status is worked out on each Contacts and Today load, and the filter reads the matching ids, which are capped at 30,000. The EXPLAIN ANALYZE timings above are fine at pilot scale. A stored status belongs with the scale work parked for paid hosting.
- **A No Mix person can read "Awaiting follow-up preparation" on their profile.** That happens while any of the account's preparation jobs is pending. It was seen locally only because no worker ran. This is existing behavior. A bulk start's one job for the Mix now shows it on every profile until the worker runs, as a save of that Mix already did.
- **People whose Beats wait for a visit, or for the visit's outcome, read No Mix** once their other Beats are prepared: an appointment-timed Beat has nothing to count from until the person is lined up with a visit, and Beats after a visit wait for its outcome. Whether that waiting counts as being in a Mix is a question for Kevin (JITM-09 §6).
- **While a Mix is paused, Today stops showing its overdue follow-ups after the worker's next pass.** The pass cancels them, and resuming brings them back with their original dates. VERIFIED-RUNTIME in `tests/contact-mix-status-lifecycle.integration.test.ts`. This is existing behavior; the No Mix status now counts those people as in the Mix (D45).
- **At 200% text on a 320px phone, the tab bar's labels break inside words** ("Toda y", "Cont acts", "Mixe s"). Seen in the enlarged-text screenshots; the tab bar is unchanged by this work, so it is INFERRED to be existing behavior, for a separate layout fix.
- **Known flake: `e2e/design-correction.spec.ts:111`.** It fails when "Mark sent" is clicked before the Beat's Journey choices finish loading, while `useWorkflowChoices` is not yet "ready": the outcome then opens an empty "Record journey outcome" group. This is existing product behavior and out of this change's scope, so it is recorded, not fixed.

## NOT RUN

- `db:rehearse-migration` and `db:verify-release`: the schema and migration did not change since a05b189, whose record ran them. Here the databases were migrated only with `db:deploy`.
- `npm run test:isolated`: it drops the database it creates, and this task may not drop databases. Its one isolation-only case, in phone canonicalization, is untouched by this change.
- The four backup and recovery suites: BLOCKED, because there is no `pg_dump` on the host.
- A baseline build of `origin/main`: not built. Neither browser failure needed one. One was this change's own new test, fixed in the test; the other is an order-dependent Journey case that passed alone twice, in code this change does not touch.
- The worker process: preparation was exercised by calling the worker's `generateJumps` for each queued job, as `src/worker/index.ts` does, not by running the worker.
- Undo in an account with Journey connections, where a start also records a Journey run: not tested.
- System theme mode; only Light and Dark were emulated.
- Other CI jobs: `security:audit` (no dependency change), gitleaks, Lighthouse (no public page changed), the Docker image builds, the packaged-server and load suites, `scheduler:check` and `db:rehearse-restore` (BLOCKED for the same `pg_dump` reason).
- Physical phones and tablets.
- Production and hosted environments. Nothing was released or deployed.
