---
id: JITM-09
title: Information architecture and user workflows
status: active
version: 6.0.0
owner: Kevin
last_reviewed: 2026-10-06
applies_to: [routes, navigation, today, quick-add, contacts, mixes, mega-mixes, marketplace, journey, calendar, onboarding, invitations, waitlist, support, account, public-pages]
supersedes: [docs/UX_WORKFLOW_OPTIMIZATION.md]
sources:
  - src/components/Nav.tsx
  - src/app/(app)/jumps/page.tsx
  - src/lib/journey-numbering.ts
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/CANONICAL_PRODUCT_DECISIONS.md
  - docs/UX_WORKFLOW_OPTIMIZATION.md
  - docs/JOURNEY_IMPLEMENTATION_2026-09-21.md
  - docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md
  - docs/ONBOARDING_INVITATIONS_2026-09-17.md
  - docs/INVITE_PAGE_RELEASE_2026-09-27.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
  - docs/design/DEMO_WORKSPACE_2026-09-19.md
  - docs/MIX_PLACEMENT_AND_STAGES_2026-10-05.md
related_skills: [jitm-feature, jitm-ui-change, jitm-copy, jitm-review]
related_workflows: [WF-02, WF-03, WF-04]
---

# JITM-09 — Information architecture and user workflows

> Where every page lives, what the navigation offers, and how each core workflow runs from trigger to result.

## 1. Purpose and scope

This standard owns the route map, the navigation destinations and labels, and the canonical workflows: access and onboarding, Quick Add, Today, Contacts, Mixes, Mega-Mixes, the Marketplace, Journey, Calendar, invitations, the waitlist, support, account controls, and the public demo and profession pages. Each workflow is written as trigger, steps, then rules. Quoted UI labels are the shipped strings at 9439fd6; their casing follows JITM-05 §2.13 once the copy pass lands (JITM-05 §6).

Neighboring topics live elsewhere: the core loop, first-run promise and feature map in JITM-01 §2; layout, panes and breakpoints in JITM-07 §2; interaction patterns (review, handoff, outcome and Undo, confirmations, sheets, forms) in JITM-08 §2; terms and numbering labels in JITM-05 §2; wording in JITM-04 §2; scheduling, data and security mechanics in JITM-11 §2.

For Journey, shipped behavior comes from `docs/JOURNEY_IMPLEMENTATION_2026-09-21.md` and the code. The 2026-09-21 dynamic workflow contract, forensic review and hand-off proposal are proposals except where shipped. The navigation and core-loop section of `docs/CANONICAL_PRODUCT_DECISIONS.md` and `docs/UX_WORKFLOW_OPTIMIZATION.md` are history (D3).

## 2. Rules

### Route map and navigation

**2.1** Every page MUST sit in the route group that matches its users. [SHIPPED 9439fd6 src/app/(app)/layout.tsx:10] [SHIPPED 9439fd6 src/app/(staff)/layout.tsx:12]

| Group | Routes | For |
|---|---|---|
| Public | `/`, `/for/[profession]`, `/faq`, `/follow-up-templates/…`, `/features/follow-up-reminders`, `/waitlist`, `/waitlist/confirm`, `/waitlist/leave`, `/contact`, `/privacy`, `/terms`, `/security`, `/offline` | Visitors |
| Recipient | `/lead/[connectionId]`, `/review/[token]` | The owner's own customers |
| Auth and setup | `/login`, `/register`, `/verify-email/pending`, `/auth/magic`, `/forgot-password`, `/reset-password`, `/signed-out`, `/onboarding`, `/account/deleted`, `/staff/accept` | People signing in or setting up |
| App `(app)` | `/jumps` (Today), `/contacts/…`, `/mixes/…`, `/templates/…`, `/marketplace`, `/journey`, `/calendar`, `/more`, `/settings/…`, `/account/…`, `/help` | Signed-in owners, in the app shell |
| Staff `(staff)` | `/admin/…`, `/account/admin-mfa` | Staff with administrator MFA |
| API | `/api/…` | Forms, downloads and integrations; never a navigation destination |

**2.2** Adding, renaming, removing or reordering a primary destination MUST go through Kevin and WF-08. [OWNER 2026-09-28 D1] [OWNER 2026-09-28 O6]

**2.3** Primary navigation MUST be, in order: Today (`/jumps`), Contacts, Mixes, Journey, Calendar, More. Desktop rails show all six. The phone tab bar shows Today, Contacts, a central Quick Add, Mixes and More, and phones reach Journey and Calendar through More. Rail and tab-bar layout: JITM-07 §2. [OWNER 2026-09-28 D1] [SHIPPED 9439fd6 src/components/Nav.tsx:9-16]

**2.4** Settings, Help and My account are account destinations. The desktop sidebar footer MUST list them; phones reach them through More. [SHIPPED 9439fd6 src/components/Nav.tsx:18-22] [SHIPPED 9439fd6 src/app/(app)/more/page.tsx:16-20]

**2.5** Mixes MUST be marked current on `/mixes/…`, `/templates/…` and `/marketplace`. On phones, pages reached through More mark More. [PROPOSED] [SHIPPED 9439fd6 src/components/Nav.tsx:40]

**2.6** More MUST offer, in order:
- Invite people, only while invitations are left (JITM-09 §2.9);
- Today and Ready-made mixes, on desktop only;
- Journey, described as the map of Mixes and Beats, and Calendar;
- Lead connections, Settings, Personal preferences, Notifications, My account and Help;
- the appearance control and Sign out (End view-only session during a support view).

[SHIPPED 9439fd6 src/app/(app)/more/page.tsx:12-28] [OWNER 2026-09-28 D4]

**2.7** Settings is the hub for business and account configuration: Contact stages (`/settings/journey`), Lead connections, Calendar & time blocks, My business, Personal preferences, Notifications, Sending to customers, Date types, Password & sessions, and Data & privacy. Contact stages MUST NOT be labeled or described as Journey; Journey is described as connected Mixes and Beats. [SHIPPED 9439fd6 src/app/(app)/settings/page.tsx:10-20] [OWNER 2026-09-28 D4] [OWNER 2026-09-28 D16]

**2.8** Quick Add MUST be one tap away on every app page: the sidebar button on desktop and the central tab on phones. It is not offered in view-only support sessions. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:61] [SHIPPED 9439fd6 src/components/AppShell.tsx:47] [SHIPPED 9439fd6 src/components/Nav.tsx:41]

**2.9** "N invitations left" prompts MUST appear only to the workspace owner, while invitations remain and are not paused. They sit in the desktop sidebar, the tablet app header (768–900px), the More tab badge, a Today strip, the More page and the Profile sheet, and each opens `/mixes/system`. [OWNER 2026-09-27 docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:3] [SOURCE docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:20-27] [SHIPPED 9439fd6 src/lib/invitation-allowance.ts:18-20] [SHIPPED 9439fd6 src/components/AppShell.tsx:49,69,81]

### Principles for every workflow

**2.10** Workflows implement the core loop in JITM-01 §2. Release review SHOULD hold two budgets: adding a person with a first follow-up takes one compact form submission, and completing a prepared follow-up takes the composer handoff plus one return confirmation. [SOURCE docs/UX_WORKFLOW_OPTIMIZATION.md:7-12]

**2.11** Setting up, installing, importing or saving a connection MUST NOT enroll anyone or send anything. People enter work only through an owner action that says so, such as Start after a preview of the real dates, or activating a Mix after reviewing who gets it (JITM-09 §2.39). [SOURCE docs/MEGA_MIXES_2026-09-22.md:19] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:7,13] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:49] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:51]

