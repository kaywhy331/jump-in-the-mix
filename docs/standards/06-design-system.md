---
id: JITM-06
title: Design system
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [ui, styles, components, icons, themes, app, public-pages, staff]
supersedes: [docs/design/DESIGN_GUIDELINES.md]
sources:
  - docs/design/jump-in-the-mix-designs/README.txt
  - docs/design/jump-in-the-mix-designs/tokens.css
  - docs/design/jump-in-the-mix-designs/screens/ThemeTokens.html
  - docs/design/DESIGN_GUIDELINES.md
  - docs/design/DESIGN_CONSISTENCY_2026-09-23.md
  - docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md
  - docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md
  - docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md
  - docs/audit-2026-09-24/design-a11y-responsive.md
  - docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - src/styles/design-tokens.css
  - src/styles/index.css
  - src/components/AppIcon.tsx
  - src/components/Appearance.tsx
related_skills: [jitm-ui-change, jitm-review, jitm-audit]
related_workflows: [WF-02, WF-05, WF-07]
---

# JITM-06 — Design system

> The visual language of Jump in the Mix: what the design export governs, and the tokens, color, type, shape, icons, themes, shared components and stylesheet order that build every screen.

## 1. Purpose and scope

This standard applies to every screen: the signed-in app, public pages, sign-in and onboarding, and staff screens. It says how things look and which shared pieces build them.

Neighboring topics have their own homes:
- Brand meaning (name, logo, violet as the brand color, the speech-bubble motif): JITM-03 §2.
- Words on screen: JITM-04 §2 and JITM-05 §2.
- Page structure, breakpoints, navigation layout and density: JITM-07.
- Behavior of popups, disclosures, forms and confirmations: JITM-08.
- Minimum text size, contrast, targets and focus: JITM-10.

## 2. Rules

### Design authority

**2.1** The [design export](../design/jump-in-the-mix-designs/index.html) governs visual composition wherever the standards are silent: hierarchy, proportions, spacing, type roles, surfaces and component anatomy. Before changing a page, open its screens in light and dark at every device size they exist in. [OWNER 2026-09-28 D3] [OWNER 2026-09-28 D4] [SOURCE docs/design/DESIGN_GUIDELINES.md:3]

**2.2** Journey is the exception. The export's stage-circle Journey screens and their dark versions are history. Journey follows the account's Mix and Beat graph (JITM-07 §2.19, JITM-09 §2) and still uses the export's tokens, type and components. [OWNER 2026-09-28 D4]

**2.3** The export is reference material. Agents MUST NOT edit or regenerate its HTML, tokens or canvas files. A deliberate difference from it is recorded here, as a rule or in §6. [SOURCE docs/design/DESIGN_GUIDELINES.md:3]

**2.4** Mockup content is sample data. Fixed widths (390, 834, 1194, 1920), names, counts, dates and messages MUST NOT become product requirements or data. Real records, the real logo and current behavior come first. A mockup control with no matching product behavior needs Kevin's decision, not a look-alike control. [SOURCE docs/design/jump-in-the-mix-designs/README.txt:14-16] [SOURCE docs/design/DESIGN_GUIDELINES.md:38]

**2.5** Accessibility wins over the export. Where the export falls below JITM-10, the shipped accessible treatment is the standard, and agents MUST NOT restore the export value:
- input outlines use `--field-border`, not `--border` (JITM-10 §2.5);
- the focus ring follows JITM-10 §2.10, not the export's 2px ring;
- the active phone tab keeps its non-color cue (JITM-10 §2.7);
- targets meet JITM-10 §2.1;
- unrelated Journey connections use a 3:1 stroke, not faint opacity (JITM-10 §2.5).

[SHIPPED 9439fd6 src/styles/design-tokens.css:11] [SHIPPED 9439fd6 src/styles/base.css:67] [SHIPPED 9439fd6 src/styles/design-workspaces.css:137-140] [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:196-197]

**2.6** A page with no mockup uses the same tokens, type and components, and one of the archetypes in JITM-07 §2.10. Build the real structure (panes, editors, context), not a theme over old markup. [SOURCE docs/design/DESIGN_GUIDELINES.md:38,40] [SOURCE docs/design/DESIGN_GAP_ANALYSIS_2026-09-19.md:124]

