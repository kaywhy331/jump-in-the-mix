# Stages from the work — 2026-10-07

**Status:** built on `feat/mix-stages-20261007` (PR #132), not released. Six WF-05 reviews: rounds 1–3 requested changes (round 1: 1 HIGH, 4 MEDIUM, 6 LOW; round 2: 2 MEDIUM, 5 LOW; round 3: 1 MEDIUM, 5 LOW), and rounds 4, 5 and 6 approved with LOW findings only. Kevin then answered the open questions (D61–D68); D66 changes what an Everyone Mix moves, so a seventh review of that change is next. The branch carries PR #131 (the record of the previous release) until that pull request is merged.

**Decisions:**
- **D35** (2026-10-05): a Mix can set a person's stage, and a Mega-Mix can create stage labels that the owner can still change.
- **P7's timing** (confirmed 2026-10-05 with D33): the stage is set when the person starts the Mix, not when they finish it.
- **D61–D68** (2026-10-07): Kevin answered every open question with the recommended answer ("I will go based on your recommendations for all the answers"). D61 confirms the ready-made label lists (P8). D62 makes the always-reviewed save an exception to JITM-09 §2.39. D66: an Everyone Mix moves only people with no stage yet (built here). D63–D65 come in the follow-up to this PR; D67 in slice 4; D68 in a later slice. They also confirm agent defaults 1–16 below. The log is in `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`.

**Rules:** JITM-09 §2.51 and §2.79. This is the third build slice in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md). Stage presets and milestones in the owner's words (§2.80, slice 4) are not built.

## What changed

### A Mix names a stage

- **Mix editor.** "Name and start" gets a **Contact stage** choice, below "Who is this Mix for?". It lists the business's active stages and "None", the default. The hint says: "People who start this Mix move to this stage, and only the label changes. Choosing a stage moves no one already in the Mix, but adding a tag or Everyone moves everyone they cover, after a review." It links to Contact stages. While the business has paused automatic transitions, the hint adds "Automatic transitions are paused, so no one moves until you turn them back on." The choice appears only when the business has Contact stages. A form without it, such as an older open tab or a business without stages, keeps the saved choice (`src/components/MixEditor.tsx`, `src/lib/mix-editor-actions.ts`).
- **The Mix's pane** says "Moves people to the {stage} stage." under Starts, for an active stage only, and adds the paused sentence while transitions are paused (`src/components/MixWorkspace.tsx`).
- **Contact stages** lists, inside each active stage, the Mixes that set it: "Set when someone starts {Mix}, {Mix}." or "No Mix sets this stage. Choose one in a Mix's settings." Each Mix name links to the Mix. The page's footer adds that while transitions are paused, starting a Mix doesn't set a stage either (`src/app/(app)/settings/journey/page.tsx`).

### Starting a Mix sets the stage (§2.79)

One function does it: `setStagesFromMixStarts` in `src/lib/mix-stage.ts`. Every way a Mix starts for a person calls it, inside the transaction that starts the Mix:

| How the Mix starts | Where | When it counts as a start |
|---|---|---|
| Start from the profile, Today's "What's next?" | `startMixForContact` (`src/lib/contact-mix-start.ts`) | It starts or restarts. A Mix already running keeps the person's stage as it is. |
| Bulk Add to a Mix | the same | The same. Undo puts the earlier stage back. |
| The New contacts setting's Mix, a lead connection's Mix, an import's chosen Mix | `placeNewContacts` → `startMixForContact` | The same. |
| An Everyone Mix takes in a newcomer | `placeNewContacts` (`src/lib/new-contact-placement.ts`) | Never for the stage: a newcomer has, or is about to get, the stage new people join (D66). |
| Saving a Mix | `saveMixAction` | The Mix is on after the save, and its audience (Everyone, for someone with no stage yet, D66; or a tag) newly takes the person in, or the save turns a draft on. |
| Turning a Mix on from the Mixes list | `activateMixAction` (`src/lib/mix-lifecycle-actions.ts`) | A draft: its whole audience (Everyone's part only for people with no stage yet, D66). A paused Everyone Mix: the people it has no place for and who aren't in it by another route (a tag, their own start, a visit or a Journey run), and of those only people with no stage yet (D66). |
| A tag given later | Add a contact, Edit a contact, both bulk tag actions, imports (`setStagesFromTagJoins`) | A shown tag that an active Mix runs for, newly given to the person. |
| A saved date adds its date-based Mix | `createImportantDateAction` (`src/lib/important-date-actions.ts`) | The Mix was not already on for the person. |
| Add a contact's follow-up date with a date-based Mix | `createContact` (`src/lib/contact-actions.ts`) | Always: the person is new. |
| A Mix lined up with a visit | `scheduleVisit` (`src/lib/appointment-bindings.ts`) | A new binding. Moving the visit later doesn't set it again. |
| A Journey Start | `startWorkflowInstance` (`src/lib/mix-workflow.ts`) | Always. |
| A Journey connection, or the owner's update in Journey, starts the next Mix | `processWorkflowInstance` | Each run that pass adds. |

Not a start: the stage's own Mix starting when someone enters the stage, resuming a paused Mix (apart from the people an Everyone Mix takes in then, below) or one stopped for a person (`mix-stop-actions.ts`), a second start while the Mix is still running, saving a Mix again (including an Everyone Mix's re-sync of its places, UX-03), a tag added while the Mix is paused (its members start when it resumes, with no stage set: STG-05, a question for Kevin), onboarding's first Mix (`onboarding-actions.ts`), and a tag shown again or gained in a contact merge (`contact-merge-actions.ts`). A tag newly added to a Mix starts it for all its members, including people already running that Mix by their own start: that is a second assignment the scheduler runs, so it counts.

