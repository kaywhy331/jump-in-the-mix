# Copy findings — UX, design and layout audit 2026-10-08

Every copy finding from the eight lanes: the exact current string, where it is, what is wrong (rule) and a proposed replacement in the JITM-04 voice. Proposed wording is a draft: public and consequential copy goes through WF-03 and Kevin's approval (JITM-04 §2.24–§2.31). Strings were quoted from the audited build `f23db11`.

## TDY — Today, review, Quick Add

| Current string (exact) | Where | What's wrong | Proposed |
|---|---|---|---|
| "sms", "email", "call", "voicemail", "whatsapp" (How options) | `src/app/(app)/jumps/page.tsx:111-115,479` | Raw codes (JITM-05 §2.11). Product words are Text, Email and Call (JITM-04 §2.3). | "Any method", "Text", "Email", "Call" |
| "Because you chose {x} instead of the plan’s sms, this one waits for you and won’t send automatically." | `src/app/(app)/jumps/page.tsx:341` | Raw code inside a sentence. | "Because you chose email instead of the Mix’s text, this one waits for you and won’t send automatically." |
| "Overdue commitments" | `src/app/(app)/jumps/page.tsx:476` | Vague; repeats "Review overdue". | "Overdue only" |
| "Focused work" · "Compact scan" · "Review overdue" | `src/app/(app)/jumps/page.tsx:482` | Unlabeled. "Compact scan" changes nothing on phones (TDY-06). | Remove these, or one labelled switch: "Layout: Standard / Compact" |
| "Uses your default follow-up time in America/New_York." | `src/app/(app)/jumps/page.tsx:360` | Raw zone ID; the time itself isn't shown. | "Snoozes to that day at 10:00 AM (New York time)." |
| "Later today" | `src/lib/snooze-schedule.ts:174` | Untrue after about 4 PM (lands tomorrow). | "Later today · 6:15 PM" when it stays today; otherwise leave it out |
| "Follow-up snoozed." | `src/app/(app)/jumps/page.tsx:459` | Names no time (JITM-04 §2.7). | "Snoozed to Fri, Oct 9 at 10:00 AM." |
| "Follow-up completed" / "{name} · you can undo this for a moment" / "Next scheduled: Oct 10, 10:00 AM" | `src/components/JumpWorkflow.tsx:249-252` | Doesn't echo the owner's action; "a moment" is vague; no weekday. | "Marked sent · Sarah Chen" / "Next follow-up: Sat, Oct 10 at 10:00 AM" + "Undo". Calls: "Marked done". |
| "Step 3 · Record what happened. Opening an app does not send it." | `src/components/JumpWorkflow.tsx:482` | Mentions a step 3; steps 1 and 2 appear nowhere. | "Opening your app doesn’t send it. Record what happened." |
| "To +1 555 010 1002. Open your app to send, then record what happened." (calls; and with no method: "Open your app to send, then record what happened.") | `src/components/EditableFollowUpAction.tsx:443` | "Send" is wrong for a call. With no method there is no app to open. | Calls: "Calls +1 555 010 1002. Record how it went." No method: "Add a way to reach Hana to send this." |
| "Copy" (call review) | `src/components/EditableFollowUpAction.tsx:461` | It copies the call notes, which the label doesn't say. | "Copy notes" (calls); "Copy text" (messages, as in the export) |
| "Add an email address" link + "Add phone" button | `src/components/FollowUpChannelChoice.tsx:64`; `src/components/EditableFollowUpAction.tsx:458` | Two different fixes for one gap (JITM-04 §2.14). | One: "Add a phone number or email" |
| aria-label "Pending Beats in this Mix occurrence" | `src/app/(app)/jumps/page.tsx:405` | "occurrence" is an internal word (JITM-05 §2.11). | "Follow-up dates in this Mix" |
| "This follow-up is no longer pending: {completionMethod}" (e.g. "mix stopped for contact", "reconciled") | `src/app/(app)/jumps/page.tsx:513` | Internal codes (JITM-05 §2.11). | "This follow-up was cancelled when you stopped the Mix." / "This follow-up isn’t open anymore." + "See {name}" |
| "Your recorded updates are being prepared. This list will refresh." (under "Needs your input 0") | `src/components/WorkflowAttention.tsx:7-10` | Vague, and shown under a heading that says 0. | "Updating your list after your last change…" with no heading |
| "You have 3 invitations to share." (Today) vs "3 invitations left" / "Share free access with people you know" (rail) | `src/app/(app)/jumps/page.tsx:495`; `src/components/AppShell.tsx:50` | The same fact worded two ways. | "3 invitations left · Invite people" everywhere |
| "Your invitation is ready to send. It hasn’t been sent yet." + card "Not sent yet. Open each one and send it from your own email or text app." | `src/app/(app)/jumps/page.tsx:453,489` | Says the same thing twice on one screen. | Keep only the card line: "Not sent yet. Send it from your own email or text app." |
| " Tap Review to begin." | `src/app/(app)/jumps/page.tsx:435,438` | Phone-only verb; on desktop the review is already open. | " Review it to begin." |
| "Stop New project inquiry for Ava Alvarez?" (`Stop ${mix.name} for ${name}?`) | `src/app/(app)/jumps/page.tsx:418` | The Mix name reads as part of the sentence. | "Stop the “New project inquiry” Mix for Ava Alvarez?" |
| "Skip Beat" (invitation; one-time follow-up) | `src/app/(app)/jumps/page.tsx:361,418` | Not a Beat (JITM-05 §2.3–§2.4). | "Skip this follow-up" |
| "Mark done" (menu, text follow-up) | `src/app/(app)/jumps/page.tsx:415` | The review calls the same action "Mark sent". | "Mark sent" (messages) / "Mark done" (calls) |
| "Follow-up" (review subtitle when there is no stage) | `src/app/(app)/jumps/page.tsx:405` | Filler. | Leave the subtitle out, or show the reason |
| "23 follow-ups need your attention · 1 overdue." | `src/app/(app)/jumps/page.tsx:469` | Wraps as "· 1 / overdue." on phones; no date, where the export has one. | "Thu, Oct 8 · 23 to do · 1 overdue" |
| "Search this follow-up view" (placeholder) + label "Find a person, Mix, or reason" + description "Find a person, Mix, or reason." | `src/app/(app)/jumps/page.tsx:470-471` | Clipped at 390px; says the same thing twice. | Placeholder "Name, Mix or reason"; drop the description |
| "Check each item. Dates and times use America/New_York." | `src/components/QuickAdd.tsx:166` | Raw zone ID. | "Check each item." (add "Times are New York time." only when the device zone differs) |
| "Follow up" + "2026-10-09 14:00 · Edit" | `src/components/QuickAdd.tsx:180`; `src/lib/quick-add-capture.ts:108` | ISO date, 24-hour time, no method; generic reason. | "Call about the fence quote" + "Fri, Oct 9 at 2:00 PM · Edit" |

---

## CON — Contacts

