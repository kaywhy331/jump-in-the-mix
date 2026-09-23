# UI/UX workflow and icon implementation — September 22, 2026

This implements the [workflow and icon audit](UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md) using the owner's decisions of the same day. It is local working-tree work: nothing is committed, deployed or published.

## Owner decisions applied

- **Today tab:** a house. **Mixes tab:** keeps the shuffle.
- **Onboarding:** stays mega-mix first. After installing, the owner sees "Your pipeline is ready" and **Add your first customer** as the next step.
- **Vocabulary:** Mix, Beat, Mega-mix, Journey and Today stay as the brand names. A "What these words mean" sheet (ⓘ) on Mixes and Journey explains them in plain words.
- **Contacts:** a person-plus icon in the header, beside the tools menu.

The desktop three-pane structure is unchanged. The changes are icons, labels, one shared phone back control, and small in-place additions.

## What changed

**Icon system**
- `AppIcon` now uses Lucide geometry (ISC), inlined, so there is no new dependency or lockfile change. Stroke is 1.75, matching the export.
- New icons: home, chevron-left/right, user-plus, undo, copy, share/export, mic, map-pin, play, pause, skip, snooze (alarm clock), eye, grip, zoom in/out/fit, business, smartphone/monitor, info. Existing names still work.
- The phone active tab now shows a tinted pill behind the icon and a heavier label, so selection no longer relies on colour alone.
- `›` and `→` text glyphs in More, Settings, Today, Calendar and quiet-day check-ins are replaced with chevron icons.
- A zero-specificity default gives every icon inside a button an explicit 18px size.

**Navigation**
- A shared `BackLink` (chevron + parent name, 44px target) is on every sub-page: Settings pages, Contacts sub-pages, Add contact, Personal preferences.
- On phones, Settings, My Account and Help get a Back to More link. It is hidden on desktop, where the left rail already covers this.

**Today**
- Each card's channel icon now carries a "Review" caption, so it reads as "open", not as Call or Text.
- The text "More" is now a "…" icon.
- Search has its own magnifier button beside Filter, which now uses the filter icon instead of the gear.
- Snooze gets an alarm-clock icon, and the review sheet now includes "pick a day" as the More sheet already did.
- Skip is labelled "Skip beat" with a skip icon everywhere. Undo has an undo icon.
- "Add phone/email" inside a review now returns to the same follow-up after saving. This uses a `returnTo` limited to `/jumps` and validated by `customerReturnPath`.

**Contacts**
- New: the person-plus header action, icons on every tools row, and "Add from phone contacts" in place of the second "Quick Add".
- Export uses a share icon.
- Archiving shows an **Undo** in the success notice. Undo restores in place through the existing restore action.
- Deleting a saved view now asks for confirmation.
- The profile explains in visible text why Text, Email or Call are off. Before, the reason was only in hover titles.
- Addresses get a map pin and open in Maps. The company row uses a briefcase icon. Voice dictation uses a mic, and pause while listening.

**Mixes, mega-mixes and Journey**
- **Mix header:** a **Start** button (play icon) opens the existing start-for-someone flow directly. Preview uses an eye icon; Pause and Start use pause and play icons.
- **Previews:** `{{First Name}}`-style placeholders show as readable chips. Send times use the 12-hour clock. Channels read "Text", "Phone call" and so on, not raw values.
- **Mega-mix install screen:**
  - It lists the entry Mix and adds "Add your first customer". This opens Add contact, then returns to Journey with that Mix ready to start.
  - Onboarding copy now says the whole pipeline arrives written and connected, ready to tweak.
- **Journey:**
  - Waits are entered as an amount plus days, hours or minutes. They are still stored in minutes.
  - The "Enable this connection" switch has moved to the top, with a plain on/off explanation. The default stays off, so saving a connection never silently moves real customers.
  - Zoom and fit have icons.
  - "Create a Mix" goes to the custom editor. The empty state offers "Add a mega-mix" first.
- **Mix editor:** Cancel returns to the Mix you were editing.

**Settings, shell and Calendar**
- Retiring a journey stage and removing a transition rule now ask for confirmation.
- My business uses a briefcase icon. Account sessions show a phone or computer icon. The install prompt uses a smartphone icon.
- On desktop, the Profile button has an icon, and Sign out is no longer styled as destructive.
- In Calendar, New event, Download and the week navigation have icons.

## Verification

- **Typecheck:** clean.
- **Unit tests** (isolated migrated database): 1,413 passed, 1 failed. The failure is `shared-mix-boundary`, which expects `SharedMixPreview` in `templates/page.tsx`. That file is not touched by this work and already fails in the working tree.
- **Browser tests:** a production build with a disposable, migrated database and outbound providers off. Ran Today navigation, core flows, mega-mixes, onboarding preferences, Journey connections, Mix library, sheet interactions and live search, on desktop and phone: 103 passed on the first run.
  - One failure was caused by this work: two open "Follow up with …" sheets both contained "Skip beat". The test is now scoped to the options sheet, and the retest passed.
  - Eight failures reproduce identically on a **baseline build without these changes**, so they already existed:
    - `journey-connections` path deletion ×5 (the seeded save returns not-ok)
    - `mega-mixes` expecting "Mix started."
    - `sheet-interactions` enlarged text, where Calendar's Save event is unreachable at 200% text
    - `core-flows` onboarding, where "Business name" matches two fields
  - The remaining failures come from the test environment:
    - The demo seed is skipped when `DEMO_MODE=false`. After seeding it, the device Quick Add and profile header-icon tests passed.
    - The admin MFA test needs a seeded administrator.
    - Three live-search expectations fail on markup this work did not change: URL parameters, `.mix-filter-bar` live flag, and a "Notes" heading that also doesn't exist in the baseline.
- **Screenshots** at 390px and 1440px (light) were inspected: Today, the review sheet, search, the options sheet, Contacts, tools, the profile, Mixes, the glossary, the pipeline-ready screen, Journey, Calendar, Settings, and a sub-page back link. Before/after images and the exact patch are in [the artifacts](../.artifacts/ui-icons-workflow-20260922/).
- **Not run:** dark-theme screenshot review of every page (tokens are semantic), physical devices, the full browser suite, and contractor usability testing.

## Not changed (needs a separate decision)

- Merging More, Settings, Account and the Profile sheet into one list; this is a structural change.
- Moving workspace-wide settings out of "Personal preferences".
- Call/text shortcuts on contact rows, and drag-to-reorder for Beats.
- Default-on Journey connections.
