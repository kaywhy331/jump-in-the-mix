# Design export → implementation gap analysis

This is the audit of the implementation **before correction**. See the [subsequent implementation and verification report](DESIGN_CORRECTION_2026-09-19.md) for the changes and remaining product decisions. Keep this audit as the baseline rather than treating its present-tense findings as the current status.

**Finding: the redesign is partially adopted. The palette and fonts are present, but several core pages still use their previous information architecture and workflows. The current implementation does not faithfully reproduce the supplied screens.**

The earlier [adoption report](DESIGN_ADOPTION_2026-09-19.md) overstates screen-level completion. Its build, workflow, accessibility and responsive checks are useful engineering evidence, but do not establish visual fidelity. The later ultrawide correction fixed a real sizing defect; it did not resolve the differences below.

## Scope and evidence

- Authority: the original [design export](jump-in-the-mix-designs/index.html), its [README](jump-in-the-mix-designs/README.txt), [tokens](jump-in-the-mix-designs/tokens.css), and BubbleKit/ThemeTokens screens. The derivative `DESIGN_GUIDELINES.md` is also audited for departures from that authority.
- Compared all **46 page/state mockups**: 23 layouts in light and dark, at their supplied widths of 390, 834, 1194 and 1920px. Inspected the three additional foundation screens, for **49 reference files** total.
- Captured current equivalents from the local production build with fictional records, plus selected Journey/Calendar states and representative secondary pages. Reference screenshots crop only the export's surrounding canvas. Google Fonts loaded for the references; application fonts are locally hosted.
- Rechecked the recorded production release manifest: **655/655 runtime source files match** release `6482a700c42ac0bb2c4d163088580a90aecf2779`. These screenshots are local evidence of that implementation, not a new authenticated production test.
- Names, record counts, dates, text lengths and the real logo are deliberately different. The export explicitly permits replacing its placeholder logo. No pixel similarity percentage is reported because those differences would distort it. Phone mockups also reserve top safe-area space; that alone is not counted as a defect.
- Completion screenshots use a synthetic local follow-up, immediately restored with Undo. No messages were sent. No application code or deployment was changed by this audit.

Open the **[interactive side-by-side viewer](../../.artifacts/design-gap-analysis-20260919/index.html)**. It supports all 23 layouts, both themes, original-pixel viewing and supplementary selected states. Static overviews: [desktop](../../.artifacts/design-gap-analysis-20260919/compare-desktop.jpg), [tablet](../../.artifacts/design-gap-analysis-20260919/compare-tablet.jpg), [phone](../../.artifacts/design-gap-analysis-20260919/compare-mobile.jpg), [homepage](../../.artifacts/design-gap-analysis-20260919/compare-landing.jpg).

## Prioritized gaps

P1 means a major missing layout or interaction, not a production outage. P2 means a component, density or visual hierarchy mismatch. Each applies to both themes unless specified.

