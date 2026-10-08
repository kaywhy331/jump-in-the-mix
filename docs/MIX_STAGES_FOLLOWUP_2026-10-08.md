# Stages follow-up: pausing, removing and resuming — 2026-10-08

**Status:** built on `feat/mix-stages-followup-20261008`, not merged or released. It builds D63, D64 and D65 and fixes UX-09, the LOW finding that the eighth review of PR #132 moved here. It follows [Stages from the work](MIX_STAGES_2026-10-07.md), released as `prod-2026-10-08-dae3fab`. No WF-05 review has run yet.

**Decisions** (2026-10-07; Kevin: "I will go based on your recommendations for all the answers"; the log is in `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`):
- **D63:** a paused Everyone Mix takes in no newcomers, even when the owner saves it while it is paused (D58, applied to the editor). Turning it back on takes them in.
- **D64:** Remove on an Everyone Mix stops that Mix for the person, so no later save or resume puts them back in it.
- **D65:** a tag added while a Mix is paused moves its members to the Mix's stage when the Mix resumes, after the same review as adding a tag to a Mix that is on.

**Rules:** JITM-09 §2.78 and §2.79 (6.10.0). Five readings the decisions leave open are agent defaults, listed below for Kevin.

**Concept fit (JITM-01 §2):** a Contact stage tells the owner where each person is, so it has to change only when the owner can see why. These changes keep a pause from silently swallowing a move (D63, D65), keep a person the owner took out of a Mix out of it (D64), and make the number in the review match what the save does (UX-09). Nothing about sending changes.

## What changed

### D63: a save that keeps an Everyone Mix paused places no newcomers

- **Before.** A "Keep paused" save gave a place to everyone without one, so people added during the pause were absorbed. When the Mix came back on, they weren't taken in, and their stage was never set (UX-04).
- **Now.** A save that leaves an Everyone Mix paused gives no place to someone who has none (`saveMixAction`, `src/lib/mix-editor-actions.ts`). Turning the Mix back on, in the editor or with Start Mix on the Mixes list, takes them in from that moment (D58). Those with no stage yet, added before Contact stages were turned on, move to the Mix's stage (D66).
- The places people already have are re-synced as before, and that moves no one (UX-03).
- Ticking Everyone on a paused Mix still gives everyone it covers then a place; only people added after that wait for the resume (agent default 1).

### D64: removing an Everyone place is a stop

- **Remove** on a person's page (`removeMixAssignmentAction`, `src/lib/contact-mix-actions.ts`), when the enrollment is the person's Everyone place, also writes a stop for that Mix, with the reason `mix.everyone.removed`, and ends the person's other open follow-ups from it, as Stop Mix does (agent default 5). Removing the person's own start, or a Mix lined up with a visit, is unchanged.
- **No save or Start Mix puts them back.** Neither the editor's save nor Start Mix on the list (`activateMixAction`, `src/lib/mix-lifecycle-actions.ts`) gives a place to someone stopped in the Mix who has no active place. The save still re-syncs the place of someone stopped with Stop Mix, whose place stays on.
- **The dialog says so** (`src/components/ContactProfile.tsx`). On an Everyone place it reads: "This Mix is for Everyone, so removing stops it for {name}. Saving or starting the Mix again won’t add them back, but you can resume it here. Completed history stays available." Other places keep "Completed history stays available." After a Remove, the Mix shows under "Other stopped Mixes", with Resume.
- **Resume** (`resumeMixForContactAction`, `src/lib/mix-stop-actions.ts`) lifts the stop, as before. On a Mix still for Everyone, whether on or paused, it also turns the person's place back on, starting from today (agent default 2). Without that, Resume would say "Mix resumed." while the Mix stayed off for them. Resuming sets no stage, as before.
- **Removals made before this change** wrote no stop, so a save can still put those people back. There is no backfill: an inactive place can also mean the person was archived when the Mix was saved (agent default 4).

### D65: a tag added while a Mix is paused moves its members when it comes back on

- **The mark.** `MixAssignment.addedWhilePaused` marks a tag that a save added while leaving the Mix paused. A later save that keeps the Mix paused keeps the mark, and any other save, or Start Mix on the list, clears it.
- **Turning the Mix back on** starts the marked tags. Their members move to the Mix's stage from any stage, as when a tag is added to a Mix that is on. A tag that was on the Mix before the pause moves no one, and a hidden tag runs nothing.
- **The review is forced** (D62):
  - In the editor, the button reads "Review and start", and the review counts the marked tags' members.
  - The server refuses the save without the review: "Review who moves to the Mix’s stage before turning it back on."
  - Start Mix on the Mixes list opens the editor's review whenever the Mix names a stage and has a marked tag that is shown. For a Mix with no stage, the list starts the marked tags (nothing moves) and clears the mark.

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
- **ignores the mark,** so a tag added while paused moves no one at resume, as before this change;
- **treats a stop written by Remove as any stop:** the profile shows the Mix as stopped, with Resume. The old Resume lifts the stop but doesn't turn the place back on, and the next save of the Everyone Mix gives it back;
- **places newcomers again** on a "Keep paused" save.

On promoting again, nothing needs cleaning: the previous code never writes the mark.

## Agent defaults for Kevin

