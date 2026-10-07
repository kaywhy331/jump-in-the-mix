# What happens next for a person — 2026-10-06

**Status:** built on branch `feat/mix-next-step-20261006` (PR #128), which targets `main`. It contains #125 as released (`prod-2026-10-06-4a77761`, merged in as 3c399b6), with all three rounds of its review fixes. Its first two WF-05 reviews requested changes, the third approved it with four LOW notes, and a final check of their fixes found one MEDIUM, fixed in 7db76fe and 9d59127; all are listed under "Reviews" below. Not merged and not released.

**Decisions:**
- **D33** (confirmed 2026-10-05): when a Mix ends without a connection, the last Beat's outcome asks what's next.
- **D34** (default C), with **P5's import confirmation** and **P6** confirmed: imports ask before using the default Mix, and "Everyone" includes people added later. D48–D53 confirmed the rest of P5.
- **D44** (2026-10-06, recorded on #125): the wording "No Mix will remind you about them".
- **D48–D53** (2026-10-06, JITM-09 6.1.0): Kevin adopted the recommendations for this slice's six open choices. They are listed under "Decisions made during the build" below.

All four are in the [owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md). The readings the first review needed are agent defaults, listed under "Agent defaults for Kevin" until he confirms them (JITM-15 §2.12).

**Rules:** JITM-09 §2.77, §2.78, §2.75 (plan limits) and §2.25 (Today states only what is true). This is the second build slice in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md).

## What changed

### The end-of-Mix question (§2.77)

**When it asks.** The owner records Sent, Done or Skip on a follow-up, and that closes out a Mix for the person. Today then asks "What's next for {name}?". A Mix has ended for a person when all of these are true (`src/lib/mix-end-question.ts`):
- every Beat of the Mix has come due in this run: the same start day, saved date, fixed date or visit, or the same Journey run. A planned Beat goes out once, so it counts for every run. Follow-ups the scheduler wrote before it recorded runs, on 2026-09-26, have no run of their own, so for those every run's Beats count, as before (END-03);
- none of the Mix's Beats is still open;
- a date-based Mix has no next date waiting;
- nothing else is still to come in the Mix for them by any route, such as a visit ahead or awaiting its outcome, or Journey work;
- no switched-on connection leads on from any Beat of the Mix, or from the whole Mix.

**When it doesn't ask:**
- The person is still in another Mix, so they aren't falling through (D48).
- The owner promised a next follow-up in the same outcome. That already answers the question.
- The Mix is a one-time follow-up.
- The person is marked Do not contact, or is archived.
- A Beat still waits for a visit, for a visit's outcome or for a connection. On a repeat visit, the first visit's Beats don't count for the second (END-01).

**Where it appears.** The question waits in the stack of confirmations at the bottom of Today, like the export's sent confirmation (`TodaySent`), after the timed confirmations such as "Follow-up completed", on screen and in reading order, so their 10-second Undo stays first and in view (LAY-02, A11Y-02). A timed confirmation that arrives while the question is showing comes after it, on screen and in reading order alike; at 320px with 200% text its Undo may need the stack scrolled. It lives outside the list, so Today's refresh after the outcome doesn't remove it. It names the Mix that finished and says "No Mix will remind you about them.", plus "A one-time follow-up is still coming." when one is pending (D44, §2.25). With enlarged text its actions take their own row, and while it shows, the stack scrolls inside the screen instead of growing past its top (LAY-01).

**What the owner can do:**
- **What's next?** opens a sheet with the same three answers as the profile's What's next sheet:
  - **start a Mix:** Mixes the owner starts come first, and one of those, other than the Mix that just finished, is preselected. A date-based or fixed-date Mix is never preselected, and when one is chosen the start day says what it does for it (END-02);
  - **schedule a one-time follow-up;**
  - **mark No Mix needed.**

  Each answer returns to Today with its notice. Marking No Mix needed offers Undo there, and when nothing changed the notice gives the reason. Start Mix and Mark No Mix needed lock while they send.
- **The close button ("Not now")** changes nothing, so the person stays No Mix. Focus moves to the next confirmation, or to Today's heading.
- **Undo on the outcome** takes the question away.
- **A retried outcome** whose first answer was lost asks again.

### "Everyone" includes people added later (P6)

- **The flag.** A Mix records that its audience is Everyone in `Mix.audienceEveryone`. The editor, ready-made setup and the Mix page read the flag. The Mix page also reads Everyone from the Mix's Everyone places, so a Mix the previous release saved, between the migration and the web deploy or after a rollback, keeps its audience when it is saved again (REL-01). The checkbox reads "{n} active people, and anyone you add later".
- **One routine for new people.** `placeNewContacts` (`src/lib/new-contact-placement.ts`) runs inside the transaction that creates them, however they arrive:
  - Add a contact;
  - Quick Add;
  - CSV and vCard imports, the Android picker and shared iPhone cards;
  - lead connections;
  - "Added with a visit";
  - onboarding;
  - invitations.

  It gives each newcomer an audience assignment, as the Mix's own save does, except in a Mix they are already in by their own start or a shown tag, so nobody runs the same Mix twice (PLC-02). Someone added from a Journey Start isn't given one in the Mix the Start is about to start for them (EVR-02, agent default 7). It reads the Everyone Mixes with a share lock, so a save that unticks Everyone at the same moment can't leave a stray place behind (REL-03).
  - A Mix that starts when the owner starts it begins from the moment they were added.
  - A broadcast whose time has passed is left out, so nobody receives it late as an overdue follow-up.
  - Do not contact and the plan's limit hold these follow-ups as they hold any audience's (§2.75).
- **Turned back on.** An Everyone Mix turned back on from the Mixes list takes in people added while it was off, from that moment, as the editor's save already did (EVR-01).
- **Existing Mixes.** The migration marks every Mix that still has Everyone assignments. Those Mixes keep their audience, which now includes newcomers (D52). The release counts the accounts that have such Mixes and reports them to Kevin; the queries are under "Release notes".

### The New contacts setting (§2.78, D34)

- **The setting.** Settings → New contacts (`/settings/new-contacts`) offers three choices, stored on `WorkspacePreference`:
  - **Leave them out** (the default): they show as No Mix;
  - **Add them to a Mix:** a Mix that starts when the owner starts it, from the day they're added. A Mix set to start after another Mix isn't offered (D49-01);
  - **Ask each time.**

  Choosing a Mix also chooses "Add them to a Mix", so a Mix picked while another option was selected isn't dropped (UX-02). A chosen Mix that is later turned off, removed or set to start after another Mix counts as none, and the page says so.
- **A Contact stage's own Mix comes first** (PLC-01). When the stage new people join starts a Mix:
  - the setting's Mix is not added on top of it, on any path. Add a contact runs the stage event before its own start, and imported and phone contacts, who get their stage later from the worker's stage pass, are placed knowing which stage they will join. The pass takes about 25 new people a minute, so a 1,000-row import gets its stage's Mix over about 40 minutes (`newContactStage` in `src/lib/journey.ts`, which shares `applyJourneyEvent`'s choice of stage);
  - Add a contact, Quick Add and the import's review don't preselect the setting's Mix, and say which Mix the stage starts;
  - a Mix the owner picks just now still starts beside it (agent default 1).