**What setting the stage does.**
- It changes only the label. No other Mix starts or stops, and the new stage's own Mix does not run. The one exception is the arrival stage's Mix for someone who hadn't joined a stage yet (next bullet).
- The previous stage's own Mix keeps running, as the person's own: the stage record no longer manages it, so a later stage move doesn't stop it either.
- It writes a stage history entry, so the profile's stage track shows the move. The entry is a manual move whose source is "Mix: {name}".
- It adds an activity line: "Lead → Prospect, set by the Mix “Qualify”." or "Joined Prospect, set by the Mix “Qualify”."
- **Someone still waiting for the worker's stage pass joins the arrival stage first** (STG-02, `joinArrivalStage` in `src/lib/journey.ts`). A person added after Contact stages were turned on, without a stage event (an import, a phone contact, an invitation, onboarding), normally joins the stage new people join a few minutes later, through the worker's pass (D55). When a Mix sets their stage before that, they first join the arrival stage, with its Mix and the pass's own event key, so the pass has nothing left to do. Then the Mix's stage applies, and the arrival stage's Mix keeps running as their own. It takes a few statements for any number of people, so a bulk action on a fresh import fits its transaction (PERF-01; 300 people pass in one bulk tag). Every way of adding people now ends as Add a contact and Quick Add do. For people no Mix moves, D55 is unchanged.
- **A stage manages its own Mix when that Mix moves someone into it** (STG-01). When the Mix that sets stage S is S's own Mix ("Follow-up Mix on entry"), and the owner started it for the person (their page, Today, bulk Add, Add a contact, Quick Add, or the New contacts or a lead connection's Mix), S manages the enrollment that start made, as if they had entered S. S's "The stage's Mix is completed" rule then applies, and a later move out of S stops it. Someone new who starts the arrival stage's own Mix gets the same.
  - A start through a tag or an audience isn't taken over, and neither is an earlier run of the person's own that such a start finds (STG-04), as entering the stage wouldn't take them over either.
  - A Journey Start (the Mix pane's Start, or Journey's "Start this Mix") or a Journey connection runs the Mix as Journey work, which has no enrollment a stage can manage. The stage is set, but its "Mix completed" rule doesn't follow that run (STG-03). Contact stages says so under its stages. Reading Journey work in that rule is left for later (question for Kevin).
- The latest start wins, among starts that can set a stage: a start the person is stopped in doesn't hide an earlier one. When one action starts several Mixes for the same person at once, the last one in its order wins. On Add a contact, the Mix the owner picks sets its stage after any Everyone Mix, so the owner's pick wins (ORD-01).
- The New contacts Mix is not added for someone running the arrival stage's Mix, even after a tag's Mix moved them to another stage (D54).

**When nothing changes.** The business has no Contact stages, or has paused automatic transitions; the person's own stage changes are paused; the stage is retired; the person is archived, marked Do not contact, or stopped in that Mix; the person is already in the stage.

