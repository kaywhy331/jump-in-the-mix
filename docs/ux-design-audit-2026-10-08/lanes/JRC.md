> Lane report JRC (Journey and Calendar) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# JRC — Journey and Calendar (UX / design / layout audit, 2026-10-08)

Audited: `origin/main` f23db11 (= production dae3fab + docs), worktree the repository. Evidence paths are relative to `<captures>` unless they start with `src/`. Screens are the lead's captures. I ran nothing; every claim below is from a capture or a code line I opened.

Severity policy (JITM-17 §2.14, applied strictly): HIGH = a customer-visible MUST violation on a main surface, or a path where the owner will probably get stuck. A MUST violation on a rare or setup-only surface, or a 1–2px miss, is graded MEDIUM, and the row says "MUST" so the lead can re-grade.

## 1. Lane summary

**Verdict: neither page is optimal for its job yet.** Journey has the right pieces: a real Mix graph, counts that filter people, written in/out lists, Start for someone, and editing with a draft that survives conflicts. But the default presentation hides them. Every width opens the map auto-fitted to 15–22% zoom, where Mix names render at 8px and are cut off. Below 70% zoom, line labels, result numbers and connection points disappear. From 1200 to 1699px, both the selected Mix's lists and the Start form land below the fold (y≈1,044 and y≈2,300 at 1440×900). Calendar's booking tools are good: a When picker that greys out taken times, duration chips, an overlap guard and the plain "No invitation is sent". But its agenda answers "which follow-ups are due" rather than "which appointments do I have". On Thursday, 22 follow-up rows bury both appointments, and the first appointment is about 1,950px down on a phone and at 1440. Its text is 12px, and its contact context sits about 4,000px below the editor at 1440.

**Change first:**
1. **Calendar agenda, appointments first.** Collapse follow-ups into one summary row per day ("22 follow-ups due · Review in Today"), mark follow-ups and appointments differently (as the export does), and add a today marker and dots to the week strip.
2. **Journey opens readable.** Open at 100% scrolled to the first numbered Mix or the selected one. On phones, open a visible List view with people counts; it already exists but is hidden in Options. Keep Fit map as an on-demand overview.
3. **Journey keeps the work in view at 1200–1699px.** Treat `?start=1` as a focused Start panel or sheet with the person picker first. Dock the selected Mix's in/out summary inside the map pane instead of below it.
4. **Calendar event editor.** Use one "With" person field (type-ahead plus Add new person) placed after "How long", put "After the visit: Mix" last as in the export, and drop the reload-based "Find a contact for this event".
5. **Fixes that build trust.** Each Calendar action gets a specific confirmation that names the event and time. Show visit outcomes (Visit happened / No-show) on the card and on Today. Raise the Calendar text floor to 13px.

## 2. Page and overlay verdicts

### Lead observations checked

| Obs | Result |
|---|---|
| O42 | **True.** Thursday has 22 follow-up rows. The week strip has no today marker or day dots (`aria-current` is set only in single-day view, `src/app/(app)/calendar/page.tsx:78`). At 1440/1920, "Next week" wraps to a second row; on a phone the three buttons stay on one row, but "Previous week" wraps inside its button. The editor asks for the Mix (`src/components/CalendarEntryForm.tsx:101`) before the Contact (`:103`), and "Find a contact for this event" sits after the Save row (`page.tsx:89`). There is also a third person control, "Add a new person for this visit" (`CalendarEntryForm.tsx:89`). |
| O43 | **True, and wider than reported.** Every Calendar action (save, Visit happened, No-show, Hold, Allow automatic sending, Cancel) redirects with `saved=1` and shows the same "Calendar updated." (`src/lib/calendar-actions.ts:29-36,46-76`; `page.tsx:75`). |
| O45 | **True.** Also: at 320×700 no map is visible on the first screen. The 15% floor (`src/components/WorkflowJourney.tsx:119`) still leaves B10–B13 off the right edge at 390, so "Fit map" does not fit. Phone node buttons are 37×28. |
| O46 | **Partly correct.** The in/out card starts *directly below* the map at y=1,044 (144px below a 900px fold), not ~1,000px below the map. The Mix's details (Edit Mix, Beats) start at y≈1,600. Names are truncated and render at 8px. |
| O47 | **True; meaning resolved.** "+N" counts the person's extra current positions, and every pending Beat is a position (`src/lib/workflow-analytics.ts:42`; `src/components/WorkflowPeople.tsx:33`). For "B1 · New project inquiry +1" the extra position is usually that Mix's second pending Beat, not a second Mix. |
| O51 (coordinator) | **True.** Verified: the Contact select is limited to `take: 200` (`page.tsx:49`). The profile's only persistent "Schedule a meeting" is at the bottom of the "Journey stage for {name}" sheet (`src/components/ContactJourneyPanel.tsx:22`, opened from the stage chip at `src/components/ContactProfile.tsx:213`; seen in `shots/overlays/phone-light/x-contact-stage.png`). It is missing when the account has no Contact stages (`ContactJourneyPanel.tsx:12`). Other booking routes: Quick Add's Event capture (`src/components/QuickAdd.tsx:179`), and a one-off "line it up with a visit" link shown only after starting an appointment-timed Mix (`ContactProfile.tsx:195`). Today's review components have no calendar or booking link (grep of `JumpWorkflow.tsx`, `EditableFollowUpAction.tsx`, `JumpActionControls.tsx` found none). |

### Journey — phone default (Map pane), `/journey` at 390 and 320

- **Purpose:** see how Mixes connect and who is where, then act on a person or a Mix.
- **Works well:** a People / Map / Details switcher keeps panes mounted (JITM-07 §2.2). Tiles filter people and jump to the People pane (`WorkflowJourney.tsx:183-189`). 44px zoom controls.
- **Gets in the way:**
  - About 430px of chrome sits above the map: title and Mega-Mix row ≈130px, 7–8 tiles in two rows ≈128px, view tabs and Options ≈72px, zoom row ≈48px, legend ≈55px. The map gets ≈208px of the 844px screen (`shots/sweep/phone-light/journey.png`) and none at 320×700 (`shots/sweep/phone320-light/journey.png`).
  - The map itself is unusable (JRC-01).
  - The legend explains the colours of a selection that doesn't exist yet.
  - The page's only h1 ("Journey") is in the hidden People pane (JRC-17).
  - "Details" uses the ••• icon, which elsewhere means "more actions".
- **Verdict: Needs rework.**
- **Recommended structure:**
  - Title row: "Journey" plus the Mega-Mix select.
  - One toolbar row: Setup / Progress / Results plus a **Map | List** toggle (List is the phone default).
  - Tiles become a single horizontal row of three to four counts, or move to the top of the People pane, since they filter people.
  - Show the legend only while a Mix is selected.
  - In List view, each Mix row shows "A1 · New project inquiry · 12 here" with its Beats and paths, and tapping a row opens its details sheet.
  - The map stays one tap away, opening at a readable zoom.