- **Add a contact.** The First follow-up opens as the setting means (UX-01, agent default 3):
  - with a chosen Mix, ticked for today with that Mix, and the form says the setting chose it;
  - with Ask each time, ticked for today with no Mix chosen, as Quick Add and imports open;
  - with Leave them out, or under a stage's Mix, as before this setting: unticked, with the first Mix that follows the follow-up date.

  The Mix list has the Mixes that follow the follow-up date first, in their usual order, then the Mixes the owner starts, by name; such a Mix begins on the follow-up date. The form's Mix starts through `placeNewContacts`, so it never starts again for someone a tag they were just given runs it for, and the profile says so (PLC-02). A person added to start a Mix chosen in Journey is left as before.
- **Quick Add.** A new person's review offers "Add to a Mix", with the setting's Mix preselected (none for Ask each time, or under a stage's Mix), and the receipt names the Mix that started, or the one that was already running. The choice is a direct start, so the plan's limit refuses it with its reason; the refusal says the capture is kept and that "No Mix for now" saves it (§2.75, D53).
- **Phone contacts and lead connections** start the setting's Mix, unless the stage they join starts its own. With Ask each time there is no one to ask, so they wait on Today's No Mix line, where Review opens them together for one bulk Add (D50).
  - Each lead connection can follow the setting, choose its own Mix or start none (`IntakeConnection.newContactPlacement`).
  - A connection whose chosen Mix was deleted starts none and says so; one whose Mix was turned off or set to start after another Mix says that nothing starts.
  - People already in Contacts are left as they are.
- **Imports.** The review step asks "Add the {n} new people to a Mix", with the setting's Mix preselected (none when the import was opened to start a Mix from Journey, or under a stage's Mix). It also names up to three Mixes for Everyone that the new people will join, and how many more; past broadcasts aren't named.
  - The queued batch keeps the answer. Batches queued before this release start none. A retry after a lost response gets the batch already queued, even if its Mix was turned off since (IMP-01).
  - People who can't start the Mix are skipped, like any automatic addition (§2.75).
  - Each imported or shared person queues one preparation job (PERF-01).
