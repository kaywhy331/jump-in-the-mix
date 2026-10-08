# Stages follow-up: pausing, removing and resuming — 2026-10-08

**Status:** PR #134 (`feat/mix-stages-followup-20261008`), not merged or released. It builds D63, D64 and D65 and fixes UX-09, the LOW finding that the eighth review of PR #132 moved here. It follows [Stages from the work](MIX_STAGES_2026-10-07.md), released as `prod-2026-10-08-dae3fab`. The first WF-05 review requested changes (2 MEDIUM, 7 LOW). Every finding is fixed or answered below, and a second review is next.

**Decisions** (2026-10-07; Kevin: "I will go based on your recommendations for all the answers"; the log is in `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`):
- **D63:** a paused Everyone Mix takes in no newcomers, even when the owner saves it while it is paused (D58, applied to the editor). Turning it back on takes them in.
- **D64:** Remove on an Everyone Mix stops that Mix for the person, so no later save or resume puts them back in it.
- **D65:** a tag added while a Mix is paused moves its members to the Mix's stage when the Mix resumes, after the same review as adding a tag to a Mix that is on.

**Rules:** JITM-09 §2.78 and §2.79 (7.0.0). Five readings the decisions leave open are agent defaults, listed below for Kevin.

**Concept fit (JITM-01 §2):** a Contact stage tells the owner where each person is, so it has to change only when the owner can see why. These changes keep a pause from silently swallowing a move (D63, D65), keep a person the owner took out of a Mix out of it (D64), and make the number in the review match what the save does (UX-09). Nothing about sending changes.

## What changed

### D63: a save that keeps an Everyone Mix paused places no newcomers

- **Before.** A "Keep paused" save gave a place to everyone without one, so people added during the pause were absorbed. When the Mix came back on, they weren't taken in, and their stage was never set (UX-04).
- **Now.** A save that leaves an Everyone Mix paused gives no place to someone who has none (`saveMixAction`, `src/lib/mix-editor-actions.ts`). Turning the Mix back on, in the editor or with Start Mix on the Mixes list, takes them in from that moment (D58). Those with no stage yet, added before Contact stages were turned on, move to the Mix's stage (D66).
- The places people already have are re-synced as before, and that moves no one (UX-03).
- Ticking Everyone on a paused Mix still gives everyone it covers then a place; only people added after that wait for the resume (agent default 1).

### D64: removing an Everyone place is a stop

- **Remove** on a person's page (`removeMixAssignmentAction`, `src/lib/contact-mix-actions.ts`), when the enrollment is the person's Everyone place:
  - writes a stop for that Mix, with the reason `mix.everyone.removed`;
  - ends the person's other open follow-ups from it, as Stop Mix does (agent default 5);
  - keeps a stop the owner or the plan limit had already written. A stop a stage wrote when the person left it becomes Remove's own, because re-entering that stage would lift it (STOP-01);
  - first takes a key share of the business's row, so it waits for a Mix save in progress, and a later save waits for it (LCK-04).

  Removing the person's own start, or a Mix lined up with a visit, is unchanged.
- **No save or Start Mix puts them back.** Neither the editor's save nor Start Mix on the list (`activateMixAction`, `src/lib/mix-lifecycle-actions.ts`) gives a place to someone stopped in the Mix whose place is off or missing. The save reads the places under its lock (LCK-04). Someone stopped with Stop Mix keeps their place through a re-save while it is on. Once it has gone off, for example when Everyone was unticked and ticked again, it stays off until Resume.
- **The dialog says so** (`src/components/ContactProfile.tsx`). On an Everyone place it reads: "This Mix is for Everyone, so removing stops it for {name}. Saving or starting the Mix again won’t add them back, but you can resume it here. Completed history stays available." Other places keep "Completed history stays available."
- **Resume shows wherever the Mix is.** After a Remove, the Mix shows under "Other stopped Mixes", with Resume, whether it is on, paused or a draft. That list now holds every Mix the person is stopped in, apart from archived ones; before, it held only Mixes that are on (UX-10).
- **Resume** (`resumeMixForContactAction`, `src/lib/mix-stop-actions.ts`) lifts the stop, as before. On a Mix still for Everyone (on, paused or a draft), it also turns the place of a person who isn't archived back on (agent default 2):
  - a Mix the owner starts runs for them from today;
  - a date-based or fixed-date Mix follows its own dates.

  Without that, Resume would say "Mix resumed." while the Mix stayed off for them. Resume reads the Mix under a share of its row, so a save that unticks Everyone at the same moment can't leave a place behind (LCK-04). Resuming sets no stage, as before.
