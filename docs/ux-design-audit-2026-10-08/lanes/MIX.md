> Lane report MIX (Mixes, Mega-Mixes, Marketplace, Invite people) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# Lane MIX: Mix library, editor, Mega-Mixes, ready-made content, Marketplace, Invite people

Audited commit `f23db11` (production `dae3fab` plus docs). Screenshot paths are relative to `<captures>` (`<captures>`). Crops made for this lane are in `lanes/crops/MIX/`. Code is cited as `src/...:line` in the repository. I did not run anything. Every runtime claim comes from the captured screenshots, `_results.json` or `_aria*.txt`.

## 1. Lane summary

**Verdict: not optimal.** The desktop structure is sound: three panes, explicit save, activation that stays safe, A1/A1.a outlines and a privacy check before sharing. But both jobs the owner comes here for are slowed down.

**(1) Getting a working set fast.** Ready-made content can be reached from four to six entry points that use three different layouts: `/templates`, `/marketplace` and `/templates/journeys`. The owner gets bounced between them (MIX-10). On phone, the Marketplace preview has no visible way to add the item (MIX-03). A ready-made Mix that starts per person cannot be turned on during setup unless the owner enrols Everyone or a whole tag (MIX-04). The Mega-Mix preference form is squeezed into a 300px column on laptop (MIX-06).

**(2) Tweaking wording.** In the editor the Beat's channel is invisible: the select is clipped to a 38px chevron by a CSS class collision (MIX-02). Every save of a Mix that is already on goes through "Review and start" and then "Start this Mix?". That dialog shows wrong counts, and for date-based Mixes it blocks the save (MIX-01).

**Changes that would help most, in order:**
- Fix the save rule for Mixes that are already on, and show the channel. These are bug-level fixes.
- Make editing one screen: inline Text | Email | Call tabs on each Beat, the same pattern as the Today review.
- Ship B-19: make the Marketplace the only catalog, with an "Add to my Mixes" button in the preview and no audience step for Mixes that start per person.
- Turn Mega-Mix setup into one well-laid-out step with sensible defaults.
- Make library rows decision-ready: group by Mega-Mix, show people counts and keep duplicate names distinguishable.

## 2. Page and overlay verdicts

### 2.1 My Mixes list (`/mixes`): phone, tablet, desktop
- **Owner's job:** find the right Mix fast, to start someone on it or to change its wording.
- **Works well:** a 360px directory with search, a status filter and favorites (`shots/sweep/laptop-light/mixes.png`). Singular and plural counts are correct. At 1920 the four-column layout matches the export's structure (`shots/sweep/desktop-light/mixes.png`).
- **Gets in the way:**
  - **Phone chrome.** The pane switcher (Mixes / Beats / Details) sits above the page title. Below it come the title row, the three collection tabs, a "Choose a complete Mega-Mix" promo link, search, then the count and Favorites. The first Mix starts about 350 CSS px down, roughly 40% of an 844px screen (`shots/sweep/phone-light/mixes.png`). The export has only a title row and tabs (`shots/export/Mixes.png`).
  - **Phantom selection.** "Beats" and "Details" act on a Mix the owner never picked: the first row is pre-selected and highlighted (`src/components/MixLibraryShell.tsx:6-13`, `src/app/(app)/mixes/page.tsx:40`).
  - **Rows don't help choose.** Each row reads "active · 4 Beats": no people count, no timing, no Mega-Mix or stage (MIX-13).
  - **Duplicate names.** Two "Estimate follow-up" rows differ only by "4 Beats" vs "3 Beats" (MIX-05).
  - **320px.** The tabs collide (MIX-12).
  - **Tablet (834).** One pane at a time, as JITM-07 §2.13 specifies, so the 834px-wide list shows names only.
- **Verdict:** Needs rework on phone. Good with detail fixes on desktop.
- **Recommended structure:**
  - Title row with ⓘ, "+" and "•••", then the tabs, then search. Show the promo link only when the account has no Mega-Mix.
  - Group rows by Mega-Mix, in A1…A13 order with a stage tag, plus a "Not in a Mega-Mix" group.
  - Row text: "12 people · 2 Beats over 2 days". Show a status chip only when the Mix is not On.
  - On phone, tapping a row opens the Mix page with a BackLink, the way Contacts works (JITM-07 §2.17), instead of using a top pane switcher.

### 2.2 Mix detail, Preview (`/mixes?mix=…`)
- **Owner's job:** check what a Mix sends and when, see who is in it, then start someone or edit.
- **Works well:**
  - Beats show as numbered message bubbles with merge-field chips, timing and channel, Beat 1 open by default (`shots/overlays/phone-light/mixes-detail-full.png`). Dark mode is fine (`shots/overlays/phone-dark/mixes-detail.png`).
  - The context pane shows Starts, People with a count, Connections, and Manage Mix behind a disclosure.
- **Gets in the way:**
  - The header mixes view toggles (Preview, Edit) with actions (Share, Start). On phone the buttons wrap to two rows and the primary "Start" sits alone on the second row.
  - Share, a rare action, takes the first slot. Start leaves the page for Journey (MIX-16).
  - The status chip reads "active" (MIX-09).
  - Channel reads "Phone call" here but "Call" elsewhere (MIX-20).
  - Each person under People shows their pending follow-up's reason, which here is just the Mix name ("New project inquiry" repeated five times). It should show the next Beat and its date (`src/components/MixWorkspace.tsx:142`).
  - On phone, Pause and Archive sit behind the Details tab, then the collapsed "Manage Mix".