### Tokens and color

**2.7** Colors MUST come from the semantic tokens in `src/styles/design-tokens.css` (§3). Stylesheets, CSS modules and components MUST NOT add hex, `rgb()` or system-color literals, or styles that work in one theme only. A new color is a new token with a value for each theme. Email HTML, which cannot use CSS variables, is outside this rule. [SOURCE docs/design/DESIGN_GUIDELINES.md:13] [SHIPPED 9439fd6 src/styles/design-tokens.css:4-153]

**2.8** The export's 25 light and 18 dark token values are reproduced exactly. Changing one needs Kevin's decision through WF-08. The shipped extensions in §3 are part of the palette. [SOURCE docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md:242] [SHIPPED 9439fd6 src/styles/design-tokens.css:4-31]

**2.9** The four surfaces stay distinct: `--page` (canvas), `--surface` (rail, fields, search, drafts, group bands), `--raised` (sheets, popups, buttons) and `--selected` (the selected segment). [SOURCE docs/design/jump-in-the-mix-designs/screens/ThemeTokens.html:21 (surface swatches)] [SOURCE docs/design/DESIGN_GUIDELINES.md:15]

**2.10** Each violet token has one role:
- `--violet`: fills (primary buttons, Quick Add, the chosen date) with `--on-violet` text, identical in both themes;
- `--violet-text`: violet text and icons;
- `--violet-mark`: marks (focus ring, active icons, dots, timeline points);
- `--violet-wash`: quiet selection and the owner's drafts;
- `--violet-ink`: text on `--violet-wash`.

Which fills may carry white text: JITM-10 §2.6. [SOURCE docs/design/DESIGN_GUIDELINES.md:15] [SHIPPED 9439fd6 src/styles/design-system.css:14-16]

**2.11** Status colors describe status, never who is speaking. `--late` marks overdue and error states. Notices use the success, warning and danger triples (background, ink, border). Color always comes with a word or an icon (JITM-10 §2.7). [SOURCE docs/design/DESIGN_GUIDELINES.md:39] [SHIPPED 9439fd6 src/styles/design-system.css:55-59]

**2.12** Hairline separators use `--line`. `--border` and `--field-border` outline controls, and `--track` draws rhythm and timeline lines. [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:22] [SHIPPED 9439fd6 src/styles/design-system.css:9,12] [SHIPPED 9439fd6 src/styles/design-workspaces.css:268] [SHIPPED 9439fd6 src/styles/design-details.css:82]

### Typography

**2.13** Instrument Sans (`--font-ui`) sets all interface text. Newsreader (`--font-voice`) sets a person's own words: message drafts and previews, notes, Quick Add capture, Beat wording and support message bodies. Names, labels, rows and directory entries stay in Instrument Sans. The homepage's own-voice heading is the one display use of Newsreader, as in the export. [SOURCE docs/design/DESIGN_GUIDELINES.md:14,30,39] [SHIPPED 9439fd6 src/styles/design-system.css:3-5,65,140] [SHIPPED 9439fd6 src/styles/design-public.css:41]

**2.14** Both families are self-hosted from `src/app/fonts` through `next/font/local`, with their OFL licenses. Only Instrument Sans 400, 500, 600 and 700 and Newsreader 400 exist. Styles MUST NOT use other weights, bold or italic Newsreader, or fonts from a CDN. [SHIPPED 9439fd6 src/app/layout.tsx:15-21] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:9]

**2.15** Weights follow roles: 700 for page, pane and popup titles; 600 for names, labels, buttons and section labels; 500 for quieter navigation and rows; 400 for body text and all Newsreader text. [SOURCE docs/design/jump-in-the-mix-designs/screens/Main.html:21 (Today title, rows and group headers)] [SHIPPED 9439fd6 src/styles/popups.css:6-9]

**2.16** Sizes follow the export's type roles in §3. Voice text grows with its pane, from the 15px list preview to the 22px desktop draft. Section labels use sentence case, never capitals. Minimum sizes are in JITM-10 §2.2. [SOURCE docs/design/jump-in-the-mix-designs/screens/DesktopToday.html:21 (list previews and draft)] [SHIPPED 9439fd6 src/styles/design-workspaces.css:232-233]