**2.12** The Mix editor and Journey MUST edit the same saved configuration. Work keeps the version saved when it began; edits apply to new work, and the editor says so. [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:10,24] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:20]

**2.13** An exact follow-up link (`/jumps?jump=<id>&range=all`) MUST open that follow-up whatever the filters. A follow-up that is gone or finished says so and links to its current context. [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:16] [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:472]

**2.14** Every workflow MUST work with manual review and handoff alone. Automatic customer email is off in production during the beta (JITM-00 §2), and Sending to customers shows email as not available yet (its wording: JITM-04 §6). [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:6] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:26]

### Access: waitlist and invitations

**2.15** A hosted account MUST be created only from a single-use access link. Links come from the waitlist (weekly waves of up to five oldest confirmed and five random requests, plus staff selections) or from a member's personal invitation. Opening a link does not use it up, and email verification still follows. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:81] [SOURCE docs/WAITLIST_OPERATIONS.md:19,23,38] [SOURCE docs/ONBOARDING_INVITATIONS_2026-09-17.md:12]

**2.69** Staff set how many people can join with two admission limits, both zero until configured, and with pauses that never revoke links already sent. Counting follows the runbook `docs/ADMISSION_CONTROLS.md`. [SOURCE docs/ADMISSION_CONTROLS.md:9,21,38] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:135]

**2.16** Joining the waitlist (homepage or `/waitlist`) MUST take an email only and create no account. The 24-hour confirmation link needs a button press, and receipts never reveal account or waitlist status. `/waitlist/leave` withdraws after a confirmed button press; rejoining needs a new confirmed request. [SOURCE docs/WAITLIST_OPERATIONS.md:16-17,44-48]

**2.17** Each owner MUST have three personal invitations for life, including earlier ones, and prepares one to three at a time. Revoking cancels the Today reminder and MUST NOT refund the slot. Member invitations do not count against outstanding-invitation capacity, but invitation pauses stop them. [OWNER 2026-09-17 docs/ONBOARDING_INVITATIONS_2026-09-17.md:3,10-11,13-14] [SHIPPED 9439fd6 src/lib/system-mix.ts:1] [SHIPPED 9439fd6 src/lib/admission.ts:30] [SHIPPED 9439fd6 src/lib/referral-access.ts:59]

**2.18** A member's invitation is emailed only after the owner previews it and chooses **Send invitation**; personal sharing from their own email or text app and copying the link stay available. That email is separate from automatic customer outreach and never depends on it. Until email delivery is built, the app MUST NOT email a member's invitation, and copy MUST keep explaining manual delivery. Invite people (`/mixes/system`) runs today:
1. one field per person (name, email or phone): names suggest saved contacts, an address marks a new contact, other text is stopped;
2. Preview invitation, a confirmation that says nothing is emailed yet, then Add to Today;
3. the contact if needed, a single-use link and a pending Today reminder are created in one transaction;
4. Today shows "N invitations ready to send" with Review and send; the owner sends from their own email or text app and records it;
5. Your invitations lists each one with its status, Send now, Open in Today and Revoke.

Automatic delivery never claims these reminders. Wording: JITM-04 §2. [OWNER 2026-09-28 D26] [OWNER 2026-09-17 docs/ONBOARDING_INVITATIONS_2026-09-17.md:3,10,14] [OWNER 2026-09-27 docs/INVITE_PAGE_RELEASE_2026-09-27.md:15] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:16-24,73-79] [SHIPPED 9439fd6 src/lib/referral-access.ts:65] [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:449-455]

**2.19** Invitation wording is the staff-published System Mix. When the published version differs from the member's preview, the member MUST review again before a slot is spent. Customers see "Invite people"; "System Mix" is a staff term (JITM-05 §2). [SOURCE docs/SYSTEM_MIX_ADMINISTRATION.md:25] [SHIPPED 9439fd6 src/lib/referral-access.ts:55] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:17]

### Onboarding to the first prepared follow-up

**2.20** Onboarding (`/onboarding`) MUST recommend one person and one follow-up first, so a tester sees the core value before configuring a whole system. Setting up a complete Mega-Mix, suggested from the business type or the marketing example the person chose, stays available as an optional next step, as does Choose individual mixes. Save answers and finish later and Skip for now stay available. The recommendation is a usability hypothesis: observe whether testers prepare their first useful follow-up without help. Once the first follow-up is ready, Today's welcome offers that next step. It names the Mega-Mix matching the marketing example, or the business type when exactly one Mega-Mix fits it; otherwise it opens the Mega-Mix list. It is not offered for personal-only use or when the account already has a Mega-Mix. A business type with its own curated journey offers that journey's starts as the first follow-up: Real estate offers the Real estate Mega-Mix's starts, with a new buyer lead first, and each start is that stage's own Beats. Other business types keep the general list. [OWNER 2026-09-29 docs/REALTOR_JOURNEY_IMPLEMENTATION_2026-09-29.md:12] [OWNER 2026-09-29 O9] [OWNER 2026-09-28 D26] [OWNER 2026-09-22 docs/ONBOARDING_JOURNEY_PREFERENCES_2026-09-22.md:5] [OWNER 2026-09-22 docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:8] [SHIPPED 9439fd6 src/components/OnboardingForm.tsx:39-40,47,88] [SHIPPED 9439fd6 src/components/MegaMixSetup.tsx:25]

**2.21** The Mega-Mix route MUST run:
1. preferences (communication, spacing, working days and hours, timezone, preferred time, quiet times, appointment buffers), saved and reused for later Mega-Mixes;
2. a review summary, which Enter can never skip;
3. install: preferences, Mixes, connections and a receipt commit together, and no one is enrolled;
4. "Your pipeline is ready", then Add your first customer, the contact form, a preview of real dates and Start.

The individual route saves preferences and opens the library without a contact. Finish later installs and enrolls nothing. [SOURCE docs/ONBOARDING_JOURNEY_PREFERENCES_2026-09-22.md:5,7] [SOURCE docs/MEGA_MIXES_2026-09-22.md:19,25,27] [SOURCE docs/UX_GAP_FIXES_PRODUCTION_RELEASE_2026-09-23.md:5,57] [SHIPPED 9439fd6 src/components/MegaMixLibrary.tsx:29-30] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:13,22]

### Quick Add

**2.22** Quick Add runs: type or Speak, Continue, then a "Saving as" review of a person (new, or an existing one chosen explicitly) with an optional private note, event and follow-up. Save all saves the chosen items together, once even on retry, and the receipt offers View person and View follow-up. Unstated times and follow-up methods MUST be chosen, and duplicates and calendar overlaps need an explicit choice. Other ways to add: Add a person, Log what happened. [OWNER 2026-09-20 docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md:3] [SOURCE docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md:7-11] [SHIPPED 9439fd6 src/components/QuickAdd.tsx:145-165]

**2.23** A Quick Add follow-up is one-time, manual-only work outside every Mix: automatic delivery MUST NOT claim it, even with sending turned on. [SOURCE docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md:13] [SHIPPED 9439fd6 src/lib/one-time-follow-up.ts:27,47] [SHIPPED 9439fd6 src/lib/automatic-delivery.ts:162]

### Today: review, outcome and next step

**2.24** Today (`/jumps`) MUST order its queue: invitations ready to send, the invitations strip, the preparation notice, Overdue, Today, Needs your input, Quiet-day check-ins, the No Mix line (§2.77), Upcoming ("Next 7 days" in the due and week views), then Done. The first open card carries "Next up". The No Mix line is decided and built but not yet released; the rest of the order is shipped. [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:449-464] [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:370] [OWNER 2026-10-05 D33]