- **Verdict:** Good, fix details.
- **Recommended structure:**
  - Header: name, an On/Paused switch (the export's "Active" switch, `shots/export/DesktopMixes.png`), a primary "Start for someone", and "•••" holding Share, Export file and Archive.
  - Merge Preview into the inline editor (§2.3).

### 2.3 Mix editor (`/mixes?mix=…&view=edit`; `/mixes/[id]/edit` redirects here), all disclosures open (`mix-edit-open`)
- **Owner's job:** change wording or timing quickly and safely.
- **Works well:**
  - Name and start are collapsed for an existing Mix.
  - Explicit save, kept drafts, and Undo for a removed Beat (`src/components/MixEditor.tsx:244`).
  - Generated text, email and call versions with "Edit the generated…".
  - The editor says that edits apply to new work (`src/components/MixEditor.tsx:302`).
- **Gets in the way:**
  - The Beat's channel is invisible (MIX-02).
  - The main textarea has no visible label (only screen-reader text "Message" or "Call notes"). The other two versions sit two levels down: "•••", then "Text, email and call versions".
  - Timing is split across the header (Day), "•••" → "Appointment timing (optional)" and "•••" → "More timing options" (time, position, planned date).
  - With collapsed disclosures the page is 2,251 CSS px on phone (6,600 px with all open). Save sits at the very end, after "Try a schedule example".
  - Saving a Mix that is already on shows "Review and start" (MIX-01).
  - "Everyone39 active people" has no space (MIX-21).
  - The 3-row textarea clips longer messages on phone (MIX-31).
  - Goal "Customer journey" and approach "Mega-mix" are visible in Advanced settings. This is known (JITM-05 §6), re-confirmed in `lanes/crops/MIX/phone-editopen-1.png`.
- **Verdict:** Needs rework.
- **Recommended structure (see S1):**
  - Each Beat becomes one card: an editable name, a "Day 2 · 10:00 AM" chip, a visible Text | Email | Call segmented control showing which version is being edited (the Today review pattern, JITM-08 §2.1), and the wording bubble.
  - Beat options keep only appointment timing, reorder and remove.
  - Move name, start rule, audience, stage and advanced fields into one "Mix settings" disclosure.
  - Collapse "Try a schedule example" into a disclosure.
  - Put "Save changes", with a line about people already in the Mix, right after the last Beat.

### 2.4 Create a Mix (`/mixes/new?custom=1`); `/mixes/new` redirects to `/templates`
- **Owner's job:** build a Mix from scratch.
- **Works well:** the same editor, and "Keep as a draft" is the default.
- **Gets in the way:**
  - The default start is "When I add a date" with "Anniversary" (MIX-22). For trades and agents the common case, and every Contractor Mega-Mix Mix, is "When I start it for someone".
  - There is no BackLink on phone (JITM-07 §2.8).
  - The intro copy is personal-tool framing: "Every relationship starts with a first Beat…".
  - The "+" on My Mixes opens this blank editor, while `/mixes/new` opens the ready-made library: two intents for "new".
- **Verdict:** Good, fix details.
- **Recommended structure:** "+" opens a small sheet: "Use a ready-made Mix" (Marketplace filtered to the owner's business type), "Start from scratch", "Import a file". Default the start rule to "When I start it for someone".

### 2.5 Mix tools sheet ("•••" on My Mixes; `x-mixes-tools`)
- **Owner's job:** reach less common tools.
- **Works well:** it follows the flat-row sheet pattern (JITM-08 §2.10).
- **Gets in the way:**
  - It holds only "Ready-made Mixes" (a retired entry, known B-19) and "My invitations". Invitations are not a Mix tool, and are called "Invite people" everywhere else (`src/app/(app)/mixes/page.tsx:53`).
  - It is a full modal for two links (`shots/overlays/laptop-light/x-mixes-tools.png`).
- **Verdict:** Needs rework: retire its current contents.
- **Recommended structure:** use "•••" for "Import a file" (matching the Mega-Mixes tab) and "Archived Mixes" if that is added. Invitations stay in More.

### 2.6 Filter Mixes sheet (`mixes-filter`, `x-mixes-filter`)
- **Works well:** Apply button and explanatory line, as required by JITM-08 §2.29 (D9).
- **Gets in the way:** a whole bottom sheet for one four-option select. It calls the active state "On" while every row says "active" (`shots/overlays/phone-light/x-mixes-filter.png`).
- **Verdict:** Good, fix details.
- **Recommended structure:** align the words (On / Paused / Draft). Optionally replace the sheet with status chips; that needs Kevin, since D9 set the Apply pattern.

### 2.7 "What these words mean" sheet (`mixes-terms`, `x-terms-today`)
- **Works well:** uses the glossary meanings of JITM-05 §2.2. It is a bottom sheet on phone and a modal on desktop.
- **Gets in the way:** it is shown on the Marketplace but does not explain "Marketplace" or "ready-made" (MIX-30).
- **Verdict:** Good, fix details.

### 2.8 Share sheet (`x-mix-share`)
- **Works well:** public name defaults to the business, a privacy check runs before sharing, an explicit consent checkbox, clear stop-sharing.
- **Gets in the way:** "Any business" is listed twice under Business type (MIX-25). The sheet says "Jump in the Mix users", which is neither glossary option (JITM-05 §6 leaves member vs owner open).
- **Verdict:** Good, fix details. Move the Share trigger into the Mix's "•••" menu.

### 2.9 Mega-Mixes tab, the owner's own (`/mixes/mega`, `mega-detail`)
- **Owner's job:** see and manage a named set of connected Mixes.
- **Works well:** a numbered outline (A1, A1.a…) with paths and repeat limits (`shots/overlays/laptop-light/mega-detail.png`), "Open in Journey", Export, a confirmed Remove.
- **Gets in the way:**
  - Mix titles in the outline are not links, so the owner cannot open a Mix from its Mega-Mix to tweak it (MIX-15).
  - At 1440 the Journey, Export and Manage sections sit about 3,600px down (`lanes/crops/MIX/laptop-mega-bottom.png`).
  - "Edit" edits the grouping, not the wording.
  - The header chip says "13 Mixes" where every other page has a status.
  - The page H1 is "Mixes" while the browser title and the ready-made page are both "Mega-Mixes" (MIX-29).
- **Verdict:** Good, fix details.
- **Recommended structure:** link each Mix in the outline to its editor and show its people count. Put "Open in Journey" and the "•••" menu (Export, Duplicate, Remove) in the header. Rename "Edit" to "Change Mixes in this Mega-Mix".

### 2.10 Ready-made Mixes library (`/templates`)
- **Owner's job:** pick a single ready-made Mix.
- **Works well:** wording preview, "Use this Mix" both in the header and in context, an "At a glance" block, approach guidance.
- **Gets in the way:**
  - It looks like My Mixes and lives under the "Marketplace" tab: H1 "Mixes", "Search Mixes", and a count of "40 Mixes" that reads like the owner's own (MIX-10). This is known as B-19 and re-confirmed here.
  - It leads with seven networking Mixes with pun names (The Next Verse, The Afterparty…) for a home-services account (MIX-18).
  - The useful "Browse by task" shortcuts are hidden in a "•••" sheet (`src/app/(app)/templates/page.tsx:89`).
  - On one screen the channels read both "Phone call" and "SMS, Phone Call" (MIX-20).
- **Verdict:** Needs rework. Fold it into the Marketplace (B-19).

### 2.11 Use a ready-made Mix (`/templates/[id]/use`)
- **Owner's job:** add the Mix and get it running.
- **Works well:** three explicit steps, and the review shows potential follow-ups before anything starts.
- **Gets in the way:**
  - A Mix that starts per person cannot be turned on during setup without enrolling Everyone or a tag. The Starts copy is wrong for per-person starts, and the step-3 button is disabled without a reason (MIX-04).
  - The messages are hidden even on desktop: "Mix details & messages" is collapsed, then "Preview the rhythm" is collapsed inside it (`shots/sweep/laptop-light/template-use.png`).
  - "On the cue day" is known (JITM-05 §6).
  - "will receive this mix" has a lowercase "mix".
- **Verdict:** Needs rework.
- **Recommended structure:** one screen with the name (prefilled) and the wording visible. "Add to my Mixes" adds it as On for per-person starts, without an audience step, then opens the editor ("Your copy is ready to edit"). Keep the audience step for date-based and fixed-date Mixes.

### 2.12 Ready-made Mega-Mixes (`/templates/journeys`): preview, "Make it yours", review, after install
- **Owner's job:** get a whole connected set in one go. This is the fastest route to a working set.
- **Works well:**
  - The real Beats, timing and paths can be previewed.
  - Installing enrols no one.
  - "Your pipeline is ready" offers a clear "Add your first customer" next step.
  - The business type preselects the matching Mega-Mix (`src/app/(app)/templates/journeys/page.tsx:12`).
- **Gets in the way:**
  - At 1200–1699 the preference form is in a 300px third column. Times are clipped and AM/PM is lost, selects are truncated, and the appointment checkbox is squashed to a dot (MIX-06).
  - There is a false "Unsaved changes" after "Review my setup" (MIX-07).
  - The review summary shows the raw zone id, 24-hour times and "0-minute buffer" (MIX-08).
  - About 17 controls come before anything happens. A prior audit raised this: `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:60`.
  - The preview is 4,634px at 1440, 5,321 CSS px at 390 and 6,339 at 320, with the CTA at its end on phone.
  - The flow calls the Mega-Mix a "journey" (MIX-27).
  - After install, "Add your first customer" is shown to an account with 40 contacts, and the list of 13 Mixes shows "active" instead of each Mix's stage (MIX-26).
  - The back link always goes to "Ready-made Mixes" (MIX-29).
- **Verdict:** Needs rework.
- **Recommended structure (S3):**
  - Preview stays in the center, as a compact outline grouped by stage, with wording one tap away.
  - Setup becomes a second step in the center pane at full width, opening on a summary of defaults ("Texts, emails and calls · Mon–Fri 9:00 AM–5:00 PM · New York time · follow-ups at 10:00 AM · quiet 8:00 PM–8:00 AM [Change]") with one "Add Contractor Mega-Mix" button.
  - After install, list the Mixes by stage, each with Start.

### 2.13 Marketplace (`/marketplace`): sections, list, listing preview, Community, favorites, report
- **Owner's job:** discover Mixes and Mega-Mixes to add (JITM-09 §2.74). Share one's own.
- **Works well:**
  - Sections (Jump in the Mix / Community / My shares) and kind chips.
  - Listing outlines with A1.a numbering.
  - A favorite count, a report sheet with reasons, and author moderation states.
- **Gets in the way:**
  - On phone and tablet, "Add to your account / Set up this Mix" exists only in the "Details" pane. On desktop it is a plain text link under the outline (MIX-03).
  - Five rows of controls come before the first result on phone. The first item starts at about 50% of the screen (`shots/sweep/phone-light/marketplace.png`).
  - Previews never show wording, yet adding asks the owner to tick "I’ve reviewed the wording" (MIX-14).
  - "Set up this Mix" bounces to `/templates` (MIX-10).
  - The empty Community view blames search and filters that were never set (MIX-24).
  - Mixes is not marked current in the navigation. This is known (JITM-09 §6), now seen at runtime on phone and laptop (MIX-34).
  - The "Jump in the Mix" segment wraps to two lines at 1440 and 320.
- **Verdict:** Needs rework.
- **Recommended structure:**
  - Each listing preview is a page with a primary "Add to my Mixes" (or "Set up this Mega-Mix") button at the top and the wording visible for each Beat.
  - Default the official section to the owner's business type plus "Any business".
  - Show the kind chips as a single row. Drop the duplicate empty message.

### 2.14 Marketplace filter sheet (`marketplace-filter`, `x-marketplace-filter`)
- **Works well:** Apply pattern; options for business type, channel ("Text / Email / Call"), length and sort.
- **Gets in the way:** "Every business type" sits next to "Any business" (`shots/overlays/laptop-light/_aria.txt`). The owner's own business type is never the default.
- **Verdict:** Good, fix details.

### 2.15 Invite people (`/mixes/system`): page, preview, confirm (`flow-inv-1…4`)
- **Owner's job:** prepare up to three personal invitations that wait in Today.
- **Works well:**
  - An honest lede ("Invitations aren’t emailed for you…").
  - A three-step explainer, one field per person with contact suggestions.
  - A confirmation that names slot usage, and a clear status list.
- **Gets in the way:**
  - When no name is typed, the preview greets the email address and the new contact is saved with the address as their name (MIX-17). The default wording is personal framing: "people in my circle".
  - Mixes is marked current although phones reach this page from More. There is no BackLink (MIX-23).
  - In the confirm dialog the address breaks mid-word, and the close button sits beside the description rather than in the header (`shots/flow-inv-4-confirm.png`). This is the shared dialog component.
- **Verdict:** Good, fix details.

### 2.16 Start handoff (the Mix's "Start" button → Journey start form; `x-mix-start`)
- **Owner's job:** start one person on this Mix.
- **Works well:** the Journey start form exists and covers person search, a work label and adding a person.
- **Gets in the way:**
  - At 1440 the form is about 1,900px down, below the map. The first screen shows the map and the people list (`shots/overlays/laptop-light/x-mix-start.png`; `lanes/crops/MIX/laptop-mixstart-mid.png`).
  - On phone it opens Journey's Details pane, and the bottom navigation switches to More (`shots/overlays/phone-light/x-mix-start.png`).
  - On both, "Connect next" is the filled primary and "Start for someone" is secondary (MIX-16).
- **Verdict:** Needs rework. The Journey lane owns the form; this lane flags the handoff.
- **Recommended structure:** "Start for someone" opens a sheet on the Mix page: choose person, preview real dates (JITM-09 §2.41), Start. Use the same component as the contact page's start.

## 3. Findings table

| ID | rule | finding | evidence | label | severity | fix direction |
|---|---|---|---|---|---|---|
| MIX-01 | JITM-09 §2.39, §2.36; JITM-04 §2.12 | Saving any edit to a Mix that is already On runs the activation review. The button reads "Review and start", and the editor says "You’ll review who gets this Mix before activating." The dialog is titled "Start this Mix?". For a Mix with no audience it shows 0 people and 0 potential follow-ups, and says "No one is enrolled yet…" even when people are in the Mix (New project inquiry has 12). For a date-based Mix whose people were started one by one (the seeded "Estimate follow-up"), "Start the Mix" is disabled with "Choose who gets this Mix." The only ways to save are to tick Everyone or a tag (starting all of them) or to switch "After saving" to paused. The server enforces the same rule. Prior RUN-02 (beta audit 2026-09-26) is only partly fixed: Mixes that start per person are no longer blocked, but the misleading dialog remains. | `shots/sweep/laptop-light/mix-edit-full.png`, `shots/sweep/phone-light/mix-edit-full.png`; `src/components/MixEditor.tsx:135-154,191-194,304,306,308`; `src/lib/mix-editor-actions.ts:146-148`; `src/components/useAudiencePreview.ts:12`; `prisma/seed.ts:120-150` | VERIFIED-RUNTIME (button, line); VERIFIED-CODE (dialog, block) | HIGH | When the saved status is already On and the audience does not widen, show "Save changes" and save directly, on both client and server. Keep the review for turning on, resuming or widening the audience; `turningOn` and `savingMore` are already computed. |
| MIX-02 | JITM-08 §2.28; JITM-10 §2.1, §2.14 | The Beat's channel select (Text/Call/Email/Voicemail/WhatsApp) renders as a 38×44 chevron with no visible value or label, so the owner cannot tell whether a Beat is a text, email or call. Cause: the preview icon class `.mix-beat-channel` (32px circle) also applies to the editor's label. Changing the select also silently swaps the main field between message and call notes. | `lanes/crops/MIX/laptop-edit-beat-heading.png`; `shots/sweep/phone-light/mix-edit.png`; `_results.json` phone `38x44:select`; `src/styles/mix-library.css:57`; `src/components/MixEditor.tsx:246,261,270`; `src/styles/design-details.css:95` | VERIFIED-RUNTIME; VERIFIED-CODE | HIGH | Scope the icon rule to `.mix-beat-preview`, or rename it. Replace the select with a visible "Text · Email · Call" control, offering Voicemail and WhatsApp as sub-options, and give the main field a visible label naming the version. |
| MIX-03 | JITM-09 §2.74, §2.46 | Marketplace listing on phone and tablet: the preview (Beats pane) has no add action. "Add to your account / Set up this Mix" lives only in the "Details" pane. On desktop it is a plain violet text link under the outline. The ready-made library has a header CTA for exactly this case; the Marketplace does not. | `shots/overlays/phone-light/x-marketplace-listing-full.png`; `shots/sweep/laptop-light/marketplace.png`; `src/styles/mix-library.css:78,126`; `src/app/(app)/marketplace/page.tsx:116-137`; `docs/READY_MADE_MIX_PANES_2026-09-21.md` ("The center includes a setup link when the right pane is below or hidden") | VERIFIED-RUNTIME | HIGH | Put a primary "Add to my Mixes" / "Set up this Mega-Mix" button in the listing header, visible in the Beats pane at every width. |
| MIX-04 | JITM-09 §2.11, §2.36; JITM-08 §2.6 | Ready-made setup for a Mix that starts per person (the default trigger): choosing "Start the Mix" requires Everyone or a tag. The client disables the button and the server refuses ("Choose everyone or at least one tag."), so turning it on means enrolling a whole audience now. Step 3's disabled "Review and start" shows no reason. The Starts copy says "Day 0 is when you first turn on this draft", which is wrong for people started later. The other route is to save a draft, then change "After saving" in the editor and review again. | `shots/sweep/phone-light/template-use-full.png`; `src/components/TemplateUseForm.tsx:89-90,97-100,110,115`; `src/lib/shared-mix-use-service.ts:62,121` | VERIFIED-CODE; VERIFIED-RUNTIME (step 1) | HIGH | For Mixes that start per person: drop the People step, offer "Add and turn on" with no one enrolled, then open the editor. Keep the audience step for date-based and fixed-date Mixes. Give every disabled button a visible reason. |
| MIX-05 | none — gap (JITM-09 §2.43 covers Mega-Mix names only) | Installing the Contractor Mega-Mix created a second "Estimate follow-up" (4 Beats, starts per person) next to the existing one (3 Beats, starts from a date). The list shows them identically apart from the Beat count. Pickers show the bare name, and a Journey setup issue reads "Estimate follow-up: no next connection" without saying which one (O44). | `shots/sweep/phone-light/mixes.png`; `shots/flow-bulk-estimate-3-mix-sheet.png`; `lanes/crops/MIX/phone-mixstart-lower.png`; `src/lib/mega-mix-service.ts:52`; `src/components/NewContactsMixSelect.tsx:11`; `src/components/ContactsBulkWorkspace.tsx:258`; `src/components/ContactForm.tsx:216` | VERIFIED-RUNTIME; VERIFIED-CODE | MEDIUM | On install, detect name clashes and add the Mega-Mix name ("Estimate follow-up · Contractor") or ask. In rows and pickers, show the Mega-Mix or Journey number and the start type. |
| MIX-06 | JITM-07 §2.11, §2.13, §2.18; JITM-10 §2.3, §2.7 | At 1200–1699, the "Make it yours" form sits in a 300px third column (`260px 1fr 300px`, outside the shared composition). Time values are clipped ("09:0", "05:0", "10:0", "08:0") so AM/PM is lost; quiet start and end both read "08:0". Selects are truncated ("Use the recommende", "No buffe"), weekday chips wrap one or two per row, and the "Keep follow-up reminders clear of appointments" checkbox is squashed to a dot, so its state is invisible (O6). | `shots/tpl-journeys-laptop-light.png`; `lanes/crops/MIX/tpl-journeys-right-col.png`, `lanes/crops/MIX/tpl-journeys-buffer-checkbox.png`; `src/components/MegaMix.module.css:1`; `src/components/JourneyPreferenceFields.tsx:13,22-30` | VERIFIED-RUNTIME; VERIFIED-CODE | MEDIUM | Use the §2.13 composition. Make setup the next step in the center pane (or a sheet), one field per row, with a non-shrinking checkbox. |
| MIX-07 | JITM-08 §2.30 | "Unsaved changes. Save before leaving this page." appears after only pressing "Review my setup", with no edits (O7). There is no Save on this page. Likely cause: the review step mounts the stage-labels checkbox, which is checked by default, so the form data changes after the first action. | `shots/flow-mm-contractor-1-review.png`; `src/components/MegaMixSetup.tsx:47-48,64`; `src/components/FormGuard.tsx:27-36,66,72` | VERIFIED-RUNTIME (symptom); INFERRED (cause, from code) | MEDIUM | Re-take the starting snapshot after the review renders, or mark review-only fields `data-form-guard-ignore`. Word the warning for this page. |
| MIX-08 | JITM-11 §2.15; JITM-08 §2.28 | The Mega-Mix review summary shows the raw zone, broken mid-word ("America/New_Y ork"), 24-hour "09:00–17:00", "Prefer 10:00", "Quiet from 20:00 to 08:00" and "0-minute buffer" (the form said "No buffer"). The form above shows "New York" and Today shows "10:00 AM" (O8). The Mix editor shows "Timezone: America/New_York". Ready-made previews hard-code `en-US`/UTC. | `shots/flow-mm-contractor-1-review.png`; `src/components/JourneyPreferenceFields.tsx:41-43`; `src/components/JourneySetup.module.css:8,10`; `src/components/SchedulePreview.tsx:34`; `src/components/ReadyMadeMixWorkspace.tsx:37` | VERIFIED-RUNTIME; VERIFIED-CODE | MEDIUM | Use the TimezonePicker's friendly zone label and `timeOfDayLabel` with the account locale. Show "No buffer". |
| MIX-09 | JITM-05 §2.1; JITM-04 §2.3, §2.4 | "Start" means two different things. The header "Start" enrols a person. "Start Mix", "Start the Mix", "Review and start" and the notice "Mix started." turn the Mix on. The status word is the raw enum lowercased ("active", "paused", "draft") in five places, while the filter calls the same state "On". | `shots/sweep/laptop-light/mixes.png`; `shots/overlays/phone-light/x-mixes-filter.png`; `src/components/MixWorkspace.tsx:80-81,144`; `src/components/MixEditor.tsx:218,304,308`; `src/app/(app)/mixes/page.tsx:44,66`; `src/components/MixLibraryNav.tsx:15`; `src/components/MegaMixLibrary.tsx:33`; `src/components/MegaMixForms.tsx:27`; `src/components/ReadyMadeMixWorkspace.tsx:50` | VERIFIED-RUNTIME; VERIFIED-CODE | MEDIUM | Mix state is "On / Paused / Draft" with "Turn on" and "Pause". Enrolling is always "Start for someone". One label helper. |
| MIX-10 | known: JITM-09 §6 / JITM-05 §6 (B-19, §2.74) | The ready-made library duplicates the Marketplace's Jump in the Mix section under the same "Marketplace" tab, with a different layout. It has H1 "Mixes", "Search Mixes", a count of "40 Mixes" (reads as the owner's own) and no section control. The Marketplace's "Set up this Mix" bounces to `/templates`, where "Use this Mix" has to be pressed again. | `shots/sweep/phone-light/templates.png`, `shots/sweep/laptop-light/templates.png` vs `shots/sweep/laptop-light/marketplace.png`; `src/app/(app)/templates/page.tsx:84,92,96,108`; `src/lib/marketplace-service.ts:231` | VERIFIED-RUNTIME | MEDIUM | Ship B-19. In the meantime, have the Marketplace's official "Set up" link go straight to `/templates/[id]/use`. |
| MIX-11 | JITM-07 §2.8; JITM-06 §2.33 | Phone Mix library: the pane switcher sits above the page title. Title row, three tabs, the promo link, search, then count and Favorites come before the first Mix (about 40% of the first screen; about 50% on the Marketplace with sections and chips). "Beats" and "Details" act on an auto-selected Mix. | `shots/sweep/phone-light/mixes.png`, `shots/sweep/phone-light/marketplace.png`; `shots/export/Mixes.png`; `src/components/MixLibraryShell.tsx:6-13`; `src/app/(app)/mixes/page.tsx:40,58` | VERIFIED-RUNTIME | MEDIUM | Drill-in pattern (list → Mix page with BackLink), or put the pane control inside the selected Mix. Show the promo link only in the empty state. |
| MIX-12 | JITM-10 §2.1, §2.4 | At 320px the collection tabs run into each other ("Mega-Mixes" touches the Marketplace icon) and past the container edge, with no 8px gap between targets. | `lanes/crops/MIX/phone320-mix-tabs.png`; `src/styles/mix-library.css:13-14` | VERIFIED-RUNTIME | MEDIUM | Below 360px, use icon-over-label tabs or allow the labels to wrap. |
| MIX-13 | JITM-06 §2.33 (export); `docs/design/DESIGN_GUIDELINES.md:48` | List rows lack people count and timing. The nav component supports a people count, but the page never loads it. The export rows show "N people", a Beat track and "N beats over N days". Prior DES-F8 (beta lane 08) is still open, and the people count is now missing entirely. | `shots/sweep/phone-light/mixes.png` vs `shots/export/Mixes.png`; `src/app/(app)/mixes/page.tsx:37,73`; `src/components/MixLibraryNav.tsx:15` | VERIFIED-RUNTIME; VERIFIED-CODE | MEDIUM | Load people counts and duration: "12 people · 2 Beats over 2 days". Show the status chip only when the Mix is not On. |
| MIX-14 | JITM-04 §2.1; JITM-09 §2.47 | Adding from the Marketplace and importing a file require "I’ve reviewed the wording…". But the listing and import previews show only Beat names, channel and day, never the wording. | `shots/overlays/phone-light/x-marketplace-listing-full.png`; `src/components/PortableOutline.tsx:23`; `src/components/MarketplaceControls.tsx:102`; `src/components/MegaMixForms.tsx:80` | VERIFIED-RUNTIME (official listing); VERIFIED-CODE; Community listing NOT RUN (no shares exist) | MEDIUM | Show each Beat's wording (expandable) in listing and import previews before asking for the confirmation. |
| MIX-15 | none — gap (JITM-09 §2.42) | The owner's Mega-Mix detail is a read-only outline: Mix titles are not links, so a Mix cannot be opened from its Mega-Mix. At 1440 the Journey, Export and Manage sections sit about 3,600px down. | `shots/overlays/laptop-light/mega-detail.png`; `lanes/crops/MIX/laptop-mega-bottom.png`; `src/components/PortableOutline.tsx:22-23`; `src/app/(app)/mixes/mega/page.tsx:94,98-107` | VERIFIED-RUNTIME | MEDIUM | Link each Mix to its editor. Move "Open in Journey" and the management menu into the header. |
| MIX-16 | JITM-09 §2.41; JITM-08 §2.1 | The Mix's "Start" leaves Mixes for Journey. At 1440 the start form is about 1,900px below the map. On phone the bottom navigation switches to More. "Connect next" is the filled primary and "Start for someone" is secondary. | `shots/overlays/laptop-light/x-mix-start.png`, `-full.png`; `lanes/crops/MIX/laptop-mixstart-mid.png`; `shots/overlays/phone-light/x-mix-start.png`; `src/components/MixWorkspace.tsx:81` | VERIFIED-RUNTIME | MEDIUM | "Start for someone" opens a sheet on the Mix page (person → real dates preview → Start), the same component as the contact page's start. Cross-ref O46 (Journey lane). |
| MIX-17 | JITM-04 §2.21 | With no name typed, the invitation greets the address ("Hi riley.newowner@example.test,"), and the new contact is saved with the email as display name and first name, so later {{First Name}} messages would greet the address too (O35). | `shots/flow-inv-3-preview.png`; `src/components/SystemMixInviteForm.tsx:111`; `src/lib/system-mix-actions.ts:42,57`; `src/lib/referral-access.ts:68` | VERIFIED-RUNTIME; VERIFIED-CODE | MEDIUM | Without a name, greet "Hi," and leave the first name empty. Ask once for the name (the optional field already exists). |
| MIX-18 | JITM-02 §2.2; JITM-04 §2.2 | For a home-services account, the ready-made catalog leads with seven networking "Relationships" Mixes with music-pun names ("The Next Verse", "The Afterparty", "Back in Rhythm"…). The featured sort ignores business type, and the "Browse by task" shortcuts are hidden in a "•••" sheet. | `shots/sweep/phone-light/templates.png`; `src/app/(app)/templates/page.tsx:58,89`; `src/lib/relationship-mix-library.ts:3-8,15-40` | VERIFIED-RUNTIME; VERIFIED-CODE | MEDIUM | Default the catalog to the account's business type plus "Any business". Show task chips. Give Relationship Mixes literal names or a literal subtitle. |
| MIX-19 | JITM-10 §2.2 | Meaningful text below 13px: "Day 0 is the start date. Each Beat prepares one follow-up." (12px); outline Beat and Mix details such as "Text · Day 0" and "4 Beats" (12px) on the Mega-Mix detail and Marketplace listing; "Step 1 of 3 · Name" (12.8px). | `shots/sweep/phone-light/_results.json`, `shots/sweep/laptop-light/_results.json` (`small`); `src/styles/design-details.css:85`; `src/styles/mega-mixes.css:7,14` | VERIFIED-RUNTIME | MEDIUM | Raise all three to 13px (.8125rem). |
| MIX-20 | JITM-04 §2.3; JITM-05 §2.2 | Channel names differ across the lane: "Phone call" (Mix preview, ready-made Mega-Mix preview), "Call" (editor, outlines, filters, Today), and "SMS, Phone Call" / "Voicemail Script" (ready-made "At a glance"). The `/templates` detail shows "Phone call" and "SMS, Phone Call" on one screen. The Mega-Mix preview labels every non-text, non-email channel "Phone call", including WhatsApp (prior item in `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:48`). | `shots/sweep/laptop-light/templates.png`; `src/lib/display-labels.ts:3`; `src/lib/shared-mix.ts:121-125`; `src/components/MegaMixPreview.tsx:19`; `src/components/PortableOutline.tsx:5`; `src/components/MixEditor.tsx:37-43` | VERIFIED-RUNTIME; VERIFIED-CODE | LOW | One channel-label helper: Text, Email, Call, Voicemail, WhatsApp. |
| MIX-21 | none — gap (layout) | Audience cards run the name into the count: "Everyone39 active people, and anyone you add later", "Customers2 people". | `lanes/crops/MIX/phone-editopen-0.png`, `lanes/crops/MIX/laptop-editopen-0.png`; `src/components/MixEditor.tsx:224,227` | VERIFIED-RUNTIME | LOW | Put the count on its own line, or add a separator. |
| MIX-22 | JITM-02 §2.2; JITM-07 §2.8 | Create a Mix defaults to "When I add a date" with "Anniversary", has no BackLink on phone, and opens with personal framing. | `shots/sweep/phone-light/mix-new-custom.png`; `src/components/MixEditor.tsx:115,215`; `src/app/(app)/mixes/new/page.tsx:35` | VERIFIED-RUNTIME; VERIFIED-CODE | LOW | Default to "When I start it for someone", add a BackLink, rewrite the intro (§4). |
| MIX-23 | JITM-09 §2.5; JITM-07 §2.8 | Invite people (`/mixes/system`) marks Mixes as current on the phone bar and the desktop rail, although phones reach it from More. It has no BackLink. | `shots/flow-inv-1-page.png`; `shots/sweep/laptop-light/mixes-system.png` | VERIFIED-RUNTIME | LOW | Mark More on phones and add "Back to More", or move the route out of `/mixes` (needs Kevin, see §6). |
| MIX-24 | JITM-08 §2.32; JITM-04 §2.11 | Empty Community view: "0 results", then "Nothing matches. Try another search or clear your filters.", then an EmptyState "Nothing to show / Try another search or clear your filters.". No search or filter is set; no one has shared yet. | `shots/overlays/phone-light/marketplace-community-full.png`; `src/app/(app)/marketplace/page.tsx:112,156` | VERIFIED-RUNTIME | LOW | One empty state: "No one has shared a Mix yet." with a "Share one of your Mixes" action. |
| MIX-25 | none — gap | The share sheet's Business type lists "Any business" twice. The Marketplace filter offers both "Every business type" and "Any business". | `shots/overlays/laptop-light/_aria-x.txt` (x-mix-share); `src/components/MarketplaceControls.tsx:66` | VERIFIED-RUNTIME | LOW | Drop the duplicate option. Explain "Any business" in the filter ("Made for any business"). |
| MIX-26 | JITM-04 §2.1, §2.4 | After install, "Add your first customer" is shown to an account with 40 contacts. "Start where the person is" lists 13 Mixes with lowercase "active" and no stage, though the preview gives each Mix a stage (O9). "13 connected mixes · Added" is known (JITM-05 §6). | `shots/flow-mm-contractor-2-after.png`; `src/components/MegaMixLibrary.tsx:30,32-33` | VERIFIED-RUNTIME; VERIFIED-CODE | LOW | Use "Add a customer" when contacts exist. Show "Stage: Inquiry" etc. instead of status, ordered by stage. |
| MIX-27 | JITM-05 §2.1, §2.2 | The ready-made Mega-Mix flow calls the Mega-Mix a "journey": pane "Add journey", "Set up this journey", "Preview the Contractor journey", "I’ve reviewed my journey and preferences.", "Choose a whole journey for your work.". In the glossary, Journey is the map. The "Mega-mixes" pane label is known (JITM-05 §6). | `shots/sweep/phone-dark/templates-journeys.png`; `shots/flow-mm-contractor-1-review.png`; `src/components/MegaMixLibrary.tsx:23-24,27`; `src/components/MegaMixSetup.tsx:45,48` | VERIFIED-RUNTIME; VERIFIED-CODE | LOW | Use "Mega-Mix" (§4). |
| MIX-28 | JITM-10 §2.1 | Targets: the Mix header's Start, Preview, Edit and Share are 36px compact buttons on desktop, including the primary Start. On phone, "Edit the generated email/text/talking points" are 24px tall and "Manage date types" is a 16px stand-alone link. | `_results.json` (laptop `86x36:a:"Start…"`; phone `346x24:button`, `115x16:a`); `src/components/MixWorkspace.tsx:81`; `src/components/MixEditor.tsx:215,289-291` | VERIFIED-RUNTIME | LOW | Make the primary Start a default 44px button. Give the text buttons and the stand-alone link a 44px hit area. |
| MIX-29 | JITM-07 §2.8 | The ready-made Mega-Mix page's back link always says and goes to "Ready-made Mixes" (`/templates`), wherever the owner came from. Two different pages share the title "Mega-Mixes" (the owner's groups and the five blueprints). | `src/components/MegaMixLibrary.tsx:24`; `src/app/(app)/templates/journeys/page.tsx:9`; `src/app/(app)/mixes/mega/page.tsx:19` | VERIFIED-CODE | LOW | Point back to the origin (Mega-Mixes tab or Marketplace). Title the blueprint page "Ready-made Mega-Mixes". |
| MIX-30 | JITM-05 §2.1, §2.17 | The "What these words mean" sheet appears on the Marketplace but has no entry for Marketplace or ready-made. | `shots/overlays/phone-light/mixes-terms.png`; `src/components/BrandTermsHelp.tsx:6-12` | VERIFIED-RUNTIME | LOW | Add the JITM-05 §2.2 Marketplace meaning and the §2.3 ready-made meaning. |
| MIX-31 | JITM-10 §2.3 | The editor's message field is fixed at 3 rows. On phone it clips Beat 1 ("{{SMS Signature}}" is cut off). | `lanes/crops/MIX/phone-editopen-1.png`; `src/components/MixEditor.tsx:270` | VERIFIED-RUNTIME | LOW | Auto-grow the field to its content. |
| MIX-32 | known: JITM-05 §6 | Goal "Customer journey" and "Internal approach (optional): Mega-mix" are shown in Advanced Mix settings for Mega-Mix Mixes. | `lanes/crops/MIX/phone-editopen-1.png`; `src/components/MixEditor.tsx:236,238` | VERIFIED-RUNTIME | LOW | As JITM-05 §6. Hide "Internal approach" from owners. |
| MIX-33 | known: JITM-05 §6 | "On the cue day" in ready-made setup. | `src/components/TemplateUseForm.tsx:86,114` | VERIFIED-CODE | LOW | As JITM-05 §6. |
| MIX-34 | known: JITM-09 §6 (INFERRED there) | `/marketplace` marks no primary destination: Mixes is not tinted on the phone bar or the desktop rail. | `shots/sweep/phone-light/marketplace.png`, `shots/sweep/laptop-light/marketplace.png` | VERIFIED-RUNTIME | LOW | Mark Mixes, as JITM-09 §2.5 requires. |