| ID | Priority / area | Supplied design | Current implementation and consequence |
| --- | --- | --- | --- |
| G01 | **P1 — Desktop Contacts** | A 440px list, selected-person workspace with next Beat/Journey/history, and 340px details sidebar, alongside the navigation rail. | `/contacts` is a 1440px-wide list at 1920px. Selecting a person navigates to a separate profile; the selected-person workspace and details sidebar are absent. This is the largest structural mismatch. |
| G02 | **P1 — Tablet Today** | At **834px**, queue and review are visible together. At **1194px**, an **80px** compact navigation rail preserves review space. | Review docks only at **1100px**. Portrait tablet gets a full-width queue and modal review; landscape tablet gets the **224px** desktop rail. Navigation alone consumes 144px more than the landscape reference. |
| G03 | **P1 — Today workspace** | Separate Overdue and Today sections; collapsed Later this week/Done; compact avatar rows; person/stage header; dated Beat timeline; reach details, last note and history. | Uses Needs attention/Up next/Completed plus a separate overview disclosure. Rows repeat Review/More and channel/manual-send labels, lack avatars, and are substantially taller. Review has a generic instructional heading, no dated Beat timeline, and a reduced context panel without the reference history. |
| G04 | **P1 — Review and completion** | Text/Email/Call tabs below the message; visible Copy, Mark sent, Snooze and Skip beat; completion becomes a floating bottom toast with next-Beat information and Undo. | Channel choice, when available, is inside “Change contact method.” Copy is inside “Copy or reset”; completion/snooze/skip live in other controls. The phone sheet's large header and instructions displace actions. Completion is an inline “Follow-up completed” placeholder, without next-Beat information. Existing outcome/Undo behavior works but has not adopted the designed presentation. |
| G05 | **P1 — Quick Add** | Capture remains visible with recognized entities; editable “Saving as” items; matched existing person or missing-detail question; **Save all 3 / Save both**. Desktop example creates an event plus follow-up. | Text → Continue → “Check the details” → “Add person & follow-up” → contact form. No matching-person selection, multi-item save, calendar-event interpretation, missing-detail bubble, or displayed keyboard shortcut workflow. This requires product/workflow implementation as well as visual work. |
| G06 | **P1 — Desktop Mixes** | Library, selected Mix with horizontal day timeline and directly editable Beats, and a sidebar showing people/current Beats and Journey usage. | Library plus read-only preview. Editing opens a separate large form. A sequence summary exists, but is not the designed day timeline/editor. Participant roster and Journey-use sidebar are absent. The screenshot having fewer Mixes is a fixture difference, not a defect. |
| G07 | **P1 — Journey stage detail** | **Seven** buckets: Late, Today, Tomorrow, This week, Next week, Later, Nothing scheduled. Person dots open an anchored preview with Review/Move/Touchpoint/Open; unscheduled people have a selection callout. | **Five** buckets: Late, Today, Next six days, Later, Nothing scheduled. Dots scroll to a roster row. No anchored person preview, “Select them” group action, or roster selection mode. Current dots represent only the current paginated roster; that limitation needs a deliberate treatment in the design. |
| G08 | **P1 — Journey overview/tablet/phone** | Selected touchpoint or stage anchors the roster. Tablet places the selected roster directly beneath the map. Phone shows a short stage roster and Touchpoints together. | Initial state is Everyone in the journey. Tablet inserts a separate Touchpoints section before the roster, pushing people below the first viewport. On phone, substantial headers/search/filter controls and a roster of up to 50 people push Touchpoints down. Stage circles, proportional rings, connectors and recorded moves exist; differing counts/node populations alone are not defects. |
| G09 | **P1 — Calendar** | Compact dated agenda, selected-event editor, and contact context on desktop; agenda dominates phone. | A generic agenda/filter card and persistent scheduling/edit form dominate desktop. No contact context sidebar. On phone, date/range/search/week controls consume most of the first viewport before the agenda. Selecting an existing event still uses the same form layout. Event editing, duration choices and interleaved follow-ups already exist; the gap is their composition and prioritization. |
| G10 | **P1 — Homepage responsive composition** | Tablet has a 66px hero title, stacked voice section and stacked waitlist section. Phone profession directory is one full-width column. | Tablet hero is 44px; voice and waitlist remain two columns. Phone profession directory remains two columns. Desktop headings are lighter/smaller in several sections; demo layout and placement of profession links differ. The section sequence and main copy are substantially present. |
| G11 | **P2 — Contacts phone/list density** | Compact circular avatars; name, stage and next due date; visible total and Last name sort. Reference fits eight person rows. | Phone rows include NEXT FOLLOW-UP, phone/email, notes and repeated More buttons, showing roughly four rows at the same viewport. Avatars are rounded squares. Stage is absent from the list DTO. Sorting offers display name/recently updated/recently added, not last name. |
| G12 | **P2 — Contact profile** | Avatar/stage header, Text/Email/Call/Note, next Beat plus mini timeline, visible contact details, then history. | Generic title/Edit/Back; no header avatar/stage or Note quick action. Next follow-up links to unfiltered Today. Notes and Relationship precede Timeline; phone/email details are inside a closed More disclosure. Beat timeline is absent. |
| G13 | **P2 — Mobile Mixes and More** | Mixes has My mixes/Ready-made tabs, mini Beat rhythms and New mix. More has leading icons and grouped separators. | Mobile Mixes is compact, but the library tabs are hidden with its desktop navigation, mini rhythms are missing, and Find a follow-up plan/More options/search/filter replace the reference hierarchy. More largely preserves destination order, but lacks leading icons and grouping; added Appearance pushes Sign out below the reference position. |
| G14 | **P2 — Shared frame and bubble components** | Edge-to-edge desktop workspace divisions; deliberate user/app/anchored/confirmation bubble variants; one continuous draft surface. | Global centered 1440px page cap adds a large gap beside the rail at 1920px. Generic speech bubbles have the same right tail. Anchored person previews and bottom confirmation bubbles are absent. On phone Review, a white/raised textarea is nested inside the violet draft bubble, instead of one continuous fill. |
| G15 | **P2 — Secondary-page design coverage** | Unmocked pages should inherit the same component and structural language. | There are **76 page templates without direct supplied mockups**. They inherit tokens and width classes, but many retain separate legacy form/card structures. Applying tokens and passing overflow checks does not establish that those pages follow a coherent extension of the design. |