**2.17** The wordmark is the name in Instrument Sans 700 with slight negative tracking, sized as in the export: 15px in the rail, 18px in the desktop public header, 17px in the phone public header and 16px in the footer. The mark beside it is 30px in the rail and 32px on public pages. The logo itself is JITM-03 §2. [SOURCE docs/design/jump-in-the-mix-designs/screens/DesktopToday.html:21 (rail wordmark)] [SOURCE docs/design/jump-in-the-mix-designs/screens/Landing.html:21 (header and footer wordmarks)] [SOURCE docs/design/jump-in-the-mix-designs/screens/LandingPhone.html:21 (header wordmark)] [SHIPPED 9439fd6 src/styles/design-workspaces.css:5-6] [SHIPPED 9439fd6 src/styles/design-public.css:6]

### Shape and elevation

**2.18** Radii come from tokens: 12px controls (`--radius-control`), 24px sheets (`--radius-sheet`), 20px conversation bubbles (`--radius-bubble`) and 16px cards (`--radius`). Pills and avatars are fully round. [SHIPPED 9439fd6 src/styles/design-tokens.css:34-36,69] [SOURCE docs/design/DESIGN_GUIDELINES.md:16]

**2.19** Rows, lists, panes and cards are flat and separated by `--line` hairlines. Shadows belong to overlays (sheets, popups, dialogs, confirmations, fixed panels) and to the small raised cue on an active rail item or selected segment. Modal backdrops use `--scrim` with a 3px blur. `--shadow-sheet` is the sheet elevation. [SOURCE docs/design/DESIGN_GUIDELINES.md:16] [SHIPPED 9439fd6 src/styles/popups.css:4] [SHIPPED 9439fd6 src/styles/design-workspaces.css:10,247]

**2.20** Speech bubbles are built from the shared `.speech-bubble` classes: `--radius-bubble` corners and a tail drawn from the bubble's `--bubble-fill`. A new bubble reuses those classes instead of drawing its own tail. A field written inside a bubble, such as the Today draft, is transparent, so the bubble reads as one surface. What is a bubble, where tails point and the fill rule are JITM-03 §2. [SOURCE docs/design/DESIGN_GUIDELINES.md:25] [SHIPPED 9439fd6 src/styles/design-system.css:60-63] [SHIPPED 9439fd6 src/styles/conversation.css:7-37]

### Icons

**2.21** Icons MUST come from `AppIcon`: inline Lucide geometry on a 24-unit grid, stroke 1.75, hidden from assistive technology. Do not add an icon package, draw a UI icon as raw SVG, or use text glyphs (›, →, ⋯, +/−) as icons. Add a missing glyph to `AppIcon` instead. [SHIPPED 9439fd6 src/components/AppIcon.tsx:3-5,83-85] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:17,20]

**2.22** Every icon MUST have explicit dimensions, from a CSS rule for its context or from `width` and `height`. Icons inside buttons default to 18px. The export's sizes by role: 24px tab icons, 22px header actions, 20px rail, list and tool rows, 18px in buttons, 16px chevrons. Check icon size in screenshots; overflow scans miss an icon that grows. [SOURCE docs/design/DESIGN_GUIDELINES.md:17] [SHIPPED 9439fd6 src/styles/phone-icons.css:4] [SOURCE docs/design/jump-in-the-mix-designs/screens/Main.html:21 (tab bar and header icons)]

**2.23** Destination icons are fixed: Today a house, Contacts people, Mixes the shuffle, Journey the route, Calendar a calendar, More an ellipsis, plus Settings, Help and My account. The person-plus icon means only "add a contact". A row that leads to a destination uses that destination's icon. [OWNER 2026-09-22 docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:7,10] [SHIPPED 9439fd6 src/components/Nav.tsx:10-21] [SOURCE docs/design/DESIGN_GUIDELINES.md:53]

**2.24** On phones, primary actions keep a visible label beside their icon. Only secondary row actions may be icon-only, and they need an accessible name (JITM-10 §2.14). [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md:155]

### Themes

**2.25** Every screen supports System, Light and Dark. Light is the `:root` default. Dark applies through `@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])` and through `:root[data-theme="dark"]`. The two dark blocks MUST stay identical, and a token that differs by theme is declared in both. [SHIPPED 9439fd6 src/styles/design-tokens.css:4,75-76,116] [SOURCE docs/design/jump-in-the-mix-designs/tokens.css:1]

