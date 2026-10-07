# Mix placement and contact stages — 2026-10-05

**Status:** decisions recorded (D33–D37). Each build slice below is a separate WF-04 task. Slice 1 shipped in `prod-2026-10-06-4a77761` ([record](NO_MIX_STATUS_2026-10-05.md)) and slice 2 in `prod-2026-10-07-501841e` ([record](MIX_NEXT_STEP_2026-10-06.md)). Slice 3 is built, not yet released ([record](MIX_STAGES_2026-10-07.md)). Slice 4 is not started.

**Base:** `origin/main` e8692f2, whose `src` and `prisma` match production fd14b9a. Line numbers refer to that commit.

## Request

Kevin, 2026-10-05:

> "There seems to be a disconnect in how contacts get moves to the next steps. The web app doesn't seem to be intelligent enough to help the user to automatically trigger to place a contact into the next steps. Additionally on contacts there doesn't seem to identify that a contact is not in a mix."

> "In theory all contacts should be in a mix or else they are stuck in limbo and never have a trigger for the contact."

> "What if the user wants different terminology than a typical sales pipeline. Example how would these reflect if the pipeline is for business relatiionships and a user wants it to be prospect > Awareness > Interest > Qualification > Conversion > Maintain?"

> "for scalability and foundational structure, it should allow for other business types to utilize the app or even representatives of a larger company that want to use the app for their own personal managment (example: business development rep)."

## Findings

Every finding was read from code at e8692f2. Nothing was run in a browser or a test suite (JITM-12 §2).

### Three separate things move a person, and none of them is on by default

1. **Beats inside a Mix** come due on their schedule (`src/lib/jump-engine.ts`).
2. **Journey connections** start the next Mix (`src/lib/mix-workflow-engine.ts:109-172`). They exist only when the owner draws one in Journey, uses "After another Mix" in the Mix editor (`src/lib/mix-editor-actions.ts:357-363`), or adds a Mega-Mix (`src/lib/mega-mix-service.ts:62-67`). Each connection fires on one of three things:
   - **The Mix finishing.** This is automatic.
   - **An outcome.** The owner chooses it on the last Beat's card (`src/lib/mix-workflow-engine.ts:32-42`).
   - **A wait with no answer.** This is automatic.
3. **Contact stages** are off until the owner chooses "Use these starting stages" (`src/app/(app)/settings/journey/page.tsx:26`).

Stages and the Journey share no code. `src/lib/mix-workflow.ts` and `src/lib/jump-engine.ts` never read or write a stage. The only link runs from stage to Mix: entering a stage can start that stage's one Mix and end the previous stage's Mix (`src/lib/journey.ts:28-56`).

### No path puts a new contact in a Mix by default

| How a person arrives | Put into a Mix? |
|---|---|
| Add a contact | Only if "Schedule a follow-up now" is ticked, and it is off by default (`src/components/ContactForm.tsx:140,200-210`) |
| Quick Add | No. It offers no Mix choice (`src/lib/quick-capture.ts:30-93`) |
| CSV or vCard import, phone contacts | Only through a tag that already has a Mix, or a first stage with a Mix (`src/lib/contact-import-service.ts:400-464`; `src/lib/device-contact.ts:124-126`) |
| Lead connections | Only if stages are on and the stage the person lands in has a Mix (`src/lib/intake.ts:58`) |
| Onboarding | Yes, the one starter person (`src/lib/onboarding-actions.ts:147-156`) |

No setting chooses a default Mix for new contacts.

### Two gaps let people drop out

- **A Mix that ends with no connection prompts nothing.**
  - The only next-step control is "Schedule the next follow-up". It is unticked and folded under "Add a note or next follow-up" on every Beat (`src/components/JumpWorkflow.tsx:343,489,512-518`).
  - That control makes a one-time follow-up, not a Mix (`src/app/api/jumps/[jumpId]/outcome/route.ts:250-271`).
  - Journey lists a Mix with "no next connection" as a setup issue, but it does so per Mix, not per person (`src/lib/mix-workflow-view.ts:89`).
- **"Everyone" holds only the people who existed when the Mix was saved.**
  - A Mix's "Everyone" audience writes one assignment for each contact that exists at save time (`src/lib/mix-editor-actions.ts:350-355`). People added later are left out.
  - `Mix.includeFutureGroupMembers` is written in four places and read nowhere.

