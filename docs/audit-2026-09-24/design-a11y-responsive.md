# Design fidelity, accessibility and reflow audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only, static review of the worktree at `the repository` (d70ec54 = e26fdd4 + docs; the code on jumpinthemix.com). Nothing was built, run or rendered.

What was read in full:

- Design authority: `docs/design/DESIGN_GUIDELINES.md`, `docs/design/jump-in-the-mix-designs/tokens.css`, and the export screens Main, Review, TodaySent, TabletToday, DesktopToday, Contacts, Contact, DesktopContacts, Mixes, DesktopMixes, Calendar, DesktopCalendar, QuickAdd, DesktopQuickAdd, More, LandingPhone, Landing, BubbleKit (inline sizes, colors and structure), plus targeted greps of the Dark* variants (DarkMain, DarkTodaySent, DarkLanding, DarkLandingPhone) for the colors that differ by theme.
- Prior audits, so fixed items are not repeated: `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md` (items 1, 2, 5, 7, 8, 9, 10 fixed; the open P2 list was re-verified item by item below), `docs/design/DESIGN_CONSISTENCY_2026-09-23.md`, `docs/design/DESIGN_REMAINING_ISSUES_2026-09-20.md`, `docs/design/RESPONSIVE_AUDIT_2026-09-19.md`, `docs/MOBILE_CLARITY_2026-09-18.md`, and the e26fdd4 diff (phone text sizes).
- Implementation CSS, in cascade order per `src/styles/index.css` (base, components, date-types, group-activation, contacts-bulk, auth, admin*, contact-import, templates, support, contact-acquisition, mfa, desktop-ux, mobile-ux, ux-friction, live-search-cards, product, when-picker, homepage, conversation, public-documents, mobile-clarity, design-tokens, design-system, design-workspaces, design-public, contacts-workspace, design-details, mix-library, mega-mixes, phone-icons, disclosures, popups) and every CSS module (JumpWorkflow, ContactTimeline, MixEditor, WorkflowJourney, MegaMix, ProductDemo, JourneySetup, PreparationNotice; AdminReports by grep).
- Components and pages: AppShell, Nav, QuickAdd, Sheet, ConfirmDialog, useConfirmDialog, ReviewDialog, Appearance, AppIcon, BackLink, Logo, Notice, EmptyState, TodayNavigation, FormGuard, sheet-layout, jumps/page, JumpWorkflow, JumpActionControls, EditableFollowUpAction, FollowUpChannelChoice, contacts/page, ContactsBulkWorkspace, ContactProfile, ContactTimeline, mixes/page, MixWorkspace, MixEditor, MixLibraryNav, MixLibraryShell, MixBeatPreview (grep), journey/page, WorkflowJourney, WorkflowPeople (grep), calendar/page, CalendarEntryForm, WhenPicker, TimezonePicker, more/page, settings/page, account/page, help/page, login/page, onboarding/page, PublicLanding, PublicHeader, PublicFooter, ProductDemo, WaitlistForm, MixesFor, GlobalLiveSearch, AutoSubmitForm, PwaInstallPrompt, MergeFieldText, MixFavoriteButton, BrandTermsHelp, root and app layouts, the page-class usage of every `page.tsx`.
- Contrast ratios were computed with `node -e` from the token hex values (WCAG 2.x relative luminance); opacity cases were alpha-blended over the page color first.

Severity scale: P0 unusable for keyboard/screen-reader/phone users; P1 clearly deviates from the export or blocks a phone workflow; P2 polish/consistency. "VERIFIED" means the markup and the full cascade (specificity + source order across all 33 stylesheets) were traced; "SUSPECTED" means a rendered check is still needed.

What needs a screenshot or device check (cannot be established statically): the measured heights in F2 and F3 at 320/390px, the docked review width at 1920/2560 (F4), the 768–900 top header (F15), horizontal-scroll affordances (F17), 320px merge chips (F18), 200% text behaviour (F19), print preview (F20), iOS scroll-behind on modal sheets, and anything involving real fonts' metrics.

## Findings (ranked, most severe first)

### F1. The single-key "N" shortcut cannot be turned off or remapped (WCAG 2.1.4, Level A)
- Severity: P1
- Status: VERIFIED
- Evidence: `src/components/QuickAdd.tsx:92` registers a window `keydown` listener that opens the Quick Add modal on "n" whenever no modal dialog is open and the target is not an input/textarea/select/contentEditable; `:22` advertises `aria-keyshortcuts="N"`. There is no preference, no focus condition and no way to disable it (grep for "shortcut" finds only QuickAdd, the PWA prompt copy and the manifest). The 09-23 audit listed this as "can't be turned off" (P2); it is a Level A conformance failure because none of the three allowed conditions (turn off, remap, active only on focus) is met.
- Failure scenario: a speech-input user on Contacts (desktop or phone) dictates while focus rests on a row button; a misrecognized "n" opens Quick Add over their work. A keyboard user tabbing through Today presses "n" while a link has focus and loses their place.
- Fix: add a per-user preference "Quick Add keyboard shortcut (N)" to Account → Personal preferences (default on) and read it in `QuickAddDialog` before installing the listener; also ignore `event.isComposing` and `event.repeat`. Alternative with no data change: only fire when `document.activeElement` is `body`, `main` or inside `.app-nav`.
- Effort: S–M; Risk: low; Needs owner decision: yes (preference vs. focus-scoped)
- Tests: extend `e2e/visual-fitment.spec.ts` "Quick Add shortcuts continue into actionable contact journeys": with the preference off, pressing N does nothing; with it on, N opens; N inside a textarea never opens.

