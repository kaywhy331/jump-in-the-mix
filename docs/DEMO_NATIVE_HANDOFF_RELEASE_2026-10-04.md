# Public demo native handoff release

Live URL: https://jumpinthemix.com

UTC date: 2026-10-04

Scope: code-only; no schema or migration change.

Rollback context: previous production tag `prod-2026-10-03-01935f2` remains available; with the unchanged schema, rollback order is web then worker. No rollback was performed or made a new release gate.

| Item | Verified value |
|---|---|
| Previous production | `01935f2a22faab330acaed0c73151910a4b203a1` |
| Application commit | `edaf12f9afbbef027e16f10f8b47d68768c9c864` |
| Reviewed candidate / tree | `9a2fbe6f9802281e8c17eae8daa05b7cd5cb7051` / `ea78c1015e3c7ac4242e3e6ff946f66fc2db3a36` |
| Pull requests | [#113](https://github.com/kaywhy331/jump-in-the-mix/pull/113), [#114](https://github.com/kaywhy331/jump-in-the-mix/pull/114) |
| Production tag | `prod-2026-10-04-edaf12f` |
| Worker deploy / live UTC | `dep-db0pdlid0e5s73cldo10` / 2026-10-04T00:00:49.153354Z |
| Web deploy / live UTC | `dep-db0ph8ad0e5s73clr6pg` / 2026-10-04T00:10:16.755617Z |
| Final verification UTC | 2026-10-04T00:16:20.578177+00:00 |

## Changes and owner decisions

The public fictional demo now offers an ordinary user-click handoff for edited SMS and email drafts and a fictional call number. Opening an app does not mean a message was sent or a call completed. The page keeps drafts on return and changes its demo Beat only after the visitor records an outcome. Denied clipboard access retains the manual-copy path. The demo has no account writes, reply interpretation or real customer recipient; the separately proposed owned demo destination and autoresponder remain deferred.

The privacy test waits until the memory-only return tray subscribes before dispatching its synthetic event. It retains the blocked-storage assertions and changes no production privacy implementation. Original candidate commits `9ccd3a0338bf61ed18a3e6f3345a1863808aa280` and `2e732d0b6a85d4c5ade524ae7625cc7edb390bea` remain ancestors through normal merges.

Kevin explicitly approved pushing and deploying this batch. The bounded repair fixes the long fictional email hint at 200% text and updates a stale design assertion to the existing truthful copy. It adds no migration, dependency, service, plan upgrade, credentials or security setting. JITM-09 §2.67 and D31 record the public-demo contract. Kevin waived a fresh backup prerequisite for this batch. No fresh backup or production synthetic-owner write was performed.

## Verification

- VERIFIED: all six checks passed on each exact PR head. [PR 113 CI](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37155819149) finished with 602 ordinary browser passes, 211 configured skips and one preparation-polling case passing retry; later stages passed. [Final PR 114 CI](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37159777657): Unit and integration tests: 2268 passed, 11 explicit skips; Browser fixture preflight: 9 passed; Invited registration with captured synthetic mail: 3 skipped, 13 passed; Browser-driven end-to-end tests: 211 skipped, 615 passed; Staff onboarding, library, admission and voice capture with required MFA: 2 skipped, 58 passed; Staff and waitlist browser flows with isolated fixtures: 12 passed.
- VERIFIED: final candidate `npm run check` passed: 2,211 tests, 68 explicit fixture skips, static validation, typecheck and production build. Standards validation and whitespace checks passed.
- VERIFIED: focused demo/design coverage 24 passed without failures/skips/retries; guarded privacy 16 passed with 2 explicit legacy-HTTPS-proxy skips and no failures/retries; profession/homepage regression 19 passed with 5 configured duplicate-matrix skips. Checks before pinning were matched to final committed source by SHA-256.
- VERIFIED: all 18 doubled-text combinations fit (three channels, three widths, both themes); truthful status remains visible after enlargement. Narrow screenshots in both themes were inspected against the production-equivalent baseline. The existing cramped Beat-date labels at 200% text also appear in that baseline and remain a low visual follow-up. The native link, manual-copy, draft retention, explicit outcome, undo and reset paths were exercised with handlers intercepted.
- VERIFIED: 18 Lighthouse runs across six URLs passed all 30 unchanged configured assertions. Category aggregation remained optimistic; LCP/CLS used median-run. The cold performance minimum was 0.88; the unchanged configured aggregation passed. Per-run measurements and all failures remain in private receipts.
- VERIFIED: original combined-source review and independent repair review approved their scoped source. A separate native review accepted the measured offline test-transport classification. The repair used installed Claude Code 2.1.288 with requested and provider-reported `claude-sonnet-5-5`, exit 0, 8 turns, 301.16 seconds, $0.1183074 CLI list estimate; actual billing is unknown.
- VERIFIED: fresh read-only preflight and postflight on both existing Render services checked restricted runtime roles, recovery state, all 73 migration checksums and unchanged counts. Baseline and final counts were {'users': 2, 'workspaces': 1, 'contacts': 4, 'pending_jobs': 0}. Billing and automatic customer email stayed off; required verification/MFA and admission settings were unchanged. Worker cutover preceded web, with a fresh heartbeat and a read-only queue check creating nothing.
- VERIFIED: both live commits matched the merged main commit. All 11 changed-file hashes per service and 17 served asset hashes from homepage/login matched the release tree. All 18 public smoke checks passed. The anonymous rendered demo passed at phone and desktop widths in both themes with native handlers and all mutations intercepted. Three health rounds passed for live, ready, worker and recovery-boundary. No jobs failed during cutover and pending jobs remained zero. Render returned zero error-level application logs in the bounded release window 2026-10-03T23:59:09.824Z to 2026-10-04T00:15:08.152Z; this is not a historical guarantee.

## Preserved failures and bounded findings

Initial head `284d822` failed two design-adoption browser cases because they expected the old sentence; 610 cases passed, 211 were skipped and an unrelated Today zoom case passed retry. The new hint also overflowed at 200% text on narrow screens; the production-equivalent baseline fit. The three-file native repair and added test address those candidate findings.

The initial local privacy run failed its offline heading assertion. This was investigated rather than accepted merely as preexisting. With the original offline emulation, 19 of 20 repeats passed; the failing worker-owned navigation actually fetched HTTP 200 from the network while the page reported offline. The boundary remained hidden and inert, with no old-account content or private navigation cached. When the private fixture explicitly aborted that same worker request, all 20 repeats returned the unchanged worker's HTTP 503 offline page. The full final-head privacy suite then passed with assertions/timeouts unchanged. Independent review accepted this as a test-transport discrepancy, not a blanket privacy or release guarantee.

The committed offline helper still needs separate hardening for Chromium. The checking screen under partial reachability remains a user-visible follow-up on unchanged runtime. Real partial networks, physical devices and cross-engine behavior were not established by these measurements.

During the worker rollover, the first read-only SSH check at 2026-10-04T00:01:47.102333+00:00 still reached the old `01935f2` instance and saw two fresh heartbeats despite Render reporting the new deploy live. The web deployment was held. After the documented shutdown window, the single bounded recheck at 2026-10-04T00:06:28.710986+00:00 reached `edaf12f9afbbef027e16f10f8b47d68768c9c864`, saw one fresh heartbeat and unchanged queue/admission/delivery counts. Both attempts are preserved. No worker or SSH process was killed and no service setting changed.

## Release sequence and limits

The approved PRs merged normally, then the resulting main tree was verified against the tested candidate. A fresh isolated release worktree supplied the file manifest. Read-only preflight passed; the existing worker deployed first and the existing web service second with build cache retained. Postflight, public smoke, intercepted anonymous demo and final health/count checks passed. Auto-deploy remains off. The annotated production tag names both PRs, both deploy IDs and the previous commit. This record is a separate documentation PR and does not change the deployed application commit.

NOT RUN: actual SMS/email/call handler success or delivery, physical-device/assistive-technology checks, live authenticated or synthetic-owner writes, controlled-inbox checks, invitations/customer admission, subscriptions/billing, and an owned demo reply service. No real messages were sent.

Existing supervised-pilot limitations remain: monitor health returns 503, no primary OperationsMonitor record is established, external outage-alert delivery and Render inbox receipt are unverified. This release does not qualify unattended operation or authorize additional infrastructure or tester admission.