**Locks.** It takes the people's rows in id order, the lock a recorded milestone takes, and then shares the stages' rows (the arrival stage's too). Retiring a stage now takes the rows of the Mixes that name it (NO KEY UPDATE, which lets enrollments keep referring to them), then the stage's row, before counting its people: a start setting that stage right now finishes first and is counted, and a later one finds the stage retired. A placement shares the Everyone Mixes' rows before anything it starts sets a stage, and an import row shares them before its tag join (`shareEveryoneMixes`), so these and a retire all take Mixes before stages and can't wait on each other the other way round (LCK-02, LCK-03). Bulk Undo takes the people's rows before the enrollments, in the order a start takes them. The Journey Start (from the web) and connection (in the worker) paths take the workspace's key share before the contact row, so they wait behind a Mix save, which holds the workspace row and then locks the people it moves, instead of deadlocking with it (LCK-01).

### Saves that move people to a stage (UX-01, UX-02)

A save that starts people on a Mix that names a stage can move many of them: turning the Mix on starts its whole audience, and on a Mix already on, ticking Everyone or adding a tag starts everyone they cover, including people already in the Mix through another tag. A tag moves its members from any stage. Everyone moves only people with no stage yet (D66): people in a stage keep it, and new people, who have or are about to get the stage new people join, aren't moved either; someone in both a tag and Everyone is moved by the tag. Those saves are always reviewed, whatever Personal preferences → Starting mixes says (D62, an exception to JITM-09 §2.39):
- The editor's button reads "Review and start", and the review adds: "Starting moves {n} people to {stage}, including {m} now in another stage. Pausing, removing or stopping the Mix doesn’t move them back." ("Saving moves …" on a Mix already on.) While transitions are paused it reads "No one moves to {stage}: automatic transitions are paused."
- The count covers only the people the save starts: the whole audience when it turns the Mix on, all people when it ticks Everyone, or the members of the tags it adds. It comes from `stageMovesForAudience` (`src/lib/mix-stage.ts`) through `/api/contacts/audience?stage=…&mix=…&stageAll=1&stageGroup=…`, and leaves out what the start leaves out: archived, Do not contact, stopped in this Mix, paused stage changes, already in the stage, hidden tags, and, for Everyone, anyone with a stage or added since stages were turned on. A test checks that it equals the people the confirmed save moves.
- The server refuses such a save without the review ("Review who moves to the Mix’s stage before turning it on." or "… before adding them."), and Start Mix on the Mixes list opens the review instead of starting.
- On a Mix already on, the review reads "Save these changes?", counts only the people the save starts, and its buttons are "Review and save" and "Save the Mix" (COPY-02).
- Re-saving an Everyone Mix re-syncs its places but moves no one: not someone the owner removed from the Mix, nor someone a tag, their own start or a Journey Start already put in it (UX-03). Resuming a paused Everyone Mix, from the editor or from the Mixes list, moves the people it takes in then who have no stage yet (D66): those it had no place for and who aren't in it by another route (a tag, their own start, a visit, or a Journey Start or connection, D60). People added while it was off have the stage new people join, so in practice it moves only people added before stages who have none. A "Keep paused" save gives newcomers a place, so after one, resume moves none of them and their stage isn't set; D58 says newcomers aren't placed while a Mix is paused, so this is partly whether the editor should follow D58 (UX-04, a question for Kevin).
- Not reviewed: resuming a paused Mix, which starts only the people "Everyone" took in since, and saves that start no one.

### Retiring a stage

Retiring unlinks the Mixes that set the stage: their stage becomes None. The confirmation says so: "The Mix that sets it will stop setting a stage." (or "The {n} Mixes that set it …").

### Mega-Mix stage labels (P8)

- **Where.** Adding a ready-made Mega-Mix from the library (`/templates/journeys`) offers **"Add its stage labels"**, ticked, beside the review checkbox. It lists the labels and says: "Starting one of these Mixes moves the person to its stage." A business without Contact stages also reads "This turns on Contact stages."; one with stages reads "Labels you already have are reused, and a retired one comes back; nothing is renamed or removed." While transitions are paused it adds the paused sentence (`src/components/MegaMixSetup.tsx`).
- **When they don't fit.** A business has at most 20 stages, retired ones included. When the new labels would pass that, the choice is off, and says "Contact stages has room for {n} more labels, and this Mega-Mix adds {m}." The server refuses the same case with the same words, followed by "Add it without its stage labels.", and nothing is added.
- **What adding does** (`addStageLabels` in `src/lib/mix-stage.ts`, `installMegaMix` in `src/lib/mega-mix-service.ts`):
  - a label the business already has, in any case, is reused; a retired one comes back;
  - new labels follow the existing stages, in the Mega-Mix's order;
  - a business without Contact stages gets these labels only: no Lead, Prospect, Client or Retention, and no starter rules;
  - a business that paused automatic transitions stays paused;
  - each Mix is created naming its label; nobody is started (§2.43).
- **The preview** shows "Stage: {label}" under each Mix that has one, at 13px, in the library and the setup step; onboarding's preview leaves it out, as onboarding adds no labels (`src/components/MegaMixPreview.tsx`).
- Onboarding's Mega-Mix doesn't offer or add labels (agent default 9).

### Mega-Mix label lists (confirmed, D61)

Drafted from each Mega-Mix's own Mixes (`src/lib/mega-mixes.ts`). The Mixes for a concern, a quiet conversation or an agreed later time name no stage, so the person keeps the stage they had. Every starting Mix names one. No label mentions a sale (§2.80).

| Mega-Mix | Labels, in order, with the Mixes that set them |
|---|---|
| Contractor | **Inquiry** (New project inquiry) → **Site visit** (Site visit follow-through) → **Estimate** (Estimate follow-up) → **Booked** (Booked job preparation) → **In progress** (Work in progress) → **Completed** (Job handover, Aftercare check-in, Review invitation, Referral follow-up) → **Past customer** (Past customer and next project) |
| Real estate | **New lead** (New buyer lead, New seller lead) → **Consultation** (Buyer consultation, Listing consultation) → **Home search** (Home search, After a showing or open house) → **Listed** (Listed: seller updates) → **Offer** (Buyer offer, Seller offer decision) → **Under contract** (Under contract) → **Closed** (After closing, Review and referral invitation) → **Past client** (Past client: stay in touch) |
| Consultant | **Inquiry** (New inquiry) → **Discovery** (Discovery and fit) → **Proposal** (Proposal follow-up) → **Working together** (Engagement kickoff and progress) → **Handover** (Handover and adoption) → **Past client** (Aftercare and feedback, Review and referral invitation, Stay in touch) |
| Photographer | **Inquiry** (New inquiry) → **Consultation** (Coverage and fit) → **Booking decision** (Pricing and booking decision) → **Booked** (Shoot preparation) → **Gallery** (Gallery delivery) → **Past client** (Aftercare and feedback, Review and referral invitation, Stay in touch) |
| Recruiter | **New conversation** (Candidate conversation, Hiring client conversation) → **Search** (Search updates) → **Interviewing** (Interview follow-through) → **Offer** (Offer decision) → **Placed** (Placement check-in) → **Staying in touch** (Candidate relationship, Client relationship) |

### Schema

One additive migration, `20261007120000_mix_stage`: `Mix.stageId` (nullable text), its index, and a foreign key to `JourneyStage` with `ON DELETE SET NULL`. The previous release's code never reads it. The stage history reuses the existing `MANUAL` event type, so no enum value is added and a rollback reads every row the new code writes (agent default 11).

### Rollback

Rollback is a redeploy of the previous release (`prod-2026-10-07-501841e`), web first and then the worker; the migration stays (JITM-14 §2.23). What the previous code finds:
- `Mix.stageId` values: it never reads the column.
- Stage history entries of type `MANUAL` with the source "Mix: {name}", activity lines, and arrival entries with the stage pass's own key: it reads them as any manual move or pass entry.
- People whose previous stage's Mix was released, and people whose stage manages its own Mix: ordinary stage records.
- Stages and journey preferences a Mega-Mix created: ordinary stages.

One drift on promoting again: under the previous code, retiring a stage doesn't unlink the Mixes that name it. Those Mixes keep a retired stage, which this code never applies, and the pane names only an active stage. The editor shows None for them, so the next save clears it. Before promoting again after a rollback, clear `stageId` where the stage is retired.

Deploy order: with the new worker and the old web for a few minutes, only Journey connections set stages; with the old worker and the new web, connections don't set them in that window.

## Agent defaults (confirmed, D61–D66)

Kevin confirmed all sixteen on 2026-10-07 with the recommended answers to their questions (D61–D68). Default 15 is D62; default 1's Everyone case is D66, so an Everyone Mix moves only people with no stage yet. The questions below are kept as asked.

1. **Every route is a start**, as listed in the table above, including a tag given later, a saved date and a visit. *Should only the starts you make yourself and Journey connections set the stage?*
2. **Changing a Mix's stage moves no one already in it.** It applies to people who start the Mix from then on. *Should the editor offer to move the people already in the Mix?*
3. **The stage's own Mix doesn't set its own stage.** When entering stage A starts A's Mix, and that Mix names stage B, the person stays in A. Otherwise each would undo the other. *Is that right?*
4. **The previous stage's Mix keeps running and is no longer managed by the stage**, so a later move between stages doesn't stop it. *Or should a Mix that sets a stage stop the previous stage's Mix, as a stage move does?*
5. **Do not contact, stopped and archived people are not moved**, because the Mix doesn't run for them. *Agreed?*
6. **Bulk Add's Undo puts the stage back**, while nothing has changed it since. Remove from Mix and Stop leave the stage as it is. *Agreed?*
7. **Retiring a stage unlinks the Mixes that set it**: their stage becomes None, and restoring the stage doesn't link them again. *Agreed?*
8. **Mega-Mix labels.** They are matched without regard to case, and a retired label comes back. A paused business stays paused. When they don't all fit under 20 stages, none are added. *Agreed?*
9. **Onboarding stays as it is.** Adding a Mega-Mix during onboarding doesn't add its labels, so a new account doesn't start with Contact stages on. *Should onboarding offer them too?*
10. **File, copy and Marketplace Mega-Mixes carry no labels yet.** Carrying them needs a change to the Mega-Mix file. A ready-made single Mix names no stage either. *Should a Mega-Mix file carry its stage names?*
11. **The history entry is a manual move named after the Mix**, not a new event type, so a rollback stays safe. *Fine?*
12. **The editor shows the stage choice only when the business has Contact stages.** *Or should it always show, with a link to set stages up?*

Added after the first review:

13. **Someone waiting for the stage pass joins the arrival stage first** (STG-02), as described above, so D55's timing changes only for people a Mix moves at once. *Should every way of adding people put them in the arrival stage at once, as Add a contact does, instead of waiting for the worker (the review's Q2)?*
14. **A stage manages its own Mix when that Mix moves someone into it** by a start the owner made for them (STG-01); not a tag's or audience's start, nor an earlier run of theirs (STG-04), nor Journey work (STG-03). *Agreed? And should the stage's "Mix completed" rule also follow its Mix run from Journey (round 2's Q2; recommended: later, with slice 4)?*
15. **A save that starts people on a Mix that names a stage is always reviewed**: turning it on, ticking Everyone or adding a tag (UX-01, UX-02). The review gives the count. Saved audiences still move people already in another stage, as default 1 says. *Do you accept this exception to §2.39's review preference (round 2's Q3; recommended: yes)? Should an Everyone Mix move only people who have no stage yet (round 1's Q3)?*
16. **The Mix you pick while adding someone sets the stage over an Everyone Mix's** (ORD-01). *Agreed (the review's Q4)?*

