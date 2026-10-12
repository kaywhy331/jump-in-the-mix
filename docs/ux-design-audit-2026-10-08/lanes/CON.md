> Lane report CON (Contacts) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# CON lane: Contacts (directory, profile, bulk, import, forms, secondary pages)

Audited commit: `origin/main` f23db11 (= production dae3fab + docs). Paths: code is repo-relative (`src/...:line`, read in the repository); screenshots are relative to `<captures>` (`shots/...`). Crops made for this lane are in `lanes/crops/CON/`.

Severity calibration: JITM-17 §2.14. Where a MUST is broken by wording only (Journey label, implementation words), I followed the precedent in `docs/STANDARDS_AUDIT_2026-09-28.md` (IAW-01, VOC-02 = MEDIUM). I kept HIGH for things that will probably get the owner stuck.

---

## 1. Lane summary

**Verdict.**
- **Directory: Good, fix details.** Search, the rows and the desktop panes follow the export, and "No Mix" shows on every row.
- **Profile: Needs rework.** The top of the profile matches the export and is right: the header, Text/Email/Call/Note and the Next card. Everything below it repeats or hides things:
  - "Connected Mixes" repeats the Next card's Beats and adds two or three more Review buttons. On a phone this pushes History about 1,230 CSS px down; in the export it starts about 610 px down.
  - You can put a person into a Mix from four places, with three different verbs.
  - Ask for a review, booking a visit, persistent notes, Dates and Stop/Remove are buried in More or in sheets.
  - The stage section is still called "Journey".
- **Bulk: Needs rework.** The core is safe: Undo, Do not contact is refused by name, and Archive asks first. But nobody will find it: the only way in is ••• → Contact tools → "Select contacts". The bar also makes "Message" the primary action instead of Mix, and a bulk tag change can start or stop Mixes without saying so.
- **Import: Good, fix details.** The Mix choice sits below the sticky "Queue 36 valid rows" button. The copy talks about workers and queues, and there is no next step after the import.

**Changes that would most improve the workflow:**
1. Make placing people a visible list action:
   - a "Select" control on the list;
   - on the No Mix filter, a strip with "Add these N people to a Mix" and "Mark No Mix needed";
   - Mix as the primary bulk action, keeping labels on phones (CON-01, CON-22).
2. Rebuild the area below the Next card:
   - one compact "Mixes" section, one row per Mix with a row menu (Record an update, Pause, Stop, Remove), instead of Connected Mixes plus More → Mixes;
   - a profile ••• menu holding Edit, Ask for a review, Schedule a meeting, Do not contact and Archive;
   - "Notes to remember" and the next appointment visible near the top (CON-04, CON-05, CON-09, CON-10, CON-16, CON-17).
3. Import review: ask "New people: Mix (and stage)" before the import button, use plain copy, and end with "Add these people to a Mix" and "Go to Today" (CON-06, CON-07, CON-08, CON-21; LOOP-06).
4. Make profile states truthful:
   - check preparation per person, so an unrelated profile no longer says "Awaiting follow-up preparation";
   - rename the stage UI from "Journey" to "Stage", and hide it when stages are off (CON-03, CON-02, CON-20).
5. Phone forms: let the Cancel/Save bar scroll with the form, as Calendar and Mixes already do, and move "First follow-up" above the fold (CON-15).

**Answers to the lane questions.**
- **Find a person:** close to optimal. Live search covers name, company, notes, email, phone and custom fields; there is a sort and a filter sheet, and rows show stage, next due time or No Mix. The filter sheet shows a stray "0" and clips its selects at 1440 (CON-19).
- **See what's next:** good at the top (the Next card with real Beat dates and Review). Below it, the same Beats appear up to four times (CON-04). The Next card does not warn when the person cannot be reached (CON-13), and it can falsely say "Awaiting follow-up preparation" (CON-03).
- **Act:** Text, Email, Call and Note are primary and respect missing methods and Do not contact. Several things hide where nobody looks:
  - Ask for a review and Archive are in More → Preferences;
  - booking a visit is only inside the stage sheet;
  - "Schedule a one-time follow-up" sends you away to the Contacts list and then to Today;
  - Note opens a composer deep in History.
- **Put people in the right Mix:**
  - One person: works, but from four entry points that preselect the alphabetically first Mix.
  - Many people: hidden (CON-01).
  - After an import: the choice is easy to miss (CON-06), and nothing leads on from the results (known LOOP-06).
- **Primary vs hidden:** the wrong things are primary. "Message" is the filled bulk action; three Review buttons and "Pause this work"/"Stop this work" sit in the main column. Things the owner needs are collapsed:
  - Notes to remember (imported notes such as "Wants a call after 5 pm" are hidden);
  - Dates;
  - Ask for a review;
  - the Mix list on accounts without Journey connections.
- **Is bulk work discoverable and safe?**
  - **Discoverable:** no (CON-01).
  - **Safe:** mostly, with gaps:
    - no warning for people without a phone or email (CON-13);
    - tags can start or stop Mixes silently, with no Undo (CON-14);
    - the Mix picker preselects the alphabetically first Mix (CON-17);
    - on phones, tapping a row in selection mode leaves the list and drops the selection (CON-22, INFERRED).

---

## 2. Page and overlay verdicts

### 2.1 Contacts directory `/contacts` (all configs)
- **Owner's job:** find a person; spot who has No Mix; open a profile.
- **What works:**
  - The phone layout matches `shots/export/Contacts.png`: title, search with a filter icon, "39 people", the sort, and avatar rows reading "Stage · next due".
  - The "16 with No Mix" link and the amber "No Mix" label meet JITM-09 §2.76–§2.77.
  - Desktop gives 360px directory + profile at 1440 and 440 · profile · 340 at 1920 (`shots/sweep/desktop-light/contacts.png`), as JITM-07 §2.13 asks.
  - No sideways scroll at 320/834/1440. 200% text wraps rows cleanly (`shots/text200/contacts-320.png`).
- **What gets in the way:**
  - There is no visible way to select people (CON-01).
  - On the No Mix filter the only cue is a "1" badge on the filter icon; there is no "showing No Mix · Clear" chip and no next action.
  - Right after the two bulk adds, every added row reads red "Earlier today, 10:00 AM" (`shots/sweep/phone-light/contacts.png`), and the notice never said when follow-ups were due (CON-25).
  - The Add-contact icon is icon-only on desktop while the rarer Import has a label (O15). This is LOW: the export has no add icon at all, and Quick Add is the add path.
  - "No stage" is printed on rows even for accounts without stages (CON-20).
  - Every list load on a phone still renders the hidden docked profile (prior F12, still open, `src/app/(app)/contacts/page.tsx:381`).
- **Verdict: Good, fix details.**
- **Recommended structure:** keep the rows and panes. In the summary row add "Select" (text button) beside the sort. When the Mix filter is No Mix, show a strip under the search:
  - "16 people have No Mix", with two buttons: **Add to a Mix** (primary) and **Mark No Mix needed**;
  - both enter selection mode with everyone on the page selected and open the sheet.

### 2.2 Filter sheet (`contacts-filter`, phone/laptop/dark) and saved views
- **Owner's job:** narrow the list by tag, priority, permission or Mix status, and save that as a view.
- **What works:**
  - Filters apply at once ("Changes apply right away.", JITM-08 §2.29).
  - Mix options show counts ("In a Mix · 23", "No Mix · 16", "No Mix needed · 0").
  - Saved views live inside Filter, as JITM-08 §2.29 asks.
