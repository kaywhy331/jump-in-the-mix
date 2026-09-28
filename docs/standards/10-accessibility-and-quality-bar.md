---
id: JITM-10
title: Accessibility and quality bar
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [ui, accessibility, performance, app, public-pages, staff, release-qualification]
supersedes: [docs/design/DESIGN_GUIDELINES.md]
sources:
  - docs/CANONICAL_PRODUCT_DECISIONS.md
  - docs/design/DESIGN_GUIDELINES.md
  - docs/design/DESIGN_STRESS_REVIEW_2026-09-20.md
  - docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md
  - docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md
  - docs/JOURNEY_CONNECTION_HANDLES_2026-09-21.md
  - docs/audit-2026-09-24/design-a11y-responsive.md
  - docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/MANUAL_DEVICE_QUALIFICATION.md
  - src/styles/base.css
  - src/styles/phone-icons.css
  - e2e/visual-fitment.spec.ts
  - e2e/a2-css-checks.spec.ts
  - e2e/accessibility.spec.ts
  - .lighthouserc.cjs
related_skills: [jitm-ui-change, jitm-review, jitm-audit, jitm-release]
related_workflows: [WF-02, WF-05, WF-06, WF-07]
---

# JITM-10 — Accessibility and quality bar

> The floor every screen meets: touch targets, text size, contrast, keyboard and focus, zoom and reflow, accessible names, the Journey graph's equivalents, performance budgets and device qualification.

## 1. Purpose and scope

This standard sets the accessibility and quality floor for every screen: the signed-in app, public pages, sign-in and onboarding, and staff screens. The floor applies in both themes and at every width. JITM-00 §2 makes it a principle; this standard makes it measurable.

Neighboring topics have their own homes:
- Tokens, type roles and components: JITM-06.
- Layout, breakpoints and density: JITM-07.
- Dialog, sheet and form behavior: JITM-08.
- How to run the checks and label evidence: JITM-12 §2.

## 2. Rules

### Targets and text

**2.1** Touch targets are at least 44×44 CSS px. At 900px and below, every control on customer screens meets this, with at least 8px between neighbors. Default buttons are 44px tall at every width. Compact 32–36px controls are allowed only on desktop, for secondary actions in dense lists and on staff screens. Staff screens follow JITM-07 §2.14: compact on desktop, 44px rows at 760px and below. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:117] [SHIPPED 9439fd6 src/styles/phone-icons.css:55-75] [SHIPPED 9439fd6 src/styles/design-system.css:12] [OWNER 2026-09-28 D9]

**2.2** Meaningful text is at least 13px. Only three kinds of text may be smaller:
- phone bottom-navigation tab labels, at least 11px (shipped at 12px);
- labels inside compact buttons and compact-rail labels, at least 12px;
- decorative or duplicated text hidden from assistive technology, such as a count badge whose number is in its link's name.

[SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:116] [SHIPPED 9439fd6 e2e/visual-fitment.spec.ts:67-68] [SHIPPED 9439fd6 e2e/a2-css-checks.spec.ts:78-86] [SHIPPED 9439fd6 src/styles/design-workspaces.css:134,417] [SHIPPED 9439fd6 src/components/Nav.tsx:41]

**2.3** Screens MUST work at 200% text size, which is distinct from browser zoom. Nothing clips, overlaps or loses its action. Text containers use minimum heights, not fixed heights. [SOURCE docs/design/DESIGN_GUIDELINES.md:64] [SOURCE docs/design/DESIGN_STRESS_REVIEW_2026-09-20.md:15] [SOURCE docs/audit-2026-09-24/design-a11y-responsive.md:194] [SHIPPED 9439fd6 e2e/sheet-interactions.spec.ts:292-302]

**2.4** Pages MUST NOT scroll sideways at 320px in either theme. Only designated regions scroll sideways, such as the Journey map, date strips and staff tables, and each is keyboard reachable as a named, focusable region. [SHIPPED 9439fd6 e2e/relationship-vocabulary.spec.ts:91-97] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:229] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:92]

### Color and contrast

**2.5** Contrast is measured on the actual surface, in both themes:
- text at least 4.5:1, or 3:1 for large text;
- 3:1 for control outlines, focus rings, meaningful icons and graph lines that act as controls.

Hairlines (`--line`, `--track`, `--border`) are exempt only when they do not identify a control. Input outlines use `--field-border` (3.34:1 or more). [SOURCE docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:147-150] [SHIPPED 9439fd6 src/styles/design-tokens.css:11,83] [SOURCE docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md:242]

**2.6** White text sits only on `--violet` (or its alias `--brand`), which gives 5.55:1 in both themes. Badges and chips MUST NOT put white text on `--violet-mark` or `--late`, whose dark values fall below 4.5:1. The numbered Mix badges are the reference. [SHIPPED 9439fd6 src/components/WorkflowJourney.module.css:229-230] [SHIPPED 9439fd6 src/styles/mega-mixes.css:3,46] [SOURCE docs/audit-2026-09-24/design-a11y-responsive.md:116]

