# UI/UX workflow and icon audit — September 22, 2026

This audit follows the [contractor UX production release](CONTRACTOR_UX_PRODUCTION_RELEASE_2026-09-22.md). It covers the signed-in application: Today, Contacts, Mixes, Journey, Calendar, onboarding, More/Settings/Account and the app shell. The goals are to find workflow gaps, keep the experience clean and simple, and move icons toward conventions phone users already know.

**Constraint kept throughout:** the desktop three-pane structure (left rail, list, detail/review) does not change. Every recommendation here fits inside the existing navigation, pane and sheet layouts. Items that would contradict the [design export](design/jump-in-the-mix-designs/index.html) are marked **Decision** and need owner sign-off, because AGENTS.md gives the export precedence.

## Method and evidence limits

- **Code review:** the current working tree, in three areas: Today/Contacts, Mixes/Journey/Calendar/onboarding, and the shell/More/Settings/Account.
- **Fresh screenshots:** the local dev server at 390 px and 1440 px, using the demo account.
- **Local Mixes page failed.** `/mixes` returned "We couldn't open this page": a Prisma error, because this machine's local database doesn't have the newest working-tree migrations. This is an environment problem, not a production finding. Mixes observations use the same-day forensic screenshots in `.artifacts/user-journey-forensic-20260922/`.
- **Local banner.** The "Follow-ups are taking longer to prepare" banner in the local screenshots appears because no local worker is running.
- **Not measured:** no physical-device testing and no contractor usability sessions were run. Findings are expert review, not measured outcomes.

## Summary

The core loop works: see who's due, review the message, open the text/email/call app, record the result. The friction sits on top of that loop:

1. **Vocabulary.** Mix, Beat, mega-mix, Journey, stage, cue, anchor, touchpoint and "Work label" appear with no in-app explanation. A contractor has to learn the model before getting a first win.
2. **Getting one customer onto a follow-up takes too many screens.** From a Mix it is: select → Details tab → "Start for someone" → Journey Details pane. Onboarding recommends a full mega-mix, then ends with nobody enrolled.
3. **Icons that mislead on a phone.** The Today tab is a checkbox. The Contacts tab looks like "add contact". Mixes is the music "shuffle" symbol. The channel icon on a Today card looks like a Call/Text button but opens a review sheet.
4. **No consistent back control on phones.** Below 768 px there is no header, which matches the export. Sub-pages use assorted text links ("Settings", "Back", "Account", "Back to Contacts"), and some have none.
5. **Duplicate entry points with different behaviour:**
   - Add a person: 5 entry points, 3 names, including two different things called "Quick Add".
   - Contact edit: 5 links to one form.
   - Snooze: works differently from the review sheet and from More.
   - Settings: More, Settings, Account and the desktop Profile sheet overlap.

## Findings by priority

### P0: blocks or misleads in the first five minutes

| # | Finding | Evidence | Recommendation (structure kept) |
|---|---|---|---|
| 1 | The channel icon on each Today card looks like a Call/Text button but opens the review sheet | `jumps/page.tsx:317`; `design-workspaces.css:494-495` hides the "Review" label outside "Next up" | Keep the sheet. Show a visible "Review" label or a chevron-right, and leave the channel icon as a small non-interactive badge on the row |
| 2 | Putting one person on a Mix takes 3 screens and 2 page changes; the Beats view has no Start | `MixWorkspace.tsx:70,126`; `WorkflowJourney.tsx:235-236` | Add "Start for someone" (play icon) to the Mix header in the Beats view. Open a person picker sheet in place instead of sending the user to Journey |
| 3 | Onboarding recommends a complete mega-mix, asks ~10 preference fields, then ends with nobody enrolled ("this step sends nothing") | `OnboardingForm.tsx:23,35`; `JourneyPreferenceFields.tsx:13-29`; `MegaMixSetup.tsx:39-40`; `mega-mix-actions.ts:32` | End onboarding at "Add your first customer". Keep the saved preferences, but make the first screen after setup a single add-person-and-start step. **Decision:** make "one follow-up" the recommended default |
| 4 | Jargon appears with no explanation | "Skip beat" `jumps/page.tsx:281`; "Beat 2 of 4" `ContactProfile.tsx:175`; "Start a touchpoint" `:116`; "Loop · repeat this date" `:225`; "awaiting preparation"; "On the cue day" `TemplateUseForm.tsx:86`; "Waiting for its timing anchor" `WorkflowProgress.tsx:23`; "Work label"; "Queue import"; "background worker" `contacts/import/page.tsx:43`; `{{First Name}}` shown raw in Mix previews | Keep "Mix" as the brand noun and define it once: a short "?" info sheet on Mixes and Journey headers. Use plain words elsewhere: Beat → "step" or "follow-up"; cue/anchor → "start date"; Work label → "Job name". Render merge fields as chips ("First name") in previews |
| 5 | Contacts on a phone has no visible Add; "Add a contact" is buried in the "…" sheet next to tag management | `ContactsBulkWorkspace.tsx:137-173`; screenshot `contacts-390` | The central + is the export's add path, so keep it. Put "Add a contact" first in the … sheet with a person-plus icon, and give the empty state an Add button. **Decision:** a header person-plus icon beside … (the export's Contacts header has only Filter and …) |

