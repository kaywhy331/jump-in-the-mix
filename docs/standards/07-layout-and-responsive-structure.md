---
id: JITM-07
title: Layout and responsive structure
status: active
version: 3.1.0
owner: Kevin
last_reviewed: 2026-11-11
applies_to: [ui, layout, navigation, responsive, app, public-pages, staff]
supersedes: [docs/design/DESIGN_GUIDELINES.md]
sources:
  - docs/design/NATIVE-NAVIGATION.md
  - docs/design/UX_AUDIT_2026-11-08.md
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

Supporting values are 600 (small-phone spacing), 760 (the public menu and staff touch rows) and a 480px height (short screens). New layout code MUST reuse these; a different value needs a reason in the pull request. The paired whole-pixel labels above describe the switch, not permission for an unmatched interval: media queries MUST cover fractional widths with exactly one layout on either side, preferably complementary range syntax such as `width < 901px` / `width >= 901px`. Legacy .98px offsets require a measured fractional-width check; never pair max N with min N+1. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:106] [SOURCE docs/design/DESIGN_GUIDELINES.md:64] [SHIPPED 9439fd6 src/lib/sheet-layout.ts:1] [SHIPPED 9439fd6 src/styles/design-workspaces.css:130,196] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:141,157] [PROPOSED]

**2.2** One responsive DOM. Each screen renders its content and controls once, and CSS rearranges them. Pane switchers hide panes that stay mounted, so drafts survive a switch or a resize. There are no separate phone and desktop copies. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:115] [SHIPPED 9439fd6 src/styles/mix-library.css:123-128] [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:164-168]

**2.3** Layouts are fluid. Mockup widths are reference points, not requirements; every layout contracts to the space it has and works at every width between breakpoints (§5). [SOURCE docs/design/jump-in-the-mix-designs/README.txt:16] [SOURCE docs/design/DESIGN_GUIDELINES.md:40]

### Navigation frame

**2.4** From 1280px, a quiet 248px rail on `--surface` holds the logo, Quick Add and the primary destinations, then the invitations callout when shown, the account links, the compact appearance switch and the Profile sheet. [SHIPPED 9439fd6 src/styles/design-workspaces.css:2-19] [SHIPPED 9439fd6 src/components/AppShell.tsx:45-73] [SOURCE docs/design/DESIGN_GUIDELINES.md:22]

**2.5** From 901 to 1279px, an 80px compact rail shows each destination's icon with its label below (size floor: JITM-10 §2.2). Quick Add and the account links are icons with accessible names. [SHIPPED 9439fd6 src/styles/design-workspaces.css:195-206] [SHIPPED 9439fd6 e2e/a2-css-checks.spec.ts:78-86]

**2.6** At 900px and below, a fixed bottom navigation shows the phone destinations of JITM-09 §2.3 in five equal columns, with the Quick Add bubble in the center. The bar respects the safe area, and its rows grow when labels wrap. [SHIPPED 9439fd6 src/styles/base.css:280-282] [SHIPPED 9439fd6 src/styles/design-workspaces.css:130-145] [SHIPPED 9439fd6 src/components/Nav.tsx:40] [SHIPPED 9439fd6 src/styles/design-details.css:287-291]
When enlarged text cannot fit the phone labels as whole words in five equal columns, the bar wraps into a second row instead of breaking words or overlapping, keeping the destination order and 44px targets; the five equal columns with the central Quick Add apply at normal text sizes. [OWNER 2026-11-03 D128]

**2.7** Both rails scroll on their own when the window is short. Their controls keep full size, focus scrolls into view, and Appearance and Profile stay reachable on a 600px-high laptop. [SHIPPED 9439fd6 src/styles/design-workspaces.css:3-4] [SOURCE docs/design/DESIGN_FOLLOWTHROUGH_2026-09-20.md:10] [SOURCE docs/design/DESIGN_GUIDELINES.md:23]