## 4. Copy findings

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

## 5. Structural recommendations (ranked)

**Direct answer.** The structure is not yet optimal for an owner who wants a working set fast and then wants to tweak wording.
- **Should be primary:**
  - The owner's own Mixes, grouped by Mega-Mix, each with two obvious actions: "Start for someone" and inline wording edits.
  - For an account without a set: one "Get a ready-made set for {business type}" card.
  - In the Marketplace: "Add to my Mixes" on every preview.
- **Should collapse:**
  - The phone pane switcher, which belongs inside the Mix page or goes away.
  - The promo links, shown only in empty states.
  - Mix settings (start, audience, stage, advanced) and the schedule example.
  - The Mega-Mix preferences, shown as a one-line summary with "Change".
  - Share, Export and Archive, moved into "•••".
  - Favorites on the owner's own Mixes.
- **Should merge:**
  - `/templates` and `/templates/journeys` into the Marketplace (B-19).
  - The ready-made setup wizard and the Marketplace add form into one add flow.
  - Preview and Edit into one inline editor.
  - Status labels and channel labels into one helper each.

| # | Specific problem (D20) | Change | Expected benefit | Effort | Kevin decision? |
|---|---|---|---|---|---|
| S1 | Tweaking wording: channel invisible (MIX-02); text/email/call versions two disclosures deep; every save of a Mix that is on goes through a false start dialog or is blocked (MIX-01); Save comes after a 2,251px phone page and a schedule-example card | Fix the save rule now (bug). Then make the Mix page the export's inline editor: each Beat card has a visible "Text · Email · Call" switch (the Today review pattern), an editable Day/time chip and the wording. "Save changes" appears when something changed and scrolls with the form at 900px and below (JITM-08 §2.26). Settings go in one disclosure. The note about people already in the Mix sits by Save. | Edit a word, tap Save, done. No false "Start this Mix?" and no accidental audience enrolment. | M (save rule S) | Inline editor replacing Preview/Edit: yes. The save rule: no (bug against JITM-09 §2.39). Optionally offering to update follow-ups not yet sent: yes (JITM-09 §2.12) |
| S2 | Adding ready-made content: four to six entry points across three layouts; Marketplace bounces to `/templates`; add action hidden on phone; per-person Mixes can't be turned on without enrolling an audience (MIX-03, MIX-04, MIX-10, MIX-18, MIX-29) | Ship B-19: the Marketplace "Jump in the Mix" section is the only catalog, defaulting to the owner's business type. Each preview shows the wording and a primary "Add to my Mixes" / "Set up this Mega-Mix" button. One add flow: name, then for per-person Mixes "Add and turn on" with no one enrolled, then the editor. Date-based and fixed-date Mixes keep the audience step. Mega-Mix promo links only in empty states. | One path from "what's available" to "it's running", same on phone and desktop | L | B-19 is decided (D29): scheduling only. Dropping the audience step for per-person ready-made Mixes: yes |
| S3 | Mega-Mix setup: about 17 controls first, a cramped 300px column, false unsaved warning, raw zone and 24-hour summary, previews of 4,600–6,300px (MIX-06, MIX-07, MIX-08) | Preview as a compact outline grouped by stage, wording one tap away. Setup as step 2 in the center pane at full width: a summary of defaults with "Change", the stage-labels choice, "Add Contractor Mega-Mix". Afterwards, Mixes listed by stage with Start, and an "Add a customer" CTA that adapts to the account. | Fewer decisions before value. Nothing clipped. A trustworthy summary. | M | Defaults-summary presentation of JITM-09 §2.21 step 1: yes (small) |
| S4 | Rows don't answer "which Mix?": no people count or timing, duplicate names, status jargon (MIX-05, MIX-09, MIX-13) | Group My Mixes by Mega-Mix (A1… order, stage tag) plus "Not in a Mega-Mix". Rows read "12 people · 2 Beats over 2 days", with status only when not On. Disambiguate duplicate names at install and in every picker. | Faster, safer choice of which Mix to start or edit | M | Grouping and a new install-naming rule (a gap today): yes |
| S5 | Phone navigation: pane switcher above the title, about 40–50% chrome, add action hidden in "Details", Start jumps to Journey (MIX-03, MIX-11, MIX-12, MIX-16) | Drill-in like Contacts: list, then the Mix page with BackLink "Mixes". People, Starts, Connections and Manage are sections below the Beats (or a "Beats \| People" segment inside the page). "Start for someone" is a sheet on the Mix page. | Phone-first owners see the content and the primary action without guessing which pane holds it | M–L | Yes (JITM-07 §2.18 sets Mixes / Beats / Details) |
| S6 | Header mixes view toggles with actions; Start means two things; Share has the first slot; primary Start is 36px (MIX-09, MIX-28) | Header: name, On/Paused switch (export), primary "Start for someone", "•••" (Share, Export, Duplicate, Archive). If S1 is not done, Preview/Edit becomes a segmented control apart from the actions. | Clear primary action; pausing in one tap | S–M | Switch placement follows the export by default (JITM-06 §2.33): confirm |
| S7 | A Mega-Mix can't be used as a map to its Mixes (MIX-15) | Link outline Mixes to their editors, show people per Mix, put the actions in the header | Tweak a set's wording in place | S | No (fills a gap) |
| S8 | Invitations sit under Mixes: route, Mix tools, nav marking (MIX-23, MIX-17) | Mark More on phones and add "Back to More". Rename "My invitations" to "Invite people". Fix the greeting. | Less confusion between Mixes and invitations | S | Moving the route out of `/mixes`: yes |