| Current string | Where | Problem (rule) | Proposed |
|---|---|---|---|
| "Journey" (section heading) | `src/components/ContactProfile.tsx:170` | Stage described as Journey (JITM-09 §2.7) | "Stage" |
| "Change journey stage: {stage}" / "Journey stage for {name}" | `src/components/ContactProfile.tsx:213` | Same | "Change stage: {stage}" / "Stage for {name}" |
| "Journey stage updated." | `src/app/(app)/contacts/page.tsx:327` | Same; vague | "{name} moved to {stage}." |
| "Automatic transitions are paused for your business. Review journey settings" | `src/components/ContactJourneyPanel.tsx:15` | Journey for stages; "transitions" | "Automatic stage changes are paused. Contact stages settings" |
| "Pause transitions for this person" / "Pausing transitions keeps this person's current Mixes running. A manual move can stop the previous stage's Mix and start the next stage's Mix." | `src/components/ContactJourneyPanel.tsx:19-20` | Jargon (JITM-04 §2.1) | "Don't change their stage automatically" / "Their Mixes keep running. Moving them yourself can stop the old stage's Mix and start the new one's." |
| "Choose a file, review only the rows that need a decision, then let the background worker finish safely." | `src/app/(app)/contacts/import/page.tsx:53` | Implementation (JITM-04 §2.6) | "Choose a file, check anything that needs a decision, then import. You can leave while it finishes." |
| "Queue {n} valid rows" / "Queueing…" | `src/components/ContactImportWizardV2.tsx:482` | Implementation | "Import {n} people" / "Importing…" |
| "Up to 5,000 rows and 10 MB. You may leave after the import is queued." | `src/components/ContactImportWizardV2.tsx:424` | Implementation | "Up to 5,000 rows and 10 MB. You can leave once the import starts." |
| "Prefer imported" | `src/components/ContactImportWizardV2.tsx:459` | Unclear | "Update from file" |
| "completed" (status chip) | `src/components/ContactImportWizardV2.tsx:488,504` | Raw enum, lowercase (JITM-04 §2.4) | "Done" |
| "View imported Contacts" / "Choose a Contact file" | `src/components/ContactImportWizardV2.tsx:497,417` | Generic "contact" capitalized (JITM-05 §2.13) | "View imported people" / "Choose a contacts file" |
| "Showing Contacts touched by the selected completed import." | `src/app/(app)/contacts/page.tsx:345` | "touched", raw status | "Showing the people from your import of {file}." |
| "Connected Mixes" | `src/components/WorkflowProgress.tsx:39` | Implies Journey connections | "Mixes" |
| "active" / "pending" | `src/components/WorkflowProgress.tsx:19,28` | Raw enums | "Running" / "Coming up" |
| "Progress and previous visits · {n} Beats" / "Saved configuration {n}. Each return keeps its previous visits." | `src/components/WorkflowProgress.tsx:28` | Implementation (revision) (JITM-05 §2.11) | "Beats ({n})" / remove (or "Uses the Mix as saved on {date}.") |
| "Pause this work" / "Stop this work" / "Stop this work?" | `src/components/WorkflowProgress.tsx:29` | Vague next to "Stop…" and Today's "Stop mix" | "Pause Mix" / "Stop Mix…" / "Stop {Mix} for {name}?" |
| "Which work changed?" option "{Mix} · Oct 6, 12:00 AM" | `src/components/WorkflowBusinessUpdate.tsx:57` | Midnight printed for a start date | "Which Mix?" option "{Mix} · started Oct 6" |
| "This saved Mix has no whole-Mix outcome path. Choose a check-back date to end its remaining reminders and review the next step later, or pause this work below." | `src/components/WorkflowBusinessUpdate.tsx:60` | Jargon (JITM-09 §2.73 wants it said plainly) | "This Mix has no outcomes set up. Pick a date to check back: the rest of the Mix stops and you decide then. Or pause the Mix." |
| "Add a note" (summary and label) … "Add update" | `src/components/ContactTimeline.tsx:145-153` | Repeated label; button mismatch | Summary "Add a note"; textarea label hidden; button "Add note" |
| "Message context" (create) / "Notes" (edit) / "Notes to remember" (profile) | `src/components/ContactForm.tsx:200,290`; `src/components/ContactProfile.tsx:258` | Three names for one field | "Notes to remember" everywhere (+ "may appear in messages") |
| "Oct 6, 2026  none" | `src/components/ContactProfile.tsx:269` | Raw enum | "Oct 6, 2026 · Doesn't repeat" |
| "Start a matching Mix — Uses your first active Mix for this kind of date." | `src/components/ContactProfile.tsx:277` | Hides which Mix starts | "Start {Mix name} from this date" |
| "Keep this connection in the mix with a series of thoughtful Beats." | `src/components/ContactProfile.tsx:281` | Wordplay in a control area; personal framing (JITM-04 §2.2) | "Mixes {first name} is in." |
| "Stop {Mix}? Future follow-ups from this Mix will be removed." / "Remove {Mix}? Completed history stays available." | `src/components/ContactProfile.tsx:285` | Effects not named (JITM-08 §2.7) | "Stop {Mix} for {name}? Their follow-ups still to come are removed. You can resume it later." / "Remove {Mix}? Follow-ups still to come are removed; you can start it again later." |
| "3 pending follow-ups will stop. Saved drafts and history remain. Manual contact links remain available; respect this preference." | `src/components/ContactRelationshipStatePanel.tsx:43` | Wordy, lecturing (JITM-04 §2.1) | "Stops their 3 follow-ups. History stays." |
| "Hi {first}, thanks for choosing {company}. How did we do? Your private feedback takes a few seconds: {link} — {signature}" | `src/app/api/contacts/[contactId]/review-request/route.ts:45` | "we" (JITM-04 §2.5); double dash | "Hi {first}, thanks again for choosing {company}. How did the job go? It takes a few seconds: {link} {signature}" |
| "How did we do at {company}?" (email subject) | `src/app/api/contacts/[contactId]/review-request/route.ts:52` | "we" | "How did your job with {company} go?" |
| "Make time for your circle. Add a customer, a friend, or someone you would like to know better." | `src/components/ContactsBulkWorkspace.tsx:244` | Personal framing (JITM-02 §2.12; JITM-04 §2.11) | "Add the people you follow up with: one at a time, from your phone, or import a list." |
| "Mix for {n} people" | `src/components/ContactsBulkWorkspace.tsx:254` | Unclear | "Add {n} people to a Mix" |
| "Message" / "Message {n} people" / "Schedule message" / "Phone call" | `src/components/ContactsBulkWorkspace.tsx:272-283` | Implies sending (JITM-04 §2.8); "Call" is the term | "Follow up" / "One-time follow-up for {n} people" / "Add to Today" / "Call" |
| "Tag added." / "Tag removed." | `src/app/(app)/contacts/page.tsx:334-335` | Doesn't name what happened (JITM-04 §2.7) | "{Tag} added to {n} people." / "{Tag} removed from {n} people." |
| "{Mix} started for {n} people." | `src/lib/contact-mix-status-labels.ts:54` | No time (JITM-04 §2.7) | "…started for {n} people. Their first follow-ups are on Today for {time}." |
| "Archived customers will stay here until you restore them." | `src/app/(app)/contacts/archived/page.tsx:68` | Two words for one list (JITM-05 §2.16) | "Archived people stay here until you restore them." |
| "Restore a relationship without losing its notes, dates, communication history, or assignments." | `src/app/(app)/contacts/archived/page.tsx:65` | Personal framing; "assignments" | "Restore someone with their notes, dates and history." |
| "The generated placeholder key remains stable even when the display name changes." | `src/app/(app)/contacts/custom-fields/page.tsx:52` | Implementation | "Renaming a field keeps its placeholder, so your messages keep working." |
| "None in your saved plans" | `src/app/(app)/contacts/custom-fields/page.tsx:65` | Retired "plans" (JITM-05 §2.10) | "None" |
| "No contacts in the reviewed range share the same email, phone, or matching name and company." | `src/app/(app)/contacts/duplicates/page.tsx:55` | "reviewed range" | "No one shares an email, a phone number, or a name and company." |
| "Add a contact" (H1) / "Add a person" (card) / "Add contact" (icon name) | `src/app/(app)/contacts/new/page.tsx:68`; `src/components/ContactForm.tsx:189`; `src/components/ContactsBulkWorkspace.tsx:180` | Three names for one action | One label: "Add a person" (JITM-09 §2.33) |
| "Back to Contact" | `src/app/(app)/contacts/[contactId]/edit/page.tsx:42` | Capitalized generic word | "Back to {name}" |
| "Your browser does not expose the native Contact Picker. … voice dictation for Public Notes." | `src/app/(app)/contacts/new/page.tsx:70` | Internal field name | "This browser can't open your phone's contacts. Use this form instead." |

