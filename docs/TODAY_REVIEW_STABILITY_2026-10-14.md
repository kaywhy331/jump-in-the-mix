# Today review stability — October 14, 2026

Implementation of D112 and backlog B-20, continuing the [October 13 follow-ups](UX_FOLLOWUPS_RELEASE_2026-10-13.md). Base: `c942ebf`. This is an implementation record, not a production release record.

## Behavior

VERIFIED-CODE: Today keeps the person whose review is open in the same section while a fresh read updates the page. Previously, a read that regrouped the person's card between Overdue and Today remounted the card and closed its review. People keep the server's due order within each section.

- A second follow-up arriving, including from the next page, joins the held person's card.
- Recording contact elsewhere, undoing that contact, skipping or snoozing a later follow-up, and recording No answer or Wrong number do not reparent the open review.
- The section counts follow the displayed placement; the header still counts every overdue follow-up by its actual due date. The rest of the list and Done continue updating.
- Closing the review releases the hold. The card takes its current section and focus returns to its Review control, without reopening it automatically.
- An outcome on the reviewed follow-up releases the hold. The normal next-review and Undo behavior still applies.
- A hold never recreates a follow-up missing from the fresh read. It resets on navigation and is scoped to the workspace's Today instance.

The server still decides which records belong to the page and how they normally group. The client holds only the open review's placement; it does not change stored outcomes, dates, sending behavior, pagination or the workspace boundary.

## Authority and design

WF-02 and WF-04, using `jitm-ui-change` and `jitm-feature`; reviewed through WF-05 with `jitm-review`.

- D112: [owner decision](standards-audit-2026-09-28/OWNER_DECISIONS.md), accepted October 13. JITM-08 §2.33 and §2.36 require a read to preserve work in progress and the open review; JITM-09 §2.82 governs shared cards and counts.
- Concept fit: the owner can finish the conversation they opened while Today remains current (JITM-01 §2).
- JITM-06 §2, JITM-07 §2.15, JITM-10 §2, JITM-11 §2.1 and §2.9–§2.10, JITM-12 §2.8–§2.18 and JITM-13 §2.1–§2.2 apply.
- References: the original export's Main, TabletToday, TabletTodayWide and DesktopToday screens, and their Dark counterparts. The queue, review sheet, docked review, typography and tokens keep their existing composition. This change adds no style rule or customer wording.

Implementation detail: the hold changes only the person's section, preserving the server's due order as other people arrive or leave. A removed, completed or filtered-out reviewed follow-up is not retained as a stale actionable card.

## Verification

VERIFIED-RUNTIME, using fresh migrated loopback databases (`jitm_design_today_review_20261014` initially, and `jitm_design_today_review_final_20261014` for the final full check) and the CI environment:

- `npm ci --no-audit --no-fund` and the final `npm run check`: PASS. Static validation, typecheck, 315 passing test files (2,450 tests passed; 75 tests skipped), and the production build passed. Skips are not counted as passes. The earlier full check passed 2,448 tests before adding two ordering cases.
- The final placement unit tests plus `today-view.test.ts`: 29 passed.
- The eight new browser regressions: 16 passed across desktop Chromium and the Pixel 7 project, with retries disabled. This first run used `next start`; the broader run uses the packaged standalone server as the build warning recommends.
- Baseline `c942ebf`, built separately and served on port 3115: the new pagination regression failed on both attempts. After another person's outcome brought the second follow-up onto the page, Overdue contained zero cards instead of the expected two, because the group had moved to Today. The candidate passed the same case on both projects. The first baseline run's maximum-failure stop added a runner-level error; a repeat without that limit produced only the expected assertion failure.
- The first six-file browser run had 119 passes, 39 skips and two failures: the existing in-flight draft-recovery test in `today-navigation.spec.ts` found the wrong due order on both projects. It failed twice per project alone on that candidate (four failures), and passed twice per project on `c942ebf` (four passes): a new regression. The correction holds only the section and preserves the server's due order; it does not hold a numeric row position. The failed logs are retained.
- Final browser run, against the rebuilt standalone server: **121 passed, 39 skipped, zero failures**, with retries disabled. Command: `npx playwright test e2e/today-momentum.spec.ts e2e/today-navigation.spec.ts e2e/today-person-cards.spec.ts e2e/today-person-cards-paging.spec.ts e2e/follow-up-drafts.spec.ts e2e/accessibility.spec.ts --retries=0`. This includes all 16 new regression executions, both formerly failing draft-recovery cases, core accessibility scans and the existing desktop native-zoom checks at 200% and 400%. The 39 skips are existing project-specific cases, not passes.
- `npm run standards:check`: PASS, with the existing warning that JITM-09 exceeds its 300-line target.