**2.26** The appearance choice stays in the browser. It is stored under `jitm-appearance`, applied before first paint by the root layout's inline script with the request's CSP nonce, and synced across tabs by `AppearanceSync`. There is no account-level theme. When storage is blocked, the choice applies to the current visit and the control says so. [OWNER 2026-09-28 D12] [SHIPPED 9439fd6 src/app/layout.tsx:46-48] [SHIPPED 9439fd6 src/components/Appearance.tsx:8,13-26,71,89]

**2.27** The control is the sun and moon switch in `AppearanceControl`: a switch named "Dark mode" that follows the device until the person chooses, with "Match my device" to return to System. Its compact form sits in the rail, on More and in the public header. Do not bring back a three-option menu. [OWNER 2026-09-27 docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:3,15-19] [SHIPPED 9439fd6 src/components/Appearance.tsx:81,88] [SHIPPED 9439fd6 src/components/AppShell.tsx:55] [SHIPPED 9439fd6 src/components/PublicHeader.tsx:28]

### Components

**2.28** Build with the shared components and stylesheets in §3, and match the export anatomy summarized there. Extend a shared component rather than copying it into a page. A new shared pattern goes into the shared layer and into §3 through WF-08. [SOURCE docs/design/CONTACTS_FORENSIC_AUDIT_2026-09-19.md:74] [PROPOSED]

### CSS architecture

**2.29** `src/app/layout.tsx` imports one stack, `src/styles/index.css`, and its order is part of the design:
1. the legacy partials and `mobile-clarity.css`;
2. the design layer: `design-tokens`, `design-system`, `design-workspaces`, `design-public`, `contacts-workspace`, `design-details`;
3. feature layers such as `mix-library`, `mega-mixes` and `phone-icons`;
4. the consistency layers `disclosures` and `popups`, after every feature layer.

[SHIPPED 9439fd6 src/styles/index.css:1-37] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:7,34]

**2.30** New styles go where they belong:
- tokens only in `design-tokens.css`;
- shared controls and patterns in the design-layer file that owns them;
- styles for one component in a CSS module beside it, such as `WorkflowJourney.module.css`;
- no new legacy partials, page-specific colors or static inline `style` values (data-driven geometry is fine).

[SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:1] [PROPOSED]

**2.31** Each component has one clear style owner. Fix the owning rule instead of stacking a later, more specific override. Shared defaults use zero-specificity `:where()` selectors so deliberate page rules still apply. [SOURCE docs/design/CONTACTS_FORENSIC_AUDIT_2026-09-19.md:74] [SHIPPED 9439fd6 src/styles/disclosures.css:9-10] [SHIPPED 9439fd6 src/styles/phone-icons.css:1-4]

**2.32** The design layer has no spacing, type, z-index or motion scale yet; those exist only in legacy `base.css`. Take such values from the matching export screen and reuse values already in the file. Do not add a new scale without WF-08. [SHIPPED 9439fd6 src/styles/base.css:24-42] [PROPOSED]

## 3. Canonical implementations

**Tokens** (`src/styles/design-tokens.css`; export values in `docs/design/jump-in-the-mix-designs/tokens.css`):

| Group | Tokens | Origin |
|---|---|---|
| Surfaces | `--page`, `--surface`, `--raised`, `--selected` | Export |
| Lines | `--line`, `--border`, `--track`; `--field-border` (inputs, ≥3:1) | Export; shipped |
| Text | `--text`, `--text-2`, `--text-3`, `--on-violet`, `--toast`, `--toast-text` | Export |
| Violet | `--violet`, `--violet-text`, `--violet-mark`, `--violet-ink`, `--violet-wash` | Export |
| Status | `--late`, `--quiet`; `--status-{success,warning,danger}-{bg,ink}`, `--{success,warning,danger}-border` | Export; shipped |
| Waitlist band | `--band`, `--band-text`, `--band-text-2`, `--band-late`, `--band-success` | Shipped |
| Overlays | `--scrim`, `--shadow`, `--shadow-sheet`, `--shadow-sm`, `--shadow-md` | Shipped |
| Shape and type | `--radius-control`, `--radius-sheet`, `--radius-bubble`, `--radius`; `--font-ui`, `--font-voice` | Export; `--radius` shipped |
| Legacy aliases | `--ink`, `--muted`, `--brand`, `--on-brand`, `--brand-dark`, `--brand-soft`, `--focus`, `--danger` and others | Map onto export tokens; new code prefers the export names |