- **Removals made before this change** wrote no stop, so a save can still put those people back. A backfill is possible (DOC-09): every Remove since 2026-07-22 wrote a `mix.assignment.deactivate` audit entry naming the place, and archiving touches no places. It isn't done here (agent default 4).

### D65: a tag added while a Mix is paused moves its members when it comes back on

- **The mark.** `MixAssignment.addedWhilePaused` marks a tag that a save added while leaving the Mix paused.
  - A later save of the paused Mix that keeps it paused keeps the mark.
  - A save that turns the Mix on or makes it a draft clears it, and so does Start Mix on the list.
  - Pausing a Mix that was running, from the list or the editor, also clears it. A mark there can only be left from before a rollback (RBK-01).
  - A tag the save drops keeps its mark on its inactive row, which nothing reads, and adding the tag again sets the mark anew.
- **Turning the Mix back on** starts the marked tags. Their members move to the Mix's stage from any stage, as when a tag is added to a Mix that is on. A tag that was on the Mix before the pause moves no one, and a hidden tag runs nothing.
- **The review is forced** (D62):
  - In the editor, the button reads "Review and start", and the review counts the marked tags' members.
  - The server refuses the save without the review: "Review who moves to the Mix’s stage before turning it back on."
  - Start Mix on the Mixes list opens the editor's review whenever the Mix names a stage and has a marked tag that is shown. It checks again under the business's lock, so a tag marked from another device a moment before is reviewed too (LCK-04). For a Mix with no stage, the list starts the marked tags (nothing moves) and clears the mark.

### UX-09: the resume review counts the people Everyone takes in

- **The count.** `stageMovesForAudience` (`src/lib/mix-stage.ts`) has a `resume` option, sent by the editor as `/api/contacts/audience?stageResume=1`. It counts the people Everyone takes in when the Mix comes back on: no place in the Mix, and in it by no other route (their own start, a visit, a Journey run, or a tag the save keeps). Of those, it counts the ones with no stage yet, added before Contact stages were turned on. The members of the tags the save starts are counted from any stage, as before.
- **When it shows.** The editor shows this count whenever its review opens on a resume with Everyone still ticked: when a tag forces the review (D65, or a tag added in the same save), and when the review preference opens it. In the eighth review's example (three tag members, and Sam, whom Everyone takes in), the count is now 4 where it was 3; the integration test runs the same case with two tag members.
- **No forced review for a plain resume.** A resume that starts no tag still isn't forced to a review: it moves only the rare person Everyone takes in with no stage. This keeps the scope Kevin confirmed with defaults 1–16 ("Not reviewed: resuming a paused Mix").
- **One helper.** `peopleInMixByOtherRoutes` moved from `src/lib/new-contact-placement.ts` to `src/lib/mix-stage.ts`, so the count and the save use the same test. A new `tags` parameter reads the tag route from the tags the save will keep, so a tag dropped in the same save counts as dropped, as it does in the save.

### Schema

One additive migration, `20261008120000_mix_assignment_added_while_paused`:

```sql
ALTER TABLE "MixAssignment" ADD COLUMN "addedWhilePaused" BOOLEAN NOT NULL DEFAULT false;
```

- The default is a constant, so Postgres adds the column without rewriting the table.
- The previous release's code never reads the column.
- There are now 79 migrations.

### Rollback