**2.7** Color is never the only signal. Selection, state, direction and status also show text, shape, weight or an icon:
- the active phone tab has a tinted pill and a heavier label;
- selected choices carry a "Selected" label or pressed state;
- Journey directions have a written legend and written lists;
- overdue items say how late they are.

[SHIPPED 9439fd6 src/styles/design-workspaces.css:137-140] [SOURCE docs/design/DESIGN_PANE_POLISH_2026-09-20.md:18] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:227] [SOURCE docs/ONBOARDING_JOURNEY_PREFERENCES_2026-09-22.md:11] [SHIPPED 9439fd6 src/app/(app)/jumps/page.tsx:328]

**2.8** Links inside sentences MUST look like links: a color different from the text around them and an underline. [SOURCE docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md:99,121]

### Keyboard and focus

**2.9** Everything works from a keyboard, in a logical order. A skip link leads to the main content, which can take focus. Only modal dialogs trap focus, and they release it on close. [SHIPPED 9439fd6 src/components/AppShell.tsx:44,94] [SHIPPED 9439fd6 src/components/PublicLanding.tsx:17] [SHIPPED 9439fd6 src/components/ReviewDialog.tsx:31-45]

**2.10** Focus is always visible: a 3px `--focus` outline offset by 3px, 4px `currentColor` under high contrast, and `Highlight` under forced colors. Inside clipped containers the ring is inset. Code MUST NOT remove an outline without a visible replacement. [SHIPPED 9439fd6 src/styles/base.css:67,76,82] [SHIPPED 9439fd6 src/styles/disclosures.css:40]

**2.11** Focus is never hidden behind the bottom navigation, a sticky header or a save bar. Pages keep scroll padding for the bottom navigation at 900px and below, and sheets keep their own. [SHIPPED 9439fd6 src/styles/design-details.css:10,288] [SOURCE docs/design/DESIGN_GUIDELINES.md:58] [SOURCE docs/design/DESIGN_STRESS_REVIEW_2026-09-20.md:16]

**2.12** Focus goes where the work is: a dialog focuses its heading or its safest action (JITM-08 §2.7, JITM-08 §2.12), closing returns focus to the trigger, and a failed save moves focus to its error. Programmatic focus targets use `tabIndex={-1}`. [SHIPPED 9439fd6 src/components/Sheet.tsx:44-47] [SHIPPED 9439fd6 src/components/ActionForm.tsx:22,26]

**2.13** Operating-system preferences are honored: reduced motion turns off transitions, animations and smooth scrolling; high contrast strengthens lines; forced colors keep outlines. [SHIPPED 9439fd6 src/styles/base.css:69-83] [SHIPPED 9439fd6 src/styles/design-system.css:93,112] [SHIPPED 9439fd6 src/styles/disclosures.css:32-34]

### Names and semantics

**2.14** Every control has an accessible name that contains its visible label. Icon-only controls have `aria-label`. Repeated controls name their item, such as "Delete the {tag name} tag". Toggles say what they control, and fields have visible labels, not placeholders only. [SOURCE docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:151-153] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md:155] [SHIPPED 9439fd6 src/components/ContactsBulkWorkspace.tsx:183]

**2.15** Native semantics come first:
- navigation landmarks with names, and `aria-current` on the current destination, including nested pages;
- dialogs labelled by their heading;
- `role="status"` for confirmations and `role="alert"` for errors;
- `aria-pressed` on toggle buttons and segments, `role="switch"` on switches;
- `role="img"` with a label on visual indicators such as Beat dots.

[SHIPPED 9439fd6 src/components/Nav.tsx:26-41] [SHIPPED 9439fd6 src/components/Notice.tsx:1-3] [SHIPPED 9439fd6 src/components/Appearance.tsx:81] [SOURCE docs/design/jump-in-the-mix-designs/screens/Main.html:21 (tab bar and Beat dots)]

### Graph and gestures

**2.16** The Journey map has complete equivalents: a structured list view, a named and focusable map region, a written legend, and written lists of each Mix's connections. Drawing a connection never needs a drag (gestures: JITM-09 §2.56). [OWNER 2026-09-28 D4] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:215,227,229] [SHIPPED 9439fd6 src/components/WorkflowConnections.tsx:97] [SOURCE docs/JOURNEY_CONNECTION_HANDLES_2026-09-21.md:8]

**2.17** No task needs a drag, a hover or a multi-point gesture. Every drag has a single-tap or keyboard alternative. Information shown in a hover tooltip or `title` is also reachable by tap and keyboard. [SOURCE docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md:53] [PROPOSED]

### Performance and qualification

**2.18** Public pages meet the Lighthouse budgets in `.lighthouserc.cjs`: performance 0.90, accessibility 0.95 and best practices 0.90 at least, median largest contentful paint 2.5 s or less, and cumulative layout shift 0.1 or less. Loosening a budget needs Kevin's decision. Which URLs run, and how, is JITM-12 §2. [SHIPPED 9439fd6 .lighthouserc.cjs:29-36]

