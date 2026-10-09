> Lane report DSN (Design-system consistency and drift) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# DSN: design-system and interaction consistency (signed-in app)

Lane DSN · audited commit `f23db11` (production `dae3fab` plus docs) · worktree the repository was read only.

Paths: screenshot paths are relative to `<captures>`. My crops are in `lanes/crops/DSN/`. Code paths are repo-relative.

Severity follows JITM-17 §2.14 and evidence labels follow JITM-12 §2.1. How I applied severity:
- **HIGH:** a rule written with MUST is broken on a daily owner path, and it changes what the owner reads or can do.
- **MEDIUM:** a MUST or declarative rule is missed in a way that affects reading or operating.
- **LOW:** polish and consistency, including cosmetic misses of a rule.
- JITM-10 §2.1 and §2.2 carry no RFC keyword (see §6), so size misses are capped at MEDIUM.

---

## 1. Lane summary

**Verdict.** At the token and shell level the app is one system:
- one palette with complete dark values;
- one type pair;
- one sheet shell: heading, 44px close, scrim with 3px blur, bounded height with its own scroll;
- Cancel-first confirmations;
- dark mode that themes every captured route, with no light leftovers.

At the control and formatting level it is **not** one system. The same job is drawn differently from screen to screen:
- Mutually exclusive choices use six different "selected" looks, and one of them shows no state at all.
- Each list screen puts search and filters somewhere else.
- Dates, times, timezones and statuses are formatted per screen: "2026-10-09 14:00", "09:00–17:00", "10:00 AM", and a raw "America/New_York" printed beside "New York".
- Disclosures put their chevron in three different places.
- 159 CSS declarations on owner screens set text below 13px.

The owner pays most on Today and Calendar:
- **Today:** the "Review" label is clipped on the Next-up card, the draft field is oversized and shows a resize grip, and the layout modes show no visible state.
- **Calendar:** raw timezone ids, a 12px agenda, and visit outcomes hidden inside a collapsed section.

**The changes that would most improve the workflow:**
1. **One display formatter** for times, dates, timezones (as city names), statuses and channel names, used everywhere (DSN-01 to 03; JITM-11 §2.15).
2. **One family of selection controls:** the export's segmented control for views, one chip style for filters, and never a primary fill to mean "selected" (DSN-04; this resolves the JITM-06 §6 chip question).
3. **One list-header pattern:** a search field with a filter button and count, on Today, Contacts, Mixes, Marketplace, Journey and contact History. Today's layout modes become a visible control or are removed (DSN-05).
4. **A floor pass with an automated guard:** 13px text and 44px phone targets on Calendar, the review rhythm, the rail, text buttons and chips. Extend the sweep to Calendar, Journey, Marketplace and open overlays (DSN-07, DSN-08).
5. **Shared anatomy fixes:**
   - Quick Add fills the screen on phones.
   - Close buttons align to the top.
   - One checkbox-card.
   - Native buttons and the progress bar are restyled.
   - Visit outcomes and the latest note come out of collapsed disclosures (DSN-09 to 12).

---

## 2. Page and overlay verdicts

### 2.0 Is it one coherent system? Inconsistencies ranked by how often an owner meets them

| Rank | How often | Inconsistency | Findings |
|---|---|---|---|
| 1 | Every session | Today's anatomy: "Review" caption clipped on the Next-up card; oversized draft with a resize grip; search and filter entry unlike any other list; layout switch with no visible state. | DSN-06, DSN-28, DSN-05, DSN-04 |
| 2 | Daily | The time on Today ("10:00 AM") is written differently on the Undo card ("Oct 10, 10:00 AM"), in the Quick Add review ("2026-10-09 14:00") and on Calendar ("America/New_York" beside "New York"). | DSN-01, DSN-02 |
| 3 | Daily | Choosing between views or filters looks different on every screen. | DSN-04 |
| 4 | Daily | Search and filters live somewhere different on each list. | DSN-05 |
| 5 | Daily | 12px text in the Calendar agenda, the review rhythm dates and the desktop rail. | DSN-07 |
| 6 | Daily and weekly | Overlay types differ:<br>- the row menu is laid out unlike the other tools sheets;<br>- Quick Add is a half-height sheet with no grabber;<br>- phone confirmations are centred cards with a floating close button. | DSN-10, DSN-14 |
| 7 | Per appointment, per call | Primary content is collapsed: visit outcomes, contact notes, the contact finder. | DSN-09 |
| 8 | Weekly | Raw enum labels ("active", "sms") and "Call" vs "Phone call". | DSN-03 |
| 9 | Weekly | Disclosure chevrons in three positions; filled FAQ bands. | DSN-15 |
| 10 | Setup, import, settings | Run-together labels, squeezed checkboxes, unstyled native buttons, a stray "0". | DSN-11, DSN-12, DSN-20 |
| 11 | Occasional | Back controls, icon meanings, uppercase labels, the compact-rail "Profil/e" wrap. | DSN-16 to 19 |
| 12 | Rare or invisible | The dark-only More panel; empty-state bubble tails; the sheet's five style owners. | DSN-26, DSN-27, DSN-29 |

Where it costs trust:
- the clipped Next-up action (it looks broken on the most important card);
- the ISO date and the 24-hour clock on the screens where the owner confirms a scheduled time;
- "Awaiting follow-up preparation" shown on a person who is not in a Mix (O25; Contacts lane);
- native grey buttons and the stray "0" on Contacts.

### 2.1 Shared sheet shell (`Sheet.tsx`: tools, filter, search, glossary, profile, saved-view and bulk sheets)

**Purpose.** One way to put a focused task or menu over the current screen.

**What works.** These hold in every sheet captured, for example `shots/overlays/phone-light/mixes-filter.png`, `x-marketplace-filter.png`, `shots/flow-tags-sheet.png` and `shots/flow-bulk-inquiry-3-mix-sheet.png`:
- Native `<dialog>` with one h2 at 18/700 (`popups.css:6-8`) and a 14px `--text-2` description (`popups.css:10`).
- 44px round close on `--surface` (`design-details.css:5-6`).
- `--scrim` with a 3px blur in both themes (`popups.css:4`).
- Height bounded to `min(82dvh, 720px)` with its own scroll (`product.css:5`).
- On phones: a bottom sheet with grabber and safe-area padding (`popups.css:22-28`).
- Opening focuses the heading (`Sheet.tsx:39-48`).
- Mounted on first use and kept mounted, so drafts survive.

**What gets in the way.**
- **The close floats.** The close button is centred on the whole heading block. With a long title or description it sits beside the paragraph instead of the title (`design-details.css:4`, `popups.css:11`; `shots/flow-inv-4-confirm.png`).
- **Five style owners.** The shell is styled in five places:
  - geometry in legacy `product.css:3-13`;
  - surface, radius and a literal backdrop in `design-system.css:67-70`;
  - a dead 20px/600 title in `design-details.css:8`, which loses to `popups.css` only because of load order (DSN-29);
  - plus `popups.css` and `design-workspaces.css`.
- **Pickers copy the shell.** WhenPicker (`WhenPicker.tsx:258-263`) and TimezonePicker (`TimezonePicker.tsx:87-97`) copy the markup instead of using `Sheet`. Each focuses something different: the selected day, the search field, or the heading.

**Verdict:** Good, fix details.

**Recommended structure.**
- Align the close to the title's first line.
- Make `popups.css` the only owner and delete `design-details.css:8`.
- Render both pickers through `Sheet` with a documented initial-focus option.

### 2.2 Today review (bottom sheet below 768px, docked pane from 768px)

**Purpose.** Read, adjust and hand off one follow-up, then record what happened (JITM-08 §2.1).

**What works.**
- It follows the export's order: person, then Mix and rhythm, wording, channel, handoff with Copy, outcomes (`lanes/crops/DSN/export-main-review-qa.png` vs `shots/sweep/phone320-light/today-review.png`).
- The channel choice is the export's segmented control (`design-workspaces.css:254-256`).
- Unavailable channels show their reason.
- From 1200px, Snooze and Skip Beat sit beside the heading exactly at the breakpoint (`lanes/crops/DSN/tr1200-head.png`).

**What gets in the way.**
- **Oversized draft field.** The draft keeps a 190px minimum on desktop (`design-workspaces.css:119`) and the native resize grip (`base.css:168`). A two-line message sits in a large empty violet block with a grip in its corner (`shots/probe-today-laptop-light.png`; O4). The bubble no longer reads as one surface (JITM-06 §2.20).
- **Generic subtitle.** The line under the name says "Follow-up"; the export puts the Mix name there.
- **Raw timezone.** The snooze helper prints "America/New_York".