Other questions from the review, with the recommended answers: the real estate labels "Offer", "Under contract" and "Closed", and the photographer's "Booking decision", are transaction words; keep them where they are the trade's own milestones (Q5). A Mega-Mix added without its labels can't add them later; offer that in slice 4 (Q6). Resuming a Mix stopped for a person sets no stage (Q7, now in the list of non-starts).

## First review

Round 1 (`.artifacts/mix-stages-20261007/REVIEW.md`, private) at 20f86a0: changes requested. Every finding is fixed or answered:

| ID | Severity | Finding | Fix |
|---|---|---|---|
| STG-02 | HIGH | People added without a stage event (imports, phone contacts, invitations, onboarding) never joined the arrival stage or got its Mix once an Everyone or tag Mix set their stage, and phone contacts lost the New contacts Mix too (D54, D55). | 49794bc: they join the arrival stage first (default 13); the New contacts check counts the arrival stage's Mix. |
| STG-01 | MEDIUM | A stage's "Mix completed" rule never fired for someone that stage's own Mix moved in. | 49794bc: the stage manages it (default 14). |
| UX-01 | MEDIUM | Turning on a Mix with an audience moved them all, unannounced, with no Undo. | e1320d5: always reviewed, with the count (default 15). Whether Everyone should move people already in a stage is Kevin's (Q3). |
| A11Y-01 | MEDIUM | The preview's "Stage:" line was 12px. | e1320d5: 13px, and "Suggested starting point" beside it; the readable-text check covers `/templates/journeys`, and e3d4e1e raised the library's eyebrow it then found. |
| EVD-01 | MEDIUM | The record didn't name the CI jobs and specs left out, or 320px, 200% text, keyboard and dark axe. | This record's NOT RUN list; `mix-stages` now audits both themes and checks 320px with 200% text and the keyboard; the import, contacts and calendar specs ran. |
| LCK-01 | LOW | A Mix save could deadlock with the worker's Journey paths. | 49794bc: the worker paths take the workspace's key share first. |
| ORD-01 | LOW | An Everyone Mix's stage beat the owner's pick; a stopped latest start hid an earlier one; hidden tags counted. | 49794bc (default 16). |
| COPY-01 | LOW | Paused businesses, onboarding's preview, the history wording, revived labels. | e1320d5. |
| REL-01 | LOW | No rollback plan; the pane named a retired stage. | "Rollback" above; e1320d5. |
| DOC-01 | LOW | JITM-09 said retiring "stops" Mixes; the non-starts list was short; "the same words"; D55 against STG-02. | JITM-09 6.5.0 and this record. c998a01's subject is 77 characters, over the 72 limit; it is pushed, so it stays. |
| TST-01 | LOW | The tests would pass with these bugs. | Tests for STG-02 (an Everyone Mix, and a tag before the New contacts Mix), STG-01, ORD-01, the review's count and its forced review, and an Undo that keeps the arrival stage. |