Rollback is a redeploy of `prod-2026-10-08-dae3fab`, the web service first and then the worker. The column stays (JITM-14 §2.23). The previous code:
- **ignores the mark, and never clears it,** so a tag added while paused moves no one at resume, as before this change;
- **treats a stop written by Remove as any stop.** The profile shows the Mix as stopped, with Resume, while the Mix is on. The old Resume lifts the stop but doesn't turn the place back on, and the next save of the Everyone Mix gives it back;
- **places newcomers again** on a "Keep paused" save.

**On promoting again** (RBK-01): a mark set before the rollback survives the previous code turning that Mix back on. This code clears marks whenever a running Mix is paused, so a stale mark can reach a resume only on a Mix the previous code turned on and paused again. Before promoting again, clear the marks on Mixes that were turned on or saved while the previous code ran:

```sql
UPDATE "MixAssignment" SET "addedWhilePaused" = false
WHERE "addedWhilePaused" AND "mixId" IN (
  SELECT "entityId" FROM "AuditLog"
  WHERE "entityType" = 'Mix' AND action IN ('mix.activate', 'mix.update', 'mix.pause') AND "createdAt" >= '<rollback time>'
);
```

Clearing every mark is also safe. The only cost is that tags added before the rollback, to Mixes still paused, then move no one at resume, as before D65.

## Agent defaults for Kevin

1. **Ticking Everyone on a paused Mix works as before.** Everyone it covers at that save gets a place, so the resume neither moves them nor is reviewed; only people added later wait for the resume. D63 speaks of newcomers, and this keeps every other paused save as it was. *Should ticking Everyone while paused instead work like a tag added while paused (D65): people with no stage move at the resume, after the review?*
2. **Resume after a Remove from an Everyone Mix gives the person's place back.** A Mix the owner starts restarts for them from today, and the run Remove ended picks up again when it is the same day. A date-based or fixed-date Mix follows its own dates. *Agreed?*
3. **A tag given to a person while a Mix that runs for that tag is paused moves no one when the Mix resumes.** A tag given later moves people only while its Mix is on (§2.79). D65 covers tags added to the Mix, not people added to the tag. *Should the resume move them too, after the review?*
4. **Removals made before this change stay without a stop,** so a save can still put those people back. A backfill can find them: every Remove since 2026-07-22 is in the audit log, by place, and archiving touches no places. The only case it can't settle is a removal that a later save had already undone. *Should the release write a stop for each Everyone place that is off, has no stop, and whose last change was a recorded Remove? The review recommends yes.*
5. **Removing an Everyone place stops that Mix for the person by every route,** since D64 makes it a stop:
   - a tag that runs it;
   - their own start;
   - a visit's Beats;
   - Journey runs;
   - a run their stage manages: that stage's "Mix completed" rule then never fires, and re-entering the stage doesn't restart it.

   Resume brings back the Everyone place, but not the other routes' cancelled follow-ups. *Is that what "stops that Mix for the person" means? Or should Remove leave the other routes running, and only keep Everyone from putting them back? Recommended: as built.*

## Tests

**Integration** (`tests/mix-stage.integration.test.ts`, "pausing, removing and resuming (D63–D65, UX-09)"), ten tests:
- a "Keep paused" save gives no place to people added during the pause, and turning the Mix back on takes them in and moves those with no stage (D63, D58);
- ticking Everyone on a paused Mix gives today's people a place, and only people added later wait (D63, agent default 1);
- Remove on an Everyone place writes the stop and ends the person's follow-up from another route; neither a save nor a pause and Start Mix on the list puts the person back, nor gives a place to someone stopped before they had one; removing an own start writes no stop; Resume gives the place back, starting from today (D64, agent defaults 2 and 5);
- a tag added while paused is marked, and a second "Keep paused" save keeps the mark. Start Mix on the list opens the review, and the editor refuses the resume without it. The confirmed resume moves exactly the people the review counted, from any stage, leaves a tag that was on before the pause alone, and clears the mark (D65);
- Start Mix on the list clears the mark on a Mix without a stage (D65);
- a draft save clears the mark, and so does pausing a running Mix from the list or the editor (D65, RBK-01);
- Start Mix on the list doesn't review a marked tag that is hidden, which moves no one (D65);
- Remove turns a stage's exit stop into its own, and keeps a plan-limit stop (STOP-01);
- review-8's case: resuming an Everyone Mix while adding a tag counts the tag's members and the person Everyone takes in (3, where the old count gave 2), and the save moves exactly those (UX-09);
- a tag the save keeps leaves its members out of Everyone's intake, and a tag it drops doesn't (UX-09).

