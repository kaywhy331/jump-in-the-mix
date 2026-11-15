# Tester feedback and button contrast — October 3, 2026

Live: https://jumpinthemix.com. Web cutover: 2026-10-03T17:34:51.520416Z UTC. This code-only release ships the reviewed tester-feedback preview and accessibility corrections through PR #111. No database migration or additional service was needed. Kevin authorized this deployment as a supervised pilot; this record does not declare tester admission or unattended operating readiness. Recovery policy: retain exact GitHub versions and correct database issues forward; separate code/database rollback packages and a fresh release-only backup were waived by Kevin.

| Item | Verified value |
|---|---|
| Previous production | `6cf9ad6356226a99667d7aac980f969408660283`; `prod-2026-10-01-6cf9ad6` |
| Exact validated PR head | `25f7f3ec2b15e3d89172516f6778ffa9302dafb5` |
| Application merge | `01935f2a22faab330acaed0c73151910a4b203a1`; [PR #111](https://github.com/kaywhy331/jump-in-the-mix/pull/111) |
| Release tree | `c3dd861c5b6a659227b104e08404e3dc6e0b4a79`; identical to the validated head and CI checkout |
| Production tag | `prod-2026-10-03-01935f2` |
| Migration | None; all 73 applied migration checksums match |
| Dependencies | Reviewed dependency updates from PR #111; no deployment-only package or runtime installed |
| Worker | `dep-db0jmcugekts73a0h6fg`; live 2026-10-03T17:29:37.995469Z UTC |
| Web | `dep-db0jnljncjis739qu1h0`; live 2026-10-03T17:34:51.520416Z UTC; existing cached native Node build |
| Final check | 2026-10-03T17:35:56.645443+00:00 UTC |

## What changed

- Help can save a blocked-follow-up report into the existing private support conversation. The exact redacted title/body preview includes the saved-length limits and optional coarse diagnostics. Entered text survives failed saves.
- Shared client/server formatting preserves multipart line endings, reserves space for diagnostics and maintains authentication, tenancy and view-only support boundaries.
- Shared action buttons retain matching foreground/background themes throughout transitions. Focused frame-level coverage verifies recovery controls in normal, hover and keyboard-focus states.
- The PR carries the already reviewed dependency, staff reflow/contrast, font-loading and guarded synthetic mail-fixture corrections. Test synchronization remains scoped to those changes.

## Decisions

1. Kevin explicitly instructed: “JITM, I approve. push forward and get it deployed.” The release used only the existing worker and web services, with their plans, credentials, access boundaries and deployment commands unchanged. “Supervised pilot” describes operating scope; `PILOT_MODE` remains `false` and production security requirements remain enabled.
2. Kevin waived separate rollback/backup prerequisites for this exact release. No fresh backup-to-S3 job was triggered solely for the release. Existing backup services and schedules were unchanged. Database corrections remain forward-only under the reviewed change process.
3. The missing optional paid operations collector is not an added prerequisite for this approved deployment. JITM-14 §2.30 states: “While any of these is off, every release record lists it under owner follow-ups.” Monitor health remains truthfully 503. No new monitor worker, disk, AWS resource, account, recipient or security setting was created.
4. No invitations, customer admission, synthetic production accounts, operational notifications or billing activation occurred. Live checks were read-only. The standard authenticated synthetic-owner smoke remains **NOT RUN** under this task's narrower production-write scope; public smoke and source/asset identity are separate evidence.
5. Completed candidate tests and independent reviews were retained with their original scopes. No full suite or model review was repeated merely because the identical tree was merged. Native provider work already recorded in PR #111 remains the source of implementation/review provenance; ordinary deployment shell commands are not model execution.

## Verification

**VERIFIED-TREE:** merge `01935f2` has parents previous production `6cf9ad6` and validated head `25f7f3e`. Its tree equals the candidate and actual CI checkout `150150f5e71580649cb7a503cd436e65c5470cf1`. A fresh isolated release worktree was used; the frozen tester worktree and its existing documentation changes were untouched. The release manifest contains 47 changed files and no deletions.

**VERIFIED-RUNTIME, pre-release:** exact-head [CI](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37107905822), [Docker build](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37107905836) and [Security](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37107905826) succeeded. CI recorded 2,266 unit/integration passes with 11 skips; broad browser 603 passes with 211 skips; staff/MFA 58 passes with two skips; isolated staff/waitlist 12 passes. Lighthouse and image builds passed. These are separate overlapping stages, not additive totals. The final local focused correction passed 28 desktop/mobile cases without retries, failures or skips; its frame regression first failed on the prior candidate. Earlier intermittent failures and original failed-head results remain in PR #111.

**VERIFIED-REVIEW, bounded scopes:** the button correction's independent native review returned PASS. The original full support review remains CHANGES REQUESTED followed by a separate narrow correction PASS; earlier Group C remains INCOMPLETE. None is relabeled as a blanket full-release PASS. Existing source reconciliation and acceptance evidence are preserved.

**VERIFIED-RUNTIME, live:** 18/18 committed public-smoke checks passed, with zero failures/skips: live/readiness/worker health, public pages, signed-out redirects and CSP/nonce/HSTS/frame headers. Three final rounds of live/readiness/worker health returned 200. Recovery boundary returned 200/clear. Monitor returned 503/not-ready, the unchanged and recorded coverage gap. On each live instance all 47 release files match the release SHA-256 manifest; 15 assets referenced by the login document match the bytes served from the deployment. This asset scope does not claim an exhaustive signed-in bundle/browser check.

**VERIFIED-RUNTIME, database and queues:** both instances report `01935f2`; all 73 migrations match; `jitm_runtime` remains restricted and ready; recovery is clear. Counts remain two users, one workspace, four contacts and zero pending jobs. No jobs failed since deployment began. Waitlist/support delivery counts, the October 7 waitlist schedule and admission policy are unchanged. One worker heartbeat is fresh; 37 stale historical RUNNING heartbeat rows are database records, not proof of active processes, and were left untouched. Billing and automatic customer email remain unset/false; required email verification and staff MFA remain true. No synthetic rows were created, and no cleanup was needed. Rate-limit state and authenticated flows were not requalified.

## Release steps and results

1. Refreshed target/service configuration, CI identity, read-only private database/queue checks and three-round public health. Application and security preflight passed at 17:19–17:24 UTC. A local syntax error and a mistyped expected-tree guard stopped two coordination attempts before any GitHub mutation; both were corrected against the existing validated receipt.
2. Reconciled the release checklist with the approved pilot scope and JITM-14 §2.30, preserving the missing-alert evidence. Marked PR #111 ready and merged using an exact-head guard at 17:27:08 UTC; verified the resulting main tree.
3. Created a clean isolated worktree and file manifest. Triggered the worker at 17:28:19 UTC. Verified the new worker's actual commit, fresh heartbeat and unchanged queues using a read-only transaction before starting the web deploy.
4. Triggered web at 17:31:02 UTC with cache retained. The existing pre-deploy role verification, schema verification and idempotent system catalog command completed as part of the live deployment. No migration or permission-changing command was introduced.
5. Ran the committed public smoke, service file/asset identity checks, database/queue postflight and final three health rounds. Render returned no application error-level logs from 2026-10-03T17:28:19Z through 2026-10-03T17:36:16.34430428Z; this is a bounded log observation, not a complete historical guarantee.
6. Pushed the annotated production tag with PR, deploy IDs and previous commit. A documentation-only publication guard then stopped before commit because its whitespace-trimmed Git status comparison was incorrect; the check was corrected to compare tracked and untracked file names explicitly. The tag and production deployment were unaffected. The record and feature-map evidence passed `standards:check` and diff checks before publication in this separate PR. Private machine receipts are retained under the release worktree's ignored `.artifacts/` directory and are not committed.

## Recovery policy

The previous and current application commits and production tags remain in GitHub. Kevin's release-specific decision removes a separate rollback package or database restore prerequisite; it does not authorize unreviewed database edits. Any required correction follows the normal scoped review and release process. No schema reversal is needed for this code-only release. No backup configuration changed.

## Owner follow-ups and NOT RUN

- **Operating coverage / tester admission:** no existing authorized external uptime-checker connection was identified. Qualify a suitable existing or separately approved free checker on the public site and application health, and test delivery to Kevin. The active GitHub production-smoke workflow is useful but shares CI billing and has observed multi-hour scheduling gaps. It is not independent outage coverage.
- Render `notifyOnFail` remains `default`; actual destination and inbox receipt are unverified. Monitor 503 remains open. No paid monitor infrastructure was requested as a condition of this pilot deploy. Manual supervised operation does not establish an unattended service guarantee.
- Before inviting testers: controlled-inbox round trip with a named recipient/operator, device and assistive-technology qualification, live authenticated workflow qualification, named support coverage and explicit acceptance of carryover findings remain open. No invitation wave or admission was initiated here.
- **NOT RUN:** live synthetic-owner/browser writes; real message/inbox delivery; physical iPhone/Android and assistive technology; sustained multi-user load; real Stripe test-mode purchase; external-alert inbox delivery; restore rehearsal; a new backup solely for this release; exhaustive signed-in asset/browser checks. The prior candidate browser and Lighthouse evidence is separate from these live limitations.
- Historical billing review BIL-01 and real Stripe qualification remain gates to evaluate before billing activation; this release did not requalify them. Plan-limit implementation from PR #109 was already in the previous production commit. Earlier COPY-01, VOC-01, TRU-01 and release-script follow-ups are not closed by this deployment. Historical failures are not assumed to persist or to be fixed without fresh evidence.

This record reports a deployed supervised pilot with the listed limits. It grants neither tester admission nor a date for unattended readiness.