Found while fixing: retiring a stage locked the stage and then the Mixes naming it, while a placement shares an Everyone Mix's row and then the stage's; the two could wait on each other. Retiring now locks the Mixes first (49794bc).

## Second review

Round 2 (`REVIEW-2.md`, private) at 6591a82: changes requested, 2 MEDIUM and 5 LOW. Of round 1's findings, 7 were fixed and 4 partly fixed; the HIGH (STG-02) holds. The fixes are in 5d44357, dc7465e and 501f2f1, with 7c1b058 for the browser spec:

| ID | Severity | Finding | Fix |
|---|---|---|---|
| UX-02 | MEDIUM | On a Mix already on, ticking Everyone or adding a tag moved everyone it started, unreviewed; the hint said people already in the Mix keep their stage. | The review covers every save that starts people, with the count of just those people, and the server refuses it unreviewed; the hint says so (default 15). |
| STG-03 | MEDIUM | A stage's own Mix started from Journey was never managed, so its "Mix completed" rule never fired, against §2.79. | Documented as a limit of this slice in §2.79, this record and Contact stages; tested (default 14, a question for Kevin). |
| STG-04 | LOW | A tag's or audience's start could take over a run the owner had started by hand. | Only the enrollment the start itself made can be taken over. |
| LCK-02 | LOW | Retire locked the naming Mixes FOR UPDATE, and a placement could still take the Mixes the other way round. | NO KEY UPDATE; placement shares the Everyone Mixes before it starts anything. |
| PERF-01 | LOW | The arrival join ran per person, inside a 5-second transaction. | Batched: a few statements for any number of people; a test tags 300 fresh people in one bulk action. |
| DOC-02 | LOW | Stale "stops" in default 7 and a test title, "no other Mix starts", Journey Start called a worker path, the §2.39 exception unstated, and the PR body. | Reworded here and in JITM-09 6.6.0 (§2.79 and §6); the PR body is refreshed. |
| TST-02 | LOW | No tests for UX-02, STG-03, STG-04, the dated Add a contact pick, the pass after an arrival join, or count against moves. | Added, and a browser test for UX-02. Still not covered: the real import commit and phone webhook (the helpers they call are tested), Edit a contact's tags, saved dates, resume, defaults 3 and 4, retire racing a start. |

