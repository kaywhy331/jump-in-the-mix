---
id: JITM-07
title: Layout and responsive structure
status: active
version: 1.1.0
owner: Kevin
last_reviewed: 2026-10-08
applies_to: [ui, layout, navigation, responsive, app, public-pages, staff]
supersedes: [docs/design/DESIGN_GUIDELINES.md]
sources:
  - docs/design/jump-in-the-mix-designs/README.txt
  - docs/design/DESIGN_GUIDELINES.md
  - docs/design/RESPONSIVE_AUDIT_2026-09-19.md
  - docs/design/DESIGN_PANE_POLISH_2026-09-20.md
  - docs/design/DESIGN_FOLLOWTHROUGH_2026-09-20.md
  - docs/design/LANDING_PARITY_2026-09-19.md
  - docs/MIX_CONTACT_PANE_ALIGNMENT_2026-09-21.md
  - docs/READY_MADE_MIX_PANES_2026-09-21.md
  - docs/JOURNEY_THREE_PANES_2026-09-21.md
  - docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md
  - docs/ADMIN_DENSITY_2026-09-17.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - src/styles/design-workspaces.css
  - src/styles/contacts-workspace.css
  - src/styles/mix-library.css
  - src/components/WorkflowJourney.module.css
related_skills: [jitm-ui-change, jitm-review, jitm-audit]
related_workflows: [WF-02, WF-05, WF-07]
---

# JITM-07 — Layout and responsive structure

> How screens are framed and laid out at every width: breakpoints, the navigation frame, page archetypes, workspace panes, density, short screens and the widths every layout change is checked at.

## 1. Purpose and scope

This standard governs structure and placement for the signed-in app, public pages and staff screens. It covers what sits where at each width, not what things look like or do.

Neighboring topics have their own homes:
- Tokens, type, icons and components: JITM-06.
- How popups, disclosures, forms and confirmations behave: JITM-08.
- Navigation destinations, labels, order and More's contents: JITM-09 §2.
- Target sizes and reflow floors: JITM-10.
- How to capture and compare screenshots: JITM-12 §2.

## 2. Rules

### Breakpoints and structure

**2.1** Layouts change only at the shared boundaries:
- 767/768: phone bottom sheets become the docked Today review, and the app header appears;
- 900/901: the bottom navigation becomes the rail, and the phone target block ends;
- 1099/1100: Calendar puts its agenda beside the editor;
- 1199/1200: directory and detail panes sit side by side, and Today's outcomes move beside the heading;
- 1279/1280: the compact rail becomes the full rail;
- 1600 and 1700: context columns appear.

Supporting values are 600 (small-phone spacing), 760 (the public menu and staff touch rows) and a 480px height (short screens). New layout code MUST reuse these; a different value needs a reason in the pull request. [SOURCE docs/design/DESIGN_GUIDELINES.md:64] [SHIPPED 9439fd6 src/lib/sheet-layout.ts:1] [SHIPPED 9439fd6 src/styles/design-workspaces.css:130,196] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:141,157] [PROPOSED]

**2.2** One responsive DOM. Each screen renders its content and controls once, and CSS rearranges them. Pane switchers hide panes that stay mounted, so drafts survive a switch or a resize. There are no separate phone and desktop copies. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:115] [SHIPPED 9439fd6 src/styles/mix-library.css:123-128] [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:164-168]

**2.3** Layouts are fluid. Mockup widths are reference points, not requirements; every layout contracts to the space it has and works at every width between breakpoints (§5). [SOURCE docs/design/jump-in-the-mix-designs/README.txt:16] [SOURCE docs/design/DESIGN_GUIDELINES.md:40]

### Navigation frame

**2.4** From 1280px, a quiet 248px rail on `--surface` holds the logo, Quick Add and the primary destinations, then the invitations callout when shown, the account links, the compact appearance switch and the Profile sheet. [SHIPPED 9439fd6 src/styles/design-workspaces.css:2-19] [SHIPPED 9439fd6 src/components/AppShell.tsx:45-73] [SOURCE docs/design/DESIGN_GUIDELINES.md:22]

**2.5** From 901 to 1279px, an 80px compact rail shows each destination's icon with its label below (size floor: JITM-10 §2.2). Quick Add and the account links are icons with accessible names. [SHIPPED 9439fd6 src/styles/design-workspaces.css:195-206] [SHIPPED 9439fd6 e2e/a2-css-checks.spec.ts:78-86]