**Type roles from the export** (size/line-height/weight in px):

| Role | Phone | Tablet and desktop |
|---|---|---|
| Page title | 30/36/700 | 26/32/700 (list pane) |
| Detail title | 24/30/700 | 26/32 (Today), 28/34 (editors) |
| Popup and sheet title | 18/24/700 | 18/24/700 |
| Row name / meta / section label | 16/22/600 · 13/18/600 · 13/16/600 | Same; compact rows 15/20/600 |
| Tab label | 11/14/600 (export; shipped 12/500, open: §6) | — |
| Voice (Newsreader 400) | Preview 15/21 · draft 18/28 · Quick Add 19/28 | Draft 22/35 · Quick Add 24/36 |

Sources: `screens/Main.html`, `Review.html`, `QuickAdd.html`, `DesktopToday.html`, `DesktopMixes.html`, `DesktopQuickAdd.html` (line 21 of each).

Shared overlays and disclosures (O2; `src/styles/popups.css`, `src/styles/disclosures.css`): popup supporting text is 14px in `--text-2`; a disclosure summary is 14/600 with a trailing 16px chevron. Their behavior is JITM-08 §2.10 and JITM-08 §2.19.

**Stylesheets** (`src/styles/`): `design-tokens.css` (tokens) · `design-system.css` (controls, fields, notices, bubbles, dialogs, appearance switch, back link) · `design-workspaces.css` (frame, page widths, Today, Calendar, confirmations) · `design-public.css` (public pages) · `contacts-workspace.css` · `design-details.css` (pane refinements, short screens) · `mix-library.css`, `mega-mixes.css` · `phone-icons.css` (icon defaults, phone targets) · `disclosures.css` · `popups.css` · `invitations.css`. CSS modules in `src/components/*.module.css`, such as `WorkflowJourney.module.css`.

**Shared components** (`src/components/`):

| Purpose | Components |
|---|---|
| Frame and navigation | `AppShell`, `Nav` / `AccountNav`, `BackLink`, `ContactsBackLink`, `MixLibraryNav`, `MixLibraryShell`, `TodayNavigation`, `Logo` |
| Overlays | `Sheet`, `ConfirmDialog`, `useConfirmDialog`, `ReviewDialog`, `QuickAdd`, `BrandTermsHelp` |
| Forms | `ActionForm`, `FormGuard`, `FormSubmitButton`, `RequiredFieldsNote`, `PasswordInput`, `TimezonePicker`, `WhenPicker`, `CopyField` |
| Feedback | `Notice`, `UrlErrorNotice`, `EmptyState`, `PreparationNotice`, `ViewOnlySupportNotice` |
| Content | `AppIcon`, `AppearanceControl` / `AppearanceSync`, `MergeFieldText`, `MixBeatPreview`, `PortableOutline`, `SchedulePreview` |
| Public | `PublicLanding`, `PublicHeader`, `PublicFooter`, `PublicArticle`, `PublicDocument` |

Export anatomy to match: flat rows with an inset hairline and a 40px initials avatar; segmented controls on `--surface` with a raised selected segment; 44px round icon buttons and close controls; primary buttons in `--violet`, bordered secondary buttons on `--raised`; 52×32 switches; 44px search fields on `--surface`; Beat tracks on `--track`; merge fields as wash chips inside Newsreader text.

## 4. Do / Don't

- **Do** add a token with light and dark values when no token fits, then use it by name.
- **Do** pair `--late` with words, as Today's "2 days overdue" label does, never a red dot alone.
- **Do** size a new icon with a rule scoped to its container, and check it in a screenshot.
- **Don't** mix a system color into a surface, as the completion card does with `Canvas` (§6).
- **Don't** write `font-weight: 750`. It renders as 700 and hides the real role.
- **Don't** rotate `arrowLeft` to mean "next". Add the glyph to `AppIcon`.
- **Don't** set a contact's name in Newsreader. Names are interface text.
- **Don't** fix a cascade conflict by appending a more specific selector to a later file.

## 5. Verification