## Third review

Round 3 (`REVIEW-3.md`, private) at de58501: changes requested, 1 MEDIUM and 5 LOW. Every round-2 finding was fixed or answered, and round 1's partly fixed ones were closed.

| ID | Severity | Finding | Fix |
|---|---|---|---|
| UX-03 | MEDIUM | Any save of an active Everyone Mix that names a stage moved everyone without an active Everyone place, unreviewed: people the owner had removed, and people a tag or their own start had put in the Mix. In the PR since 537a62d. | A save starts Everyone only when it turns the Mix on, newly ticks Everyone, or resumes it (people added while it was off, as the Mixes list does). A test removes someone, moves them on and re-saves. |
| STG-05 | LOW | A tag added while a Mix is paused never sets its members' stage. | Disclosed as a non-start in §2.79 and above; a question for Kevin. |
| COPY-02 | LOW | On a Mix already on, the review still read "Start this Mix?" and counted the whole audience. | "Save these changes?", "Review and save", "Save the Mix", and the count of the people the save starts. |
| LCK-03 | LOW | An import row's tag join shared a stage before its placement shared the Everyone Mixes. | The row shares the Everyone Mixes first (`shareEveryoneMixes`). |
| TST-03 | LOW | A refusal assertion passed either way; no tests for UX-03, STG-05 or the batched join's skip rules. | The refusals check the error and the person's stage; tests for UX-03 with D58's resume and for the batched join's four skip rules. The review also said the UX-02 browser test ran with the review preference on; the spec's setup turns it off for that owner (`e2e/mix-stages.spec.ts`, `beforeEach`), so the preference-off path is the one tested. STG-05 is disclosed, not built, so it has no test. |
| DOC-03 | LOW | The status line and NOT RUN named the second review; the PR body said "defaults 1–12" and gave old sizes; the Contact stages footer was incomplete; the active-Mix review was audited in one theme. | Refreshed here and in the PR body; the footer names every start the rule follows and the ones it doesn't; the UX-02 browser test audits both themes. |

Questions from round 3 for Kevin: should saving an Everyone Mix re-enroll people the owner removed at all (older than this change; recommended no)? Should a tag added while a Mix is paused move its members when it resumes (recommended yes, with the review)?

## Fourth review

Round 4 (`REVIEW-4.md`, private) at 5f5ada8: **approve**, 5 LOW. Round 3's findings were fixed or answered; the review confirmed that the UX-02 browser test runs with the review preference off and that the fixes change who moves stage, not who is enrolled.

