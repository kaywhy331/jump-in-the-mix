# Shared next action — October 28, 2026

Local implementation candidate for JITM-UX-01-EXEC (`job_a493c322fd29`), authorized by Kevin on October 27, 2026. No production release, push, pull request or merge is part of this task. The assigned workspace is detached from base `5f85ee71f405244de97110417cf3b33506e9315f`; the final candidate SHA is recorded in the Hub handoff.

## Scope and decisions

VERIFIED-CODE: Today and the contact profile use one read-only projection of follow-ups, workflow outcomes, commitments, appointments and preparation problems. The projection reads one repeatable database snapshot, uses account-local calendar days for follow-ups and the actual instant for appointment/callback attention, and orders actionable work before future work. Pending outcomes lead. A single person's other urgent obligations remain available under a disclosure.

VERIFIED-CODE: IDs identify individual obligations. A pending follow-up and its held workflow visit share an identity; independent follow-ups, evaluations, callbacks and repairs retain separate identities even for the same person. Settled receipts win equal-version conflicts, and a newer Undo can reopen the same obligation. Archived and Do not contact contacts are excluded. No mutation, scheduling, tenancy, permission or Undo API changed.

VERIFIED-CODE: Today reads beyond presentation pages and counts deduplicated obligations in the complete filtered result. Its default Next card retains future context from that same snapshot; explicit search/filter views show their matches and say when none match. Paging through input items preserves the current filters. Existing Today card placement, automatic next-review behavior and the landed race fix remain intact. The profile keeps its existing layout and one Mixes section; one-time follow-ups show “Review message” without implying Mix enrollment or displaying a Beat sequence.

VERIFIED-CODE: Source failures and malformed saved workflow state become “Your next steps could not be checked,” with retry. Preparing, failed preparation and true empty have different copy. All changed copy is interface text; it makes no marketing or delivery claim.

The implementation follows WF-01/02/03/04 and `jitm-ui-change`, `jitm-copy`, `jitm-feature`, with the dispatched-worker instructions in `orca-tokenpak` and `orca-fleet`. Applicable rules include JITM-00 §2.2–2.8, JITM-04 §2.6/2.8/2.12, JITM-05 §2, JITM-06–10 §2, JITM-11 §2.9–2.19/2.24/2.34/2.48, JITM-12 §2.8–2.10/2.14/2.18–2.22, JITM-13 §2.1/2.11 and JITM-16 §2.5–2.10.

## Proposed standards alignment

The task explicitly authorizes the rollout departure and forbids editing standards in this candidate. Proposed alignment text for JITM-09, to be handled separately:

> Today and a contact's Next section derive their next action from the same workspace/contact snapshot and account timezone. Next can offer review of a prepared follow-up, recording an outcome, reviewing a due commitment, checking an appointment or repairing preparation. Actionable obligations precede future plans; separate urgent obligations remain available. One obligation has one stable identity and counts once, while separate obligations for the same person count separately. Today's header counts the full filtered set rather than people, page rows or overlapping status totals. Its default Next section may explain a future plan outside the due queue; an explicit filter limits the Next section to that view. Preparing, failed, unreadable and empty are distinct states. The Next CTA names the available action; a one-time follow-up offers “Review message” without implying Mix enrollment.

Visual reference: Contact/DarkContact, Main/DarkMain, TabletToday/DarkTabletToday, TabletTodayWide/DarkTabletTodayWide and DesktopToday/DarkDesktopToday. The compact Next presentation reuses semantic tokens, existing buttons and the existing contact Next layout. Today's added Next summary is the task-authorized workflow change; broader contact composition remains as shipped.

## Verification

VERIFIED-RUNTIME: Start gates were independently checked through GitHub and local ancestry. Main contains PR160 merge `ac8d80e133749cbbc820e7d1c631a2f1aec12bed`, PR161 merge/base `5f85ee71f405244de97110417cf3b33506e9315f`, and race-fix PR163 merge `e84cb2709142cee8e46e1cdf8d60e79bff946dc3`. Prerequisite candidate `18696085b9f5812974a66d7dcbdf87b176cf8257` is an ancestor; its tree equals the base tree.