**2.6** At 900px and below, a fixed bottom navigation shows the phone destinations of JITM-09 §2.3 in five equal columns, with the Quick Add bubble in the center. The bar respects the safe area, and its rows grow when labels wrap. [SHIPPED 9439fd6 src/styles/base.css:280-282] [SHIPPED 9439fd6 src/styles/design-workspaces.css:130-145] [SHIPPED 9439fd6 src/components/Nav.tsx:40] [SHIPPED 9439fd6 src/styles/design-details.css:287-291]

**2.7** Both rails scroll on their own when the window is short. Their controls keep full size, focus scrolls into view, and Appearance and Profile stay reachable on a 600px-high laptop. [SHIPPED 9439fd6 src/styles/design-workspaces.css:3-4] [SOURCE docs/design/DESIGN_FOLLOWTHROUGH_2026-09-20.md:10] [SOURCE docs/design/DESIGN_GUIDELINES.md:23]

**2.8** Below 768px there is no app header. Each page starts with one title row holding its actions, with an optional search row beneath. Sub-pages start with `BackLink` (chevron and parent name). Settings, My account and Help show "Back to More" on phones only. [SHIPPED 9439fd6 src/styles/mobile-ux.css:3] [SHIPPED 9439fd6 src/components/BackLink.tsx:4-6] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:24-25] [SOURCE docs/design/jump-in-the-mix-designs/screens/Contacts.html:21 (title and search rows)]

**2.9** Anything fixed to the bottom of the screen, such as completion confirmations, the return tray and the install prompt, MUST sit above the bottom navigation wherever it shows. Pages reserve bottom padding so the last row can scroll clear. [SHIPPED 9439fd6 src/styles/design-workspaces.css:132,256-259] [SHIPPED 9439fd6 src/styles/popups.css:41-43] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:59]

### Page archetypes

**2.10** Every page uses one archetype. The widths are maxima; each contracts to the space available.

| Archetype | Maximum | Used by |
|---|---|---|
| Multi-pane workspace | Fills the page beside the rail; Today and Calendar stop at 1672px | Today, Contacts, the Mix library family, Journey, Calendar |
| Workspace or data list | 1440px (`.page`) | Unmocked workspaces and lists |
| Reading and detail | 1120px (`page--content`) | Account, Help, support conversations |
| Focused form | 1040px (`page--form`) | Contact add and edit, business, preferences, notifications, sending, invitations |
| Destination list | 960px (`settings-page`, `more-page`) | Settings, More |
| Public, auth, staff | 1328px public content; auth card; staff shell | Marketing pages; sign-in and onboarding; staff console |

[SHIPPED 9439fd6 src/styles/design-workspaces.css:21-26,93,328] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:5] [SHIPPED 9439fd6 src/styles/mix-library.css:4] [SHIPPED 9439fd6 src/styles/design-public.css:3] [SOURCE docs/design/DESIGN_GUIDELINES.md:40]

**2.11** A page without a mockup takes the nearest archetype. Agents MUST NOT invent a new page width. [SOURCE docs/design/DESIGN_GUIDELINES.md:40] [SOURCE docs/design/RESPONSIVE_AUDIT_2026-09-19.md:11-20]

**2.12** Columns are sized against their own bounded workspace: fixed pane widths around a flexible center. Never simulate a column with percentage padding against an uncapped parent. Prose and editors stay readable on ultrawide screens; for example, the Mix editor stops at 1096px and profile content at 1000px from 2200px. [SOURCE docs/design/DESIGN_GUIDELINES.md:41] [SHIPPED 9439fd6 src/styles/design-workspaces.css:91-93] [SHIPPED 9439fd6 src/styles/mix-library.css:120-121] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:170-172]

**2.13** Contacts, the Mix library and Journey share one composition: a directory, a center pane and a context pane, meeting the rail directly. From 1200px the directory is 360px and context follows the center; from 1700px it is 440px directory, center and a 340px context column. Below 1200px one pane shows at a time, through a pane switcher. [OWNER 2026-09-21 docs/MIX_CONTACT_PANE_ALIGNMENT_2026-09-21.md:3] [OWNER 2026-09-21 docs/JOURNEY_THREE_PANES_2026-09-21.md:3] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:141-162] [SHIPPED 9439fd6 src/styles/mix-library.css:102-128]