### F2. Phone controls that are still under 44px after the 09-23 target fix
- Severity: P1
- Status: VERIFIED (cascade); measured heights need a 390px screenshot
- Evidence (all win over the ≤900px restore block in `src/styles/phone-icons.css:58-77`, which does not list them):
  - Calendar week navigation: `src/styles/design-workspaces.css:428` `.calendar-page .calendar-week-nav .button { font-size: .75rem; min-height: 36px; padding: 6px 8px }` inside `@media (max-width: 1099px)`; specificity 0,3,0 beats `.button { min-height: 48px }` (`components.css:237`). "Previous week / Today / Next week" are 36px tall with 12px text on every phone and tablet.
  - Journey view tabs: `src/components/WorkflowJourney.module.css:3` `.tabs button { min-height: 36px }`; `:60` and `:65` shrink them further at ≤600px (12px text; the Options button 11px). The ≤900px rule at `:219` restores only `.canvasControls`, `.nodePopulation` and the connection hint.
  - Calendar duration chips: `src/styles/design-details.css:141` `.calendar-form-row .when-chip { min-height: 40px }` overrides `when-picker.css:28` (44px).
  - Contacts Filter button: `src/styles/contacts-workspace.css:21` `.contact-filter-button { height: 42px }`.
  - Marketplace kind chips `mega-mixes.css:48` (36px) and section tabs `:42` (40px).
  - Contact profile beat-track and touchpoint links: `contacts-workspace.css:82` and `:122` have no min-height and 12px text (`:76`), so each link is roughly 32px tall.
- Failure scenario: 390px Calendar, one thumb: "Next week" is a 36px × 12px target; phone Journey: Setup/Progress/Results are 36px with 12px labels; a person switching a meeting to "45 min" taps a 40px chip.
- Fix: add these selectors to the `@media (max-width: 900px)` block at the end of `phone-icons.css` with `min-height: 44px` (and `font-size: .8125rem` for the week nav and tabs); or fix at source (`.tabs button { min-height: 44px }`, `.contact-filter-button { height: 44px }`, drop the 40px override).
- Effort: S; Risk: low; Needs owner decision: no
- Tests: extend the 44px measurement in `e2e/design-consistency.spec.ts` to Calendar (week nav, duration chips), Journey (view tabs) and Marketplace at 390px; assert `boundingBox().height >= 44`.

### F3. Today queue rows: 14px names, 32px/11px avatars and uppercase group headers where the export uses 16px, 40px/14px and sentence case
- Severity: P1
- Status: VERIFIED
- Evidence: `src/styles/design-workspaces.css:311` `.today-page .jump-card-heading h3 { font-size: .875rem }` is unconditional and comes after the ≥768px rule at `:100` (`1rem`) with equal specificity, so names render at 14px on phone, tablet and desktop; `mobile-clarity.css:56` (1.05rem) and `desktop-ux.css:24` (1rem) lose on order/specificity. Export `Main.html` / `TabletToday.html` / `DesktopToday.html` rows: name `16px/22px/600`. Avatar: `:307-309` grid column 32px, `.jump-person-avatar { width: 32px; height: 32px; font-size: .6875rem }` vs. export 40px circle with 14px/600 initials on all three screens (e26fdd4 raised the Contacts avatars to 14px but left Today at 11px). Group headers: `components.css:334` (≤767px) `.section-label h2 { text-transform: uppercase; letter-spacing: .06em }`; `product.css:205` resets only the size, and the only resets of `text-transform` are for Journey touchpoints and quiet-day headings (`design-details.css:197,272`), so phones show "OVERDUE"/"TODAY" while the export shows "Overdue"/"Today" at 13px/600 (`Main.html`). Minor in the same rows: snippet 14px vs export 15px Newsreader (`:315`), Mix line 13px vs 14px (`:313`).
- Failure scenario: 390px Today, light or dark: the primary screen's names read a step smaller than every other list in the app (Contacts rows are 16px), initials are 11px, and the section headers are shouting caps that match nothing in the export.
- Fix: `design-workspaces.css:311` → `font-size: 1rem`; `:307` grid column `40px`, `:309` `width/height: 40px; font-size: .875rem`; add `.today-page .section-label h2 { text-transform: none; letter-spacing: 0 }` after `:319`. Re-check 320px so the name + time pill still fit (the pill is `white-space: nowrap`-free; `h3` has `flex: 1 0 auto` at `:500`, consider `min-width: 0`).
- Effort: S; Risk: low (rows grow ~8px); Needs owner decision: no (unless 14px was a deliberate density choice; see open questions)
- Tests: update the visual baseline in `e2e/visual-fitment.spec.ts` and add computed-style assertions (name 16px, avatar 40px, header `text-transform: none`) to `e2e/design-consistency.spec.ts` for Today at 390 and 1440.

### F4. The docked Today review has no maximum width; the composer stretches to ~900px
- Severity: P2
- Status: VERIFIED
- Evidence: `src/styles/design-workspaces.css:107-108` position the review sheet from the queue edge to the right edge of `.today-page` (max 1672px) with `.sheet-panel { width: 100% }`; nothing caps `.review-composer` or `.review-workspace` (grep: only the `1fr 280px` grid at `:121` for ≥1600px). At 1920px: 1672 − 440 − 24 − 280 − 32 ≈ 896px of 22px Newsreader (`:114`), about 80 characters per line. Export `DesktopToday.html`: review column `max-width: 680px`, centered, with a 340px aside. Also the handoff button is a standard `.button` (44px, 48px ≤900, radius 12) where the export draws a 54px/17px, radius-16 primary on phone (`Review.html`) and 52px/radius-14 on desktop.
- Failure scenario: 1920 or 2560 monitor, light theme: the draft textarea and channel segmented control span most of the screen, working against the guideline "Long prose and forms should remain readable instead of stretching".
- Fix: `.review-composer { max-width: 680px }` (and `margin-inline: auto` when no context column); give the handoff button `min-height: 52px; border-radius: 14px` inside `.follow-up-review-sheet`.
- Effort: S; Risk: low; Needs owner decision: yes (cap vs. fluid)
- Tests: add a width assertion at 1920/2560 next to the queue-width check described in `docs/design/RESPONSIVE_AUDIT_2026-09-19.md`; screenshot compare against DesktopToday.