VERIFIED-RUNTIME: Dependency installation and database generation passed. The initial pure resolver/profile/workflow run passed 20 tests. The preserved Today-list suite passed seven tests, including tenant isolation, paging and deleted anchors. Five initial snapshot cases passed after two new-test fixture corrections: a missing required user name (five failures) and a recursive test proxy (one failure). Those failed attempts are retained in the private logs and Hub ERRLOG. An additional test covers duplicate held visits and separate repairs/commitments.

VERIFIED-RUNTIME: The same-Task retry matched the coordinator's required pre-edit worktree fingerprint, `e21260ba53a7c70b3ef5aabcf12df25bcd028ee94d870814ba17adfa24cf977c`, and retained all 15 candidate paths on the assigned detached base. Fresh GitHub reads confirmed the three prerequisite merges and that current main still equals the base. The preserved profile, Today-list, Today-race, person-card and accessibility tests are byte-identical to the base; only the explicitly authorized primary-CTA assertion in the named contact Mixes test changed.

VERIFIED-RUNTIME: The retry's focused run passed 52 tests in six files, covering the new resolver/snapshot cases, preserved profile and Today paging contracts, and the two environment-sensitive tests from the earlier full run. That earlier run had 2499 passes, two failures and 75 skips because pilot mode was inherited; explicitly setting the intended test `PILOT_MODE=false` resolves both failures without editing tests. A later full-check attempt passed generation/static checks but exited 143 during typechecking without a compiler diagnostic; its cause is unverified and it is recorded as interrupted, not passed.

VERIFIED-RUNTIME: Final `npm run check` exited 0 with `PILOT_MODE=false` and `NODE_OPTIONS=--max-old-space-size=2560`: generation, static checks, typecheck, 320 test files passed / nine skipped, 2502 tests passed / 75 skipped, and the production build (117 static pages). Evidence: `.artifacts/ux01/retry-check.log`. The final-attempt fingerprint matches `8174ee975a8805896104b28e7511841809556c5ebf1c86d69b5a8f917a91efa8`; every application/test hash in `retry-source-manifest.json` still matches. Only this record changed after those runs.

VERIFIED-RUNTIME: The final six-spec desktop/mobile batch, with one worker and retries disabled, recorded 78 passes, seven intended viewport/project skips and one failure. It covered `next-action`, `contact-profile-mixes`, `today-races`, `today-person-cards`, `today-person-cards-paging` and `accessibility`. The failure was unchanged `e2e/accessibility.spec.ts:19`, timing out after 60000 ms in the axe scan of `/contacts`; it is retained in `retry-browser.log` and `retry-browser-failure-artifacts/`. The same unchanged test subsequently passed twice alone on the candidate in 36.0 seconds, with retries disabled (`retry-a11y-isolated.log`). No assertion, timeout, threshold or skip was weakened.

VERIFIED-RUNTIME: The final visual matrix passed 108/108 cases across Today and Contacts, both themes, widths 320, 390, 599, 600, 601, 767, 768, 834, 900, 901, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2199 and 2200, plus narrow 200% text and short-height views. Assertions cover horizontal overflow, action/text non-overlap, 13px text, 44px targets, visible focus, keyboard disclosure and zero axe violations in the changed Next region. The 108 screenshots and URL/interaction/assertion receipts remain in `retry-screenshots/` and `retry-visual-assertions.json`; representative phone, tablet and desktop images were inspected against the named exports. These scoped assertions do not claim a new whole-application accessibility audit.

