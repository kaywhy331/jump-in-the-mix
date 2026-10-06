---
id: JITM-05
title: Vocabulary and glossary
status: active
version: 2.1.0
owner: Kevin
last_reviewed: 2026-10-05
applies_to: [copy, interface-text, help, public-pages, email, onboarding, customer-docs]
supersedes: [docs/CANONICAL_PRODUCT_DECISIONS.md, CONTRIBUTING.md#product-language]
sources:
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/standards-audit-2026-09-28/DRIFT_BASELINE.md
  - docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md
  - docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md
  - docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md
  - docs/RELATIONSHIP_VOCABULARY.md
  - docs/CANONICAL_PRODUCT_DECISIONS.md
  - CONTRIBUTING.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
  - docs/INVITE_PAGE_RELEASE_2026-09-27.md
  - docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md
  - docs/design/DESIGN_GUIDELINES.md
  - src/components/BrandTermsHelp.tsx
  - src/components/Nav.tsx
  - src/lib/journey-numbering.ts
related_skills: [jitm-copy, jitm-ui-change, jitm-feature, jitm-review]
related_workflows: [WF-02, WF-03, WF-05]
---

# JITM-05 — Vocabulary and glossary

> The words Jump in the Mix uses with customers, what each one means, how Journey numbers read, which words are retired, and which internal names never reach customers.

## 1. Purpose and scope

This standard is the glossary for every customer-facing surface: the app, Help, public pages, email and customer-facing documents. It codifies the shipped vocabulary (D1): each feature name keeps its brand name and gains one plain explanation.

Neighboring topics live elsewhere:
- what each feature does, step by step: JITM-09 §2;
- tone and sentence style: JITM-04 §2;
- names in code, the database and routes: JITM-11 §2 and JITM-09 §2.

## 2. Rules

### The glossary

**2.1** Customer-facing words MUST come from the glossary in §2.2 and §2.3. A feature name is explained in plain words the first time a new user meets it. A new customer term, or a new meaning for an existing one, needs Kevin's decision through WF-08. [OWNER 2026-09-28 D1] [OWNER 2026-09-22 docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:9]

**2.2** Feature names. Use the plain meaning below wherever the product explains the term, including the "What these words mean" sheet. The terms are Kevin's decision; the wording of each meaning adapts the shipped definitions. [OWNER 2026-09-28 D1] [SHIPPED 9439fd6 src/components/Nav.tsx:9-22] [SHIPPED 9439fd6 src/components/MixLibraryNav.tsx:12] [SHIPPED 9439fd6 src/components/BrandTermsHelp.tsx:7-11] [PROPOSED]

| Term | Plain meaning | Internal name (never shown) | Where it appears |
|---|---|---|---|
| Today | The daily list of what needs you: follow-ups due and overdue, items that need your input and quiet-day check-ins, then what's upcoming and done. | `Jump`; route `/jumps` | Navigation |
| Contacts | The people you follow up with, and their notes, history, tags and saved dates. | `Contact` | Navigation |
| Mix, Mixes | A reusable follow-up plan for one kind of situation, such as an estimate that's out: its Beats and when it starts. | `Mix` | Navigation, library, editor |
| Beat, Beats | One planned text, email or call in a Mix that comes due at a set time. Each Beat has text, email and call versions. | `MixStep`, `StepVersion` | Mix editor, Journey, outlines |
| Journey | The map of how your Mixes connect and where each person is right now. | `MixWorkflow`, `MixWorkflowInstance` | Navigation (desktop), More |
| Calendar | Your meetings and time blocks, with calendar import and subscription links. | `CalendarEntry` | Navigation (desktop), More |
| Quick Add | The quickest way to add a person, a note or a follow-up from any screen, by typing or speaking. | none | Rail (desktop, tablet), central tab (phone) |
| Mega-Mix, Mega-Mixes | A named set of connected Mixes that covers your work from first inquiry to repeat business. | `MegaMixPipeline` | Mixes, Journey switcher, Marketplace |
| Marketplace | Where you find Mixes and Mega-Mixes to add: ready-made ones from Jump in the Mix, ones other members share, and your own shares. | `MarketplaceListing`, `SharedMix` | Mixes tabs |
| More | Invitations, Journey, Calendar, Lead connections, Settings, preferences, your account and Help. | none | Navigation (list: JITM-09 §2.6) |

**2.3** Supporting words that ship widely stay in use, lowercase in running text. [OWNER 2026-09-28 D1] [SOURCE docs/RELATIONSHIP_VOCABULARY.md:18] [SOURCE docs/standards-audit-2026-09-28/DRIFT_BASELINE.md:158]

| Word | Plain meaning | Internal name |
|---|---|---|
| follow-up | One due action for one person on Today: a Beat that came due, a one-time follow-up or an invitation to send. | `Jump` |
| one-time follow-up | A single follow-up you schedule yourself, from Quick Add or "Schedule the next follow-up". It belongs to none of your Mixes. | a hidden one-time Mix |
| ready-made | Made by Jump in the Mix. Adding a ready-made Mix or Mega-Mix gives you your own editable copy. | template, `SharedMix` |
| share | A Mix or Mega-Mix a member makes public in the Marketplace. A copy you add never changes by itself. | `MarketplaceListing` |
| saved date | A date on a person, such as a birthday, a job date or a renewal, that can start a Mix. | `JumpDate`, `DateType` |
| tag | A label that groups contacts. | `Group` |
| note, private note | Context about a person. Private notes never go into messages. | none |
| stage | An optional label for where a person stands with your business, such as Lead or Client, in your own words. Stages are managed in **Contact stages** in Settings. A Mix can set a person's stage, and a Mega-Mix can add its own stages, which you can rename. Stages do not organize the Journey, which is your connected Mixes and Beats (JITM-09 §2.51, §2.79). [OWNER 2026-10-05 D35] | `JourneyStage` |
| milestone | Something that happened with a person, recorded on their contact in your own words, such as Qualified or Signed. It can move their stage (JITM-09 §2.80). [OWNER 2026-10-05 D36] [PROPOSED] | `JourneyEventType` today; owner-named milestones are not built |
| No Mix, No Mix needed | No Mix: no Mix has work to come for this person, so nothing will remind you about them. No Mix needed: you confirmed they don't need one (JITM-09 §2.76). [OWNER 2026-10-05 D33] [PROPOSED] | none yet; not built |
| invitation | Two kinds. A member's personal invitation: one of the member's own invitations, which the member sends from Today in their own email or text app (allowance: JITM-09 §2.17). An access invitation: the single-use link the waitlist or staff send (JITM-09 §2.15). | `ReferralAccessInvite` (its `source` tells the kinds apart); System Mix for the member wording |
| pipeline | A plain word in Mega-Mix copy for the whole path from first inquiry to repeat work, as in "Your pipeline is ready" after a Mega-Mix is added. It is not a feature name; the feature is the Mega-Mix. | none; `MegaMixPipeline` is the Mega-Mix model |
| connection | Two shipped meanings. In Journey, a saved path from a Beat or a finished Mix to the next Mix or Beat (JITM-09 §2.55). In the feature names Lead connections (Settings, More) and Calendar connections (Calendar), a link to an outside source of people or events. | a rule in `MixWorkflow`; `IntakeConnection`, `CalendarConnection` |
| Today sections | Overdue, Today, Needs your input, Quiet-day check-ins, Upcoming, Done; "Next up" marks the first card. | none |
| Journey views | Setup, Progress, Results. | none |

**2.4** A Beat belongs to a Mix; a follow-up is what lands on Today. Copy MUST describe Today as everything due for the owner, including one-time follow-ups and invitations to send, and MUST count follow-ups, not Beats, there. Setup steps are not Beats. [OWNER 2026-09-28 D1] [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:430,450] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:24] [SOURCE docs/RELATIONSHIP_VOCABULARY.md:18]