**2.25** Today MUST state only what is true:
- "You're caught up." only when nothing is due, nothing needs input and every check succeeded; otherwise it says the next steps could not be checked or are awaiting preparation;
- Needs your input holds owner decisions, due callbacks, date repairs and failed preparation with Retry, never deliberate pauses;
- the welcome notice after setup never promises a Review that does not exist.

[SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:403-411,430] [SOURCE local-only f7ea577d837b6b1f docs/CONTRACTOR_UX_APPROACH_2026-09-22.md:62] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:14] [SOURCE docs/UX_GAP_FIXES_2_PRODUCTION_RELEASE_2026-09-23.md:52]

**2.26** Review (pattern: JITM-08 §2) MUST open on the Recommended version unless the owner already chose one for this follow-up. Text, Email and Call stay visible; an unavailable one follows the pattern in JITM-08 §2.6, and its Add link returns here. Switching MUST NOT send or create a follow-up, and it keeps a separate draft per version. [OWNER 2026-09-23 docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:3] [SOURCE docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:12-16]

**2.27** After the handoff, recording MUST offer Sent or Not sent for messages, and Connected, Left voicemail, No answer or Did not call for calls. A configured Journey decision is recorded with it; a decision list that fails to load shows as failed and can be retried. Not sent keeps the follow-up open. [SHIPPED 9439fd6 src/components/JumpWorkflow.tsx:399-409] [SHIPPED 9439fd6 src/app/api/jumps/[jumpId]/outcome/route.ts:228] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:15] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:18]

**2.28** "Schedule the next follow-up", "Rescheduled", and "Save & schedule follow-up" with no Mix chosen MUST each give exactly one follow-up at the chosen day and time, outside every Mix, and the confirmation names that time. For Journey work, Rescheduled moves the same follow-up instead. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:7] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:24] [SHIPPED 9439fd6 src/app/api/jumps/[jumpId]/outcome/route.ts:224,250-253]

**2.29** A completed or skipped follow-up MUST NOT come back by itself: no settings or Beat-timing change recreates it. Only Undo or Reopen makes it open again. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:8] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:25] [SHIPPED 9439fd6 src/app/api/jumps/[jumpId]/outcome/route.ts:217]

**2.30** Each open card MUST offer Mark done, Snooze (presets or a chosen day), Skip beat and, for Mix work, Stop mix after a confirmation that keeps completed history. Skipping keeps a ten-second Undo, and Done offers Reopen except for automatic sends. [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:381,387-390] [SOURCE docs/FULL_AUDIT_2026-09-24.md:140]

**2.31** Early news goes through "Record an update or choose a callback date". The owner picks the work and what happened: a configured outcome, "Customer asked me to get back to them" or "I want to choose when to check again". After a review of the effect, it MUST cancel only the selected remaining work and the paths it affects. An expired callback creates an owner action and never implies acceptance, and no outcome is invented where none is configured. [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:15,27] [SHIPPED 9439fd6 src/components/WorkflowBusinessUpdate.tsx:55-63]

### Contacts

**2.32** Contacts (`/contacts`) holds people, notes, history, tags and saved dates. A profile MUST show contact methods, the next follow-up with its real dates, the stage and history, with Text, Email, Call and Note actions that respect missing methods and Do not contact. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:57] [SOURCE docs/design/DESIGN_GUIDELINES.md:26] [SOURCE docs/design/CONTACTS_IMPLEMENTATION_2026-09-19.md:11-12]

**2.33** People arrive through Add a person (`/contacts/new`, with "Save & schedule follow-up"), Quick Add, CSV or vCard import, the device contact picker, contact cards shared from a phone, and lead connections. Imports MUST merge only exact, unambiguous matches and hold the rest for review. A merge moves Journey work without merging it. Add from your phone (`/contacts/from-phone`) gives each phone its own path. On Android it is the picker, which also sits at the top of Add a contact. On iPhone it is the owner's shortcut, which sends shared cards with a personal key; the key is shown once, stored only as a hash, and replaced by a new one. A card saved to Files can also be imported. Shared cards take only the name, company, emails, phones and addresses. [OWNER 2026-10-05 D32] [SOURCE docs/QUICK_ADD.md:12-14] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:36] [SHIPPED 9439fd6 src/components/ContactForm.tsx:303] [SHIPPED 9439fd6 src/app/(app)/more/page.tsx:15]

**2.34** Adding a person to a Mix from their profile (Choose a mix) MUST ask for a start date. A date-triggered Mix takes that date when the person has none, and a finished Mix restarts from it. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:24] [SHIPPED 9439fd6 src/components/ContactProfile.tsx:147,261]

**2.76** Every contact MUST show whether they are in a Mix, so a person with no next action is easy to find. A contact who is not in a Mix shows "No Mix" on their Contacts row and profile. The owner can confirm that someone needs no Mix: "No Mix needed" replaces the label, can be undone, and clears itself when the person joins a Mix or a paused Mix resumes for them. "In a Mix" means at least one Mix still has work to come for the person: a pending Beat, Journey work that can still bring work, Beats a paused Mix holds for them, a Mix whose Beats for them are still being prepared, or a date-based Mix waiting for their next date. Journey work counts through its follow-ups, one still to come or one held because its Mix or the Journey is paused, or through real waiting with no follow-up yet: a decision waiting for the owner, a path waiting to start a Mix, an open check-back date or a choice being applied, while its Mixes are open to the person. A wait counts only while it can still move, so none on a connection the owner removed and no path held at its repeat limit; one on a paused connection, which the owner can resume, does. A Journey record's status never counts by itself, so a record left running after its start was stopped, removed or undone, its Mix archived, or its last Beat done keeps no one in a Mix. A paused Mix counts as being in a Mix for all of its people: those with overdue Beats, those whose Beats are all held by the pause, those it has prepared nothing for yet, and those whose Journey work is paused. One-time follow-ups don't count, and neither does a finished or stopped Mix. Do not contact and archived people are left out. No Mix is a work label, kept apart from the stage (§2.71). [OWNER 2026-10-05 D33] [OWNER 2026-10-06 D45] [SOURCE docs/NO_MIX_STATUS_2026-10-05.md:68]

**2.77** Contacts MUST offer a Mix filter (Any, In a Mix, No Mix, No Mix needed) with its count. The counts, and the "{n} with No Mix" link beside the list, cover the people the current search and filters show; the link keeps the search and the tag, and also the list's other filters (default 1). Actions on the list return to it with its filters and the docked person, never with an earlier notice. From the filtered list, the owner can add people to a Mix or mark them No Mix needed in bulk. Add to the Mix acts at once and leaves anyone the Mix already has work for, by any route, as they are (default 5); someone stopped in the Mix or marked Do not contact is refused by name instead. For a Mix started by hand it says that anyone who finished the Mix starts it again; a date-based or fixed-date Mix gets its own sentence, and a fixed-date Mix asks for no start day (default 6). Its notice names the Mix and what happened to each person and offers Undo. Undo takes back what each of that action's starts did and nothing else: an assignment the start created ends, one it restarted goes back to its earlier start, the start's own follow-ups still to come are cancelled, a saved date it wrote is removed, and a No Mix needed confirmation it replaced comes back (defaults 2–4). Like Remove from Mix, it also ends the run's Journey record, so nothing asks the owner about those follow-ups and the record keeps no plan place; a later start of the same Mix and day picks it back up (default 8). It never touches completed or skipped follow-ups or history (JITM-00 §2.6), and another route's work stays: a Journey path's and a visit's are left alone, and a follow-up another enrollment shares is brought back by the next preparation pass. Today shows one line when anyone has No Mix, linking to that filter: "{n} people have No Mix, so no Mix will remind you about them.", which stays true when a one-time follow-up is on its way. Journey People offers the same status. When a Mix ends without a connection, the last Beat's outcome asks what's next: add to a Mix, schedule a one-time follow-up, or No Mix needed. Closing it leaves the person as No Mix. [OWNER 2026-10-05 D33] [OWNER 2026-10-06 D44] [OWNER 2026-10-06 D46] [OWNER 2026-10-06 D47] [SOURCE docs/NO_MIX_STATUS_2026-10-05.md:62-67] [SOURCE docs/NO_MIX_STATUS_2026-10-05.md:69]