**INFERRED, not run:** someone tagged after a start-now Mix has begun seems to receive that Mix's Beats from the last 45 days at once, as overdue (`src/lib/jump-engine.ts:57,321,496-507`).

### Nothing finds a contact who is not in a Mix

- **Contacts.** The page has no grouped sections. It flags people only inside each row:
  - "Add phone or email" when both are missing;
  - red date text when a follow-up is late;
  - "Nothing scheduled" when nothing is pending (`src/components/ContactsBulkWorkspace.tsx:215`).
- **Contacts filters.** They cover only sort, tag, priority and permission (`src/components/ContactsBulkWorkspace.tsx:140-143`).
- **The old Journey roster.** It had "Late" and "Nothing scheduled" groups and was removed on 2026-09-21 (6c8927d). Its queries remain in `src/lib/journey-roster.ts` and `src/lib/journey-view.ts`, used only by tests.
- **Journey "Not started".** This is the closest current view (`src/lib/workflow-analytics.ts:17-23`). It misses people whose Mix finished or was stopped, and it ignores assignments.

### Contact stages carry sales wording and positional rules

- **Turning stages on** creates Lead, Prospect, Client and Retention, plus seven starter rules (`src/lib/journey.ts:14-23`).
  - New contacts join the first stage.
  - Existing contacts stay "No stage" until they are moved.
- **What the owner can change:** rename, add up to 20 stages, reorder, retire an empty stage, and give each stage one Mix. Only manual-start Mixes can be a stage's Mix (`src/lib/journey-actions.ts:31-66`).
- **The events are a fixed enum** (`prisma/customer-journey.prisma:1-12`). The contact's buttons are hardcoded as "Record a sale", "Work completed", "Record a booked meeting" and "Conversation started" (`src/components/ContactJourneyPanel.tsx:17`).
  - "Sale confirmed" and "Work completed" come only from those buttons or a lead connection.
  - Nothing names a qualified or interested contact.
- **The starter rules follow position, not meaning.**
  - Renaming the four defaults in order to Kevin's example gives "Prospect → Interest when a sale is confirmed" and "Prospect → Qualification when the work is completed".
  - The two added stages, Conversion and Maintain, get no rules.
- **Each stage takes one destination per event** (`@@unique([fromStageId, eventType])`).

### Wider audiences meet sales and owner wording

- Nothing in the data model stops one person from managing their own book inside a larger company.
- The barriers are wording and presets:
  - sales-only events and buttons;
  - "customer" and "sale" in product copy;
  - ready-made Mega-Mixes for five audiences only, with onboarding starts only for Real estate (`src/lib/journey-starts.ts:9-19`).

## Decisions

Kevin answered the analysis's five questions on 2026-10-05. They are logged as D33–D37 in [the owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md):

| ID | Decision | Kevin's words |
|---|---|---|
| D33 | Every contact shows whether they are in a Mix. Anyone not in one is either labeled so or confirmed by the owner. | "If there is no mix assigned to a contact, then the contact should show something that the contat has no mix. … Ideally everyone should be in the journey OR marked as a status/label/ or confirmation where they are not in a mix." |
| D34 | A business setting decides where new contacts go: (A) a default Mix, (B) ask each time, or (C) leave them out and show No Mix. The default is C. | "A, B, and C. There should be a setting for newly added contacts to default to one of those settings. Default can be C." |
| D35 | A Mix can set a person's stage, and a Mega-Mix can create stage labels that the owner can still change. | "A and/or B. Mega-mixes could create the labels, but users could always customize and change the labels." |
| D36 | Stage presets and milestones the owner names, both. | "C" |
| D37 | Support other business types and individual reps without marketing to them. | "A" |

D35 changes part of D16. Stages stay optional, and they still never create, order or organize the Journey graph. The graph can now set and create them.

## Proposed defaults

Each proposed default is in force as `[PROPOSED]` until Kevin confirms or changes it (JITM-17 §2.5). Each ends with its question.

