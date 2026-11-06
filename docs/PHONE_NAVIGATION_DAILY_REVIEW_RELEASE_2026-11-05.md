# Phone navigation and daily review — November 5, 2026

Live URL: https://jumpinthemix.com/. Candidate cutover completed at 2026-11-05T23:33:07.915796Z; the corrected live smoke and final check passed in JITM-RELEASE-3C at 2026-11-06T05:50:33.187Z; the tag is pushed and this record is committed directly to main because no PR path exists. This code-only release includes phone navigation, account access, contact settings, focused Help and daily inquiry review, without a migration or dependency/configuration change. Rollback, if required: redeploy `5f85ee71f405244de97110417cf3b33506e9315f` to web first, then worker, and verify.

| Item | Evidence |
| --- | --- |
| Previous production | `5f85ee71f405244de97110417cf3b33506e9315f`; historical tag absent, gap explicitly retained |
| Application | `dcdd9697cdf345dc95c362a465082e202e5f6a64`, merge of PR #171 on main |
| Published tag | `prod-2026-11-05-dcdd969`; pushed, confirmed 2026-11-06T06:24:00.935Z (UTC) |
| Post-release QA | PASS, JITM-RELEASE-3C-QA job_77961bd10d86 |
| Migration / new dependency | None |
| Fresh encrypted backup | `crn-dah1j5ht0dsc73e709ig-1793920994`; stored 2026-11-05T23:23:36.169Z, three objects |
| Worker | `dep-dbmh0fgae00c73bt4uag`; live 2026-11-05T23:26:06.955394Z; scoped queue probe passed and removed |
| Web | `dep-dbmh2cjncjis73939ipg`; live 2026-11-05T23:33:07.915796Z; build `bYLrk7J8GFHrwgiRHbDkP` |
| Postflight | PASS at 2026-11-05T23:33:51.205Z |
| Final release check | PASS at 2026-11-06T05:50:33.187Z; baseline counts unchanged, no synthetic leftovers or failed jobs, health 200 × 9, both services at dcdd9697 with auto-deploy off |
| Latest read-only observation | 2026-11-06T05:47:56.151Z; explicit step-4 gate PASS on every value; final-check evidence follows at 05:50:33.187Z |

## Changes

- Timezone labels and Journey scheduling clock: #165 `1bd0d4f`, #167 `c9a9040`.
- Earlier reviewed maintenance and release records: #164 `08a2f55`, #156 `b1c794f`, #159 `c8fad0b`, #155 `393fc45`.
- Follow-up review and Undo: #168 `7e43b11`.
- Phone navigation and desktop account control: #166 `3006786`, #169 `70b6eff`.
- Contact-setting consequences, stage rules and new-contact Mix selection: #173 `4c28a31`.
- Focused Help: #174 `2d3a620`.
- Daily inquiry review: #171 `dcdd969`.

## Decisions

1. Kevin's ship instruction freezes dcdd9697; later main changes, UX-03 and M2-S6 are excluded.
2. The exact mobile next-action.spec.ts:46 assertion58 is owner-accepted as a readiness race; no other product/test failure is waived.
3. Existing 01–11 evidence is retained. Remaining rows mirror CI, with registration isolated under the synthetic mail fixture.
4. Correct only the private smoke-helper label expectation after coordinator authorization; local rehearsal then passed. The second live helper mismatch was corrected under note_70e30a066e6bb6f5; the exact corrected helper hash was verified unchanged, and successor JITM-RELEASE-3C passed one complete live smoke.
5. Tag and record publication followed the owner-authorized deferral: the tag is pushed and this record is committed directly to main because no PR path exists; the live smoke, final checks and independent post-release QA pass.

## Verification and baseline

VERIFIED-DOC retained frozen evidence: all six hosted checks green; local check2549 passed/75 skipped; previous-production build and01–11 browser comparison, including the retained batch08 qualification and exact accepted next-action failure. VERIFIED-RUNTIME in the preserved task: seven remaining rows395 passed/123 skipped/0 failed/0 flaky, every skip ledgered, all six formerly failing registration cases passed. Fresh build passed; source/test/configuration tree stayed unchanged.