**2.78** A business setting in Settings decides where new contacts go: (A) add them to a chosen Mix; (B) ask each time, so Add a contact starts with a follow-up ticked and Quick Add offers a Mix; or (C) leave them out, so they show as No Mix. The default is C. The setting applies to Add a contact, Quick Add, phone contacts and lead connections, and each lead connection can choose its own Mix. Import asks in its review step, with the default preselected, so nothing starts from an import without a confirmation. When a stage's own Mix starts, the default Mix is not added on top. Do not contact and plan limits apply as usual (§2.75). A Mix's "Everyone" audience includes people added later. [OWNER 2026-10-05 D34] [PROPOSED]

### Mixes, Mega-Mixes and the Marketplace

**2.35** Mixes MUST have three tabs: the owner's Mixes, Mega-Mixes and the Marketplace (labels: JITM-05 §2). [OWNER 2026-09-24 docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:3,53] [SHIPPED 9439fd6 src/components/MixLibraryNav.tsx:12]

**2.36** Authoring runs: create (`/mixes/new?custom=1`; `/mixes/new` alone opens the ready-made library), name, "When should it start?" (When I add a date, When I start it for someone, On one fixed date, After another Mix finishes), Beats with timing, text, email and call versions, explicit save, activation. A failed save MUST keep what was typed. [SOURCE docs/MIX_LIBRARY_AND_PATH_CONTROLS_2026-09-21.md:13] [SHIPPED 9439fd6 src/components/MixEditor.tsx:193] [SOURCE docs/UX_GAP_FIXES_PRODUCTION_RELEASE_2026-09-23.md:6]

**2.37** Ordinary Beats are timed from the Mix start, not from the previous Beat's completion. A Beat that a connection targets waits for that connection instead, and a Beat that connections reference MUST NOT be removed until they are resolved. [SOURCE docs/MIX_HANDOFF_AND_JOURNEY_PROPOSAL_2026-09-21.md:23] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:12]

**2.38** Every Beat MUST offer Text, Email and Call versions. Wording the owner writes wins; a blank version is generated from the Beat's own wording, keeping merge fields. Call versions are talking points, and private-note fields appear only there. [OWNER 2026-09-23 docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:3] [SOURCE docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:7,10-11]

**2.39** Activation MUST follow Personal preferences → Starting mixes: review who gets it before activating (the default), or activate on save with Review first still offered. It covers the editor, ready-made setup and starting from the library; the server enforces it, and changing it never activates drafts. [OWNER 2026-09-20 docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md:3] [SOURCE docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md:15-20] [SHIPPED 9439fd6 prisma/personal-preferences.prisma:12]

**2.40** A Mix MUST attach to a visit only when the owner chooses it on that visit in Calendar; the latest or next visit is never inferred. Visit-timed Beats count calendar days from the visit (the default) or elapsed time from its start, end or completion. Moving the visit moves its follow-ups in place, and Beats after the visit wait for its recorded outcome. [SOURCE docs/FOLLOW_UP_PREPARATION_STORAGE_CONTRACT.md:171,175,177] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:18]

**2.41** The Start flow (Start for someone in Journey, also opened by a Mix page's Start or a Mega-Mix's Start link) MUST preview the real dates before Start, then open the new work. Ownership, eligibility, stops and Do not contact are checked in the same transaction, and restrictions are never cleared silently. [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:13,17] [SOURCE docs/JOURNEY_CLARITY_AND_ANALYTICS_2026-09-21.md:14] [SOURCE docs/MEGA_MIXES_2026-09-22.md:27] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:44]

**2.42** A Mega-Mix is a named group of the account's Mixes; the account keeps one Journey graph, and a Mix belongs to at most one Mega-Mix. The Mega-Mixes tab creates, renames, describes, fills, duplicates and removes them; a Mix chosen from another Mega-Mix moves with a notice. Removing one MUST keep its Mixes, people, follow-ups and connections, and is refused while its share is hidden or reported. [OWNER 2026-09-24 docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:3] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:41,45] [SOURCE docs/FULL_AUDIT_2026-09-24.md:142]

**2.43** The five ready-made Mega-Mixes (Contractor, Real estate, Consultant, Photographer, Recruiter) are editable starting configurations at `/templates/journeys`. The owner previews their actual Beats, timing, decisions, delays and return limits. Adding one MUST create a named Mega-Mix in one transaction (a taken name becomes "Contractor 2") and start no one. The Real estate Mega-Mix is curated for the work: buyers and sellers start on separate paths that meet at the contract, and each stage starts only when its milestone is recorded, so no message comes before the event it follows. [OWNER 2026-09-29 docs/REALTOR_JOURNEY_IMPLEMENTATION_2026-09-29.md:12] [OWNER 2026-09-22 docs/MEGA_MIXES_2026-09-22.md:3] [SOURCE docs/MEGA_MIXES_2026-09-22.md:7-15,19] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:44]

**2.44** Previewing or favoriting a ready-made Mix MUST NOT copy or activate it; Use this mix opens guided setup. Setup uses the previewed version, changed content forces a fresh preview, and a retry returns the same copy. [SOURCE docs/READY_MADE_MIX_PANES_2026-09-21.md:7] [SOURCE docs/LIBRARY_ADMINISTRATION.md:27]

**2.45** Mix and Mega-Mix files MUST carry names, wording, versions, timing, paths, waits and finishes, never people, account ids or history, and the page counts what was left out. An import is checked on the server, previewed and confirmed, and adds independent Mixes that start no one. [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:47-49]

**2.46** The Marketplace (`/marketplace`) MUST have three sections: Jump in the Mix (published ready-made Mixes and the five Mega-Mixes), Community (other accounts' shares) and My shares. Official items set up through the ready-made flows. [OWNER 2026-09-24 docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:3] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:53-57]

**2.47** A listing MUST show the author's latest saved version. Copies never change by themselves: the copy's page says when the original changed, and taking the new version is the copier's choice. Adding a share first checks that it has not changed since the viewer reviewed it. [OWNER 2026-09-24 docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:14] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:72]

**2.48** Every Mix and Mega-Mix page has Share. On first share the author picks a public name (the business name by default); email addresses and phone numbers MUST be refused as names and never shown. A privacy check of every Beat and version runs before the author confirms. Stop sharing is immediate, copies stay with their owners, and archiving a Mix stops its share. [OWNER 2026-09-24 docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:15] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:68-70] [SHIPPED 9439fd6 src/lib/mix-lifecycle-actions.ts:104]

