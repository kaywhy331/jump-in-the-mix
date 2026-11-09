---
id: WF-02
title: UI change
status: active
version: 1.1.0
owner: Kevin
last_reviewed: 2026-11-09
standards: [JITM-03, JITM-05, JITM-06, JITM-07, JITM-08, JITM-09, JITM-10, JITM-12]
skills: [jitm-ui-change, jitm-copy]
---

# WF-02 — UI change

**Trigger:** any change to a page, component, style, layout, responsive behavior, theme or icon, including a new page that has no mockup.
**Inputs:** the intake plan (WF-01); the design export at `docs/design/jump-in-the-mix-designs/index.html`; the relevant standards.

## Steps

1. **Find the reference.** Open the export screens for the workspace in light and dark, at every device size they exist in; verification uses the full JITM-07 §5 matrix. JITM-06 §2 explains what the export governs. If no screen exists, choose the page archetype in JITM-07 §2 and reuse the components listed in JITM-06 §3.
   **Gate:** you can name the screens or the archetype you are following.
   Before you copy a neighbouring page, check `docs/standards-audit-2026-09-28/DRIFT_BASELINE.md`; choose the required archetype kit (JITM-07 §2.32).
2. **Check the rules that apply:**
   - the logo and the speech-bubble motif (JITM-03 §2);
   - tokens, type, icons and components (JITM-06 §2);
   - layout and breakpoints (JITM-07 §2);
   - interaction patterns (JITM-08 §2);
   - workflow behavior (JITM-09 §2);
   - vocabulary (JITM-05 §2).

   If words change, also run WF-03.
3. **Check for conflicts.** If the export and the product's real behavior conflict, or the change needs behavior that does not exist yet, stop and ask. Do not invent product behavior or copy sample data from the mockups (JITM-06 §2).
4. **Implement:**
   - use semantic tokens and shared components;
   - add no page-specific colors;
   - draw icons through `AppIcon` with explicit dimensions;
   - keep one responsive structure rather than separate mobile and desktop copies.
5. **Verify** (JITM-12 §2):
   - Run tier 1 and the UI tier-2 row (JITM-12 §2.9–§2.10); compare failures with the baseline (JITM-12 §2.14).
   - Run the full applicable JITM-07 §5 size matrix in both themes, including every layout boundary on both sides, fractional width, sideways phones/short heights, narrow and ultrawide screens; record omitted rows.
   - Run JITM-12 §2.26: validation, empty, filtered-empty, loading, error/recovery, offline, not-found and signed-in/out states; hover/shortcut hints, phone input size and sheet focus; document title/H1, skip link and focus after navigation. Record inapplicable states with reasons.
   - Capture screenshots per JITM-12 §2.18.
   - Compare the screenshots with the export screens, and inspect them yourself; automated checks alone do not prove visual fidelity.
   - Check keyboard use and visible focus, 44px targets, 200% text and contrast (JITM-10 §2).
6. **Record assumptions.** Label any implementation assumption in the pull request. Add a `[PROPOSED]` rule through WF-08 when a new pattern appears.

## Evidence to produce

- The export screens or archetype followed.
- The commands run and their results, with baseline comparisons.
- Screenshots in both themes at the tested widths.
- A NOT RUN list.

## Done when

- The change matches the reference in both themes at every tested width.
- Keyboard, zoom and contrast checks pass.
- The pull request template is complete.

## Stop and ask Kevin when

- The export conflicts with product behavior.
- The change needs a new product capability.
- A shared component would have to change in a way that affects other pages.

## Changelog

- 1.0.0 — 2026-09-28 — Initial version.

- 1.1.0 — 2026-11-09 — Base ef7a02c7b86d29d9c3ed5cab4928758166e24740. Adopt archetype kits and drift check; verify the shared size/states/touch/orientation protocol.