### P1: workflow gaps

**Navigation and back paths**
- **No back control on phone sub-pages.** Phones have no header (`mobile-ux.css:3`, consistent with the export). Sub-pages use inconsistent text links, and `settings/connections`, `/settings`, `/account`, `/help`, `contacts/new` and `contacts/import` have none. From a Settings sub-page, the only exit is the More tab, which jumps two levels up.
  - **Fix:** one shared `BackLink` component (chevron-left + parent name) at the top of every sub-page. It is phone-only chrome, so desktop is unchanged.
- **More, Settings, Account and Profile overlap.**
  - Lead connections, Personal preferences, Notifications, Journey and Calendar each appear in both More and Settings.
  - The Appearance picker appears in 3 places.
  - Desktop has both the AccountNav links and a Profile sheet with the same links. "Sign out" there is styled as a destructive action.
  - **Fix:** make More the phone hub and Settings the only settings list. The Profile sheet keeps only Account, Help and Sign out (neutral style). Keep Appearance in the sidebar and Personal preferences only.
- **"Personal preferences" changes workspace settings.** Quiet-day check-ins and scheduling defaults write workspace-wide values (`account/preferences/page.tsx:89,109-112`). Move them to Settings or rename them honestly.
- **Weak active tab on phones.** Colour is the only cue (`design-workspaces.css:135-136`). Add a filled/weight change on the active icon.
- **Losing your place:**
  - "Add phone/email" inside the review sheet goes to the contact edit form with no `returnTo`, so the follow-up is lost (`EditableFollowUpAction.tsx:394`).
  - Mix editor Cancel goes to `/mixes` instead of back to the selected Mix (`MixEditor.tsx:255`).
  - Journey's "Create a Mix" links to bare `/mixes/new`, which silently redirects to Ready-made (`WorkflowJourney.tsx:186,204`; `mixes/new/page.tsx:17`).

**Duplicate or inconsistent actions**
- **Add a person: five entry points and three names.** The global Quick Add; Quick Add → "Other ways to add"; Contacts … → "Add a contact"; a second card also called "Quick Add" (`DeviceContactQuickAdd.tsx:170,183`); and the empty state.
  - **Fix:** rename the device card "Add from phone contacts" and give every entry point the same label.
- **Five links on the contact profile open the same edit form** (`ContactProfile.tsx:159,191,199,206,212`). Keep the header pencil and the inline "Add phone or email" prompts.
- **Snooze:** the review sheet has presets only; the More sheet has presets plus a custom date (`jumps/page.tsx:281,326-327`). Use one snooze sheet everywhere.
- **Skip/Mark done:** three labels for Skip. **Note:** four labels ("Note", "Add a note", "Add update", "Log conversation"). Pick one of each.
- **Schedule a one-time follow-up** leaves the profile for `/contacts?intent=…` (`ContactProfile.tsx:119`). Open the sheet in place.

**Confirmation and undo**
- **No confirmation before deleting a saved view** (`ContactSavedViewsBar.tsx:25`), retiring a Journey stage or removing a rule (`settings/journey/page.tsx:23-24`).
- **Archiving has no Undo** (`contacts/page.tsx:246,252`), while Restore needs a second confirmation (`archived/page.tsx:59`). Invert this: show an "Archived · Undo" toast and restore with one tap.
- **Confirm dialogs are inconsistent.** `window.confirm` is used in `ContactTimeline.tsx:100` and `QuickAdd.tsx:81`; `ConfirmDialog` is used elsewhere.
- **Bulk message says "Schedule message" when nothing is sent** (`ContactsBulkWorkspace.tsx:223-225`). Say "Add to Today".