**2.49** Reports: one per person per share, at most ten an hour, never on one's own share, and "Something else" needs details. The author sees the reason and details, never the reporter. Staff review every report, can restore a share or keep it hidden with a note, and the author is always told. Only a private-information report hides the share at once, and only when the reporter's account has a verified email and has triggered fewer than two automatic hides in the last rolling 24 hours. "Verified" means the reporter's email address is verified; it says nothing about whether the report is true, and policy, help and staff wording MUST say so. Every other report keeps the share visible and SHOULD reach a moderator promptly. [OWNER 2026-09-28 D15] [SHIPPED 61d4df4 src/lib/marketplace.ts:6-31] [OWNER 2026-09-24 docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:16] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:75-80]

**2.70** Staff publishing and moderation authority (`mixes.publish`) is held by Kevin at first, with a named backup moderator added when one is needed. It is separate from member sharing: invited members keep sharing their own Mixes without it. [OWNER 2026-09-28 D15]

**2.74** The Marketplace's Jump in the Mix section is the one place to discover ready-made Mixes and Mega-Mixes, beside Community and My shares. The separate Ready-made mixes browsing entry is retired: its filters, previews, favorites and guided setup carry over, the old browsing route redirects to the section, and existing setup links keep working. Until that change ships, the library keeps its entries (§6). [OWNER 2026-09-28 D29]

**2.75** Plan limits in the workflows, only while billing is on (JITM-01 §2.9): when an automatic addition (a saved date, a tag, an import, a Contact stage, a Mix's audience) would pass the people limit, the person is skipped in that Mix, not held until there is room, and Today tells the owner how many people were skipped in the last week, with a link to Plan and billing. The contact profile marks the Mix "Not started: plan limit" with Resume, which works once there is room. A start the owner makes directly is refused with the reason, before anything is saved. Turning on a Mix beyond the active-Mix limit is refused the same way. The onboarding first follow-up Mix doesn't count toward active Mixes. [OWNER 2026-09-30 docs/PLAN_LIMITS_IMPLEMENTATION_2026-10-01.md:8] [OWNER 2026-09-30 docs/PLAN_LIMITS_IMPLEMENTATION_2026-10-01.md:9] [PROPOSED]

### Journey

**2.50** Journey (`/journey`) MUST be a dynamic graph of the account's actual Mixes and Beats, their saved connections and people's progress. It shows missing Beats, dead ends and strong or weak connections from recorded data, and never invents nodes, routes, outcomes or traffic. [OWNER 2026-09-21 docs/MIX_HANDOFF_AND_JOURNEY_PROPOSAL_2026-09-21.md:7] [OWNER 2026-09-28 D4] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:9,28]

**2.51** Stages (Lead, Prospect, Client, Retention, or the owner's own) are optional contact labels, managed in Contact stages and used as secondary filters. They MUST NOT create, order or organize the graph. The graph may set and create them: a Mix can name the stage its people are in, and adding a Mega-Mix can add its stage labels, which the owner renames, reorders or retires like any other (§2.79). The export's stage-circle Journey is history. [OWNER 2026-09-21 docs/design/DESIGN_GUIDELINES.md:5] [OWNER 2026-09-28 D4] [OWNER 2026-09-28 D16] [OWNER 2026-10-05 D35] [SOURCE docs/JOURNEY_CLARITY_AND_ANALYTICS_2026-09-21.md:7] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:215]

**2.79** A Mix can name a stage. The stage is set when a person starts that Mix, and setting it changes only the label: it never starts or stops another Mix, and the stage's own Mix does not run. When two Mixes set different stages, the latest start wins. A person whose stage changes are paused keeps their stage. Adding a Mega-Mix offers its stage labels, on by default, and links its Mixes to them. A label with the same name is reused, and nothing the owner already has is renamed or removed. Adding the labels turns Contact stages on, and adding a Mega-Mix still starts no one (§2.43). [OWNER 2026-10-05 D35] [PROPOSED]

**2.80** Turning on Contact stages MUST offer presets. The presets are Sales (Lead, Prospect, Client, Retention), Business relationship (Prospect, Awareness, Interest, Qualification, Conversion, Maintain) and Blank. Each preset brings rules written for its own stages, so renaming never leaves a rule pointing at the wrong meaning. The owner can also add milestones in their own words, such as "Qualified" or "Signed". Each one shows on the contact as a button, can drive a stage rule, and can be sent by a lead connection. The built-in events keep neutral wording: an inquiry arrives, a conversation starts, a meeting is scheduled, happens or is missed, the stage's Mix finishes, and time passes. "Sale confirmed" and "Work completed" are renamable milestones of the Sales preset. Stage and milestone wording MUST NOT assume a sale (JITM-02 §2.20). [OWNER 2026-10-05 D36] [PROPOSED]

**2.52** Journey MUST show one graph in three views: Setup (what can happen and what is missing), Progress (who is where and why) and Results (Last 7, 30 or 90 days). It opens on Progress when the account has people and on Setup otherwise. A structured list is always available (JITM-10 §2). [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:9] [SOURCE docs/JOURNEY_CLARITY_AND_ANALYTICS_2026-09-21.md:11,15] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:28,218]

**2.53** The Mega-Mix switcher MUST show All Mixes, one Mega-Mix, or the Mixes in none, one pipeline at a time, and keep the choice in the address (`?megaMix=`). [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:46] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:212]

**2.54** Numbering MUST follow these rules (labels and terms: JITM-05 §2):
- each starting point, a Mix no forward path enters, opens a lettered journey, lettered by when its starting Mix was created;
- its Mixes are A1, A2, … in the order its paths reach them, following paths from earlier Beats before paths after the whole Mix;
- each Mix's Beats are A1.a, A1.b, … (after z comes aa);
- a Mix reached from two journeys keeps the number of the journey created first;
- bounded return paths never renumber, and archived and one-time Mixes stay unnumbered;
- numbers are computed from the account's complete graph and never stored, so editing a path renumbers what follows;
- every view of the account (All Mixes, a Mega-Mix, the People roster) filters those account-wide numbers and MUST NOT renumber, so a Mix keeps its label when the view changes;
- file and Marketplace outlines, which carry no account graph, number Mixes in saved order.

Shipped Journey still numbers per Mega-Mix view (§6). [OWNER 2026-09-28 D21] [OWNER 2026-09-28 O5] [SHIPPED 9439fd6 src/lib/journey-numbering.ts:10-23] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:94] [SHIPPED 9439fd6 src/lib/journey-numbering.ts:65-69]

**2.55** A connection is a saved rule from a Beat, or from a whole Mix finishing, to a whole Mix or one Beat. Route kinds: immediate completion, a named recorded outcome, a wait with no recorded outcome, delayed continuation, one matching choice, several matching destinations, an intentional end, and a bounded return, which MUST have a repeat limit. A join belongs to one fork and waits for all or the first of its destinations. A hand-off MUST carry the same person and piece of work into the next Mix, with no audience choice, tag or per-person Start; Start for someone begins another piece deliberately, and replays never duplicate it. [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:10-14] [SOURCE docs/JOURNEY_SAVE_RECOVERY_2026-09-21.md:17]

**2.56** To draw a connection in the editable Setup view at 70% zoom or more, drag an output (+) to an input (→), click or tap two points, or use Tab with Enter or Space. The shared editor MUST open with the connection off, and it runs only after the owner turns it on and saves. Progress, Results, read-only and historical views offer no connection points. [SOURCE docs/JOURNEY_CONNECTION_HANDLES_2026-09-21.md:7-11] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:51]