- **Already in the Mix by another route.** The new-contact Mix doesn't start again for someone already in it, which would give them a second run with duplicate follow-ups (the BLK-02 finding of #125's second review, applied here).
  - Their own start, the Everyone audience and a shown tag are checked from the enrollment itself, because a newcomer has nothing prepared yet.
  - A visit or Journey work is checked with #125's `contactIdsInMix`.
- **Shared start routine.** Starting one person on a Mix moved into `src/lib/contact-mix-start.ts`, so the profile, bulk Add, Today's question and these paths share it. It returns what the start did (#125's BLK-01 fix, ported unchanged), and a start with no user is audited as the system's.

**Schema:** two additive migrations.
- `20261006120000_mix_audience_everyone`: `Mix.audienceEveryone`, set for Mixes that still have Everyone assignments.
- `20261006130000_new_contact_placement`: the `NewContactPlacement` enum, plus nullable or defaulted columns on `WorkspacePreference` and `IntakeConnection`, with foreign keys that clear when the Mix is deleted.

## Decisions made during the build

The decisions were silent on six implementation choices. Kevin asked for the most logical, easiest workflow and adopted the recommendations (D48–D53, [owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md)):

| ID | Choice | Why |
|---|---|---|
| D48 | The end-of-Mix question asks only when the person is left with no Mix. | Fewer interruptions. It appears exactly when someone would otherwise fall through. |
| D49 | Only Mixes that start "When I start it for someone" can be the New contacts Mix, or the Mix offered in Quick Add and imports. | A birthday, broadcast or after-another-Mix Mix can't sensibly start "today" for a new person. This is the same rule as a Contact stage's Mix. |
| D50 | With "Ask each time", people from the phone and from lead connections wait on Today's No Mix line. | No one is there to ask when they arrive. Review opens them together for one bulk Add, and a connection can choose its own Mix to make it automatic. |
| D51 | People added with a visit, during onboarding or by an invitation don't take the New contacts Mix. They still join Mixes for Everyone. | A visit is already a next step, onboarding starts its own Mix, and invitees are peers trying the app. "Everyone" keeps one meaning. |
| D52 | Mixes already saved with Everyone take in people added after the release. | One meaning everywhere. The checkbox says "and anyone you add later", and past broadcasts are skipped. |
| D53 | Over the people limit, an import's Mix skips those people, and a Mix chosen in Quick Add is refused with the reason. | A large import isn't blocked by a few people. Quick Add keeps the draft and offers "No Mix for now". This applies only while billing is on. |

## Agent defaults for Kevin

The reviews needed these readings to fix their findings. Each is reversible. Until Kevin confirms one, the standards cite it as `[SOURCE]` (JITM-15 §2.12).