## 6. Documents that disagree, and gaps

**Documents that disagree (with each other or with the code):**
- **JITM-09 §2.39 vs the code.** §2.39 scopes the review to activation. The code requires it for every save of a Mix that is on (`src/lib/mix-editor-actions.ts:146-148`; `src/components/MixEditor.tsx:191`). The beta audit's RUN-02 fix direction ("Offer 'Save changes' for an active Mix") is still unimplemented.
- **JITM-07 §2.13 and §2.18 vs the code.** They say all Mix-library pages share one composition (360px directory; context below the center until 1700). `/templates/journeys` uses its own `260px 1fr 300px` grid and its own pane labels (`src/components/MegaMix.module.css:1`; `src/components/MegaMixLibrary.tsx:23`).
- **`docs/READY_MADE_MIX_PANES_2026-09-21.md` vs the Marketplace.** The doc says the center includes a setup link when the context pane is hidden. JITM-09 §2.74 says guided setup carries over to the Marketplace. The Marketplace has no such link (`src/app/(app)/marketplace/page.tsx:116-137`).
- **JITM-09 §2.5 contradicts itself for `/mixes/system`.** "Mixes MUST be marked current on `/mixes/…`" conflicts with "On phones, pages reached through More mark More": Invite people is a More item that lives at `/mixes/system`. The code marks Mixes.
- **`docs/design/DESIGN_GUIDELINES.md` vs JITM-09 §2.35 and the code.**
  - Line 29: "My mixes/Ready-made tabs" and a "selected inline editor". JITM-09 §2.35 and the code have three tabs and separate Preview and Edit views.
  - Line 48: "Mix beats show … channel and wording together" and "Library tracks show actual Beat counts and explicit timing summaries". The editor hides the channel; library rows show no timing.
  - JITM-07 and JITM-08 declare they supersede this file, but it is still present without a superseded banner.