### Density

**2.14** Staff screens are compact on desktop: at 1366×768 the title, main status, controls and first useful records show without scrolling. On touch widths (760px and below) staff rows return to 44px. Customer screens follow JITM-10 §2.1 at every width. [OWNER 2026-09-28 D9] [SHIPPED 9439fd6 src/styles/disclosures.css:47-50] [SOURCE docs/ADMIN_DENSITY_2026-09-17.md:7]

### Workspaces

**2.15** Today keeps the queue beside one docked review from 768px; below that the review is a bottom sheet. The queue is `clamp(300px, 26vw, 440px)` with a 24px gap, 300px from 768 to 900px, and the workspace stops at 1672px. From 1600px a contact-context column sits beside the review. How the docked review behaves is JITM-08 §2.15. [SHIPPED 9439fd6 src/lib/sheet-layout.ts:1] [SHIPPED 9439fd6 src/styles/design-workspaces.css:87-93,120-122,207-209] [SOURCE docs/design/DESIGN_GUIDELINES.md:24,41]

**2.16** From 1200px, Snooze and Skip sit beside the person's heading and Mark sent sits beside the send controls, with space kept for long names and the context column. Phones and portrait tablets keep the outcomes below the wording. [SHIPPED 9439fd6 src/styles/design-details.css:45-52] [SOURCE docs/design/DESIGN_PANE_POLISH_2026-09-20.md:11] [SOURCE docs/design/jump-in-the-mix-designs/screens/DesktopToday.html:21 (Snooze, Skip beat and Mark sent)]

**2.17** Contacts opens the full profile from a row below 1200px. From 1200px the directory stays beside the selected profile, and from 1700px a details column joins them (§2.13). [SHIPPED 9439fd6 src/styles/contacts-workspace.css:141-172] [SOURCE docs/design/DESIGN_GUIDELINES.md:26]

**2.18** My mixes, Mega-Mixes, Marketplace and Ready-made share one Mix library workspace (§2.13). Its phone switcher is Mixes / Beats / Details. The three collection tabs share the directory width; Marketplace sections use the segmented control, and listing types use chips. [OWNER 2026-09-21 docs/READY_MADE_MIX_PANES_2026-09-21.md:3] [SHIPPED 9439fd6 src/styles/mega-mixes.css:35,42,48] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:85-96]

**2.19** Journey is the account's Mix and Beat graph, not the export's stage circles. The page fills the width beside the rail. It uses the §2.13 panes as people, map and details, with a People / Map / Details switcher below 1200px. From 768 to 900px it keeps a compact page header. [OWNER 2026-09-28 D4] [OWNER 2026-09-21 docs/JOURNEY_THREE_PANES_2026-09-21.md:3] [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:1,67,80-81,145-170]

**2.20** Journey opens readable: from 768px the map opens at 100% zoom, scrolled to the first numbered Mix, and Fit map is an explicit overview; on phones Journey opens in its list view, with the map one tap away. [OWNER 2026-10-08 D75] The Journey map is a scrollable, focusable region that fills the map pane: the viewport height less its header from 1700px, and half the screen height on phones. Zoom and Fit map controls sit above it, and the cursor shows an open hand when panning is ready and a closed hand while panning. How panning and refresh behave is JITM-09 §2. [OWNER 2026-09-28 D4] [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:162,172,241-243] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:229]

**2.21** Calendar leads with the agenda, and the agenda leads with appointments: the follow-ups due each day are one summary row linking to Today, never one row each (JITM-09 §2.62, D74). At 1099px and below the editor shows only when New event or Edit asks for it. From 1100px a 360px agenda sits beside the editor; from 1700px it is a 400px agenda, the editor and a 280px contact column. The workspace stops at 1672px. [SHIPPED 9439fd6 src/styles/design-details.css:153-160] [SHIPPED 9439fd6 src/styles/design-workspaces.css:327-337] [SOURCE docs/design/DESIGN_GUIDELINES.md:34]