- **What gets in the way:**
  - A stray "0" under the selects (CON-19).
  - At 1440, five selects share one row and clip: "All pri", "Everyon", "Last name" (`shots/overlays/laptop-light/contacts-filter.png`).
  - Sort appears both here and in the summary row.
  - On phones the grid is ragged (half-width Sort, uneven pairs).
  - "All Contacts" is a filled primary button even though it only clears.
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - a two-column grid: Tag | Mix, then Priority | Permission;
  - drop Sort from the sheet (it stays in the summary row);
  - a text "Clear filters" link;
  - saved views as chips, with "Save this view" as a secondary button.

### 2.3 Contact tools sheet (`contacts-tools`, `flow-bulk-*-1-tools-sheet.png`)
- **Owner's job:** less-frequent tools: select people, import, find duplicates, see archived people, manage custom fields and tags.
- **What works:** the navigation part is a flat, single-column list with leading icons (JITM-08 §2.10). The phone card explains adding from a phone.
- **What gets in the way:**
  - "Select contacts", the only door to bulk work, is the second row of a sheet hidden behind an unlabeled "•••".
  - The sheet also carries a whole tag manager: a create form with a native color input, "Show" checkboxes, "Delete…" and "Save tags".
    - The name placeholder clips to "For example, Kitchen rem".
    - "Color" is 12px.
    - On phones the "TAGS" label is uppercase (CON-18).
  - "Customer journey" opens the Journey map (known: JITM-05 §6).
  - O19 is partly wrong: saved views are in the Filter sheet, not here.
- **Verdict: Needs rework.**
- **Recommended structure:**
  - flat rows only: Select contacts · Manage tags · Import contacts · Add from your phone · Find duplicates · Archived contacts · Custom fields · Lead connections;
  - "Manage tags" opens its own sheet or page (create, rename, show/hide, delete with the Mix warning);
  - drop the "Customer journey" row; Journey is in the navigation.

### 2.4 Selection mode and the bulk bar (`flow-bulk-*-2-selected.png`, `probe-bulkbar-overlap.png`)
- **Owner's job:** act on many people at once, mainly placing No Mix or newly imported people into a Mix.
- **What works:**
  - The count and "Clear"/"Select this page" are clear.
  - Archive asks first and its notice offers Undo.
  - Export CSV is direct.
  - Large 44px checkboxes.
- **What gets in the way:**
  - The bar's filled primary is **Message**; Mix is secondary even on the No Mix filter (O22, CON-01).
  - "Done" is an unstyled native button, about 46×24 (O21, CON-24).
  - At ≥1200 the bar spans the directory *and* the profile, covering the profile's lower sections.
  - The directory reserves no bottom space for it at ≥901, so pagination buttons fall under it once there are more than 50 people (CON-23; corrects O20: the last row itself can scroll clear).
  - On phones the action labels are hidden: Tags uses the Contacts "people" icon, and Message is an icon-only primary.
  - On phones, tapping a row opens the profile and drops the selection (CON-22, INFERRED from code).
- **Verdict: Needs rework.**
- **Recommended structure:**
  - Bar order: **Add to a Mix** (primary) · Tags · Follow up · Export CSV · Archive.
  - On phones, keep two rows: the count row, then labeled buttons (icon above a 12px label is allowed for compact buttons).
  - In selection mode a row tap toggles selection.
  - At ≥1200, size the bar to the directory pane.

### 2.5 Bulk Mix sheet "Mix for 12 people" (`flow-bulk-*-3-mix-sheet.png`)
- **Owner's job:** pick the right Mix and start day for the selected people, or mark them No Mix needed.
- **What works:**
  - A per-trigger sentence ("Anyone who already finished this Mix starts it again…").
  - Do not contact is refused by name.
  - The No Mix needed path is clearly separated.
  - The notice names the Mix, says what happened to each group of people, and offers Undo (`shots/flow-bulk-estimate-4-after.png`).
- **What gets in the way:**
  - The Mix is preselected as the alphabetically first one (`src/components/ContactsBulkWorkspace.tsx:106`).
  - There is no warning for people without a phone or email: Hana Hayes was added silently (CON-13).
  - The title "Mix for 12 people" reads oddly.
  - The confirmation does not say when follow-ups are due (CON-25).
  - The docked profile afterwards shows someone not in the action, with a false "Awaiting follow-up preparation" (CON-03).
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - title "Add 12 people to a Mix";
  - no preselected Mix, or the New contacts setting's Mix;
  - a line "2 have no phone or email; their follow-ups will wait for one. Show them";
  - after Add, keep the docked person or show a summary card.

### 2.6 Bulk Tags sheet "Update tags" (`shots/flow-tags-sheet.png`, `flow-tags-after.png`)
- **Owner's job:** tag or untag many people.
- **What works:** short, two clear forms.
- **What gets in the way:**
  - Adding or removing a tag can start or stop tag-based Mixes for those people. The sheet says nothing, the notice is just "Tag added." or "Tag removed.", and there is no Undo (CON-14).
  - The single-tag Delete dialog does warn about stopping Mixes.
  - "Remove tag" lists every tag, not only the ones the selected people have.
- **Verdict: Needs rework (safety).**
- **Recommended structure:**
  - preview the effect in the sheet ("Adding Past customers starts Past customer and next project for 5 people");
  - an Undo notice that names the tag and the count;
  - confirm when a removal stops Mixes.

### 2.7 Bulk "Message N people" sheet (code only: `src/components/ContactsBulkWorkspace.tsx:272-285`)
- **Owner's job:** schedule a one-time follow-up for several people.
- **What works:** each person gets their own follow-up on Today, to review and send by hand, which stays inside the non-goal "no bulk outreach" (JITM-01 §2.18). Do not contact is blocked.
- **What gets in the way:**
  - "Message" and "Schedule message" suggest sending.
  - The options say "Phone call" where the rest of the product says Call.
  - The default "When: Now" can drop up to 50 items on Today at once, with no preview of the rendered wording.
  - It ends on Today (`src/lib/bulk-contact-actions.ts:231`). That is fine, but the same sheet is also how a profile schedules a single one-time follow-up (CON-17).
- **Verdict: Good, fix details (labels).** Not captured at runtime.

### 2.8 Profile header and quick actions (`contact-marcus`, `contact-carla`, `contact-text`, `x-contact-hana`)
- **Owner's job:** recognise the person; reach them.
- **What works:**
  - It matches `shots/export/Contact.png`: avatar, name, stage chip, four round actions (Text/Email/Call/Note).
  - Missing methods disable actions and show a visible hint ("Add a phone number or email in Details to reach them.").
  - The No Mix chip appears only when it applies (JITM-09 §2.76).
  - At 1840 and wider the actions move into the header row, as in `DesktopContacts.png`.
- **What gets in the way:**
  - The stage chip's name is "Change journey stage: …" and it opens a sheet titled "Journey stage for …" (CON-02).
  - The links use the typed number (`sms:+1 555 010 1002`; known prior MSG-07, CON-12).
  - The disabled buttons' reason is a `title` only and is not linked to the hint (CON-32).
  - Text/Call from the profile does not connect to the due follow-up (Marcus is "2 days late") and never asks what happened afterwards, so History stays "No history yet".
  - On phones the tag chip "Customers" sits glued to the "Details" label with no gap.
- **Verdict: Good, fix details.**