**2.8** Below 768px there is no app header. Each page starts with one title row holding its actions, with an optional search row beneath. Sub-pages start with `BackLink` (chevron and parent name). Settings, My account and Help show "Back to More" on phones only. [SHIPPED 9439fd6 src/styles/mobile-ux.css:3] [SHIPPED 9439fd6 src/components/BackLink.tsx:4-6] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:24-25] [SOURCE docs/design/jump-in-the-mix-designs/screens/Contacts.html:21 (title and search rows)]

**2.9** Anything fixed to the bottom of the screen, such as completion confirmations, the return tray and the install prompt, MUST sit above the bottom navigation wherever it shows. Pages reserve bottom padding so the last row can scroll clear. [SHIPPED 9439fd6 src/styles/design-workspaces.css:132,256-259] [SHIPPED 9439fd6 src/styles/popups.css:41-43] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:59]

**2.33** The section ring is the order section swipe follows (JITM-08 §2.46): Today, Contacts, Mixes, More, the four destinations of the phone bottom navigation (JITM-09 §2.3), in its order. Quick Add is an action, not a stop. Journey and Calendar are not stops, even beside the rail, so the order never changes with width. The ends don't wrap: Today has no previous section and More has no next, and a drag past an end resists and springs back. The ring applies only on a stop's own screen (`/jumps`, `/contacts`, `/mixes`, `/more`) with a coarse pointer, at any width; sub-pages are left by Back. [OWNER 2026-11-08 D130] [SHIPPED b9bfd1d6 src/components/Nav.tsx:9-16]

### Page archetypes

**2.10** Every page uses one archetype. The widths are maxima; each contracts to the space available.

| Archetype | Maximum | Used by |
|---|---|---|
| Multi-pane workspace | 1672px as one centered group beside the rail (§2.28); Journey keeps §2.19 | Today, Contacts, the Mix library family, Journey, Calendar |
| Workspace or data list | 1440px (`.page`) | Unmocked workspaces and lists |
| Reading and detail | 1120px (`page--content`) | Account, Help, support conversations |
| Focused form | 1040px (`page--form`) | Contact add and edit, business, preferences, notifications, sending, invitations |
| Destination list | 960px (`settings-page`, `more-page`) | Settings, More |
| Public, auth, staff | 1328px public outer frame / 1280px content; auth 404px; staff shell (§2.32) | Marketing pages; sign-in and onboarding; staff console |

[PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:101] [SHIPPED 9439fd6 src/styles/design-workspaces.css:21-26,93,328] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:5] [SHIPPED 9439fd6 src/styles/mix-library.css:4] [SHIPPED 9439fd6 src/styles/design-public.css:3] [SOURCE docs/design/DESIGN_GUIDELINES.md:40]

**2.11** A page without a mockup takes the nearest archetype. Agents MUST NOT invent a new page width. [SOURCE docs/design/DESIGN_GUIDELINES.md:40] [SOURCE docs/design/RESPONSIVE_AUDIT_2026-09-19.md:11-20]

**2.12** Columns are sized against their own bounded workspace: fixed pane widths around a flexible center. Never simulate a column with percentage padding against an uncapped parent. Detail/context columns MUST stay adjacent to their main column within that cap; never pin one to the viewport edge while centering the other. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:102] Prose and editors stay readable on ultrawide screens; for example, the Mix editor stops at 1096px and profile content at 1000px from 2200px. [SOURCE docs/design/DESIGN_GUIDELINES.md:41] [SHIPPED 9439fd6 src/styles/design-workspaces.css:91-93] [SHIPPED 9439fd6 src/styles/mix-library.css:120-121] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:170-172]

