# Popup and disclosure consistency — 2026-09-23

Kevin asked whether every popup and every expandable section follows one design concept. A read-only audit of `ab057b3` (then live) found about 120 `<details>` disclosures and about 30 popups. Colors, themes and fonts were consistent. Indicators, target sizes, title scale and confirmation behavior were not. This record lists what changed, the assumptions made where the owner had not decided, and how the change was verified.

## What changed

### One disclosure pattern (`src/styles/disclosures.css`, loaded last)
- Every summary hides the native marker and shows the export's affordance: a 16px chevron at the end of the row, rotating when open. Summaries that already draw an `AppIcon` chevron (contact More, Mix beat previews, Help FAQ) or overflow icon keep it. `AppIcon` now sets `data-icon` so CSS can recognize these.
- A zero-specificity default gives summaries a 44px minimum target and a 14px/600 label in `--text`; hints stay secondary. Page rules that shrank targets or used violet, 12–13px, or 650/760/800 weights were removed. Those weights also rendered as 700, because only 400–700 are hosted.
- Replaced custom indicators: Today's "›" groups, the "+/−" rhythm preview and library refinements, and the Help FAQ "+" that never changed state.
- Fixed small targets:
  - Calendar "Event details and actions": its phone fix lost to a more specific 32px rule.
  - Journey editor and progress sections.
  - Today "Add a note or next follow-up".
  - "Notes to remember".
  - Journey "Show Beats": enlarged with a negative margin so measured node heights do not change.
- The note "•••" menu uses the shared 44px round overflow control (`disclosure-menu`, `AppIcon more`).
- Fixed the `.quick-add-review` class collision: the duplicates disclosure is now `.duplicate-review`, so it no longer inherits the sticky phone Continue-button rule.
- Removed the triple-nested "About this approach" wrapper on the ready-made use page.
- Onboarding reveals its business-details disclosure when the required signature inside it is invalid.
- Onboarding cards use the shared 16px card radius instead of 15px.
- Journey separators use `--line`.
- Keyboard focus rings on summaries are inset, so containers that clip overflow no longer cut them off.

### Staff area
- Phones and portrait layouts (≤760px) restore 44px summaries. The audit log rows are included.
- Desktop keeps the compact density from #81, but the Reports "Definitions and scope" rows rise from 28px to the shared 32px minimum.
- Every staff disclosure now has the chevron. "Record details" in the audit log and the team rows previously had no indicator.
- "More filters" uses one class (`admin-filter-options`) on Access, Support and Templates.
- System Mix "Version history" uses `admin-editor-disclosure`, matching Library.
- Consequential email-recovery disclosures use the bordered `admin-release-confirmation` treatment.
- The staff phone menu closes on Escape and on an outside tap, returning focus to its toggle, like the public Explore menu.

### Popups (`src/styles/popups.css`, loaded last)
- **Titles and copy.** One title scale for sheets, confirmations, review dialogs and Quick Add: 18px/700, as in the export. Supporting copy is 14px `--text-2`.
- **Browser confirm boxes replaced.** Nine `window.confirm` prompts now use the app's confirmation dialog through `useConfirmDialog`: one heading, supporting copy, a 44px close control, and Cancel first with initial focus. They cover:
  - Quick Add discard
  - note removal
  - Do not contact
  - Jump outcome confirmation
  - invitation preparation
  - Library beat removal
  - support reply discard
  - admin draft discard

  Only `FormGuard`'s navigation guard stays native, because leaving the page must be decided synchronously.
- **Review dialogs.** "Start this mix?" and "Save this update?" focus Keep editing instead of the close icon.
- **Today leave dialog.** "Keep your message edits?" gains the 44px close control, and Keep editing is neutral rather than primary.
- **Confirmation actions.** Buttons are equal 44px buttons, and destructive confirms use `danger` (Confirm revocation). Explanatory text or errors passed to `ConfirmDialog` sit above the buttons instead of among them.
- **Phone sheets (≤767px).** Every sheet is a bottom sheet with the export's anatomy:
  - grabber
  - borderless header
  - 20px padding
  - upward shadow

  From 601–767px this also corrects the four rounded corners on bottom-anchored sheets and on full-screen Quick Add.