1. **Ticking Everyone on a paused Mix works as before.** Everyone it covers at that save gets a place, so the resume neither moves them nor is reviewed; only people added later wait for the resume. D63 speaks of newcomers, and this keeps every other paused save as it was. *Should ticking Everyone while paused instead work like a tag added while paused (D65): people with no stage move at the resume, after the review?*
2. **Resume after a Remove from an Everyone Mix gives the person's place back, from today.** The Mix restarts for them, and the run Remove ended picks up again when it is the same day. *Agreed?*
3. **A tag given to a person while a Mix that runs for that tag is paused moves no one when the Mix resumes.** A tag given later moves people only while its Mix is on (§2.79). D65 covers tags added to the Mix, not people added to the tag. *Should the resume move them too, after the review?*
4. **Removals made before this change stay without a stop,** so a save can still put those people back. A backfill can't tell a removal from an archive. *Fine?*
5. **Removing an Everyone place ends the person's other open follow-ups from that Mix too,** by any route, as Stop Mix does, since D64 makes it a stop. *Agreed?*

## Tests

**Integration** (`tests/mix-stage.integration.test.ts`, "pausing, removing and resuming (D63–D65, UX-09)"), seven tests:
- a "Keep paused" save gives no place to people added during the pause, and turning the Mix back on takes them in and moves those with no stage (D63, D58);
- ticking Everyone on a paused Mix gives today's people a place, and only people added later wait (D63, agent default 1);
- Remove on an Everyone place writes the stop; neither a save nor a pause and Start Mix on the list puts the person back, nor gives a place to someone stopped before they had one; removing an own start writes no stop; Resume gives the place back (D64);
- a tag added while paused is marked, Start Mix on the list opens the review, the editor refuses the resume without it, and the confirmed resume moves exactly the people the review counted, from any stage, leaving a tag that was on before the pause alone, and clears the mark (D65);
- Start Mix on the list clears the mark on a Mix without a stage (D65);
- review-8's case: resuming an Everyone Mix while adding a tag counts the tag's members and the person Everyone takes in (3, where the old count gave 2), and the save moves exactly those (UX-09);
- a tag the save keeps leaves its members out of Everyone's intake, and a tag it drops doesn't (UX-09).

Each fix was reverted in turn: with any one of the eleven reverted, at least one of these tests fails (ledger steps F1-M1 to F1-M11).

**Browser** (`e2e/mix-stages.spec.ts`), at 390px:
- **D65 and UX-09.** A tag is added with "Keep paused", and Start Mix on the list then opens the review although this owner's review preference is off. The review reads "Starting moves 2 people to Prospect, including 1 now in another stage.", counting the tag's member and the person Everyone takes in; the confirmed start moves both. Axe runs in both themes.
- **D64.** The Remove dialog's wording on an Everyone place; after Remove, the Mix appears under "Other stopped Mixes", and Resume brings it back. Axe runs in both themes.

## Verification

Run on TrixBot at the working tree on f23db11 (uncommitted at the time), against fresh local databases (`jitm_design_msf1008_*`), with the environment of CI's validate job. Logs, JSON reports and the ledger are in `.artifacts/mix-stages-followup-20261008/verification/` (private).

| Check | Label | Result |
|---|---|---|
| `db:generate`, typecheck, `validate:static` | VERIFIED | Passed (F2-01, F2-02). |
| Stage integration tests | VERIFIED | `mix-stage.integration` 46/46 (the 39 earlier ones and 7 new). |
| Full Vitest, in the eight chunks of the last release, on a fresh database | VERIFIED; four suites BLOCKED | 312 files, 2,437 tests: 2,372 passed, 41 skipped (F5-03, totals from the JSON). The 24 failures are all `spawn pg_dump ENOENT` in `backup-database`, `recovery-bundle`, `recovery-cutoff` and `recovery-state`, as in the last release: TrixBot has no `pg_dump` (JITM-12 §2.17), and this change touches no backup code. |
| Migration | VERIFIED | `db:rehearse-migration` passed; `db:verify-release` reported `{"status":"ready","required":79,"missing":0,"mismatched":0}` (F6-02 to F6-04). |
| `npm run worker:qualify` | VERIFIED | 10/10 (F6-05). |
| Production build | VERIFIED | Passed (F3-01). |
| Browser specs against the standalone build, desktop and phone, no retries | VERIFIED | Batch S (stages, Mega-Mixes, journeys, onboarding): desktop 41 passed, phone 36 passed. Batch M (Mix authoring, the Mixes list) with the contact and visit specs that use Remove and Resume: desktop 41 passed, phone 32 passed and 9 skipped. No failures (F4-01 to F4-04). |
| Accessibility | VERIFIED | Axe (WCAG 2.0, 2.1 and 2.2 AA) passes in light and dark on the resume review and the Remove dialog. |
| Screenshots | VERIFIED, inspected | `screens/stage-review-resume-390-*.png` and `screens/remove-everyone-390-*.png`. |
| Baseline comparison (JITM-12 §2.14) | NOT RUN | No browser test failed. |

## NOT RUN

- A WF-05 review of this change.
- Physical devices.
- 320px with 200% text and the keyboard on the two new dialog states: both use the existing review and confirmation dialogs, which `mix-stages` checks at 320px elsewhere.
- CI on GitHub: Actions are blocked by billing, so the jobs ran locally as above.
- Lighthouse.
- How many accounts have a paused Everyone Mix that names a stage, or Everyone places removed before this change: production wasn't queried.