### Evidence and affected source

| Gaps | Original references | Implementation locations |
| --- | --- | --- |
| G01, G11, G12 | [DesktopContacts](jump-in-the-mix-designs/screens/DesktopContacts.html), [Contacts](jump-in-the-mix-designs/screens/Contacts.html), [Contact](jump-in-the-mix-designs/screens/Contact.html) | [Contacts page](../../src/app/(app)/contacts/page.tsx), [list workspace](../../src/components/ContactsBulkWorkspace.tsx), [profile](../../src/app/(app)/contacts/[contactId]/page.tsx), [mobile styles](../../src/styles/mobile-ux.css) |
| G02–G04 | [TabletToday](jump-in-the-mix-designs/screens/TabletToday.html), [TabletTodayWide](jump-in-the-mix-designs/screens/TabletTodayWide.html), [DesktopToday](jump-in-the-mix-designs/screens/DesktopToday.html), [Review](jump-in-the-mix-designs/screens/Review.html), [TodaySent](jump-in-the-mix-designs/screens/TodaySent.html) | [Today page](../../src/app/(app)/jumps/page.tsx), [sheet breakpoint](../../src/lib/sheet-layout.ts), [channel choice](../../src/components/FollowUpChannelChoice.tsx), [outcome/Undo](../../src/components/JumpWorkflow.tsx), [workspace CSS](../../src/styles/design-workspaces.css) |
| G05 | [QuickAdd](jump-in-the-mix-designs/screens/QuickAdd.html), [DesktopQuickAdd](jump-in-the-mix-designs/screens/DesktopQuickAdd.html) | [QuickAdd component](../../src/components/QuickAdd.tsx), [interpretation model/parser](../../src/lib/quick-add-capture.ts) |
| G06, G13 | [DesktopMixes](jump-in-the-mix-designs/screens/DesktopMixes.html), [Mixes](jump-in-the-mix-designs/screens/Mixes.html), [More](jump-in-the-mix-designs/screens/More.html) | [Mixes page](../../src/app/(app)/mixes/page.tsx), [Mix editor](../../src/components/MixEditor.tsx), [More page](../../src/app/(app)/more/page.tsx) |
| G07, G08 | [DesktopJourney](jump-in-the-mix-designs/screens/DesktopJourney.html), [DesktopJourneyStage](jump-in-the-mix-designs/screens/DesktopJourneyStage.html), [TabletJourney](jump-in-the-mix-designs/screens/TabletJourney.html), [Journey](jump-in-the-mix-designs/screens/Journey.html) | [Journey page](../../src/app/(app)/journey/page.tsx), [stage view](../../src/components/JourneyStageView.tsx), [map](../../src/components/JourneyMap.tsx), [timing model](../../src/lib/journey-view.ts) |
| G09 | [DesktopCalendar](jump-in-the-mix-designs/screens/DesktopCalendar.html), [Calendar](jump-in-the-mix-designs/screens/Calendar.html) | [Calendar page](../../src/app/(app)/calendar/page.tsx), [event form](../../src/components/CalendarEntryForm.tsx) |
| G10 | [Landing](jump-in-the-mix-designs/screens/Landing.html), [LandingTablet](jump-in-the-mix-designs/screens/LandingTablet.html), [LandingPhone](jump-in-the-mix-designs/screens/LandingPhone.html) | [Homepage](../../src/app/page.tsx), [public CSS](../../src/styles/design-public.css), [demo](../../src/components/ProductDemo.tsx), [profession directory](../../src/components/ProfessionMarks.tsx) |
| G14, G15 | [BubbleKit](jump-in-the-mix-designs/screens/BubbleKit.html), [DarkBubbleKit](jump-in-the-mix-designs/screens/DarkBubbleKit.html), [ThemeTokens](jump-in-the-mix-designs/screens/ThemeTokens.html) | [shared CSS](../../src/styles/design-system.css), [workspace CSS](../../src/styles/design-workspaces.css), [style imports](../../src/styles/index.css), [derived guidelines](DESIGN_GUIDELINES.md) |

