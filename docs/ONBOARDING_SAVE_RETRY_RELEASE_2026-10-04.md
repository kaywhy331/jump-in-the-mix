# Onboarding save recovery — October 04, 2026

Live at https://jumpinthemix.com/ as of 2026-10-04T19:36:56.751654+00:00 UTC. This code-only release makes retries of the mounted first-person onboarding form recover the saved result after a lost response. No migration, new dependency or service configuration change. Recovery context: the prior production tag remains available; with unchanged schema, redeploy web then worker. No database reversal or backup was made a release prerequisite.

| Item | Verified value |
|---|---|
| Previous production commit / tag | `edaf12f9afbbef027e16f10f8b47d68768c9c864` / `prod-2026-10-04-edaf12f` |
| Application merge / PR | `9ee96606b9ac2a0e9894f2982a21a33e4393d71b` / [#116](https://github.com/kaywhy331/jump-in-the-mix/pull/116) |
| Production tag | `prod-2026-10-04-9ee9660` |
| Exact reviewed CI head / tree | `99e8e0b229216aa9239f1303447fd70586346d37` / `2c8d01772ff6a903b1f3ccab6a839a0fd5ac4496` |
| Migration / job / new dependency | None |
| Worker deploy / live UTC | `dep-db1af4egekts73cuh7eg` / 2026-10-04T19:24:13.374689Z |
| Web deploy / live UTC / build | `dep-db1aioid0e5s73esesh0` / 2026-10-04T19:34:25.585239Z / existing Render build with cache retained |
| Final check UTC | 2026-10-04T19:36:56.751654+00:00 |

## What changed

Application candidate `a1dd086f49f5f13bd5b7aed9bddb1ae369e3a003` keeps a request identifier for each mounted onboarding form, scopes its existing receipt to the authenticated workspace/member, and saves the person, date, assignment, profile and receipt in one transaction. The existing workspace row lock serializes concurrent saves. Starter creation participates in that transaction. Retry retrieves the original result and resumes existing idempotent preparation after an interrupted post-commit step. Removed/archived people, inactive assignments, archived Mixes and settled occurrences keep their existing state; **Run setup again** deliberately starts a new request.

Follow-up `99e8e0b229216aa9239f1303447fd70586346d37` corrects only the integration fixture's catalog identifier and updates its implementation evidence. Runtime and browser-test source hashes are unchanged. No customer-facing wording, styling, schema, access policy, credentials, billing, automatic delivery or worker configuration changed. This is a repair of existing onboarding; no feature-map status changed.

## Decisions

1. Kevin authorized normal GitHub publication, exact-candidate CI/review, deployment and live verification through the existing workflow. He subsequently stated that GitHub version control is sufficient and that separate database rollbacks are unnecessary. No extra backup gate was introduced.
2. Use the existing idempotency table and seven-day cleanup contract. Receipts hold only contact and Mix identifiers, not form text. Older application code ignores them; no data transform is required.
3. Keep the per-mounted-request boundary explicit. Fresh mounts and requests after receipt cleanup are outside the replay guarantee. A fresh request assigning the same existing person to the same starter retains the baseline unique-assignment rollback behavior.
4. Codex implemented and ran checks. Independent installed Claude Code reviews were read-only with explicit models and bounds. The reviewers did not execute CI or live acceptance.
5. Preserve actual failures and fix their demonstrated cause. Do not change assertions, timeouts, retries, CI configuration, shared worktrees or existing security controls to get green checks.

## Verification

VERIFIED-RUNTIME: on unchanged base `edaf12f9afbbef027e16f10f8b47d68768c9c864`, repeating the same request created two people, dates and assignments. On the original implementation's exact hashes, local disposable PostgreSQL checks passed 34 focused cases; `npm run check` passed 2,225 tests with 68 existing gated skips, static/type checks and production build. Repeated desktop/mobile response-loss tests passed 12 cases with zero skips/flakes and retries zero. The broader onboarding/feedback/accessibility selection passed 29 with one intentional mobile-profile skip and no flakes. All 824 runtime build-input hashes match the final implementation.

VERIFIED-RUNTIME: recovery checks cover request loss before commit, response loss after commit, preserved form entries, focused error feedback, keyboard retry, one saved result, post-commit preparation recovery, tenant/member isolation, concurrency, settled history, fictional local feedback and intentional setup for another person. Scoped axe, light/dark screenshots, 200% text fit and touch-target checks passed. Slow-database timing remains unmeasured; these are scoped browser checks, not comprehensive accessibility certification.

FAILED-CI, retained: [first run 37220011666](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37220011666) on `a1dd086f49f5f13bd5b7aed9bddb1ae369e3a003` passed aggregate checks/build then failed before browsers because the test had inserted the unique system follow-up date type under a random identifier. Duplicate-skipping catalog installation could not insert `system_follow_up`, and the real browser seed failed its stable-ID lookup with P2025. A fresh-database local run reproduced the same sequence. Using the canonical ID then passed all 34 focused tests and the actual browser seed in 24.014 seconds, exit zero. No product source or test expectation changed.

VERIFIED-CI: all six existing checks passed on exact corrected head `99e8e0b229216aa9239f1303447fd70586346d37`. [Full CI](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37222091452); security and all existing image jobs passed. Terminal stage summaries: Unit and integration tests: Test Files  299 passed | 3 skipped (302); Unit and integration tests: Tests  2282 passed | 11 skipped (2293); Qualify restored-database isolation on the packaged server: Test Files  1 passed (1); Qualify restored-database isolation on the packaged server: Tests  2 passed (2); Rehearse hosted fixture isolation, restarts and background imports locally: Test Files  1 passed (1); Rehearse hosted fixture isolation, restarts and background imports locally: Tests  7 passed (7); Browser fixture preflight: 9 passed (29.2s); Invited registration with captured synthetic mail: 3 skipped; Invited registration with captured synthetic mail: 13 passed (37.7s); Browser-driven end-to-end tests: 1 flaky; Browser-driven end-to-end tests: 211 skipped; Browser-driven end-to-end tests: 620 passed (43.1m); Staff onboarding, library, admission and voice capture with required MFA: 2 skipped; Staff onboarding, library, admission and voice capture with required MFA: 58 passed (3.5m); Staff and waitlist browser flows with isolated fixtures: 12 passed (49.3s). Configured skips remain skips; retained retry evidence is 2 marker(s). The prospective and actual normal-merge trees match this verified tree.

RETRY-PASSED, unresolved: the actual flaky case was mobile `e2e/today-navigation.spec.ts:200`, at line 213 waiting for Undo after Skip Beat. The first attempt found no Undo control within 10 seconds; its retry passed. The reporter's final counter misleadingly placed “retries” beside voice briefing; the explicit retry and terminal case summary identify Today. The exact original case then passed three desktop and three mobile executions with zero retries, skips or flakes in 79.998 seconds total. Its test, Today state/component and outcome path are unchanged from the base, and its fixtures bypass onboarding. The root cause remains unclassified; these checks do not prove the failure harmless, test-only or pre-existing. A bounded independent review approved this scoped release with that undiagnosed intermittent retained as a follow-up. All new onboarding cases passed without retry.

VERIFIED-REVIEW: actual installed Claude Code 2.1.289 requested and received `claude-sonnet-5-5` for full-source review and closeout, then `claude-opus-5-5` for release validation, the exact test-only follow-up and the final CI-retry assessment. The scoped release was approved; completed reviews exited zero. Combined reported list-price estimate for completed reviews is $0.824662; actual billing is unknown. An interrupted initial design review has unknown terminal usage and is not an approval. Earlier 2.1.288 returned an expired OAuth-session provider error despite a positive auth-status check. Later 2.1.289 actually completed provider requests. No credential/login change was made by this task; who or what restored OAuth capability is unknown.

VERIFIED-RUNTIME in production, read-only: fresh preflight and postflight checked both service commits, restricted `jitm_runtime` boundary, no recovery hold, all 73 migration checksums and unchanged counts `{"contacts": 4, "pending_jobs": 0, "users": 2, "workspaces": 1}`. Billing/automatic customer email, required verification/MFA and admission controls stayed unchanged. The worker reached the release commit with one fresh heartbeat before the web cutover; delivery, admission and queue counts stayed unchanged.

VERIFIED-RUNTIME: both live commits match `9ee96606b9ac2a0e9894f2982a21a33e4393d71b`; all six changed-file hashes per service, 17 homepage/login asset hashes and 4 onboarding client-chunk hashes match the deployed build. All 18 public smoke checks passed. Signed-out onboarding redirects to login. Three health rounds passed for live, ready, worker and recovery boundary. No jobs failed during the release window and pending jobs remained zero. The bounded Render error-log observation found zero error-level application logs from 2026-10-04T19:22:57.126411Z to 2026-10-04T19:36:22.633Z; it is not a historical or future guarantee.

## Release sequence

Draft PR #116 preserved the first failure, accepted the reviewed fixture correction and completed exact-head CI. Normal merge retained both commits. A fresh isolated merged-release worktree supplied the manifest. Read-only preflight passed; the existing worker deployed first, then the web service at the same commit with build cache kept. Postflight, hashes, public smoke and final health/count checks passed. Auto-deploy remains off. The annotated production tag names PR #116, both deploy IDs and the prior commit. This separate documentation PR does not change the running application.

Worker rollover observations: 2026-10-04T19:24:52.508619+00:00 UTC: runtime edaf12f9afbbef027e16f10f8b47d68768c9c864, fresh heartbeats 2, passed False; 2026-10-04T19:30:06.953173+00:00 UTC: runtime 9ee96606b9ac2a0e9894f2982a21a33e4393d71b, fresh heartbeats 1, passed True. The initial read-only check still reached the old instance after Render reported the new deploy live. Web was held through the existing documented 300-second shutdown window, then a bounded recheck verified the new runtime and a single fresh heartbeat. No process was killed or service setting changed; both attempts remain preserved.

Private timestamped receipts retain every check attempt. Original baseline and intermediate local fixture/type failures remain in the implementation evidence; none are presented as candidate successes. Protected shared checkouts and internal workers remained untouched.

## Recovery context

The schema is unchanged. The previous tag can be redeployed web then worker if needed; older code ignores onboarding receipts. No migration or data reversal is needed for code compatibility, but reverting also restores the old retry behavior. No rollback was performed, and no extra rollback prerequisite was introduced.

## Owner steps and NOT RUN

NOT RUN: live authenticated or synthetic-owner writes, full signup/reset/controlled-inbox acceptance, physical iPhone/Android/native handlers, real message delivery, invitations, customer admission, subscriptions or billing. Local fictional feedback and intercepted browser behavior do not prove external delivery. No new service, plan, credential or access/security setting was created or changed. No fresh backup was required by the owner's current instruction.

Kevin's remaining acceptance work is the actual tester login/device/inbox path and named support coverage. Existing tester devices should reload the application when they next use it; no tester messages were sent by this task. This verified repair alone does not clear all 10–20-person admission gates or prove customer outcomes.

## Follow-ups carried forward

- Existing monitor health returns 503 and no primary OperationsMonitor record is established. External outage-alert delivery and the actual Render failure-notification inbox receipt remain unverified; supervised operation is still required.
- The existing scheduled GitHub production smoke is useful read-only coverage, but prior multi-hour gaps and shared billing do not establish independent outage monitoring.
- Physical-device/inbox acceptance, support/operator ownership, existing offline/partial-network uncertainty and the prior demo-handler delivery limits remain open. Slow-database latency was not measured here.
- A fresh request for the same saved person and starter retains the baseline assignment conflict; receipt replay is not promised after cleanup. Any broader re-enrollment change needs its own scoped work.
- The mobile Today Undo/refill retry at `today-navigation.spec.ts:200` remains unclassified. Retain a trace and precise event/request timing on a future occurrence before proposing a repair; do not label the full CI run flake-free.