- Compare the export tokens with `design-tokens.css`: the 25 light and 18 dark values match, and the two dark blocks are identical (`diff <(sed -n 77,112p src/styles/design-tokens.css) <(sed -n 117,152p src/styles/design-tokens.css)` prints nothing).
- Re-run the drift metrics for color literals, font families and icon sizing in `docs/standards-audit-2026-09-28/`; the counts should not rise.
- Browser suites: `e2e/design-adoption.spec.ts` (appearance switch), `e2e/design-consistency.spec.ts` (disclosures, confirmations), `e2e/a2-css-checks.spec.ts` (row sizes, waitlist band in both themes). The pixel baseline in `e2e/visual-fitment.spec.ts` covers legacy CSS only.
- Screenshots in light and dark against the export screens, following JITM-12 §2, inspected by eye.

## 6. Open decisions and known deviations

- **`--accent`** has no dark value and no users (`src/styles/design-tokens.css:49`). Remove it or define it?
- **Export colors without tokens:** Beat dots (`#9A99AE`, `#B4B3C4`), the toast Undo (`#CFC9FF`), the selected track (`#CFCBFA`) and the landing's muted headline (`#8988A0`) (`screens/Main.html:21`, `TodaySent.html:21`, `Landing.html:21`). Tokenize them when those parts are built?
- **Chip selection:** filter chips invert to `--text` (`screens/Journey.html:21`); choice chips use the wash (`screens/DesktopCalendar.html:21`); shipped Marketplace chips use the wash (`src/styles/mega-mixes.css:50`). Which one is standard?
- **Confirmation look (open since 2026-09-24):** the completion card uses `Canvas` (`src/components/JumpWorkflow.module.css:15`), not the export's dark toast bubble (`screens/TodaySent.html:21`). The Quick Add capture uses `--surface` without a tail (`src/styles/design-system.css:126`), not the wash with a tail (`screens/QuickAdd.html:21`). The desktop Quick Add button has 12px corners (`src/styles/design-workspaces.css:7`), not 14/14/14/4 (`screens/DesktopToday.html:21`).
- **Type:** headings use 600 (`src/styles/design-system.css:6`), not 700; the phone page title is 28px (`src/styles/design-workspaces.css:152`), not 30px; landing headings run a step below the export (`src/styles/homepage.css:28,93`, open since 2026-09-24). The empty Today review heading uses Newsreader for app wording (`src/styles/design-workspaces.css:89`). The wordmark ships at 600 (`src/styles/design-system.css:6`), at 16px in the desktop public header (`src/styles/design-public.css:5`) and at 13px with a 26px mark in the phone public header (`src/styles/design-details.css:199-201`); the tablet app header shows the 42px base mark (`src/styles/base.css:86`). 107 `font-weight` declarations, mostly in legacy stylesheets, fall outside 400–700.
- **Tab labels:** 12px at 500, 700 when active (`src/styles/design-workspaces.css:134,140`); the export uses 11/14/600. The heavier active label is part of the non-color cue (§2.5, JITM-10 §2.7). Which size and weight is standard?
- **Staff corners** of 6–10px were never decided (`docs/design/DESIGN_CONSISTENCY_2026-09-23.md:65`).
- **Legacy CSS:** `base.css:2-50` keeps a second palette and the only spacing, type, z-index and motion scales; its `prefers-contrast` overrides (`:75`) are shadowed by `design-tokens.css`. Five dialog backdrops still carry literals that `popups.css:4` overrides. `invitations.css` loads after the consistency layers (`src/styles/index.css:38`).
- **Literals:** 53 color literals in CSS outside the tokens and 11 in UI code, including a `#dfe4ee` tag-dot fallback in five components (drift baseline metrics 1–2).
- **Icons:** `AppIcon` has no size prop; all 290 uses rely on CSS. `WhenPicker.tsx:42-43` draws its own chevrons; three pagers rotate `arrowLeft` (`src/app/(app)/mixes/page.tsx:74` and two others); the profession directory uses a "›" glyph (`src/styles/design-public.css:48`).
- **Journey visuals** live only in code: incoming lines use `--status-success-ink`, outgoing `--violet-mark`, selected lines 4px (`src/components/WorkflowJourney.module.css:192-197`). The module uses `--border` for many separators, against §2.12.

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