**2.5** "Ready-made" describes content Jump in the Mix publishes. It is found in the Marketplace's "Jump in the Mix" section; the Marketplace's other sections are "Community" and "My shares" (JITM-09 §2.74). The separate Ready-made mixes library (`/templates`) is being folded into that section and still ships with its own entries (§6). The owner's own Mixes and Mega-Mixes, built or added, are "your Mixes" and "your Mega-Mixes". [OWNER 2026-09-28 D29] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:14,53-57] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:144] [SHIPPED 9439fd6 src/app/(app)/more/page.tsx:28]

### Journey numbering

**2.6** Numbers follow JITM-09 §2.54. In copy they read as a journey letter (A), a Mix number (A1) and a Beat number (A1.a). [OWNER 2026-09-28 O5] [SHIPPED 9439fd6 src/lib/journey-numbering.ts:4-8]

**2.7** A whole Mix shows its Mix number ("A3") and a Beat its Beat number ("A3.b"). People rows read "A1 · Welcome". Map cards and outlines show the Mix number, never a Beat range. Lists sort naturally: A2 before A10, A1 before A1.a, A9 before B1. [SHIPPED 9439fd6 src/lib/journey-numbering.ts:55-63] [SHIPPED 9439fd6 src/components/WorkflowPeople.tsx:29] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:20]