Known, not repeated as new: "Loop · repeat this date" (`src/components/ContactProfile.tsx:272,277`) and "Customer journey" / "Set up your customer journey" (`src/components/ContactsBulkWorkspace.tsx:185`; `src/components/ContactJourneyPanel.tsx:12`): JITM-05 §6.

---

## MIX — Mixes, Mega-Mixes, Marketplace, Invite people

| Current (exact) | Where | Problem | Proposed |
|---|---|---|---|
| "Review and start" (on a Mix that is already on) | `src/components/MixEditor.tsx:308` | Implies the save starts something (JITM-09 §2.39) | "Save changes" |
| "Start this Mix?" / "Check the audience and schedule before starting." | `src/components/MixEditor.tsx:304` | Shown for saves that start nothing | Only when turning on: "Turn on this Mix?" / "Check who gets it before it turns on." |
| "You’ll review who gets this Mix before activating." | `src/components/MixEditor.tsx:306` | Shown for a Mix that is already on; "activating" is jargon | Only when turning on: "You’ll check who gets this Mix before it turns on." |
| "No one is enrolled yet. Line this Mix up with a visit from the calendar, or start it from one person’s page." | `src/components/MixEditor.tsx:304` | False when people are already in the Mix (JITM-04 §2.12) | When people exist: "12 people are in this Mix. Saving doesn’t start anyone new." |
| "Start the Mix" (After saving option) / "Start Mix" / "Mix started." | `src/components/MixEditor.tsx:218`; `src/components/MixWorkspace.tsx:144`; `src/app/(app)/mixes/page.tsx:44` | "Start" also means enrolling a person (JITM-05 §2.1) | "Turn it on" / "Turn on Mix" / "Mix turned on." |
| "active" (chips) and "On" (filter) | `src/components/MixLibraryNav.tsx:15`; `src/app/(app)/mixes/page.tsx:66` | Raw lowercase enum; two words for one state (JITM-04 §2.4) | "On" / "Paused" / "Draft" |
| "Day 0 is the start date. Each Beat prepares one follow-up." | `src/components/MixEditor.tsx:243` | 12px; "start date" is ambiguous | "Day 0 is the day the Mix starts for someone. Each Beat becomes one follow-up on Today." |
| "Saving changes the reusable Mix for new work. A person’s running Journey keeps its saved wording, Beats and connections. Review that person’s progress to change or stop existing work." | `src/components/MixEditor.tsx:302` | "running Journey" for a person's run; the key fact is buried in muted text | Next to Save: "Changes apply to people you start from now on. The 12 people already in this Mix keep the wording they started with." |
| "Everyone39 active people, and anyone you add later" | `src/components/MixEditor.tsx:224` | Missing separator | "Everyone" / "39 people now, and anyone you add later" |
| "Every relationship starts with a first Beat. Add messages and reminders, then set their timing." | `src/app/(app)/mixes/new/page.tsx:35` | Personal framing (JITM-02 §2.2); relies on "Beat" | "Name the situation, then write the texts, emails and calls it should prepare." |
| "Day 0 is when you first turn on this draft" | `src/components/TemplateUseForm.tsx:90` | Wrong for Mixes started per person | "Starts when you start it for someone. Day 0 is that day." |
| "You can choose people later when you keep this as a draft." | `src/components/TemplateUseForm.tsx:100` | Pushes mass enrolment for a per-person Mix | For per-person Mixes: "No need to choose anyone. You’ll start people one at a time." |
| "… will receive this mix: …" | `src/components/TemplateUseForm.tsx:114` | Lowercase "mix" (JITM-05 §2.13) | "… will get this Mix: …" |
| "For example, a 3-day wait becomes 6 days. Steps waiting for your decision still wait for you." | `src/components/JourneyPreferenceFields.tsx:17` | Retired "Step" for a Beat (JITM-05 §2.10) | "… Beats that wait for your decision still wait for you." |
| "Recommended mix" + "The recommended Mix uses texts, emails and calls." | `src/lib/journey-preferences.ts:6`; `src/components/JourneyPreferenceFields.tsx:16` | "mix" (channel mix) collides with "Mix" (the product object) | "Texts, emails and calls (recommended)" |
| "… · 09:00–17:00 · America/New_York", "Prefer 10:00 · Quiet from 20:00 to 08:00", "… · 0-minute buffer" | `src/components/JourneyPreferenceFields.tsx:41-43` | Raw zone id, 24-hour time, contradicts "No buffer" (JITM-11 §2.15) | "Mon–Sun · 9:00 AM–5:00 PM · New York time", "Follow-ups at 10:00 AM · quiet 8:00 PM–8:00 AM", "No buffer" |
| "Unsaved changes. Save before leaving this page." (Mega-Mix review, nothing edited) | `src/components/FormGuard.tsx:72` via `src/components/MegaMixSetup.tsx:25` | False; the page has no Save (JITM-08 §2.30) | Suppress. For real edits on this page: "Your choices aren’t added yet." |
| "Add journey" / "Set up this journey" / "Preview the Contractor journey" / "I’ve reviewed my journey and preferences." / "Choose a whole journey for your work." | `src/components/MegaMixLibrary.tsx:23,27,24`; `src/components/MegaMixSetup.tsx:45,48` | Journey is the map (JITM-05 §2.2) | "Set up" / "Set up this Mega-Mix" / "Preview the Contractor Mega-Mix" / "I’ve reviewed this Mega-Mix and my preferences." / "Connected Mixes for your whole job, from first inquiry to repeat work." |
| "Add your first customer" (account with 40 contacts) | `src/components/MegaMixLibrary.tsx:30` | Not true for this account (JITM-04 §2.1) | "Add a customer" (and a separate "Start someone you already know") |
| "Hi riley.newowner@example.test," | rendered by `src/components/SystemMixInviteForm.tsx:111`, `src/lib/referral-access.ts:68` | Greets an address (JITM-04 §2.21) | "Hi," |
| "I’m using Jump in the Mix to stay in touch with the people in my circle. …" | `src/lib/system-mix.ts:6` (default staff-published wording) | Personal-tool framing (JITM-02 §2.2); needs Kevin, since staff publish it | "I’m using Jump in the Mix to keep up with customer follow-ups. …" |
| "My invitations" | `src/app/(app)/mixes/page.tsx:53`; `src/app/(app)/templates/page.tsx:87` | Everywhere else it is "Invite people" | "Invite people" |
| "Choose a complete Mega-Mix" / "Add a ready-made Mega-Mix" | `src/app/(app)/mixes/page.tsx:58`; `src/app/(app)/mixes/mega/page.tsx:68` | Two labels for one destination | "Add a ready-made Mega-Mix" |
| "Nothing matches. Try another search or clear your filters." + "Nothing to show" | `src/app/(app)/marketplace/page.tsx:112,156` | Blames filters that aren't set (JITM-04 §2.11) | "No one has shared a Mix yet." with the action "Share one of your Mixes" |
| "Share it with other Jump in the Mix users. You can stop sharing at any time." | `src/components/MarketplaceControls.tsx:52` | "users" is outside the glossary (JITM-05 §6 open) | "Share it with other Jump in the Mix members. You can stop sharing at any time." (pending Kevin's member/owner answer) |
| "I’ve reviewed the wording. It becomes my own copy; …" | `src/components/MarketplaceControls.tsx:102`; `src/components/MegaMixForms.tsx:80` | The wording isn't shown | Keep, but only once the wording is shown (MIX-14) |
| "SMS, Phone Call" / "Phone call" | `src/lib/shared-mix.ts:121-125`; `src/lib/display-labels.ts:3` | JITM-04 §2.3 uses Text, Email, Call | "Text, Call" / "Call" |
| Glossary sheet without Marketplace | `src/components/BrandTermsHelp.tsx:6-12` | JITM-05 §2.17 | Add: "Marketplace: Where you find Mixes and Mega-Mixes to add: ready-made ones from Jump in the Mix, ones other members share, and your own shares." |

## JRC — Journey and Calendar

| Current string (exact) | Where | Problem | Proposed |
|---|---|---|---|
| "Calendar updated." / "Person added and calendar updated." | `src/app/(app)/calendar/page.tsx:75` | Doesn't name what happened or when (JITM-04 §2.7); used for every action | Save: "Site visit — deck repair saved for Fri, Oct 9 at 9:00 AM. No invitation was sent." Outcome: "Marked as happened: Site visit — deck repair." Cancel: "Site visit — deck repair canceled." |
| "No invitation was sent. Download the saved event and share it through your calendar provider." | `page.tsx:75` | Second notice for one action | Fold into the save notice: "… No invitation was sent. Download it to share." (link) |
| "Your next seven days" + "America/New_York" | `page.tsx:78` | Wrong for other weeks; raw zone id | "This week · New York time" / "Week of Oct 12" |
| "1–2 of 2 matching events" / "No matching events" | `page.tsx:83` | Counts only appointments under a list of follow-ups | Hide unless searching or paging; "2 appointments match" |
| "The contact menu shows up to 200 matches. You can also schedule directly from any contact’s page." | `page.tsx:89` | Profile scheduling exists only inside the stage sheet, and only with stages | Remove with a type-ahead; until then: "Can't find them? Search by name." |
| "No journey stage" | `page.tsx:91` | Stage ≠ Journey (JITM-05 §2.3) | "No stage" |
| "This removes its reserved time. The contact’s current journey stage stays in place." | `page.tsx:82` | Same | "This frees the time. Their stage stays the same." |
| "Subscriptions are checked about every 15 minutes while the worker runs." | `page.tsx:93` | Implementation word (JITM-04 §2.6) | "Subscriptions refresh about every 15 minutes." |
| "Event times are entered in America/New_York. Changing the zone keeps the entered clock time." | `src/components/CalendarEntryForm.tsx:104` | Raw id; stiff | "Times are in New York time. Changing the time zone keeps the clock time you entered." |
| "Its reminders and check-ins line up with this appointment and move with it. Nothing is sent automatically unless you turn that on for this visit." | `CalendarEntryForm.tsx:101` | Known (JITM-04 §6). The control does exist, but only after saving, inside the visit's "Event details and actions" (`page.tsx:82`); the sentence doesn't say where | "Its follow-ups are timed from this visit and move with it. They wait for your review." (Optionally: "After saving, you can allow automatic sending under Event details.") |
| "… Create a Mix with the cue “When I start it for someone” and start it; no one needs to be enrolled first." | `CalendarEntryForm.tsx:102` | Known retired word "cue" (JITM-05 §6) | "Create a Mix that starts when you start it for someone. No one needs to be in it yet." |
| "Saved to your calendar only. No invitation is sent. Your journey rules may start follow-ups for this person." | `CalendarEntryForm.tsx:111` | "journey rules" means stage rules; 12px | "Saved to your calendar only. No invitation is sent. Booking can move this person to a new stage, which may start its Mix." |
| "Follow up with Sarah Chen" row with hidden "Review →" | `page.tsx:82`; `src/styles/design-workspaces.css:395` | No visible cue where the row goes | Summary row: "10:00 AM · 22 follow-ups due — Review in Today" |
| "{n} setup issues" ("1 setup issues") | `src/components/WorkflowJourney.tsx:264` | Plural for 1 (JITM-05 §2.15) | "1 setup issue" / "3 setup issues" |
| "Select a Mix or drag points to connect." | `WorkflowJourney.tsx:263` | No points show below 70% | Below 70%: "Zoom to 70% or more to connect Mixes." |
| "Drag points to connect." | `src/components/WorkflowConnections.tsx:137` | Implies drag only (JITM-10 §2.17) | "Drag between two points, or tap one and then the other." |
| "Scrollable journey diagram. … A structured list is available above." | `WorkflowJourney.tsx:229` (aria-label) | Not true unless Options is open | "…Switch to List for the same information as text." (with a visible Map / List toggle) |
| "active · Manual or connected start" | `WorkflowJourney.tsx:231,255` | Raw lowercase status; jargon | Drop "active" (show only Paused/Archived); "Starts when you start it or a path hands someone over" |
| "Connect next" (primary) / "Start for someone" | `WorkflowJourney.tsx:256` | Wrong primary in the Start flow; vague verb | In the Start panel: "Start this Mix" only. Elsewhere: "Connect what happens next" / "Start for someone" |
| "Work label (optional)" | `WorkflowJourney.tsx:257` | Internal-sounding | "What is it for? (optional)", placeholder "For example, Deck repair" |
| "Starts separate work using your sending preferences." | `WorkflowJourney.tsx:257` | Vague | "Starts this Mix for them as a new piece of work. Follow-ups follow your sending settings." |
| "Remove its incoming paths first. Applies to new instances." | `WorkflowJourney.tsx:259` | Internal word "instances" (JITM-05 §2.11) | "Remove its incoming paths first. Applies to people who start after this." |
| "No recorded connections in this cohort yet." | `WorkflowJourney.tsx:268` | "cohort" | "Nobody has moved along these paths in this period yet." |
| "{started}/{eligible} eligible connections started · {held} held" | `WorkflowJourney.tsx:171` | Analyst wording | "{started} of {eligible} moved on · {held} on hold" |
| "Work started in this period using the current setup (version {n}). …" | `WorkflowJourney.tsx:220` | Raw revision number | "Work started in this period with your current setup. …" |
| "Existing instances retain their history and stop further progression through this connection." | `src/components/WorkflowRuleEditor.tsx:134` | "instances", "progression" | "People already on this path keep their history and won't move along it any more." |
| "End other unfinished Beats in the source run when this path is selected" | `WorkflowRuleEditor.tsx:129` | "source run" | "When this path is chosen, end this Mix's other unfinished Beats for that person" |
| "Up to {n} traversals." | `WorkflowRuleEditor.tsx:140` | Jargon | "Up to {n} times." |
| "Saved configuration {n}. Each return keeps its previous visits." | `src/components/WorkflowProgress.tsx:28` | Internal revision number | "Each return keeps its earlier visits." |
| "… · {beat.status.toLowerCase()}" / status pill "{instance.status.toLowerCase()}" | `WorkflowProgress.tsx:19,28` | Raw enum text ("pending", "held") | "Waiting", "Done", "On hold", "Skipped" |
| "{n} active Mixes · {m} Beat visits" | `src/components/WorkflowSimulation.tsx:20` | "visits" (internal) | "{n} Mixes running · {m} Beats so far" |
| " +{n}" suffix on people rows | `src/components/WorkflowPeople.tsx:33` | Meaning unclear | "· next: B1.b Fri 10:00 AM", or "+1 Mix" when it's another Mix |
| "About these counts" text ("…Map totals cover nonarchived contacts…") | `WorkflowPeople.tsx:40` | Doesn't say why Active plus Waiting exceeds People, or what Not started vs No Mix means | Add: "Someone with a Beat ready and another scheduled counts in both Active and Waiting. Not started: no Mix work yet. No Mix: no Mix will remind you about them." |

## SHL — Navigation, Settings, Account, Help

| ID | Current string (exact) | Where | What's wrong | Proposed |
|---|---|---|---|---|
| C01 | "Every inquiry, one place" | `src/app/(app)/settings/connections/page.tsx:41` | H1 differs from the nav and Settings label "Lead connections" (O38); a slogan where wayfinding needs the literal name (JITM-04 §2.3) | H1 "Lead connections"; supporting line "Bring every inquiry into one place." |
| C02 | "Search review queue" | `src/app/(app)/settings/connections/page.tsx:65` | "queue" is an implementation word (JITM-05 §2.11; JITM-04 §2.6) (O38) | "Search held inquiries" |
| C03 | "Needs a person’s eye" … "we hold the inquiry here." | `src/app/(app)/settings/connections/page.tsx:65` | Vague heading; the app speaks as "we" (JITM-04 §2.5, "you" for interface) | "Inquiries to match" · "When the details match more than one person or an archived contact, the inquiry waits here until you choose." |
| C04 | "Connection settings saved." (after creating a form) | `src/app/(app)/settings/connections/page.tsx:42` with `src/lib/intake-actions.ts:41` | Doesn't name what happened (JITM-04 §2.7) | "Form created. Copy its link below." |
| C05 | "Trusted sources can also record … to run your journey rules." / "Accepting this inquiry applies your matching journey rules." | `src/app/(app)/settings/connections/page.tsx:50,65` | Same D4/D16 deviation as the known "customer journey rules" (JITM-05 §6) | "…to apply your Contact stage rules." / "Accepting this inquiry applies your Contact stage rules." |
| C06 | "Your phone’s contact picker is in Contacts → More." | `src/app/(app)/settings/connections/page.tsx:67` | "More" here means the Contacts "•••" tools, not the More tab | "To add people from your phone: Contacts → ••• → Add from your phone." |
| C07 | "Business details, saved messages, dates, and personal preferences." | `src/app/(app)/more/page.tsx:16` | Settings has no saved messages, so the description promises a page that doesn't exist | "Your business, new contacts, lead forms, sending and dates." |
| C08 | "Date types" | `src/app/(app)/settings/page.tsx:19` | Opens "Saved date types"; the glossary term is "saved date" (JITM-05 §2.3) | "Saved date types" |
| C09 | "Password & sessions" | `src/app/(app)/settings/page.tsx:20` | Opens a tab named "Security" | Name both "Password and sessions" (or both "Sign-in and security") |
| C10 | "Edit preferences" | `src/app/(app)/account/page.tsx:61` | Shown beside Name and Email; the owner wants to edit their name | "Edit name and timezone" (until R2 makes them editable in place) |
| C11 | "Your data, your choice" / "Manage personal data" | `src/app/(app)/account/page.tsx:61` | Repeats the Data & privacy tab directly above | Remove the card |
| C12 | "Make yourself at home" | `src/app/(app)/account/preferences/page.tsx:53` | The heading hides its contents (Appearance, keyboard shortcut); the page already has other expressive headings (JITM-04 §2.2) | "Appearance and shortcuts" |
| C13 | "Journey preferences" (heading, the "Journey preferences saved. …" notice and "Add working hours and journey preferences") | `src/app/(app)/account/preferences/page.tsx:43,62,64` | Journey is the map of connected Mixes (JITM-05 §2.2; JITM-09 §2.7); these are working hours and contact preferences. JITM-09 §2.65 uses the term too (§6) | "Working hours and contact preferences" (Kevin: standard wording) |
| C14 | "Quiet hours come from Journey preferences." | `src/app/(app)/settings/notifications/page.tsx:39` | Same as C13; the link looks like plain text | "Quiet hours are set in Working hours and contact preferences." |
| C15 | "Automatic sending is off during the beta." ×3 (status card, header pill "Off during the beta", notice) | `src/app/(app)/settings/sending/page.tsx:28,30,31` | Says one fact three times on one screen | One status line: "Automatic sending is off during the beta. You review and send every message from Today." |
| C16 | "Only the previous stage’s managed Mix is stopped when someone moves on. … not one started by a tag, Everyone, a visit or Journey." (about 90 words) | `src/app/(app)/settings/journey/page.tsx:34` | A rule dump in one paragraph (JITM-04 §2.1 short sentences) | "Moving to a new stage stops only the previous stage’s own Mix. Other Mixes, manual stops and Do not contact stay as they are." The rest goes in a "How stages and Mixes work" disclosure |
| C17 | "No Mix assigned" | `src/app/(app)/settings/journey/page.tsx:28` | Collides with the reserved contact label "No Mix" (JITM-05 §2.3) | "Entry Mix: none" |
| C18 | "Retire empty stage…" (on a stage with people) | `src/app/(app)/settings/journey/page.tsx:29` | Offers an action that will be refused (JITM-04 §2.14) | Disabled, with "Move the 36 people in this stage first." |
| C19 | "…including contacts, notes, dates, plans, and follow-up history." | `src/components/AccountExport.tsx:18` | "plans" is retired for Mixes (JITM-05 §2.10) | "…contacts, notes, saved dates, Mixes and follow-up history." |
| C20 | "Share feedback" (primary) / "Share feedback or get help" / "Send feedback" | `src/app/(app)/help/page.tsx:70,81,84` | Someone stuck needs help; More promises "Get help, report a problem" | "Get help" / "Get help or share feedback" / "Send message" |
| C21 | "In that person’s work, choose Customer asked me to get back to them, enter the date, time and timezone, and review the update. …" | `src/lib/support-content.ts:38` | UI labels unquoted, so the sentence is hard to parse (JITM-04 §2.1) | "On the person’s page, open “Record an update or choose a callback date” and choose “Customer asked me to get back to them”. Enter the date and time, then review the update." |
| C22 | "Files are read in your browser, then reviewed rows are sent in small signed-in batches." | `src/lib/support-content.ts:54` | Explains implementation (JITM-04 §2.6) | "Your file is checked in your browser first. You review every row and possible duplicate before anything is saved, and the import keeps going if you close the page." |
| C23 | "Timezone: America/New_York · You review and send." | `src/app/(app)/settings/business/page.tsx:43` | Raw IANA id (JITM-04 §2.1); off-topic at the top of My business | Remove it here; on the scheduling page: "Times use New York time (Eastern)." |
| C24 | "Add record"; placeholders "Name" / "Value" | `src/components/RepeatableProfileRecords.tsx:11` | Developer wording; labels by placeholder only (JITM-10 §2.14) | Label "Service"; "Add a service" |
| C25 | "+ New custom type" / "Examples: Policy Renewal, Closing Anniversary, Program Start, or Warranty Expiration." | `src/app/(app)/settings/jump-date-types/page.tsx:64` | A glyph used as an icon (JITM-06 §2.21); Title Case (JITM-04 §2.4) | "New date type" / "For example: warranty ends, policy renewal, move-in day." |
| C26 | "Send us a question and keep the conversation here." + "Ask for help" + "New conversation" | `src/app/(app)/account/tickets/page.tsx:27,32` | Two buttons to the same form | Keep "New conversation" only; empty line "No conversations yet. Ask a question and the replies stay here." |
| C27 | "Meetings, availability, and calendar connections." (Settings row) | `src/app/(app)/settings/page.tsx:14` | Promises connections but lands on the agenda | Keep the text; link the row to `/calendar#calendar-connections` with the panel open |

---

## PUB — Public pages, sign-in, onboarding, customer-facing pages

Public copy needs Kevin's approval (JITM-04 §2.31). Sending and claim lines need a ledger entry (§2.26).

| Current string (exact) | Where | Problem | Proposed |
|---|---|---|---|
| "A fictional contact and editable drafts. The demo doesn't send anything or open another app." | `src/app/features/follow-up-reminders/page.tsx:46`; `src/app/follow-up-templates/page.tsx:48`; `src/app/follow-up-templates/estimate-follow-up/page.tsx:48` | False since D31 (PUB-02) | "Fictional contact and editable drafts. The demo sends nothing itself. A draft you open goes to a non-working example." |
| "Edit a draft, preview it, and record what happened." | `src/app/features/follow-up-reminders/page.tsx:44` | There is no preview step any more | "Edit a draft, open it in your own text or email app, and record what happened." |
| "Practice with a fictional contact. The demo sends nothing itself. If you choose to open the draft in your own text, email or phone app, the recipient is a non-working example and you decide whether to send or call. Free accounts, no card; access is by invitation from a member, or from the waitlist as space opens." | `src/components/PublicLanding.tsx:25` | 55 words; §2.30 asks for one line (PUB-13) | "Fictional contact: drafts open in your own app, addressed to a non-working number. Free beta, no card required; access is by invitation or the waitlist." |
| "Fictional contact. This page sends nothing and schedules nothing. Edits stay in this tab and clear on refresh." | `src/components/ProductDemo.tsx:82` | Repeats the hero note just above it | Remove, or "Edits clear when you leave the page." |
| "Try a 3-step Mix" | `src/components/ProductDemo.tsx:17` | Uses "Mix" before it is defined (JITM-05 §2.18) | "Try a 3-step follow-up" |
| "Until then, try a three-Beat Mix with a fictional contact: text today, email tomorrow, and a call in one week." | `src/components/PublicLanding.tsx:47` | Points to a demo about 3,000 px away, with no link | End with a "Try the demo" link (`#sample`), or remove the sentence. |
| "Try this estimate follow-up plan" / "Try this proposal follow-up plan" + "Preview a fictional contact and an editable draft. Nothing goes out unless you open your own email app and send it." | `src/app/follow-up-templates/estimate-follow-up/page.tsx:47`; `src/app/follow-up-templates/proposal-follow-up/page.tsx:42-43` | Promises "this plan", but the demo is a different plan, and its first Beat opens the messages app (PUB-26) | "Try an estimate follow-up" / "Try a proposal follow-up"; "Fictional contact. Nothing goes out unless you send it yourself." |
| "Jump in the mix." | `src/app/onboarding/page.tsx:41` | Wordplay as the setup heading. Known jargon (ONB-03) | "Set up your first follow-up" |
| "Make this fit your life" | `src/components/OnboardingForm.tsx:53` | Personal framing for a business setup step | "How you'll use it" |
| "Optional business details and signature" | `src/components/OnboardingForm.tsx:61` | Holds a required field (PUB-18) and hides the business name (PUB-14) | Move "Business name (optional)" next to Type of business. Show "Text signature: Riley Novak · Edit" as a line. |
| "Phone recommended · optional" / "Email recommended · optional" | `src/components/OnboardingForm.tsx:87-88` | Two contradictory qualifiers. Hides the fact that a text needs a phone number (PUB-06) | Labels "Mobile phone (optional)" / "Email (optional)", with the hint "Add their mobile number so you can text them from your phone. You can add it later." |
| "If you save someone without a phone or email, we save the reminder and ask you to add their contact details before sending." | `src/components/OnboardingForm.tsx:95` | About 1,700 px from the fields it explains | Fold into the hint above. |
| Reason options: "Follow up about an estimate", "Follow up on a quote", "Follow up on an inquiry", "Reconnect with a lead", "Reconnect with someone", "Check in after the job", "Ask for a review", "Reconnect", "General follow-up" | `src/lib/onboarding-options.ts:4` | 9 options, 4 outcomes (PUB-04) | "An estimate or quote I sent" · "A new inquiry or lead" · "Someone who went quiet" · "Check in after the job" · "Ask for a review" (each with its own starter; Kevin, JITM-09 §6) |
| "Text · Your chosen day · 10:00 in your selected timezone" / "Call · 5 days after · 11:00 in your selected timezone" | `src/components/StarterPreview.tsx:27` | 24-hour time, relative days (PUB-16) | "Text · Thu, Oct 8 · 10:00 AM" / "Call · Tue, Oct 13 · 11:00 AM" |
| "One-week call" (shown as 5 days after) | `src/lib/vertical-plan-library.ts:40,308` | The name contradicts the timing (PUB-17) | "Follow-up call" |
| "I reviewed this Mix and its timing." | `src/components/StarterPreview.tsx:30` | A tick that certifies a preview showing raw tokens | Replace the tick and "Prepare my first follow-up" with one button, "Start Jordan's follow-up", under a filled-in, real-date preview (Kevin; 09-18 ONB-05 asked for explicit acceptance of the timing). |
| "Device contact selection isn't available in this browser. Import a CSV or vCard file, or enter a person below." | `src/components/DeviceContactQuickAdd.tsx:185` | A failure notice on every iPhone (PUB-19) | Nothing, or "Type their name and number below." |
| "Open the one-time verification link sent to {email}. Verification protects account recovery and personal data controls." + "We sent a verification link to {email}. Check your inbox and spam folder." | `src/app/verify-email/pending/page.tsx:36-37` | Says the same thing twice; no next step | "We sent a link to {email}. Open it on this phone to finish setting up. Check spam if it isn't there in a minute." |
| "Send another verification link" (filled main button) | `src/app/verify-email/pending/page.tsx:44` | Invites a resend that cancels the link already sent (PUB-12) | Secondary button: "Didn't get it? Send another link" |
| "Contact support if you cannot recover your account." | `src/app/verify-email/pending/page.tsx:57` | The person has just created the account | "Still nothing? Contact support." |
| "Hi Riley Novak, confirm this email address to finish securing your Jump in the Mix account." | `src/lib/auth-email.ts:27` | Full name; security framing; no next step | "Hi Riley, confirm your email to finish creating your Jump in the Mix account. Then add one person and review their first follow-up." (first-name helper needed) |
| "Hi riley.newowner@example.test," | rendered from `src/lib/system-mix.ts:6,25` | Greets an address (PUB-08) | "Hi there," when the contact's name is an email address or phone number |
| "I'm using Jump in the Mix to stay in touch with the people in my circle. It's free and invitation-only, and I'd like to share one of my three personal invitations with you." | `src/lib/system-mix.ts:6` | No category or mechanism (JITM-04 §2.3); personal framing | "I use Jump in the Mix, a client follow-up app, to keep track of who I need to get back to. It lines up each text or email so I just review and send it. It's free and invitation-only, and I'd like to give you one of my three invitations." (Kevin; staff-published) |
| "Share an email or phone number so we can respond." | `src/components/PublicLeadForm.tsx:13` | "We" (PUB-10); its own error line already says "so the business can reply" (`:15`) | "Share an email or phone number so {Business} can reply." |
| "How can we help?" | `src/components/PublicLeadForm.tsx:15` | "We"; optional field not marked (JITM-08 §2.27) | "What do you need help with? (optional)" |
| "Hi {firstName}, how did we do?" / page title "How did we do?" | `src/app/review/[token]/page.tsx:30,6` | "We"; the business is named only one line later | "Hi {firstName}, how did {company} do?" / "Share your feedback" |
| "Anything you'd like us to know?" | `src/components/ReviewFeedbackForm.tsx:44` | "We" | "Anything else {company} should know?" |
| "Hi {firstName}, thanks for choosing {company}. How did we do? Your private feedback takes a few seconds: {url} — {signature}" ; subject "How did we do at {company}?" | `src/app/api/contacts/[contactId]/review-request/route.ts:45,52` | A ready-made message defaulting to "we" (D23); doubled dash | "Hi {firstName}, thanks for choosing {company}. How did I do? It takes a few seconds and comes straight to me: {url} {signature}" ; subject "How did I do?" |
| "Your customer rates the experience first. Happy customers can continue to your public review page and share a referral." | `src/components/ReviewRequestButton.tsx:48` | Describes gating that the page doesn't do (PUB-11) | "Your customer rates the experience privately first. Then they can choose to leave a public review or recommend you." |
| "Email me a secure sign-in link" + second button "Email sign-in link" | `src/app/login/page.tsx:101-102` | A second email field and a second main button (PUB-25) | One email field; secondary button "Email me a sign-in link instead". |

## STF — Staff console

| # | Current (exact) | Where | Problem | Proposed |
|---|---|---|---|---|
| C1 | "Counts are a live read of retained records at page load. Operational health uses the separate monitoring observation below." | `src/app/(staff)/admin/page.tsx:77` | Explains implementation (JITM-04 §2.6 spirit); it is the first line Kevin reads | Remove. Put in a "How these numbers work" disclosure: "Counts were read when this page loaded. System health comes from the separate monitor." |
| C2 | "Page loaded Oct 8, 11:41 PM" + "Checked 2026-10-08 23:41:49 UTC · 0 minutes ago" | `page.tsx:76`; `src/components/AdminRefresh.tsx:22` | Two stamps, two formats, one without a zone (STF-10, STF-18) | "Updated 7:41 PM EDT · Refresh" |
| C3 | "All accounts, including staff" / "Operational total · not customer capacity" | `page.tsx:79` | Hedged label plus footnote; Kevin wants customers | "Customer accounts" (footnote "3 including staff") |
| C4 | "Check now · Invitation limits are not configured" / "Policy last updated: 7h ago" | `page.tsx:58,64,84` | Verb fused into a status; irrelevant age line | "Invitation limits aren't set, so no one can be invited. Set limits →" |
| C5 | "2 areas" | `page.tsx:83` | Odd unit | "2 to check" |
| C6 | "Customer invitations" / "Next wave: Oct 15, 11:00 PM" | `page.tsx:91` | Opens Waitlist; reads as scheduled while blocked (STF-09) | "Waitlist · Next wave Thu Oct 15, 7:00 PM EDT, on hold until limits are set" |
| C7 | "0 eligible · 0 waitlist email-grant spaces available · Invitation limits are not configured" | `waitlist/page.tsx:65` | Jargon; no wave date | "0 people can be invited · 0 spaces left · Next wave Oct 15 · Invitation limits aren't set (Admission)" |
| C8 | "Open public waitlist" + "Review admission readiness" (renders "Open public waitlistReview admission readiness") | `waitlist/page.tsx:70` | Run-together links (STF-12) | Separate actions: "Open the public waitlist page" · "Set admission limits" |
| C9 | "Available waitlist email-grant capacity" / "Personal invitation allowance is separate" | `admission/page.tsx:39` | Jargon even for staff | "Spaces left for waitlist invitations" / "Members' own 3 invitations don't use these" |
| C10 | "Effective readiness" / "Email grants: Set both limits above zero to allow invitations." | `admission/page.tsx:23,40` | Jargon | "Can invitations go out?" / "Not yet: set both limits above 0." |
| C11 | "Reserved invitations" / "Unused email grants reserve places" | `admission/page.tsx:39` | Jargon | "Invitations not used yet" / "Each holds a space until it's used or revoked" |
| C12 | "No tickets match these filters" / "Try fewer filters." | `support/page.tsx:166-167` | Wrong state (STF-03) | Default view: "No one is waiting for a reply." With filters: "No tickets match these filters. Clear filters" |
| C13 | "Waiting on support" / "Needs reply" / "Needs a reply" / "Support is waiting on a reply" | `support/page.tsx:132,138,145`; `admin/page.tsx:67` | Four names for one state | "Needs a reply" everywhere |
| C14 | "No jobs matched" / "Try a different status or task filter." | `operations/page.tsx:153` | Wrong state on the default Failed view | "No failed jobs." |
| C15 | "1 worker(s) reported within 90 seconds. 0 pending and 0 running jobs. Review worker evidence" | `operations/page.tsx:137` | "(s)"; clunky | "1 worker checked in within 90 seconds. Nothing waiting or running. See worker health" |
| C16 | "No events match this view. Clear the search to review other verified events." | `email/page.tsx:54` | Shown with no search | No search: "No provider events recorded yet." With search: "No events match "{q}". Clear search" |
| C17 | "Signed provider events: Missing signing secret" | `email/page.tsx:44` | A real problem in plain text | Warning notice: "Delivery events can't be verified: the provider signing secret isn't set." |
| C18 | "0 deliveries · expired payloads excluded" / "No matching deliveries within your permissions." | `email/recovery/page.tsx:20-21` | "payloads"; reads like an error when nothing exists | "No invitation emails need review." |
| C19 | "Unresolved, including acknowledged" | `operations/alerts/page.tsx:36` | Wordy tab | "Open" |
| C20 | "Older page back" | `operations/alerts/page.tsx:49` | Wrong direction word | "Newer notifications" |
| C21 | "Manage access · 21" | `team/page.tsx:43` | Unexplained number | "Manage access (21 permissions)" |
| C22 | "{n} sessions" → "1 sessions" | `users/page.tsx:100` | Plural (STF-14) | "1 active session" |
| C23 | "1 item(s) need review · 4 Beats" / "Draft · publishing is a separate step." | `LibraryDraftForm.tsx:43-44` | False alarm plus duplicate (STF-13) | "Ready to save · 4 Beats"; on invalid input "2 fields to fix"; drop the second line |
| C24 | "Days from the start date (negative = before)" | `LibraryDraftForm.tsx:66` | Sign convention exposed | "When" = [Before / On / After] the start + "days" |
| C25 | "Review A conversation goes quiet: reopen gently" (H1 "Review {title}") | `templates/[sharedMixId]/edit/page.tsx:60` | Verb collides with the title | H1 = the title; subline "Ready-made Mix · Published v1 · Draft v1" |
| C26 | "Preview & publish · draft 1" vs "2. Preview and publish" vs "Preview and publish · version 1" | `edit/page.tsx:66`; `AdminEditorNavigation.tsx:16`; `system-mix/page.tsx:53` | Three forms of one step | "Preview and publish version 1" |
| C27 | "Customers see version 1" | `templates/page.tsx:66` | Wraps in its column | "Published v1" |
| C28 | "SMS" / "Phone Call" / "Voicemail Script" | `src/lib/shared-mix.ts:122-125` | Title case; differs from the select (STF-15) | "Text" / "Call" / "Voicemail" |
| C29 | "Required capability: Access to this area." / "Return to your workspace" | `access-denied/page.tsx:8,13` | Tautology; "workspace" means the customer app | "You don't have permission for this page. Ask an owner to change your staff access." / "Back to {area}" |
| C30 | "Your account" | `src/app/(staff)/layout.tsx:18` | Opens Today, not My account | "Open the app" |
| C31 | "Admin mfa enable" · "ALLOWED" · "AdminMfaCredential" · "Oct 8, 11:41 PM (UTC) · 2026-10-08 23:41:37 UTC" | `audit/page.tsx:46` | Mechanical label, raw enums, double time | "Administrator MFA turned on" · "Allowed" · "Admin MFA" · one time |
| C32 | "A private-information report from a verified account hides a share at once; every other report keeps it visible until you decide." | `marketplace/page.tsx:33` | known: JITM-09 §6 / B-09 ("verified" = email) | "A private-information report hides a share at once when the reporter's email address is verified. That doesn't mean the report is true. Other reports keep the share visible until you decide." |
| C33 | "…I'd like to share one of my five personal invitations with you." (stored v1) | `prisma/migrations/20260909040000_system_mix_releases/migration.sql:30` | Contradicts JITM-09 §2.17 (STF-02) | "…I'd like to share one of my three personal invitations with you." Optional SMB tone (Kevin): "I use Jump in the Mix to keep up with my customers. It's free while it's invitation-only, and I'd like to share one of my three invitations with you." |
| C34 | "Mixes" + "2 settings" | `settings/page.tsx:29` | Counter noise | Drop the count |
| C35 | "Operations: scroll for more pages →" | `src/components/AdminNav.tsx:40` | Instruction text; 12.8px | Edge fade on the tab strip; no sentence |

---

## DSN — Design-system consistency and drift

| Current string (exact) | Where | Problem (rule) | Proposed replacement |
|---|---|---|---|
| "Follow up" / "2026-10-09 14:00 · Edit" | `src/components/QuickAdd.tsx:180` | ISO date, 24-hour clock, channel not named (JITM-11 §2.15) | "Follow up · Fri, Oct 9 at 2:00 PM · Edit" |
| "Check each item. Dates and times use America/New_York." | `src/components/QuickAdd.tsx:166` | Raw timezone id | "Check each item. Times are New York time." |
| "Mon, Tue, Wed, Thu, Fri, Sat, Sun · 09:00–17:00 · America/New_York" | `src/components/JourneyPreferenceFields.tsx:41` | 24-hour clock, raw id, every day listed | "Every day · 9:00 AM–5:00 PM · New York time" |
| "Prefer 10:00 · Quiet from 20:00 to 08:00" | `src/components/JourneyPreferenceFields.tsx:42` | 24-hour clock | "Around 10:00 AM · Quiet 8:00 PM–8:00 AM" |
| "Recommended mix" | `src/lib/journey-preferences.ts:6` | Generic "mix" next to the product noun Mix (JITM-05 §2.13) | "Text, email and calls (recommended)" |
| "Uses your default follow-up time in America/New_York." | `src/app/(app)/jumps/page.tsx:360` | Raw id | "Uses your usual follow-up time (New York time)." |
| "Event times are entered in America/New_York. Changing the zone keeps the entered clock time." | `src/components/CalendarEntryForm.tsx:104` | Raw id directly under "New York" | "Times are New York time. Changing the time zone keeps the clock times you entered." |
| "Oct 9, 9:00 AM – Oct 9, 9:30 AM · America/New_York" | `src/app/(app)/calendar/page.tsx:82` | Repeated date, raw id | "Fri, Oct 9 · 9:00–9:30 AM" (add the zone only when it differs) |
| Agenda header "America/New_York" | `src/app/(app)/calendar/page.tsx:78` | Raw id | "New York time" |
| "Timezone: America/New_York · You review and send." | `src/app/(app)/settings/business/page.tsx:43` | Raw id | "Time zone: New York · You review and send." |
| "sms", "email", "call", "voicemail", "whatsapp" (Today "How" filter) | `src/app/(app)/jumps/page.tsx:110-114` | Internal codes (JITM-05 §2.11) | "Text", "Email", "Call", "Voicemail", "WhatsApp" |
| "Phone call" | `src/lib/display-labels.ts:3`; `src/components/ContactsBulkWorkspace.tsx:278` | Differs from "Call" on Today | "Call" |
| "active", "completed" (status pills) | `src/components/MixWorkspace.tsx:80`; `src/components/MixLibraryNav.tsx:15`; `src/components/ContactImportWizardV2.tsx:488,504` | Lowercase raw status (JITM-04 §2.4) | "Active", "Completed" |
| "Follow-up completed" / "{name} · you can undo this for a moment" / "Next scheduled: …" | `src/components/JumpWorkflow.tsx:249-252` | Vague timing (JITM-08 §2.4 gives 10 seconds); two labels for the next date | "Follow-up done" / "{name} · Undo for 10 seconds" / "Next follow-up: Sat, Oct 10 at 10:00 AM" |
| "Awaiting follow-up preparation"; "Your follow-up list is awaiting preparation."; "Your recorded updates are being prepared. This list will refresh." | `src/components/ContactProfile.tsx:233`; `src/app/(app)/jumps/page.tsx:469`; `src/components/WorkflowAttention.tsx:10` | Seven phrasings for one state (JITM-04 §2.7) | One family: "Getting follow-ups ready…" (title) and "This updates by itself; you can keep working." (detail) |
| "Choose a Contact file" | `src/components/ContactImportWizardV2.tsx:417` | "contact" is a generic word (JITM-05 §2.13) | "Choose a file of contacts" |
| aria-label "Saved Contact views" | `src/components/ContactSavedViewsBar.tsx:23` | Casing | "Saved contact views" |
| "+ New custom field", "+ New custom type", "+ Add email", "+ Add phone", "+ Add address" | `src/app/(app)/contacts/custom-fields/page.tsx:52`; `src/app/(app)/settings/jump-date-types/page.tsx:64`; `src/components/ContactForm.tsx:221,235,251` | Text glyph used as an icon (JITM-06 §2.21) | AppIcon `plus` plus "New custom field", "Add email", and so on |
| "My invitations" | `src/app/(app)/mixes/page.tsx:53` | Same destination is "Invite people" elsewhere | "Invite people" |
| "This uses 1 of your 3 remaining slots, leaving 2. Revoking later does not restore slots." | `src/components/SystemMixInviteForm.tsx:117` | "slots" is not glossary vocabulary (JITM-05 §2.3 invitation) | "This uses 1 of your 3 invitations, leaving 2. Taking it back later doesn't return the invitation." |
| "Find a person, Mix, or reason." (description) plus the field label "Find a person, Mix, or reason" | `src/app/(app)/jumps/page.tsx:470-471` | Same words twice | Drop the description, or label the field "Search" |

---