**2.57** Removing a path MUST need a confirmation that names the path and its effect: select its line, then Delete above the canvas. Partial changes apply to new work, deleting a whole connection stops future hand-offs, and deleting a line never silently restores a waiting Beat's own schedule. A conflicting save keeps the draft (JITM-08 §2). [OWNER 2026-09-21 docs/MIX_LIBRARY_AND_PATH_CONTROLS_2026-09-21.md:5] [SOURCE docs/MIX_LIBRARY_AND_PATH_CONTROLS_2026-09-21.md:9,11] [SOURCE docs/JOURNEY_SAVE_RECOVERY_2026-09-21.md:11-13]

**2.58** Counts MUST cover the whole account: each person counts once per status and point, "Here" is unfinished work at that point, totals include past participation, archived contacts are excluded, people with no work count as Not started, and Completed is not a sale. Targets are chosen by the owner per connection, with no default. With no target, Journey shows factual counts and rates and no strong or weak judgment; with a target, it shows an insufficient-data state until there are enough observations for a useful comparison. [OWNER 2026-09-28 D26] [SOURCE docs/JOURNEY_CLARITY_AND_ANALYTICS_2026-09-21.md:12,15,21] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:26]

**2.59** Panning uses the empty background, Space with a drag, or the middle button; touch keeps native scrolling, and a drag never counts as a click. Refreshes every 15 seconds and on focus MUST be silent and pause while editing. Selecting a Mix keeps scroll and zoom and separates its incoming and outgoing paths with a legend and written lists. [OWNER 2026-09-28 D4] [SHIPPED 9439fd6 src/components/useCanvasPan.ts:8-13] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:116] [SOURCE docs/ONBOARDING_JOURNEY_PREFERENCES_2026-09-22.md:11]

**2.60** The People roster MUST show each person with their numbered Mix ("A1 · Welcome") and offer search, status and stage filters and ten per page; counts open the matching people. Selecting a person highlights their work and offers pause, resume, stop, record outcomes, link appointments and previous visits. Panes: JITM-07 §2. [SHIPPED 9439fd6 src/components/WorkflowPeople.tsx:29-32] [SOURCE docs/JOURNEY_CLARITY_AND_ANALYTICS_2026-09-21.md:11,14] [SOURCE docs/JOURNEY_THREE_PANES_2026-09-21.md:5]

**2.71** Workflow status governs the work and stage describes the relationship: "Waiting" belongs to a running Mix, "Client" to the contact. They MUST carry separate labels. A person can have several running Mixes, so no single global status may stand for all of their work. [OWNER 2026-09-28 D26] [OWNER 2026-09-28 D16]

**2.72** Pausing never loses work, and resuming MUST review it explicitly. On resume, and when a restriction is lifted, overdue follow-ups show with their original dates, and the owner reschedules or skips each one. The app MUST NOT send a backlog automatically, silently discard missed items, or bring back completed or skipped work (JITM-00 §2.6). [OWNER 2026-09-28 D26]

**2.73** An older Mix with no saved connections offers only an explicit stop for an early update, for now. The stop MUST say plainly that it ends the remaining sequence, keep existing history, and leave the owner able to record what happened and schedule a separate follow-up with the existing tools. Richer outcome routing needs an explicit upgrade of the Mix, never inferred connections. [OWNER 2026-09-28 D26] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:27]

**2.61** Quiet-day check-ins ("Just saying hello") are opt-in in Personal preferences, every 1–365 days (60 to start; an implementation default). A completed follow-up, a logged conversation, a completed meeting or an explicit Skip or Completed resets the clock. Suggestions MUST NOT create a follow-up, message or stage move; Today shows up to three and Journey opens the full list. [OWNER 2026-09-20 docs/design/QUIET_DAY_TOUCHPOINTS_2026-09-20.md:3] [SOURCE docs/design/QUIET_DAY_TOUCHPOINTS_2026-09-20.md:7-21]

### Calendar, support, account and staff

**2.62** Calendar (`/calendar`) holds meetings and time blocks with overlap checks; an intended overlap needs a checkbox, and saving MUST NOT send an invitation. Other calendars connect only by iCalendar import, subscription and export. A missing-visit repair keeps the person and work through Calendar and back. [SOURCE docs/CUSTOMER_JOURNEY_AND_CONNECTIONS.md:21,27-30] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:13]

**2.63** Help (`/help`) holds plain-language answers and, on hosted accounts, private support conversations (`/account/tickets`). New tickets, replies and reopenings MUST alert the support inbox without the message. Help and Today link back to unfinished setup. [SOURCE docs/SUPPORT.md:3] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:27] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:22]

**2.64** Staff MUST see a workspace only in a view-only session opened from an assigned support case. The app shows a banner, blocks every change, hides Quick Add and invitation prompts, and offers End view-only session. [SOURCE docs/SUPPORT_CASE_ACCESS.md:3-13] [SHIPPED 9439fd6 src/components/AppShell.tsx:84-92] [SHIPPED 9439fd6 src/app/(app)/layout.tsx:13]

**2.65** My account (`/account`) MUST hold profile, password, sessions, export (spreadsheet or complete JSON) and permanent deletion after reauthentication, which ends at `/account/deleted`, and it links to Plan and billing (`/account/billing`). While billing is off, Plan and billing explains the free beta and offers nothing to buy; while it is on, the owner buys a plan on Stripe's checkout and manages it in Stripe's billing portal (JITM-01 §2.9, JITM-11 §2.53–§2.55). Personal preferences (`/account/preferences`) holds the browser-level appearance control (JITM-06 §2.26), profile, Starting mixes, Quiet-day check-ins, Journey preferences and scheduling defaults. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:111] [SHIPPED 9439fd6 src/app/(app)/account/preferences/page.tsx:53-63] [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:12]

**2.66** The staff console (`/admin/…`) MUST require staff membership and administrator MFA. Its workflows follow the runbooks in §3, not this standard. [SOURCE docs/WAITLIST_OPERATIONS.md:71] [SHIPPED 9439fd6 src/app/(staff)/layout.tsx:12]

### Homepage and profession pages

**2.67** Demo contract: each situation shows one explicitly fictional contact, with a reserved phone number and an `example.invalid` email, and exactly three Beats: a text today (day 0), an email tomorrow (day 1) and a call in one week (day 7). Drafts are editable and previews are marked. In a preview, ordinary user-activated `sms:`, `mailto:` and `tel:` links (the number only for a call) hand the edited, demo-marked text to the visitor's own app, with copy and manual-select fallbacks that keep the marker. A click only means a handoff was requested: the page MUST NOT treat focus, visibility or a click as proof that anything opened, sent or was delivered, and MUST NOT mark a Beat done from it. Where an app or body is unavailable, the copy says so honestly. Outcomes are simulated with Mark sent or called, Not yet and Undo, which change only the demo record. Drafts, subjects, Beats and progress are kept per situation in memory in the mounted tab only (a refresh clears them; Reset clears only the selected situation). The demo MUST NOT use cookies, storage, URL drafts, send automatically, place a call, schedule or write to an account, and only an allowlisted situation id may reach the waitlist. The only destinations are the fictional number and the per-situation `example.invalid` email. An owned auto-reply demo is a deferred future option (OWNER 2026-10-03). The homepage uses generic situations, a profession page preselects its own, and profession is never inferred from behavior or device. [OWNER 2026-09-19 docs/design/DEMO_WORKSPACE_2026-09-19.md:3] [SOURCE docs/design/DEMO_WORKSPACE_2026-09-19.md:8-9] [SHIPPED 9439fd6 src/lib/demo-workspace.ts:4-13,61] [SHIPPED 9439fd6 src/components/ProductDemo.tsx:12,56,79,88] [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:85] [OWNER 2026-10-03 D31 docs/standards-audit-2026-09-28/OWNER_DECISIONS.md]