**2.13** Contacts, the Mix library and Journey share one composition: a directory, a center pane and a context pane in one bounded group beside the rail; the group meets the rail at ordinary widths and follows §2.28 once capped. From 1200px the directory is 360px and context follows the center; from 1700px it is 440px directory, center and a 340px context column. Below 1200px one pane shows at a time, through a pane switcher. [OWNER 2026-09-21 docs/MIX_CONTACT_PANE_ALIGNMENT_2026-09-21.md:3] [OWNER 2026-09-21 docs/JOURNEY_THREE_PANES_2026-09-21.md:3] [SHIPPED 9439fd6 src/styles/contacts-workspace.css:141-162] [SHIPPED 9439fd6 src/styles/mix-library.css:102-128]

### Density

**2.14** Staff screens are compact on desktop: at 1366×768 the title, main status, controls and first useful records show without scrolling. On touch widths (760px and below) staff rows return to 44px. Customer screens follow JITM-10 §2.1 at every width. [OWNER 2026-09-28 D9] [SHIPPED 9439fd6 src/styles/disclosures.css:47-50] [SOURCE docs/ADMIN_DENSITY_2026-09-17.md:7]

### Workspaces

**2.15** Today keeps the queue beside one docked review from 768px; below that the review is a bottom sheet. The queue is `clamp(300px, 26vw, 440px)` with a 24px gap, 300px from 768 to 900px, and the workspace stops at 1672px. From 1600px a contact-context column sits beside the review. Short-height behavior follows §2.26. How the docked review behaves is JITM-08 §2.15. [SHIPPED 9439fd6 src/lib/sheet-layout.ts:1] [SHIPPED 9439fd6 src/styles/design-workspaces.css:87-93,120-122,207-209] [SOURCE docs/design/DESIGN_GUIDELINES.md:24,41]

**2.16** From 1200px, Snooze and Skip sit beside the person's heading and Mark sent sits beside the send controls, with space kept for long names and the context column. Phones and portrait tablets keep the outcomes below the wording. [SHIPPED 9439fd6 src/styles/design-details.css:45-52] [SOURCE docs/design/DESIGN_PANE_POLISH_2026-09-20.md:11] [SOURCE docs/design/jump-in-the-mix-designs/screens/DesktopToday.html:21 (Snooze, Skip beat and Mark sent)]

**2.17** Contacts opens the full profile from a row below 1200px. From 1200px the directory stays beside the selected profile, and from 1700px a details column joins them (§2.13). [SHIPPED 9439fd6 src/styles/contacts-workspace.css:141-172] [SOURCE docs/design/DESIGN_GUIDELINES.md:26]

**2.18** My mixes, Mega-Mixes, Marketplace and Ready-made share one Mix library workspace (§2.13). Its phone switcher is Mixes / Beats / Details. The three collection tabs share the directory width; Marketplace sections use the segmented control, and listing types use chips. [OWNER 2026-09-21 docs/READY_MADE_MIX_PANES_2026-09-21.md:3] [SHIPPED 9439fd6 src/styles/mega-mixes.css:35,42,48] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:85-96]

**2.19** Journey is the account's Mix and Beat graph, not the export's stage circles. The page fills the width beside the rail. It uses the §2.13 panes as people, map and details, with a People / Mixes / Details switcher below 1200px; the middle tab shows the Mixes as a list or a map. [OWNER 2026-10-12 D95] From 768 to 900px it keeps a compact page header, subject to the short-height rule (§2.26). [OWNER 2026-09-28 D4] [OWNER 2026-09-21 docs/JOURNEY_THREE_PANES_2026-09-21.md:3] [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:1,67,80-81,145-170]

