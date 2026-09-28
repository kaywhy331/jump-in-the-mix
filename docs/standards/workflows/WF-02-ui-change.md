---
id: WF-02
title: UI change
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
standards: [JITM-03, JITM-05, JITM-06, JITM-07, JITM-08, JITM-09, JITM-10, JITM-12]
skills: [jitm-ui-change, jitm-copy]
---

# WF-02 — UI change

**Trigger:** any change to a page, component, style, layout, responsive behavior, theme or icon, including a new page that has no mockup.
**Inputs:** the intake plan (WF-01); the design export at `docs/design/jump-in-the-mix-designs/index.html`; the relevant standards.

## Steps

1. **Find the reference.** Open the export screens for the workspace in light and dark, at every device size they exist in (390, 834, 1194 and 1920 wide). JITM-06 §2 explains what the export governs. If no screen exists, choose the page archetype in JITM-07 §2 and reuse the components listed in JITM-06 §3.
   **Gate:** you can name the screens or the archetype you are following.
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
