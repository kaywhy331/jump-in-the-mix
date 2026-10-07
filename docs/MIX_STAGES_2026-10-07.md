# Stages from the work — 2026-10-07

**Status:** built on `feat/mix-stages-20261007`, not released. No WF-05 review has run yet. The branch carries PR #131 (the record of the previous release) until that pull request is merged.

**Decisions:**
- **D35** (2026-10-05): a Mix can set a person's stage, and a Mega-Mix can create stage labels that the owner can still change.
- **P7's timing** (confirmed 2026-10-05 with D33): the stage is set when the person starts the Mix, not when they finish it.
- The rest of **P7**, and **P8**, are proposed defaults in force until Kevin confirms them (JITM-17 §2.5). P8 asks Kevin to review the ready-made label lists before release; they are under "Mega-Mix label lists for review" below.

**Rules:** JITM-09 §2.51 and §2.79. This is the third build slice in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md). Stage presets and milestones in the owner's words (§2.80, slice 4) are not built.

## What changed

### A Mix names a stage

- **Mix editor.** "Name and start" gets a **Contact stage** choice, below "Who is this Mix for?". It lists the business's active stages and "None", the default. The hint says: "People who start this Mix move to this stage. Only the label changes, and people already in the Mix keep theirs." It links to Contact stages. The choice appears only when the business has Contact stages. A form without it, such as an older open tab or a business without stages, keeps the saved choice (`src/components/MixEditor.tsx`, `src/lib/mix-editor-actions.ts`).
- **The Mix's pane** says "Moves people to the {stage} stage." under Starts (`src/components/MixWorkspace.tsx`).
- **Contact stages** lists, inside each active stage, the Mixes that set it: "Set when someone starts {Mix}, {Mix}." or "No Mix sets this stage. Choose one in a Mix's settings." Each Mix name links to the Mix (`src/app/(app)/settings/journey/page.tsx`).

### Starting a Mix sets the stage (§2.79)

One function does it: `setStagesFromMixStarts` in `src/lib/mix-stage.ts`. Every way a Mix starts for a person calls it, inside the transaction that starts the Mix:

| How the Mix starts | Where | When it counts as a start |
|---|---|---|
| Start from the profile, Today's "What's next?" | `startMixForContact` (`src/lib/contact-mix-start.ts`) | It starts or restarts. A Mix already running keeps the person's stage as it is. |
| Bulk Add to a Mix | the same | The same. Undo puts the earlier stage back. |
| The New contacts setting's Mix, a lead connection's Mix, an import's chosen Mix | `placeNewContacts` → `startMixForContact` | The same. |
| An Everyone Mix takes in a newcomer | `placeNewContacts` (`src/lib/new-contact-placement.ts`) | Each Everyone place it adds. |
| Saving a Mix | `saveMixAction` | The Mix is on after the save, and its audience (Everyone or a tag) newly takes the person in, or the save turns a draft on. |
| Turning a Mix on from the Mixes list | `activateMixAction` (`src/lib/mix-lifecycle-actions.ts`) | A draft: its whole audience. A paused Everyone Mix: the people added while it was off. |
| A tag given later | Add a contact, Edit a contact, both bulk tag actions, imports (`setStagesFromTagJoins`) | A shown tag that an active Mix runs for, newly given to the person. |
| A saved date adds its date-based Mix | `createImportantDateAction` (`src/lib/important-date-actions.ts`) | The Mix was not already on for the person. |
| Add a contact's follow-up date with a date-based Mix | `createContact` (`src/lib/contact-actions.ts`) | Always: the person is new. |
| A Mix lined up with a visit | `scheduleVisit` (`src/lib/appointment-bindings.ts`) | A new binding. Moving the visit later doesn't set it again. |
| A Journey Start | `startWorkflowInstance` (`src/lib/mix-workflow.ts`) | Always. |
| A Journey connection, or the owner's update in Journey, starts the next Mix | `processWorkflowInstance` | Each run that pass adds. |

Not a start: the stage's own Mix starting when someone enters the stage, resuming a paused Mix, a second start while the Mix is still running, or saving a Mix again.

**What setting the stage does.**
- It changes only the label. No other Mix starts or stops, and the new stage's own Mix does not run.
- The previous stage's own Mix keeps running, as the person's own: the stage record no longer manages it, so a later stage move doesn't stop it either.
- It writes a stage history entry, so the profile's stage track shows the move. The entry is a manual move whose source is "Mix: {name}".
- It adds an activity line: "Lead → Prospect, set by the Qualify Mix." or "Joined Prospect, set by the Qualify Mix."
- The latest start wins. When one action starts several Mixes for the same person at once, the last one in its order wins.