**2.20** Journey opens readable: from 768px the map opens at 100% zoom, scrolled to the first numbered Mix, and Fit map is an explicit overview; on phones Journey opens in its list view, with the map one tap away. [OWNER 2026-10-08 D75] [SHIPPED 4e78545 src/components/WorkflowJourney.tsx:33-38] With a person chosen, Journey goes to their work: from 768px the map opens on their first active Mix; on phones the list marks their Mixes. [OWNER 2026-10-12 D96] The phone list also scrolls to the first of them. [OWNER 2026-10-13 D117] [SHIPPED 4d5c307 src/components/WorkflowJourney.tsx:164] Journey also marks the Mixes of a person's Mix starts, not only those their Journey work is in. [OWNER 2026-10-13 D121] Whether it also marks the Mixes of their follow-ups, or the rest of JITM-09 §2.32's set of a person's Mixes, is open (§6). The Journey map is a scrollable, focusable region that fills the map pane: the viewport height less its header from 1700px, and half the screen height on phones. Zoom and Fit map controls sit above it, and the cursor shows an open hand when panning is ready and a closed hand while panning. How panning and refresh behave is JITM-09 §2. [OWNER 2026-09-28 D4] [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:162,172,241-243] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:229]

**2.21** Calendar leads with the agenda, and the agenda leads with appointments: the follow-ups due each day are one summary row linking to Today, never one row each (JITM-09 §2.62, D74). At 1099px and below the editor shows only when New event or Edit asks for it. From 1100px a 360px agenda sits beside the editor; from 1700px it is a 400px agenda, the editor and a 280px contact column. The workspace stops at 1672px. [SHIPPED 9439fd6 src/styles/design-details.css:153-160] [SHIPPED 9439fd6 src/styles/design-workspaces.css:327-337] [SOURCE docs/design/DESIGN_GUIDELINES.md:34]

**2.22** More and Settings are flat, grouped destination rows within 960px; Settings groups its rows under labels (JITM-09 §2.7, D81). Groups SHOULD contain about four related destinations, with the label visually separated from its description. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:63] At 900px and below the rows are 56px, groups are separated by 10px `--surface` bands, descriptions hide, and Appearance and Sign out stay reachable above the bottom navigation. [SHIPPED 9439fd6 src/styles/design-system.css:150-159] [SHIPPED 9439fd6 src/styles/design-workspaces.css:26] [SOURCE docs/design/jump-in-the-mix-designs/screens/More.html:21 (grouped rows)] [SOURCE docs/design/DESIGN_GUIDELINES.md:39]

**2.23** Reading pages and focused forms use flat sections with top-border rows instead of cards, and a shared header and action row. [SHIPPED 9439fd6 src/styles/design-workspaces.css:24-31] [SOURCE docs/design/RESPONSIVE_AUDIT_2026-09-19.md:14-15]

**2.24** The homepage and the five "Mixes for" pages share `PublicLanding`, in this order: header; hero with the introduction, the demo and the profession choices; how it works; the own-voice section; the profession directory; the waitlist band; the footer. On desktop the profession choices sit beside the demo. At 1000px and below the hero stacks as introduction, demo, then profession choices. [OWNER 2026-09-19 docs/design/LANDING_PARITY_2026-09-19.md:3] [SHIPPED 9439fd6 src/components/PublicLanding.tsx:16-51] [SHIPPED 9439fd6 src/styles/design-public.css:7-10,65-66]

**2.25** On phones, public pages keep:
- a header with the wordmark, a short "Join" whose accessible name is complete, and a 44px Explore menu holding the section links, Sign in and the appearance switch, with the content-fit collapse in §2.30;
- a two-column profession directory that stacks when its container is 20em or narrower;
- five "Mixes for" links with no "All", on one row where they fit and wrapping naturally otherwise.

[SOURCE docs/design/DESIGN_GUIDELINES.md:36,54] [SHIPPED 9439fd6 src/components/PublicHeader.tsx:28-32] [SHIPPED 9439fd6 src/styles/popups.css:45-53] [SOURCE docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:19] [SHIPPED 9439fd6 src/styles/design-public.css:87] [SHIPPED 9439fd6 src/styles/design-details.css:297-300] [SOURCE docs/design/LANDING_PARITY_2026-09-19.md:7]