### 2.9 Profile Next card
- **Owner's job:** see the next Beat with its real dates; open Review.
- **What works:** it is the export's design: Mix name, "Beat 1 of 3", lateness in red, the dated Beat track and Review. Phone and desktop both look right.
- **What gets in the way:**
  - It shows the follow-up's reason (often the Mix name), not the Beat name or the channel (call or text).
  - For a person with no phone or email (Hana) it offers a primary Review that ends at "Add phone" (`shots/overlays/phone-light/x-review-nomethod.png`, CON-13).
  - When nothing is scheduled it can falsely say "Awaiting follow-up preparation" (CON-03).
  - At 200% text on 320px the last date clips to "Oct" (CON-29).
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - "Next · Text · Estimate check-in";
  - when unreachable, "Can't be sent yet: add a phone number or email" with the Add link, in place of Review.

### 2.10 Profile "Connected Mixes" block (`shots/sweep/*/contact-marcus*.png`, `x-contact-hana-full.png`, contact-more-open crops)
- **Owner's job:** see which Mixes the person is in; record early news; pause or stop a Mix.
- **What works:** the actions exist: Review per Beat, "Record an update or choose a callback date" (JITM-09 §2.31), Pause and Stop.
- **What gets in the way:**
  - The card header repeats the person's own name and a lowercase "active".
  - Every pending Beat is listed with its own Review, including the one the Next card already offers: three Review buttons for one Mix.
  - Two disclosures follow:
    - "Progress and previous visits · 3 Beats", ending in "Saved configuration 1. Each return keeps its previous visits.";
    - the update form, which shows "Estimate follow-up · Oct 6, 12:00 AM" and "This saved Mix has no whole-Mix outcome path…".
  - Then "Pause this work" / "Stop this work".
  - The heading "Connected Mixes" suggests Journey connections even for a Mix with none.
  - The block appears only on accounts with Journey connections (`src/components/WorkflowProgress.tsx:38`). Elsewhere a person's Mixes appear only in collapsed More → Mixes (O17).
  - On phones it pushes History about 620 CSS px further down (CON-04, CON-05, CON-07, CON-30).
- **Verdict: Needs rework.**
- **Recommended structure:** one **Mixes** section under the Next card.
  - One row per Mix: name · next Beat date · status in words ("Running", "Paused", "Stopped").
  - A row "•••" menu: Record an update · Pause Mix · Stop Mix… · Remove… · Open in Journey.
  - Review stays on the Next card only.
  - "Add to a Mix" sits at the end of the section.
  - The same section replaces More → Mixes, so every account has one place for this.

### 2.11 Stage section ("Journey") and stage sheet (`contact-stage-menu`, `x-contact-stage`)
- **Owner's job:** see and change the person's stage.
- **What works:** the stage history track with undated possible next stages, and the chip in the header.
- **What gets in the way:**
  - It is labeled **Journey** (heading, chip name, sheet title, notice). Its sheet links "View journey" to the Mix map, and it says "Automatic transitions are paused… Review journey settings" (CON-02; O23).
  - Changing a stage takes three steps: chip → select inside an open "Stage and automation" disclosure → "Move stage".
  - "Pause transitions for this person" is jargon.
  - The sheet's last button, "Schedule a meeting", is unrelated to stages and is the profile's only booking link (CON-09).
  - The section header repeats "Start a follow-up", which the Next card already shows (O16).
  - On phones the whole section is inside collapsed More (CON-28).
  - The empty text "No stage yet. Choose a stage beside this person's name." is fine.
- **Verdict: Needs rework (labels and placement).**
- **Recommended structure:**
  - heading "Stage", chip name "Change stage: Inquiry", sheet "Stage for Carla Chen";
  - the stages as a list of tappable rows (current one marked), with the automation pause as a secondary toggle;
  - remove "Start a follow-up" and "Schedule a meeting" from this area.

### 2.12 "Start a follow-up" sheet and the No Mix chip sheet (`overlays/laptop-light/contact-start-followup.png`; No Mix sheet code only)
- **Owner's job:** start a Mix or schedule one follow-up for this person.
- **What works:** it asks for a start date (JITM-09 §2.34) and offers "Schedule a one-time follow-up" and "Mark No Mix needed".
- **What gets in the way:**
  - The picker preselects "Aftercare check-in", the alphabetically first Mix.
  - It lists two identical "Estimate follow-up" entries (aria snapshot).
  - "Start Mix" here, "Add to a Mix" in More and "Add to the Mix" in bulk name the same action three ways.
  - "Schedule a one-time follow-up" goes to `/contacts?intent=one-time-jump…`: the Contacts list in selection mode with the bulk "Message 1 person" sheet, and then to Today (CON-17).
  - No warning when the person cannot be reached (Hana).
- **Verdict: Good, fix details.**

### 2.13 History, History options, the Note composer (`contact-history-menu`, `contact-note`)
- **Owner's job:** read what happened; add a note.
- **What works:** a timeline with personal notes in Newsreader, private notes, corrections, and the "This records a conversation" option.
- **What gets in the way:**
  - Note jumps to a disclosure deep in History (below Connected Mixes on phones).
  - The composer repeats "Add a note" as its summary and its label, and its button says "Add update".
  - "History options" is a sheet with three filter chips plus "Refresh".
  - The automatic entry reads "Joined Inquiry. A contact or inquiry arrives · New contact." (O24; `src/lib/journey.ts:135`).
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - on phones Note opens a bottom sheet (a phone task, JITM-08 §2.21) that returns to the same scroll position;
  - the filters as inline chips;
  - "Moved to Inquiry when they were added."

### 2.14 Notes to remember
- **Owner's job:** keep lasting context in view ("Wants a call after 5 pm", "Prefers texts").
- **What works:** shown in the voice typeface, with private notes separated.
- **What gets in the way:**
  - It is collapsed by default at the bottom of the profile. CSV "Notes" columns land here (`src/lib/contact-import-mapping.ts:126,244`), so imported context is hidden.
  - Editing it needs the full edit page, where it sits inside another collapsed disclosure (CON-16).
- **Verdict: Needs rework.**
- **Recommended structure:** show the first three lines open, directly under the Next card or Details, with an inline Edit.

### 2.15 More: Preferences, Ask for a review, Dates, Mixes, Custom fields (`contact-more-open*`, `flow-review-1-ready.png`)
- **Owner's job:** less-frequent person settings.
- **What works:**
  - Priority and Prefers chips save instantly.
  - Do not contact is confirmed with a count.
  - Dates explain "Moments that can start a follow-up Mix."
- **What gets in the way:**
  - On phones, with every disclosure open, the profile is about 4,480 CSS px long, and More alone about 2,000 (`shots/overlays/phone-light/contact-more-open-full.png`).
  - It mixes rarely used settings with goal actions and destructive ones:
    - "Ask for a review" (a product goal, JITM-01 §2.16) sits under Do not contact (CON-10, O41);
    - "Archive contact…" is the first control in Preferences, touching the "Edit contact" link;
    - "Add to a Mix" is the third place to start a Mix;
    - each Mix row has "Stop…" and "Remove…" with dialogs that do not explain the difference (CON-05).
  - Dates show raw "none".
  - "Start a matching Mix" ("Uses your first active Mix for this kind of date") never names the Mix, and its checkbox is squished to 8px.
  - "Loop · repeat this date" is a known deviation (JITM-05 §6).
  - The Mixes copy "Keep this connection in the mix with a series of thoughtful Beats." is off-brand (CON-31).
  - The review panel shows two butting primary buttons and never shows the message (CON-10). The message itself uses "we" and a double dash (CON-11).
- **Verdict: Needs rework.**
- **Recommended structure:**
  - Profile header ••• menu: Edit · Ask for a review · Schedule a meeting · Do not contact · Archive…
  - Mixes moves to the main column (2.10).
  - More keeps Dates (with the Mix named), Priority/Prefers and Custom fields.