**2.22** More and Settings are flat, grouped destination rows within 960px; Settings groups its rows under labels (JITM-09 §2.7, D81). At 900px and below the rows are 56px, groups are separated by 10px `--surface` bands, descriptions hide, and Appearance and Sign out stay reachable above the bottom navigation. [SHIPPED 9439fd6 src/styles/design-system.css:150-159] [SHIPPED 9439fd6 src/styles/design-workspaces.css:26] [SOURCE docs/design/jump-in-the-mix-designs/screens/More.html:21 (grouped rows)] [SOURCE docs/design/DESIGN_GUIDELINES.md:39]

**2.23** Reading pages and focused forms use flat sections with top-border rows instead of cards, and a shared header and action row. [SHIPPED 9439fd6 src/styles/design-workspaces.css:24-31] [SOURCE docs/design/RESPONSIVE_AUDIT_2026-09-19.md:14-15]

**2.24** The homepage and the five "Mixes for" pages share `PublicLanding`, in this order: header; hero with the introduction, the demo and the profession choices; how it works; the own-voice section; the profession directory; the waitlist band; the footer. On desktop the profession choices sit beside the demo. At 1000px and below the hero stacks as introduction, demo, then profession choices. [OWNER 2026-09-19 docs/design/LANDING_PARITY_2026-09-19.md:3] [SHIPPED 9439fd6 src/components/PublicLanding.tsx:16-51] [SHIPPED 9439fd6 src/styles/design-public.css:7-10,65-66]

**2.25** On phones, public pages keep:
- a header with the wordmark, a short "Join" whose accessible name is complete, and a 44px Explore menu holding the section links, Sign in and the appearance switch, through 760px;
- a two-column profession directory that stacks when its container is 20em or narrower;
- five "Mixes for" links with no "All", on one row where they fit and wrapping naturally otherwise.

[SOURCE docs/design/DESIGN_GUIDELINES.md:36,54] [SHIPPED 9439fd6 src/components/PublicHeader.tsx:28-32] [SHIPPED 9439fd6 src/styles/popups.css:45-53] [SOURCE docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:19] [SHIPPED 9439fd6 src/styles/design-public.css:87] [SHIPPED 9439fd6 src/styles/design-details.css:297-300] [SOURCE docs/design/LANDING_PARITY_2026-09-19.md:7]

**2.26** On screens 480px high or less, sheet, dialog and editor headers and action footers scroll with their content instead of sticking. Fields MUST never be trapped between two sticky blocks. [SHIPPED 9439fd6 src/styles/popups.css:33-35] [SHIPPED 9439fd6 src/styles/design-details.css:254-258] [SOURCE docs/design/DESIGN_GUIDELINES.md:50]

## 3. Canonical implementations

| Width | Today | Contacts | Mix library family | Journey | Calendar |
|---|---|---|---|---|---|
| ≤767 | Queue; review as a bottom sheet | List; row opens the profile | Pane switcher | Pane switcher | Agenda; editor on request |
| 768–1199 | Queue 300px (to 900), then clamp; docked review | Same as phone | Pane switcher | Pane switcher | Editor on request to 1099; then 360px agenda and editor |
| 1200–1699 | Review outcomes beside the heading; context from 1600 | 360px directory and profile | 360px directory and center | 360px people and map | 360px agenda and editor |
| ≥1700 | Context column 280px | 440 · profile · 340 | 440 · center · 340 | 440 · map · 340 | 400 · editor · 280 |

- Frame: `src/components/AppShell.tsx`, `src/components/Nav.tsx`, `src/styles/design-workspaces.css` (lines 1–31 and 130–206).
- Docked review: `src/lib/sheet-layout.ts` and `src/components/Sheet.tsx`.
- Panes: `src/styles/contacts-workspace.css`, `src/styles/mix-library.css`, `src/components/MixLibraryShell.tsx`, `src/components/WorkflowJourney.module.css`, `src/components/useCanvasPan.ts`.
- Public: `src/components/PublicLanding.tsx`, `src/components/PublicHeader.tsx`, `src/styles/design-public.css`.
- Back control: `src/components/BackLink.tsx`.

## 4. Do / Don't

- **Do** put a new settings page in `page--form` and start it with `BackLink`.
- **Do** give a new workspace the §2.13 panes and a pane switcher that keeps panes mounted.
- **Do** check the width on both sides of every breakpoint your change touches.
- **Don't** add `@media (max-width: 1024px)` for one page; use the shared boundaries.
- **Don't** render a second, phone-only copy of a form.
- **Don't** set a percentage padding that assumes the page is 1440px wide.
- **Don't** let a sticky save bar or the bottom navigation cover the field being edited.