**2.26** On screens 480px high or less, including phones turned sideways, sheet, dialog and editor headers and action footers MUST scroll with their content instead of sticking. Use compact phone chrome and a single-pane task surface where the tablet header plus docked panes would consume the working height; keep navigation reachable in the scrolling flow. Fields MUST never be trapped between two sticky blocks. This short-height exception does not hide navigation during ordinary-height editing (§2.6). [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:105] [SHIPPED 9439fd6 src/styles/popups.css:33-35] [SHIPPED 9439fd6 src/styles/design-details.css:254-258] [SOURCE docs/design/DESIGN_GUIDELINES.md:50]

### New-page composition

**2.27** Task pages MUST start with their shared title row and one H1; a parent BackLink may precede it. Status strips, optional banners and attention controls belong below the H1 and must not displace the first useful work from the first phone screen. Hide zero-count attention controls and duplicate next-item summaries. Required privacy barriers and staff Overview's explicit zero rows (JITM-09 §2.66) are exceptions; unknown is never treated as zero. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:54] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:55]

**2.28** Standard app workspaces MUST center their bounded pane group in the area beside the rail, up to 1672px, with detail/context columns next to the main column. Smaller archetype caps still apply. A column with no content MUST collapse; show an intentional selection prompt in an existing detail pane rather than reserve an empty track. Journey keeps its owner-decided full-width map (§2.19), with bounded readable controls. This is the recommended default for UXC-01, not a claim it has shipped. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:101] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:104]

**2.29** Forms and lists MUST constrain children by content, within 100% of their container: short fields such as names and links SHOULD cap at 40rem; message boxes use JITM-06 §2.34's reading measure. Single-pane list rows and search SHOULD cap at 50rem, including just below the 1200px pane switch. These proposed caps are defaults, not owner-approved values or reasons to narrow the graph canvas. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:103] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:109]

**2.30** The shared public header MUST move its section links into Explore before they wrap or collide. Use the shared 900/901 boundary as the default content-fit collapse; test translated/long labels and enlarged text and collapse earlier if needed with a recorded reason (§2.1). Retain Join and Explore, and get destinations from JITM-09 §2.83. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:84]

**2.31** At normal text size on 390×844 and 375×667 phones, marketing's demo/proof SHOULD be visible or peeking on the first screen. There SHOULD be no empty vertical band over 160px in that first-screen composition. State-changing demo cards MUST keep a stable minimum height sufficient for their steps, without hiding content or signatures. CTA-note wording follows JITM-04 §2.39; reflow and enlarged text win over a first-screen target. Long secondary phone sections follow JITM-08 §2.21. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:38] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:92]

**2.32** A new page MUST choose its kit below and reuse the real implementations in JITM-06 §3. Every kit uses §2.27's H1 order, JITM-10 §2.22's matching document title, and the full applicable states pass in JITM-12 §2.26 (record non-applicable states with a reason). Save scope/placement is JITM-08 §2.23; all reading blocks use JITM-06 §2.34 even inside a wider frame. Check DRIFT_BASELINE before treating any neighbouring page as a reference. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:19]