**Mixes and Journey**
- **New Journey connections save switched off** (`WorkflowJourney.tsx:89`, `WorkflowRuleEditor.tsx:23`). The enable checkbox is last. Default to on, or put the switch at the top.
- **Delays are entered in minutes** (up to 525600) (`WorkflowRuleEditor.tsx:65,68`). Use a number + unit picker (hours/days/weeks).
- **Some Journey checkboxes save instantly with no undo** (`WorkflowJourney.tsx:238-239`).
- **Connection handles disappear below 0.7 zoom.** "Fit map" on a 390 px phone drops below that, so they vanish (`WorkflowJourney.tsx:93`). Keep handles visible or show "Zoom in to connect".
- **Hidden Beat controls.** Reorder and delete sit inside a "…" disclosure, and there is no drag handle (`MixEditor.tsx:224,243`). New Beats default to Phone call (`:53`). A new Mix defaults to "When I add a date" rather than "When I start it for someone" (`:107`).
- **Pause/Start/Archive are hidden on phones** in a collapsed "Manage Mix" at the bottom of Details (`MixWorkspace.tsx:128`). Pause uses the clock icon.
- **Journey asks you to "Record the visit outcome in Calendar"** (`WorkflowProgress.tsx:24`), but Calendar hides this behind "Event details and actions" (`calendar/page.tsx:77`).
- **What's automatic vs manual is explained in three places** (`TemplateUseForm.tsx:116`, `MixEditor.tsx:254`, Settings). Show one consistent line on each Mix: "You send each one" or "Sends automatically".

**Touch-only gaps**
- **Hover-only explanations can't be seen on a phone.** They exist only as `title` attributes: disabled Text/Email/Call (`ContactProfile.tsx:166-168`), disabled channel chips (`FollowUpChannelChoice.tsx:371`), "Click to change the time" (`JumpWorkflow.tsx:413`). Show the reason as visible helper text.
- **Search on Today needs two taps**, because it's inside the Filter sheet (`jumps/page.tsx:361-372`). The Today Filter button uses a gear icon; Contacts uses the filter icon.
- **Contact rows have no call/text shortcut.** Calling someone takes three taps.

### P2: polish

- **Formatting:**
  - 24-hour times ("Day 0 · 10:00") in `MixBeatPreview.tsx:10` and `MegaMixPreview.tsx:16`. Use the account's time format.
  - Raw lowercase values: "phone call", "active"/"paused" (`MixBeatPreview.tsx:11`, `MixLibraryNav.tsx:15`), while the filter says "On".
- **Clutter:**
  - "Choose a complete mega-mix" is styled like "Clear filters" (`mixes/page.tsx:48`).
  - Quiet-day rows show 4 buttons (`QuietDaySuggestions.tsx:60`).
- **Dead code:** `TodayBriefing` is imported but never rendered (`jumps/page.tsx:17`).
- **Password field:** the account password form lacks the show/hide `PasswordInput` used on sign-in (`account/page.tsx:59`).
- **Offline page:** "Try again" goes to `/jumps` instead of retrying the current page.

## Icon system

### Current state

`AppIcon.tsx` has 39 hand-drawn paths at stroke 1.8, while the export uses 1.75. No icon library is installed. Icons are missing for common phone actions: chevron-left/right, undo, copy, share, mic, map pin, play, pause, star, grip handle, zoom, smartphone, and person-plus as a distinct action. Text glyphs (`→`, `›`, `⋯`, "+ New…") stand in for icons in More, Settings, Quiet-day, Calendar and Journey.

### Recommendation

Adopt **`lucide-react`** behind the existing `AppIcon` name map, so call sites keep `<AppIcon name="…" />` and the change is confined to one file. Lucide shapes follow SF Symbols/Material conventions, and the export's icons already use lucide geometry (`users`, `chevron-right`, `shuffle`). Set stroke 1.75 and an explicit default size.

### Tab and navigation icons

| Destination | Now | Phone-familiar replacement | Notes |
|---|---|---|---|
| Today | square checkbox | `circle-check` (export), or `house` / `calendar-check` | **Decision:** the export uses circle-check; a house reads as "home screen" most clearly |
| Contacts | person + plus/lines (reads as "add contact") | `users` (export) or `contact-round` | Frees person-plus for the actual Add action |
| Quick Add | + bubble | keep | Matches the iOS/Android FAB pattern |
| Mixes | shuffle (reads as "random / music") | `list-checks`, `layers` or `repeat` | **Decision:** the export uses shuffle; recommended change to `list-checks` (a sequence of steps) |
| Journey | winding path | `route` or `git-fork` | Desktop rail / More row |
| Calendar | calendar | keep | |
| More | three dots | keep (`ellipsis`) | |
| Settings / Help / Account | gear / ? / person | keep; `circle-user` for Account | |

### Actions