| ID | Finding | Fix |
|---|---|---|
| UX-04 | Resuming an Everyone Mix moved people who had no Everyone place, including people in it by a tag or their own start; and people added during the pause got a place from a "Keep paused" save, so resume never set their stage. | Both resume paths leave out people in the Mix by another route (`peopleInMixByOtherRoutes`); tests for the list and the editor. The "Keep paused" half changes #128's enrollment, so it is disclosed above and asked of Kevin. |
| UX-05 | A draft Everyone Mix with no places yet turned on from the Mixes list without its review. | Start Mix reviews a draft that names a stage and is for Everyone or has an audience; tested. |
| COPY-03 | On a Mix already on, the email and phone warnings counted the whole audience; a resume read "Save these changes?". | The warnings say "people in this Mix’s audience"; a resume reads as a start. |
| TST-04 | The UX-03 test hid UX-04; the list's resume with a stage was untested. | The resume tests pause the Mix directly, so the tag member has no Everyone place, and run both paths. |
| DOC-04 | "Added while it was off"; resume both a start and a non-start; `placeNewContacts` lost its docblock; the footer omitted imports, the New contacts setting and visits. | Reworded here and in JITM-09 6.8.0; the docblock is back; the footer names them. |

**Questions from the reviews for Kevin**, with the reviewers' recommended answers: (1) when an Everyone Mix that names a stage resumes, should a save while it was paused stop placing newcomers, so resume moves them (yes)? (2) should Remove on an Everyone Mix count as a stop for that Mix, so no later save re-enrolls the person (yes; older than this change)? (3) should a tag added while a Mix is paused move its members when it resumes (yes, reviewed)? (4) do you accept default 15's exception to §2.39 (yes)? (5) should ticking Everyone move only people with no stage yet (yes, unless confirmed in the review)? (6) should a stage's "Mix completed" rule follow its Mix run from Journey (later, slice 4)? (7) should every way of adding people put them in the first stage at once (yes, later)? (8) defaults 14 and 16 as built (yes)? (9) the P8 label lists (keep the trade's milestones) and labels after the fact (slice 4)?

## Fifth review

Round 5 (`REVIEW-5.md`, private) at 6f8a7f9: **approve**, 3 LOW. Round 4's findings were fixed, with two leftovers:

| ID | Finding | Fix |
|---|---|---|
| UX-06 | Resume still moved people a Journey Start or connection had put in the Mix: Journey work has no enrollment, and the helper read only enrollments. | `peopleInMixByOtherRoutes` also reads active Journey runs of the Mix (legacy runs excepted, as they mirror enrollments); tested with a run that has no `legacy` flag. |
| DOC-05 | The start-path table, the resume sentence and a code comment still said "the people added while it was off"; the helper's docblock claimed Journey enrollments; visits were left out. | Reworded here, in the code comments and the docblock; visits named. The PR body's sizes are refreshed. |
| TST-05 | Only the tag route of the helper was tested; no test for UX-06. | A resume test covers a person's own start, a Journey run and a hidden tag's member. Still no browser assertion of the review's people count or COPY-03's wording. |

The review confirmed the nine questions above and refined the first: D58 already says newcomers aren't placed while a Mix is paused.

## Sixth review

Round 6 (`REVIEW-6.md`, private) at 758f46e: **approve**, 4 LOW. Round 5's findings were fixed; the review confirmed that the JSON containment matches runs with or without a `legacy` key, that leaving legacy runs out is right, and that no enrollment changes.

| ID | Finding | Fix |
|---|---|---|
| UX-07 | The Journey read counted only work that is going, so a resume moved back people whose Journey work had been paused; §2.76 counts going and paused work. | It counts both. |
| PERF-02 | The read loaded each matching Journey record's whole state to filter it in code. | The test runs in SQL (`jsonb_array_elements`), and only the people come back. |
| TST-06 | The legacy-run and record-status branches weren't tested. | A test covers paused, stopped, legacy and finished runs. |
| DOC-06 | Small record and comment slips. | Reworded. |

## Verification

The final run is at ecbc8f6, with D66 and round 6's LOW fixes, on TrixBot, against fresh local databases (`jitm_design_mst1007_r8*`), with the environment of CI's validate job. Every ledger step records its head; the record's verification section is the only thing committed after it. Logs, JSON reports and the ledger are in `.artifacts/mix-stages-20261007/verification/` (private); step names refer to its ledger. Earlier runs are kept there: round 1 (steps 01–13) and R2-* to R7-*.