VERIFIED-RUNTIME: The unchanged `origin/main` baseline `5f85ee71f405244de97110417cf3b33506e9315f` was exported into private scratch within the assigned workspace and production-built successfully (`final-baseline-build.log`). Its dependency copy was byte-identical to the candidate's installed dependencies. The earlier symlink packaging and stale-cache module-resolution failures were resolved only in scratch; nine exported Windows-script line-ending conversions were restored to exact base blob bytes. Baseline served at `http://127.0.0.1:3001`, separate from the candidate's `http://127.0.0.1:3000`. `playwright test e2e/accessibility.spec.ts:19 --project=desktop-chromium --repeat-each=2 --retries=0 --workers=1` passed both baseline runs in 53.4 seconds (`final-baseline-a11y.log`). It visits `/jumps`, `/contacts`, `/contacts/new` and `/mixes/new` with the existing WCAG assertions and timeout. The same two isolated candidate runs passed as recorded above.

INFERRED: The batch-only accessibility timeout is order-dependent under JITM-12 §2.14, because both isolated runs passed on each production build. It is non-blocking under that classification; its underlying cause is unproven. The failed batch remains a failed batch, not an all-green claim. A test-only investigation of order/load sensitivity is follow-up work, and the existing test remains unchanged.

VERIFIED-DOC: Earlier browser attempts and corrections remain in the Hub ERRLOG and private logs: unreadable profile data initially crashed the Mix reader, and importing server-only scheduling code initially broke the race fixture bundle; both were fixed in the owned files. Later visual checks found a 36px secondary link and narrow enlarged-text overlap; the shared link floor and contact Next layout were corrected before the final passing matrix. No failures were erased. The final attempt also recorded a redundant Node subprocess evidence check's `spawnSync git EPERM`; it was not retried, and the retained source hashes and direct Git diff checks supply the evidence.

All writes in validation use an owned loopback `jitm_design_ux01` database. One heavy validation process runs at a time with a 2560 MiB Node heap limit. Private logs, synthetic screenshots and assertion receipts remain in `.artifacts/ux01/`.

BLOCKED: Orca native browser automation reports `browser_unavailable: Browser automation is unavailable on this host.` Installed local browser automation is the justified fallback. Native orchestration socket access and the temporary database-tool download required scoped automatic-review escalation; no hooks, credentials or permission settings were changed. Intermittent intake timeouts recovered on identical retries under the coordinator's instructions.

## Changed-file manifest

- `src/lib/next-action.ts`: deterministic resolver, deduplication, filtered counts, optimistic completion/Undo and shared labels.
- `src/lib/next-action-reader.ts`: workspace-scoped snapshot and full-set aggregation, plus existing queue adapter.
- `src/components/NextAction.tsx`: shared summary, action link and secondary rows.
- `src/components/ContactProfile.tsx`, `ContactMixes.tsx`, `TodayMomentum.tsx`, `WorkflowAttention.tsx`: scoped consumers of the projection.
- `src/app/(app)/jumps/page.tsx`: Today wiring and filtered totals.
- `src/lib/workflow-attention.ts`: optional shared-action metadata; existing business-decision helper is preserved.
- `src/styles/contacts-workspace.css`: semantic-token summary/disclosure styles.
- `tests/next-action.test.ts`, `tests/next-action.integration.test.ts`, `e2e/next-action.spec.ts`: new behavior coverage.
- `e2e/contact-profile-mixes.spec.ts`: only the explicitly authorized primary-CTA expectation in the named test.
- This implementation record.

## Follow-ups and NOT RUN

NOT RUN: Production deploy/smoke, merge, hosted CI, migration/restore rehearsal, packaged-server suites, load qualification, public-page Lighthouse, image builds and physical-device tests; none is part of this local UI candidate. No schema, dependency, worker, public-page or production configuration changes are included. The install's existing locked-dependency advisories are outside this task and remain unchanged. Independent QA, the test-only batch-timeout investigation and the proposed standards alignment remain follow-up work for the coordinator. The final Hub handoff records the local candidate SHA, complete file/hash manifest and task-owned resource cleanup; no branch or pull request was created.