**2.8** Numbers can change, and owners never type them (JITM-09 §2.54). Copy MUST NOT promise that a number is permanent. [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:94] [SHIPPED 9439fd6 src/lib/journey-numbering.ts:65-69] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:37]

**2.9** The position numbering of 2026-09-24 (1, 2, 3a, 4a/4b, 6aa, and ranges such as "3b–6b") is retired and MUST NOT be used. [OWNER 2026-09-28 O5] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:20]

### Retired words and internal names

**2.10** These words are retired as customer terms and MUST NOT appear in new copy; existing uses are deviations (§6):
- "Plan" or "Plans" as the name of a Mix or of a product area, and "ready-made plan". "Follow-up plan" may still explain what a Mix is.
- "Step" as the name of a Beat. Ordinary uses ("next step", "Step 3") stay.
- "Jump" or "Jumps" for anything but the brand name.
- "Campaign".
- "Connect" or "Connected" as the name of a product area (the retired "Connect" feature). "Connected" stays as a call outcome, "connection" keeps its two meanings in §2.3, and the plain verb for linking a calendar or a lead source stays.
- "Important Date"; say saved date.
- The 2026-09-07 jargon: cue, loop, tempo, remix, fine-tune, touchpoint, anchor. Say what starts it, repeats, timing, your copy, edit.
- "System Mix" outside staff screens; say invitations or Invite people.

[OWNER 2026-09-28 D1] [SOURCE CONTRIBUTING.md:65-70] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:44-45] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md:199,203] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:17]

**2.11** Internal names and implementation words MUST NOT reach customer copy:
- model and code names: `Jump`, `JumpDate`, `DateType`, `Group`, `MixStep`, `MixWorkflow`, `MixWorkflowInstance`, `MegaMixPipeline`, `StepVersionVariant`, `manualDelivery`, `AFTER_MIX`, `BROADCAST`;
- implementation words: worker, queue, job, lease, snapshot, occurrence, reconciliation, broadcast, day offset, activation impact, Action Template, Mix Template, instance, revision, variant.

Say what the owner sees instead: "saved version", "this piece of work", "text, email and call versions". [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:50,121] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:34]

**2.12** Staff screens may use the internal names staff need, such as System Mix. Anything a customer or their contacts can see uses the glossary. [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:17] [PROPOSED]

### Spelling and capitalization

**2.13** Feature and screen names are capitalized: Today, Contacts, Journey, Calendar, Quick Add, Marketplace, More. Product objects are capitalized everywhere, mid-sentence too: Mix, Mixes, Beat, Beats, Mega-Mix, Mega-Mixes. Generic words stay lowercase: follow-up, contact (a person), saved date, tag, note, invitation, pipeline, connection. [OWNER 2026-09-28 D1] [PROPOSED]

**2.14** The only spelling is "Mega-Mix", plural "Mega-Mixes"; never "Mega-mix", "mega-mix", "MegaMix" or "mega mix". [OWNER 2026-09-28 D1]

**2.15** Counts use the singular for one and the plural otherwise: "1 Beat", "3 Beats", "1 invitation left". [SHIPPED 9439fd6 src/components/MixLibraryNav.tsx:15] [SHIPPED 9439fd6 src/lib/invitation-labels.ts:5-6]

**2.16** "Contacts" names the feature and its screens. In running copy, "person" and "people" are the default; "customer" or "client" fit where the context is clearly business work. One screen MUST NOT use two of these words for the same list. [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:475] [PROPOSED]

### Teaching the words

**2.17** The "What these words mean" sheet MUST use the plain meanings in §2.2. It ships on Mixes, Mega-Mixes, the Marketplace and Journey, and it SHOULD also be reachable where a first-time owner meets the words: Today, the contact page and onboarding. [SHIPPED 9439fd6 src/components/BrandTermsHelp.tsx:6-12] [SHIPPED 9439fd6 src/app/(app)/marketplace/page.tsx:74] [SHIPPED 9439fd6 src/app/(app)/mixes/mega/page.tsx:61] [OWNER 2026-09-22 docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:9] [PROPOSED]

**2.18** Public pages introduce Mix and Beat only after the value is clear ("A Mix is a reusable follow-up plan"), and a visitor MUST NOT need the vocabulary to try the demo. [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:90] [SHIPPED 9439fd6 src/components/PublicLanding.tsx:32]

## 3. Canonical implementations