**2.68** The homepage and the five profession pages share one composition (`PublicLanding`; order and hero layout: JITM-07 §2). The pages are `/for/real-estate-agents`, `/for/consultants`, `/for/photographers`, `/for/contractors` and `/for/independent-recruiters`; other slugs MUST return 404. Each has its own title, description, headline, supporting line, demo call to action and honest boundary, and links only to template pages that exist. The "Mixes for:" row appears on every public page and marks the current one. Adding or removing a page needs Kevin (JITM-02 §2). [OWNER 2026-09-28 D2] [SHIPPED 9439fd6 src/components/PublicLanding.tsx:14-15] [SHIPPED 9439fd6 src/app/for/[profession]/page.tsx:19] [SHIPPED 9439fd6 src/lib/persona-mixes.ts:18-26] [SHIPPED 9439fd6 src/components/MixesFor.tsx:4-9]

## 3. Canonical implementations

- Shell and navigation: `src/app/(app)/layout.tsx`, `src/components/AppShell.tsx`, `src/components/Nav.tsx`, `src/app/(app)/more/page.tsx`, `src/app/(app)/settings/page.tsx`.
- Today: `src/app/(app)/jumps/page.tsx`, `src/components/JumpWorkflow.tsx`, `src/components/WorkflowAttention.tsx`, `src/components/WorkflowBusinessUpdate.tsx`, `src/app/api/jumps/[jumpId]/outcome/route.ts`, `src/lib/one-time-follow-up.ts`.
- Quick Add and Contacts: `src/components/QuickAdd.tsx`, `src/lib/quick-capture.ts`, `src/components/ContactForm.tsx`, `src/components/ContactProfile.tsx`.
- Mixes: `src/components/MixEditor.tsx`, `src/components/MixWorkspace.tsx`, `src/components/MixLibraryNav.tsx`, `src/lib/variant-generation.ts`.
- Mega-Mixes and Marketplace: `src/lib/mega-mixes.ts`, `src/components/MegaMixLibrary.tsx`, `src/components/MegaMixSetup.tsx`, `src/lib/mix-portable.ts`, `src/lib/marketplace.ts`, `src/lib/marketplace-service.ts`.
- Journey: `src/components/WorkflowJourney.tsx`, `src/components/WorkflowPeople.tsx`, `src/components/useCanvasPan.ts`, `src/lib/journey-numbering.ts`, `src/lib/mix-workflow-engine.ts`, `src/lib/quiet-days.ts`.
- Onboarding and invitations: `src/components/OnboardingForm.tsx`, `src/lib/onboarding-options.ts`, `src/lib/journey-preferences.ts`, `src/app/(app)/mixes/system/page.tsx`, `src/components/SystemMixInviteForm.tsx`, `src/lib/referral-access.ts`, `src/lib/invitation-allowance.ts`.
- Public pages: `src/components/PublicLanding.tsx`, `src/components/ProductDemo.tsx`, `src/lib/demo-workspace.ts`, `src/lib/marketing-scenarios.ts`, `src/lib/persona-mixes.ts`, `src/components/MixesFor.tsx`.
- Staff runbooks: `docs/WAITLIST_OPERATIONS.md`, `docs/ADMISSION_CONTROLS.md`, `docs/SYSTEM_MIX_ADMINISTRATION.md`, `docs/LIBRARY_ADMINISTRATION.md`, `docs/SUPPORT_CASE_ACCESS.md`, `docs/USER_ADMINISTRATION.md`, `docs/ADMIN_REPORTS.md`, `docs/EMAIL_OPERATIONS.md`, `docs/STAFF_ACCESS.md`. Where they describe member invitations, JITM-09 §2.17 and §2.18 win.

## 4. Do / Don't

- **Do** send invitations through Today: "Add to Today", then Review and send from the owner's own app.
- **Don't** add an app email for member invitations, or count them against outstanding capacity.
- **Do** build Journey from the account's saved Mixes, Beats and connections.
- **Don't** lay Journey out as Lead, Prospect, Client and Retention columns, or describe it that way in More or Settings.
- **Do** create one follow-up at the chosen time for "Schedule the next follow-up".
- **Don't** restart a Mix or recreate a skipped Beat after a settings change.
- **Do** install a Mega-Mix, save a connection or import a file with nobody enrolled, then Start people explicitly.
- **Don't** let the public demo open anything except from a visitor's own click on a `sms:`, `mailto:` or `tel:` link, claim that it opened or sent, or carry drafts to the waitlist.

## 5. Verification

- Run the suites for the changed workflow, with the commands and origin/main baseline of JITM-12 §2:
  - Today: `e2e/today-navigation.spec.ts`, `e2e/core-flows.spec.ts`, `e2e/channel-variants.spec.ts`, `tests/beta-follow-up-loop.test.ts`;
  - access: `e2e/onboarding-invitations.spec.ts`, `e2e/onboarding-journey-preferences.spec.ts`, `e2e/invitation-prompts.spec.ts`, `e2e/waitlist.spec.ts`;
  - Mixes and Journey: `e2e/mega-mixes.spec.ts`, `e2e/marketplace.spec.ts`, `e2e/journey-connections.spec.ts`, `e2e/quiet-days.spec.ts`, `tests/journey-numbering.test.ts`;
  - public: `e2e/product-demo.spec.ts`, `e2e/profession-pages.spec.ts`.
- Click through at phone and desktop widths: navigation matches JITM-09 §2.3 and §2.6; Quick Add saves together; Not sent leaves a follow-up open and Sent shows Undo; a next follow-up adds exactly one; an invitation emails nothing; editing a Journey path renumbers A1 / A1.a as JITM-09 §2.54 says.
- `docs/JOURNEY_EXPERIENCE_ACCEPTANCE_2026-09-21.csv` lists Journey scenarios; its planned rows are not passing tests.

## 6. Open decisions and known deviations

Questions for Kevin:
- Who is the named backup moderator, once one is needed (§2.70)?
- Should the other business types get their own journey starts, as Real estate has (§2.20)? They still start on "Follow up about an estimate", which also reaches Insurance & finance owners, and with no business name that text says "my business" (the rest of ONB-10, `docs/REALTOR_JOURNEY_IMPLEMENTATION_2026-09-29.md`).