- **Scrim.** One `--scrim` token is used, with a darker dark-theme value.
- **Profile and settings.** The sheet uses the flat icon rows of the other tools sheets instead of stacked bordered buttons.
- **Fixed panels.** The Jump return tray uses `--line`, the bubble radius and `--shadow`. The install prompt keeps its deliberate 2px brand border, so it stays distinct in dark mode, but it now uses the bubble radius and `--shadow` instead of a hard-coded shadow. Both sit above the bottom navigation wherever it shows (≤900px); previously they covered it from 681/768–900px.
- **Public Explore menu.** It is the same 44px control and dropdown through 760px; previously 601–760px showed a full-width row of inline links. Its dropdown uses the 12px control radius.
- **Filter sheets.** Filter mixes and ready-made filters describe their Apply behavior.
- **Picker headers.** `TimezonePicker` links its description with `aria-describedby`, and `WhenPicker` uses the shared heading wrapper.

## Assumptions (owner decisions not yet made)
- **Staff density:** compact desktop density stays; only touch widths return to 44px rows. Staff corners (6–10px) are unchanged from #81 and remain a question for Kevin.
- **Quick Add header:** follows the shared sheet header (title left, close right), with only the title scale corrected. The export's centered phone title and title-less desktop card were not adopted.
- **Cards vs flat rows:** the existing boxed disclosures stay boxed, and only their radius was aligned. These are the Today briefing, Calendar connections, settings records and onboarding. Flattening them would change page structure, which the September 22 continuity rule reserves for workflow gaps.
- **Kept as is:**
  - Filter sheets still differ functionally: Today and Contacts apply immediately; Mixes and ready-made filters submit. Changing that is a product decision.
  - Disclosure labels ("More", "More details", "Options"…) are unchanged.
  - The timezone list keeps its bounded inner scroll so search stays in view.
  - Unused Journey preview components (`JourneyStageView`, `JourneyMap`, `JourneyPersonDot`) and legacy CSS for unused classes were left untouched. They are unreachable, and the last-loaded shared rules now take precedence.

## Verification
- `npx tsc --noEmit` passes.
- Production build passes.
- **Before/after comparison:** the live code (`ab057b3`) and this branch were each built and served locally against `jitm_design_local` with the demo seed. Screenshots and computed styles were compared for Today, Contacts, contact profile/edit/new, Mixes, Journey, Calendar, ready-made library/use, settings, account, Help and More, in phone light/dark and desktop light, plus Quick Add, filter and Profile popups at 390/700/1440px.
  - After the change, every visible summary has the chevron, is at least 44px on phones, and uses the shared label style.
  - Staff routes (13) and public routes (4) were measured at 390 and 1440px, with a temporary MFA-verified staff session removed afterwards.
- **New test:** `e2e/design-consistency.spec.ts` checks:
  - the indicator, marker, spacing and height of every disclosure on six routes;
  - Quick Add discard (Cancel focused; Escape closes only the confirmation; the draft survives);
  - Do not contact (Cancel leaves it off);
  - Profile rows.
- **Updated tests:** existing e2e specs were updated for the app confirmation dialog and the 18px popup title.
- **Existing failures:** related suites were compared against the same live build. Failures that also occur on `ab057b3` are pre-existing and are listed in the release record. They include demo-data-dependent `visual-fitment` checks and the flaky enlarged-text Calendar reachability check.
- **Not established:** behavior on physical devices and iOS Safari.

## Production release (verified 2026-09-23)

| Item | Value |
|---|---|
| Commit | `fad339d` on `fix/design-consistency-20260923` (from `be4698a`) |
| Web deploy | `dep-daq9ioh7lnhs73c74t8g` (live) |
| Worker deploy | `dep-daq9hvojo6nc73dks6t0` (live; queue probe passed, probe job removed) |
| Build ID | `mPXiIFkBnsRBCMWkeyZMV` |
| Migration | none required |

- **Preflight (read-only):** passed. Production was on `be4698a`, the database was ready, the runtime boundary held, and none of the 68 migrations were pending.
- **Postflight:** passed.
  - 16 public, health and redirect checks returned the expected responses.
  - All 56 changed files and 20 served assets hash-match on the live instance.
- **Live signed-in smoke:** passed all 11 checks with a synthetic account that was then deleted. The checks include:
  - the disclosure chevron and 44px target on a live form;
  - Quick Add discard asking in the app dialog, with Cancel focused and the draft kept on Escape;
  - Profile sheet flat rows and the 18px title;
  - the phone bottom-sheet grabber and square bottom corners;
  - light and dark axe and reflow on Today.
- **Final check:** passed.
  - Record counts are unchanged from preflight.
  - No synthetic users, workspaces or probe jobs remain.
  - No jobs have failed since the release.
  - Health endpoints return 200.

Evidence: `.artifacts/design-live-20260923/` in the release checkout. Not established: behavior on physical devices and iOS Safari.