### F5. The compact rail (901–1279px) sets navigation labels at 10px
- Severity: P2
- Status: VERIFIED
- Evidence: `src/styles/design-workspaces.css:294` `.sidebar .nav-link { font-size: .625rem }` and `:297` `.sidebar .account-sidebar-actions .button { font-size: .625rem }` inside `@media (min-width: 901px) and (max-width: 1279px)`. 10px is below the project's 13px floor (`e2e/visual-fitment.spec.ts:66`, which only runs on the phone project so it never sees this) and below the export's smallest text (11px tab labels).
- Failure scenario: 1194px landscape tablet (the export's own laptop width): "Contacts", "Calendar" and the "Profile" button read at 10px under the icons.
- Fix: `.75rem` with `overflow-wrap: anywhere` fits the 80px rail; or make the primary links icon-only with `aria-label`s the way `.sidebar-utilities a` already are (`:296`).
- Effort: S; Risk: low; Needs owner decision: no
- Tests: run the readable-text floor of `visual-fitment.spec.ts` at a 1194px viewport too.

### F6. Text below the 13px floor remains on Today, Calendar, the Mix editor and Journey
- Severity: P2
- Status: VERIFIED (cascade)
- Evidence (export sizes in parentheses):
  - Today review: `.review-send-hint` .75rem (`design-workspaces.css:331`; export 13px "Goes to…"), `.review-draft-status` and its text button .75rem (`design-details.css:33-34`), `.review-mix-heading small` .75rem (`:24`; export 13px/600 "Beat 1 of 2 · 1 day late"), `.channel-recommended` 11px/700 (`phone-icons.css:85`).
  - Calendar: `.calendar-event-time` .75rem (`design-workspaces.css:493`; export 13px/600), `.calendar-event h4` .875rem (`:402`; export 16px/600), and on desktop the per-event Edit/Download/Cancel buttons are 11px in 32px controls (`:407`; the phone override at `phone-icons.css:76` does not apply above 900px).
  - Mix editor timing strip links 11px (`design-workspaces.css:357`).
  - Journey directory roster status chips 10px (`WorkflowJourney.module.css:99`), view tabs 12px and Options 11px at ≤600px (`:60,:65`).
  - Marketplace count badge 11px (`mega-mixes.css:44`).
- Failure scenario: a 390px phone in dark mode: "To (626) 555‑0142. Open your app to send…" and the draft status are 12px `--text-3` on `--page` (6.45:1 passes contrast but the size is under the floor the project set on 09-24); the roster chips "active"/"needs attention" are 10px.
- Fix: raise each to `.8125rem` (13px) except the tab labels; chips to `.75rem`; desktop calendar event actions to 13px/36px. The floor test only covers phone widths and elements it can reach, so extend it to the Today review sheet, Calendar and Journey directory.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: `e2e/visual-fitment.spec.ts` "meaningful text remains readable" — add routes `/calendar`, `/journey` and an opened review sheet.

### F7. Confirmations and Quick Add bubbles do not use the export's toast/bubble language
- Severity: P2
- Status: VERIFIED
- Evidence: the completed-follow-up confirmation (`src/components/JumpWorkflow.tsx:137-147`) is styled by `JumpWorkflow.module.css:6-16` with `background: color-mix(in srgb, Canvas 94%, currentColor 6%)` and a `color-mix(currentColor 18%)` border, portalled into `.follow-up-confirmations > *` (`design-workspaces.css:345`: `--raised`, radius 20, shadow) — a card inside a card. The export (`TodaySent.html`, `BubbleKit.html` "The app, confirming") is a `--toast` (#1A1830) bubble with `--toast-text`, a 32px check circle at 16% white, 15px copy, a 15px/700 light-violet Undo and a bottom-left tail. The `--toast`/`--toast-text` tokens exist (`design-tokens.css:22-23,88-89`) but are only used by the unused `.hero-demo` (`base.css:98`) and an admin `<pre>`. Quick Add's capture bubble `.quick-add-original` (`design-system.css:86`) uses `--surface`, radius 20/20/4/20 and no tail; `QuickAdd.html` shows `--violet-wash`, radius 22/22/6/22 with a tail. The desktop Quick Add button is `border-radius: 12px` (`design-workspaces.css:7`) where `DesktopToday.html` uses `14px 14px 14px 4px`, the one navigation control the guidelines allow a tail corner.
- Failure scenario: mark a follow-up sent on a 390px phone: the confirmation appears as a light bordered card instead of the dark bubble every other confirmation in the design system uses; in dark mode its background is the UA `Canvas` color, not a token.
- Fix: `.completedPlaceholder { background: var(--toast); color: var(--toast-text); border: 0; border-radius: var(--radius-bubble) }` plus a `::after` tail using `var(--toast)`; Undo as `.text-button` colored `var(--violet-ink)` on the light dark-mode toast (7.10:1) and `#CFC9FF`-equivalent (`var(--violet-ink)` dark value is #C9C3FF) on the light-mode toast; `.quick-add-original { background: var(--violet-wash); border-radius: 22px 22px 6px 22px }` with a tail; `.sidebar .global-quick-add { border-radius: 14px 14px 14px 4px }`.
- Effort: S–M; Risk: low; Needs owner decision: yes (adopt the dark toast)
- Tests: screenshot in both themes; keep the `role="status"` assertion in `e2e/jump-outcome-timeline.spec.ts`.

### F8. Mix library rows omit the export's rhythm track
- Severity: P2
- Status: VERIFIED
- Evidence: `Mixes.html` and `DesktopMixes.html` rows show name, "1 person" with a status dot, a dots-on-a-line track positioned by day, and "2 beats over 6 days". `src/components/MixLibraryNav.tsx:13-16` renders an icon circle, the name and one `small` line ("active · 3 Beats · 2 people"). The styles for the track exist (`design-details.css:81-84` `.mix-library-rhythm`) but no component emits that markup (grep across `src` finds it only in CSS). The guideline asks that "Library tracks show actual Beat counts and explicit timing summaries".
- Failure scenario: any width, either theme: the library reads as a plain list; the export's at-a-glance rhythm and total span are missing.
- Fix: in `MixLibraryNav`, render `<span class="mix-library-rhythm">{steps.map(i)}</span>` with `left` from `dayOffset / maxOffset` for calendar-day Beats (`data-appointment` for anchored ones, already styled at `:84`) and `<small>{n} beats over {span} days</small>`; the `steps` data (`dayOffset`, `anchor`) is already passed in.
- Effort: M; Risk: low; Needs owner decision: no
- Tests: `e2e/mix-library-workspace.spec.ts`: each row exposes one dot per Beat and the span text.

### F9. Journey connection lines and labels dimmed to 16–22% opacity fall to ~1.2:1
- Severity: P2
- Status: VERIFIED (still open from 09-23)
- Evidence: `src/components/WorkflowJourney.module.css:192` `.edge[data-direction=unrelated] { opacity: .16 }` and `:200` `.edgeLabel[data-direction=unrelated] { opacity: .22 }`. Blended: `--text-3` #6B6A82 at .16 over white → #E7E7EB, 1.23:1; over dark `--page` → #272536, 1.25:1; labels 1.34/1.40:1. Hover and `:focus-visible` restore full opacity (`:193,:201`), and unrelated edges are also thinner (1.5px vs 3px), so the state is not color-only; but the dimmed edges are still clickable controls (`.edge { cursor: pointer }`) below 3:1 (WCAG 1.4.11).
- Failure scenario: a Mix is selected on the desktop map in light mode; every other connection becomes practically invisible, so a mouse user cannot see where to click to select a different path without first clearing the selection.
- Fix: keep the emphasis but dim with a passing stroke instead of opacity: `stroke: var(--field-border)` (3.34:1 light, 4.40:1 dark) at 1.5px, opacity ≥ .6 for labels; reserve `.16` for the SVG hit area only.
- Effort: S; Risk: low; Needs owner decision: yes (visual emphasis trade-off)
- Tests: `e2e/journey-connections.spec.ts`: assert computed opacity ≥ .6 on unrelated edges, or an axe non-text-contrast check on the canvas.

### F10. Marketplace report badge: white on `--late` is 2.29:1 in dark mode
- Severity: P2
- Status: VERIFIED
- Evidence: `src/styles/mega-mixes.css:44-45` `.marketplace-alert { background: var(--danger); color: var(--on-violet); font-size: .6875rem; font-weight: 700 }`; `--danger` aliases `--late`, which is #FF8A7A in dark (`design-tokens.css:86`): white on #FF8A7A = 2.29:1 (light #C8372D = 5.20:1 passes). Rendered at `src/app/(app)/marketplace/page.tsx:69`.
- Failure scenario: dark theme, "My shares" tab with an open report: the count in the red badge is unreadable 11px white on salmon.
- Fix: `background: var(--status-danger-bg); color: var(--late)` (4.69:1 light, 6.22:1 dark) and `font-size: .75rem`; the `aria-label` already carries the count.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: axe on `/marketplace?section=mine` in dark within `e2e/marketplace.spec.ts`.

### F11. The waitlist band hardcodes colors and inverts the dark-mode input
- Severity: P2
- Status: VERIFIED
- Evidence: `src/styles/design-public.css:55-61` sets `#1a1830` band, `#eeedf6`/`#b9b7cc` text, a white input with `#1a1830` text and `#cfcedb` border, `#6b6a82` placeholder — the only page-level hex values outside tokens. Export `Landing.html` (light): band #1A1830, white input. `DarkLanding.html` / `DarkLandingPhone.html`: band #1B1930 (= dark `--surface`), input `background: #12101F; color: #EEEDF6` (= dark `--page`/`--text`). The implementation's dark band (#1a1830) is close, but the input stays white — the only white element on the dark page. Also `.inline-form-error` / `.inline-form-success` (`WaitlistForm.tsx:26`) have no CSS anywhere, so the error line is plain band-colored text with no color cue.
- Failure scenario: dark theme homepage: a bright white email field in a dark band; the "already on the list" error is indistinguishable from the label except by wording.
- Fix: band `background: light-dark(#1A1830, var(--surface))` (or a `--band` token defined in both themes); `input { background: var(--page); color: var(--text); border-color: var(--border) }`; placeholder `var(--text-3)` (6.45:1 dark, 4.99:1 light); `.inline-form-error { color: #FF8A7A }` inside the band (7.53:1; light `--late` would be 3.32:1 there).
- Effort: S; Risk: low; Needs owner decision: no
- Tests: `e2e/homepage-conversion.spec.ts` dark screenshot; axe on the waitlist section.

### F12. Sheets place initial focus on the Close control
- Severity: P2
- Status: VERIFIED (still open from 09-23)
- Evidence: `src/components/Sheet.tsx:97-123` has no autofocus or focus management; `openSheet` (`src/lib/sheet-layout.ts:16,22`) calls `dialog.show()`/`showModal()`, which focus the first focusable element in tree order: the header `icon-button` at `:119` (the `leading` avatar is an aria-hidden span). This applies to phone bottom sheets and to the docked desktop review opened from the Review button. Confirmations are correct (`ConfirmDialog.tsx:31`, `useConfirmDialog.tsx:25` focus Cancel; `ReviewDialog.tsx:23` focuses "Keep editing").
- Failure scenario: a screen-reader user taps Review on a phone: the first announcement is "Close Follow up with Dana, button" and the message field is several swipes away.
- Fix: in `Sheet`, after opening focus the `h2` (`tabIndex={-1}`) so the title is announced, or accept an `initialFocus` selector and focus the compose textarea for the review sheet; keep `restoreTriggerFocus` on close.
- Effort: S–M; Risk: low; Needs owner decision: no
- Tests: `e2e/sheet-interactions.spec.ts`: after opening the review sheet, `document.activeElement` is the heading/textarea, not the close button.

### F13. Repeated per-item buttons share one accessible name
- Severity: P2
- Status: VERIFIED (still open from 09-23)
- Evidence: `src/components/ContactsBulkWorkspace.tsx:168` `<ConfirmDialog trigger="Delete…" …>` for every tag, and `src/components/ContactProfile.tsx:234` `trigger="Stop…"` / `"Remove…"` for every assigned Mix, without `triggerAriaLabel`; `ConfirmDialog.tsx:31` applies `aria-label` only when it is supplied. The date rows already do it right (`ContactProfile.tsx:223`).
- Failure scenario: a screen-reader user in the Contact tools sheet hears "Delete…, button" five times with no tag name until the dialog opens.
- Fix: `triggerAriaLabel={`Delete the ${group.name} tag`}` and `Stop ${assignment.mix.name}` / `Remove ${assignment.mix.name}`.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: axe (`button-name` duplicates are not flagged) — add an explicit `getByRole('button', { name: /Delete the .* tag/ })` in `e2e/contact-lifecycle-management.spec.ts`.

### F14. Profile initial link is named "Open profile menu" but navigates to More
- Severity: P2
- Status: VERIFIED (still open from 09-23)
- Evidence: `src/components/AppShell.tsx:72` `<Link className="button small mobile-profile-link" href="/more" aria-label={`Open profile menu for ${userName}`}>{initial}</Link>`, visible at 768–900px (`auth.css:68`). The visible label is a single letter; the name promises a menu, the control is a page link.
- Failure scenario: a voice-control user says "click More" or "click K" on a tablet and nothing matches; a screen-reader user expects a menu to open.
- Fix: `aria-label="More"` (the destination) or render the same Profile sheet used on the desktop rail.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: `e2e/accessibility.spec.ts` at 834px: link name equals "More".

### F15. Portrait tablets (768–900px) get a sticky top header the export does not have
- Severity: P2
- Status: VERIFIED (cascade); layout needs an 834px screenshot
- Evidence: `src/styles/auth.css:67-69` shows `.mobile-app-header` (sticky, 64px, logo + profile initial) at ≤900px; it is hidden at ≤767px (`base.css:346`, `mobile-ux.css:3`) and, only for Journey, at ≤900px (`design-workspaces.css:512`). `TabletToday.html` (834×1194) has no top header: the queue header starts under a 44px inset and the bottom navigation is the only chrome. The docked Today layout is otherwise implemented per the export at these widths (`design-workspaces.css:299-305`).
- Failure scenario: iPad portrait on Today/Contacts/Calendar: a duplicate logo row (the rail is hidden, so the logo appears nowhere else) costs 64px and a second "profile" entry point beside the More tab.
- Fix: apply the Journey rule to every page (`.app-shell > .mobile-app-header { display: none }` at ≤900px) and rely on More; or, if the header stays, drop its sticky positioning.
- Effort: S; Risk: low; Needs owner decision: yes
- Tests: `e2e/design-refresh.spec.ts` "responsive destinations stay reachable" at 834px: no `.mobile-app-header` visible.

### F16. Landing typography runs a step below the export at every width
- Severity: P2
- Status: VERIFIED
- Evidence: `src/styles/homepage.css:28` `.public-page .section-heading h2 { font-size: clamp(1.875rem, 3.3vw, 2.625rem) }` → 30px on a 390px phone and 42px at ≥1273px; export `LandingPhone.html` 36px/40px and `Landing.html` 52px/56px. Steps: `homepage.css:93` `.relationship-steps h3 { 1.0625rem }` (17px) vs 21px phone / 24px desktop. Own-voice band: `design-public.css:41` `clamp(2rem, 3.2vw, 3.25rem)` → 32/52px vs export 38/60px. Hero CTAs are standard `.button` (44px, 48px ≤900, radius 12) vs 54px/16px radius 16 on phone and 56px/17px on desktop. The hero h1 (`design-public.css:11`, up to 76px) and body copy match.
- Failure scenario: 1920 homepage side by side with `Landing.html`: section headings are ~20% smaller, step titles look like body text, buttons are shorter — the "strong headings" the guidelines call for are softened.
- Fix: `h2 clamp(2.25rem, 3.6vw, 3.25rem)`, `.relationship-steps h3 { font-size: clamp(1.3125rem, 1.4vw, 1.5rem) }`, Newsreader band `clamp(2.375rem, 3.9vw, 3.75rem)`, `.public-page .hero-actions .button { min-height: 54px; border-radius: 16px; font-size: 1.0625rem }`.
- Effort: S; Risk: low (check 320px wrapping); Needs owner decision: yes (the smaller scale may be a roadmap choice)
- Tests: update `e2e/homepage-conversion.spec.ts` screenshots; the 320/1920 viewport matrix in `visual-fitment.spec.ts` "public single-user product story".

### F17. Horizontal scrollers: the contact Journey track is not keyboard reachable, and none show an affordance
- Severity: P2
- Status: VERIFIED (keyboard); SUSPECTED (overflow at 390px, affordance)
- Evidence: `src/styles/contacts-workspace.css:104` `.contact-journey-track { overflow-x: auto }` with `li { min-width: 90px }` (`:108`) plus the 66px Today marker (`:118`): four stages need ≈426px, more than the ~350px available at 390px, so it scrolls; `src/components/ContactProfile.tsx:124` gives it an `aria-label` but no `tabIndex`, so keyboard users cannot scroll it (the Journey canvas does this correctly at `WorkflowJourney.tsx:220`). The other scrollers (`.review-beat-rhythm`, `.contact-beat-track`, `.mix-beat-timeline`, `.calendar-date-strip`, `.countStrip`) contain links/buttons and are reachable, but none has a fade or scroll hint; the 09-23 "no scroll affordance" item stands.
- Failure scenario: phone profile of a person with four recorded stages: the "Possible next stages" are off-screen to the right with no cue; a keyboard user on a small window cannot reach them at all.
- Fix: `tabIndex={0} role="region"` on the track; a shared `.scroll-x` utility with `mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent)` when scrollable, applied to the six scrollers.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: `e2e/live-search-contact-layout.spec.ts` at 390px: the track is focusable and `scrollWidth > clientWidth`.

### F18. Merge-field chips never wrap
- Severity: P2
- Status: SUSPECTED (needs a 320px screenshot)
- Evidence: `src/styles/phone-icons.css:46` `.merge-field-chip { white-space: nowrap }`; chips render inside Beat previews (`MixBeatPreview.tsx:13` via `MergeFieldText.tsx:8`) within `.mix-beat-wording` (padding 16px 20px, `overflow-wrap: anywhere` only on the container). At 320px the wording box is ≈248px wide; a chip like "Business Phone Number" (~150px at 13px bold) after a few words can overflow the bubble.
- Failure scenario: 320px Mix preview, a template starting "Thanks again {{Business Phone Number}}" — the chip pokes out of the bubble.
- Fix: `white-space: normal; overflow-wrap: anywhere; box-decoration-break: clone`.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: `e2e/visual-fitment.spec.ts` overflow check on `/mixes` at 320px with a long merge field.

### F19. Fixed heights that will clip at 200% text
- Severity: P2
- Status: SUSPECTED (needs a 200% text-size run)
- Evidence: `src/components/WorkflowJourney.module.css:51` `.nodeBeats li { height: 62px }` (fixed) holds three lines of 12/11/11px text; `:3` `.nodeRules button { height: 28px }`; Today avatars `width/height: 32px; font-size: .6875rem` (`design-workspaces.css:309`) and `.mix-beat-number` 28px/.75rem (`design-details.css:88`) are fixed boxes whose initials/numbers double. Everything else audited uses `min-height`, `dvh` or `auto` rows (`design-details.css:298` keeps the bottom nav rows `minmax(66px, auto)`).
- Failure scenario: OS text at 200% on a phone: Beat rows inside expanded Journey nodes overlap each other; initials overflow the 32px circles.
- Fix: `min-height` instead of `height`; avatars `min-width/min-height` with `overflow: hidden`.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: extend `e2e/sheet-interactions.spec.ts` "enlarged text keeps editor actions … reachable" to the Journey map and Today queue.

### F20. No print stylesheet
- Severity: P2
- Status: SUSPECTED (needs print preview)
- Evidence: `grep -rn "@media print" src` returns nothing. The fixed bottom navigation (`base.css:280`), the sticky rail (`design-workspaces.css:3`), the PWA prompt and confirmation tray will print over content.
- Failure scenario: a contractor prints a contact profile or today's list before a site visit: navigation bars overprint the first and last rows.
- Fix: one block: `@media print { .mobile-nav, .sidebar, .mobile-app-header, .pwa-install-prompt, .follow-up-confirmations, .public-skip-link, dialog { display: none !important } .app-shell { display: block } .page { max-width: none } }`.
- Effort: S; Risk: low; Needs owner decision: yes (is printing a supported workflow?)
- Tests: Playwright `page.emulateMedia({ media: "print" })` screenshot of `/contacts/[id]`.

### F21. Required fields have no visible marker and the convention is unstated
- Severity: P2
- Status: VERIFIED (still open from 09-23)
- Evidence: 212 `required` attributes vs. 23 "(optional)" label suffixes across `src/components` and `src/app`; no `aria-required`, no asterisk, no legend. The implied convention (unmarked = required) is consistent but never told to the user (WCAG 3.3.2 advisory).
- Failure scenario: a first-time user on "Add a contact" (390px) submits with an empty name and only then learns which fields were required.
- Fix: a shared `<p class="form-required-note">Everything is required unless marked optional.</p>` under the page header of `contacts/new`, the contact edit form, Calendar editor, Mix editor and onboarding; keep the "(optional)" suffixes.
- Effort: S; Risk: low; Needs owner decision: no
- Tests: none needed beyond a copy check in `e2e/core-flows.spec.ts`.

## Contrast table

Ratios computed from `src/styles/design-tokens.css` (identical to the export `tokens.css` for the shared tokens). "Use" names where the pair actually appears. T = text (4.5:1), UI = non-text (3:1).

| Pair (use) | Light | Ratio | Dark | Ratio | Result |
|---|---|---|---|---|---|
| `--text` on `--page` (body) | #1A1830/#FFFFFF | 17.25 | #EEEDF6/#12101F | 16.15 | pass |
| `--text` on `--surface` (rail, rows, chips) | /#F5F5F8 | 15.85 | /#1B1930 | 14.72 | pass |
| `--text` on `--raised` (sheets, buttons) | /#FFFFFF | 17.25 | /#25223D | 13.15 | pass |
| `--text` on `--violet-wash` (selected rows, compose bubble) | /#EFEDFE | 14.96 | /#2A2554 | 12.13 | pass |
| `--text-2` on `--page` (meta, nav labels) | #55546B | 7.33 | #B9B7CC | 9.56 | pass |
| `--text-2` on `--surface` (avatars, pills) | | 6.73 | | 8.72 | pass |
| `--text-2` on `--raised` (sheet copy) | | 7.33 | | 7.79 | pass |
| `--text-2` on `--violet-wash` (selected row meta) | | 6.35 | | 7.18 | pass |
| `--text-3` on `--page` (hints, headings, placeholders) | #6B6A82 | 5.24 | #9795AD | 6.45 | pass |
| `--text-3` on `--surface` (input placeholder, chip hints) | | 4.81 | | 5.88 | pass |
| `--text-3` on `--raised` | | 5.24 | | 5.25 | pass |
| `--text-3` on `--violet-wash` (hints in selected rows) | | 4.54 | | 4.84 | pass (light is marginal) |
| `--text-3` on `--selected` | | 5.24 | /#35315A | 4.15 | dark fails T — but `--selected` is unused in `src` (grep), so no rendered pair |
| `--violet-text` on `--page` (links, Review caption, active tab) | #5D4CF2 | 5.55 | #A79DFF | 7.96 | pass |
| `--violet-text` on `--surface` (Recommended chip, tabs) | | 5.10 | | 7.25 | pass |
| `--violet-text` on `--raised` (pressed chip) | | 5.55 | | 6.48 | pass |
| `--violet-text` on `--violet-wash` (merge chips, mix tabs) | | 4.82 | | 5.98 | pass |
| `--violet-ink` on `--violet-wash` (soft buttons, notices, beat numbers) | #4234C9 | 7.10 | #C9C3FF | 8.54 | pass |
| `--on-violet` on `--violet` (primary buttons, Quick Add) | #FFFFFF/#5D4CF2 | 5.55 | same | 5.55 | pass |
| `--late` on `--page` (overdue, danger buttons) | #C8372D | 5.20 | #FF8A7A | 8.19 | pass |
| `--late` on `--surface` | | 4.78 | | 7.46 | pass |
| `--late` on `--status-danger-bg` (error notices) | /#fff0ee | 4.69 | /#3b242b | 6.22 | pass |
| `--status-success-ink` on `--status-success-bg` | #0d7758/#e8f8f1 | 5.04 | #8ce5c6/#19382e | 8.59 | pass |
| `--status-warning-ink` on `--status-warning-bg` (and `--warning` on page for the signed-out draft) | #795100/#fff4dc | 6.43 | #f1c574/#382e1e | 8.23 | pass |
| `--on-violet` on `--late` (marketplace alert badge, F10) | #FFFFFF/#C8372D | 5.20 | /#FF8A7A | **2.29** | dark FAILS T |
| `--toast-text` on `--toast` (export toast; unused in app, F7) | #FFFFFF/#1A1830 | 17.25 | #12101F/#EEEDF6 | 16.15 | pass |
| Waitlist band text #eeedf6 / p #b9b7cc on #1a1830 (F11) | | 14.85 / 8.80 | same | 14.85 / 8.80 | pass |
| `--page` on `--text` (due-filter active chip) | | 17.25 | | 16.15 | pass |
| `--field-border` on `--page` / `--surface` / `--raised` (inputs, checkbox) | #8C8AA3 | 3.34 / 3.07 / 3.34 | #7A7799 | 4.40 / 4.01 / 3.58 | pass UI |
| `--violet-mark` on `--page` / `--surface` / `--raised` (focus ring, active icon, dots) | #5D4CF2 | 5.55 / 5.10 / 5.55 | #7C6EFF | 4.94 / 4.50 / 4.02 | pass UI |
| `--violet` fill on `--page` (buttons, nav bubble) | | 5.55 | | 3.38 | pass UI |
| `--border` on `--page` / `--raised` (decorative borders, grabber) | #CFCEDB | 1.56 | #5A5777 | 2.74 / 2.23 | fails UI — decorative only now (inputs use `--field-border`) |
| `--quiet` on `--page` (unscheduled dots, disabled icon color) | #C5C4D2 | 1.72 | #56537A | 2.60 | fails UI — status dots also carry text labels |
| `--track` / `--line` on `--page` (rhythm lines, separators) | #DDDCE7 / #E7E6EE | 1.36 / 1.24 | #34314D / #2B2842 | 1.51 / 1.33 | decorative, exempt |
| Status borders on their fills (success/warning/danger) | | 2.02 / 2.19 / 1.82 | | 2.51 / 2.83 / 2.31 | decorative (fill + text carry the state) |
| Journey unrelated edge: `--text-3` at .16 over `--page` (F9) | → #e7e7eb | **1.23** | → #272536 | **1.25** | FAILS UI |
| Journey unrelated label at .22 (F9) | → #dedee4 | **1.34** | → #2f2d3e | **1.40** | FAILS UI |
| Journey disabled edge `--text-3` at .65 | → #9f9eae | **2.63** | → #68667b | 3.37 | light fails UI |
| `--accent` on `--page` | #17815e | 4.84 | #17815e | 3.87 | unused token (grep) — no rendered pair |

## Checked and fine

- Tokens: `design-tokens.css` reproduces every export token value in both themes and adds `--field-border` (≥3:1 everywhere) and status colors; legacy names (`--ink`, `--muted`, `--brand`, `--brand-dark`, `--brand-soft`, `--danger`, `--warning`, `--surface-soft`) alias to tokens, so old rules inherit the palette. No hex in any CSS module; the only page-level hex is the waitlist band (F11) and shadows.
- Fonts: Instrument Sans 400/500/600/700 and Newsreader 400 hosted locally (`layout.tsx:15-21`); UI font on body and form controls (`design-system.css:3-4`); Newsreader confined to drafts, snippets, notes, previews, support bodies and Quick Add capture (`design-system.css:39,100`, `ContactTimeline.module.css:8`, `mix-library.css:66`, `MegaMix.module.css:31`); quiet-day names stay in the UI font (`design-details.css:278`).
- Radii: 12 controls, 24 sheets, 20 bubbles via tokens (`design-system.css:12,41`, `popups.css`); cards 16px.
- Popups: 18px/700 titles, 14px `--text-2` copy, 44px round close, `--scrim`, phone bottom sheets with grabber and upward shadow (`popups.css`); confirmations focus Cancel first, Escape/close events stop at the top layer (`useConfirmDialog.tsx:31`), `ReviewDialog` traps Tab and restores focus, `Sheet` restores trigger focus on close and rebuilds nested modals on resize.
- Focus: global 3px `--violet-mark` ring (≥4.0:1 on every surface), inset rings on summaries/canvas, `prefers-contrast` and `forced-colors` handled (`base.css:67-83`, `design-system.css:72`, `conversation.css:87`); `prefers-reduced-motion` honored globally (`base.css:69,329`, `disclosures.css:32`, demo scroll).
- Skip links on the app shell and public pages, targets with `tabIndex={-1}` (`AppShell.tsx:40,85`, `PublicLanding.tsx:17,19`).
- Current page: the desktop rail hides More (`design-workspaces.css:12`), so only Journey/Calendar carry `aria-current` there; the phone nav marks More on Journey/Calendar/Settings/Account/Help exactly as the export's Calendar screen does; account utilities mark nested pages. The "double marking" reported on 09-23 exists only on a `display:none` link and is not exposed.
- Icon-only controls carry names (Today search/filter/more, contact add/tools, mix create/tools/search/filter/favorites, share, Brand terms, voice, timezone) — heuristic grep found no unnamed icon buttons.
- Live regions: `Notice` uses `status`/`alert`; the completion confirmation is `role="status"` (`JumpWorkflow.tsx:138`); Today update notices, live search and WhenPicker announce.
- Label mismatches from 09-23: "Later" is named "Record outcome later" and "Contacts" back is "Back to contacts" (label-in-name satisfied); the archived search is named "Search archived Contacts" (`archived/page.tsx:58`) — the "Find a calendar contact" name belongs to the Calendar page's own contact search (`calendar/page.tsx:85`).
- `--accent` and `--selected` are defined but never used, so the 09-23 items "no dark `--accent`" and "`--text-3` on `--selected` 4.15:1" have no rendered effect (the tokens can be removed or documented).
- Field borders (09-23 item 9) verified: 3.34/3.07 light, 4.40/4.01/3.58 dark.
- Breakpoints match the guideline set: 767/768 (sheets, docked Today, phone header), 900/901 (rail vs. bottom nav, 48px buttons, phone target block), 1099/1100 (Calendar panes), 1199/1200 (Contacts/Mixes/Journey panes), 1279/1280 (compact rail), 1600/1700 (context columns), 760 for the public menu; no stray app breakpoints.
- Ultrawide maxima: `.page` 1440 (`design-workspaces.css:21` wins over `desktop-ux.css:4`), multi-column workspaces 1672 (Today, Journey, Mixes, Calendar), `page--content` 1120, `page--form` 1040, Settings/More 960; Contacts profile bounded to 1000px at ≥2200, Mix editor to 1096; Today queue `clamp(300px, 26vw, 440px)` + 24px gap as specified.
- Viewport units: only the legacy public/auth/onboarding shells use `min-height: 100vh` (`base.css:88,152,242`); every bounded pane uses `dvh`; the "contacts list uses 100vh" item no longer exists (`contacts-workspace.css:137` is `min-height: 100dvh` at ≥1200 only).
- Pages without mockups: Account/Help/Support conversations use `page--content`; Personal preferences, My business, Sending, Notifications and the contact forms use `page--form`; Settings/More use the 960px flat rows with 44px chevron rows; support messages are Newsreader on neutral/violet fills with `--line` separators; auth/onboarding cards use the sheet radius and tokens; Marketplace/Mega-Mixes reuse the Mix directory composition and shared tokens.
- Phone review sheet matches `Review.html` anatomy: grabber, 44px avatar, 18px/700 name, transparent compose textarea inside the `--violet-wash` bubble (18px Newsreader; 22px on desktop as in `DesktopToday.html`), 44px Text/Email/Call segmented control with raised selected state, outcomes row, `--scrim`.
- Contacts rows: 36px circular avatars with 14px initials, 16px names (15px docked), "Stage · next due" line, "Add phone or email" in violet, late in `--late`; 2/3-pane layout from 1200/1700 with 360/440 directories; `aria-current` on the docked row.
- Contact profile phone: back + Edit, 56px avatar, 24px name, stage chip, four 48px circular quick actions with 12px labels, Next card with beat track and Review pill, 48px detail rows, History with 13px dates and Newsreader notes.
- Mixes: three collection tabs in the `--surface` pill container, 65/60px rows with selected `--violet-wash`, Beat rows with 28px number, transparent name field, day/channel pills, Newsreader wording in `--surface` bubbles; Calendar: 36px date circles, agenda rows, 110px labelled editor rows, disclosures, save bar that scrolls on phones (`design-details.css:162`).
- More: 56px rows, 16px/500 labels, 20px icons, 18px chevrons, 10px `--surface` group separators, plain Sign out row; the section labels are hidden as in the export.
- Bottom navigation: five equal columns, rows grow with text, Quick Add bubble uses `--violet` for body and tail; the tinted pill behind the active icon is a documented deviation so selection is not color-only.
- Journey (dynamic graph, per the owner's September 21 direction): people, map and details panes at ≤1199, 360/440px directory from 1200/1700, canvas focusable with a structured-list alternative, 44px connection ports and count-strip buttons.

## Open questions for the owner

1. Today rows (F3): is the 14px name a deliberate density choice for long names on 320px screens, or should the export's 16px/40px row be restored?
2. Docked review (F4): cap the composer at the export's 680px, or keep it fluid across the review column?
3. Quick Add shortcut (F1): a personal preference to turn "N" off, or fire it only when focus is in the navigation/page body?
4. Portrait tablets (F15): remove the top app header at 768–900px as the export shows, or keep it for the profile link?
5. Landing scale (F16): adopt the export's larger section headings and 54–56px hero buttons, or keep the current smaller scale from the roadmap iterations?
6. Journey dimming (F9): accept a 3:1 stroke for unrelated connections instead of 16% opacity?
7. Confirmations (F7): adopt the export's dark toast bubble for "Follow-up completed / Undo"?
8. Waitlist band (F11): confirm the dark-mode composition (surface band, page-colored input) from `DarkLanding.html`.
9. Printing (F20): is printing Today or a contact profile a workflow worth a small print stylesheet?
