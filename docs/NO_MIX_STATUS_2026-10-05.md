# No Mix status — 2026-10-05

> Decision update — 2026-10-17: Kevin confirmed the eight PR #125 defaults (D125), chose the existing visit membership behavior (D126), and retained TRU-09 as his staff-console publication handoff (D127). The open-input statements below are historical; current rules are JITM-09 §2.19 and §2.76–§2.77.
**Status:** built on branch `feat/no-mix-status-20261005` (PR #125) against `main` at 262892e, with the fixes from its WF-05 review and its two re-reviews of 2026-10-06. Merged as 4a77761 and released on 2026-10-06 as `prod-2026-10-06-4a77761`; see [the release record](NO_MIX_STATUS_RELEASE_2026-10-06.md).

**Decisions:** D33 ([owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md)). Kevin asked for this: "If there is no mix assigned to a contact, then the contact should show something that the contat has no mix … Ideally everyone should be in the journey OR marked as a status/label/ or confirmation where they are not in a mix." D44–D47 (2026-10-06) are his answers to the review's questions. Where the build goes further than his words, the reading is a numbered default under [Agent defaults for Kevin](#agent-defaults-for-kevin), cited as `[SOURCE]` until he confirms it (JITM-15 §2.12).

**Rules:** JITM-09 §2.76–§2.77 and §2.24, and JITM-05 §2.3. This is the first build slice in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md).

## What changed

**One definition.** `src/lib/contact-mix-status.ts` decides the status in a single SQL expression, so the Contacts row, filter and count, the profile, Today and Journey always agree.

- **In a Mix:** at least one Mix still has work to come for the person. Any of these counts:
  - a pending Beat in a Mix that isn't one-time;
  - Journey work that can still bring work (JRN-01; default 7). It counts through its follow-ups: one still to come, or one held because its Mix is paused, or because the Journey is paused while the person is still in that Mix. With no follow-up yet, it counts for real waiting: a decision waiting for the owner, a path waiting to start a Mix, an open check-back date, or a choice being applied, each while its Mixes are open to the person. A wait counts only while it can still move: one on a connection the owner removed, a choice that uses one, and a path held at its repeat limit never count, while one on a connection that is on, or paused and so able to resume, does (JRN-02). A record's status never counts by itself. In an account with a Journey connection, which includes every account that added a Mega-Mix, each start also gets a record, and that record stays ACTIVE after the start is stopped, removed or undone, after the Mix is archived, and for about ten seconds after its last Beat is done. This is the rule PR #128's end-of-Mix question relies on (D48 there);
  - Beats a paused Mix holds for someone still in it and not stopped (D45). Pausing cancels the future ones, the worker's next pass cancels the overdue ones, and resuming brings the same rows back;
  - someone in a paused Mix started by hand, with a calendar-day Beat, that has prepared nothing for them yet, for example because they joined its tag during the pause (PAUSE-01). The scheduler skips a paused Mix, so their Beats come when it resumes;
  - a Mix whose Beats for the person are being prepared, while a preparation job is still to run. A job that names the person and that Mix counts, which covers a start, a restart and a bulk start. A job for the whole Mix or the whole account counts only for a Mix started by hand that has a calendar-day Beat and has prepared nothing for them yet. A finished or failed job ends it;
  - a date-based Mix, running or paused, waiting for a repeating or future date of theirs.

  One-time follow-ups don't count, and neither does a finished or stopped Mix. A paused Mix counts for all of its people (D45).
- **No Mix:** none of the above applies.
- **No Mix needed:** the owner confirmed it. The confirmation is stored as `ContactRelationshipState.noMixNeededAt`. It counts only while no Mix work has started or resumed for the person since it was set: a Beat created, brought back from a hold or done after it, or Journey work started after it. Joining a Mix, or a paused Mix resuming for them, makes it lapse without any write. A one-time follow-up never clears it.
- **Do not contact:** the row shows "Do not contact" instead of a Mix status. These people are not counted.
- **Archived** people are left out.