1. **A stage's Mix comes before the setting's, but not before the owner's own pick (PLC-01, the review's question 1a).** When the stage new people join starts a Mix, the setting's Mix, or one a lead connection set up in advance, is not added on top of it, and no form preselects it. A Mix the owner picks while adding someone, in Add a contact, Quick Add or an import's review, still starts beside the stage's Mix. Should the owner's own pick start too, or should the stage's Mix always be the only one?
2. **Imported and phone contacts keep getting their stage from the worker (the review's question 1b).** They are placed knowing which stage they will join, rather than getting that stage inside the import. The worker's stage pass takes about 25 new people a minute, so the end state arrives over about 40 minutes for a 1,000-row import, and those people count on Today's No Mix line until then (PLC-03). Should imports and phone contacts get their stage at once, as Quick Add and lead connections do?
3. **How Add a contact opens (UX-01, question 3).** With Ask each time: ticked for today, with no Mix chosen, as Quick Add and imports open. With Leave them out: as before this setting, unticked, with the first Mix that follows the follow-up date. Is that what each setting should mean on Add a contact?
4. **Which Mixes D49 covers (D49-01, question 2).** Mixes set to start after another Mix are left out of the setting, Quick Add, imports, lead connections and Add a contact. Add a contact still offers the Mixes that follow the follow-up date, such as the starter Mix, although D49's entry in the decision log names Add a contact too, so this default departs from a logged decision and needs Kevin's answer logged before it is relied on (D49-02). Should Add a contact keep them?
5. **An Everyone Mix turned back on takes in the people added while it was off, from that moment (EVR-01, question 4).** While it is paused, newcomers are not placed in it, so they show No Mix until it is back on. Should newcomers join a paused Everyone Mix at once instead, held like its other people (D45)?
6. **The question's sheet (END-02, question 6).** Mixes the owner starts come first, and only one of those is preselected. Date-based and fixed-date Mixes can be chosen, and the start day says what it does for them. Should they be left out of this sheet instead?
7. **A Journey Start's own Mix is left to the Start (EVR-02, EVR-03).** Someone added from a Journey Start is not given an Everyone place in the Mix the Start then starts for them, so they don't run it twice. If the owner abandons the Start, they show No Mix until a Mix is started. Should they join that Everyone Mix anyway, with the Start refusing to start it a second time?

## Reviews

### First review (2026-10-06)

An independent WF-05 review of 5efafb3 requested changes: 1 HIGH, 7 MEDIUM and 9 LOW findings (`.artifacts/mix-next-step-release-20261006/REVIEW.md`, private). The fixes are in 96dc0c1, b7818fc, f2141f6, 2b16960 and b1ece11.

| ID | Severity | Finding | Now |
|---|---|---|---|
| PLC-01 | HIGH | The setting's Mix was added on top of a stage's Mix on Add a contact, imports and phone contacts. | Fixed (2b16960), agent defaults 1–2. |
| PLC-02 | MEDIUM | Add a contact could start its Mix a second time through Everyone or a tag. | Fixed (2b16960). |
| UX-01 | MEDIUM | Add a contact preselected whichever Mix sorted first, and one tap started it under Ask each time. | Fixed (2b16960), agent default 3. |
| D49-01 | MEDIUM | Mixes that start after another Mix were offered and started for new people. | Fixed (2b16960), agent default 4. |
| END-01 | MEDIUM | On a repeat visit the question said the Mix was finished while its after-visit Beats still waited. | Fixed (b7818fc). |
| REL-01 | MEDIUM | A Mix saved by the previous release could lose its Everyone audience on a later save. | Fixed (f2141f6), plus a release step under "Release notes". |
| LAY-01 | MEDIUM, confirmed as a JITM-10 §2.3 failure | With 200% text the question grew past the top of the screen: 2,928px above it at 320, 615px at 390. | Fixed (96dc0c1); measured afterwards at 16px and 130px from the top. |
| DOC-01 | MEDIUM | The PR body, the record and the screenshots described older heads. | Fixed in this record; the PR body was still old at the second review and is now rewritten. |
| EVR-01 | LOW | Turning an Everyone Mix back on from the list didn't take in people added meanwhile. | Fixed (f2141f6), agent default 5. |
| REL-02 | LOW | The D52 count had no query or timing. | Queries under "Release notes". |
| PERF-01 | LOW | An imported person queued up to three preparation jobs. | Fixed (2b16960). |
| IMP-01 | LOW | A retried import queue was refused if its Mix was turned off since. | Fixed (2b16960). |
| COPY-01 | LOW | Five wording gaps. | (a) Today's reasons, (b) the import's Everyone list, (c) Quick Add's refusal and (e) its receipt are fixed (b1ece11, 2b16960). (d) Phone shares and the device picker still don't name a Mix they started: found, not fixed. |
| UX-02 | LOW | Settings dropped a Mix picked under another option; the sheet's buttons had no pending lock; closing dropped focus. | Fixed (2b16960, b1ece11). |
| END-02 | LOW | The question's sheet could preselect a date-based or fixed-date Mix. | Fixed (b1ece11), agent default 6. |
| DOC-02 | LOW | Standards and decisions disagreed. The merge commit 6d2e6ec has a 98-character subject and no trailer. | JITM-09 6.2.0 states the defaults. JITM-01 waits for #129 (3.0.3). 6d2e6ec is already on the branch and is not rewritten (JITM-13). |
| TST-01 | LOW | The tests would have passed with the defects. | New cases below. |

While fixing D49-01 a new test caught a defect in the first version of the fix: spreading the exclusion after a caller's `id` replaced that id, so a lookup could match another Mix. The exclusion now sits under `NOT`.

### Second review (2026-10-06)

A second independent review of dd5710c found 13 of the 17 findings resolved and requested changes for 1 new MEDIUM and the unresolved DOC-01, with 7 new LOW findings (`REVIEW-2.md`, private). The fixes are in 2e5e60c and aa987a3.

| ID | Severity | Finding | Now |
|---|---|---|---|
| END-03 | MEDIUM | The END-01 fix never asked for a follow-up with no run key. The scheduler records run keys only since 2026-09-26 (c7e06c7), so runs started before then would never have asked. | Fixed (2e5e60c): every run's Beats count for them, as before; the check for anything still to come guards the repeat visit. |
| DOC-01 | MEDIUM | The PR body was still old, and the verification rows had no results. | Fixed: the PR body is rewritten and the rows are filled. |
| COPY-02 | LOW | The profile's notice blamed a tag when the person's stage had started the Mix. | Fixed (aa987a3). |
| LAY-02 | LOW | At 320px with 200% text, the timed Undo sat below the scrolling stack. | Fixed (aa987a3): the question sits below the timed confirmations. |
| REL-03 | LOW | An import racing a save that unticks Everyone could leave a stray Everyone place. | Fixed (aa987a3), with a share lock; the import's contact insert already serialized them through the Workspace row. |
| EVR-02 | LOW | Someone added from a Journey Start of an Everyone Mix ran it twice. | Fixed for Add a contact (aa987a3). An import opened from a Journey Start, and a visit whose plan is an Everyone Mix: found, not fixed. |
| PLC-03 | LOW | "A few minutes" understated the stage pass. | Fixed in this record and JITM-09 6.2.1. |
| D49-02 | LOW | Agent default 4 departs from D49's logged text. | For Kevin, with default 4. |
| COPY-03 | LOW | The import's hint said "It" with the stage's Mix just named. | Fixed (aa987a3). |

### Third review (2026-10-06)

The third review of b431f3b approved: no finding above LOW (`REVIEW-3.md`, private). It confirmed END-03 and the other round-2 fixes, and withdrew REL-03 as unable to happen: an import's Contact insert already waits on the Workspace row with the editor's save. Its four LOW notes are fixed in f68647e and this record.

| ID | Severity | Finding | Now |
|---|---|---|---|
| A11Y-02 | LOW | CSS order showed the question below the Undo, but Tab reached it first. | Fixed: the question goes into the stack after the confirmations already showing. |
| LAY-03 | LOW | At 320px with 200% text the timed confirmation's Undo ran past the card, and the scroll area cut it. | Fixed: the card wraps; a browser test checks the order and that Undo fits. |
| EVR-03 | LOW | The Journey Start exclusion wasn't a listed default, and Add a contact's own Mix start didn't apply it. | Fixed, and listed as agent default 7. |
| DOC-03 | LOW | The PR body cited `validate:static` and `standards:check` at a head they hadn't run on. | Both re-run on the final head and cited. |

### Final check (2026-10-07)

A check of the fixes for the third review's notes (b431f3b..fb7db31, `REVIEW-4.md`, private) found one MEDIUM and two LOW findings.

| ID | Severity | Finding | Now |
|---|---|---|---|
| LAY-04 | MEDIUM | Moving the question into a box-less slot for A11Y-02 took it out of the stack's surface rule, so it drew transparent over Today's list. | Fixed (7db76fe): the slot's card gets the same raised surface; a browser test checks its background, radius and shadow. While capturing it, the LAY-03 wrap was found to drop the timed Undo onto its own row at normal sizes; fixed (9d59127), with a test. |
| BAS-01 | LOW | The two flaky tests were not run alone on the baseline, and `quiet-days:117`'s cause was wrong. | Both ran alone twice on each build and passed; classified as order-dependent, not blocking, with test-only follow-ups (Verification). |
| DOC-04 | LOW | A broken table row, a typecheck cited at the wrong head, checks run before their commit, old captures and an undocumented case. | Fixed in this record and the PR body. |

A confirmation of these fixes (`REVIEW-5.md`, private) approved, with one LOW note, LAY-05: at 320px with normal text the timed Undo still wrapped onto its own row. Fixed in 1285681, with the browser test now checking 320 and 390.

## Release notes

- **Order:** backup, both migrations, worker, web (JITM-14 §2.13–§2.14). Both migrations are additive, and 4a77761 ignores the new columns.
- **D52 count (REL-02).** Before the migration, read-only, by status and start type: `SELECT m."triggerMode", m.status, count(*) AS mixes, count(DISTINCT m."workspaceId") AS accounts FROM "Mix" m WHERE m.status <> 'ARCHIVED' AND m.source <> 'ONE_TIME' AND EXISTS (SELECT 1 FROM "MixAssignment" a WHERE a."mixId" = m.id AND a."isActive" AND a."contactId" IS NOT NULL AND a."assignmentKey" LIKE '%:audience:%') GROUP BY 1, 2`. After the migration, the same over `m."audienceEveryone"`. Active Everyone Mixes that the owner starts matter most: every new contact starts them on the day they're added.
- **After the web deploy:** set `audienceEveryone` again for any Mix the previous release saved with Everyone during the deploy window, with the migration's own statement, and report how many changed (REL-01).
- **Rollback:** redeploy the previous commit. The columns stay, and stored choices are inert under the old code. There is no reverse migration (JITM-14 §2.24). Two effects to know:
  - a Mix whose Everyone audience is changed under the old code keeps a stale flag, so after a later re-promotion run the step above again, and check for Mixes flagged Everyone with no Everyone places;
  - import batches queued with a Mix start none under the old worker, and a page loaded from the new release sends a `mixId` the old import route refuses until it is reloaded.

## Verification

The full run is at aa987a3, on TrixBot, against fresh local databases (`jitm_design_mns1006_*`), with the environment of CI's validate job. Later commits change only the question's placement and surface, the timed card's wrapping and one argument in Add a contact; the rows name the checks that re-ran at the committed heads 9d59127 and 1285681. Logs, JSON reports and the ledger are in `.artifacts/mix-next-step-release-20261006/verification/` (private); step numbers refer to its ledger, which records the head of each step.

| Check | Label | Result |
|---|---|---|
| Typecheck, `validate:static`, `standards:check` | VERIFIED | Passed at 7db76fe (step C1), and at the final head (the last ledger step). `standards:check` has one existing warning: JITM-09 is over 300 lines. |
| Full Vitest, in nine chunks on a fresh database | VERIFIED; four suites BLOCKED | 311 files, 2,393 tests: 2,328 passed and 41 skipped (steps 97, 99). The 24 failures are all `spawn pg_dump ENOENT` in `backup-database`, `recovery-bundle`, `recovery-cutoff` and `recovery-state`: TrixBot has no `pg_dump` (JITM-12 §2.17), and this change touches no backup code. The new and changed suites: `new-contact-placement` 20/20 and `mix-end-question` 10/10. At 9d59127, `new-contact-placement`, `mix-end-question`, `contact-save-integrity`, `quick-capture` and `contact-import-recovery` passed 66/66 (step C13). |
| `worker-runtime` and `npm run worker:qualify` | VERIFIED | Both 10/10 (steps 98, 99). |
| Migrations | VERIFIED | At 5efafb3: `db:rehearse-migration` passed and `db:verify-release` reported `{"status":"ready","required":77,"missing":0,"mismatched":0}` (step 04). The fixes change no migration. |
| Production build | VERIFIED | Passed at aa987a3 (step 80), 9d59127 (step C9) and 1285681 (step D1). |
| Browser specs against the standalone build, desktop and phone, in batches of six, no retries | VERIFIED | 36 specs on desktop: 222 passed, 11 skipped. 29 on the phone project: 158 passed, 49 skipped (steps 82–94). One failure on each, `journey-connections.spec.ts:312` ("Selected path" didn't appear), only inside its batch: it passed alone twice on each project, and the whole file passed 17/17 on desktop (steps 87, 90). #125's record shows the same order-dependent failure, compared with a baseline build then, and this change touches no Journey editing. `mix-next-step` passed 7/7 on desktop and 5 on the phone project (its audit runs on desktop). At 9d59127, on a fresh database: `mix-next-step`, `no-mix-status`, `core-flows` and `today-navigation` passed, 35 on desktop and 27 on the phone project, including the tests for the Undo's order, fit and normal-size layout and the question's surface (step C11). At 1285681, `mix-next-step` and `today-navigation` passed again: 24 on desktop and 20 on the phone project (step D3). |
| Baseline comparison (JITM-12 §2.14) | VERIFIED; two order-dependent tests, not blocking (§2.15) | Production, 4a77761, was built and served beside the candidate with its own fresh database (steps B01–B13). Batch C passed in all four baseline runs (3 desktop, 1 phone). Two tests failed only inside a batch on the candidate and passed alone on both builds, so they are order-dependent, not new: (1) `journey-connections.spec.ts:312` failed in 2 of 5 desktop and 1 of 3 phone batch runs. It passed alone twice on each build (steps 87, 90, B13) and as its own file. At the failure the Journey canvas held focus: after a path is deleted the map focuses its canvas on the next animation frame (`src/components/WorkflowJourney.tsx:157`), and the test presses Enter on the next path without waiting for that, as its sibling test does. The component and the spec are unchanged by this PR. (2) `quiet-days.spec.ts:117` failed once, in a desktop batch: after Next the list still read "1 of 2", so the click was lost; the cause is not established, in unchanged `QuietDaySuggestions`. It passed alone twice on each build (steps C5, B13). Test-only follow-ups, proposed for `main` before the release: wait for the canvas's focus after the first deletion in `:312`, and for "2 of 2" after Next in `:117`. |
| Accessibility | VERIFIED | Axe (WCAG 2.0, 2.1 and 2.2 AA) passes on the question, its sheet and the New contacts page, light and dark, at 1280 and 390 (`mix-next-step`). At 320 and 390 with 200% text, the question's text keeps the card's width, the stack stays inside the screen and "What's next?" can be reached; nothing scrolls sideways. |
| Screenshots | VERIFIED, inspected | At 9d59127 (`screens-final/`): the question card at 390 and 1280 in light and dark, with its raised surface below "Follow-up completed", and at 320 with 200% text, where the timed card comes first with its Undo whole. Earlier: the question at 320 and 390 before and after LAY-01 (`screens-before/`, `screens-after/`). |

Not run again after 5efafb3: the migration rehearsal (no migration changed).

## Found, not fixed

- **"Mark sent" before the Beat's Journey choices load.** The click opens an empty "Record journey outcome" step, with Save outcome and Cancel, instead of recording. The owner needs an extra tap. This is existing behavior in `JumpOutcomeButton` (`src/components/JumpWorkflow.tsx`).
  - The No Mix slice classified `design-correction.spec.ts:111` as order-dependent. Its failure snapshots show this step, so this is the cause.
  - The new spec handles the step. The product behavior belongs in its own fix.
- **The import review's sticky action bar.** On wide screens it covers the Mix question's hint until the page is scrolled further.
- **The "Add phone or email" link on a Contacts row** still fails axe's target-size check. The No Mix slice already reported it.
- **Phone shares and the device picker** don't say that the setting's Mix started (COPY-01 d).
- **An import opened from a Journey Start** still gives new people an Everyone place in the Start's Mix, and the page says "Importing does not start this Mix". A visit whose plan is an Everyone Mix keeps the earlier Everyone enrollment beside the visit's run (EVR-02).
- **The commit 6d2e6ec** has a 98-character subject and no trailer. It is already pushed, so it stays.

## NOT RUN

- Physical phones and tablets.
- A worker processing the queued jobs. A newly placed person's Beats, and an import batch's run, were checked through the database only.
- A baseline build of `origin/main` for A/B comparison.
- Production data, including the D52 count. The release takes it.
- GitHub Actions: blocked by billing.
- Production. Nothing was released.