## Measured differences

These values come from the rendered browser or explicit artboard dimensions, rather than impressions from scaled screenshots. Row measurements depend on fixture content and are illustrative, not universal.

| Measurement | Reference | Current |
| --- | --- | --- |
| Desktop navigation width, 1920px | 248px | 224px |
| Landscape tablet navigation width, 1194px | 80px | 224px |
| Today queue, 1920px | 440px section | 374px row/queue |
| Desktop Today content starts | Immediately after rail at x=248 | Bounded page begins at x=352, leaving 128px after the 224px rail |
| Portrait tablet review, 834px | Visible beside queue | Absent until modal opened |
| Tablet hero type | 66px / weight 700 | 44px / weight 600 |
| Tablet voice heading | 54px | 32px |
| Desktop “Put client follow-up into a rhythm” | 52px / weight 700 | 42px / weight 600 |
| Phone profession directory | One column | Two 159px columns |
| Phone draft background | Continuous violet wash | Violet outer bubble + white inner field; dark mode uses a raised inner field |
| Journey stage timing columns | Seven | Five |

The supplied light token block contains 25 declarations: all **23 color/radius values match**; the two font declarations add Next's local-font aliases. All **18 explicit dark overrides match**. That confirms palette adoption, not correct application to every component. Both requested font families are loaded. Heading sizes/weights, specificity and layout remain separate issues.

Measurements and raw comparisons: [captures](../../.artifacts/design-gap-analysis-20260919/captures.json), [computed styles/source parity](../../.artifacts/design-gap-analysis-20260919/inspection.json), [token diff](../../.artifacts/design-gap-analysis-20260919/token-diff.json).

## Screen-by-screen coverage

Every entry below was captured in both light and dark. A “selected state” is additional evidence, not a substitute for documenting the initial-state difference.

| Supplied screen pair | Current equivalent | Gaps |
| --- | --- | --- |
| DesktopToday | `/jumps`, initial review open | G03, G04, G14 |
| DesktopContacts | `/contacts`; profile source also inspected | G01, G11, G12 |
| DesktopMixes | `/mixes`; separate editor also captured | G06 |
| DesktopJourney | `/journey`; selected Mix also captured | G08 |
| DesktopJourneyStage | `/journey?stage=…` | G07 |
| DesktopCalendar | `/calendar`; selected event also captured | G09 |
| DesktopQuickAdd | Quick Add before and after Continue | G05 |
| Main | `/jumps`, phone queue | G03 |
| Review | Phone follow-up sheet open | G04, G14 |
| TodaySent | Local completion/Undo state | G04 |
| Contacts | `/contacts`, phone | G11 |
| Contact | `/contacts/[contactId]`, phone | G12 |
| Mixes | `/mixes`, phone | G13 |
| Journey | `/journey`, phone; selected stage also captured | G08 |
| Calendar | `/calendar`, phone | G09 |
| More | `/more`, phone | G13 |
| QuickAdd | Phone capture before and after Continue | G05 |
| TabletToday | `/jumps`, 834px | G02, G03 |
| TabletJourney | `/journey`, 834px | G08 |
| TabletTodayWide | `/jumps`, 1194px | G02, G03, G04 |
| Landing | `/`, 1920px, full page | G10 |
| LandingTablet | `/`, 834px, full page | G10 |
| LandingPhone | `/`, 390px, full page | G10 |