## 5. Verification

This is the viewport matrix. JITM-12 §2.18 says which of these widths, themes and modes a change is captured at, and how the screenshots are compared.

| Widths | Why |
|---|---|
| 320 | Narrowest phone: reflow, no sideways scroll, 200% text |
| 390 | Export phone screens |
| 767 / 768 | Bottom sheet or docked review; the app header |
| 834 | Export portrait tablet |
| 900 / 901 | Bottom navigation or compact rail |
| 1099 / 1100 | Calendar columns |
| 1194 | Export landscape tablet; compact rail labels |
| 1199 / 1200 | Directory and detail panes |
| 1279 / 1280 | Compact or full rail |
| 1440 | Laptop; the 1440px page maximum |
| 1599 / 1600, 1699 / 1700 | Context columns, when touched |
| 1920 | Export desktop screens |
| 2560, 3440, 3840 | Ultrawide: bounded columns and readable prose |

Also check a 600px-high laptop (rails) and a screen 480px high or less (sticky headers). Measure column widths and overlaps rather than relying on an overflow scan. Browser suites that cover layout: `e2e/design-correction.spec.ts`, `e2e/relationship-vocabulary.spec.ts` (five-control phone bar at 320, 390, 768 and 1440), `e2e/a2-css-checks.spec.ts`, `e2e/visual-fitment.spec.ts`, `e2e/design-details-public.spec.ts` and `e2e/marketplace.spec.ts`.

## 6. Open decisions and known deviations

Where the shipped layout differs from the export without a recorded reason, the export is the default after an in-context comparison (JITM-06 §2.33, D24):
- **Context column:** Today (from 1600px) and Calendar (from 1700px) use 280px (`src/styles/design-workspaces.css:121`, `src/styles/design-details.css:159`); the export uses 340px, and a 440px Calendar agenda where the code has 400px (`screens/DesktopToday.html:21`, `DesktopCalendar.html:21`).
- **Quick Add bubble:** it renders 56×52 with 16px corners, because a legacy `min-height: 52px` wins (`src/styles/base.css:286`, `src/styles/design-workspaces.css:141`). The export draws 58×48 with 18px corners, lifted 18px (`screens/Main.html:21`).
- **Sheet shadow:** `--shadow-sheet` is 12% light and 40% dark (`src/styles/design-tokens.css:64,112`); the export uses 20% and 38% (`screens/Review.html:21`, `DarkReview.html:22`).
- **Docked review width (open since 2026-09-24):** the composer has no maximum; the export caps the review at 680px (`screens/DesktopToday.html:21`).
- **Portrait tablets (open since 2026-09-24):** from 768 to 900px a sticky 64px app header shows (`src/styles/auth.css:67-69`); the export has none (`screens/TabletToday.html:21`).

Known deviations:
- 126 of 195 width breakpoints in the CSS use values outside the shared set, and `max-width: 1100px` and `1200px` overlap the matching `min-width` rules at the boundary (drift baseline metric 12).
- Preserving the desktop three-pane structure is part of the standing default in JITM-01 §2.24 (D20).

Decided, not built (UX audit 2026-10-08, `docs/UX_DESIGN_AUDIT_2026-10-08.md`), at f23db11:
- Journey opens fitted to the whole map, at 15% on a 390px phone, 21% at 1440px and 22% at 1920px, and the list view sits behind Options (`src/components/WorkflowJourney.tsx:215,231`; VIS-01), against §2.20 (D75).
- The Calendar agenda lists every follow-up as its own row, so on a busy day the first appointment is about 1,950px down (LEN-04), against §2.21 (D74).
- The Settings hub is one ungrouped list, 1,510px long on a phone (LEN-07), against §2.22 (D81).

Question for Kevin:
- **Printing:** no print stylesheet exists. Is printing Today or a profile a supported workflow?

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 1.0.1 — 2026-09-28 — Base 61d4df4. §6 updated for D20 and D24.
- 1.1.0 — 2026-10-08 — Base f23db11. §2.20 Journey opens at 100% from 768px and in the list view on phones (D75); §2.21 the Calendar agenda leads with appointments (D74); §2.22 Settings groups its rows (D81). §6 lists the three as decided, not built.