| Kit | Shared header/title pattern | Save pattern | States to demonstrate in addition to the common pass | Width / measure |
|---|---|---|---|---|
| Multi-pane workspace | AppShell; one page title, pane headings below it | Editor scope per JITM-08 §2.23; no Save on read-only lists | Unselected and filtered-empty detail; pane loading; failed read/retry; offline | §2.28; directories 360px from 1200px, 440px from 1700px (§2.13); keep existing Today exception (§2.15, §6) |
| Workspace / data list | AppShell; shared title/action row, search below | Only if editing; §2.23 of JITM-08 | Empty, filtered-empty with Clear, loading, failed read | Outer 1440px; list/search §2.29 |
| Reading / detail | AppShell and BackLink; shared title row | None for reading; edit sections use JITM-08 §2.23 | Missing record, loading, error/recovery; long secondary disclosures | Outer 1120px; reading measure JITM-06 §2.34 |
| Focused form | AppShell and BackLink; title before hints/notices | Shared SaveBar or visibly dirty per-section saves, following their fields | Validation, submitting, failed save with retained entries, recovery, offline, expired session | Outer 1040px; fields §2.29; short-height behavior §2.26 |
| Destination list | AppShell; one Settings/More title; shared group headings | None; inline preferences follow JITM-08 §2.23 | Signed-in/permission variants, unavailable destination with reason | 960px; small related groups (§2.22) |
| Public landing / article / policy | PublicHeader; PublicLanding, PublicArticle or PublicDocument; one H1 | No Save; an actual form follows the form contract | Signed-in/out header, not-found, demo loading/error, validation where present | Outer 1328px including gutters, content 1280px; reading measure inside it |
| Auth / system card | Shared card role with Logo; state-aware H1 (JITM-06 §2.38); implementation pending in §6 | One scoped action, not a fictitious Save on status pages | Invalid/expired/missing token, loading, error/recovery, signed-in/out, offline, not-found | SHOULD cap at 404px; phone fit JITM-06 §2.38 |
| Staff | Existing staff shell; one H1 and shared title/action row | Form save contract where editable | Empty/loading/error, validation, permission-denied and expired session | Existing staff shell; density §2.14, readable blocks JITM-06 §2.34; no new width invented |

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

This is the single viewport matrix used by WF-02, WF-07, reviews and JITM-12 §2.18. Test both themes at every applicable row; an audit of layout covers the whole matrix. Include both sides of **every** layout boundary in the changed code, including content-specific boundaries not listed below. Record exact CSS viewport, height, text scaling and input capability; a monitor's physical pixels are not its CSS width.

| Widths / viewports (CSS px) | Why |
|---|---|
| 320×640, 390×844, 430×932 | Narrow phones, normal and 200% text; export phone |
| 599/600/601, 759/760/761 | Supporting spacing/public/staff boundaries where applicable |
| 767 / 768 (768×1024) | Sheet/docked review and header boundary; full portrait tablet |
| 834×1147 | Export portrait tablet |
| 900 / 901 | Bottom navigation / compact rail and public content-fit collapse |
| 999 / 1000 / 1001 | Public hero stack (§2.24), when touched |
| 1099 / 1100 | Calendar columns |
| 1194×834, 1199 / 1200 | Export landscape tablet and directory/detail switch |
| 1279 / 1280 | Compact / full rail; also 1280×600 laptop |
| 1440, 1599 / 1600, 1699 / 1700, 1920×1080 | Page caps, context columns and export desktop |
| 2199 / 2200 / 2201 | Existing ultrawide column rules, while they exist |
| 2560×1080, 3110×1147, 3440, 3840 | Wide/ultrawide caps, adjacent details, reading measure |
| 667×375, 844×390; height 480 and one below it | Sideways phones, short-height chrome and scrolling bars (§2.26) |
| One fractional width beside a touched boundary | 110% zoom or a .5px CSS window; confirm effective width and which query matches, including the old gap (e.g. 900.5px) |

Measure pane widths, reading measure, empty tracks, first useful content and overlapping chrome; an overflow scan alone does not establish fit. Check the states, touch, title, skip-link and navigation-focus pass in JITM-12 §2.26. Use synthetic data and JITM-12 §2.18's screenshot/inspection protocol, not inferred ultrawide behavior.