- **JITM-05 §2.17 vs the glossary sheet.** The sheet uses §2.2's meanings, but the copy shown on the Marketplace omits the Marketplace entry.
- **`docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:55` vs `MarketplaceControls.tsx:102`.** The doc specifies an outline-only preview for listings, but the add form asks the owner to confirm they reviewed the wording.

**Gaps where no rule exists:**
- Mix name collisions when installing a Mega-Mix or adding a copy. JITM-09 §2.43 covers Mega-Mix names only.
- Mix status vocabulary (On / Active / Paused / Draft), and that "Start" must not mean both turning on and enrolling. JITM-05 has no entry.
- One channel-label set, including how Voicemail and WhatsApp are named.
- Placement of a page's primary action under phone pane switchers (it must be visible in the default pane).
- Default ordering and filtering of ready-made content by the account's business type.
- How the editor tells the owner that edits don't reach people already in the Mix, and whether to offer to update follow-ups not yet sent (product rule JITM-09 §2.12; UI unspecified).

## 7. Captures needed / NOT RUN

- **Editor review dialog on a Mix that is on (NOT RUN, code only).**
  - Open `/mixes?mix=cmv056cff000e7vl3h2z893u9&view=edit`, change one word in Beat 1, press "Review and start", capture the dialog at 390 and 1440. Expected: "Start this Mix?", 0 people, "No one is enrolled yet…".
  - Repeat on the seeded date-based "Estimate follow-up" (`demo_mix_relationship`). Expected: disabled "Start the Mix" with "Choose who gets this Mix."
- **Ready-made setup steps 2–3 (NOT RUN).** At `/templates/plan_sales_empathy_reconnect/use`, choose "Start the Mix", Continue, choose no one, Continue. Capture step 3 with the disabled button.
- **Phone "Details" pane (NOT RUN).** For a Marketplace listing (`/marketplace?item=…` → Details) and for a Mix (Manage Mix open).
- **Not-installed ready-made Mega-Mix (NOT RUN).** `/templates/journeys?journey=<real-estate id>` in the Set up pane at 390 and 320, and the laptop "Make it yours" with real values (the capture above is the installed Contractor).
- **Marketplace Mega-Mix listing at 1440 (NOT RUN).** To measure how far below the 13-Mix outline the add action sits.
- **Community listing preview and add form (NOT RUN).** No shares exist in the data.
- **Channel select (NOT RUN).** Open state, and switching Text → Call (main field swap).
- **Accessibility (NOT RUN).** Keyboard focus order through the editor, sheets and Marketplace; 200% text on the editor and the "Make it yours" form.
- **Physical devices and screen readers (NOT RUN).** iPhone Safari, Android Chrome, VoiceOver, TalkBack.