| Action | Icon | Where it's text-only or wrong today |
|---|---|---|
| Back | `chevron-left` | all phone sub-pages (see P1) |
| Row disclosure | `chevron-right` | `›` glyphs in More/Settings; "Later this week ›" on Today |
| Add contact | `user-plus` | Contacts … sheet, empty state |
| Call / Text / Email | `phone` / `message-circle` / `mail` | keep; add as row quick actions on Contacts |
| Review (open sheet) | `chevron-right` + label | Today cards (P0 #1) |
| Snooze / remind later | `alarm-clock` or `bell-plus` | review sheet and More sheet |
| Skip | `skip-forward` | "Skip beat" |
| Mark done | `check` | keep |
| Undo | `undo-2` | Today undo, return tray, archive toast |
| More actions | `ellipsis` | "More" text on Today cards (0.625 rem label) |
| Search | `search` | Today Search button |
| Filter | `sliders-horizontal` | Today uses a gear (inconsistent) |
| Edit | `pencil` | profile "Edit", "Rename" |
| Delete / Remove | `trash-2` | tags, fields, saved views, phone/email rows |
| Archive | `archive` | keep; add to "Archive contact…" |
| Export / share | `share` (iOS) or `upload` | Export CSV currently shows the Import glyph |
| Import | `download` | keep |
| Copy | `copy` | "Copy" in review |
| Voice note | `mic` | `VoiceNoteButton.tsx:148` currently a plain circle |
| Address | `map-pin` (and link to Maps) | profile address uses the contacts icon |
| Start for someone / Pause | `play` / `pause` | Mix header; Pause currently uses the clock icon |
| Preview | `eye` | Mix Preview currently uses the shuffle icon |
| Reorder | `grip-vertical` | Mix Beats |
| Zoom / fit | `zoom-in`, `zoom-out`, `maximize` | Journey "−", "+", "Fit map" |
| Close / dismiss | `x` | "Dismiss"/"Later" in the return tray |
| Business | `briefcase` or `store` | Settings "My business" currently uses a pencil |
| Preferences | `sliders-horizontal` | currently the filter icon |
| Device session | `smartphone` / `monitor` | Account sessions use an empty circle; the PWA prompt uses a phone handset |

Every icon on its own (without a label) keeps an `aria-label`. On phones, primary actions keep a visible label next to the icon; only secondary row actions (call, text, …) go icon-only.

## Suggested implementation slices (desktop 3-pane unchanged)

1. **Icon foundation:**
   - Add lucide behind `AppIcon`.
   - Remap the names in the tables above.
   - Replace text glyphs.
   - Add the shared `BackLink`.
   - Make the phone active tab more visible.
   - Visual-only; verify with screenshots in both themes at 390/834/1440.
2. **Today clarity:**
   - A distinct Review affordance on cards.
   - An icon More button.
   - Search outside the Filter sheet.
   - One snooze sheet.
   - Unified Skip/Done/Note labels.
   - `returnTo` from the review sheet to the contact edit form.
3. **Contacts:**
   - Add first in the … sheet, plus the empty-state Add.
   - Rename the device card.
   - Call/text row actions.
   - Archive Undo toast, one-tap restore.
   - Saved-view delete confirmation.
   - Visible disabled-reason text.
4. **Start a follow-up:**
   - "Start for someone" in the Mix header, with an in-place person sheet.
   - Onboarding ends at "Add your first customer".
   - Plain-language labels and merge-field chips.
5. **Mixes/Journey editing:**
   - Connections enabled by default.
   - Day/hour delay units.
   - Grip reorder.
   - Visible Pause/Start.
   - Cancel returns to the Mix.
   - Fix the "Create a Mix" link.
   - Confirm stage/rule removal.
6. **IA cleanup:**
   - One settings list.
   - Profile sheet trimmed.
   - Personal vs workspace preferences split.

## Decisions needed from the owner

**Decided September 22:** Today becomes a house and Mixes keeps the shuffle. Onboarding stays mega-mix first, then adds the first customer. The brand names stay, with plain explanations. Contacts gets a person-plus header icon. See the [implementation record](UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md).

1. **Tab icons for Today and Mixes.** The export uses a circle-check and a shuffle. Recommendation: circle-check (or house) for Today, `list-checks` for Mixes.
2. **Onboarding default.** Should "one follow-up for one customer" replace "complete mega-mix" as the recommended first path?
3. **Plain-language vocabulary.** Keep "Mix" as the brand noun but replace Beat/cue/anchor/touchpoint/work label in the UI?
4. **Contacts header Add icon.** The export shows only Filter and …; is a person-plus icon acceptable?