Layout suites include `e2e/design-correction.spec.ts`, `e2e/relationship-vocabulary.spec.ts`, `e2e/a2-css-checks.spec.ts`, `e2e/visual-fitment.spec.ts`, `e2e/design-details-public.spec.ts` and `e2e/marketplace.spec.ts`. Missing automation is listed in the [audit record](../design/UX_AUDIT_2026-11-08.md#automation-candidates); it is not implemented by this amendment.

## 6. Open decisions and known deviations

### Design audit 2026-11-08

Recommend retaining the 1200px directory switch and requiring its existing 360px list (A-02/T-02). UXA-11 must reconcile Today's 768px dock/300px list before applying a new 900px drill-in or wider minimum; this amendment does not override §2.15. Keep D75's desktop Journey map and phone list; recommend considering last-used view only through UXA-10 (A-06). Keep the five profession links (M-05), with non-links plain. Keep the waitlist close while invite-only. For P-10, recommend retaining ordinary-height phone navigation (§2.6); UXA-17's compact SaveBar landed at 338ae42 / ef7a02c, but hiding navigation was not approved. §2.26 is only the short-height exception. UXC-01 job_1d216b599b31 has not landed a wide-screen rule; §2.28 is explicitly proposed.

Open or partially resolved finding IDs and owners (details and landed evidence: [DRIFT_BASELINE](../standards-audit-2026-09-28/DRIFT_BASELINE.md#design-audit-2026-11-08)):

- A-01, P-01 — UXA-02 (job_0b1956750ccb).
- A-02, T-01, T-02 — UXA-11 (job_ff793332fb37).
- A-06 — UXA-10 (job_41d265c99e41).
- A-07 — UXA-09 (job_7e372db56d61).
- A-10 — UXA-15 (job_2650d19a1f23).
- A-12 — UXB-04 (job_a5a8516f1138).
- M-01, P-04 — UXA-06 (job_e5a211855a70).
- M-05 — UXA-13 (job_34a695b3105f).
- M-08 — UXB-01 (job_fe7761baec35).
- P-08, P-09 — UXB-07 (job_ca566cea09be).
- P-10 — UXA-17 (job_36fb00a64b10).
- V-01, V-02, V-04 — UXC-01 (job_1d216b599b31).
- V-03, V-09 — UXC-02 (job_1412bc339852).
- V-05 — UXC-03 (job_04680345bf95).
- V-06 — UXC-04 (job_7d38cfe7c13b).

Where the shipped layout differs from the export without a recorded reason, the export is the default after an in-context comparison (JITM-06 §2.33, D24):
- **Context column:** Today (from 1600px) and Calendar (from 1700px) use 280px (`src/styles/design-workspaces.css:121`, `src/styles/design-details.css:159`); the export uses 340px, and a 440px Calendar agenda where the code has 400px (`screens/DesktopToday.html:21`, `DesktopCalendar.html:21`).
- **Quick Add bubble:** it renders 56×52 with 16px corners, because a legacy `min-height: 52px` wins (`src/styles/base.css:286`, `src/styles/design-workspaces.css:141`). The export draws 58×48 with 18px corners, lifted 18px (`screens/Main.html:21`).
- **Sheet shadow:** `--shadow-sheet` is 12% light and 40% dark (`src/styles/design-tokens.css:64,112`); the export uses 20% and 38% (`screens/Review.html:21`, `DarkReview.html:22`).
- **Docked review width (open since 2026-09-24):** the composer has no maximum; the export caps the review at 680px (`screens/DesktopToday.html:21`).
- **Portrait tablets (open since 2026-09-24):** from 768 to 900px a sticky 64px app header shows (`src/styles/auth.css:67-69`); the export has none (`screens/TabletToday.html:21`).

Known deviations:
- 126 of 195 width breakpoints in the CSS use values outside the shared set, and `max-width: 1100px` and `1200px` overlap the matching `min-width` rules at the boundary (drift baseline metric 12).
- Preserving the desktop three-pane structure is part of the standing default in JITM-01 §2.24 (D20).

Built: §2.20's opening at 100% from 768px and in the list view on phones (D75, PR #143).

Built: §2.19's tabs and pane heading (D95) and §2.20's person (D96, D117), in PR #150, `prod-2026-10-13-4d5c307`. Built (M4-S3): JRN-02 now reveals the chosen person's first Mix when the phone returns from Details to Mixes, including repeated visits; background refreshes preserve panning.

Built (D121, B-21, M4-S3): Journey marks active personal Mix starts and the Mixes in the person's non-canceled Journey runs. Follow-up-only rows do not add marks. Recorded transitions emphasize the real path only when their saved endpoints match the displayed connection; shared membership never implies a transition. See `src/lib/journey-person-focus.ts`, `tests/journey-person-focus.integration.test.ts` and `e2e/journey-person-focus.spec.ts`.

Open for Kevin: which of a person's other Mixes Journey marks. JRN-03 asked about Mix starts and follow-ups; the recommendation Kevin accepted named Mix starts (D121). JITM-09 §2.32 counts more as a person's Mixes: the Mixes their tags run, every Mix they are stopped in and any Mix with a Beat still to come.

Decided, not built (UX audit 2026-10-08, `docs/UX_DESIGN_AUDIT_2026-10-08.md`), at f23db11:
- The Calendar agenda lists every follow-up as its own row, so on a busy day the first appointment is about 1,950px down (LEN-04), against §2.21 (D74).
- The Settings hub is one ungrouped list, 1,510px long on a phone (LEN-07), against §2.22 (D81).

Decided, not built (D130): the section ring (§2.33). At b9bfd1d6 no gesture moves between sections; JITM-NAV-03 (job_c2f027c489dc) builds section swipe.

Question for Kevin:
- **Printing:** no print stylesheet exists. Is printing Today or a profile a supported workflow?

## 7. Changelog

- 2.1.0 — 2026-11-03 — Base c9a90405. §2.6 allows a second phone-navigation row only when enlarged whole-word labels cannot fit, preserving destination order and targets; normal text retains five equal columns and the central Quick Add (D128).
- 1.0.0 — 2026-09-28 — Initial version.
- 1.0.1 — 2026-09-28 — Base 61d4df4. §6 updated for D20 and D24.
- 1.1.0 — 2026-10-08 — Base f23db11. §2.20 Journey opens at 100% from 768px and in the list view on phones (D75); §2.21 the Calendar agenda leads with appointments (D74); §2.22 Settings groups its rows (D81). §6 lists the three as decided, not built.
- 1.2.0 — 2026-10-12 — Base 4e78545. §2.19: the pane tabs below 1200px read People / Mixes / Details (D95). §2.20: with a person chosen, Journey goes to their work (D96); the phone list's scroll to the first of their Mixes is proposed. §6: D75 is built; D95 and D96 are decided and not yet built.
- 2.0.0 — 2026-10-13 — Base 4d5c307. Major, because §2.20 changes meaning: with a person chosen, Journey also marks the Mixes of their Mix starts, not only those their Journey work is in (D121, not built). §2.20: the phone list's scroll is Kevin's (D117). §6: D95 and D96 are built (PR #150), with JRN-02's gap; which of a person's other Mixes Journey marks is open.

- 2.1.1 — 2026-11-06 — Base 682b8ac7. §6 records D121/B-21 and JRN-02 built in M4-S3; D75 and the open follow-up-membership decision remain unchanged.

- 3.0.0 — 2026-11-09 — Base ef7a02c7b86d29d9c3ed5cab4928758166e24740. Add §2.27–§2.32 and required archetype kits; tighten boundary/adjacency checks. Major because the default workspace cap/centering, public-header collapse and short-height chrome change meaning; existing Journey and directory-switch owner choices remain. §5 is the full size matrix, including fractional widths and sideways phones.
- 3.1.0 — 2026-11-11 — Base b9bfd1d64674f4a70a017b058fe7ceb1ba42ba39. New §2.33: the section ring for section swipe (Today, Contacts, Mixes, More; no wrap), from Kevin's 2026-11-08 approval of the native navigation spec ("Approve the swipe spec, go with section swipe", D130).