The repository contains **84 page templates**; these supplied screens map to eight route templates, including their responsive and interaction states. The remaining **23 customer, 24 public and 29 staff templates** have no exact mockup. See the complete [route coverage inventory](../../.artifacts/design-gap-analysis-20260919/route-coverage.csv).

This pass spot-checked Settings, Personal preferences, new-contact form, Help and the separate Mix editor in both themes. It does **not** claim a new visual sign-off of every unmocked template. The previous all-route audit remains evidence of responsiveness/workflow checks only. These pages need explicit component and layout acceptance criteria derived from the original designs.

## Design/function decisions to resolve

These are separate from clear visual mismatches, which need no new design interpretation.

1. **Quick Add saves and matching.** The design introduces multi-item creation and existing-person matching that the current capture model does not represent. Define duplicate resolution, event vs follow-up interpretation, time parsing, correction of proposed items and whether Save all is atomic. The current intermediate contact form is not equivalent to that design.
2. **Journey timing.** Adopt the seven displayed groups, but define non-overlapping calendar boundaries for Tomorrow/This week/Next week and the user's week-start convention. Current code uses today plus the next six days. Define how the dot canvas represents contacts beyond the current 50-person page and what “Select them” acts on.
3. **“After 60 quiet days.”** There is no inactivity trigger implementing this wording. Decide which interactions reset the clock and whether it starts a recurring Mix. Current touchpoints are existing independent Mixes; stage-independent membership is already implemented.
4. **Channel and outcome semantics.** The design shows persistent channel tabs and Mark sent. Current alternatives depend on available contact methods and authored message variants, and the app also supports calls/voicemail/WhatsApp. Decide disabled/fallback presentation and outcome labels. Opening another app must continue to be distinct from recording that a message was sent.
5. **One inconsistency inside the supplied designs.** BubbleKit says navigation never gets a tail, while the mobile/compact-rail Quick Add navigation control has one. Treating that branded Quick Add control as an explicit exception is a reasonable proposed resolution; document it rather than applying tails indiscriminately.
6. **Unsupplied widths and screens.** The export stops at 1920px and does not specify the 76 other page templates. Preserve readable widths and the repaired minimum queue sizing on ultrawide monitors, while first matching the supplied 1920px composition. The current 1440/1120/1040/960 caps and 1100px review breakpoint are implementation choices, not requirements from the export. Theme synchronization across devices is likewise not specified; current browser-local appearance is an implementation assumption.

## Why the gaps persisted, and correction order

The implementation added design tokens and override styles on top of existing page markup. That changes the theme without creating absent workspaces, inline editors, context panels or capture workflows. Multiple legacy style sheets remain in the cascade; for example, the mobile contact avatar rule is more specific than the new generic circular-avatar rule. The global heading-weight rule also reduces the reference's 700-weight landing headings to 600.

The derived guidelines then described some implementation choices as the standard: smaller-screen review sheets, stacked Calendar forms, existing Mix management sheets and generic page-width caps. Checking against that document could therefore approve a page that still differs from the original export.

Recommended correction sequence:

1. Reconcile the shared desktop/tablet frame with the supplied viewports; retain the ultrawide queue fix. Build the missing Contacts workspace and Today/review hierarchy.
2. Adopt Calendar and Mixes workspace structures, including selected-record context and mobile agenda/library hierarchy.
3. Complete Journey's selected-state layouts, seven timing groups and person popovers, after resolving date/selection semantics. Implement Quick Add's richer workflow as its own functional change.
4. Correct homepage breakpoints/type, mobile list density, contact profile hierarchy, bubble variants and More navigation details.
5. Apply those established components to unmocked templates and revise the derived guidelines to distinguish reference requirements from explicit implementation assumptions.
6. Use the original reference/current screenshot pairs as acceptance evidence at each supplied viewport in both themes, with controlled content. Keep existing workflow, accessibility and responsiveness checks as additional gates. A clean build or no-overflow result alone must not be labeled design completion.

Audit artifacts are local and ignored by Git. The report is the durable handoff; original design files remain unchanged.

Artifact validation: all 46 comparison pairs loaded in the viewer without browser exceptions; theme, navigation and actual-pixel controls were exercised. All 66 local report links resolve. Application build/tests were not rerun because this audit changes only documentation and local evidence tools.