VERIFIED-RUNTIME this retry: corrected local rehearsal9 checks passed, synthetic fixture/database/server removed. Fresh read-only production preflight passed: both prior revisions, auto-deploy off, retained ready database, runtime boundary, recovery clear,79 migration checksums,80 file hashes and baseline counts. Fresh encrypted backup passed; worker then web deploy passed; postflight30 checks,80 files and23 assets matched. Build cache retained.

VERIFIED-RUNTIME first live smoke:9 checks passed, then an exact-text assertion failed. The actual safe New contacts banner says “Something went wrong. Please try again. Your choices are kept.”; the helper expected only its first sentence. Source and screenshot establish the assertion mismatch; no product regression is claimed. All synthetic rows were removed and blocked rate limits were0. The failed attempt is preserved. At that historical checkpoint, no corrective rerun or rollback had occurred while coordinator answer `relay_b16f2184fd06` was pending. That answer subsequently authorized the exact helper correction; JITM-RELEASE-3C now supplies the passing evidence below.

VERIFIED-RUNTIME independent observation: both services remain candidate/auto-deploy off, all baseline counts match, no synthetic rows/probe jobs/failed jobs/rate-limit blocks; live/ready/worker200 for three rounds. This does not replace the full smoke/final gate.

VERIFIED-RUNTIME JITM-RELEASE-3C (job_4a8ca2a1ec53, frozen dcdd9697): npm ci with development dependencies passed, five package imports passed and matching Chromium145.0.7632.6 launched headless. The 05:47:56Z observation gate passed countsMatchBaseline=true with all 17 deltas zero, both services live at the frozen commit/autoDeploy=no, health200 × 9 and probeJobs/syntheticUsers/syntheticWorkspaces/blockedRateLimits/failedJobsSinceRelease all0. One corrected live smoke ran 05:48:51.897Z–05:49:51.203Z, passed all11 checks including forged-header and signed-banner assertions, had no page errors, and removed user/workspace/people/followUps/Mix/templates/jobs with blockedRateLimits0. Final check passed at 05:50:33.187Z, with every baseline delta0, no synthetic rows/probe jobs/failed jobs/rate-limit blocks/plan-limit stops, and both services still at the same deploys. No deploy, rollback, backup, migration or helper change occurred in the successor. SHA256: smoke06c4a67539a8ec3a52f043209ef6a3819143d5bd955ec900a9a95367563ec1fe; final1dd3ab2f49c20e86bcd6dc5ea54402171691cb87397aad36ac9e3f12789a9394. Local report: .artifacts/release3b-20261105-dcdd969/RELEASE-3C-REPORT.md. Infrastructure-only sandbox failures and approved exact retries are retained in ERRLOG notes; no product/assertion failure occurred in this successor.

## Rollback

No schema/data transform shipped. If required by WF-06, redeploy the previous commit to web first, then worker, verify and record. No historical tag will be invented and no database restore is needed for this code rollback. No rollback has been executed.

## Owner steps, NOT RUN and follow-ups

Completed by JITM-RELEASE-3C: corrected private signed-in banner assertion, forged-header assertion, full 11-check live smoke, all scoped cleanup and final production check. Independent read-only post-release QA job_77961bd10d86: PASS. Physical devices and restore rehearsal NOT RUN. Tag creation/push and this record are now published; the record was committed directly to main because the suspended GitHub identity leaves no PR path. No customer/tester message was sent; owner can arrange reload messaging. Carry forward external uptime-monitor qualification and release-tool/tag-record backlog; no service or billing settings changed.

Feature-map follow-up: daily inquiry review from Today/Contacts; five-control phone navigation and keyboard account access, referencing this record and the named merges. Existing automatic sending and billing stay Built but off. This publication changes no tracked feature-map file.
