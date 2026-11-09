---
name: jitm-ui-change
description: Jump in the Mix UI work done to the house standard — design export, semantic tokens, shared components, breakpoints, both themes, keyboard and zoom checks, screenshot comparison. Use when adding or changing any page, component, style, layout, responsive behavior, theme, icon, sheet, dialog, disclosure or navigation in this repository (src/app, src/components, src/styles), including pages that have no mockup.
---

# Jump in the Mix — UI change

Follow **WF-02** (`docs/standards/workflows/WF-02-ui-change.md`). The rules live in these standards:
- JITM-06: design system;
- JITM-07: layout and responsive structure;
- JITM-08: interaction patterns;
- JITM-09: navigation and workflows;
- JITM-10: accessibility and quality bar;
- JITM-03: logo and bubble motif;
- JITM-05: vocabulary;
- JITM-12: verification.

If words change too, also load `jitm-copy`. If behavior changes, also load `jitm-feature`.

## Checklist

1. **Intake** (WF-01).
   - Work in a task worktree created from `origin/main`.
   - List the rules you will apply.
2. **Find the reference.**
   - Open `docs/design/jump-in-the-mix-designs/index.html` at its available sizes in both themes; verification uses the full JITM-07 §5 matrix.
   - Choose the required page-archetype kit in JITM-07 §2.32, also when no export screen exists.
   - Before you copy a neighbouring page, check `docs/standards-audit-2026-09-28/DRIFT_BASELINE.md`.
   - Journey follows the shipped graph, not the export's stage map (JITM-06 §2.2).
   - **Gate:** name the screens or the archetype you follow.
3. **Reuse before you build.**
   - Tokens: `src/styles/design-tokens.css`.
   - Components: see the inventory in JITM-06 §3.
   - Patterns for sheets, confirmations, disclosures and forms: JITM-08 §2.
4. **Implement.**
   - Use semantic tokens only; add no page-specific colors.
   - Draw icons through `AppIcon`, with dimensions set in CSS.
   - Keep one responsive DOM.
   - Use Instrument Sans for interface text and Newsreader for a person's own words.
5. **Verify** (JITM-12 §2, JITM-07 §5, JITM-10 §2).
   - Run tier 1 and the UI tier-2 row (JITM-12 §2.9–§2.10); compare failures with the baseline (JITM-12 §2.14).
   - Capture screenshots per JITM-12 §2.18. Inspect them and compare them with the export.
   - Run the full applicable JITM-07 §5 matrix: both sides of every layout boundary, fractional width, sideways phones/short heights, narrow through ultrawide; record any omitted row.
   - Run JITM-12 §2.26's states pass: validation, empty, filtered-empty, loading, error/recovery, offline, not-found, signed-in/out. Explain inapplicable states.
   - Run its touch pass: hover gating, shortcut hints, phone input size and sheet focus/keyboard; check title/H1, skip link and focus after navigation.
   - Check keyboard use and visible focus, 44×44px targets, 200% text, and contrast in both themes.
6. **Report.**
   - Fill in the PR template.
   - Label each check VERIFIED, INFERRED, NOT RUN or BLOCKED (JITM-12 §2.1).
   - List any assumption, and propose a rule through WF-08 when you introduce a new pattern.

## Must-know rules

- Where the standards are silent, the export governs visual composition. Accessibility deviations from the export are intended: field borders, the stronger focus ring, the active-tab pill and 44px targets (JITM-06 §2).
- Mockup names, numbers and messages are sample data. Never copy them into the product (JITM-06 §2).
- Breakpoints, rails, the phone bottom navigation with the central Quick Add, and page maximum widths are fixed in JITM-07 §2.
- Confirmations use `ConfirmDialog` or `useConfirmDialog`: Cancel first, with initial focus on Cancel. Never add `window.confirm` (JITM-08 §2).
- Sheets and popups follow the shared pattern in JITM-08 §2: one heading, a 44px close control, bounded to the viewport, a bottom sheet on phones, the scrim, the shared disclosure style.
- Meaningful text MUST be at least 13px and targets at least 44×44px on every owner screen, Calendar and Journey included (exceptions: JITM-10 §2.1–§2.2); the automated floor check covers owner routes (JITM-10 §2.21). Focus is visible and never hidden behind persistent bars (JITM-10 §2).
- Preserve the current UI structure unless the task fixes a specific workflow gap or Kevin asks for a redesign (JITM-01 §2).
- Theme choice (System, Light or Dark) stays in the browser (JITM-06 §2).

## Where to look

- The design export: `docs/design/jump-in-the-mix-designs/` (`index.html`, `tokens.css`, `screens/`).
- Stylesheet order: `src/styles/index.css`. Tokens: `src/styles/design-tokens.css`. Shared layers: `src/styles/disclosures.css` and `src/styles/popups.css`.
- Components: `src/components/AppIcon.tsx`, `Sheet.tsx`, `ConfirmDialog.tsx`, `useConfirmDialog.tsx`, `BackLink.tsx`, `PublicLanding.tsx`, `Nav.tsx`.
- Tests: `e2e/accessibility.spec.ts`, `e2e/visual-fitment.spec.ts`, `e2e/design-refresh.spec.ts`.
- Known drift, so you don't add more: `docs/standards-audit-2026-09-28/DRIFT_BASELINE.md`.

## Stop and ask Kevin when

- The export conflicts with how the product actually behaves.
- The design needs a capability that doesn't exist.
- A shared component would change in a way that affects other pages.
- You would restructure a screen that Kevin did not ask to redesign.