**2.19** Automated checks (axe, reflow, Lighthouse, emulated devices) are necessary but not sufficient. Physical iPhone Safari and Android Chrome, VoiceOver, TalkBack, real soft keyboards and operating-system text scaling are separate evidence, recorded in `docs/MANUAL_DEVICE_QUALIFICATION.md`. They are required before external launch and are labeled under JITM-12 §2. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:123] [SOURCE docs/MANUAL_DEVICE_QUALIFICATION.md:3,73]

**2.20** A UI change is not done until it has been checked in both themes, by keyboard, at 320px, at 200% text and through its real workflow (§5). [SOURCE docs/design/DESIGN_GUIDELINES.md:64] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:87]

## 3. Canonical implementations

- Accessibility media queries and the focus ring: `src/styles/base.css` (lines 67–83), `src/styles/design-system.css:112`.
- Tokens: `--focus` (the focus ring), `--field-border` (input outlines) in `src/styles/design-tokens.css`.
- The phone 44px target block: `src/styles/phone-icons.css:55-75`. Inset summary focus: `src/styles/disclosures.css:40`.
- Skip links and focus targets: `src/components/AppShell.tsx`, `src/components/PublicLanding.tsx`.
- Live regions: `src/components/Notice.tsx`, the completion confirmation in `src/components/JumpWorkflow.tsx`.
- Journey equivalents: the list view, legend and focusable map in `src/components/WorkflowJourney.tsx`; click-to-connect in `src/components/WorkflowConnections.tsx`.
- Test helpers: `e2e/axe-in-page.ts`, `e2e/theme-fixture.ts`.
- Budgets: `.lighthouserc.cjs`. Device matrix: `docs/MANUAL_DEVICE_QUALIFICATION.md`.

## 4. Do / Don't

- **Do** give each "Delete…" in the tag list its own name, "Delete the {tag name} tag".
- **Do** use `--violet` behind white badge text.
- **Do** make a sideways-scrolling strip a focusable region with a name.
- **Don't** put stage and due time only in a `title` tooltip.
- **Don't** size a label at 11px because it is inside a chip.
- **Don't** set `outline: none` on a focused control without a replacement ring.
- **Don't** call a physical-device row passed because an emulated run passed.

## 5. Verification

- `npm run test:a11y`: axe with the WCAG 2.2 A and AA tags on `/jumps`, `/contacts`, `/contacts/new` and `/mixes/new`. Run axe on the changed routes too, in both themes, with `e2e/theme-fixture.ts`.
- `e2e/visual-fitment.spec.ts`: the text floors on phone routes, the five-control phone bar and no sideways scroll. `e2e/a2-css-checks.spec.ts`: 44px targets, compact-rail labels, waitlist band contrast.
- `e2e/sheet-interactions.spec.ts`: 200% text, focus after failed saves, nested dialogs.
- By hand: Tab through the change in both themes; set text to 200%; check 320px; zoom the browser to 200% and 400%; compute contrast for any new color pair from the token values.
- Lighthouse through `npm run test:lighthouse` against a production build, run as JITM-12 §2 describes.
- Device rows in `docs/MANUAL_DEVICE_QUALIFICATION.md`, by a tester on the named device.

## 6. Open decisions and known deviations

- **Physical devices and assistive technology:** every row in the device matrix is NOT RUN, including VoiceOver, TalkBack, operating-system text at 200% and Firefox zoom (`docs/MANUAL_DEVICE_QUALIFICATION.md:73`; `docs/BETA_READINESS_AUDIT_2026-09-26.md:372`).
- **Journey people rows:** since 2026-09-28, stage, status, reason and due time sit in a `title` tooltip (`src/components/WorkflowPeople.tsx:32`). Touch and keyboard users reach them only by selecting the person. Is that acceptable, or should they return to the row or the details pane? (§2.17)
- **Text floor coverage:** the floor test runs only on phone widths and on 13 routes (`e2e/visual-fitment.spec.ts:176-199`). Journey, Calendar and Marketplace are not covered. Journey still sets 11–12px labels (`src/components/WorkflowJourney.module.css:53-55,227-230`), and the "Recommended" tag inside a button is 11px (`src/styles/phone-icons.css:83`).
- **Contrast:** the active Beat number puts white on `--violet-mark` (`src/components/WorkflowJourney.module.css:228`), 3.80:1 in dark by token computation. Disabled Journey connections draw at 65% opacity (`:4`), measured at 2.63:1 in light on 2026-09-24 (`docs/audit-2026-09-24/design-a11y-responsive.md:264`).
- **Inline links** inherit the text color with no underline (`src/styles/base.css:63`), against §2.8 (open since 2026-09-26).
- **Focus not obscured:** from 768 to 900px the sticky app header has no matching top scroll padding (`src/styles/auth.css:68`), and the contact import action bar sits above the phone scroll padding (`src/styles/contact-import.css:17`).
- **Lighthouse** covers 6 of the 15 indexed public pages and no signed-in page; production's largest contentful paint measured 2.43–2.64 s against the 2.5 s budget on 2026-09-26 (`docs/BETA_READINESS_AUDIT_2026-09-26.md:320-323`).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