**Verdict:** Good, fix details.

**Recommended structure.**
- Size the draft to its content: at least 3 lines on phone and 4 on desktop, `resize: none`, growing as the owner types.
- Use the Mix name as the subtitle.
- Write the timezone as "New York time".

### 2.3 Today row menu ("Follow up with {name}") and the nested Snooze sheet

**Purpose.** Quick moves on one row without opening the review: Mark done, Snooze, Skip Beat, Stop Mix.

**What works.**
- Snooze presets are one tap.
- Stop Mix is a danger action behind a confirmation.
- The nested Snooze sheet stays above the review (JITM-08 §2.14; `shots/overlays/phone-dark/today-review-snooze.png`).

**What gets in the way.** It is the only per-item sheet that is not a flat list (`shots/overlays/laptop-light/_aria.txt:1-21`; `lanes/crops/DSN/ovdark-01.png`). Top to bottom it holds:
- an h3 "Already finished?" and a "Mark done" button sized to its text;
- an h3 "Snooze" and four chips;
- a date trigger and a full-width "Snooze to this day";
- a "Skip Beat" button sized to its text;
- a full-width red "Stop Mix…".

Contact tools, Mix tools and Profile are flat rows with leading icons (JITM-08 §2.10). Here the button widths change from row to row, so the thumb never has one column to reach for.

**Verdict:** Good, fix details.

**Recommended structure.** Full-width rows with leading icons:
1. ✓ Mark done.
2. Snooze, with the presets as one chip row under it.
3. Choose a day, which opens the WhenPicker.
4. Skip Beat.
5. Stop Mix…, as danger text, last.

### 2.4 Confirmations (`ConfirmDialog`, `useConfirmDialog`)

**Purpose.** Stop the owner before a destructive or consequential action.

**What works.** The contract holds (`ConfirmDialog.tsx:31`; `useConfirmDialog.tsx:30-36`; `shots/flow-inv-4-confirm.png`, `shots/overlays/phone-dark/today-stopmix.png`):
- one heading that asks a question, plus text naming the effect;
- Cancel first, with initial focus;
- a danger or primary action;
- 44px buttons and a 44px close.

**What gets in the way.**
- **Only centred overlay on phones.** Every other phone overlay rises from the bottom. Here the buttons are sized to their text and right-aligned mid-screen, away from the thumb.
- **Floating close.** The close sits beside the description.
- **Mid-word break.** An email address in the title breaks mid-word ("riley.newowner@example.te / st?") because headings use `overflow-wrap: anywhere` (`design-details.css:7`).

**Verdict:** Good, fix details.

**Recommended structure.**
- Below 768px, anchor confirmations to the bottom with full-width or equal-width Cancel and action buttons.
- Align the close to the top.
- Keep confirmations centred on desktop.
- Use `overflow-wrap: break-word` for headings.

### 2.5 ReviewDialog

**What the code shows.** A header with h2, description and a 44px close; focus on "Keep editing"; Tab stays inside (`ReviewDialog.tsx:17-45`). Its geometry still lives in legacy `product.css:116-129`.

**Verdict:** NOT RUN visually; no capture shows it open. The code matches JITM-08 §2.9.

### 2.6 Quick Add

**Purpose.** Capture a person, note, event and follow-up from any screen.

**What works.**
- The shared header (JITM-08 §2.13).
- The Newsreader capture field.
- Speak, with its speech-service disclosure.
- One review row per item, then "Save all 3" (`shots/ov-qa-4-review-bottom-phone-light.png`).

**What gets in the way.**
- **Not full screen.** On phones it is a bottom sheet with a 640px minimum height, not full screen (`design-system.css:116`; JITM-08 §2.11; O32).
- **No grabber.** It is not a `.sheet`, so it has no grabber and looks like a bottom sheet missing the handle every other sheet has (`shots/overlays/phone-light/x-quickadd-other.png`).
- **Raw formats.** The review shows "Follow up / 2026-10-09 14:00 · Edit" and "Dates and times use America/New_York." (O33).
- **Wrong icon.** "New person" and "Add a person" use the people icon. The export and JITM-06 §2.23 reserve person-plus for adding a contact (`QuickAdd.tsx:183`).
- **Another tile style.** "Other ways to add" uses icon-over-label tiles, a pattern no other sheet uses.

**Verdict:** Good, fix details.

**Recommended structure.**
- Fill the screen below 768px, with a sticky header and footer.
- Write review times as "Fri, Oct 9 at 2:00 PM".
- Use person-plus for "New person".
- Replace the tiles with flat rows with leading icons.

### 2.7 WhenPicker

**Purpose.** Pick a date and time, with business shortcuts.

**What works** (`shots/flow-cal-whenpicker-open.png`).
- Friendly trigger labels: "Tomorrow, Oct 9", "9:00 AM".
- Quick chips.
- Today is outlined and the chosen day is filled, so the state is not shown by colour alone.
- 44px day cells and an arrow-key grid.

**What gets in the way.**
- **Two closes:** X in the header and "Done" beside the Date/Time tabs (`WhenPicker.tsx:209`, `:260`).
- **Another segmented look:** the Date/Time switch is a bordered pill track (`when-picker.css:21-23`).
- **Own chevrons:** its own chevron SVGs (known, JITM-06 §6).
- **Faint triggers.** Triggers are outlined with `--line`, fainter than the `--field-border` selects beside them in the same form (`when-picker.css:7` vs `design-system.css:9`; `lanes/crops/DSN/cal1280-editor.png`).
- **Small text.** Weekday initials are 11.5px uppercase at weight 750, slot captions 11.2px and the legend 12.5px (`when-picker.css:37,48,56`).
- **No stripes.** Buffered slots cannot show stripes, because both gradient stops resolve to `--surface` (`when-picker.css:54`; `design-tokens.css:40-41`). This is VERIFIED-CODE.

**Verdict:** Good, fix details.

**Recommended structure.**
- One close: keep X, and let picking a time close the picker.
- Use the shared segmented control for Date/Time.
- Outline triggers with `--field-border`.
- Set captions to 13px.
- Draw the stripes from two distinct tokens.

### 2.8 TimezonePicker

**What the code shows.** Current zone first, a "Selected" label, "Use device timezone", and city names via `cityLabel()` (`TimezonePicker.tsx:24-26,85-93`). This is the reference picker named in JITM-08 §2.28. I did not see it open (NOT RUN).

**Why it matters here.** Its friendly `cityLabel()` is private to the picker. That is why other screens print raw IANA ids (DSN-02).

**Verdict:** Optimal. Export the label helper.

### 2.9 Contact tools sheet

**Purpose.** Secondary Contacts destinations, selection mode, adding from the phone, tags.

**What works.** Eight destinations as flat rows with leading icons (`shots/flow-bulk-inquiry-1-tools-sheet.png`).

**What gets in the way.** Three different layouts in one sheet:
1. flat rows;
2. a card-style "Add from phone contacts" row;
3. a four-column tag form, with:
   - a placeholder that clips ("For example, Kitchen rem");
   - a "Color" label at 12px/750 beside 16px labels (`components.css:161-163`; O27);
   - a native colour input.

"Select contacts", which switches a mode, sits among navigation links (O19).

**Verdict:** Needs rework. The structure is the Contacts lane's call; my view is to split the sheet by job.

**Recommended structure.**
- Flat rows only, with "Select contacts" first.
- "Tags" opens its own sheet, with one field per row and a row of named swatches built from tokens.

### 2.10 Filter sheets (Today, Contacts, Mixes, Marketplace) and History options

**Purpose.** Narrow a list.

**What works.** Behaviour follows D9 (JITM-08 §2.29): Today and Contacts apply at once and say so; Mixes and Marketplace keep "Apply filters" and say so (`shots/overlays/phone-light/mixes-filter.png`, `x-marketplace-filter.png`).

**What gets in the way.**
- **Entry differs on every screen (DSN-05):**
  - Today: a search icon that opens a one-field sheet, plus a separate "Filter" button;
  - Contacts, Mixes and Marketplace: a sliders icon inside the search field;
  - Journey: inline selects;
  - Calendar: a "Find a date or event" disclosure;
  - contact History: "•••" opens the filter.