Decided on 2026-10-05 and 2026-10-06 (D33–D37, D44–D47):
- §2.76 and §2.77 are built on `feat/no-mix-status-20261005` (PR #125) and not yet released (`docs/NO_MIX_STATUS_2026-10-05.md`), except the end-of-Mix question in §2.77.
- Not yet built: the end-of-Mix question in §2.77, §2.51 and §2.78–§2.80.
- Kevin confirmed P1–P4, part of P5, P6 and P7's timing (D33). The rest of P5 and P8–P11 still wait for him; the questions, current behavior and build slices are in `docs/MIX_PLACEMENT_AND_STAGES_2026-10-05.md`.
- Open for Kevin: whether a person whose Beats wait for a visit, or for the visit's outcome, should count as being in a Mix (§2.76). Today they read No Mix once their Beats are prepared (`docs/NO_MIX_STATUS_2026-10-05.md`).
- Open for Kevin: the eight agent defaults behind §2.76–§2.77, each with its question, in `docs/NO_MIX_STATUS_2026-10-05.md` ("Agent defaults for Kevin"), and the deferred review findings there: PAUSE-01 (b), COPY-02 (b) and UNDO-05 (c)–(e).

Decided on 2026-09-28 (D15, D16, D21, D26, D29) but not yet built or verified; each is a backlog task in `docs/STANDARDS_AUDIT_2026-09-28.md` §8:
- Report, help and staff wording does not yet say that "verified" means the reporter's email (§2.49; B-09).
- Journey numbers only the Mixes in the current Mega-Mix view (`src/components/WorkflowJourney.tsx:94`; `src/lib/journey-numbering.ts:68`), against §2.54 (B-13).
- Invitation email after an explicit Send invitation is not built (§2.18; B-16). The owner expected inbox delivery on 2026-09-27 (`docs/INVITE_PAGE_RELEASE_2026-09-27.md:73`).
- The status and stage labels (§2.71), resume review (§2.72), target states (§2.58) and the stop-only early update (§2.73) have not been checked against shipped behavior (B-15).
- The Ready-made mixes library keeps its own entries in More and Mix tools (`src/app/(app)/more/page.tsx:28`), against §2.74 (B-19).
- Journey people-row details sit only in a hover tooltip (`src/components/WorkflowPeople.tsx:32`), against JITM-10 §2.17 (B-05).

Known deviations:
- Three links still say "customer journey" for Contact stages or the Journey map, against §2.7 and D4 (JITM-05 §6 lists them).
- INFERRED: `/marketplace` marks no primary destination, and desktop Journey and Calendar pages mark More as well (`src/components/Nav.tsx:40`).
- INFERRED: during a support view the phone tab bar still shows Quick Add, but no dialog is mounted (`src/components/Nav.tsx:41`; `src/components/AppShell.tsx:96`).
- Operations docs still describe five emailed invitations or count them in capacity (`docs/SYSTEM_MIX_ADMINISTRATION.md:11,25,29`; `docs/WAITLIST_OPERATIONS.md:18-19,52`; `docs/ADMISSION_CONTROLS.md:19,29`).
- Superseded descriptions remain: Quick Add handing off to the contact form (`docs/VOICE_WORKFLOWS.md:7`), authored-only channel versions (`docs/FOLLOW_UP_PREPARATION_STORAGE_CONTRACT.md:193,201`), 30-day-only Results (`docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:26`), "Later this week" on Today (`docs/design/DESIGN_GUIDELINES.md:24`) and real estate as the homepage default (`docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:85`).
- Nothing leads from a finished import to Today (LOOP-06, `docs/BETA_READINESS_AUDIT_2026-09-26.md:198`).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 2.0.0 — 2026-09-28 — Base 61d4df4. Kevin's second packet: reports hide at once only for verified-email private-information reports (§2.49, D15); new §2.70 publishing authority; Contact stages (§2.7, §2.51, D16); invitation email after Send invitation (§2.18, D26); onboarding recommends one person and one follow-up (§2.20, D26); account-wide numbering (§2.54, D21); owner-chosen targets (§2.58, D26); new §2.71–§2.73 status, resume and early-update rules (D26); new §2.74 one Marketplace destination (D29).
- 2.0.1 — 2026-09-29 — Base 722d64b. Onboarding on `main` now recommends one person and one follow-up and offers a complete Mega-Mix afterward (B-17), so §2.20 and §6 no longer list the Mega-Mix-first deviation. Production follows at the release that includes it.
- 2.0.2 — 2026-09-29 — Base 9f967bc. §2.20 records Kevin's confirmation of where the optional Mega-Mix step appears and which Mega-Mix it names (O9). §6 drops the More and Settings Customer journey labels and the old demo text, which the copy batch fixed (PR #96, O8), and adds the three "customer journey" links that remain.
- 2.1.0 — 2026-09-29 — Base dc81d10. §2.20: a business type with its own curated journey starts onboarding from it; Real estate starts from the Real estate Mega-Mix. §2.43: the Real estate Mega-Mix has separate buyer and seller paths (Kevin, 2026-09-29). §6 asks about the other business types.
- 2.2.0 — 2026-09-30 — Base 94b9539. §2.65: My account links to Plan and billing (`/account/billing`), shipped in PR #104 (O10).
- 2.3.0 — 2026-10-01 — Base f1ac84d. New §2.75: plan limits skip automatic additions and refuse direct starts, with a Today notice (O14, docs/PLAN_LIMITS_IMPLEMENTATION_2026-10-01.md).
- 3.0.0 — 2026-10-03 — Base fdb95b6. §2.67 and §4: the public demo hands drafts to the visitor's own text, email and phone apps through ordinary links, a deliberate reversal of the earlier no-handoff rule (D31). Frontmatter version is 3.0.0.
- 3.1.0 — 2026-10-05 — Base 9b3f949. §2.33: people can also arrive as contact cards shared from a phone. It adds the Android picker on Add a contact, the iPhone shortcut with its personal key, and the saved-card import guide on `/contacts/from-phone` (D32, docs/PHONE_CONTACTS_2026-10-05.md).
- 4.0.0 — 2026-10-05 — Base e8692f2. Kevin's answers on Mix placement and stages (D33–D36, docs/MIX_PLACEMENT_AND_STAGES_2026-10-05.md). §2.51 now lets a Mix set a stage and a Mega-Mix create stage labels (D35, part of D16 replaced). New §2.76–§2.77: every contact shows No Mix or No Mix needed, with a filter, bulk actions, a Today line and an end-of-Mix question (D33). New §2.78: a setting decides where new contacts go, default C (D34). New §2.79: how a Mix sets a stage and a Mega-Mix adds labels (D35). New §2.80: stage presets and milestones in the owner's words (D36). §6 points to the proposed defaults (P1–P10) and the unbuilt work.
- 4.0.1 — 2026-10-05 — Base e8692f2. §2.76–§2.77 drop [PROPOSED]: Kevin confirmed their defaults (D33 confirmation). §2.78–§2.80 keep [PROPOSED] where their details are unconfirmed.
- 4.1.0 — 2026-10-05 — Base 8bee3b1. §2.24: Today's order includes the No Mix line after Quiet-day check-ins (§2.77). The No Mix status, filter, bulk actions, Today line and Journey People status are built (docs/NO_MIX_STATUS_2026-10-05.md); the end-of-Mix question in §2.77 is not, and comes with the next build slice.
- 5.0.0 — 2026-10-06 — Base a05b189. Kevin's answers to the WF-05 review of PR #125 (D44–D47). §2.76: a paused Mix counts as being in a Mix for all of its people, Journey work counts while running or paused, and No Mix needed also clears when a paused Mix resumes for the person (D45). §2.77: the filter's counts and the "{n} with No Mix" link follow the current search and filters, and list actions return without earlier notices (D47); bulk Add to the Mix acts at once with Undo and says that people who finished the Mix start it again (D46); Today's line says that no Mix will remind the owner (D44). §2.24 tags the unreleased No Mix line. §6: what is built, what is not, and the open question about Beats that wait for a visit.
- 6.0.0 — 2026-10-06 — Base 1e69668. The WF-05 re-review of PR #125. §2.76: Journey work counts only through its follow-ups and real waiting state, never a record's status (JRN-01), and a paused Mix also counts people it has prepared nothing for yet (PAUSE-01). §2.77: bulk Add leaves people the Mix already has work for as they are (BLK-02) and words its sheet by the Mix's start type (COPY-02); Undo takes back only what each start did and puts back what it replaced (UNDO-01, UNDO-02); the readings beyond D46–D47 are cited as agent defaults until Kevin confirms them (JITM-15 §2.12). After the third review (base 378d4fd): a wait that cannot move does not count (JRN-02); stopped and Do not contact people are refused, not counted as already in (BLK-03); Undo, like Remove from Mix, ends the run's Journey record (UNDO-04, default 8); and §2.77 says a shared follow-up is brought back by the next pass. §6 points to them.
