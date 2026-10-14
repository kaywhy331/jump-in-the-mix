# Today confirmation and Profile layout follow-ups — 2026-10-14

## Scope and authority

VERIFIED-DOC: Kevin authorized the recommended application improvements on October 14. This change addresses B-22's two medium layout findings and the compact Profile wrap recorded under D82. It is independent of [PR #157](https://github.com/kaywhy331/jump-in-the-mix/pull/157), which keeps an open Today review stable. The task branch starts from `origin/main` at `c942ebf2d81b8bd6577072caa1e0a369f9e3cf2c`; the original working checkout was not edited.

Applied workflows: WF-01, WF-02, WF-04 and WF-05 through `jitm-ui-change`, `jitm-feature` and `jitm-review`. Relevant rules: JITM-06 semantic tokens and shared components; JITM-07 §§2.5, 2.7, 2.26; JITM-08 §§2.3, 2.4, 2.36; JITM-10 §§2.1, 2.3, 2.4, 2.9–2.12; JITM-12 §§2.9, 2.10, 2.14, 2.18–2.25; and JITM-13, JITM-15 and JITM-17 for review and evidence.

References consulted: Main, Review, TodaySent, TabletToday, TabletTodayWide and DesktopToday, and their dark counterparts in the supplied design export. The export is unchanged. The installed Next.js CSS guide was read before implementation.

## Implemented behavior

VERIFIED-CODE:

- `TodayMomentum.tsx` measures the confirmation stack as part of the space available to the phone message. Its ResizeObserver also tracks confirmations, including an error appearing or a confirmation expiring. When the message no longer fits, the existing action-bar fallback lets the review scroll together.
- `JumpWorkflow.tsx` places a failed Undo's alert inside its bordered confirmation, below the words and Undo button. The success status and error alert have separate live regions. `JumpWorkflow.module.css` supplies padding, wrapping, semantic surface/border/text tokens and a 44px minimum Undo target.
- `AppShell.tsx` names the Profile trigger explicitly. The compact rail shows its icon at 901–1279px; the full rail keeps its text. `design-workspaces.css` gives the compact trigger its rail width and both forms a 44px minimum target.

Implementation assumptions: the existing multiple-confirmation behavior follows D70/JITM-08 §2.36; the export illustrates a single floating toast. Crowded phone reviews use the established flowing-action pattern, with vertical scrolling to reach the handoff and outcomes. Compact account controls follow the icon pattern in JITM-07 §2.5. No new capability, copy, data mutation, dependency or standard is introduced.

## Verification

VERIFIED-RUNTIME: the unchanged baseline production build on port 3115 failed all eight applicable new layout checks in both themes (four other executions were project-specific skips). Failed Undo text had zero horizontal padding; Profile wrapped onto two lines; at 320×568, the action bar began at y468.59 while the message ended at y620.59. Baseline logs and synthetic captures are retained.

VERIFIED-RUNTIME: the initial build found a type mismatch in the new test helper (`Page` instead of `Locator`), which was corrected. The first candidate run had five passes, four skips and three failures: two undersized compact controls and one missing simulated Undo alert. The Undo case passed twice alone on that candidate; both baseline repeats reached the expected padding failure. The missing alert's cause remains INFERRED: service-worker interference with Playwright routing is possible. Its fixture now blocks service workers only in the new test group and requires observing the injected 503 response. Assertions were preserved and strengthened.

VERIFIED-RUNTIME: an intermediate repeated run exposed the existing 36px full-rail Profile and floating Undo styles (eight passes, eight skips, eight failures). Scoped CSS corrects both targets. The next targeted run passed twice: 16 passes, eight project-specific skips, zero failures. The final keyboard test additionally traverses the rail with Tab and requires the entire Profile target in the viewport.

VERIFIED-RUNTIME: `npm ci --no-audit --no-fund` and `npm run check` passed. The latter ran on a fresh, migrated loopback `jitm_design_layout_check_*` database that was removed afterward. Static validation, typecheck, 314 passing test files (2,442 tests passed; 75 tests skipped) and the production build passed. Skips are not counted as passes. This branch does not include PR #157's additional unit cases.

VERIFIED-RUNTIME: the first six-file browser run had 132 passes, 43 project-specific skips and three failures. Two were the new Profile test starting its next Tab traversal before the previous close event settled. Isolated repeats reproduced one intermittent focus failure; after explicitly observing the close event, five repetitions per theme passed (10 total). An intermediate test-only correction used a locator that excluded the now-hidden dialog; that failed attempt is also retained. No application change or timeout increase was needed for the keyboard fixture.

The third failure was the old 200% text test requiring a pinned bar while a confirmation still occupied the sheet. Both isolated candidate repeats used the new flowing layout; both baseline repeats used the old pinned layout. The revised fixture preserves the original pinned-to-flowing outcome-choice assertions and adds checks for the newly intended state: an unobscured message while the confirmation is present, controlled-clock expiry, and return to the pinned layout. Both revised phone runs passed.