### 2.16 Add a contact `/contacts/new` (phone/laptop/200%)
- **Owner's job:** add one person, optionally with a first follow-up, in one submission (JITM-09 §2.10).
- **What works:** short top fields, "optional" markers, dictation with a privacy note, and "Save & schedule follow-up" when the box is ticked.
- **What gets in the way:**
  - On phones a sticky two-row Cancel/Save bar sits 84px above the tab bar and covers fields. With the tab bar it takes about 22% of the screen, and about a third at 200% text (`shots/text200/contact-new-320.png`).
  - "First follow-up" is below the bar, so "Save contact" is pressed before it is seen (CON-15).
  - Phone is not marked optional, though it is.
  - "Add another phone/email" sits after the notes field.
  - The page says "Add a contact", the card "Add a person", and the icon "Add contact".
  - The same field is "Message context" here but "Notes" on Edit (CON-16).
- **Verdict: Good, fix details.**

### 2.17 Edit contact `/contacts/[id]/edit`
- **Owner's job:** correct details, notes and tags.
- **What works:** a clear Primary radio per method, Undo when a method is removed, explicit Save.
- **What gets in the way:**
  - The same sticky bar covers the email row and "+ Add email" on phones (`shots/sweep/phone-light/contact-edit.png`).
  - Back is an icon-only square at top right on phones, not the "‹ Contacts"-style back link used elsewhere.
  - Notes and tags are inside the collapsed "Addresses, tags, and notes".
  - A full-width red "Remove" under every method on phones is heavy (CON-35).
- **Verdict: Good, fix details.**

### 2.18 Import wizard `/contacts/import` (`flow-import-1/2/3*`, phone sweep)
- **Owner's job:** bring a customer list in and put the new people into the right Mix.
- **What works:**
  - Three clear steps.
  - Clean files skip mapping.
  - A warning for rows without a phone or email.
  - Duplicates are decided per row.
  - The Mix choice defaults to the New contacts setting (JITM-09 §2.78).
  - The results show counts.
- **What gets in the way:**
  - The sticky action bar floats 86px above the bottom on every width, over "No issues need review", and comes before the Mix choice (CON-06, O11).
  - Implementation copy: "background worker", "Queue 36 valid rows", "Prefer imported" (CON-07, O10).
  - The results page has an unstyled short blue progress bar, lowercase "completed", and a native-looking Recent imports row reading "contacts.csvOct 8…" (CON-08, O12, O13).
  - No next step after the import (known LOOP-06).
  - Every imported person is labeled with the arrival stage "Inquiry", even past customers (CON-21).
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - Review step order: file summary → **New people** (Mix, and stage if Kevin agrees) → issues → preview; the bar becomes static, or sits 18px from the bottom on desktop, and says "Import 36 people".
  - Results: "36 people imported · No Mix", with **Add them to a Mix** (opens the bulk Mix sheet for the batch), Go to Today and View people.

### 2.19 Archived contacts
- **Owner's job:** find and restore an archived person.
- **What works:** search, Restore, and an empty state with one action.
- **What gets in the way:**
  - "Archived customers will stay here…" next to "No archived contacts"; JITM-05 §2.16 allows one word per list.
  - The search placeholder clips at 390px.
  - A chat-bubble icon for the archive (CON-27).
- **Verdict: Good, fix details.**

### 2.20 Duplicates
- **Owner's job:** review likely duplicates and merge them.
- **What works:** an explanation of what merging keeps; shared office lines and inboxes are grouped.
- **What gets in the way:** an unexplained "Archived" header button; "reviewed range" wording; the chat-bubble empty-state icon (CON-27).
- **Verdict: Good, fix details.**

### 2.21 Custom fields
- **Owner's job:** add fields to use in messages.
- **What works:** shows each field's placeholder and the Mixes that use it before delete.
- **What gets in the way:**
  - The name input has only a placeholder ("Policy number") as its label (JITM-10 §2.14).
  - An unexplained "Mixes" header button.
  - "The generated placeholder key remains stable even when the display name changes."
  - "None in your saved plans" uses a retired word (CON-27).
- **Verdict: Good, fix details.**

### 2.22 Add from your phone `/contacts/from-phone`
- **Owner's job:** learn the path for this phone.
- **What works:** short numbered steps; "Import contacts" as the action.
- **What gets in the way:**
  - The back link always says "Add a contact", even when reached from Contact tools or Import.
  - The tips trigger uses the alert (warning) icon.
  - The sweep shows the computer variant ("On Android…" plus iPhone steps) despite the Pixel 7 user agent; per-phone variants are not captured (§7).
- **Verdict: Good, fix details.**

---