**When nothing changes.** The business has no Contact stages, or has paused automatic transitions; the person's own stage changes are paused; the stage is retired; the person is archived, marked Do not contact, or stopped in that Mix; the person is already in the stage.

**Locks.** It takes the people's rows in id order, the lock a recorded milestone takes, and then shares the stages' rows. Retiring a stage now takes the stage's row before counting its people, so a start setting that stage right now finishes first and is counted, and a later one finds the stage retired. Bulk Undo takes the people's rows before the enrollments, in the order a start takes them.

### Retiring a stage

Retiring stops the Mixes that set the stage: their stage becomes None. The confirmation says so: "The Mix that sets it will stop setting a stage." (or "The {n} Mixes that set it …").

### Mega-Mix stage labels (P8)

- **Where.** Adding a ready-made Mega-Mix from the library (`/templates/journeys`) offers **"Add its stage labels"**, ticked, beside the review checkbox. It lists the labels and says: "Starting one of these Mixes moves the person to its stage." A business without Contact stages also reads "This turns on Contact stages."; one with stages reads "Labels you already have are reused; nothing is renamed or removed." (`src/components/MegaMixSetup.tsx`).
- **When they don't fit.** A business has at most 20 stages, retired ones included. When the new labels would pass that, the choice is off, and says "Contact stages has room for {n} more labels, and this Mega-Mix adds {m}." The server refuses the same case with the same words, and nothing is added.
- **What adding does** (`addStageLabels` in `src/lib/mix-stage.ts`, `installMegaMix` in `src/lib/mega-mix-service.ts`):
  - a label the business already has, in any case, is reused; a retired one comes back;
  - new labels follow the existing stages, in the Mega-Mix's order;
  - a business without Contact stages gets these labels only: no Lead, Prospect, Client or Retention, and no starter rules;
  - a business that paused automatic transitions stays paused;
  - each Mix is created naming its label; nobody is started (§2.43).
- **The preview** shows "Stage: {label}" under each Mix that has one (`src/components/MegaMixPreview.tsx`).
- Onboarding's Mega-Mix doesn't offer or add labels (agent default 9).

### Mega-Mix label lists for review

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

## Agent defaults for Kevin

Each is reversible and in force until Kevin confirms or changes it (JITM-15 §2.12).

1. **Every route is a start**, as listed in the table above, including a tag given later, a saved date and a visit. *Should only the starts you make yourself and Journey connections set the stage?*
2. **Changing a Mix's stage moves no one already in it.** It applies to people who start the Mix from then on. *Should the editor offer to move the people already in the Mix?*
3. **The stage's own Mix doesn't set its own stage.** When entering stage A starts A's Mix, and that Mix names stage B, the person stays in A. Otherwise each would undo the other. *Is that right?*
4. **The previous stage's Mix keeps running and is no longer managed by the stage**, so a later move between stages doesn't stop it. *Or should a Mix that sets a stage stop the previous stage's Mix, as a stage move does?*
5. **Do not contact, stopped and archived people are not moved**, because the Mix doesn't run for them. *Agreed?*
6. **Bulk Add's Undo puts the stage back**, while nothing has changed it since. Remove from Mix and Stop leave the stage as it is. *Agreed?*
7. **Retiring a stage stops the Mixes that set it**: their stage becomes None, and restoring the stage doesn't link them again. *Agreed?*
8. **Mega-Mix labels.** They are matched without regard to case, and a retired label comes back. A paused business stays paused. When they don't all fit under 20 stages, none are added. *Agreed?*
9. **Onboarding stays as it is.** Adding a Mega-Mix during onboarding doesn't add its labels, so a new account doesn't start with Contact stages on. *Should onboarding offer them too?*
10. **File, copy and Marketplace Mega-Mixes carry no labels yet.** Carrying them needs a change to the Mega-Mix file. A ready-made single Mix names no stage either. *Should a Mega-Mix file carry its stage names?*
11. **The history entry is a manual move named after the Mix**, not a new event type, so a rollback stays safe. *Fine?*
12. **The editor shows the stage choice only when the business has Contact stages.** *Or should it always show, with a link to set stages up?*

## Verification

Filled in from the run ledger (`.artifacts/mix-stages-20261007/verification/ledger.tsv`, private).

## NOT RUN

- No WF-05 review yet.
- No physical device.
- Production: nothing released; no production data read.