Each fix was reverted in turn: with any one of the eighteen reverted, at least one of these tests fails (ledger steps F1-M1 to F1-M11 and F8-M12 to F8-M19). The checks LCK-04 adds under the locks guard races between two devices; no test runs them concurrently.

**Browser** (`e2e/mix-stages.spec.ts`), at 390px:
- **D65 and UX-09.** A tag is added with "Keep paused", and Start Mix on the list then opens the review although this owner's review preference is off. The review reads "Starting moves 2 people to Prospect, including 1 now in another stage.", counting the tag's member and the person Everyone takes in; the confirmed start moves both. Axe runs in both themes.
- **D64 and UX-10,** on a paused Mix. The Remove dialog's wording on an Everyone place; after Remove, the Mix appears under "Other stopped Mixes", and Resume brings it back. Axe runs in both themes.

## Verification

Run on TrixBot, against fresh local databases (`jitm_design_msf1008_*`), with the environment of CI's validate job. Logs, JSON reports and the ledger are in `.artifacts/mix-stages-followup-20261008/verification/` (private). Steps F1 to F7 ran on the first build, before the PR (c31374b); F8 and F9 ran on the working tree with the first review's fixes, committed after them.

| Check | Label | Result |
|---|---|---|
| `db:generate`, typecheck, `validate:static` | VERIFIED | Passed (F2-01, F2-02; again F8-02, F8-03). |
| Stage integration tests | VERIFIED | `mix-stage.integration` 49/49: the 39 earlier ones and 10 new (F8-01). |
| Full Vitest, in the eight chunks of the last release, on a fresh database | VERIFIED; four suites BLOCKED | With the review's fixes: 312 files, 2,440 tests, 2,375 passed and 41 skipped (F9-03, totals from the JSON). The 24 failures are all `spawn pg_dump ENOENT` in `backup-database`, `recovery-bundle`, `recovery-cutoff` and `recovery-state`, as in the last release: TrixBot has no `pg_dump` (JITM-12 §2.17), and this change touches no backup code. The first run (F5-03) gave 2,372 passed, 41 skipped and the same 24. |
| Migration | VERIFIED | `db:rehearse-migration` passed; `db:verify-release` reported `{"status":"ready","required":79,"missing":0,"mismatched":0}` (F6-02 to F6-04). The fixes changed no migration. |
| `npm run worker:qualify` | VERIFIED at c31374b | 10/10 (F6-05). The fixes don't touch the worker's code. |
| Production build | VERIFIED | Passed (F3-01; again F8-04). |
| Browser specs against the standalone build, desktop and phone, no retries | VERIFIED; one first-attempt failure, recorded | **With the fixes,** no failures: <br>• batch S with the contact and visit specs: desktop 49 passed, phone 38 passed and 6 skipped (F8-09, F8-10);<br>• batch M: desktop 33 passed, phone 30 passed and 3 skipped (F8-11).<br>**First build:** batch S desktop 41, phone 36; batch M with the contact and visit specs desktop 41, phone 32 passed and 9 skipped; no failures (F4-01 to F4-04).<br>**The one failure** (TST-09): before those runs, the new D64 test failed on its first attempt (F3-06), because its click on the "More" summary closed a section that was still open. The test now opens it only when it is closed (F3-07). |
| Accessibility | VERIFIED | Axe (WCAG 2.0, 2.1 and 2.2 AA) passes in light and dark on the resume review and the Remove dialog. |
| Screenshots | VERIFIED, inspected | `screens/stage-review-resume-390-*.png` and `screens/remove-everyone-390-*.png`; `screens-r1/` holds the same with the fixes. |
| Baseline comparison (JITM-12 §2.14) | NOT RUN | The one browser failure was in the new test itself, not the product. |