- `src/components/BrandTermsHelp.tsx`: the "What these words mean" sheet.
- `src/components/Nav.tsx`: navigation labels.
- `src/components/MixLibraryNav.tsx`: the Mix library tabs and count wording.
- `src/lib/journey-numbering.ts`: `numberJourney`, `compareJourneyNumbers`, `journeyTargetNumber` and `numberPortable`.
- `src/lib/invitation-labels.ts`: the invitations-left wording.
- `docs/standards-audit-2026-09-28/DRIFT_BASELINE.md` (metric 4): the term counts to compare against.

## 4. Do / Don't

- **Do** "2 follow-ups need your attention" on Today. **Don't** "2 Beats are due" there.
- **Do** "Mega-Mix". **Don't** "mega-mix" or "Mega-mix".
- **Do** "When should it start? When I add a date". **Don't** "Set its cue".
- **Do** "Invite people". **Don't** "Jump in the Mix System Mix".
- **Do** label a path "to A3" or "to A3.b". **Don't** show "3b–6b".
- **Do** "Your follow-up list is awaiting preparation." **Don't** "The worker is preparing your Jumps."

## 5. Verification

- Rerun metric 4 of the drift baseline and compare it with the baseline on 9439fd6. Counts of retired terms and variant spellings must not rise.
- Spot checks, each followed by reading the hits:

```bash
grep -rnE "Mega-mix|mega-mix" src/app src/components src/lib
grep -rnE "Important Date|[Cc]ampaign|\b[Cc]ue\b|[Tt]empo" src/app src/components src/lib/support-content.ts
```

- Changed screens that show Journey numbers show only A1 and A1.a labels.
- New copy explains a feature name the first time a new user meets it.

## 6. Open decisions and known deviations

Open questions for Kevin:
- The account holder is a "member" in some standards (JITM-01 §2.8) and an "owner" in others (JITM-09 §2.17). Which word should copy use?
- Should the glossary sheet appear on Today, the contact page and onboarding (§2.17)?
- Please confirm the wording of the plain meanings in §2.2. The glossary sheet and Help adopted it in the copy batch (PR #96).

Known deviations, rechecked at 9f967bc after the copy batch (PR #96) and its casing follow-up (PR #99):
- Journey labels change with the view, against the account-wide labels of JITM-09 §2.54 (D21; backlog B-13).
- The Ready-made mixes library keeps its own entries in More and Mix tools, against §2.5 and JITM-09 §2.74 (D29; backlog B-19).
- Retired words remain, against §2.10: "On the cue day" and "on the cue day" when adding a ready-made Mix (`src/components/TemplateUseForm.tsx:86,114`), "with the cue" on the appointment form (`src/components/CalendarEntryForm.tsx:102`), "Loop · repeat this date" on the contact page (`src/components/ContactProfile.tsx:251,256`) and "touchpoint" in the recruiter page's meta description (`src/lib/persona-mixes.ts:199`).
- Three links still say "customer journey", against D4 and D16: "Set up your customer journey" and "customer journey rules" open Contact stages (`src/components/ContactJourneyPanel.tsx:12`; `src/app/(app)/settings/connections/page.tsx:55`), and "Customer journey" opens the Journey map (`src/components/ContactsBulkWorkspace.tsx:161`).
- Mixes added from a Mega-Mix are saved with the goal "Customer journey" and the approach "Mega-mix", and the Mix editor shows both (`src/lib/mega-mix-service.ts:44`; `src/lib/marketplace-service.ts:149`; `src/components/MixEditor.tsx:214,216`).
- The Mega-Mix library's pane button says "Mega-mixes" and its count says "{n} connected mixes" (`src/components/MegaMixLibrary.tsx:23,25`), against §2.13 and §2.14.
- The superseded tables remain in `docs/CANONICAL_PRODUCT_DECISIONS.md:40-50` and `CONTRIBUTING.md:61-70`.

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 2.0.0 — 2026-09-28 — Base 61d4df4. Ready-made content is found in the Marketplace's Jump in the Mix section (§2.5, D29); stage settings are Contact stages (D16); §6 updated for D21.
- 2.0.1 — 2026-09-29 — Base 9f967bc. §6: the copy batch (PR #96, O8) and PR #99 fixed the glossary sheet, Help's retired words, "plan" for a Mix, the More and Settings labels for Journey and Contact stages, "My Account", `START_HERE.md` and `README.md` "Plans", and most lowercase spellings. Those entries are removed, and standards no longer quote the old casing. The retired words, "customer journey" links and Mega-Mix spellings found by the release review are listed.
- 2.1.0 — 2026-10-05 — Base e8692f2. §2.2: a stage can be set by a Mix and added by a Mega-Mix (D35); new terms milestone (D36) and No Mix / No Mix needed (D33), proposed wording waiting for Kevin's confirmation (docs/MIX_PLACEMENT_AND_STAGES_2026-10-05.md).