- **Hidden layout modes.** Today's Filter sheet also holds the layout modes "Focused work / Compact scan / Review overdue". The current mode has no visible state (`jumps/page.tsx:482`; `lanes/crops/DSN/ovdark-01.png`; O28).
- **Raw codes.** The "How" options print raw codes such as "sms" and "call" (`jumps/page.tsx:110-114`).
- **Stray "0".** The Contacts filter renders a stray "0" (`ContactsBulkWorkspace.tsx:169`; `lanes/crops/DSN/ovdark-00.png`).
- **Duplicate sort.** It repeats the sort control that is already in the list header (`:163` and `:229`).
- **Primary fill means "selected".** Saved views and History filters mark the current choice with a primary fill, which reads as an action button (`ContactSavedViewsBar.tsx:24`; `ContactTimeline.tsx:139-141`).
- **Duplicate wording.** "Search Today" repeats its description as the field label (`jumps/page.tsx:470-471`).

**Verdict:** Needs rework for the entry pattern. The behaviour is good.

**Recommended structure.**
- Every list header gets a search field with a filter button (sliders icon and count) that opens "Filter {screen}".
- Today uses the same inline field instead of the search sheet.
- Journey moves its status and stage selects into that sheet.
- History gets a segmented control above the timeline.
- The layout modes leave the Filter sheet: either a visible control on desktop, or remove "Compact scan" if Kevin agrees it adds nothing at phone width.

### 2.11 Profile sheet and glossary sheet

**Profile sheet.**
- Flat rows with icons (`AppShell.tsx:59-72`).
- On desktop it repeats Settings, Help and My account, which sit directly above it in the rail.
- "Signed in as …" appears twice: as the rail label and as the sheet description.
- "Sign out" uses the left-arrow icon.

**Glossary ("What these words mean").** Its meanings for Mix, Beat, Mega-Mix, Journey and Today match JITM-05 §2.2 (`shots/overlays/laptop-light/_aria.txt:444-458`). Where it should appear is a known open question (JITM-05 §6).

**Verdict:** Good, fix details.

**Recommended structure.** The Profile sheet keeps only what the rail does not already show: who is signed in, Invite people, Ready-made Mixes and Sign out.

### 2.12 Disclosures, pane switchers, zoom and Fit

**Purpose.** Keep optional or long content out of the way.

**What works.**
- One shared base: no marker, 44px summary, 14/600 label, a 16px chevron that turns, inset focus ring (`disclosures.css:5-45`).
- Boxed exactly where D9 says: the Today briefing, Calendar connections, settings records and onboarding (`shots/overlays/phone-light/calendar-connections.png`, `lanes/crops/DSN/ov-settings-stages-open-full.png`).

**What gets in the way.**
- **Three chevron placements:**
  - at the end of the row (most disclosures);
  - right after the label ("Add or change a rule", "Stage and automation"; `product.css:363` makes those summaries inline-flex);
  - none at all: Journey's "Options" is a button with `aria-expanded`, sitting next to a "Help" disclosure that has a chevron.
- **Variants:** open FAQ items in Help get a filled band and an uppercase topic at 11.5px/800 (`support.css:38,41`). "Manage Mix" adds a leading icon.
- **A disclosure with nothing in it:** "Done 0" opens to a single link (`jumps/page.tsx:505`).
- **Primary content collapsed (DSN-09):**
  - "Visit happened" and "No-show" exist only inside "Event details and actions" (`calendar/page.tsx:82`; `shots/overlays/phone-light/calendar-event-open.png`);
  - "Notes to remember" is collapsed on the contact profile (`ContactProfile.tsx:258`);
  - "Find a contact for this event" sits at the bottom of the editor (`calendar/page.tsx:89`).
- **Pane switchers** look alike, but:
  - "Details" uses the people icon in Mixes and "•••" in Journey (`MixLibraryShell.tsx:12`; `WorkflowJourney.tsx:204`);
  - the Mega-Mix switcher has no icons and says "Mega-mixes" (`MegaMixLibrary.tsx:23`; known, JITM-05 §6).
- **Zoom and Fit** are 44px; the 15–21% default zoom belongs to the Journey lane (O45).

**Verdict:** Good, fix details.

**Recommended structure.**
- The chevron always goes at the end of the row: remove the inline-flex override.
- No filled bands.
- Disclosures only for optional content (JITM-08 §2.21):
  - show the outcome buttons on every past appointment marked "Outcome not recorded";
  - show the first lines of the latest note, with "All notes" to expand;
  - move the contact finder next to the Contact field;
  - replace "Done 0" with a plain line.
- One "Details" icon across all pane switchers.

### 2.13 Segmented controls, chips, toggles and native inputs

**Purpose.** Choose one view, filter or value.

**Inventory: six "selected" treatments.**