| Check | Label | Result |
|---|---|---|
| `db:generate`, typecheck, `validate:static`, `standards:check` | VERIFIED | Passed (R8-20a–R8-21b). `standards:check` has one existing warning: JITM-09 is over 300 lines. |
| Full Vitest, in eight chunks on a fresh database | VERIFIED; four suites BLOCKED | 312 files, 2,429 tests: 2,364 passed and 41 skipped (R8-23, totals from the JSON). The 24 failures are all `spawn pg_dump ENOENT` in `backup-database`, `recovery-bundle`, `recovery-cutoff` and `recovery-state` (`logs/R8-23-*.full.log`): TrixBot has no `pg_dump` (JITM-12 §2.17), and this change touches no backup code. `mix-stage.integration` 38/38. While building D66, 20 neighboring files passed 184/184 (R8-03). |
| `npm run worker:qualify` | VERIFIED | 10/10 (R8-24). |
| Migration | VERIFIED at 9a0433e; not changed since | `db:rehearse-migration` passed, and `db:verify-release` reported `{"status":"ready","required":78,"missing":0,"mismatched":0}` (R2-25a–d). |
| Production build | VERIFIED | Passed at ecbc8f6 (R8-30a). |
| Browser specs against the standalone build, desktop and phone, no retries | VERIFIED | D66 touches every way people are added, so batches S (stages, Mega-Mixes, journeys, onboarding), M (Mix authoring and the Mixes list), C (No Mix, What's next, core flows, Journey connections, Marketplace, Quick Add), I (imports, phone contacts, contacts, invitations, Today) and A (accessibility, fitment, sheets, contacts, visits) ran: desktop 33 spec files, 201 passed, 7 skipped; phone 31 files, 157 passed, 37 skipped; no failures (R8-31–R8-40). Batch J (search, friction, workflows, save recovery, quiet days) last passed at 1270f53 (R4-43, R4-44); nothing it exercises changed since. |
| Accessibility | VERIFIED | Axe (WCAG 2.0, 2.1 and 2.2 AA) passes in light and dark on the editor's stage choice, the open stage on Contact stages, the Mega-Mix label choice, and both review variants (`mix-stages`). 320px with 200% text and the keyboard pass. |
| Screenshots | VERIFIED, inspected | `screens-r4/` (the "Save these changes?" review) and `screens-r2b/` (the rest), inspected; D66 changes the hint's and the review's text, not the layout. `screens-r8/` holds the set at ecbc8f6. |
| Baseline comparison (JITM-12 §2.14) | NOT RUN | No browser test failed. |

## Found, not fixed

- **"Everyone" runs into its count in the Mix editor.** The audience checkbox reads "Everyone1 active person, and anyone you add later": the title and the count share a line with no space. The text came with #128 (074bf15) and is live. The New contacts page stacks them (`.new-contacts-settings .checkbox-card`); the Mix editor and `TemplateUseForm` have no such rule. It belongs in its own fix.
- **The editor's sticky buttons at 320px with 200% text.** "Review first", "Cancel" and "Save and activate" are cut off ("Cance", "Save and activa") in `.sticky-form-actions`, which this change doesn't touch (screenshot `screens-r2/editor-stage-320-200-light.png`).
- **The library's tab reads "Mega-mixes"** (`MegaMixLibrary.tsx`), older than this change (JITM-05).
- **Other paths that lock a person and then write rows of the business** could still wait on a Mix save the other way round, as LCK-01 did; only the two Journey worker paths the review named take the workspace's key share first. Postgres ends such a wait by failing one side, which then retries or shows its error. JITM-11 §2.25's lock list doesn't cover the workspace and contact rows yet.
- **Bulk Add locks people in name order and its Undo in id order.** Two overlapping bulk actions could wait on each other; this is older than this change, and the error is handled.

## NOT RUN

- **The seventh WF-05 review**, of D66 and of round 6's LOW fixes (UX-07, PERF-02, TST-06, DOC-06).
- **Physical devices.**
- **Production:** nothing released; no production data read. How many accounts have Everyone Mixes, or stages with their own Mix, is unknown.
- **CI jobs**, which GitHub Actions can't run (billing, JITM-12 §2.12). Run here: schema, syntax and import validation, typecheck, the standards check, the migration rehearsal and release check, Vitest, `worker:qualify`, the production build and the browser batches below. Not run:
  - the production dependency audit and the committed baseline SQL check;
  - the optional scheduler type and package check;
  - the encrypted backup and restore rehearsal: BLOCKED, TrixBot has no `pg_dump`, which also blocks four Vitest suites;
  - restored-database isolation, authenticated load qualification, the hosted fixture rehearsal and the restricted-credential browser flows;
  - the browser fixture preflight, invited registration with captured mail, the staff onboarding, library, admission and voice flows with MFA, and the staff and waitlist flows;
  - mobile Lighthouse budgets and the production web and worker images.
- **Browser specs left out:** the round-4 batches ran 39 of the 90 spec files (later rounds re-ran the batches their changes touch; the final run, 33 of them). The rest cover pages and flows this change doesn't touch: public, marketing and profession pages, registration, the waitlist, staff and administration, support, email and push, billing, privacy, data retention, the demo and staging smoke.