VERIFIED-RUNTIME: the final complete `today-momentum.spec.ts` run passed on both projects: 42 passes, 36 project-specific skips, zero failures, retries disabled. Together with the unchanged five other specs from the earlier batch, all **135 applicable browser cases passed; 43 were skipped**. The five other specs were `today-navigation`, `today-person-cards`, `follow-up-drafts`, `sheet-interactions` and `accessibility`. This includes core WCAG scans, keyboard workflows, draft retention, outcomes, Undo and enlarged-text behavior. The final Profile fixture also failed all 10 baseline repetitions on the old wrapped label. The final test-only changes passed `npm run typecheck`; application source remained identical to the successful full check and production build.

VERIFIED-RUNTIME: 24 production-build screenshot states at 320×568, 390×844, 767×900, 768×900, 834×1194, 900×600, 901×600, 1194×834, 1279×600, 1280×600 and 1920×1080, in both themes, plus System light/dark at 390px. Every state retained both confirmations and had zero horizontal overflow, automated WCAG violations or page errors. Error states were checked at 390px and 1194px. At 320px with text doubled, the message, Open text, Mark sent and Skip Beat were each visible, unobscured and focused with a solid outline. Separate keyboard captures at 901, 1194, 1279 and 1280px verify the entire Profile target is visible at a 600px screen height, opens with Enter and regains focus on close.

VERIFIED-RUNTIME / VERIFIED-DOC visual comparison: the selected captures preserve the supplied phone sheet, message bubble, portrait tablet columns, compact rail and desktop context column. The new cards use the shared raised surface in both themes; errors wrap inside their border; Profile follows the compact account-icon pattern. Shipped confirmation stacks, live counts and channel-readiness guidance differ from the single-toast sample export as described above. Shorter docked views retain vertical scrolling; captures after recording outcomes can show the resulting scrolled position. Existing floating-stack placement and enlarged-header alignment remain follow-ups, not claims of complete design fidelity.

Evidence stays private in the task worktree's `.artifacts/verification/`: `check.log`, `typecheck-final.log`, `browser-affected.log`, `momentum-final.log`, `profile-final-repeat.log`, baseline and failed-attempt logs, `visual-results.json`, `candidate-screenshots/`, `screenshots/` and `references/`. `full-check-source-digest.json` and `verified-source-digest.json` show that only the browser fixture changed after the full check; all final source/test hashes were checked against the committed files.

## WF-05 review

Verdict: **Approve for this scoped change**. No new finding above LOW. This is a self-review, not independent acceptance or release approval.

Scores (0–3, JITM-17 §2.12): constitution 3; concept 3; brand 3; vocabulary 3; design system 3; responsive layout 2; interaction 3; IA/workflows 3; accessibility 2; engineering 3; testing/evidence 3; Git/PR 3; documents 3; agent conduct 3. Layout/accessibility retain the existing visual follow-ups and physical-device coverage gap. Copy strategy, positioning and release execution are outside this diff.

| ID | Rule | Finding and evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|
| VIS-01 | JITM-07 §2.9; JITM-08 §2.4 | The existing centered floating stack can cover workspace content; the baseline and candidate desktop Undo captures retain this placement. The failed alert itself is now contained. | VERIFIED-RUNTIME | LOW, existing | Keep the separate floating-stack placement follow-up. |
| VIS-02 | JITM-07 §2.3; JITM-10 §2.3 | At doubled phone text, the shared Close icon is below its circular background's center, also recorded in B-22's earlier inspection. The shared header styles are unchanged; target access remains intact. | VERIFIED-RUNTIME, VERIFIED-CODE | LOW, existing | Address the shared enlarged-header alignment separately. |

Reviewed the confirmation observer's cleanup and geometry in `src/components/TodayMomentum.tsx:134`, separate status/alert regions in `src/components/JumpWorkflow.tsx:218`, scoped target styles in `src/components/JumpWorkflow.module.css:35`, and Profile naming in `src/components/AppShell.tsx:60`. No owner decision or new standard is needed.

Existing visual follow-ups outside this scope include floating confirmations covering workspace content and vertical scrolling to lower actions at the 768px boundary. This change does not claim to resolve the entire visual backlog.

## Rollout

Needs a normal application release after review and merge. No migration or environment change. Rollback restores the previous presentation without reversing stored data. This task has not merged or deployed either pull request.

## NOT RUN

- Physical phones, VoiceOver, TalkBack, Firefox and WebKit: unavailable in the local Chromium verification setup; emulation is not physical qualification.
- Unrelated browser suites, gated staff/admin/admission/email/voice flows and Lighthouse: this change concerns Today confirmations and the Profile trigger, with no public-page change.
- Local migration/restore/load rehearsals, packaged-worker qualification, Docker builds and security scans: no corresponding implementation, schema or dependency changed. Hosted checks are reported separately from local evidence.
- Production/staging deployment and smoke checks: this is an implementation and review handoff, not a release.
