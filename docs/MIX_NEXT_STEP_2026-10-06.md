# What happens next for a person — 2026-10-06

**Status:** built on branch `feat/mix-next-step-20261006` (PR #128), which targets `main`. It contains #125 as released (`prod-2026-10-06-4a77761`, merged in as 3c399b6), with all three rounds of its review fixes. The first WF-05 review of this PR requested changes; the fixes are listed under "First review" below and wait for the re-review. Not merged and not released.

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
- every Beat of the Mix has come due in this run: the same start day, saved date, fixed date or visit, or the same Journey run. A planned Beat goes out once, so it counts for every run;
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
- The finished follow-up has no run the question can tell apart, such as a planned Beat. Today's No Mix line still lists the person.

**Where it appears.** The question waits in the stack of confirmations at the bottom of Today, above "Follow-up completed", like the export's sent confirmation (`TodaySent`). It lives outside the list, so Today's refresh after the outcome doesn't remove it. It names the Mix that finished and says "No Mix will remind you about them.", plus "A one-time follow-up is still coming." when one is pending (D44, §2.25). With enlarged text its actions take their own row, and while it shows, the stack scrolls inside the screen instead of growing past its top (LAY-01).

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

  It gives each newcomer an audience assignment, as the Mix's own save does, except in a Mix they are already in by their own start or a shown tag, so nobody runs the same Mix twice (PLC-02).
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
  - the setting's Mix is not added on top of it, on any path. Add a contact runs the stage event before its own start, and imported and phone contacts, who get their stage a few minutes later from the worker's stage pass, are placed knowing which stage they will join (`newContactStage` in `src/lib/journey.ts`, which shares `applyJourneyEvent`'s choice of stage);
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

The first review needed these readings to fix its findings. Each is reversible. Until Kevin confirms one, the standards cite it as `[SOURCE]` (JITM-15 §2.12).

1. **A stage's Mix comes before the setting's, but not before the owner's own pick (PLC-01, the review's question 1a).** When the stage new people join starts a Mix, the setting's Mix, or one a lead connection set up in advance, is not added on top of it, and no form preselects it. A Mix the owner picks while adding someone, in Add a contact, Quick Add or an import's review, still starts beside the stage's Mix. Should the owner's own pick start too, or should the stage's Mix always be the only one?
2. **Imported and phone contacts keep getting their stage from the worker (the review's question 1b).** They are placed knowing which stage they will join, rather than getting that stage inside the import. The end state is the same a few minutes later. Should imports and phone contacts get their stage at once, as Quick Add and lead connections do?
3. **How Add a contact opens (UX-01, question 3).** With Ask each time: ticked for today, with no Mix chosen, as Quick Add and imports open. With Leave them out: as before this setting, unticked, with the first Mix that follows the follow-up date. Is that what each setting should mean on Add a contact?
4. **Which Mixes D49 covers (D49-01, question 2).** Mixes set to start after another Mix are left out of the setting, Quick Add, imports, lead connections and Add a contact. Add a contact still offers the Mixes that follow the follow-up date, such as the starter Mix, although D49's entry in the decision log names Add a contact too. Should Add a contact keep them?
5. **An Everyone Mix turned back on takes in the people added while it was off, from that moment (EVR-01, question 4).** While it is paused, newcomers are not placed in it, so they show No Mix until it is back on. Should newcomers join a paused Everyone Mix at once instead, held like its other people (D45)?
6. **The question's sheet (END-02, question 6).** Mixes the owner starts come first, and only one of those is preselected. Date-based and fixed-date Mixes can be chosen, and the start day says what it does for them. Should they be left out of this sheet instead?

## First review (2026-10-06)

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
| DOC-01 | MEDIUM | The PR body, the record and the screenshots described older heads. | Fixed in this record and the PR body. |
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

## Release notes

- **Order:** backup, both migrations, worker, web (JITM-14 §2.13–§2.14). Both migrations are additive, and 4a77761 ignores the new columns.
- **D52 count (REL-02).** Before the migration, read-only, by status and start type: `SELECT m."triggerMode", m.status, count(*) AS mixes, count(DISTINCT m."workspaceId") AS accounts FROM "Mix" m WHERE m.status <> 'ARCHIVED' AND m.source <> 'ONE_TIME' AND EXISTS (SELECT 1 FROM "MixAssignment" a WHERE a."mixId" = m.id AND a."isActive" AND a."contactId" IS NOT NULL AND a."assignmentKey" LIKE '%:audience:%') GROUP BY 1, 2`. After the migration, the same over `m."audienceEveryone"`. Active Everyone Mixes that the owner starts matter most: every new contact starts them on the day they're added.
- **After the web deploy:** set `audienceEveryone` again for any Mix the previous release saved with Everyone during the deploy window, with the migration's own statement, and report how many changed (REL-01).
- **Rollback:** redeploy the previous commit. The columns stay, and stored choices are inert under the old code. There is no reverse migration (JITM-14 §2.24). Two effects to know:
  - a Mix whose Everyone audience is changed under the old code keeps a stale flag, so after a later re-promotion run the step above again, and check for Mixes flagged Everyone with no Everyone places;
  - import batches queued with a Mix start none under the old worker, and a page loaded from the new release sends a `mixId` the old import route refuses until it is reloaded.

## Verification

All of it ran on TrixBot against fresh local databases (`jitm_design_mns1006_*`), with the environment of CI's validate job. Logs and the ledger are in `.artifacts/mix-next-step-release-20261006/verification/` (private).

| Check | Label | Result |
|---|---|---|
| Typecheck, `validate:static`, `standards:check` | VERIFIED | To be recorded for the fixed head. |
| Full Vitest | VERIFIED | To be recorded for the fixed head. |
| `worker-runtime` and `npm run worker:qualify` | VERIFIED | To be recorded for the fixed head. |
| Migrations | VERIFIED | At 5efafb3: `db:rehearse-migration` passed and `db:verify-release` reported `{"status":"ready","required":77,"missing":0,"mismatched":0}`. The fixes change no migration. |
| Browser specs | VERIFIED | To be recorded for the fixed head. |
| Screenshots | VERIFIED, inspected | The question at 320 and 390, 100% and 200% text, light and dark, before and after LAY-01 (`screens-before/`, `screens-after/`). |

## Found, not fixed

- **"Mark sent" before the Beat's Journey choices load.** The click opens an empty "Record journey outcome" step, with Save outcome and Cancel, instead of recording. The owner needs an extra tap. This is existing behavior in `JumpOutcomeButton` (`src/components/JumpWorkflow.tsx`).
  - The No Mix slice classified `design-correction.spec.ts:111` as order-dependent. Its failure snapshots show this step, so this is the cause.
  - The new spec handles the step. The product behavior belongs in its own fix.
- **The import review's sticky action bar.** On wide screens it covers the Mix question's hint until the page is scrolled further.
- **The "Add phone or email" link on a Contacts row** still fails axe's target-size check. The No Mix slice already reported it.
- **Phone shares and the device picker** don't say that the setting's Mix started (COPY-01 d).
- **The question can't be asked from a planned Beat**, whose run can't be told apart. The No Mix line still lists the person.
- **The commit 6d2e6ec** has a 98-character subject and no trailer. It is already pushed, so it stays.

## NOT RUN

- Physical phones and tablets.
- A worker processing the queued jobs. A newly placed person's Beats, and an import batch's run, were checked through the database only.
- A baseline build of `origin/main` for A/B comparison.
- Production data, including the D52 count. The release takes it.
- GitHub Actions: blocked by billing.
- Production. Nothing was released.