## 3. Findings table

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|---|
| CON-01 | JITM-09 §2.77 | Bulk placement is hard to find. The only entry is ••• → Contact tools → "Select contacts". The "16 with No Mix" link, the No Mix filter and Today's No Mix line all lead to a plain list with no action. In selection mode the filled primary is "Message"; Mix is secondary. | `shots/flow-bulk-inquiry-1-tools-sheet.png`, `flow-bulk-inquiry-2-selected.png`, `contacts-nomix-laptop.png`; `src/components/ContactsBulkWorkspace.tsx:181-184,229,254,272` | VERIFIED-RUNTIME + VERIFIED-CODE | HIGH | "Select" in the summary row; a No Mix action strip ("Add to a Mix", "Mark No Mix needed"); Mix as the primary bulk action |
| CON-02 | JITM-09 §2.7 | Stages are called Journey on the profile: section heading "Journey", chip name "Change journey stage: Inquiry", sheet "Journey stage for Carla Chen", notice "Journey stage updated.", and the stage sheet's "View journey" opens the Mix map. JITM-05 §6 lists only three "customer journey" links, not these. | `shots/contacts-laptop-light.png`; `overlays/phone-light/contact-stage-menu.png`; `src/components/ContactProfile.tsx:170,213`; `src/app/(app)/contacts/page.tsx:327`; `src/components/ContactJourneyPanel.tsx:14-15` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM (wording MUST; IAW-01 precedent) | "Stage" everywhere; drop or rename "View journey" in the stage sheet |
| CON-03 | JITM-04 §2.7; JITM-09 §2.76 | After a bulk start, unrelated profiles say "Next: Awaiting follow-up preparation" and "Preparing your follow-ups… Your changes are saved" (Grace Garcia, Kira Kowalski; chip says No Mix). `readPreparationStatus` counts any pending job whose payload has no `contactId`. Bulk jobs list their people in `contactIds`, which this check ignores, though the Mix-status check reads them. Tag and setting changes do the same. Afterwards the docked profile is the first remaining row, someone not in the action. | `shots/flow-bulk-inquiry-4-after.png`, `flow-bulk-estimate-4-after.png`, `flow-tags-after.png`; `src/lib/preparation.ts:11`; `src/lib/contact-mix-actions.ts:155`; `src/lib/contact-mix-status.ts:58`; `src/components/ContactProfile.tsx:233,235`; `src/app/(app)/contacts/page.tsx:312` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Scope to the person (`contactId` or `contactIds` contains); say "awaiting" only when that person has work being prepared; keep the docked person after a bulk action |
| CON-04 | JITM-01 §2.24 (problem: duplication hides History); JITM-07 §2.17 | The same Beats appear up to four times. Connected Mixes repeats the person's name, lowercase "active" and every pending Beat with Review (3 Review buttons for one Mix). "Coming up" and the stage-track links repeat them again on tablet and standalone pages (Hana: Oct 8/10/13 four times). On phones History starts about 1,230 CSS px down (export: about 610). | `shots/sweep/phone-light/contact-marcus-full.png`; `overlays/laptop-light/x-contact-hana-full.png`; `sweep/tablet-light/contact-marcus.png`; `src/components/WorkflowProgress.tsx:19-29,39`; `src/components/ContactProfile.tsx:176-180,252` | VERIFIED-RUNTIME | MEDIUM | One compact Mixes section (2.10); Review only on the Next card |
| CON-05 | JITM-08 §2.7; JITM-04 §2.3 | Four ways to end a person's Mix with unclear differences: "Pause this work"/"Stop this work", "Stop…", "Remove…", plus Today's Stop mix. Stop's dialog: "Future follow-ups from this Mix will be removed." Remove's: "Completed history stays available." Neither says that Stop can be resumed and blocks restarts, while Remove ends the run and allows a later start. | `lanes/crops/CON/more-open-phone-01.png`, `-05.png`; `src/components/ContactProfile.tsx:285`; `src/components/WorkflowProgress.tsx:29`; `src/lib/contact-mix-actions.ts:278-303` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | One "Stop Mix…" with stated consequences, plus Resume; "Pause Mix"; explain or fold in Remove (Kevin decision) |
| CON-06 | JITM-09 §2.78; JITM-08 §2.26 | Import review: the sticky bar (`bottom: 86px` at all widths) floats over "No issues need review" and appears before the "New people and Mixes" choice, which is below the fold. "Queue 36 valid rows" can be pressed without seeing it (default: "Don't add them to a Mix"). Related: JITM-10 §6 import-bar focus risk. | `shots/flow-import-2-review.png`, `flow-import-2-review-full.png`; `src/styles/contact-import.css:17`; `src/components/ContactImportWizardV2.tsx:477-482` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Put "New people" first in the step; static bar on desktop; button "Import 36 people" |
| CON-07 | JITM-04 §2.6; JITM-05 §2.11 | Implementation words in customer copy: "background worker", "Queue 36 valid rows", "Queueing…", "after the import is queued", "Saved configuration 1. Each return keeps its previous visits.", "whole-Mix outcome path", "Prefer imported", "Contacts touched by the selected completed import". | `shots/flow-import-*`; crops `more-open-phone-01.png`; `src/app/(app)/contacts/import/page.tsx:53`; `src/components/ContactImportWizardV2.tsx:424,459,482`; `src/components/WorkflowProgress.tsx:28`; `src/components/WorkflowBusinessUpdate.tsx:60`; `src/app/(app)/contacts/page.tsx:345` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM (wording MUST; VOC-02 precedent) | Copy in §4 |
| CON-08 | JITM-06 §2.28; none (progress styling) | Import results: the native `<progress>` is drawn about 160px wide in browser blue at 100% (styles only target `.import-progress-stage`); status chips lowercase "completed"; the Recent imports row is a native-looking button reading "contacts.csvOct 8…"; no next step (known LOOP-06, JITM-09 §6). | `shots/flow-import-3-results(-full).png`; `sweep/phone-light/contacts-import-full.png`; `src/components/ContactImportWizardV2.tsx:488,490,504`; `src/styles/contact-import.css:53` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW (LOOP-06 itself MEDIUM, prior) | Full-width token progress; "Done"; reset button styles and add the missing space; "Add them to a Mix" + "Go to Today" |
| CON-09 | none (gap); JITM-09 §2.32 | Booking a visit is hidden. The profile's only "Schedule a meeting" link is inside the stage sheet and disappears when the account has no stages. The profile never shows the person's appointments: Carla's History says "Scheduled meeting: Site visit — deck repair." but no date or time appears anywhere. | `overlays/*/contact-stage-menu.png`; `_aria-x.txt` (x-contact-stage); `sweep/laptop-light/contact-carla-full.png`; `src/components/ContactJourneyPanel.tsx:12,22`; `src/components/ContactProfile.tsx:213` (no CalendarEntry read) | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | "Schedule a meeting" in the profile menu; show the next appointment in Next / Coming up |
| CON-10 | JITM-01 §2.16; JITM-08 §2.21 | "Ask for a review" (a product goal) appears only in collapsed More → Preferences, under Do not contact. "Archive contact…" is the first control there, touching "Edit contact". The result panel has two butting primary buttons, never shows the message, and dates the expiry "11/7/2026". | `shots/flow-review-1-ready.png`; crop `more-open-phone-03.png`; `src/components/ContactProfile.tsx:264`; `src/components/ReviewRequestButton.tsx:44-55` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Profile ••• menu item, plus a contextual prompt when the job is done; show an editable message; one primary |
| CON-11 | JITM-04 §2.5 | The review-request message says "How did we do?" (subject "How did we do at {company}?") and produces "— — Alex at Northline Home Services" when the signature already starts with a dash, as the demo's does. | O40 runtime log; `src/app/api/contacts/[contactId]/review-request/route.ts:44-45,52`; `prisma/seed.ts:47` | VERIFIED-CODE (+ lead's runtime log) | MEDIUM | Wording in §4; don't prepend a dash |
| CON-12 | prior MSG-07 (beta audit 2026-09-26), still open | Handoff links use the typed number: profile Text/Call/phone rows (`sms:+1 555 010 1002`) and the review request (`sms:{typed}?body=`). Today uses E.164 + `?&body=`. | `src/components/ContactProfile.tsx:217,219,246`; `src/app/api/contacts/[contactId]/review-request/route.ts:46,51`; `src/lib/phone-dial.ts:34-52` | VERIFIED-CODE; devices NOT RUN | MEDIUM (prior) | `phoneHandoffTarget`/`dialablePhone`, `?&body=` |
| CON-13 | JITM-04 §2.14; JITM-09 §2.32 | No warning for people without a phone or email when starting work. The bulk Mix and Message sheets and the profile's Start sheets check only Do not contact. Hana Hayes (no phone/email) was added, and her Next card offers a primary Review that ends at "Add phone". The import step does warn. | `overlays/*/x-contact-hana(-full).png`; `contact-start-followup.png`; `overlays/phone-light/x-review-nomethod.png`; `src/components/ContactsBulkWorkspace.tsx:254-271`; `src/components/ContactImportWizardV2.tsx:438-441` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Count-and-show line in sheets; "Can't be sent yet" on the Next card |
| CON-14 | JITM-09 §2.11; JITM-08 §2.5, §2.7 | Bulk "Add tag" / "Remove tag" can start or stop tag-based Mixes for the selected people with no warning, confirmation or Undo ("Tag added." / "Tag removed."). The single tag Delete dialog does warn "N Mixes run for this tag's people and will stop for them". | `shots/flow-tags-sheet.png`, `flow-tags-after.png`; `src/components/ContactsBulkWorkspace.tsx:41-44,248-253`; `src/lib/group-actions.ts:139-140`; `src/lib/bulk-contact-actions.ts:71-83`; `src/app/(app)/contacts/page.tsx:334-335` | VERIFIED-CODE; effect INFERRED (demo tags are not Mix audiences) | MEDIUM (HIGH if confirmed at runtime) | Preview the Mix effect; Undo; confirm when a removal stops Mixes |
| CON-15 | JITM-08 §2.26; JITM-10 §2.11 | On phones, Add and Edit contact keep a sticky two-row Cancel/Save bar 84px above the tab bar. It covers fields (Edit: the email row and "+ Add email"; about a third of the screen with the tab bar at 200% text). Calendar and Mix save areas turn static at ≤900. On Add a contact, "First follow-up" is below the bar. | `shots/sweep/phone-light/contact-new.png`, `contact-edit.png`; `shots/text200/contact-new-320.png`; `src/styles/components.css:134,268`; `src/styles/product.css:215`; `src/styles/design-details.css:162,294`; `src/components/ContactForm.tsx:206-211,307-310` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Static save area at ≤900, or one row with a text Cancel; "First follow-up" above the notes on phones |
| CON-16 | JITM-05 §2.3; none (gap) | Two note systems under five labels: History "Add a note" (button "Add update"), persistent "Notes to remember" (collapsed; edited elsewhere via "Edit contact notes"), and the same field as "Message context" (create) and "Notes" (edit). Imported notes such as "Wants a call after 5 pm" are hidden in the collapsed section. | `overlays/phone-light/contact-note.png`; crop `more-open-phone-02.png`; `src/components/ContactTimeline.tsx:145-153`; `src/components/ContactProfile.tsx:258`; `src/components/ContactForm.tsx:200,290`; `src/lib/contact-import-mapping.ts:126,244` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Notes to remember open (3 lines) with inline Edit; one name per concept; "Add note" |
| CON-17 | JITM-09 §2.34; JITM-04 §2.3 | Starting a Mix for one person has four entries and three verbs: "Start a follow-up" twice (Next card, stage header), the No Mix chip ("Start Mix") and More ("Add to a Mix"). Pickers preselect "Aftercare check-in" (alphabetical) and list "Estimate follow-up" twice, identically. "Schedule a one-time follow-up" sends you to the Contacts list in selection mode with "Message 1 person", then to Today. | `shots/contacts-laptop-light.png` (crop `aaron-two-start-followups.png`); `overlays/laptop-light/contact-start-followup.png` + `_aria.txt`; `src/components/ContactProfile.tsx:156-168,233,282`; `src/components/ContactsBulkWorkspace.tsx:106`; `src/lib/bulk-contact-actions.ts:231` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | One "Add to a Mix"; no preselection (or the setting's Mix); tell duplicate names apart; a one-time follow-up sheet on the profile |
| CON-18 | JITM-08 §2.10; JITM-06 §2.16; JITM-10 §2.2 | Contact tools mixes flat rows with a whole tag manager (form, native color input, show/hide, delete, Save tags). The name placeholder clips ("Kitchen rem"); the "Color" label is 12px; on phones "TAGS" is uppercase (legacy rule). Saved views are not here (corrects O19). | `shots/flow-bulk-inquiry-1-tools-sheet.png`; `overlays/phone-light/contacts-tools.png`; `src/components/ContactsBulkWorkspace.tsx:181-213`; `src/styles/components.css:161-163,340` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Flat rows only; a "Manage tags" sheet or page |
| CON-19 | none (gap); JITM-08 §2.26 | Filter sheet: a stray "0" renders whenever no search or filter is active (`(query \|\| activeFilterCount) &&`). At 1440 the five selects share one row and clip ("All pri", "Everyon"). | `overlays/phone-light/contacts-filter.png`; `overlays/laptop-light/contacts-filter.png` + `_aria.txt` (`text: "0"`); `src/components/ContactsBulkWorkspace.tsx:160-171` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | `activeFilterCount > 0`; two-column grid |
| CON-20 | JITM-01 §2.11 | "No stage" is shown on every row and as a profile chip even when the account has no Contact stages. The chip then opens a sheet whose only content is "Set up your customer journey…". | `src/components/ContactsBulkWorkspace.tsx:239`; `src/components/ContactProfile.tsx:213`; `src/components/ContactJourneyPanel.tsx:12` | VERIFIED-CODE; runtime NOT RUN | MEDIUM | Hide stage text and chip until stages exist |
| CON-21 | none (gap; follows D55/D68) | Imports put every new person into the arrival stage. All 36 imported rows read "Inquiry", including CSV rows whose notes say "Past customer, happy with the porch". The review step asks for a Mix but not a stage. | `shots/contacts-nomix-laptop.png`; `data/contacts.csv`; `src/lib/journey.ts:135` | VERIFIED-RUNTIME | MEDIUM | Kevin decision: "Stage for new people" in import review |
| CON-22 | JITM-06 §2.24, §2.23; JITM-10 §2.1 | Selection mode on phones: tapping the row (outside the 44px checkbox) follows the profile link and discards the selection. Bulk labels are hidden at ≤900, so Tags shows only the Contacts "people" icon and "Message" is an icon-only primary. | `src/components/ContactsBulkWorkspace.tsx:235-238,248,272`; `src/styles/contacts-bulk.css:63`; `src/styles/contacts-workspace.css:35,60` | VERIFIED-CODE; runtime NOT RUN | MEDIUM | A row tap toggles in selection mode; labeled two-row bar; a tag icon |
| CON-23 | JITM-07 §2.9 | The desktop bulk bar spans both panes, covering the profile's lower sections. The directory reserves no space for it at ≥901 (`.page:has(.bulk-contact-bar)` padding applies ≤900 only), so pagination for more than 50 people sits under it. O20 corrected: the last row can scroll clear above the bar. | `shots/probe-bulkbar-overlap.png`; `src/styles/contacts-bulk.css:10`; `src/styles/product.css:223`; `src/styles/contacts-workspace.css:63,164` | VERIFIED-RUNTIME (overlap) + INFERRED (pagination, CSS arithmetic) | LOW | Bar inside the directory pane at ≥1200, or reserve padding |
| CON-24 | JITM-10 §2.1 | Selection-mode "Done" is an unstyled native button (about 46×24): `.contact-inline-action` is styled only inside the profile. | `shots/probe-bulkbar-overlap.png`; `src/components/ContactsBulkWorkspace.tsx:229`; `src/styles/contacts-workspace.css:68` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Shared text button |
| CON-25 | JITM-04 §2.7 | Bulk confirmations omit the "when" and the "what". "New project inquiry started for 12 people." All 12 first follow-ups were already due "Earlier today, 10:00 AM" (red on every row). "Tag added." names neither the tag nor the count. | `shots/flow-bulk-inquiry-4-after.png`; `sweep/phone-light/contacts.png`; `src/lib/contact-mix-status-labels.ts:47-61`; `src/app/(app)/contacts/page.tsx:334` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Copy in §4 |
| CON-26 | JITM-10 §2.1, §2.2 | Profile targets and text below the floor. Phones: "View journey" 95×24, "Stop this work" 110×24, More → Mixes link 185×24. Desktop: "History options" 36×28, "Start a follow-up" 124×28, stage chip 30px. 12px meaningful text: detail labels ("Mobile", "Work", "phone", "email", "address") and the Connected Mixes Beat lines. Native checkboxes squished to 8×20 / 8×13. The profile is outside the text-floor test (known coverage gap, JITM-10 §6). | `shots/sweep/{phone-light,phone320-light,tablet-light,laptop-light}/_results.json` (contact-marcus, contact-carla); crop `more-open-phone-03.png` | VERIFIED-RUNTIME (metrics) | MEDIUM | 44px at ≤900; 13px labels; fixed-width checkbox column |
| CON-27 | JITM-05 §2.16, §2.10, §2.13; JITM-10 §2.14; JITM-06 §2.23 | Secondary pages:<br>• Archived mixes "customers" and "contacts" for one list, and its search placeholder clips.<br>• The custom-field name input has only a placeholder.<br>• Unexplained header buttons: "Archived" on Duplicates, "Mixes" on Custom fields.<br>• "None in your saved plans" uses a retired word.<br>• Chat-bubble icon on archive/duplicate empty states; alert icon for iPhone tips.<br>• From phone's back link always says "Add a contact". | `shots/sweep/phone-light/contacts-archived.png`, `contacts-duplicates-full.png`, `contacts-custom-fields-full.png`, `contacts-from-phone-full.png`; `src/app/(app)/contacts/archived/page.tsx:66,68`; `custom-fields/page.tsx:48,52,54,65`; `duplicates/page.tsx:52,55`; `from-phone/page.tsx:31`; `src/components/IphoneAddTips.tsx:18` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Copy and icons in §4 |
| CON-28 | JITM-07 §2.2 | The stage track renders twice (main column and inside More, swapped by CSS at 600px), each with its own "Start a follow-up" sheet. On phones it lives inside collapsed More. | `src/components/ContactProfile.tsx:256,263`; `src/styles/contacts-workspace.css:160,210-212` | VERIFIED-CODE | LOW | Render once |
| CON-29 | JITM-10 §2.3 | At 200% text on 320px the profile name stays 24px (px-sized) while the rest doubles, and the Next card's last Beat date clips to "Oct". | `shots/text200/contact-marcus-320.png`; `src/styles/contacts-workspace.css:198` | VERIFIED-RUNTIME | LOW | rem-based size; let the track wrap |
| CON-30 | JITM-04 §2.4; JITM-05 §2.11 | Raw values reach the screen:<br>• Dates show "none" (recurrence enum).<br>• "Which work changed?" shows "Estimate follow-up · Oct 6, 12:00 AM" (a start date printed as midnight).<br>• Status words are lowercase ("active", "pending", "completed").<br>• The callback notice prints the IANA zone in parentheses. | crops `more-open-phone-01.png`, `-03.png`; `src/components/ContactProfile.tsx:269`; `src/components/WorkflowBusinessUpdate.tsx:54,57`; `src/components/WorkflowProgress.tsx:19,28`; `src/components/ContactImportWizardV2.tsx:488,504` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Words and date-only values (§4) |
| CON-31 | JITM-02 §2.12; JITM-04 §2.2, §2.11 | Personal-tool framing and wordplay in controls:<br>• empty state "Make time for your circle. Add a customer, a friend, or someone you would like to know better." (O26);<br>• "Keep this connection in the mix with a series of thoughtful Beats.";<br>• "Restore a relationship…". | `src/components/ContactsBulkWorkspace.tsx:244`; `src/components/ContactProfile.tsx:281`; `src/app/(app)/contacts/archived/page.tsx:65` | VERIFIED-CODE (empty state not captured) + VERIFIED-RUNTIME (Mixes copy) | LOW | Copy in §4 |
| CON-32 | JITM-08 §2.6 | Disabled Text/Email/Call give their reason in `title` only; the visible hint is not linked with `aria-describedby`. | `src/components/ContactProfile.tsx:217-222` | VERIFIED-CODE | LOW | Link the hint |
| CON-33 | JITM-08 §2.21 | Note jumps to a composer far down History (below Connected Mixes on phones). "Add a note" is repeated as summary and label, and the button says "Add update". "History options" is a sheet holding three chips and "Refresh". | `overlays/phone-light/contact-note.png`, `contact-history-menu.png`; `src/components/ContactTimeline.tsx:138-153` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Note bottom sheet on phones; inline filter chips |
| CON-34 | JITM-07 §2.8 | Edit contact on phones: Back is an icon-only square at top right ("Back to Contact" hidden), unlike the "‹ Contacts" back link on other Contacts sub-pages. Notes sit inside the collapsed "Addresses, tags, and notes". | `shots/sweep/phone-light/contact-edit.png`; `src/app/(app)/contacts/[contactId]/edit/page.tsx:42`; `src/components/ContactForm.tsx:248` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Back link "‹ Marcus Reed"; notes outside the disclosure |
| CON-35 | JITM-04 §2.8; JITM-05 §2.3 | The bulk "Message" button schedules one-time follow-ups on Today (default "Now"), not messages. The channel list says "Phone call" (elsewhere "Call"). | `src/components/ContactsBulkWorkspace.tsx:272-284`; `src/lib/bulk-contact-actions.ts:195-207` | VERIFIED-CODE | LOW | "Follow up" / "One-time follow-up for N people"; "Call" |

**Lead observations, checked:**

| Observation | Result |
|---|---|
| O10 | TRUE (CON-07) |
| O11 | TRUE; mechanism: `bottom: 86px` at all widths (CON-06) |
| O12 | TRUE; styles target a different class (CON-08) |
| O13 | TRUE (CON-08) |
| O14 | Known: LOOP-06, JITM-09 §6 |
| O15 | TRUE but LOW; the export has no add icon |
| O16 | TRUE (CON-17, CON-02) |
| O17 | TRUE; on accounts with Journey connections, Mix work also shows as Connected Mixes (CON-04) |
| O18 | TRUE but by design (JITM-09 §2.76). "No stage" on those rows was a transient state before the worker's stage pass: `contacts-nomix-laptop.png` shows all "Inquiry" a few minutes later (see CON-21) |
| O19 | Partly wrong: saved views are in the Filter sheet (CON-18) |
| O20 | Partly wrong: the last row can scroll clear; the real issues are the cross-pane overlap and no reserved space (CON-23) |
| O21 | TRUE (CON-24) |
| O22 | TRUE for "Message" as primary and "Phone call". WRONG that review has no WhatsApp: the handoff supports "Open WhatsApp" (`src/components/EditableFollowUpAction.tsx:41,58`) |
| O23 | TRUE (CON-02) |
| O24 | TRUE (`src/lib/journey.ts:135`) |
| O25 | Not a per-person state: a mis-scoped preparation check (CON-03) |
| O26 | TRUE (CON-31) |
| O27 | TRUE (CON-18) |
| O40 | TRUE: link format is prior MSG-07 (CON-12); "— —" and "we" are new (CON-11) |
| O41 | TRUE (CON-10) |
| Coordinator's "Schedule a meeting" note | TRUE (CON-09) |

---

## 4. Copy findings

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

## 5. Structural recommendations (ranked)

1. **Make Mix placement a visible list action** (CON-01, CON-22, CON-35).
   - **Problem:** people with No Mix (Today's line, an import) can only be placed in bulk through a hidden "Select contacts" row, and the bar promotes "Message".
   - **Change:** a "Select" text button in the summary row. With the No Mix filter on, a strip reading "{n} people have No Mix", with "Add to a Mix" (primary) and "Mark No Mix needed"; each opens selection with the page selected and the sheet open. Bulk bar order: Add to a Mix · Tags · Follow up · Export · Archive. Labels stay on phones, and a row tap toggles in selection mode.
   - **Benefit:** placing 16 imported or No Mix people becomes about 3 visible taps instead of a hidden 6-step path.
   - **Effort:** S–M. **Kevin decision:** yes, small (adds controls the export doesn't have; D20 allows it for this problem).
2. **One Mixes section and a profile menu** (CON-04, CON-05, CON-10, CON-17, CON-09).
   - **Problem:** duplicate Beats and Review buttons, four ways to start and four to stop, goal actions buried in More, booking hidden in the stage sheet.
   - **Change:** header ••• menu: Edit · Ask for a review · Schedule a meeting · Do not contact · Archive…. Below the Next card, a "Mixes" section with one row per Mix (name, next date, status word) and a row menu (Record an update, Pause Mix, Stop Mix…, Remove…, Open in Journey), plus "Add to a Mix" at its end. Review only on the Next card. More keeps Dates (with the Mix named), Priority/Prefers and Custom fields.
   - **Benefit:** History returns to roughly the export's position, each action has one home, and Stop means one thing.
   - **Effort:** M–L. **Kevin decision:** yes (structure change; also confirm the Stop vs Remove semantics).
3. **Import review asks the placement question first and continues afterwards** (CON-06, CON-07, CON-08, CON-21; LOOP-06).
   - **Problem:** the Mix choice sits after a floating "Queue" button, imported people all become "Inquiry", and the results page ends without a next step.
   - **Change:** order the step as summary → New people: Mix (and stage, if Kevin agrees) → issues → preview, with a static bar reading "Import 36 people". Results offer "Add them to a Mix" (bulk sheet for the batch) and "Go to Today".
   - **Benefit:** the import becomes a placement workflow, not a data drop.
   - **Effort:** S–M. **Kevin decision:** yes for the stage choice (D55/D68); the rest no.
4. **Truthful profile states** (CON-03, CON-13).
   - **Problem:** unrelated people show "Awaiting follow-up preparation", and unreachable people show a primary Review.
   - **Change:** check preparation per person (`contactId` or `contactIds`); profile wording ("Getting {name}'s follow-ups ready…"); "Can't be sent yet: add a phone number or email" on the Next card, with counts in the start sheets.
   - **Benefit:** fewer false impressions right after bulk work.
   - **Effort:** S. **Kevin decision:** no.
5. **Notes you can see** (CON-16).
   - **Problem:** imported or persistent notes are collapsed, and five labels name two note types.
   - **Change:** "Notes to remember" open (first 3 lines) with inline Edit; History notes stay "notes", with an "Add note" button; one field name across forms.
   - **Benefit:** call context ("after 5 pm") is visible before calling.
   - **Effort:** S–M. **Kevin decision:** no (D-level naming only if the glossary changes).
6. **Tools sheet is navigation; tags are managed elsewhere and bulk tags explain their effect** (CON-18, CON-14).
   - **Problem:** a long mixed sheet, and silent Mix starts or stops.
   - **Change:** flat rows plus a "Manage tags" sheet or page; the bulk tag sheet previews Mix effects; notices with Undo.
   - **Effort:** M. **Kevin decision:** no.
7. **Phone forms and notes** (CON-15, CON-33).
   - **Problem:** sticky save bars cover fields and the first-follow-up decision; Note jumps far down the page.
   - **Change:** static save area at ≤900 (as Calendar and Mix do), "First follow-up" above the notes, Note as a bottom sheet.
   - **Effort:** S. **Kevin decision:** no.
8. **Stage vocabulary and visibility** (CON-02, CON-20, CON-28).
   - **Problem:** stages are called Journey, and appear even when unused.
   - **Change:** "Stage" labels; a one-tap stage list; hide stage UI until stages exist; render the track once.
   - **Effort:** S. **Kevin decision:** no (D4/D16 already decided).
9. **Optional (Kevin decision): Text/Call from the profile when a follow-up is due.**
   - **Problem:** texting Marcus from his profile neither uses the prepared message nor records anything, so the overdue follow-up stays open.
   - **Change:** when a follow-up is due, Text and Call open its review; otherwise, on return, offer "Log this conversation?".
   - **Effort:** M.

---

## 6. Documents that disagree, and gaps

**Disagreements:**
- **"Journey" for the stage track.**
  - The export (`shots/export/DesktopContacts.png`: "Journey … Start a touchpoint") and `docs/design/DESIGN_GUIDELINES.md:28,64` ("current journey stage", "The personal Journey shows recorded changes", "Start a touchpoint") disagree with JITM-09 §2.7 (owner decisions D4/D16) and JITM-05 §2.10 ("touchpoint" retired).
  - The code renamed "touchpoint" but kept "Journey". The owner decision should win: update the guidelines and treat the export label as history.
- **JITM-05 §6's known-deviation list** names three "customer journey" links but not the profile heading, the stage-chip name, the sheet title or the "Journey stage updated." notice.
- **JITM-08 §2.26** says only Calendar and Mix save areas scroll with the form at ≤900. Its MUST ("Sticky save bars MUST NOT cover fields") is broken by the contact form (`src/styles/components.css:268`). Extend the rule's examples to every form save bar.
- **"Add a person" vs "Add a contact".** JITM-09 §2.33 calls the page "Add a person"; the page H1 and Contact tools say "Add a contact"; JITM-06 §2.23 says the person-plus icon means "add a contact".
- **Two definitions of "being prepared for this person".** `src/lib/preparation.ts:11` ignores `contactIds`; `src/lib/contact-mix-status.ts:56-61` reads them.
- **The lead's notes vs code:** O19 (saved views live in Filter), O20 (the last row can scroll clear) and O22 (WhatsApp is handled at handoff) are partly wrong; see the observation table in §3.

**Prior findings still open at f23db11:**
- MSG-07: typed-number links (CON-12).
- F12 (`docs/audit-2026-09-24/contacts.md:121`): every phone list load renders the hidden docked profile (`src/app/(app)/contacts/page.tsx:381`), including its 15-second Journey poll.
- LOOP-06: nothing leads on from an import.

**Gaps where no rule exists:**
- How bulk selection is entered and found, and which bulk action is primary.
- Whether a contact profile shows the person's appointments and offers booking.
- Which stage imported people get, and whether import shows or asks it.
- Default selection in Mix pickers (bulk, profile and Dates' "first active Mix"); how duplicate Mix names are told apart.
- How many places may start or stop a Mix for one person.
- The glossary has "note, private note" but not History notes vs Notes to remember.
- Whether profile Text/Call handoffs should record anything.

---

## 7. Captures needed / NOT RUN

All of these are NOT RUN: lane constraints say no browsers.

| Capture | Route and steps | Needed for |
|---|---|---|
| Phone bulk mode | 390×844: `/contacts?mix=no-mix` → ••• → Select contacts → tick 3 → screenshot the bar; open Tags, Mix and Message sheets; tap a row's name in selection mode | Labels, row tap, bar vs last row (CON-22, CON-23) |
| No Mix chip sheet | Profile of anyone with No Mix (e.g. `/contacts?mix=no-mix` → first row) → tap "No Mix ⌄". The `contact-nomix-menu` overlay produced no file because Hana had joined a Mix | 2.12 |
| Stage-less account | Riley's account (`cap/state-riley.json`): `/contacts`, a profile, the stage chip | CON-20 |
| Tag-audience Mix | Set a Mix's audience to a tag, then bulk "Add tag"/"Remove tag" on 2 people; check Today and the profiles | Runtime effect of CON-14 |
| Notes deep link | `/contacts/demo_contact_marcus/edit#contact-notes`: does the closed "Addresses, tags, and notes" disclosure open? | CON-34 |
| Add from your phone | `/contacts/from-phone` with real iPhone and Android user agents (the sweep showed the computer variant despite the Pixel 7 user agent; cause not established) | 2.22 |
| Devices | Profile Text/Call and the review request on a physical iPhone and Android | MSG-07 device behaviour (CON-12) |
| Review message | Ask for a review on a phone; copy the message text | Runtime text for CON-11 (only the lead's log was available) |
| Import on a phone | 390: the review step with the sticky bar, and a file with duplicates/invalid rows (dedupe cards) | CON-06, phone variant |
| Empty Contacts | A new account's `/contacts` | CON-31 empty-state copy |
| Keyboard | Focus after opening each Contacts sheet (JITM-08 §2.12), Tab order through the profile, focus with the phone keyboard open under the sticky form bar | JITM-10 §2.11 |
| 200% text | The import wizard and the bulk bar | JITM-10 §2.3 |