### Journey — map canvas (fit, zoom, pan, numbering, node cards, lines, legend, help), all widths

- **Purpose:** understand and repair connections.
- **Works well:**
  - At 100% (only seen in the Start flow capture, `shots/overlays/laptop-light/x-mix-start.png`), cards are clear: name, number badge, "12 here · 12 total", Beats with A1.a/A1.b and timing, choice point, and labelled connection boxes.
  - Panning follows JITM-09 §2.59.
  - Lines keep a 3:1 stroke.
- **Gets in the way:**
  - It opens auto-fitted by width, clamped at 15% (`WorkflowJourney.tsx:44,119-120`): 15% at 390, 21% at 1440, 22% at 1920.
  - Below 30% zoom, names and numbers are forced to 8px (`:231` inline `8 / zoom`) and truncated to 7–12 characters (`crops/JRC/journey-1440-nodes-zoom4x.png`). Two Mixes both read "Estimat…" (A1 and B3).
  - Below 70% zoom, line labels and results are hidden (`WorkflowJourney.module.css:207`), and so are connection points (`WorkflowJourney.tsx:112`).
  - The canvas is sized to the viewport, not the content, so at 1440 and on tablet about half of it is empty below the nodes.
  - Columns don't follow the numbers (JRC-13).
- **Verdict: Needs rework** (on the default zoom; the cards themselves are fine).
- **Recommended structure:**
  - On open, use 100% at ≥768px (or the owner's last zoom), scrolled to the selected Mix or the first numbered Mix.
  - Fit map stays as an explicit overview. In overview, show number chips and people counts at ≥13px and put names in a side list, instead of 8px text.
  - Lay columns out in number order, or put a numbered outline beside the map.

### Journey — stat tiles and Mega-Mix switcher

- **Purpose:** headline counts that filter people; choose which pipeline to view.
- **Works well:** tiles are real buttons with `aria-pressed`. Paused/Stopped/Not started/No Mix appear only when non-zero (`WorkflowPeople.tsx:14`). The switcher keeps `?megaMix=` (JITM-09 §2.53).
- **Gets in the way:**
  - "0 Needs attention" is always red (JRC-05).
  - Active and Waiting overlap: 22 + 23 + 16 > 39, because one person can hold both statuses. The tiles look like a split of the total, and the explanation is in a collapsed "About these counts" in the *People* pane.
  - "Not started" and "No Mix" both show 16 with no visible difference.
  - On phones the select is 158×42 (JRC-14).
  - Numbering changes with the switcher, e.g. B1 vs A1 (known: JITM-05 §6 / B-13; re-confirmed in JRC-12).
- **Verdict: Good, fix details.**
- **Recommended structure:** red only when the count is above 0. Explain "Waiting" and "Not started vs No Mix" in one line under the tiles, or merge the latter into the glossary term No Mix. On phones, show Needs attention first only when it is above 0.

### Journey — People roster (directory pane), 1440 and code

- **Purpose:** find a person and see where they are; open their work.
- **Works well:** search, status and stage filters kept separate (JITM-09 §2.71); ten per page (§2.60); a numbered Mix on every row; one-click "open contact".
- **Gets in the way:**
  - The "+N" suffix (JRC-04).
  - Stage, status, Beat and due time are only in a `title` tooltip (known: JITM-10 §6 / B-05; re-confirmed in `WorkflowPeople.tsx:30-32`).
  - The pane header carries "Choose a complete Mega-Mix", a catalogue link, above the roster.
  - On phones, choosing a person sends the owner to the unreadable Map pane instead of their work (JRC-15).
- **Verdict: Good, fix details.**
- **Recommended structure:** add a second line per row: "Inquiry · Waiting · next: B1.b Agree on the next step · Fri 10:00 AM" (this also fixes B-05). Move "Choose a complete Mega-Mix" into the empty state and the Mixes area.

### Journey — selecting a Mix (`journey-node`), 1440 and 390

- **Purpose:** follow a Mix's incoming and outgoing paths, then edit or start.
- **Works well:**
  - The written in/out lists name each path and destination ("Site visit agreed → Site visit follow-through"), which meets JITM-10 §2.7/§2.16.
  - The People pane re-filters to "New project inquiry 12".
  - Scroll and zoom are kept (JITM-09 §2.59).
- **Gets in the way:**
  - At 1440×900 nothing else changes in view. The card starts at y=1,044 and the details at y≈1,600 (`shots/overlays/laptop-light/journey-node-full.png`).
  - The only "View Mix details" button is inside that off-screen card (`WorkflowJourney.tsx:235`). The "View details" shortcut exists only for a selected *person* (`:212`).
  - On phones the card starts at ≈1,000px, below a 50dvh canvas with `overscroll-behavior: contain` (`WorkflowJourney.module.css:3,172`), so one-finger drags on the map scroll the map, not the page.
- **Verdict: Needs rework at 1200–1699 and on phones; Good at ≥1700.**
- **Recommended structure:** without moving the map, dock a compact selection panel *inside* the map pane: name and number, "Into 1 · From 4", View details, Start for someone, Edit Mix. Put it bottom-right on desktop and use a peek bottom sheet on phones. Alternatively, at 1200–1699, show it at the top of the People pane while a Mix is selected.

### Journey — Setup / Progress / Results views (code; Setup at 100% seen only in the Start flow)

- **Purpose:** Setup shows what can happen and what is missing; Progress shows who is where; Results shows how connections perform (JITM-09 §2.52).
- **Works well:**
  - One graph with three views.
  - Setup issues are listed and clickable.
  - The connection editor opens "off" and keeps the draft on conflict (`src/components/WorkflowRuleEditor.tsx:81,136-147`).
  - Results stays neutral without an owner target (§2.58).
- **Gets in the way:**
  - At the default fitted zoom, Setup has no connection points while its copy says "Select a Mix or drag points to connect." (JRC-08).
  - At the same zoom, Results hides every per-path number (JRC-09).
  - The view isn't in the URL, so reload or Back returns to Progress (JRC-19). The lead's `?view=setup` and `?view=results` captures are pixel-identical to Progress.
  - "1 setup issues" (JRC-10).
  - The editor and Results copy uses internal words (JRC-11).
- **Verdict: Good, fix details** (runtime NOT RUN for Setup/Results tabs; see §7).
- **Recommended structure:** choosing Setup or Results below 70% zooms to 100% around the selected or first Mix and says so. Add `?view=` to the address. Add a Results table ("path · moved on · waiting · on hold") as the List equivalent.

### Journey — Start flow (`/journey?mix=…&start=1`), 390 and 1440

- **Purpose:** after adding a Mega-Mix (13 "Start" buttons in `src/components/MegaMixLibrary.tsx:33`) or adding a person with `returnTo`, start one person on a Mix.
- **Works well:**
  - On phones the Details pane opens with the form near the top (`shots/overlays/phone-light/x-mix-start.png`).
  - The schedule preview runs before starting.
  - The start is idempotent through a request id (`WorkflowJourney.tsx:58-63,257`).
  - The success notice links to reminders.
- **Gets in the way:**
  - At 1440 the page opens on the Setup map at 100% with drag handles. The Person field is at y≈1,900 and "Start this Mix" at y=2,297–2,340, with no scroll or focus (`x-mix-start-full.png`).
  - "Connect next" is the filled primary and "Start for someone" an outlined toggle with no expanded state, even though the form is open below (`:256`).
  - The person picker is a select of the first 50 contacts plus a separate "Find someone" box whose Find button also filters the roster (JRC-20).
  - Setup tools (path list, "Finish this path here", setup issues, simulation) share the pane.
  - The preview shows the raw "America/New_York" (JRC-30).
  - The Mix is "A1" here and "B1" on the default map (known B-13).
- **Verdict: Needs rework.**
- **Recommended structure:**
  - `start=1` opens a Start panel: a desktop side sheet over the map, a phone bottom sheet.
  - Inside: heading "Start New project inquiry"; one type-ahead **Person** field (with Add a person / Import people as quiet links); an optional "What is it for?"; the preview; a single primary "Start this Mix".
  - Setup tools appear only after closing it.
  - This also honours JITM-01 §2.11: starting someone shouldn't require the graph UI.

### Journey — Details pane default, person card and quiet-day entry

- **Purpose:** context for what is selected; the full quiet-day list (JITM-09 §2.61).
- **Works well:** the empty state explains selection. The person card (`src/components/WorkflowProgress.tsx:14-31`) groups Review, Link appointment, outcomes, pause/resume/stop with confirmations.
- **Gets in the way:**
  - "Your journey: Mixes 14 / Beats 27 / Enabled connections 13" is low value.
  - The person card shows raw statuses ("active", "pending") and "Saved configuration {n}" (JRC-11).
  - Today's "View all check-ins" opens `?touchpoint=quiet-days`, whose list sits at the bottom of Details. At 1200–1699 that is below the map, with no scroll (JRC-16).
- **Verdict: Good, fix details.**
- **Recommended structure:** scroll and focus the check-ins list on arrival (or host it on Today, which needs Kevin). On phones, choosing a person opens Details first.

### Journey at ≥1700 (`shots/sweep/desktop-light/journey.png`)

- **Works well:** the three columns (people · map · details) work as JITM-07 §2.13 intends; details stay in view.
- **Gets in the way:** the fitted map is still 22%, with 8px names.
- **Verdict: Good, fix details** (default zoom only).

### Calendar — agenda (`/calendar` at 390, 834, 1440 and 1920)

- **Purpose:** see the week's appointments and their people, and get to a booking or an outcome.
- **Works well:**
  - Day headings.
  - Each follow-up row links to its Today review (`page.tsx:82`).
  - Appointments carry an "Event details and actions" disclosure.
  - Empty days say "No time reserved."
- **Gets in the way:**
  - Every pending follow-up is its own row (`page.tsx:67-71,81`): 22 at 10:00 AM on Thursday, about 60 in the week.
  - The first appointment is at y≈1,946 on a phone and y≈1,998 at 1440 (`shots/sweep/phone-light/calendar-full.png`, `shots/sweep/laptop-light/calendar-full.png`). The phone page is 5,435px tall.
  - Follow-ups, meetings, time blocks and connected-calendar busy time all use the same 2px violet bar (`src/styles/design-workspaces.css:336`), and the kind label is hidden by CSS (`:339`).
  - Appointment rows show title and time but not who, where or how long. The contact is only inside the disclosure (compare `shots/export/Calendar.png`: "Tom Becker, 418 Alder St, 30 min").
  - The rows' "Review →" cue is hidden (`:395`), and follow-up text is 12px (JRC-22).
  - "1–2 of 2 matching events" / "No matching events" counts only appointments, under dozens of rows (JRC-36).
- **Should Calendar list every follow-up?** No. Calendar is "your meetings and time blocks" (JITM-05 §2.2), and Today already holds the follow-up list. The export does mix in follow-ups, but as sample data of 1–2 a day with a different marker. At real volume (one Mega-Mix gives 22 at the same minute), per-row listing turns Calendar into a second Today.
- **Better design:**
  - (a) **Appointments first:** appointment rows keep full detail: time, title, "Carla Chen · 30 min · 418 Alder St".
  - (b) **One follow-up summary row per day**, grouped by time: "10:00 AM · 22 follow-ups due — Review in Today". It is expandable to names, uses the export's hollow-circle marker, and links to `/jumps` for that date.
  - (c) An optional, per-viewer "Show follow-ups: Summary / Each / Hide" switch.
  - (d) Week strip dots for days with appointments and a small count for follow-ups.
  - (e) Collapse empty days ("Sat and Sun are open", as in the export).
- **Verdict: Needs rework.**

### Calendar — week strip, week navigation, "Find a date or event"

- **Works well:** 44px week buttons on phones; the search covers event titles and follow-up names.
- **Gets in the way:**
  - No today marker and no dots (export: filled today, dots).
  - Tapping a day re-anchors the strip on that day (the strip always starts at `date`, `page.tsx:78`; `shots/overlays/*/calendar-event-open.png` starts at Fri 9).
  - The heading stays "Your next seven days" for past weeks.
  - The raw zone id sits beside it.
  - At 320 the seventh day scrolls off-screen with no cue (`shots/sweep/phone320-light/calendar.png`).
  - About 280px of controls sit above the first row on phones.
- **Verdict: Good, fix details.**
- **Recommended structure:** a stable week (locale start day) with filled today and dots, "This week" / "Week of Oct 12" headings, and "Previous / Today / Next" as one compact segmented row of chevron icons with text labels. Move "Find a date or event" behind a search icon on phones.

### Calendar — event card details (`calendar-event-open`, 390 and 1440)

- **Works well:** the outcome pill plus "Visit happened" / "No-show". The Mix binding with Hold and "Allow automatic sending". Cancel behind a named ConfirmDialog (JITM-08 §2.7).
- **Gets in the way:**
  - Recording the outcome, which releases after-visit Beats ("Follow-ups after the visit wait until you record how it went.", `page.tsx:82`), is hidden in a collapsed disclosure, and nothing on Today asks for it (JRC-29).
  - Buttons stack one per line and right-align in a narrow column (`crops/JRC/cal-event-open-laptop.png`).
  - The time line repeats the date and shows the raw zone ("Oct 9, 9:00 AM – Oct 9, 9:30 AM · America/New_York").
  - The contact link is 12px.
- **Verdict: Good, fix details.**
- **Recommended structure:** once a visit has started, show "How did it go? [Visit happened] [No-show]" on the card itself. Put Edit · Download · Cancel event… in one row. Write the time as "9:00–9:30 AM".

### Calendar — event editor, New and Edit (`calendar-laptop-light.png`, `flow-cal-form-filled.png`, `flow-cal-whenpicker-open.png`)

- **Purpose:** book a visit or time block with a person, optionally lining up a follow-up Mix.
- **Works well:**
  - The **When picker is close to optimal**: Date/Time tabs, quick chips, and a month grid with today outlined and the selection filled. Taken times are greyed by name. The "Ends 9:30 AM" summary.
  - Duration chips with `aria-pressed`.
  - "Saved to your calendar only. No invitation is sent."
  - The draft survives errors (controlled fields, FormGuard).
- **Gets in the way:**
  - Field order puts the Mix before the person, and person choice is split three ways (JRC-25).
  - The Contact select is capped at 200, and the alternative search reloads the page (JRC-26).
  - The title has only a placeholder (JRC-32).
  - The Mix row uses a stacked layout unlike the label-column rows.
  - The Mix can't be added to a saved visit (JRC-40).
  - The overlap override is hidden in "More event details" (JRC-33).
  - On desktop the editor opens the *next appointment* in edit mode by default (`page.tsx:52`). That matches the export, but it is not sticky (JRC-37).
  - On phones the editor renders after the whole agenda, so "New event" jumps ~4,500px down. Inferred from DOM order (`page.tsx:77-86`) and `design-workspaces.css:361`; not captured.
- **Verdict: Good, fix details** (phone placement needs a capture).
- **Recommended structure:**
  - Order: Title (visible label "What is it?") · Meeting/Time block · Starts · How long · **With** (type-ahead over all contacts; "Add new person" expands Name/Phone/Email inline) · Where · Time zone · More details · **After the visit: follow-up Mix** (also on Edit) · Save.
  - On phones, open the editor as a full-screen sheet over the agenda.

### Calendar — after-save notices (`flow-cal-after-save.png`)

- **Works well:** it says no invitation was sent (JITM-04 §2.10) and offers the download.
- **Gets in the way:** two stacked notices push the page down. "Calendar updated." names neither the event nor the time (JITM-04 §2.7), and the same words follow every action (JRC-28).
- **Verdict: Good, fix details.**
- **Recommended structure:** one notice: "Site visit — deck repair saved for Fri, Oct 9 at 9:00 AM. No invitation was sent. Download to share." Add specific wording for outcome, hold, sending and cancel.

### Calendar — contact context column

- **Purpose:** reach the person you're booking.
- **Works well:** at ≥1700 it sits beside the editor (`shots/sweep/desktop-light/calendar.png`) with tel/mailto links and the last note.
- **Gets in the way:**
  - At 1100–1699 it is placed in grid row 2 (`src/styles/design-details.css:156`), under the 5,000px agenda, ≈4,000px below the editor (`shots/sweep/laptop-light/calendar-full.png`).
  - On phones it appears at the page bottom for the first upcoming event even when no event is open, with no heading saying why (`crops/JRC/cal-phone-bottom.png`; `page.tsx:52-54,91`).
  - "No journey stage" wording.
  - Its links are 18px tall.
  - No "Coming up", unlike the export.
- **Verdict: Needs rework at 1100–1699 and on phones; Good at ≥1700.**
- **Recommended structure:** inside the editor panel, under the form (or let the agenda span both grid rows). On phones show it only with an opened event. Add "Coming up" (next follow-ups) per the export.

### Calendar — "Calendar connections and sharing" (`calendar-connections`, 390 and 1440)

- **Works well:** boxed disclosure (JITM-08 §2.20). Clear provider instructions. Destructive actions confirm.
- **Gets in the way:**
  - It is at the very bottom of the page (≈5,900px down on phones).
  - "while the worker runs" (JRC-34).
  - There are five separate download entry points across the page.
- **Verdict: Good, fix details.**
- **Recommended structure:** add a header "•••" (Calendar tools: Connections and sharing, Download calendar) and keep the panel as the destination.

## 3. Findings table

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|---|
| JRC-01 | JITM-10 §2.2, §2.1 (MUST); JITM-07 §2.20 | Journey opens auto-fitted (15% at 390, 21% at 1440, 22% at 1920). Names and Mix numbers render at 8px and truncate. Below 70%, line labels, result numbers and connection points are hidden. At 390 the 15% floor still leaves B10–B13 off-screen. Phone node buttons are 37×28 and "here" buttons ≈33×28. | `shots/sweep/phone-light/journey.png`; `shots/sweep/laptop-light/journey.png`; `shots/sweep/desktop-light/journey.png`; `crops/JRC/journey-1440-nodes-zoom4x.png`; `shots/sweep/phone-light/_results.json`; `src/components/WorkflowJourney.tsx:44,89-90,112,119-120,231`; `src/components/WorkflowJourney.module.css:14,16,207` | VERIFIED-RUNTIME, VERIFIED-CODE | HIGH | Open at a readable zoom scrolled to the first or selected Mix; phone default = List; overview never below 13px text or 44px targets. |
| JRC-02 | JITM-09 §2.59 (lists exist, out of view); JITM-07 §2.13 as written | Selecting a Mix at 1200–1699 leaves the in/out card at y=1,044 and the Mix details at ≈1,600 (900px fold). The only "View Mix details" is inside that card. On phones the card is ≈1,000px down, below a canvas that traps one-finger scrolling. | `shots/overlays/laptop-light/journey-node.png` vs `journey-node-full.png`; `shots/overlays/phone-light/journey-node-full.png`; `src/components/WorkflowJourney.tsx:190-191,234-240`; `src/components/WorkflowJourney.module.css:3,145-170,172` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Dock the selection summary inside the map pane (desktop) or a peek sheet (phone); keep the map still. |
| JRC-03 | JITM-10 §2.12; JITM-01 §2.11; JITM-09 §2.55 | Start flow at 1440 opens the Setup map. Person is at y≈1,900 and "Start this Mix" at y=2,297–2,340, with no scroll or focus. "Connect next" is the filled primary while the open form belongs to the outlined "Start for someone" (no expanded state). | `shots/overlays/laptop-light/x-mix-start.png`, `x-mix-start-full.png`; `shots/overlays/phone-light/x-mix-start.png`; `src/components/WorkflowJourney.tsx:28,39,57,256-257`; `src/components/MegaMixLibrary.tsx:33` | VERIFIED-RUNTIME, VERIFIED-CODE | HIGH | `start=1` opens a focused Start panel or sheet; person first; one primary; Setup tools after. |
| JRC-04 | JITM-09 §2.60; JITM-05 §2.7 | People rows add "+N" with no meaning shown. N = extra current positions, and every pending Beat counts, so "+1" usually means the Mix's second Beat. Details live only in a tooltip (known B-05). | `shots/sweep/laptop-light/journey.png`; `src/components/WorkflowPeople.tsx:28-33`; `src/lib/workflow-analytics.ts:42` | VERIFIED-RUNTIME (label), VERIFIED-CODE (meaning) | LOW | Second line with next Beat and due time; "+1 Mix" only for other Mixes. |
| JRC-05 | JITM-06 §2.11 | "Needs attention" is red even at 0. | `shots/sweep/phone-light/journey.png`; `src/components/WorkflowJourney.module.css:49` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Danger colour only when above 0. |
| JRC-06 | JITM-07 §2.20 (map is the pane's content) | On phones ≈430px of title, tiles, tabs, zoom and legend precede the map. The map gets ≈208px at 390×844 and is not visible at 320×700. | `shots/sweep/phone-light/journey.png`; `shots/sweep/phone320-light/journey.png` | VERIFIED-RUNTIME | MEDIUM | One title row, one toolbar row, tiles in one scroll row or in People, legend only on selection. |
| JRC-07 | JITM-10 §2.16; JITM-09 §2.52 | The structured list (required equivalent, best phone view) is behind Options → "Show list". The canvas name says "A structured list is available above". The list shows no people counts. | `src/components/WorkflowJourney.tsx:214-215,225,229` | VERIFIED-CODE (open state NOT RUN) | MEDIUM | Visible Map / List toggle; counts in the list. |
| JRC-08 | JITM-09 §2.56 | In Setup at the default fitted zoom there are no connection points (they need ≥70%). Details still says "Select a Mix or drag points to connect."; the hint "Drag points to connect." never mentions tapping. | `src/components/WorkflowJourney.tsx:112,263`; `src/components/WorkflowConnections.tsx:137` | VERIFIED-CODE | MEDIUM | Zoom to 100% when entering Setup, or say "Zoom to 70% or more to connect"; "Drag or tap two points". |
| JRC-09 | JITM-09 §2.52, §2.58 | Results at the fitted zoom hides every per-path number (edge labels hidden in overview). At 1200–1699 the text results are below the map. | `src/components/WorkflowJourney.tsx:178,268`; `src/components/WorkflowJourney.module.css:207` | INFERRED (from code; Results tab not captured) | MEDIUM | Readable default zoom plus a Results table. |
| JRC-10 | JITM-05 §2.15 | "1 setup issues". | `shots/overlays/phone-light/x-mix-start-full.png`; `src/components/WorkflowJourney.tsx:264` | VERIFIED-RUNTIME | LOW | Singular for 1. |
| JRC-11 | JITM-05 §2.11, JITM-04 §2.6 (MUST; setup surfaces) | Internal words in Journey copy: "instances" (`WorkflowJourney.tsx:259`, `WorkflowRuleEditor.tsx:134`), "traversals" (`:140`), "source run" (`:129`), "cohort" (`WorkflowJourney.tsx:268`), "Saved configuration {n}" (`WorkflowProgress.tsx:28`), "Beat visits" (`WorkflowSimulation.tsx:20`), raw lowercase statuses "active"/"pending" (`WorkflowJourney.tsx:225,231,255`; `WorkflowProgress.tsx:19,28`). | files at left; "active · Manual or connected start" seen in `shots/overlays/laptop-light/x-mix-start.png` | VERIFIED-CODE; VERIFIED-RUNTIME ("active") | MEDIUM | §4 replacements. |
| JRC-12 | JITM-09 §2.54 (known: JITM-05 §6, B-13) | Re-confirmed: New project inquiry is "B1" on the default map and in people rows, "A1" in the Start flow / Contractor view. | `shots/sweep/laptop-light/journey.png` vs `shots/overlays/laptop-light/x-mix-start.png` | VERIFIED-RUNTIME | known (B-13, MEDIUM) | Build B-13. |
| JRC-13 | none — gap | Map columns don't follow the numbers. Row 1 reads A1, B2, B3, B6, B4, B9, B10, B7, B13, B12, and B1 sits under A1, so scanning for "B4" is guesswork. | `shots/sweep/desktop-light/journey.png`; `shots/sweep/laptop-light/journey.png` | VERIFIED-RUNTIME | LOW | Order columns by journey number, or show the numbered outline beside the map. |
| JRC-14 | JITM-10 §2.1 (MUST, ≤2px) | The Mega-Mix select is 158×42 at ≤900px. | `shots/sweep/phone-light/_results.json` | VERIFIED-RUNTIME | MEDIUM | 44px min-height. |
| JRC-15 | JITM-10 §2.12 (focus where the work is) | On phones, choosing a person switches to the Map pane (15% zoom). Their work card (pause, stop, record outcome) is in Details, reachable only through the pane switcher; the "View details" shortcut is hidden below 1200px. | `src/components/WorkflowJourney.tsx:192-197,212`; `src/components/WorkflowJourney.module.css:189` (`.detailsShortcut` shown only 1200–1699) | VERIFIED-CODE (NOT RUN runtime) | MEDIUM | On phones open Details first, with "Show on map" as secondary. |
| JRC-16 | JITM-09 §2.61 | Today's "View all check-ins" opens `/journey?touchpoint=quiet-days`. The list is the last item in Details, which at 1200–1699 sits below the map, with no scroll or focus. | `src/app/(app)/journey/page.tsx:17-18`; `src/components/WorkflowJourney.tsx:39`; `src/components/QuietDaySuggestions.tsx:66` | INFERRED (from code; quiet days off in demo) | MEDIUM | Scroll and focus on arrival, or host the full list on Today (Kevin). |
| JRC-17 | JITM-10 §2.15 | On phones the default Map pane hides the page's only h1 ("Journey" is in the hidden directory). | `src/components/WorkflowJourney.tsx:207`; `src/components/WorkflowJourney.module.css:164-168` | VERIFIED-CODE | LOW | Keep an h1 in every pane, or make "Journey map" the h1 on phones. |
| JRC-18 | JITM-10 §2.15; JITM-08 §2.19 | "Start for someone" is a toggle with no `aria-expanded` or pressed state. "Finish this path here" saves on tick with no saved state, and its box touches the label. | `shots/overlays/phone-light/x-mix-start-full.png`; `src/components/WorkflowJourney.tsx:256,260` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | `aria-expanded`; a switch row with a "Saved" status. |
| JRC-19 | none — gap | The Journey view (Setup/Progress/Results) is client state only. Links can't open a view; reload and Back reset to Progress. | `src/components/WorkflowJourney.tsx:28,214`; `?view=` captures identical to Progress | VERIFIED-CODE, VERIFIED-RUNTIME | LOW | `?view=` like `?megaMix=`. |
| JRC-20 | JITM-08 §2.28 (picker shows the current value first) | The Start person picker is a select of the first 50 contacts (`src/lib/mix-workflow-view.ts:40`) plus a separate "Find someone" box whose Find button also refilters the People roster. | `src/components/WorkflowJourney.tsx:257` | VERIFIED-CODE | MEDIUM | One type-ahead person field, shared with Calendar. |
| JRC-21 | JITM-05 §2.2 (Calendar = meetings and time blocks); JITM-06 §2.33 (export: distinct markers, contact/place on rows); JITM-07 §2.21 | The agenda lists every follow-up as its own row: 22 at 10:00 AM Thu, about 60 in the week. The first appointment is at y≈1,946 (390) / ≈1,998 (1440), on a 5,435px phone page. All kinds share one 2px violet bar, the kind label is hidden by CSS, and appointment rows omit person, place and length. | `shots/sweep/phone-light/calendar-full.png`; `shots/sweep/laptop-light/calendar-full.png`; `shots/calendar-laptop-light.png`; `shots/export/Calendar.png`, `DesktopCalendar.png`; `src/app/(app)/calendar/page.tsx:67-71,81-82`; `src/styles/design-workspaces.css:336,339,395` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Appointments first; one follow-up summary row per day/time linking to Today; export markers; who/where/length on appointment rows. |
| JRC-22 | JITM-10 §2.2 (MUST) | Calendar's main content is 12px: weekday labels, every follow-up time and Mix name, event-details text and the "Saved to your calendar only. No invitation is sent." line. 125 sub-13px elements on the phone page. | `shots/sweep/phone-light/_results.json` (`smallCount` 125); `src/styles/design-workspaces.css:190,340,345,346,397`; `src/styles/design-details.css:150` | VERIFIED-RUNTIME, VERIFIED-CODE | HIGH | 13px (0.8125rem) on those rules; add Calendar to the text-floor test (JITM-10 §6 notes it is uncovered). |
| JRC-23 | JITM-06 §2.33 (export: today marker plus dots); JITM-10 §2.7 | The week strip marks neither today nor days with events, re-anchors on the tapped day, keeps "Your next seven days" for other weeks, and hides the seventh day at 320 with no cue. | `shots/sweep/phone-light/calendar.png`; `shots/overlays/phone-light/calendar-event-open.png`; `shots/sweep/phone320-light/calendar.png`; `src/app/(app)/calendar/page.tsx:78`; `src/styles/design-details.css:177-179` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Stable week, filled today, appointment dots plus follow-up counts, "Week of …" heading. |
| JRC-24 | JITM-07 §2.21 (silent on 1100–1699: gap) | The contact context sits ≈4,000px below the editor at 1100–1699 (row 2, under the agenda). On phones it shows for an unopened event at the page bottom with no heading. | `shots/sweep/laptop-light/calendar-full.png`; `crops/JRC/cal-phone-bottom.png`; `src/styles/design-details.css:156,160` and `src/styles/design-workspaces.css:354,358` (two stylesheets both position it); `src/app/(app)/calendar/page.tsx:52-54,91` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Place it inside the editor panel; on phones only with an opened event; add "Coming up". |
| JRC-25 | JITM-06 §2.33 (export order: Starts, How long, With, Where, Time zone, After the visit) | The editor asks "Follow-up Mix for this visit" before "Contact". Person choice is split across "Add a new person for this visit", the "Contact (optional)" select and "Find a contact for this event" (after Save). The Mix row uses a different, stacked layout. | `shots/flow-cal-form-filled.png`; `shots/calendar-laptop-light.png`; `src/components/CalendarEntryForm.tsx:89-105`; `src/app/(app)/calendar/page.tsx:89` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | One "With" field after How long; "After the visit" last; same row layout. |
| JRC-26 | none — gap (JITM-08 §2.30 drafts) | The Contact select holds the first 200 contacts by name. Others need the "Find a contact for this event" GET form, which reloads the page; the typed draft is lost after the browser's leave warning. | `src/app/(app)/calendar/page.tsx:49,89`; `src/components/CalendarEntryForm.tsx:80,103` | VERIFIED-CODE; INFERRED (draft loss; demo has 40 contacts) | MEDIUM | In-place type-ahead search; no reload. |
| JRC-27 | none — gap | Booking entry points: the profile's only persistent "Schedule a meeting" is at the bottom of the "Journey stage for {name}" sheet and is missing when there are no Contact stages. Today's review has no booking action. | `shots/overlays/phone-light/x-contact-stage.png`; `src/components/ContactJourneyPanel.tsx:12,22`; `src/components/ContactProfile.tsx:195,213`; `src/components/QuickAdd.tsx:179` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | "Book a visit" on the profile action row and in Today's outcome step, prefilled, returning to where it started. |
| JRC-28 | JITM-04 §2.7 | After save, two notices; neither names the event or time. Every other Calendar action also says only "Calendar updated." | `shots/flow-cal-after-save.png`; `src/app/(app)/calendar/page.tsx:75`; `src/lib/calendar-actions.ts:29-36,46-76` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | One specific notice per action (§4). |
| JRC-29 | JITM-01 §2.11 (daily work runs from Today); JITM-09 §2.62 | Visit outcomes, which release after-visit Beats, can be recorded only inside each event's collapsed disclosure. The agenda starts today, so yesterday's visit needs "Previous week". No Today item asks for it. | `shots/overlays/laptop-light/calendar-event-open.png`; `src/app/(app)/calendar/page.tsx:38,82`; `src/lib/step-timing.ts:122`; no visit prompt in `src/lib/workflow-attention.ts` or `src/lib/today-list.ts` | VERIFIED-RUNTIME (location); INFERRED (Today absence, from code search) | MEDIUM | Outcome buttons on the card after the start time; a Today "Needs your input" item for visits awaiting an outcome (Kevin). |
| JRC-30 | none — gap (JITM-08 §2.28: picker shows "New York") | The raw zone id "America/New_York" appears in the agenda header, event details, the editor sentence and the Journey start preview, while the picker shows "New York". | `shots/sweep/phone-light/calendar.png`; `shots/overlays/phone-light/calendar-event-open.png`; `shots/flow-cal-form-filled.png`; `src/app/(app)/calendar/page.tsx:78,82`; `src/components/CalendarEntryForm.tsx:104`; `src/components/WorkflowJourney.tsx:257`; `src/components/TimezonePicker.tsx:24` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Reuse the picker's city label: "New York time". |
| JRC-31 | JITM-10 §2.1 (MUST; a 44px alternative exists) | Phone targets under 44px: appointment title links 169×20 (the visible way into the editor), tel/mailto links 92×18 and 159×18. | `shots/sweep/phone-light/_results.json` | VERIFIED-RUNTIME | MEDIUM | Make the whole appointment row the target; 44px contact rows with icons (export). |
| JRC-32 | JITM-10 §2.14 | The event title has only a placeholder ("For example, Discovery call or Focus time"); its label and the kind select's label are screen-reader-only. | `shots/calendar-laptop-light.png`; `src/components/CalendarEntryForm.tsx:82-83` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | A small visible label ("What is it?"). |
| JRC-33 | JITM-09 §2.62; JITM-08 §2.22 (spirit) | The overlap override is inside collapsed "More event details". The conflict error says "allow an overlap if it is intentional" without opening it, and taken times stay disabled until it is ticked. | `src/components/CalendarEntryForm.tsx:106-109`; `src/lib/calendar-availability.ts:40-44`; `src/components/WhenPicker.tsx:234,240` | INFERRED (from code) | LOW | Show the checkbox with the conflict message and in the time-grid legend. |
| JRC-34 | JITM-05 §2.11, JITM-04 §2.6 (MUST; setup surface) | "Subscriptions are checked about every 15 minutes while the worker runs." | `crops/JRC/cal-conn-phone-bottom.png`; `src/app/(app)/calendar/page.tsx:93` | VERIFIED-RUNTIME | MEDIUM | "Subscriptions refresh about every 15 minutes." |
| JRC-35 | JITM-05 §2.3; JITM-09 §2.51 (stages are not the Journey) | Calendar calls stages "journey": "Your journey rules may start follow-ups for this person.", "No journey stage", "The contact’s current journey stage stays in place." | `shots/flow-cal-form-filled.png` (footer); `src/components/CalendarEntryForm.tsx:111`; `src/app/(app)/calendar/page.tsx:82,91` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | §4 replacements. |
| JRC-36 | JITM-04 §2.7 (say what is true) | "1–2 of 2 matching events" / "No matching events" counts only appointments and appears under dozens of follow-up rows. | `shots/calendar-laptop-light.png`; `crops/JRC/cal-phone-bottom.png`; `src/app/(app)/calendar/page.tsx:83` | VERIFIED-RUNTIME | LOW | Show only while searching or paging; "2 appointments". |
| JRC-37 | JITM-06 §2.31 (one style owner) | The editor isn't sticky. `.calendar-page > #schedule-event {position: sticky}` no longer matches (the editor moved into `.calendar-workspace`), so the right column is empty for ~4,000px while scrolling the agenda, and opening an event jumps to the top. | `src/styles/design-workspaces.css:130-133,352-354`; `src/app/(app)/calendar/page.tsx:77,86` | VERIFIED-CODE; INFERRED (stickiness can't show in full-page shots) | LOW | Sticky editor with its own scroll, or an agenda that scrolls in its column. |
| JRC-38 | none — gap | Event-card actions stack one per line, right-aligned in a narrow column ("Visit happened", "No-show", "Edit", "Download"). | `crops/JRC/cal-event-open-laptop.png`; `shots/overlays/phone-light/calendar-event-open.png` | VERIFIED-RUNTIME | LOW | Two-up outcomes; one action row. |
| JRC-39 | JITM-06 §2.33 | The phone Calendar lacks the export's "‹ More" back control, and "Download calendar" is a full-size button beside New event (export: download icon). | `shots/sweep/phone-light/calendar.png` vs `shots/export/Calendar.png` | VERIFIED-RUNTIME | LOW | Back to More; download in a tools menu. |
| JRC-40 | none — gap | A follow-up Mix can be chosen only when creating a meeting. A saved visit's editor has no Mix field; the binding shows only inside the agenda card. | `src/components/CalendarEntryForm.tsx:101` (`!entry`); `shots/flow-cal-after-save.png` | VERIFIED-CODE, VERIFIED-RUNTIME | LOW | "After the visit" field on Edit too (Kevin: binding changes on existing visits). |

## 4. Copy findings

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

## 5. Structural recommendations (ranked)

| # | Problem (D20) | Change | Expected benefit | Effort | Kevin decision? |
|---|---|---|---|---|---|
| 1 | Calendar can't answer "what appointments do I have": 22 follow-up rows on one day push the first appointment ≈1,950px down (JRC-21); all kinds look the same | Appointments-first agenda. Follow-ups become one summary row per day/time ("22 follow-ups due · Review in Today"), expandable, with the export's hollow-circle marker. Appointment rows show person · length · place. Week strip with today plus dots. Empty days collapse. Optional per-viewer "Show follow-ups: Summary / Each / Hide" | The week's visits on one phone screen; Today stays the follow-up list | M | **Yes**: departs from the export's per-follow-up rows and changes the agenda's structure |
| 2 | The Journey map is unreadable at its default on every width (8px names, no labels or points) and occupies ≈208px of a phone screen (JRC-01, JRC-06) | Open at 100% (≥768) scrolled to the selected or first numbered Mix. Fit map becomes an explicit overview with ≥13px number chips. Phones default to a visible **List** (Map / List toggle beside the view tabs, with "N here" counts). Compress the phone header into one title row and one toolbar row; tiles go in one scroll row or into People | Owners can read names, lines, results and connection points without zoom gymnastics; phones get a usable view | M | Zoom default: no. Phone List default: **yes** (JITM-07 §2.20 specifies the map on phones) |
| 3 | At 1200–1699 the Start form (y≈2,300) and the selected Mix's lists (y≈1,044) are off-screen, on the first-run path after adding a Mega-Mix (JRC-03, JRC-02) | `start=1` opens a focused Start panel (desktop side sheet, phone bottom sheet) with a type-ahead person picker and one primary action. A selected Mix shows a docked summary inside the map pane (or at the top of the People pane at 1200–1699). Optionally adopt three columns from 1200 with a collapsible People pane | First start succeeds without scrolling or hunting; selection gives feedback where the eye is | M | **Yes**: JITM-07 §2.13 says context follows the center from 1200 |
| 4 | Booking with a person is clumsy: three person controls, Mix asked first, a 200-contact cap, a search that reloads and drops the draft (JRC-25, JRC-26) | One "With" type-ahead (over all contacts, with Add new person inline) after "How long". "After the visit: follow-up Mix" last, also available on Edit. Remove "Find a contact for this event". On phones, the editor opens as a full-screen sheet | Faster, error-free booking; matches the export | M | No for order (export already shows it); **yes** for changing a visit's Mix after saving |
| 5 | Contact context is ≈4,000px below the editor at 1100–1699 and unexplained on phones (JRC-24) | Render it inside the editor panel (or let the agenda span both rows). On phones only with an opened event. Add "Coming up" | Phone number and notes next to the booking | S | No |
| 6 | After-visit Beats wait for an outcome that is recorded only inside a collapsed Calendar disclosure (JRC-29) | Outcome buttons on the card once the visit has started, plus a Today "Needs your input" item for visits awaiting an outcome | Follow-ups after visits actually happen; daily work stays on Today (JITM-01 §2.11) | M | **Yes** (Today content) |
| 7 | Every Calendar action says only "Calendar updated." (JRC-28) | One specific notice per action that names the event and time | Owner can trust what was saved | S | No |
| 8 | Booking isn't reachable from where the need arises: the profile only via the stage sheet, Today never (JRC-27) | "Book a visit" on the profile's action row and in Today's outcome step, prefilled and returning to the origin | Book in the moment a customer agrees | S–M | **Yes** (new Today action) |
| 9 | Phone person selection lands on an unreadable map (JRC-15) | On phones, selecting a person opens Details (their work), with "Show on map" as secondary | One tap to pause, record or review | S | No |
| 10 | Quiet-day "View all check-ins" lands below the map at 1200–1699 (JRC-16); a people-to-contact list lives in Journey | Scroll and focus on arrival now; later, host the full list on Today | Check-ins are found where daily work happens | S / M | Later step: **yes** (changes JITM-09 §2.61) |

## 6. Documents that disagree, and gaps

**Documents vs code**
- **JITM-04 §6** says no control exists to turn on automatic sending "for this visit" (`CalendarEntryForm.tsx:101`). But `src/app/(app)/calendar/page.tsx:82` renders "Allow automatic sending" / "Stop sending automatically" per visit binding (`appointmentBindingDeliveryAction`, `src/lib/calendar-actions.ts:58-63`), and it predates 9f967bc (read-only `git log -S` → e7b9ff2). The real gap: the control appears only after saving, inside a collapsed disclosure, and the form sentence doesn't say so. It is also shown regardless of whether the account can send automatically. That last point is INFERRED; I didn't trace the global gate beyond `src/lib/automatic-delivery.ts:170`.
- **JITM-09 §2.57** says "select its line, then Delete above the canvas". `WorkflowPathActions` renders in the Details pane (`src/components/WorkflowJourney.tsx:247`): below the map at 1200–1699, beside it at ≥1700, in the Details pane on phones.
- **JITM-09 §2.52** ("a structured list is always available") is technically met, but the list is behind Options (`WorkflowJourney.tsx:215`), and the canvas's accessible name says it is "available above" (`:229`).
- **JITM-10 §6** lists Journey's sub-floor text as the 11–12px CSS labels. The overview's inline 8px names and numbers (`WorkflowJourney.tsx:231`) are not listed. It also notes Calendar isn't in the floor test, but not that Calendar's agenda is 12px (JRC-22).
- **Code comment vs behaviour:** the comment at `WorkflowJourney.tsx:93` says numbers "stay the same when archived Mixes are hidden", yet they change with the Mega-Mix view (known B-13).
- **Dead CSS:** rules in `src/styles/design-workspaces.css:130-133,352-358` target a `.calendar-page` grid and a sticky `#schedule-event`. They no longer apply: `.calendar-page` is `display: block` (`src/styles/design-details.css:121`) and the editor isn't its child. `.calendar-contact-context` is also positioned by both stylesheets (`design-workspaces.css:354,358` and `design-details.css:156,160`). This goes against JITM-06 §2.31 (one style owner) and caused JRC-37.

**Standards that produce a workflow problem** (consistent with code, worth revisiting)
- JITM-07 §2.13 / §2.19: "context follows the center" from 1200 to 1699 is exactly why the selection and Start details fall below the fold at the most common laptop widths.
- JITM-07 §2.20: half-screen map on phones. With the stacked header, the map starts at y≈570 and shows ≈208px.

**Gaps (no rule exists)**
- Default and minimum *readable* Journey zoom; whether the overview may scale text below the floor.
- Whether map layout must follow journey-number order.
- Whether Calendar shows follow-ups individually, summarized or not at all, and how kinds are distinguished.
- Where booking entry points live (profile, Today review, Journey person card).
- Showing raw timezone ids anywhere in customer copy.
- Keeping the Journey view (Setup/Progress/Results) in the address.
- Where Calendar's contact column sits from 1100 to 1699px.

## 7. Captures needed / NOT RUN

- **Journey Setup and Results tabs** (NOT RUN: there is no `?view=` param, so the lead's captures equal Progress). Steps: `/journey` → click "Setup", then "Results", at 390 and 1440, light and dark. Also Results with "Targets and counting rules" → Target 50%.
- **Journey Options panel and "Show list"**, at 390 and 1440.
- **Journey person selected:** tap a People row at 390 (which pane shows; how many taps to the work card) and at 1440 (where `WorkflowInstanceCard` renders).
- **Journey line selection:** click a connection line at 1440 (does `WorkflowPathActions` scroll the page) and at 390.
- **Journey Setup at ≥70%** with connection points, and the connection editor open (`WorkflowRuleEditor`), at 390 and 1440.
- **Start flow end-to-end:** `/templates/journeys` → "Start" at 1280, 1440 and 1600 (form position); choose a person (preview line with timezone); "Start this Mix" (notice, URL).
- **Quiet-day check-ins:** enable in Personal preferences, then Today → "View all check-ins" at 1440 and 390 (is the list in view).
- **Calendar phone New event and Edit:** `/calendar?new=1#schedule-event` and `/calendar?edit=<id>#schedule-event` at 390 (editor position after the agenda; WhenPicker as a bottom sheet).
- **Calendar with more than 200 contacts:** Contact select cut-off, then "Find a contact for this event" with a typed title (leave warning, draft loss).
- **Calendar overlap path:** book over "Site visit — deck repair" (error text, hidden checkbox, disabled slots).
- **Visit outcome surfacing:** book a visit with a follow-up Mix in the past hour, then check Today for any outcome prompt (expected none, per code search).
- **Calendar and Journey at 200% text and in phone dark** (O48 covered other routes).
- **Physical devices / assistive technology:** NOT RUN (JITM-10 §6).