## First review

Round 1 (`.artifacts/mix-stages-followup-20261008/REVIEW.md`, private) at c31374b: changes requested, 2 MEDIUM and 7 LOW. It found D63, D65 and UX-09 built as written in every path, and the review's count equal to what the save moves in all twelve resume cases it traced.

| ID | Severity | Finding | Fix |
|---|---|---|---|
| UX-10 | MEDIUM | After a Remove on a paused or draft Everyone Mix, the person's page offered no Resume, though the dialog says "you can resume it here": "Other stopped Mixes" held only Mixes that are on. | The list holds every Mix the person is stopped in, apart from archived ones; the browser test removes from a paused Mix. |
| RBK-01 | MEDIUM | The record said nothing needed cleaning on promoting again after a rollback; the previous code never clears a mark, so a stale one could move a tag's members at a later resume. | Pausing a running Mix, from the list or the editor, clears its marks, and only a save of a paused Mix carries one forward. "Rollback" gives the clean-up for the remaining case. |
| DOC-09 | LOW | Default 4 said a backfill couldn't tell a removal from an archive; the audit log can. | Default 4 restated, with the review's recommendation. |
| DOC-10 | LOW | Default 2's "from today", default 5's reach, when the mark is cleared, when a stopped person's place is kept, §2.78's tag, and §2.79's list of reviewed saves. | Reworded here; §2.78 cites this record as `[SOURCE]`; §2.79 names ticking Everyone or adding a tag as a paused Mix comes back on. |
| STOP-01 | LOW | Remove kept a stage's exit stop, which re-entering the stage lifts, so a later save could put the person back. | Remove turns that stop into its own; tested. |
| LCK-04 | LOW | Three checks outside their locks: Resume's Everyone check, Start Mix's forced-review check, and the save's read of the places. | Resume shares the Mix's row; Start Mix checks again under the business's lock; the save reads the places under its lock, and Remove takes the business's key share first. |
| TST-08 | LOW | No test for a second "Keep paused" save, a draft save clearing the mark, default 5's cancellation, Resume's start date, Remove on a paused Mix, or a hidden marked tag. | Added (Tests). |
| TST-09 | LOW | The D64 browser test failed on its first run, and the record said no browser test failed. | Recorded under Verification. |
| SEMVER-01 | LOW | 6.10.0 changed the meaning of shipped rules. | JITM-09 7.0.0. |

## Found, not fixed

- **A draft saved with "Keep paused" and then started counts as a resume, not a turn-on** (first review §10). "Keep paused" is offered for any saved Mix, drafts included, so a stage-naming draft that goes from draft to paused to on never starts its whole audience or opens the UX-01 review. Older than this change.
- **Two Resumes at once:** the second fails on the stop it can't delete. Older than this change.
- **Remove checks the support view itself,** with `requireWorkspace()` and an impersonation check, rather than `requireWritableWorkspace()` (JITM-11 §2.11). Older than this change.
- **Still open from #132:** an editor save drops hidden tags from a Mix; "Everyone" runs into its count in the editor; the editor's sticky buttons at 320px with 200% text; the "Mega-mixes" tab label.

## NOT RUN

- A second WF-05 review of the fixes.
- Physical devices.
- 320px with 200% text and the keyboard on the two new dialog states: both use the existing review and confirmation dialogs, which `mix-stages` checks at 320px elsewhere.
- CI on GitHub: Actions are blocked by billing, so the jobs ran locally as above.
- Lighthouse.
- How many accounts have a paused Everyone Mix that names a stage, or Everyone places removed before this change: production wasn't queried.