| # | Default | Question |
|---|---|---|
| P1 | "In a Mix" means at least one Mix still has work to come for the person: a pending Beat, running Journey work, or a date-based Mix waiting for their next date. One-time follow-ups don't count, and neither does a finished or stopped Mix. Do not contact and archived people are left out of the count. | Is that the right line? |
| P2 | The labels are "No Mix" and "No Mix needed". "No Mix needed" is set on the profile or in bulk, can be undone, and clears itself when the person joins a Mix. | Are these the words you want? |
| P3 | Contacts gets a Mix filter (Any, In a Mix, No Mix, No Mix needed) with its count, and bulk Add to a Mix and No Mix needed. Today shows one line when anyone has No Mix, linking to that filter. Journey People gets a No Mix status. | Is a line on Today welcome, or should this stay on Contacts? |
| P4 | When a Mix ends with no connection, the last Beat's outcome asks what's next: Add to a Mix, schedule a one-time follow-up, or No Mix needed. Closing it leaves the person as No Mix. | Should it ask on every such Mix, or only when the person has nothing else running? |
| P5 | The D34 setting is one choice for the business, in Settings. It applies to Add a contact, Quick Add, phone contacts and lead connections. Each lead connection can pick its own Mix. Import asks in its review step, preselecting the default, so nothing starts from an import without a confirmation. When a stage's own Mix already starts, the default Mix is not added on top. Do not contact and plan limits apply as usual (JITM-09 §2.75). | Should imports follow the setting without asking? |
| P6 | "Everyone" includes people added later. | Or should it stay a list taken when the Mix is saved, labeled that way? |
| P7 | A Mix can name a stage ("People in this Mix are in Qualification"), which is set when the person starts that Mix. This changes only the label: it never starts or stops another Mix, and the stage's own Mix does not run. When two Mixes set different stages, the latest start wins. A person whose stage changes are paused keeps their stage. | Should the stage change when the Mix starts or when it finishes? |
| P8 | Adding a Mega-Mix offers its stage labels, on by default, and links its Mixes to them. A label with the same name is reused, and nothing the owner has is renamed or removed. Adding the labels turns Contact stages on, and adding still starts no one (JITM-09 §2.43). The ready-made lists are drafted from each Mega-Mix's own Mixes in the build and shown to Kevin before release. | None; Kevin reviews the lists. |
| P9 | Turning on Contact stages offers presets. **Sales** is today's Lead, Prospect, Client, Retention. **Business relationship** is Prospect, Awareness, Interest, Qualification, Conversion, Maintain. **Blank** starts empty. Each preset brings rules written for its own stages, so renaming never leaves rules pointing at the wrong meaning. | Any other presets, such as recruiting or personal network? |
| P10 | The owner can add milestones in their own words, such as "Qualified" or "Signed". Each one shows on the contact as a button, can drive a stage rule, and can be sent by a lead connection. The built-in events stay with neutral wording: an inquiry arrives, a conversation starts, a meeting is scheduled, happens or is missed, the Mix finishes, time passes. "Sale confirmed" and "Work completed" become renamable milestones of the Sales preset. | None. |
| P11 | Product copy that assumes a sale or an owner gets a WF-03 review for neutral words where the meaning allows ("contact", "person"). Marketing and profession pages are unchanged (JITM-02 §2.20). | None. |

## Build slices

Each slice is its own WF-04 task, pull request and release. The order follows the size of the gap.

1. **No Mix status (D33):**
   - the P1 definition in one shared query;
   - the No Mix label on the Contacts row and profile;
   - No Mix needed;
   - the Contacts filter, count and bulk actions;
   - the Today line;
   - the Journey People status.

   It needs a migration for the No Mix needed flag.
2. **What happens next (D33, D34):**
   - the end-of-Mix prompt (P4);
   - the New contacts setting (P5);
   - "Everyone" including later people (P6).

   It needs a migration for the setting.
3. **Stages from the work (D35):**
   - a Mix's stage (P7);
   - Mega-Mix stage labels (P8).

   It needs a migration for the Mix's stage.
4. **Stage wording (D36, D37):**
   - presets (P9);
   - named milestones (P10);
   - the wording review (P11).

   It needs a migration for milestones.

## NOT RUN

- No page was opened in a browser and no test was run for this record.
- The late-joiner effect for tagged start-now Mixes is inferred from code.
- Production data was not read, so the number of contacts without a Mix today is unknown.