**Contacts:**
- **Rows** show "No Mix" in the warning color, or "No Mix needed" muted, next to the stage. For someone in a Mix, the row is unchanged. At normal text sizes the row stays on one line, shortening the stage and the due label as the export does. With enlarged text each part takes a line of its own and shows whole, and the "·" between them is hidden (LAY-02).
- **The summary** offers "{n} with No Mix" among the people the current search and filters show, and the link keeps them (D47; default 1).
- **The filter sheet** has a Mix filter: Any, In a Mix, No Mix, or No Mix needed. Each count covers the people the other filters show (D47). Saved views keep it.
- **The selection bar** has a Mix sheet with two choices:
  - **Add to the Mix.** Its sheet follows how the chosen Mix starts (COPY-02; default 6). A Mix started by hand asks for a start day and says D46's "Anyone who already finished this Mix starts it again. Anyone still in it keeps their start." A date-based Mix also asks for a start day and says "It follows each person’s saved date. Anyone without one gets the start day as their date. Anyone still in it keeps their start." A fixed-date Mix asks for no start day and says "It goes out on its fixed date. Anyone still in it keeps their start." The plan, Do not contact and stopped-Mix checks refuse the whole batch, naming the person, before anything is saved. Otherwise it acts at once, and the button reads "Adding…" and stays disabled until the start returns, so a double tap starts nobody twice (UNDO-03). Anyone the Mix already has work for, by any route (their own start, the Mix's audience or a tag, a visit still ahead or awaiting its outcome, or Journey work), is left as they are and counted as already in it (BLK-02; default 5). Someone stopped in the Mix or marked Do not contact has no work to come in it, so they are never counted that way: the batch is refused and names them, whatever other route they have (BLK-03). The notice names the Mix and what happened to each group of people, for example "Estimate follow-up started for 3 people. 1 was already in it and keeps their start. Beats timed from an appointment wait until you line each person up with a visit." For a fixed-date Mix it says "{Mix} goes out to {n} people on its fixed date." without a day. It offers Undo (D46).
  - **Undo** takes back what each of that action's starts did, and only that (UNDO-01, UNDO-02; default 4). An assignment the start created ends; one it restarted, for someone who had finished the Mix or whose next Beat was more than a year ahead, goes back to its earlier start, active or not. The start's own follow-ups still to come are cancelled: the scheduler's rows keyed to that run and written since the start. For a Mix started by hand that is its start day in the owner's time zone; for a date-based Mix, the person's dates, or only the date the start wrote when it wrote one; for a fixed-date Mix, its schedule; and for every start type, its planned Beats (UNDO-05). In an account with a Journey connection, the run's Journey record ends with it (UNDO-04; default 8): its Beats and waits are cancelled as "Its start was undone.", its settled Beats stay as history, and the record stops unless the Journey has already moved the person on to another Mix. So nothing on Today, in the morning email or in Journey People asks about those people, and the record keeps no plan place. A start whose run the owner has since moved on in Journey with a business update counts as changed since and is left as it is (UNDO-05). A saved date the start wrote is removed, and a No Mix needed confirmation that was in force before the start is written again. Completed and skipped follow-ups, history, Journey-managed follow-ups, a visit's follow-ups and other runs' follow-ups are never touched. A row another enrollment of the same person shares is cancelled as reconciled, so the next preparation pass brings it back. A later start of the same Mix, on the same day too, picks the ended record back up. Starts changed since are left as they are, and a second tap ends nothing. If Undo cannot finish, for example on a lock timeout, the list says "Nothing was undone. Try again in a moment." and nothing changes (ERR-01). The notice reads, for example, "Undone. Estimate follow-up is back to how it was for 2 people, without the follow-ups still to come from this start. 1 person is marked No Mix needed again." The record of what the action started is one audit log row; each start in it now also keeps the assignment as it was and whether No Mix needed was in force.
  - **Mark No Mix needed.** It acts at once, and the notice offers Undo (JITM-08 §2.5). Anyone already in a Mix, marked Do not contact or already marked No Mix needed is left as they are, and the notice counts each reason, as in "2 people are marked No Mix needed. Left as they are: 1 already in a Mix, 1 marked Do not contact." "Removed" appears only when the confirmation was removed for someone.

  Both return to the same list with its filters and the docked person, never with an earlier notice (D47).

**Profile:**
- A "No Mix" chip, or a neutral "No Mix needed" chip, sits beside the stage chip.
- The chip opens "What's next for {name}", described as "No Mix has work to come for this person." (D44). It offers:
  - start a Mix;
  - schedule a one-time follow-up;
  - mark No Mix needed, or remove it.
- The Start a follow-up sheet offers the same confirmation.
- **Remove from Mix** ends that run (UNDO-04; default 8). Its follow-ups still to come are cancelled at once, as reconciled, as the scheduler's next pass would have done, so that pass brings back any another enrollment of the person shares. In an account with a Journey connection, the run's Journey record ends as it does on Undo, with "Removed from this Mix.". This fixes the same "{Mix} · reconciled" entries on `main`.
- Docked beside Contacts, Mark No Mix needed and its Undo return to the list with its filters and the person still docked (D47). Start a Mix from the docked profile opens the person's own profile with its confirmation, as a start from the profile always has (DOC-02).

**Today:** after Quiet-day check-ins, one line reads "{n} people have No Mix, so no Mix will remind you about them." ("1 person has No Mix, …" for one), with Review (D44). Review opens the Contacts filter. If the count fails, only the line is hidden.

**Journey People:** a "No Mix" person status appears in the count strip and the status filter. It is never counted per Mix.

**Shared Mix start:** profile Start and bulk Add use one start routine, `startMixForContact` in `src/lib/contact-mix-actions.ts`. It returns what the start did: started, already running, saved date kept or date written, the start day the confirmation names, whether any Beat is timed from an appointment, the assignment as the start left it, the saved date it wrote, and, since the re-review, `previous`: the assignment as it was before the start (`{ isActive, startDate, mode }`, or null when the start created it). Its behavior for a single person is unchanged. A bulk start queues one preparation job for the Mix, listing the people it started, instead of one job per person (PERF-01). Before starting anyone, it asks `contactIdsInMix` in `src/lib/contact-mix-status.ts` which of them this one Mix already has work for (BLK-02); `contactMixStatuses` and `contactMixStatus` take an optional database client, so both checks run inside the bulk start's transaction. Undo and Remove end a run's Journey record through `src/lib/enrollment-workflow.ts`, and the scheduler's `ensureLegacyWorkflow` (`src/lib/mix-workflow.ts`) picks an ended record back up for a later start of the same occurrence, unless its pass began before the end.

**Schema:** one nullable column, added by `prisma/migrations/20261005200000_contact_no_mix_needed`. It is additive; the previous release never reads it. The account export already includes the whole relationship state, so the export picks up the new field without a change. The review fixes add no schema change.