VERIFIED-RUNTIME: synthetic screenshots from the final production build at 320×568, 390×844, 767×900, 768×900, 834×1194, 1194×834 and 1920×1080, each in light and dark. All 14 retained the original open review and focus after another follow-up arrived; none had horizontal overflow, an automated WCAG violation or a page error. The Close control measured 48×44 CSS px. At 320px with text doubled, the message, Open text, Mark sent and Skip Beat were each reachable, visible and unobscured when focused, with a solid focus outline, in both themes. The first supplemental text-size capture used the visible link text instead of its full accessible name and timed out; correcting that capture selector required no application change. Its log is retained.

VERIFIED-RUNTIME / VERIFIED-DOC visual inspection: compared all seven widths in both themes with Main, TabletToday, TabletTodayWide and DesktopToday and their dark references. The phone queue and bottom sheet, tablet split view, wide rail and desktop context column retain the existing composition, message bubble and typography. The shipped filters, live counts, shared-person rows, channel-readiness text and explicit Close differ from the sample export; this diff changes none of their styling or wording. The portrait tablet's existing app header remains (JITM-07 §6). The 768px capture requires vertical scrolling to reach lower outcomes; doubled phone text also uses vertical scrolling. At 1194px, the rail's Profile label still wraps, as already recorded in the October 13 release's D82 follow-ups. This is not a claim that the application's existing visual backlog is resolved.

Local evidence is in `.artifacts/verification/` in the task worktree: `check-final.log`, `unit-targeted-final.log`, `browser-affected-final.log`, `baseline-build.log`, both `baseline-regression*.log` files, `draft-order-*.log`, the initial failed `browser-affected.log`, `visual-results.json`, `visual-narrow-results.json`, `screenshots/`, `references/` and `standards.log`. Source/test hashes in `verified-source-digest.json` tie the final verification to the committed implementation; no implementation or test changed after that run.

## WF-05 review

Verdict: **Approve for this change**, self-review, not independent acceptance. No new finding above LOW. This does not approve a release or resolve the earlier visual backlog.

Scores (0–3, JITM-17 §2.12): constitution 3; concept 3; brand 3; vocabulary 3; design system 3; responsive layout 2; interaction 3; IA/workflows 3; accessibility 2; engineering 3; testing/evidence 3; Git/PR 3; documents 3; agent conduct 3. Layout/accessibility retain the documented visual carry-over and physical-device coverage gap below. Copy strategy, positioning and release execution are outside this diff.

| ID | Rule | Finding and evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|
| VIS-01 | JITM-07 §2.3 | Profile wraps in the compact rail at 1194px in both captured themes; the October 13 release already lists this issue for D82. The rail and its styles are unchanged. | VERIFIED-RUNTIME, VERIFIED-DOC | LOW, existing | Keep in the D82 visual follow-up. |

The review checked the fresh-record requirement in `src/lib/today-review-placement.ts:8`, workspace/view scoping and focus restoration in `src/components/TodayReviewPlacement.tsx:13`, due ordering in `src/app/(app)/jumps/page.tsx:503`, and count/section consistency in `src/components/TodayMomentum.tsx:41`. The final browser cases exercise those paths together with drafts, navigation, outcomes and Undo. No new standard or owner decision is needed.

## Rollout

Needs a normal application release after review and merge. No migration, dependency or environment change. Rollback restores the previous presentation; no stored data needs reversing. Production has not been changed by this task.

## NOT RUN

- Physical phones, VoiceOver, TalkBack, Firefox and WebKit: outside the available local Chromium/device coverage; emulation is not physical qualification.
- Full unrelated browser suites, gated staff/admin/admission/email/voice flows and Lighthouse: this task changes Today only and no public page.
- CI jobs outside this task's affected checks: populated migration/rollback and backup/restore rehearsals, restored-database runtime qualification, hosted fixture/restricted-runtime qualification, load/worker qualification, optional scheduler packaging, production dependency audit, secret scanning and container image builds. No schema, dependency, worker, security or deployment configuration changed.
- Production release and live customer checks: outside this implementation task.