| # | Treatment | Where |
|---|---|---|
| 1 | Raised segment on a `--surface` track (the export's look) | Mix library tabs (`design-details.css:74-76`), Marketplace sections (`mega-mixes.css:44`), channel choice (`design-workspaces.css:254-256`) |
| 2 | Wash on a transparent strip | Journey Setup/Progress/Results (`WorkflowJourney.module.css`, `.tabs`), the pane switchers, Mix view tabs (`mix-library.css:46`) |
| 3 | Bordered pill track | WhenPicker Date/Time (`when-picker.css:21-23`) |
| 4 | Wash with a violet border on bordered pills | WhenPicker chips, duration chips, relationship chips (`product.css:56`), `filter-trigger.active` |
| 5 | Primary fill | Saved views, History filter |
| 6 | No visual state | Today layout |

Account tabs add a seventh look: a wash tab with rounded top corners (`components.css:122`).

**Toggles.** The sun-and-moon switch sits beside a native checkbox announced as a switch (`Appearance.tsx:81` vs `:92`).

**Native controls.**
- Selects, checkboxes and radios take tokens and turn dark correctly (`design-system.css:9-11`).
- Selects inside `.field label` inherit weight 720, so some values render bold (`base.css:64,164`; `lanes/crops/DSN/mixedit-countfrom.png`).
- The tag colour is a native colour input.
- 19 native date and time inputs in 14 owner-facing files coexist with the WhenPicker, which is used in 4 files. For example, "Start on 10/08/2026" in the bulk Mix sheet vs "Tomorrow, Oct 9" in Calendar (`shots/flow-bulk-inquiry-3-mix-sheet.png`).

**Verdict:** Needs rework into one family.

**Recommended structure.**
- Treatment 1 (raised segment on surface) for every set of mutually exclusive views, including the Journey modes, the pane switchers, Date/Time, account tabs, the Today layout and the History filter.
- One chip style for filters and choices; Kevin decides wash vs inverted (JITM-06 §6).
- Never a primary fill for "selected".
- 52×32 token switches for boolean settings.
- The WhenPicker for owner-facing dates, or a recorded rule for when native inputs are acceptable.

### 2.14 Buttons and actions

**What works.**
- Primary is violet; secondary is bordered on raised; text buttons are violet; danger is red text with a red border (`design-system.css:12-20`).
- Default height 44px.
- Destructive actions confirm first.

**What gets in the way.**
- **Text glyphs instead of icons:** "+ Add email", "+ Add phone", "+ Add address" (`ContactForm.tsx:221,235,251`); "+ New custom field" and "+ New custom type" (`contacts/custom-fields/page.tsx:52`; `settings/jump-date-types/page.tsx:64`). Every other add action uses AppIcon (JITM-06 §2.21).
- **Icon-only primary actions on phone.** Primary create actions are icon-only on Contacts (person-plus, while the rarer "Import" has a label; O15), Mixes ("+") and Journey ("+"), but labelled on Calendar ("New event") (JITM-06 §2.24).
- **Mixed emphasis for the same action.** On the contact profile, "Stop this work" is a violet text button next to a bordered "Pause this work" (`WorkflowProgress.tsx:29`). The same kind of action on Today is a red "Stop Mix…".
- **Tabs mixed with actions.** Mix and Mega-Mix detail put view tabs styled as buttons (Preview and Edit in wash) in the same row as actions (Share, Start).
- **Three different icon-over-label patterns:** the Today "Review" caption, the phone contact quick actions, and the Quick Add tiles.
- **Undersized targets:** text buttons and standalone links at 16–24px, and relationship chips at 38px on phones (DSN-08).

**Verdict:** Good, fix details.

**Recommended structure.**
- AppIcon `plus` with a label for every add action.
- A labelled primary create action on phones (JITM-06 §2.24). The export's Mixes screen shows a labelled "+ New mix" row (see §6).
- Danger styling for every Stop or Archive trigger.
- View tabs as a segmented control, separate from action buttons.
- A 44px floor for `.text-button` and `.inline-action` at 900px and below.

### 2.15 Typography and colour

**What works.**
- Instrument Sans for the interface and Newsreader for the owner's words: drafts, previews, notes, the Quick Add capture.
- Status colour always comes with words: "2 days overdue", "Overdue".
- Merge fields appear as wash chips inside Newsreader text (`lanes/crops/DSN/ovdark-00.png`, mixes-detail).

**What gets in the way.**
- **159 declarations below 13px** on owner screens (computed from CSS; the breakdown is in §6). Meaningful text affected (DSN-07):
  - the Calendar agenda's times, Mix names and week strip at 12px (`design-workspaces.css:190,345,397`);
  - Calendar's "New event" and "Download calendar" labels at 12px (`design-details.css:127`);
  - the review rhythm dates at 12px (`design-workspaces.css:246`);
  - on every desktop page, the rail's invitation hint "Share free access with people you know" at 12px (`design-workspaces.css:422`) and "Signed in as …" at 12.8px (`base.css:194`);
  - the Mix Beats help line at 12px (`design-details.css:85`);
  - the Mix and Beat number badges at 12px (`mega-mixes.css:2-3`);
  - contact method labels at 12px (`contacts-workspace.css:118`);
  - Today's "Filter" label at 12px (`design-workspaces.css:408`).
- **Uppercase labels (DSN-16):**
  - "YOUR NEXT SEVEN DAYS" on phones only (`components.css:340`; only Today opts out, at `design-workspaces.css:242`);
  - "NAME" and "EMAIL" on My account (`auth.css:43`);
  - "A CONNECTED STARTING POINT" (`MegaMix.module.css:14`);
  - FAQ topics (`support.css:41`).
- **A red zero:** "0 Needs attention" is red even at zero (`WorkflowJourney.module.css:49`; O45).
- **Colours outside the tokens:**
  - the import progress bar uses the browser's default accent (O12);
  - unstyled native buttons on Contacts and in import (O13, O21);
  - a literal glow in `when-picker.css:11`;
  - nine new literals in `ProductDemo.module.css` (§6).
- **Voice font on non-voice fields.** Every textarea defaults to Newsreader (`design-system.css:5`), so the Mix "Description" and the share "What is it for?" fields render in the voice font.

**Verdict:** Good, fix details.

### 2.16 Dark mode parity

**What I compared.**
- All 38 routes in `shots/sweep/phone-dark` and `laptop-dark` against light (side-by-side montages `lanes/crops/DSN/dk-*.png` and `laptop-dark-6.png`).
- 16 dark overlays (`lanes/crops/DSN/ovdark-0*.png`).
- Public pages in dark (`lanes/crops/DSN/pubdark-0*.png`).
- An automated pass for bright regions in dark captures, which found no light surfaces: only heading text exceeded the threshold.

**What works.**
- All surfaces, fields, selects, checkboxes, sheets, scrims and the rail theme correctly.
- Dark status colours keep their words.
- The two dark token blocks stay in sync: `diff -w` of `design-tokens.css:77-112` against `:117-152` prints nothing (see §6 about the documented check).

**What gets in the way.**
- **Dark-only panel on More.** On phones the More rows use `--raised` (`mobile-ux.css:127`). In light that equals the page and is invisible; in dark the rows become a filled panel, unlike the export's dark More (`lanes/crops/DSN/more-dark-vs-export.png`).
- **Native validation bubble.** Account deletion relies on the browser's own "Please fill out this field." bubble (`shots/overlays/phone-dark/x-account-delete.png`).
- **NOT RUN in dark:** import results and the Recent imports list.

**Verdict:** Optimal at the token level; LOW details.

### 2.17 320px reflow, breakpoints and the compact rail

**What works.**
- No owner route scrolls sideways at 320px (`shots/sweep/phone320-light/_results.json`: `overflowX` is false on all 38 routes).
- Pane switching, the docked review at 768, the rail at 901, the profile pane at 1200 and the full rail at 1280 all change at the documented boundaries (`lanes/crops/DSN/bp-today-review.png`, `bp-contacts.png`, `bp-calendar.png`).

**What gets in the way.**
- **"Profil/e" in the compact rail.** The Profile button's label wraps mid-word on every page from 901 to 1279px (`design-workspaces.css:210`; `shots/sweep/tabletLand-light/today-review.png`).
- **Import stepper at 320px:** "Choo/se file", "Revie/w/issues", "Result/s".
- **Mix library tabs at 320px:** the "Mega-Mixes" label runs into the Marketplace icon.
- **Notifications checkboxes at 390px:** they render at different sizes, and labels run into descriptions (`lanes/crops/DSN/stitch-320-notif.png`).
- **Calendar week buttons:** "Previous week" wraps to two lines at 320 and 390px (`lanes/crops/DSN/p320-00.png`; `shots/overlays/phone-light/calendar-event-open.png`).
- **Settings chevrons:** the row chevrons shrink on rows with long descriptions (`lanes/crops/DSN/settings-chevrons.png`).

**Verdict:** Good, fix details.

### 2.18 States and feedback (notices, toasts, empty, loading)

**What works.**
- `Notice` gives the success, info and error triples with `role="status"` or `"alert"` (`Notice.tsx:1-3`).
- The outcome card offers Undo above the bottom navigation (`lanes/crops/DSN/undo-card.png`).
- `EmptyState` gives one primary action (`EmptyState.tsx:15-21`).
- Route loading screens share one wording (`*/loading.tsx`).

**What gets in the way.**
- **No loading state** for Journey, Marketplace, More, Settings, My account or Help: no `loading.tsx` covers them (DSN-13).
- **Seven phrasings** for one background state, "follow-ups are being prepared" (DSN-22).
- **Two notices** after saving an event: "Calendar updated." and "No invitation was sent…" (O43).
- **Two notice placements.** Notices sit inside the page padding on Calendar but full-bleed from the rail edge on Contacts (`shots/flow-cal-after-save.png` vs `shots/flow-bulk-inquiry-4-after.png`).
- **Vague Undo.** The outcome card says "you can undo this for a moment" (JITM-08 §2.4 gives 10 seconds) and uses two labels for the next date: "Next follow-up:" and "Next scheduled:" (`JumpWorkflow.tsx:249-252`).
- **Wrong tail.** Empty-state bubbles get the owner's right-hand tail instead of the app's left-hand tail (DSN-26).
- **Native validation** on account deletion (DSN-27).

**Verdict:** Good, fix details.

### 2.19 Formatting consistency (times, dates, timezones, statuses, names)

**What works.**
- Today, Contacts and Calendar rows use the owner's 12-hour locale: "10:00 AM", "Earlier today, 10:00 AM".
- Counts use singular and plural correctly: "1 Mega-Mix", "1 Mix is not in a Mega-Mix".
- Mega-Mix spelling is almost clean: 101 canonical uses against 2 variants, down from 31 (§6).

**What gets in the way.**
- **Times outside the account locale (DSN-01):**
  - ISO "2026-10-09 14:00" in the Quick Add review (`QuickAdd.tsx:178-180`);
  - 24-hour "09:00–17:00", "Prefer 10:00", "Quiet from 20:00 to 08:00" in Mega-Mix setup (`JourneyPreferenceFields.tsx:41-42` via `mix-broadcast.ts:32-35`) and onboarding (O36).
- **Raw IANA ids in eight places (DSN-02):** Quick Add review, Mega-Mix setup, the Calendar agenda header, Calendar event details, the Calendar editor helper (directly under "New York"), the Today snooze helper, My business, and the schedule preview. Mega-Mix setup breaks it mid-word: "America/New_Y ork" (O8).
- **Raw lowercase enums (DSN-03):** "active", "completed", "sms", "phone call", "yearly". The same channel is "Call" on Today and "Phone call" in Mixes and the bulk Message sheet.
- **A mixed date style:** "Oct 9, 9:00 AM – Oct 9, 9:30 AM · America/New_York" repeats the date and prints the raw zone.

**Verdict:** Needs rework. One formatter fixes it.

---

## 3. Findings table

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|---|
| DSN-01 | JITM-11 §2.15 | Dates and times shown outside the account's locale on screens where the owner confirms a time: ISO "2026-10-09 14:00" in the Quick Add review; 24-hour "09:00–17:00", "Prefer 10:00", "Quiet from 20:00 to 08:00" in Mega-Mix setup; 24-hour times in onboarding (O36). Elsewhere the app writes "10:00 AM". | `shots/ov-qa-4-review-bottom-phone-light.png`; `shots/flow-mm-contractor-1-review.png`; `src/components/QuickAdd.tsx:178-180`; `src/components/JourneyPreferenceFields.tsx:41-42`; `src/lib/mix-broadcast.ts:32-35` | VERIFIED-RUNTIME | HIGH | One display formatter in the saved locale and timezone: "Fri, Oct 9 at 2:00 PM", "9:00 AM–5:00 PM". |
| DSN-02 | JITM-08 §2.28 (TimezonePicker shows city names); none — gap for timezone display | Raw IANA ids in 8 places, including right under the friendly "New York" in the Calendar editor; Mega-Mix setup breaks it as "America/New_Y ork". | `src/components/QuickAdd.tsx:166`; `src/app/(app)/calendar/page.tsx:78,82`; `src/components/CalendarEntryForm.tsx:104`; `src/app/(app)/jumps/page.tsx:360`; `src/app/(app)/settings/business/page.tsx:43`; `src/components/SchedulePreview.tsx:34`; `src/components/JourneyPreferenceFields.tsx:41`; `lanes/crops/DSN/cal1280-editor.png`; `shots/overlays/phone-light/calendar-event-open.png` | VERIFIED-RUNTIME | MEDIUM | Export `cityLabel()` from `TimezonePicker.tsx:24` as a shared helper; write "New York time". |
| DSN-03 | JITM-05 §2.11; JITM-04 §2.4 | Raw enum values reach owners: status pills "active" and "completed"; the Today "How" filter offers "sms", "email", "call", "voicemail", "whatsapp"; contact history channels "sms" and "phone call"; saved-date repeat "yearly". The same channel is "Call" (Today) and "Phone call" (Mixes, bulk Message). | `src/app/(app)/jumps/page.tsx:110-114`; `src/components/MixWorkspace.tsx:80`; `src/components/MixLibraryNav.tsx:15`; `src/components/ContactImportWizardV2.tsx:488,504`; `src/components/ContactTimeline.tsx:169`; `src/components/ContactProfile.tsx:269`; `src/lib/display-labels.ts:3`; `src/components/ContactsBulkWorkspace.tsx:278`; `lanes/crops/DSN/ovdark-00.png` (mixes-detail "Phone call"); `shots/flow-import-3-results.png` ("completed") | VERIFIED-RUNTIME (pills, "Phone call"); VERIFIED-CODE (filter codes, history, recurrence) | MEDIUM | Shared `statusLabel`/`channelName` (sentence case); "Call" everywhere; recurrence "Every year". |
| DSN-04 | JITM-10 §2.7; JITM-06 §3 (segmented anatomy); JITM-06 §6 (chip question, known) | Six "selected" treatments for one job. The Today layout switch ("Focused work / Compact scan") sets `aria-current` but shows no visual state. Saved views and History filters use a primary fill for "selected", which reads as an action. | `src/app/(app)/jumps/page.tsx:482` (no CSS for its `aria-current`); `src/components/ContactSavedViewsBar.tsx:24`; `src/components/ContactTimeline.tsx:139-141`; `src/styles/when-picker.css:21-23`; `src/components/WorkflowJourney.module.css` (`.tabs`); `src/styles/design-details.css:74-76`; `lanes/crops/DSN/ovdark-01.png` (today-filter) | VERIFIED-RUNTIME | MEDIUM | Export segmented control for all mutually exclusive views; one chip style (Kevin picks); never a primary fill for selection. |
| DSN-05 | JITM-08 §1 ("one way of doing each thing"); none — gap for filter entry anatomy | Search and filter entry differs on each list screen: Today (search icon opening a one-field sheet, plus a "Filter" button); Contacts, Mixes, Marketplace (sliders icon in the search field); Journey (inline selects); Calendar (disclosure); contact History ("•••"). Today's layout modes are hidden in Filter (O28); Contacts shows sort twice. | `src/app/(app)/jumps/page.tsx:470-482`; `src/components/ContactsBulkWorkspace.tsx:160-170,229`; `src/components/ContactTimeline.tsx:138`; `src/app/(app)/calendar/page.tsx:78`; `shots/overlays/laptop-light/journey-progress.png`; `shots/sweep/phone-light/today.png` | VERIFIED-RUNTIME | MEDIUM | One list-header pattern (search field plus filter button with count), as the export draws it on Contacts (`lanes/crops/DSN/export-contacts-header.png`); move the Journey selects into it; layout modes out of Filter. |
| DSN-06 | JITM-10 §2.3 (nothing clips); JITM-06 §2.31 (one style owner) | Today's stacked "Review" caption (52px wide) sits in a 36px grid column. It overflows, and on the highlighted Next-up card it is clipped at 390px and 320px (O29). Two owners disagree: `design-workspaces.css` hides the caption, `phone-icons.css` shows it. | `src/styles/design-workspaces.css:400-403`; `src/styles/phone-icons.css:17-19`; `lanes/crops/DSN/review-col-320-390.png` (320px left, 390px right); `shots/ov-rev-6-after-undo-phone-light.png` | VERIFIED-RUNTIME | MEDIUM | One owner: a 52px action column at 900px and below, or a horizontal labelled "Review" pill; keep the recorded caption decision (`docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:28`). |
| DSN-07 | JITM-10 §2.2 | Meaningful text below 13px on daily surfaces: Calendar agenda times, Mix names and week strip (12px); Calendar header buttons (12px); review rhythm dates (12px); the rail's invitation hint (12px) and "Signed in as" (12.8px) on every desktop page; Mix Beats help; Beat and Mix number badges; contact method labels; Today "Filter" label. Journey's 11–12px and the "Recommended" tag are already known (JITM-10 §6). | `shots/sweep/laptop-light/_results.json` (`small` lists for today, calendar, mixes-mega, contact-marcus); `src/styles/design-workspaces.css:190,246,345,397,408,422`; `src/styles/base.css:194`; `src/styles/design-details.css:85,127`; `src/styles/mega-mixes.css:2-3`; `src/styles/contacts-workspace.css:118` | VERIFIED-RUNTIME | MEDIUM | Raise to 13px; extend `e2e/visual-fitment.spec.ts` to Calendar, Journey, Marketplace and open overlays; add a drift metric (§6). |
| DSN-08 | JITM-10 §2.1 | Phone controls under 44px: "View upcoming follow-ups" link at 16px (the matching Done link gets `today-queue-link`, this one does not); text buttons at 24px ("Stop this work", "Edit the generated text/email/talking points"); "View journey" link at 24px; relationship chips (Priority, Prefers) at 38px. | `src/app/(app)/jumps/page.tsx:504` vs `:505`; `src/components/WorkflowProgress.tsx:29,39`; `src/components/MixEditor.tsx:289-291`; `src/styles/product.css:55`; `shots/sweep/phone-light/_results.json` (`smallTargets`) | VERIFIED-RUNTIME | MEDIUM | Shared 44px floor at 900px and below for `.text-button`, `.inline-action`, standalone links and chips (`phone-icons.css`). |
| DSN-09 | JITM-08 §2.21 | Primary actions and content collapsed by default: visit outcome buttons only inside "Event details and actions"; "Notes to remember" collapsed on the profile; "Find a contact for this event" at the bottom of the editor (O42); "Done 0" disclosure that opens to one link. | `src/app/(app)/calendar/page.tsx:82,89`; `src/components/ContactProfile.tsx:258`; `src/app/(app)/jumps/page.tsx:505`; `shots/overlays/phone-light/calendar-event-open.png`; `shots/probe-bulkbar-overlap.png` | VERIFIED-RUNTIME | MEDIUM | Show outcome buttons on past appointments with "Outcome not recorded"; show the latest note inline; place the contact finder by the Contact field; plain "Nothing done yet today". |
| DSN-10 | JITM-08 §2.11 | Quick Add on phones is a bottom sheet with a 640px minimum height, not full screen, and has no grabber, unlike every other bottom sheet (O32). | `src/styles/design-system.css:116`; `src/styles/popups.css:26` (grabber only for `.sheet-header`); `shots/overlays/phone-light/x-quickadd-other.png`; `shots/ov-qa-1-open-phone-light.png` | VERIFIED-RUNTIME | MEDIUM | `inset: 0` below 768px with square corners, sticky header and footer, as the standard says. |
| DSN-11 | JITM-06 §2.28 (extend one shared component) | `checkbox-card` and label-plus-detail rows have no shared layout, so each page patches it: "Morning digestA short list…", "Everyone39 active people…", "contacts.csvOct 8…". Native checkboxes shrink unevenly in adjacent cards (Notifications; contact "Do not contact" measured 8×20). | `src/styles/base.css:170-171`; per-page patches `src/styles/product.css:419-422`, `src/styles/base.css:174`; `src/app/(app)/settings/notifications/page.tsx:35`; `lanes/crops/DSN/stitch-320-notif.png`; `lanes/crops/DSN/mixedit-audience.png`; `shots/flow-import-3-results.png` | VERIFIED-RUNTIME | MEDIUM | One `checkbox-card` layout (input `flex: 0 0 auto`; strong and small as blocks); reuse it for import rows. |
| DSN-12 | JITM-06 §2.7, §2.28 | Unstyled native controls. Contacts selection "Done" is a grey, black-bordered button: its class is only styled under `.contact-detail-page` (O21). "Recent imports" rows are raw `<button>`s (O13). The import results `<progress>` is the browser default, 160px wide in the browser's blue: its style targets other containers (O12). | `src/components/ContactsBulkWorkspace.tsx:229`; `src/styles/contacts-workspace.css:68`; `src/components/ContactImportWizardV2.tsx:490,504`; `src/styles/components.css:171`; `src/styles/contact-import.css:53`; `shots/probe-bulkbar-overlap.png`; `shots/flow-import-3-results.png` | VERIFIED-RUNTIME | MEDIUM | Use `.text-button` for "Done"; a reset row button for imports; style the progress bar with `--track` and `--violet` at full width. |
| DSN-13 | JITM-08 §2.32 | No loading state for Journey, Marketplace, More, Settings, My account or Help: only 5 route groups have `loading.tsx`. | `find src/app -name loading.tsx` lists only calendar, contacts, jumps, mixes, templates | VERIFIED-CODE | MEDIUM | Add `(app)/loading.tsx`, or per-route files with the shared wording. |
| DSN-14 | JITM-08 §2.10; JITM-06 §3 | Overlay anatomy drifts: close button centred against long text (confirmations, long sheet headers); WhenPicker has two closes (X and Done); phone confirmations are the only centred overlay; the row menu sheet mixes chips and buttons of varied widths instead of flat rows. | `src/styles/design-details.css:4`; `src/styles/popups.css:11`; `src/components/WhenPicker.tsx:209,260`; `shots/flow-inv-4-confirm.png`; `shots/overlays/laptop-light/_aria.txt:1-21` | VERIFIED-RUNTIME | LOW | Top-align the close; one close in WhenPicker; flat rows in the row menu; bottom-anchored phone confirmations (Kevin). |
| DSN-15 | JITM-08 §2.19 | Disclosure chevrons in three positions: end of row, right after the label (`product.css:363`), or none (Journey "Options" button). Help FAQs add a filled band and an uppercase topic. | `src/styles/product.css:363`; `src/styles/support.css:38,41`; `src/components/WorkflowJourney.tsx:214,226`; `lanes/crops/DSN/ov-settings-stages-open-full.png`; `lanes/crops/DSN/ov-help-open-full.png` | VERIFIED-RUNTIME | LOW | Chevron at the end of the row everywhere; make "Options" a disclosure or a labelled toggle with a chevron. |
| DSN-16 | JITM-06 §2.16 | Capitals as labels: "YOUR NEXT SEVEN DAYS" (Calendar, phone only), "NAME" and "EMAIL" (My account, weight 800), "A CONNECTED STARTING POINT", FAQ topics, WhenPicker weekdays. | `src/styles/components.css:340`; `src/styles/auth.css:43`; `src/components/MegaMix.module.css:14`; `src/styles/support.css:41`; `src/styles/when-picker.css:37`; `lanes/crops/DSN/account-labels.png`; `shots/overlays/phone-light/calendar-event-open.png` | VERIFIED-RUNTIME | LOW | Sentence case at weight 600; delete the ≤767px uppercase rule. |
| DSN-17 | JITM-07 §2.8 | Back controls are inconsistent or missing: contact edit uses a boxed chevron button on the right; Create a Mix and Invite people have no BackLink at phone width; template setup shows a "Mix library" button instead. | `src/app/(app)/contacts/[contactId]/edit/page.tsx:42`; `lanes/crops/DSN/p320-01.png`, `p320-04.png`, `p320-07.png` | VERIFIED-RUNTIME | LOW | `BackLink` at the top left on every sub-page. |
| DSN-18 | JITM-06 §2.21, §2.23 | Icon meanings and glyphs drift: text "+" as an icon (contact form, custom field and type headings); people icon for "Add a person" and "New person"; "My invitations" with the people icon (gift elsewhere) and a different name; "Details" pane with the people icon in Mixes and "•••" in Journey. | `src/components/ContactForm.tsx:221,235,251`; `src/app/(app)/contacts/custom-fields/page.tsx:52`; `src/app/(app)/settings/jump-date-types/page.tsx:64`; `src/components/QuickAdd.tsx:183`; `src/app/(app)/mixes/page.tsx:53`; `src/components/MixLibraryShell.tsx:12`; `src/components/WorkflowJourney.tsx:204` | VERIFIED-CODE | LOW | AppIcon `plus`; person-plus for adding a person; gift and "Invite people"; one Details icon. |
| DSN-19 | JITM-07 §2.5; JITM-10 §2.3 | Wrapping defects: "Profil/e" in the compact rail on every page from 901 to 1279px; import stepper broken mid-word at 320px; Mix library tab label running into an icon at 320px; Settings row chevrons shrinking on long rows. | `src/styles/design-workspaces.css:210`; `shots/sweep/tabletLand-light/today-review.png`; `lanes/crops/DSN/stitch-320-notif.png`; `lanes/crops/DSN/settings-chevrons.png` | VERIFIED-RUNTIME | LOW | Icon-only Profile with an accessible name in the compact rail; `overflow-wrap: normal` plus wrapping step chips; `flex: none` on chevrons. |
| DSN-20 | none — defect | A stray "0" renders in the "Filter contacts" sheet when there is no search and no active filter (`(query \|\| activeFilterCount) && …`). | `src/components/ContactsBulkWorkspace.tsx:169`; `lanes/crops/DSN/ovdark-00.png` (contacts-filter) | VERIFIED-RUNTIME | LOW | `(query \|\| activeFilterCount > 0) ? … : null`. |
| DSN-21 | JITM-06 §2.11 | "0 Needs attention" is drawn in the danger colour at zero (O45; Journey lane). | `src/components/WorkflowJourney.module.css:49`; `shots/overlays/laptop-light/journey-progress.png` | VERIFIED-RUNTIME | LOW | Danger colour only when the count is above zero. |
| DSN-22 | JITM-04 §2.7; related JITM-08 §6 (refresh notices, known) | Seven phrasings for one background state: "Preparing your follow-ups…", "Follow-ups are being prepared.", "Your follow-up list is awaiting preparation.", "Awaiting follow-up preparation", "Your recorded updates are being prepared. This list will refresh.", "Updating your follow-up list…", "Start saved. Follow-ups are being prepared." One is shown on a person who is not in a Mix (O25). | `src/components/PreparationNotice.tsx:111,115`; `src/app/(app)/jumps/page.tsx:463,469`; `src/components/ContactProfile.tsx:195,233`; `src/components/WorkflowAttention.tsx:10`; `src/components/TodayNavigation.tsx:106`; `src/components/WorkflowJourney.tsx:257`; `shots/flow-bulk-inquiry-4-after.png` | VERIFIED-CODE | LOW | One phrase family and one component (see §4). |
| DSN-23 | JITM-04 §2.7 | Notices: two stacked notices after saving an event (O43); notices padded on Calendar but full-bleed on Contacts. | `shots/flow-cal-after-save.png`; `shots/flow-bulk-inquiry-4-after.png` | VERIFIED-RUNTIME | LOW | One notice per outcome; one notice slot in the page padding. |
| DSN-24 | JITM-08 §2.28 and §3 (WhenPicker canonical); JITM-06 §2.5, §2.15 | Form controls drift: 19 native date and time inputs in 14 owner files against WhenPicker in 4 files ("10/08/2026" vs "Tomorrow, Oct 9"); bold select values from an inherited 720 weight; WhenPicker triggers outlined with `--line` beside `--field-border` fields; invisible buffer stripes; a sun-and-moon switch beside a checkbox announced as a switch. | `grep type="date"` (15 files); `src/styles/base.css:64,164`; `src/styles/when-picker.css:7,54`; `src/styles/design-tokens.css:40-41`; `src/components/Appearance.tsx:81,92`; `lanes/crops/DSN/mixedit-countfrom.png`; `lanes/crops/DSN/cal1280-editor.png` | VERIFIED-CODE | LOW | WhenPicker for owner-facing dates; select `font-weight: 400`; `--field-border` triggers; distinct stripe tokens; token switch. |
| DSN-25 | JITM-08 §2.7; JITM-06 §3 | Button emphasis disagrees: "Stop this work" is a violet text button while "Stop Mix…" is a red danger button; view tabs (Preview, Edit) are styled as buttons in the same row as actions (Share, Start). | `src/components/WorkflowProgress.tsx:29`; `src/components/MixWorkspace.tsx:81`; `shots/overlays/laptop-light/mega-detail.png` | VERIFIED-RUNTIME | LOW | Danger triggers for stops; a separate segmented control for views. |
| DSN-26 | JITM-03 §2.13 | Empty-state bubbles (the app talking to the owner) get the right-hand, owner-speaking tail, because `design-system.css:62` moves every tail to the right. | `src/styles/design-system.css:62` vs `src/styles/conversation.css:23-27`; `src/components/EmptyState.tsx:19`; `lanes/crops/DSN/p320-00.png`, `p320-02.png` | VERIFIED-RUNTIME | LOW | A `speech-bubble--app` modifier with a left tail for EmptyState and the Quick Add prompts. |
| DSN-27 | JITM-06 §2.9, §2.19; JITM-08 §2.24 | Dark-only and native leftovers: phone More rows render as a raised panel only in dark; account deletion shows the browser's validation bubble instead of an in-app error. | `src/styles/mobile-ux.css:127`; `lanes/crops/DSN/more-dark-vs-export.png`; `shots/overlays/phone-dark/x-account-delete.png` | VERIFIED-RUNTIME | LOW | `background: var(--page)` for More rows; `noValidate` plus in-app field errors. |
| DSN-28 | JITM-06 §2.20 | The review draft keeps a 190px minimum and a visible resize grip inside the bubble, so the bubble stops reading as one surface (O4). | `src/styles/design-workspaces.css:119`; `src/styles/base.css:168`; `shots/probe-today-laptop-light.png` | VERIFIED-RUNTIME | LOW | Auto-height with `resize: none`. |
| DSN-29 | JITM-06 §2.31 | The sheet shell has five style owners; a dead 20px/600 title rule depends on load order to lose to the 18px/700 rule. Literal backdrops are already known (JITM-06 §6). | `src/styles/product.css:3-13`; `src/styles/design-system.css:67-70`; `src/styles/design-details.css:8`; `src/styles/popups.css:4-11` | VERIFIED-CODE | LOW | Consolidate into `popups.css`; delete the overridden rules. |
| DSN-30 | JITM-06 §2.7; WF-07 | New drift since the baseline: 9 colour literals in `ProductDemo.module.css` (phone-frame illustration, 2026-10-05) and 1 new raw SVG (`DemoPhoneQr.tsx`, QR drawing). | `src/components/ProductDemo.module.css:60-68`; `src/components/DemoPhoneQr.tsx:48`; §6 drift table | VERIFIED-CODE | LOW | Tokenize, or record an illustration exception in JITM-06 §6. |

**Lead observations verified**
- **O4: true.** Cause: `design-workspaces.css:119` and `base.css:168`.
- **O5: true, but recorded.** The caption is a dated decision (`docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:28`); the defect is its overflow (DSN-06).
- **O8: true.** "America/New_Y ork", 24-hour times, raw id.
- **O12: true, with a correction.** The bar is not drawn short at 100%. It is the browser's default `<progress>`: 160px wide, fully filled, in the browser's accent colour. `contact-import.css:53` styles other containers.
- **O13: true.** A raw `<button class="contact-method-row">`, and a strong and a small with no separator.
- **O21: true.** `.contact-inline-action` is only styled under `.contact-detail-page`.
- **O27: true.** `.color-input` is 12px/750 (`components.css:162`).
- **O33: true.**

---

## 4. Copy findings

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

## 5. Structural recommendations (ranked)

1. **One display-format module.**
   - **Problem (D20):** owners read four time formats and raw IANA ids across Today, Calendar, Quick Add and Mega-Mix setup. The confirm steps (Quick Add review, setup review) are exactly where the format breaks (DSN-01, 02, 03).
   - **Change:** `src/lib/format.ts`, using the saved locale and timezone (time, day, date range, "New York time", status, channel), used by every surface. Remove `formatTimeInput` from display.
   - **Benefit:** the owner checks a scheduled time once and trusts it.
   - **Effort:** M.
   - **Kevin decision:** not needed; JITM-11 §2.15 already requires it. Optional: approve the "New York time" wording.
2. **One family of selection controls.**
   - **Problem:** six "selected" looks; the Today layout has no visible state; primary-filled "All Contacts" and "All" read as actions (DSN-04).
   - **Change:** a shared `SegmentedControl` (raised segment on surface) for views, pane switchers, Journey modes, Date/Time, account tabs and History filters; one `Chip` for filters and choices.
   - **Benefit:** one learned gesture everywhere; the state is always visible.
   - **Effort:** M.
   - **Kevin decision:** yes, the JITM-06 §6 chip style (wash vs inverted).
3. **One list-header pattern.**
   - **Problem:** search and filters live somewhere different on each list; Today hides layout modes in Filter (DSN-05).
   - **Change:** search field plus a filter button with count for Today, Contacts, Mixes, Marketplace and Journey; History gets a segmented control. Today layout modes become a visible control on desktop, or "Compact scan" is removed.
   - **Benefit:** fewer taps on Today; filters are where the owner expects them.
   - **Effort:** M.
   - **Kevin decision:** yes. It changes Today's header structure (D20).
4. **Take primary content out of disclosures.**
   - **Problem:** visit outcomes, the latest note and the contact finder are collapsed (DSN-09).
   - **Change:** outcome buttons visible on past appointments; a two-line latest note with "All notes"; contact finder by the Contact field; "Done 0" becomes a line.
   - **Benefit:** recording a visit and preparing for a call each lose a tap.
   - **Effort:** S.
   - **Kevin decision:** no.
5. **An overlay anatomy pass.**
   - **Problem:** Quick Add is not full screen and has no grabber; the close floats; WhenPicker has two closes; the row menu is laid out differently from other sheets; phone confirmations sit mid-screen (DSN-10, DSN-14).
   - **Change:**
     - Quick Add fills the screen below 768px;
     - close buttons align to the top;
     - WhenPicker gets a single close;
     - the row menu becomes flat rows;
     - phone confirmations are anchored to the bottom with full-width buttons.
   - **Benefit:** every overlay behaves the same way, and phone actions sit in thumb reach.
   - **Effort:** S–M.
   - **Kevin decision:** yes, for bottom-anchored phone confirmations only.
6. **Floor pass with an automated guard.**
   - **Problem:** 12px agenda and rail text; 16–38px phone targets (DSN-07, DSN-08).
   - **Change:** raise to 13px and 44px. Extend `e2e/visual-fitment.spec.ts` to Calendar, Journey, Marketplace and open overlays. Add a drift metric for font-size declarations under 13px.
   - **Benefit:** readable agenda and rail; reliable taps.
   - **Effort:** S–M.
   - **Kevin decision:** no.
7. **Shared control resets.**
   - **Problem:** run-together labels, squeezed checkboxes, native grey buttons, the default progress bar, bold selects, the stray "0" (DSN-11, 12, 20, 24).
   - **Change:** one `checkbox-card`, a text-button reset, a progress style, select weight 400, the boolean fix in `ContactsBulkWorkspace.tsx:169`.
   - **Benefit:** settings and import look finished and trustworthy.
   - **Effort:** S.
   - **Kevin decision:** no.
8. **Navigation consistency.**
   - **Problem:** four back styles; "Profil/e" in the compact rail; the Profile sheet repeats the rail (DSN-17, DSN-19).
   - **Change:** `BackLink` on every sub-page; icon-only Profile in the compact rail; the Profile sheet keeps only what the rail does not show.
   - **Effort:** S.
   - **Kevin decision:** no.
9. **Icon and glyph meaning pass** (DSN-18).
   - **Change:** AppIcon `plus`; person-plus for adding people; gift for invitations; one Details icon.
   - **Effort:** S.
   - **Kevin decision:** no.
10. **Draft field and Today action column** (DSN-06, DSN-28).
    - **Change:** an auto-height draft with no grip, and one owner for the action column, wide enough for the caption.
    - **Effort:** S.
    - **Kevin decision:** no.

**Decisions for Kevin**
- The chip selection style (JITM-06 §6).
- Today's header: an inline search field, and where layout modes live (or remove "Compact scan").
- Bottom-anchored confirmations on phones.
- Whether native date inputs are acceptable for compact secondary fields, or the WhenPicker is used everywhere.
- Whether JITM-10 §2.1 and §2.2 are MUST rules.

---

## 6. Documents that disagree, gaps, and the drift re-run

### Documents that disagree with each other or with the code

1. **README vs JITM-10.** `docs/standards/README.md:66` says every rule uses MUST, SHOULD or MAY. JITM-10 §2.1 (44px targets) and §2.2 (13px floor) use neither, so their severity is ambiguous under JITM-17 §2.14.
2. **JITM-06 §2.24 vs the shipped headers.** The standard says primary actions keep a visible label on phones, but the shipped Contacts, Mixes and Journey create actions are icon-only. The export gives no precedent: its phone Contacts header has only "•••" (`lanes/crops/DSN/export-contacts-header.png`), and its Mixes screen uses a labelled "+ New mix" row (`shots/export/Mixes.png`).
3. **JITM-08 §2.11 vs the code.** The standard says Quick Add fills the screen below 768px. `design-system.css:116` makes it a 640px bottom sheet.
4. **JITM-03 §2.13 vs the code.** The standard says the app talking to the owner gets a left-hand tail. `design-system.css:62` gives every bubble a right-hand tail.
5. **JITM-08 §2.12 vs the pickers.** The standard says opening a sheet focuses its heading. WhenPicker focuses the chosen day (`WhenPicker.tsx:106-112`) and TimezonePicker focuses the search field (`TimezonePicker.tsx:65`). Both are reasonable but undocumented exceptions.
6. **JITM-08 §2.10 vs the row menu.** The standard says tools sheets use flat rows. The Today row menu is an action sheet with chips and buttons, and the rule does not say whether action sheets are covered.
7. **JITM-05 §2.10 vs billing.** JITM-05 retires "Plan" for Mixes; billing now uses "plan" for subscription plans (account billing, pricing). This is a new meaning sharing one word with "follow-up plan" in Mix explanations.
8. **JITM-06 §5's check vs the file.** JITM-06 §5 says `diff <(sed -n 77,112p …) <(sed -n 117,152p …)` "prints nothing". As written it prints 36 lines, because the media-query block is indented 4 spaces and the attribute block 2. The values are identical (`diff -w` prints nothing), so the documented check should use `diff -w`.

### Gaps where no rule exists

- How to display a timezone (city name vs IANA id), and how to format dates and times beyond JITM-11 §2.15.
- The anatomy of filter and search entry on list screens; JITM-08 §2.29 covers behaviour only.
- Selection-state visuals beyond JITM-10 §2.7.
- When native date and time inputs are acceptable instead of the WhenPicker.
- Icon-over-label captions (Today "Review", contact quick actions, Quick Add tiles) are not among the JITM-10 §2.2 exceptions, yet they ship at 12px.
- Whether non-message textareas (Mix description, share description) use the voice font. Today `design-system.css:5` makes every textarea voice.
- JITM-06 §2.7 has no illustration exception for device mock-ups (`ProductDemo.module.css`).
- The drift baseline has no metric for sub-13px font sizes.

### Drift re-run (WF-07 step 6)

I ran the commands in `docs/standards-audit-2026-09-28/DRIFT_BASELINE.md` from the repository with `unset -f grep` (the shell wraps grep in ugrep) and `LC_ALL=C`. Baseline is `9439fd6`; current is `f23db11`.

| # | Metric | Baseline | Now | Change |
|---|---|---|---|---|
| 1 | Colour literals in `src/styles` (excl. tokens) | 53 (30 hex + 23 fn); modules 2 | 53 (30 + 23), same 11 files; modules **11** | Styles 0. **Modules +9:** `ProductDemo.module.css:60-68` (phone-frame illustration, 2026-10-05). **New drift.** |
| 2 | Colour literals in `.ts`/`.tsx` | 42 in 9 files | 45 in 11 files | +3: `DemoPhoneQr.tsx:48` (2, QR black and white, functional) and `new-contact-placement.ts:114` (1, false positive: the PR reference "#125" in a comment string). |
| 3 | `window.confirm` / bare `confirm(` | 2 native (FormGuard); 10 hook | 2 native (`FormGuard.tsx:38,59`, lines moved); 12 hook calls; cross-check 0; alert/prompt 0 | No new native prompts. |
| 4 | Customer terms | Plan(s) any-case 39/10; Mega-Mix canonical 67 vs 31 variants; follow-up(s) 296; Today 64 vs 6 | Plan 49, Plans 20; Mega-Mix canonical **101 vs 2** variants; follow-up(s) 314; Today 65 vs 7; Mix 388 / mix 42; Mixes 166 / mixes 27; Journey any-case 108; Step 43; Campaign 0; Important Date 0; segments 22,373 | The Plan rise (+10 each) comes from billing and pricing "plan" (account/billing 12 segments, pricing 7), not the retired Mix sense. Mega-Mix variants fell by 29; the two left are "Mega-mixes" (`MegaMixLibrary.tsx:23`, known JITM-05 §6) and the code value `"mega-mix"` (`MegaMixForms.tsx:77`). Lowercase mix/mixes fell (casing cleanup). |
| 5 | Raw `<svg>` outside AppIcon | 4 in 3 files | 5 in 4 files | +1 `DemoPhoneQr.tsx` (QR drawing; data drawing like `WorkflowGraphEdges`). |
| 6 | `font-family` outside tokens | 27 (18 voice, 4 ui, 2 inherit, 3 non-token) | 27, same split; TS 3 (email) | No change. |
| 7 | Stylesheets | 37 / 36 imported / 0 orphans / 9 modules | Same | No change. |
| 8 | `!important` | 38 + 2 | 38 + 2 | No change. |
| 9 | Inline `style={{` | 30 in 20 files | 30 in 20 files | No change. |
| 10 | Routes | (app) 33, (staff) 30, staff/ 1, other 26; 50 API | (app) 36, (staff) 30, staff/ 1, other 27; 52 API | +3 app routes (`account/billing`, `contacts/from-phone`, `settings/new-contacts`), all `page--form`; +1 public (`/pricing`). No new route without an archetype. |
| 11 | AppIcon without dimensions | 290/290; 108 CSS svg rules; 9 `data-icon` selectors | 304/304; 113 rules; 9 selectors | Same proportion (+14 uses, +5 sizing rules). |
| 12 | Width breakpoints | 195 features, 40 values, 69 in-set, 126 off-set | 199, 40, 72, **127** | +1 off-set: `product.css:427` `max-width: 600px` (New contacts page; 600 is a JITM-07 §2.1 supporting value). Minor new drift. |

**Extra measure (not in the baseline):** 159 `font-size` declarations under 13px in owner-facing CSS. This counts all of `src/styles/*.css` and `src/components/*.module.css` with comments stripped, excluding staff files (`admin*`, `AdminReports`) and marketing files (`homepage`, `design-public`, `public-documents`, `ProductDemo`). By file:

| File | Declarations |
|---|---|
| `WorkflowJourney.module.css` | 43 |
| `design-workspaces.css` | 25 |
| `components.css` | 21 |
| `live-search-cards.css` | 8 |
| `mega-mixes.css` | 8 |
| `design-details.css` | 7 |
| `product.css` | 6 |
| `support.css` | 6 |
| other files | 35 |

Most common values: 12px (87), 12.48px (20), 11px (16). Some are legitimate (tab and compact-rail labels at 12px, hidden badges); the count is a trend measure, not a defect list. I propose adding it as metric 13.

---

## 7. Captures needed / NOT RUN

All of these are NOT RUN because the lane is read-only.

- **ReviewDialog open:** `/mixes?mix=…&view=edit`, change "Who is this Mix for?", then "Review and start". Check the header, focus and sticky actions at 390 and 1440, light and dark.
- **TimezonePicker sheet open:** Calendar editor, then "Change" next to Event timezone, at 390. Check the "Selected" label and focus on the search field.
- **WhenPicker Time view with taken and buffered slots:** `/calendar?date=2026-10-09`, then New event, then the time trigger, on a day with "Site visit — deck repair" and a buffer set. This confirms the invisible stripes (DSN-24; code-verified only).
- **Contacts selection mode on a phone:** Contact tools, then "Select contacts", at 390. Check the "Done" control's native look (DSN-12; desktop runtime and phone code only).
- **Import results and Recent imports in dark** (phone-dark and laptop-dark): the native `<progress>` and button in dark.
- **Loading states** (DSN-13): a slow network on `/journey`, `/marketplace`, `/settings`, `/account`, `/help`.
- **Breakpoint gap:** `shots/breakpoints/mixes-1199.png` captured the "Checking your account…" screen, not Mixes, so the Mixes layout at 1199px is unverified.
- **200% text, keyboard order through sheets and disclosures, sheets at 480px height or less** (JITM-10 §2.3, §2.9; JITM-07 §2.26): not captured.
- **Profile sheet and phone contact-tools captures:** these image files exist, but I could not inspect them visually in this session. Their verdicts rest on code (`AppShell.tsx:59-72`) and the laptop capture of Contact tools.