**Rollback:** the column stays. Roll back by redeploying the previous commit. Stored confirmations are inert under the old code and apply again on re-promotion. No reverse migration (JITM-14 §2.24). A bulk start's Undo record is an ordinary audit log row, which the old code ignores.

## Agent defaults for Kevin

Each is reversible and was taken because the fix could not wait. Until Kevin confirms one, the standards cite it as `[SOURCE]` (JITM-15 §2.12).

1. **The "{n} with No Mix" link keeps every list filter (D47).** Kevin decided that the counts follow the current search and filters and that the link keeps the search and the tag. The build's link also keeps priority, Contact permission and an import, so it opens the same people the count covers. Should it keep those too?
2. **Undo removes the saved date a date-based start wrote for someone who had none (D46).** Already listed in D46 for confirmation.
3. **Undo leaves alone any start changed since, and a second tap ends nothing (D46).** Already listed in D46 for confirmation.
4. **Undo puts back what a start replaced (UNDO-02).** An assignment that was active before the start, for someone who finished the Mix, whose next Beat or one-off date is more than a year ahead, or who waits for a visit, gets its earlier start back instead of ending. A No Mix needed confirmation in force before the start is written again. The re-review recommended this reading. Should Undo restore the earlier state, as built, or end the enrollment?
5. **People already in the Mix by another route are left as they are (BLK-02, the re-review's question 6).** That covers a tag, the Mix's audience, a visit still ahead or awaiting its outcome, and Journey work. They get no second run, and the notice counts them as already in it, as the sheet promises. Confirm?
6. **The sheet's wording for date-based and fixed-date Mixes (COPY-02).** D46's sentence stays for a Mix started by hand. A date-based Mix says "It follows each person’s saved date. Anyone without one gets the start day as their date. Anyone still in it keeps their start." A fixed-date Mix asks for no start day and says "It goes out on its fixed date. Anyone still in it keeps their start."; its notice reads "{Mix} goes out to {n} people on its fixed date." Is that wording right?
7. **Which Journey waits keep someone In a Mix (JRN-01, and D48 for PR #128).** A follow-up still to come, a follow-up held by a paused Mix or a paused Journey, or, with no follow-up yet, a decision waiting for the owner on a run that wasn't cancelled, a path waiting or held to start a Mix while both Mixes are open to the person, an open check-back date on an open Mix, or a choice or business update being applied. Reliability: these waits are written by the Journey pass, so a record created as `{}`, or not yet brought up to date after its last Beat, has none and counts only through its follow-ups. A wait counts only while it can still move: none on a connection the owner removed, no choice that uses one, and no path held at its repeat limit (JRN-02). A wait on a paused connection still counts, as a paused Mix does for its people (D45), since the owner can resume it. A business update being applied waits for a message that is already being processed, and a choice being applied waits for its connection, which for a paused one lasts until it is resumed; neither clears "within seconds", as this default first said. Are these the waits that should count, and should a paused connection's?
8. **Undo and Remove end the run's Journey record (UNDO-04, the third review's question 1).** The run's Beats still to come, its decisions still waiting and its paths not yet started end with the enrollment; its settled Beats stay as history, and work the Journey already moved the person on to in another Mix keeps running. A later start of the same occurrence, by any route and on the same day too, picks the record back up. Confirm that a waiting decision on that run should end with it?

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

## Review fixes, round 2 (2026-10-06)

The WF-05 re-review of 1e69668 (`.artifacts/no-mix-release-20261006/REVIEW-2.md`) requested changes (1 HIGH, 3 MEDIUM, 7 LOW). Each fix is its own commit.

| Finding | Fix | Commit |
|---|---|---|
| JRN-01 (HIGH) | A Journey record counts only through its follow-ups and real waiting state, never by its status (default 7). Tested through the real remove, stop, archive and pause actions and the worker's passes in a Journey-connected account, including a finished Mix with no connection of its own | fb06ffb, 1e2a889 |
| BLK-02 | The bulk start leaves anyone the Mix already has work for, by any route, as they are | be24828 |
| UNDO-01 | Undo cancels only the start's own follow-ups, linked by the run's key and written since the start; never Journey-managed, visit-bound or another run's | 1bc5717 |
| UNDO-02 | Undo puts back the assignment's earlier state and a No Mix needed confirmation the start replaced (default 4) | 1bc5717 |
| PAUSE-01 | (a) Fixed: someone in a paused hand-started Mix that has prepared nothing for them counts. (b) Deferred, below | 174ecbf |
| COPY-02 | (a) and (c) fixed: the sheet and the notice follow the Mix's start type (default 6). (b) Deferred, below | 64fa113 |
| UNDO-03 | Add to the Mix stays disabled while the start is sent | 77bdbc4 |
| ERR-01 | A failed Undo returns to the list with a message | d847b73 |
| LAY-02 | One line at normal sizes; each part on its own line, shown whole, with enlarged text. A browser check covers both | 4d7bbab, da61797, 94b9a87 |
| DOC-02 | (a), (d) and (e) corrected in this record and JITM-09; (b) the citation; (c) D47's every-filter reading is default 1 | 68f01c5 and this commit |
| TST-02 | (a) and (b) the cases above; (c) the baseline comparison below; (d) the static guard; (e) below | 6e90105 and the commits above |

**Deferred, with reasons:**
- **PAUSE-01 (b).** Some `reconciled` rows, from an Undo or from removing someone's own run, belong to a person still in the Mix through its audience or a tag. While the Mix is paused they count as held, though resuming will not bring them back, so that person reads In a Mix during the pause and No Mix after it resumes. Telling them apart needs either the owner's time zone in SQL, to match each row to the run that would bring it back, which fails the page on a zone PostgreSQL doesn't know, or a new cancellation reason in the scheduler, which is outside this slice. Such a person is still enrolled in the paused Mix, but D45 counts an enrolled person only through Beats the pause holds, or when the Mix has prepared nothing for them: someone who finished the Mix before the pause does not count. These rows are what makes them count, so the reading is narrower than D45's, and it lasts only while the Mix is paused (corrected in round 3, DOC-03).
- **COPY-02 (b).** Someone whose only saved date is a past one-off date is counted as started and "follows their saved date". Whether anything comes depends on the scheduler: it still prepares Beats for a one-off date up to 45 days back, as overdue follow-ups, and Beats after it by their offsets, and it moves times for weekends and the owner's availability. Calling them "not started" at start time would itself be untrue for recent dates. The list shows them as No Mix once preparation finds nothing for them. A notice written after preparation is a question for Kevin.

## Review fixes, round 3 (2026-10-06)

The third WF-05 review of 378d4fd (`.artifacts/no-mix-release-20261006/REVIEW-3.md`) requested changes (1 HIGH, 5 LOW). Each fix is its own commit.

| Finding | Fix | Commit |
|---|---|---|
| UNDO-04 (HIGH) | Undo and Remove end the run's Journey record, and the scheduler picks an ended record back up for a later start of the same occurrence (default 8). Remove also cancels the run's Beats at once | 660c3e6 |
| BLK-03 | Anyone stopped in the Mix or marked Do not contact is never counted as already in it, so the batch is refused and names them | f958745 |
| UNDO-05 | (a) A start whose run took a business update counts as changed since. (b) Planned Beats end at once for every start type. (c)–(e) deferred, below | cc19b8d |
| JRN-02 | Waits on a removed connection, choices that use one, and paths at their repeat limit no longer count (default 7) | 397da2d |
| PERF-02 | Timings on an account where most people have finished their Mixes, below | this commit |
| DOC-03 | (a) 259, not 303; (b) default 7; (c) JITM-09's changelog order; (d) §2.77's shared rows; (e) the test comment; (f) PAUSE-01 (b)'s reason; (g) the refusal is now true | this commit, 660c3e6 for (e) |

**Deferred, with reasons:**
- **UNDO-05 (c).** A preparation pass that read the assignments before the Undo committed can still write the start's Beats afterwards. The queued pass cancels them again, but the No Mix needed confirmation Undo wrote back then lapses, so the person reads No Mix. In an account with a Journey connection, such a pass cannot pick an ended record back up, since the scheduler only reopens one for a pass that began after the end. But if it reaches a person whose record did not exist yet when Undo ran, it creates one, and that record holds the cancelled Beats as before until the owner stops it. Closing the window needs Undo and the scheduler's passes to exclude each other, or the scheduler to end records whose enrollment ended, both outside this slice. The window is the length of one preparation pass, right after a bulk start.
- **UNDO-05 (d).** An Undo while the Mix is paused leaves the start's Beats that the pause cancelled as `mix_paused`. For a restored earlier run they count as held until the Mix resumes, and the next pass then ends them. It is the same class as PAUSE-01 (b) and needs the same new cancellation reason in the scheduler.
- **UNDO-05 (e).** A repeat submit that gets past the disabled button shows its own notice, which has no Undo. After UNDO-03 that needs a second tab or a replayed request. Returning the first submit's Undo needs a per-submission key in the form and the first notice's counts in the record, so it waits for a follow-up. Each person can still be removed from the profile.

**Found, not fixed:** other ways an enrollment ends on `main` leave a run's Journey record holding its cancelled Beats the same way: a person leaving a tag that runs the Mix, an audience edit, or a Beat removed from the Mix. They are outside Undo and Remove, and closing them is the scheduler change above. Records left by Remove before this fix stay until the owner stops them; there is no data migration.

## Not in this slice

These come with the next build slice (P4–P6 in the decisions record):
- the end-of-Mix question in JITM-09 §2.77;
- the new-contact setting in §2.78;
- "Everyone" including people added later.

## Verification

### Review fixes, round 3, 2026-10-06

Run on TrixBot on 2026-10-06 against the local PostgreSQL 17.10 (`jitm-postgres`, 127.0.0.1:5432), in fresh `jitm_design_nms1006d_*` databases, with the environment of CI's `validate` job under `env -i`. The code under test is 397da2d; the commit that carries this record changes only `docs/`, and those doc changes were the only uncommitted ones during the runs (VERIFIED-RUNTIME, `git diff 397da2d -- . ':!docs'` is empty). No production, hosted database or service was touched, and no database was dropped. Evidence: `review-fixes/` (`ledger.tsv`, `logs/`, `vitest-r3/`, `playwright-r3/`, `perf-r3/`).

| Check | Label | Result |
|---|---|---|
| `npm run typecheck`, `npm run validate:static`, `node scripts/check-standards.mjs` | VERIFIED-RUNTIME | Passed on 397da2d: imports across 656 files resolve with the Server Action boundary verified; the standards check passed with one warning, JITM-09 over its 300-line target. Rerun on the final head. |
| `vitest run` with CI's unit-step environment, on a fresh migrated database, in eight calls | VERIFIED-RUNTIME | 296 files passed. Tests: 2,232 passed, 2 skipped, none failed. The same thirteen suites that create and drop their own databases were left out (`vitest-r3/excluded.txt`). The Journey suites the scheduler change touches passed: `mix-workflow.integration` 20/20, `mix-workflow-engine` 18/18, `mix-workflow-rule-save.integration` 12/12. |
| New and changed suites | VERIFIED-RUNTIME | `contact-mix-status.integration` 13/13, `contact-mix-status-lifecycle.integration` 5/5, `contact-no-mix-actions.integration` 21/21, `enrollment-workflow` 4/4 (new), `beta-follow-up-loop` 11/11. |
| The new tests catch the old code | VERIFIED-RUNTIME | With 378d4fd's files swapped back in, each failed. UNDO-04: Today's attention listed "Estimate · reconciled" for both undone people, and "reconciled" for the removed person (`logs/104b-undo04-oldcode-378d4fd.log`). BLK-03: the stopped person with a visit was kept, not refused. JRN-02: a decision on a removed connection read In a Mix. UNDO-05 (a): both starts were undone; (b): the planned Beat stayed pending. |
| UNDO-04 through the real actions and the worker's passes | VERIFIED-RUNTIME | In two Journey-connected accounts, after Undo and after Remove, the worker's scheduler and Journey passes leave nothing in `readWorkflowAttention`, which Today and the morning email read; the records stop; the plan's places are released once the reservation grace has passed; and a start of the same Mix the same day, in bulk and from the profile, picks the same record back up, with its Beats linked to it again. |
| `npm run build` | VERIFIED-RUNTIME | Passed (Next.js 16.3.6) on 397da2d with a migrated browser database; `public` and `.next/static` were copied into the standalone server, as CI does. |
| Browser specs: the record's 18 specs on desktop-chromium and mobile-chromium, against the standalone server on 127.0.0.1:3141, in batches of six, with no retries | VERIFIED-RUNTIME | Desktop: 128 passed, 9 skipped. Mobile: 97 passed, 40 skipped. None failed. They include the No Mix accessibility audit in both themes and the 200% text case. This round changes no screen, so there are no new screenshots or browser cases; what Today shows is checked through `readWorkflowAttention` above. |
| EXPLAIN ANALYZE on an account where most people have finished their Mixes (PERF-02) | VERIFIED-RUNTIME | Fresh `jitm_design_nms1006d_perf`: 5,000 people, 31,000 follow-ups, 12,301 assignments and three Journey records each, most finished, some stopped, some running with a wait, and some running with nothing to come, as Remove left them before UNDO-04. Only 500 people have a follow-up to come, so the Journey checks run for nearly everyone. Medians of three runs are below, against 378d4fd's file on the same data. A whole-account count takes about 0.4 s (0.57 s while preparation is pending), and so does the No Mix filter; a page of 50 takes 7–9 ms, and the bulk start's check for 100 people 7–9 ms. JRN-02 adds under 5%. That cost reaches Today's No Mix line, the Contacts counts and the Journey counts at this size. Acceptable at pilot scale; a stored status stays with the scale work parked for paid hosting. |
| Schema | VERIFIED-RUNTIME | `git diff a05b189 397da2d -- prisma` is empty. The Journey record's ended-run snapshot lives in its existing `state` JSON. |

| Query (5,000 people, most finished, three records each) | 397da2d, no preparation pending | 397da2d, preparation pending | 378d4fd, no preparation pending | 378d4fd, preparation pending |
|---|---|---|---|---|
| Counts for the whole account | 412.9 ms | 568.3 ms | 394.7 ms | 535.5 ms |
| Counts among 2,500 filtered people | 184.5 ms | 288.2 ms | 181.1 ms | 277.9 ms |
| Filter ids for No Mix | 423.8 ms | 608.5 ms | 410.4 ms | 571.8 ms |
| A page of 50 statuses | 7.1 ms | 8.8 ms | 6.8 ms | 8.2 ms |
| The bulk start's check for 100 people in one Mix | 6.9 ms | 9.2 ms | 6.7 ms | 8.5 ms |

### Review fixes, round 2, 2026-10-06

Run on TrixBot on 2026-10-06 against the local PostgreSQL 17.10 (`jitm-postgres`, 127.0.0.1:5432), in fresh `jitm_design_nms1006c_*` databases, with the environment of CI's `validate` job under `env -i`. The code under test is 94b9a87; the commit that carries this record changes only `docs/`. The commits from 1bc5717 on were re-created once after verification and before the first push, only to shorten one commit subject: each has the same tree as the commit verified under its earlier SHA, which the evidence's logs name (`sha-map.txt`). The commit carrying this record was re-created too, from 8d2cff3 to 378d4fd, changing only its SHA references and this note. The vitest run is on 68f01c5: the two commits after it change only `src/styles/contacts-workspace.css` and `e2e/no-mix-status.spec.ts` (VERIFIED-RUNTIME, `git diff --stat 68f01c5 94b9a87`). One early development run of the Journey tests (ledger step 50) used round 1's `jitm_design_nms1006b_dev` before the new databases existed. No production, hosted database or service was touched, and no database was dropped. Evidence: `.artifacts/no-mix-release-20261006/review-fixes/` (`ledger.tsv`, `logs/`, `vitest-r2/`, `playwright-r2/`, `playwright-r2b/`, `playwright-base/`, `screens-r2/`, `perf-r2/`).

| Check | Label | Result |
|---|---|---|
| `npm run typecheck`, `npm run validate:static`, `node scripts/check-standards.mjs` | VERIFIED-RUNTIME | Passed on 68f01c5 and on 94b9a87: imports across 655 files resolve with the Server Action boundary verified; the standards check passed with one warning, JITM-09 over its 300-line target. Rerun on the final head. |
| `vitest run` with CI's unit-step environment, on a fresh migrated database, in eight calls | VERIFIED-RUNTIME | 295 files passed. Tests: 2,224 passed, 2 skipped, none failed. Thirteen suites were left out because each creates and then drops its own disposable databases, which this task may not do: `application-catalog`, `backup-database`, `contact-import-recovery`, `database-release`, `hosted-load-fixture`, `import-lock`, `prisma-migration-residue`, `recovery-bundle`, `recovery-cutoff`, `recovery-hold-runtime`, `recovery-state`, `runtime-database-role` and `worker-runtime` (`vitest-r2/excluded.txt`). This round changes no schema, migration, worker, import, catalog or release code. |
| New and changed suites | VERIFIED-RUNTIME | `contact-mix-status.integration` 12/12, `contact-mix-status-lifecycle.integration` 5/5 (two Journey-connected accounts through the real actions and the worker's scheduler and Journey passes), `contact-no-mix-actions.integration` 18/18, `contact-mix-status-labels` 6/6, `server-action-auth-guard` 31/31, `workflow-analytics` 5/5, `mix-workflow-analytics.integration` 3/3. |
| The new tests catch the old code | VERIFIED-RUNTIME | Each failed with the file before its fix swapped back in: the JRN-01 status and lifecycle cases with 1e69668's status file; the paused-Mix case at its new joiner with fb06ffb's (PAUSE-01); the BLK-02 case with the previous actions file, which started 5 people instead of 1; the UNDO-02 case on the restored run and the UNDO-01 case on the other routes' follow-ups (0 of 5 left pending) with be24828's; the Journey-connected Undo case with be24828's, on the confirmation; the ERR-01 case with 1bc5717's, which threw instead of returning; and the enlarged-row browser check on 68f01c5's build, on the "·" left alone on a line. |
| `npm run build` | VERIFIED-RUNTIME | Passed (Next.js 16.3.6) on 68f01c5 and on 94b9a87, each with a migrated browser database. The standalone server then needs `public` and `.next/static` copied in, as CI's "Prepare standalone browser server" step does; that is its own ledger step. The first batch on 68f01c5 ran before the copy, so every case failed at sign-in with the page's scripts missing; it was stopped and rerun after the copy. |
| Browser specs: the record's 18 specs on desktop-chromium and mobile-chromium, against the standalone server on 127.0.0.1:3141, in batches of six, with no retries | VERIFIED-RUNTIME | On 94b9a87: desktop 128 passed, 9 skipped; mobile 97 passed, 40 skipped; none failed. On 68f01c5, before the last two commits: desktop 128 passed, 8 skipped; mobile 96 passed, 40 skipped; none failed. |
| New browser cases | VERIFIED-RUNTIME | The bulk case shows the sheet's wording for a fixed-date and a hand-started Mix, with the start day only for the latter, holds the start request to show "Adding…" disabled, and reads the new Undo notice (desktop). The row check measures one line at 320 and 390 and whole parts on lines of their own at 200% text (mobile). |
| Baseline comparison (TST-02 c) | VERIFIED-RUNTIME | `origin/main` at 262892e, built as a production build and served on 127.0.0.1:3142 with the CI environment and its own fresh database (74 migrations). The Journey batch on mobile passed (39 passed, 13 skipped), and `journey-connections.spec.ts:312` passed alone twice. On the candidate, `:312` passed inside its batch on both projects and both builds this round. Round 1's single in-batch failure did not recur on either build, so it stays classified as intermittent, not new (JITM-12 §2.14). |
| Accessibility | VERIFIED-RUNTIME | The No Mix audit runs axe (WCAG 2.0, 2.1 and 2.2 AA) on the filtered list and on the profile with its sheet, at 1280 and 390, in light and dark: no violations on either build. `accessibility.spec.ts` passed on both projects. |
| Enlarged text and keyboard | VERIFIED-RUNTIME | The 200% case of `sheet-interactions.spec.ts`, which includes `/contacts`, passed in both themes on both projects, and the keyboard pass passed on desktop. |
| Screenshots | VERIFIED-RUNTIME, inspected | Production build 94b9a87, synthetic people, light and dark (`screens-r2/`). Contacts at 320 and 390 with a real stage and a due label, "Waiting on a decision · Earlier today, 3:00 AM", beside "Estimate sent · No Mix" and "No stage · No Mix needed": one line each; at 320 the stage and the due label shorten with an ellipsis, as the export's rows do (`r2-export-contacts-390-*`), and nothing scrolls sideways. At 320 with 200% text each part is whole on its own line, with no "·". The bulk Mix sheet at 320 for a hand-started Mix, with Start on, and a fixed-date Mix, without. The bulk start notice and the Undo notice at 901, including "1 person is marked No Mix needed again.", after which the person reads No Mix needed. |
| EXPLAIN ANALYZE on a synthetic 5,000-person account with a Journey connection | VERIFIED-RUNTIME | Fresh `jitm_design_nms1006c_perf`: 5,000 people, 42,155 follow-ups, 12,301 assignments, and one Journey record per person with saved state (a run, three visits, and for some a waiting decision, a waiting path or an open check-back date), most of them ACTIVE after their work ended. Medians of three runs, against 1e69668's status file on the same data, are below. The Journey checks add about 60–90 ms to a whole-account count and about 70–110 ms to the No Mix filter at this size; a page of 50 is unchanged. They also correct the result: 259 people read No Mix whom 1e69668 counted as In a Mix by their records' status alone; 303 read No Mix in all, against 44 before (corrected in round 3, DOC-03). |
| Schema | VERIFIED-RUNTIME | `git diff a05b189 94b9a87 -- prisma` is empty, so the migration is unchanged. Every test database was migrated with `npm run db:deploy` (75 migrations). |

| Query (5,000 people, one Journey record each) | 94b9a87, no preparation pending | 94b9a87, preparation pending | 1e69668, no preparation pending | 1e69668, preparation pending |
|---|---|---|---|---|
| Counts for the whole account | 80.2 ms | 108.8 ms | 16.2 ms | 20.1 ms |
| Counts among 2,500 filtered people | 9.0 ms | 9.3 ms | 11.4 ms | 11.6 ms |
| Filter ids for No Mix | 173.9 ms | 214.3 ms | 101.5 ms | 107.9 ms |
| A page of 50 statuses | 1.5 ms | 1.5 ms | 1.4 ms | 1.3 ms |
| The bulk start's check for 100 people in one Mix | 8.5 ms | 9.2 ms | not present | not present |

### Review fixes, 2026-10-06

Run on TrixBot on 2026-10-06 against the local PostgreSQL 17.10 (`jitm-postgres`, 127.0.0.1:5432), in fresh `jitm_design_nms1006b_*` databases, with the environment of CI's `validate` job under `env -i`. The code under test is 3a3799d; the commit that carries this record changes only `docs/` (VERIFIED-RUNTIME, `git diff --stat`). No production, hosted database or service was touched.

| Check | Label | Result |
|---|---|---|
| `npm run typecheck` | VERIFIED-RUNTIME | Passed on 5953a70 and again on the final head. |
| `npm run validate:static` | VERIFIED-RUNTIME | Passed: the schema is valid and imports across 655 files resolve, with the Server Action boundary verified. Rerun on the final head. |
| `node scripts/check-standards.mjs` | VERIFIED-RUNTIME | Passed with one warning: JITM-09 has 318 lines, over the 300-line target. Rerun on the final head. |
| Full `vitest run` with CI's unit-step environment, on a fresh migrated database, in nine calls | VERIFIED-RUNTIME; 4 files BLOCKED | 308 files: 301 passed, 4 failed, 3 skipped. Tests: 2,281 passed, 24 failed, 41 skipped. All 24 failures are `spawn pg_dump ENOENT` in the four backup and recovery suites. The host has no PostgreSQL client tools, so they are BLOCKED by the environment (JITM-12 §2.17), exactly as in the run on a05b189. Corrected in round 2: this run included the suites that create and then drop their own disposable databases (listed in round 2's row), so it did drop databases those suites had just created, though no other database; round 2 leaves them out. |
| New and changed suites | VERIFIED-RUNTIME | `contact-mix-status.integration` 12/12, `contact-mix-status-lifecycle.integration` 3/3 (the real Mix save, pause, resume, per-person stop and the worker's preparation call), `contact-no-mix-actions.integration` 15/15, `contact-mix-status-labels` 5/5, `workflow-analytics` 5/5. |
| The new tests catch the old code | VERIFIED-RUNTIME | With a05b189's `src/lib/contact-mix-status.ts` swapped back in, both DEF-01 lifecycle cases fail. The D45 lifecycle case, the paused-Mix status case and the restored-row lapse case fail with 7055362's file, which has the DEF-01 fix but not DEF-02's (`logs/05-def02-oldcode.log`), not with a05b189's as this row first said (DOC-02). |
| `npm run build` | VERIFIED-RUNTIME | Passed (Next.js 16.3.6) on 5953a70 with the migrated browser database; the app code has not changed since. A first attempt before that database existed also passed but logged Prisma errors from static generation, so the build was repeated in CI's order. |
| Browser specs: the record's 18 specs on desktop-chromium and mobile-chromium, against the standalone server on 127.0.0.1:3141, with no retries | VERIFIED-RUNTIME | Desktop: 127 passed, 8 skipped, 1 failed. Mobile: 95 passed, 40 skipped, 1 failed. The two failures are classified below. |
| Desktop failure: `no-mix-status.spec.ts`, the new keyboard pass | VERIFIED-RUNTIME, fixed in the test | It pressed Tab before the page had focus. The first key press made the account boundary re-check the browser and hold the page inert, so Tab never reached the chip. The pass now starts at the skip link once the check is done (3a3799d), and passed. |
| Mobile failure: `journey-connections.spec.ts:312` | VERIFIED-RUNTIME, order-dependent | "Selected path" did not appear after a path was chosen. It passed alone twice. Nothing in this change touches Journey editing (JITM-12 §2.14). Round 2 compared it with the baseline build. |
| `no-mix-status.spec.ts` on the code under test | VERIFIED-RUNTIME | Rerun whole on 3a3799d, after the keyboard fix: desktop 7/7 passed; mobile 3 passed, with the 4 desktop-only cases skipped. |
| `design-correction.spec.ts` | VERIFIED-RUNTIME | 14/14 on each project, including `:111`. The known flake is described under Found, not fixed. |
| Accessibility | VERIFIED-RUNTIME | `no-mix-status.spec.ts` runs axe (WCAG 2.0, 2.1 and 2.2 AA) on the filtered list and on the profile with the sheet open, at 1280 and 390, in light and dark, after the bounded animation wait: no violations. `accessibility.spec.ts` passed (desktop 2, mobile 1, plus 1 desktop-only case skipped). |
| 320px with 200% text | VERIFIED-RUNTIME | The enlarged-text case of `sheet-interactions.spec.ts` now includes `/contacts` with a No Mix row and a No Mix needed row. It passed in light and dark on both projects: no sideways scroll, each label whole and inside its row. |
| Keyboard only | VERIFIED-RUNTIME | The keyboard pass reaches the chip with Tab and shows its focus ring, then opens the What's next sheet and tabs through its controls; Escape returns focus to the chip. It then selects a person, opens the bulk Mix sheet and tabs through it, marks No Mix needed and presses Undo, all from the keyboard (desktop). |
| Screenshots | VERIFIED-RUNTIME, inspected | Production build with synthetic people, light and dark, at 320, 900 and 901, and at 320 with 200% text. They cover the Contacts list, the profile and its What's next sheet, and the Today line, plus the filter sheet and the bulk Mix sheet at 320 and 901 and the bulk notice and its Undo notice at 901. They were compared with the export's Contacts screens: the row is still name, then stage · next. The chip is 44px tall at 320 and 900 and 30px at 901. Nothing scrolls sideways. At 200% text with this change's row styles removed, "No Mix needed" is cut off at the edge and the sort control is clipped; with them, both wrap. Two visible effects of the wrap: at 200% text the "·" stays at the end of the first line, and at 320px, when the "with No Mix" link shows, the sort control moves to its own line. The captures stay private in `.artifacts/` (JITM-12 §2.19). |
| EXPLAIN ANALYZE on a synthetic 5,000-person account | VERIFIED-RUNTIME | Fresh `jitm_design_nms1006b_perf` database: 5,000 people, 41,600 follow-ups and 12,301 assignments, across an Everyone Mix, a date-based Everyone Mix, a paused Mix and a tag's Mix. Median execution of three runs is shown below. A page of 50 statuses takes about 5 ms. The whole-account count takes 37 ms, or 81 ms while preparation is pending, against 30 ms for a05b189's definition on the same data. Counting among 2,500 filtered people takes 9 ms. The plans use hashed sub-plans for pending Beats and Journey work, one-time init plans for the "anything paused" and "anything preparing" guards, and per-person index scans; no loop is larger than the number of people. |
| Schema | VERIFIED-RUNTIME | `git diff a05b189 <head> -- prisma` is empty, so the migration is unchanged. Both test databases were migrated with `npm run db:deploy` (75 migrations). |

The timings below are for an account without Journey records in their saved state; round 2's table above covers one with them.

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
- **A fixed-date Mix started from the profile confirms "Start saved for {day}".** A fixed-date Mix goes out on its own date, so the day does nothing. This is existing behavior of the profile's start, outside this change; the bulk sheet and notice no longer name a day for it (COPY-02).
- **At 320px, when the "{n} with No Mix" link shows, the sort control moves to a line of its own.** The re-review left this to Kevin, with the "·" at a line end that round 1 left at 200% text; the "·" is now hidden there, since each part takes its own line.

## NOT RUN

- `db:rehearse-migration` and `db:verify-release`: the schema and migration did not change since a05b189, whose record ran them. Here the databases were migrated only with `db:deploy`.
- `npm run test:isolated`: it drops the database it creates, and this task may not drop databases. Its one isolation-only case, in phone canonicalization, is untouched by this change.
- Round 2: the thirteen vitest suites that create and drop their own databases, including `worker-runtime`, which is what `npm run worker:qualify` runs (TST-02 e). Round 1 ran them inside its full vitest run on 5953a70, `worker-runtime` 10/10 with `RUN_WORKER_UNATTENDED_TESTS=true` (`vitest/chunk-worker-runtime.json`). This round changes neither the worker nor the job payload: the bulk start and its Undo queue the same `generate-jumps` jobs as in round 1.
- The four backup and recovery suites: BLOCKED, because there is no `pg_dump` on the host.
- The worker process: preparation was exercised by calling the worker's `generateJumps` for each queued job, as `src/worker/index.ts` does, not by running the worker.
- System theme mode; only Light and Dark were emulated.
- GitHub Actions: BLOCKED by billing, as the re-review found (`REVIEW-2.md` §4); CI's jobs were reproduced locally as above.
- Round 3: the same thirteen suites that create and drop their own databases, and a browser case for Today after Undo in a Journey-connected account (no worker runs in the browser suites; the integration tests read the same attention Today renders).
- Housekeeping for Kevin: the local evidence databases stay on TrixBot, since agents may not drop databases: `jitm_design_nms1006b_{dev,e2e,perf,vitest}`, `jitm_design_nms1006c_{base,dev,e2e,e2eb,perf,vitest}` and `jitm_design_nms1006d_{dev,e2e,perf,vitest}`.
- Other CI jobs: `security:audit` (no dependency change), gitleaks, Lighthouse (no public page changed), the Docker image builds, the packaged-server and load suites, `scheduler:check` and `db:rehearse-restore` (BLOCKED for the same `pg_dump` reason).
- Physical phones and tablets.
- Production and hosted environments. Nothing was released or deployed.
