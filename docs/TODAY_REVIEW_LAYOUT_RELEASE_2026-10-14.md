# Today review and layout release — October 14, 2026

Live at https://jumpinthemix.com/ as of **2026-10-14 22:21:23 UTC**. This code-only release keeps an open Today review stable during fresh reads, improves confirmation layout on small screens, and makes the compact Profile control fit its rail. There is no migration. Rollback redeploys `c942ebf` to web first, then worker.

| Item | Verified value |
|---|---|
| Previous production commit / tag | `c942ebf2d81b8bd6577072caa1e0a369f9e3cf2c` / `prod-2026-10-14-c942ebf` |
| Application commit / tag | `0a50aedcb752c61242c784696f5570d8083155ce` / `prod-2026-10-14-0a50aed` |
| Merged pull requests | [#157](https://github.com/kaywhy331/jump-in-the-mix/pull/157), `83b0fd6`; [#158](https://github.com/kaywhy331/jump-in-the-mix/pull/158), `0a50aed` |
| Migration / dependencies / service settings | None changed |
| Worker deploy / live time | `dep-db7vu58m7kps73cg7iq0` / 2026-10-14 22:17:21 UTC |
| Web deploy / live time / build | `dep-db7vv2rncjis73e3h700` / 2026-10-14 22:21:23 UTC / `ukfu8t2H_dt669VvGTFdY`; cache kept |
| Final check | 2026-10-14 22:24:57 UTC |

## What changed

- **Review stability (#157).** A fresh read can add or regroup a person's follow-ups while their review stays mounted in its current section, with keyboard focus intact. Closing releases that placement and restores trigger focus. The server's due order and fresh records remain authoritative. The displayed content and its view key travel together, so invitation links open the requested review after navigation.
- **Confirmations (#158).** Phone reviews account for the confirmation stack when choosing whether their action bar should scroll. A failed Undo stays inside its padded confirmation with a separate alert and a 44px Undo target.
- **Profile (#158).** The compact rail uses an icon with the accessible name Profile, a 44px target and keyboard opening/closing. The full rail retains its label.

These improve existing shipped features; no feature-map status changed. The implementation records retain the decisions, earlier failed attempts and corrections: [review stability](TODAY_REVIEW_STABILITY_2026-10-14.md) and [confirmation/Profile layout](TODAY_LAYOUT_FOLLOWUPS_2026-10-14.md).

## Decisions

1. Kevin authorized this batch on October 14: **“okay push it forward to merge and deploy”**. Both PRs used merge commits at their reviewed heads, `5f7ac65` and `6c06419`, after CI, Security and Docker build were green (D122).
2. Verification ran in an isolated worktree while hosted CI finished. The temporary integration commit was `90f4876b9f3bd20ab1397147faa28c8354f89971`. Its complete tree, `4f531ca035d3a8158f976df3b03f64c12701aaf4`, exactly equals the final application commit's tree. The worktree was then moved to that actual `main` merge commit; all 19 changed files still matched their verified hashes.
3. This follows WF-06 through `jitm-release`, with WF-05/`jitm-review`, JITM-12 verification and evidence rules, JITM-13 merge rules, JITM-14 release gates, JITM-15 records and JITM-16 authority. The fresh backup was required even for this code-only release.
4. Multiple confirmations continue the existing D70 behavior; the export illustrates one floating toast. The release preserves the export's workspace structure and semantic tokens while using the established scrolling fallback for crowded reviews. Existing visual follow-ups remain below.

## Verification

**VERIFIED-RUNTIME, local production build:** `npm ci --no-audit --no-fund`, then `npm run check`, passed. Static validation, typecheck, 315 test files (2,450 tests passed; 75 tests skipped in nine files) and the production build passed. The check used a new, migrated loopback `jitm_design_*` database, removed afterwards.

**VERIFIED-RUNTIME, combined browser checks:** two serial batches, desktop and phone Chromium, with `--retries=0`: **176 passed, 48 project-specific skips, no failures**. The first batch was `today-momentum`, `today-navigation`, `today-person-cards`, `today-person-cards-paging` and `follow-up-drafts` (126 passed, 42 skipped). The second was `accessibility`, `onboarding-invitations`, `mix-next-step`, `contacts-bulk-placement` and `preparation` (50 passed, six skipped). This includes invitation entry, live regrouping, outcomes/Undo, drafts, keyboard focus, and the earlier preparation/list timing cases.

**VERIFIED-RUNTIME, visual and keyboard checks:** 24 layout states and 14 retained-review states, 56 fresh screenshots, spanning 320, 390, 767, 768, 834, 900, 901, 1194, 1279, 1280 and 1920px where applicable, both themes and System at 390px. The checks found zero horizontal overflow, axe violations or page errors. All 14 reviews retained DOM identity with focus still inside; the enlarged-text checks kept focused controls visible and uncovered. Selected phone, tablet and desktop captures were inspected against TodaySent, DarkReview, TabletTodayWide and DarkDesktopToday in the supplied export. Vertical scrolling remains necessary on crowded/short screens; the shared Close icon's existing offset at 200% text remains.

**VERIFIED-RUNTIME, local release-smoke rehearsal:** ten checks passed against the combined build, including retained review focus, failed Undo containment and real Undo recovery in both themes, Profile at 901/1194/1279/1280px, and the existing Today/Contacts/Journey checks. The synthetic owner, workspace and related data were removed. Production cookie, client-address and signed-error gates ran only in the live smoke below.

**Baseline and failures:** the clean, separate production build at `c942ebf` was available on port 3115. The ten core combined specs passed without retry. The hosted search failure below prompted additional comparisons. Earlier candidate/baseline comparisons and failed CI attempts remain in the implementation records. Recovered rate-limit write-conflict and closed-stream messages remain in the private browser logs; the core browser assertions passed. The previously intermittent preparation check is not claimed fixed by its passing runs.

**VERIFIED-RUNTIME, hosted PR checks:**

- #157: [CI 38632706349](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/38632706349), Security and all three image builds passed at `5f7ac65`. CI reported 2,514 unit/integration passes, 11 skips; its main browser matrix passed 822 with 268 skips and no flaky cases. The gated fixture, invited-registration, staff/MFA and waitlist groups, packaged-server checks and Lighthouse passed separately.
- #158: [CI 38635270477](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/38635270477), Security and all three image builds passed at `6c06419`. CI reported 2,506 unit/integration passes and 11 skips. Its main browser matrix reported 813 passes, 272 skips and **one flaky case**: `ready-made-panes.spec.ts:152` on mobile did not find “No Mixes match” within 10 seconds, then passed its retry. The gated browser groups, packaged-server checks and Lighthouse passed separately.
- Merged `main`: [CI 38645868998](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/38645868998) in progress; [Docker build 38645869065](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/38645869065) passed; [Security 38645869046](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/38645869046) passed; [production-smoke 38647009200](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/38647009200) passed as of 2026-10-14 22:25:59 UTC. The pre-merge gate used each reviewed PR head; the combined local production tree and production release checks passed separately.

**VERIFIED-RUNTIME, hosted search-failure comparison:** the unchanged search case passed twice alone on the combined candidate and twice alone on `c942ebf`. Five complete `ready-made-panes.spec.ts` batches on mobile then passed on each build (25 cases per build, zero retries). The search case failed in 0/5 repeated candidate batches and 0/5 baseline batches. Under D123/D124, the comparison excludes the original discovery run: this batch-only failure is not new by the observed recurrence criterion. It was not reproduced locally, and this limited file-batch comparison does not recreate the entire hosted matrix. The CI log and initial failure are preserved in `pr158-ci.log` and `search-ci-failure.txt`. The hosted diagnostics upload was skipped on this successful run, so its error-context snapshot was unavailable. The cause remains unconfirmed; neither the ready-made search implementation nor its test was changed. This is not a claimed fix.

**WF-05 combined self-review: Approve.** No new finding above LOW. Layout, accessibility and testing/evidence score 2; the other applicable product, engineering, Git, release and documentation dimensions score 3. This is self-review. The existing LOW findings in #158 remain: floating confirmations can overlap workspace content (VIS-01, JITM-07 §2.9/JITM-08 §2.4), the enlarged Close icon alignment (VIS-02, JITM-07 §2.3/JITM-10 §2.3), and the unconfirmed preparation timing failure (TST-01, JITM-12 §§2.4, 2.14). The search-check recurrence is a separate LOW test-reliability follow-up (TST-02, JITM-12 §§2.4, 2.14 with D123/D124); its comparison and evidence are above.

## Release steps

All results below are **VERIFIED-RUNTIME**. Private receipts and scripts are in `.artifacts/today-release-20261014/`; local check/browser/capture evidence is in `.artifacts/worktrees/today-release-20261014/.artifacts/verification/`. Credentials and raw evidence are not committed.

1. Read-only preflight passed: service identity, verified customer domain, previous revision on both services, auto-deploy off, three health rounds, ready database, runtime-role boundary, no recovery hold, and all 79 migration checksums. The source diff contained no schema, dependency or configuration change.
2. A fresh encrypted backup was stored at 2026-10-14 22:15:02 UTC, with all three expected objects, before either deploy.
3. Worker deployed first. Its revision check and scoped queue probe passed; the probe created no follow-ups and was removed.
4. Web deployed at the same commit with cache kept. Render's pre-deploy checks and readiness passed.
5. Postflight passed 30 public/security/redirect checks; all 19 release-file hashes and 23 served-asset hashes matched. Database readiness stayed green.
6. Live smoke passed 14 checks with one temporary synthetic owner and two people with no recipient addresses. It covered session cookie flags/lifetime, real client address including forged forwarding, signed errors, phone reflow/axe in both themes, retained review focus, failed Undo containment with real Undo recovery, and keyboard Profile access. All synthetic data was removed. The live dark-phone Undo and light compact-Profile captures were also inspected.
7. Final check passed: record counts matched preflight; no synthetic rows, probe jobs, active rate-limit blocks or jobs failed since release; health returned 200 in three rounds; both services ran the release commit with auto-deploy off.
8. The annotated production tag was pushed. All production release steps passed on their first attempt. Local and hosted test failures and comparisons are retained above and in the implementation records.

## Rollback

Redeploy `prod-2026-10-14-c942ebf` to **web first, then worker**, keeping the cache, and repeat the postflight and final checks. There is no schema or data reversal. This restores the previous review/confirmation presentation.

## Owner steps

- Reload open app tabs and ask testers to reload. The customer-visible client code changed.
- Complete the physical-device and assistive-technology pass; emulation does not qualify it.

## NOT RUN

- Physical phones, VoiceOver, TalkBack, Firefox and WebKit: unavailable in this local verification environment.
- The complete combined browser matrix locally: the ten affected specs ran on both projects; each PR's hosted checks covered the full matrix. Merged-main CI status is recorded above.
- Migration/restore/load rehearsals, packaged-worker qualification, Lighthouse and image/security jobs locally: their implementation was unchanged; hosted PR checks supplied that evidence separately. No migration job was needed.
- Real customer accounts or data in tests: only synthetic fixtures were used. No customer-outcome measurement was performed.

## Follow-ups

- Carry forward the open operational and product items in the [previous release record (#156)](https://github.com/kaywhy331/jump-in-the-mix/pull/156) and [UX follow-ups record](UX_FOLLOWUPS_RELEASE_2026-10-13.md): the external uptime monitor (B-08), invitation wording (TRU-09/D83), No Mix defaults and fixes, visit semantics, existing evidence-database cleanup, license/author-address choices, and the open process questions in #155/#156. This batch does not resolve those decisions.
- Keep the LOW visual, preparation-check and ready-made search-check follow-ups above, and the earlier contact-import timing follow-up. Review this release record through its separate documentation PR.
