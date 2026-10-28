# Preparation polling and fixture cancellation — October 16, 2026

The polling check now waits for completed preparation and account-session responses before advancing its fake clock. The cancellation check uses the minimum valid fixture profile, waits separately for cleanup and process exit, and independently verifies released resources. Application behavior, owner-reviewed outreach, production configuration and schema are unchanged.

This is the bounded JITM-03 Dispatch task, not a release. Branch: `kaywhy331/dispatch-job_43892d860591`. No pull request or public update was made under this task's local-only scope.

## Baseline and scope

- **VERIFIED-RUNTIME:** `git ls-remote origin refs/heads/main` returned `0a50aedcb752c61242c784696f5570d8083155ce` at intake. The assigned isolated workspace already contained prerequisite `18e5d33065d1b7d35f06c4222be42aab2f37de7b`. Its [ledger report](RELEASE_LEDGER_AUDIT_2026-10-15.md), [evidence index](release-ledger-audit-2026-10-15/README.md) and [drift record](release-ledger-audit-2026-10-15/DRIFT_BASELINE.md) matched all three hashes in the prerequisite receipt.
- **VERIFIED-CODE:** that prerequisite changes documentation only. The application and dependency sources match main, so the baseline and repaired tests use the same local production build. The fixture controller is exercised directly from the candidate source.
- **VERIFIED-RUNTIME:** validation uses an owned loopback `jitm_design_*` database, synthetic records, one heavy job at a time and browser retries disabled. The dirty registered root and inherited Orca bootstrap files were preserved.
- Workflow: WF-01, WF-04 and scoped WF-05; skills: `orca-fleet` (Trix), `orca-tokenpak`, `jitm-feature`, `jitm-review`. Rules: JITM-01 §2.1–§2.2; JITM-09 §2.25; JITM-11 §2.1, §2.4; JITM-12 §2.1–§2.5, §2.13–§2.15, §2.20–§2.25; JITM-13 §2.1–§2.2, §2.11; JITM-15 §2.8, §2.10; JITM-16 §2.5–§2.6, §2.12–§2.15.

The concept fit is dependable verification of the owner's preparation status and isolated test resources. No user workflow or owner decision changes.

## Findings and changes

**VERIFIED-CODE/RUNTIME — preparation:** [the browser spec](../e2e/preparation.spec.ts) previously counted a routed request before its response had finished. Advancing 65 seconds could fire the request's 10-second abort timer instead of reaching the intended delayed state. The revised check pins the initial instant, validates the completed response, allows its continuation to settle, and retains the hidden-tab, minute cutoff, manual resume and unmount assertions.

The minute jump also starts a real account-session request. The test now waits for that response before its next clock advance, preserving the account boundary. Contacts can restore the last profile and mount another preparation notice, so the unmount check now navigates to Settings and verifies the notice is absent before checking that requests stop. The Today case checks malformed JSON and an actual transport failure separately from delayed preparation, then verifies recovery.

**VERIFIED-CODE/RUNTIME — cancellation:** [the fixture controller](../scripts/serve-hosted-load-fixture.mjs) emits `cleanup-progress` events before stopping the web child, closing the fixture connection, removing the database, removing the role, closing the owner/log and removing credentials. These events expose the current cleanup stage without changing ownership checks or cleanup operations.

[The lifecycle test](../tests/hosted-load-fixture.integration.test.mjs) uses the existing minimum profile: two accounts, 100 contacts each, one history entry, two Mixes per account and six Beats per Mix. This follows the option recorded in [issue #60's owner comment](https://github.com/kaywhy331/jump-in-the-mix/issues/60#issuecomment-5659180524). Cancellation still occurs synchronously on readiness, retaining the initial-snapshot race check. The existing 90-second total limit stays unchanged; readiness, cleanup and exit waits are bounded at 60, 20 and 5 seconds, with event diagnostics on timeout.

The test requires all six progress phases, exactly one successful cleanup receipt, no failure event and an exit code of zero without a terminating signal. It checks actual credential-file removal, can bind the released listening port, and retains the database/role absence and unchanged source-sentinel assertions. No existing check is skipped or global timeout increased.

## Verification

All results below are **VERIFIED-RUNTIME** in this dispatch unless explicitly described as historical document evidence. Raw logs, diagnostic copies and manifests remain private in `.artifacts/jitm03/`.

| Check | Result | Evidence |
|---|---|---|
| Local production build, application identical to main | PASS with 3072 MiB heap; the preceding inherited 1536 MiB attempt failed with heap exhaustion during type checking | `build-baseline.log`, `build-retry.log` |
| Unchanged polling, five runs per desktop/phone project | 10 passed, no retries | `preparation-baseline.log` |
| Original polling with only 250 ms of controlled response latency | FAIL: expected delayed, observed request-timeout error | `preparation-baseline-latency.log`, `baseline-latency.spec.ts` |
| Final polling with the same controlled latency, five runs per project | 10 passed, no retries | `preparation-candidate-latency.log`, `candidate-latency.spec.ts` |
| Both affected browser cases, five runs per project | 20 passed, no retries or skips | `preparation-candidate-repeated.log` |
| Complete preparation browser spec, desktop and phone | 12 passed, no retries or skips; includes accessibility, drafts and recovery | `preparation-candidate-full.log` |
| Original cancellation in three independent processes | 3 passed; historical 90-second overrun not reproduced | `cancellation-baseline-1.log` through `-3.log` |
| Final cancellation in five independent processes | 5 passed: 14.225, 15.827, 15.806, 14.091 and 13.991 seconds | `cancellation-candidate-1.log` through `-5.log` |
| Preparation integration/routes/variants, hosted-plan boundaries and complete fixture lifecycle | 48 passed across five files, no skips | `focused-suites.log` |
| Static validation and dependency tree | PASS: schema, 749 parsed files, 682 import checks; installed direct dependencies match `package.json` | `validate-static.log`, `dependencies.log` |
| Candidate semantic type check, script syntax and whitespace | PASS | `typecheck.log`; both changed scripts checked with `node --check`; `git diff --check` |
| Resource cleanup | PASS: zero fixture databases, roles or preparation accounts remain; task database stopped and both task ports released | `resource-cleanup.json`, `postgres-shutdown.log`, `listeners-after.txt` |
| Standards checker | FAIL: two inherited Orca bootstrap conflicts in `AGENTS.md`, plus the existing JITM-09 length warning | `standards-check.log` |

The controlled latency failure is an abort-timeout variant of [#74](https://github.com/kaywhy331/jump-in-the-mix/issues/74), not a natural reproduction of its exact historical “couldn’t check” wording. The new transport-failure assertion explicitly verifies that wording cannot satisfy the delayed-state check. No claim is made that every historical CI failure is resolved.

Each cancellation-only run filters out six other lifecycle cases; those excluded cases are not counted as passes. The complete five-file run executes all seven lifecycle cases and also passes cancellation, in 10.355 seconds.

Development failures remain recorded: pausing before navigation blocked streamed hydration; a preparation-only response wait exposed the separate account-check timeout; navigation to Contacts exposed the restored-profile assumption. Their logs are `preparation-candidate-latency-hydration-failed.log`, `preparation-candidate-latency-account-failed.log` and `preparation-candidate-latency-unmount-failed.log`. The account diagnostic was stopped after two failures, with one interrupted and seven unrun cases; the Contacts diagnostic had two passes, one failure and seven unrun cases. These are retained alongside the final passing matrix.

Reproduction commands use the task's private synthetic environment (`source .artifacts/jitm03/env.sh`):

```sh
NODE_OPTIONS=--max-old-space-size=3072 npm run build
node node_modules/@playwright/test/cli.js test e2e/preparation.spec.ts --grep 'polling pauses|Today distinguishes' --repeat-each=5 --retries=0 --workers=1 --reporter=line
node node_modules/@playwright/test/cli.js test e2e/preparation.spec.ts --retries=0 --workers=1 --reporter=line
RUN_HOSTED_LOAD_WEB_TESTS=true node node_modules/vitest/vitest.mjs run tests/hosted-load-fixture.integration.test.mjs tests/hosted-load-plan.test.mjs tests/preparation.integration.test.ts tests/preparation-routes.test.ts tests/preparation-variants.test.ts --reporter=verbose
RUN_HOSTED_LOAD_WEB_TESTS=true node node_modules/vitest/vitest.mjs run tests/hosted-load-fixture.integration.test.mjs -t 'cleans up after controller cancellation' --reporter=verbose
npm run validate:static
NODE_OPTIONS=--max-old-space-size=3072 npm run typecheck
```

The standalone build also needs `public` and `.next/static` copied into its packaged directory, as in the existing CI workflow. The private latency copy inserts a 250 ms host-side delay before fulfilling only the mocked preparation response; it is preserved for reproduction and is not part of the committed test suite.

## Remaining scope and handoff

**VERIFIED-CODE/RUNTIME — scoped self-review:** Approve. Scores under JITM-17 §2.12: constitution/truth 3, engineering 3, testing/evidence 3, Git/review 3, records 3 and agent conduct 3. No introduced finding remains in the four-file candidate. The standards-check failure belongs to preserved, unstaged bootstrap content; it is not reported as a passing check. This is the implementing worker's review, not independent QA.

**VERIFIED-DOC:** the retained diagnostic artifact for main CI `38645868998` ends with one failed desktop held-review case in `today-person-cards.spec.ts`, one flaky Profile keyboard case in `today-momentum.spec.ts`, 828 passes and 272 skips. Preparation passed there. Those failures remain separate follow-ups; this task does not claim to repair them or make full CI green.

JITM-04 can consume this local candidate for its own isolated measurement task. The application remains at main's behavior; the changed controller supplies cleanup progress and the tests have current polling/unmount semantics. The exact candidate commit, hashes, workspace, shutdown evidence and private log index are in `.artifacts/jitm03/HANDOFF.md`. Integrating or publishing it needs the coordinator's separately authorized workflow; no merge, deploy or public message occurred here.

## NOT RUN

- Full project `npm run check`/CI and the entire browser matrix: scoped validation under JITM-12 §2.13; unrelated failures are not reclassified.
- Fresh dependency installation: `npm ls --depth=0` validates the preserved installation's direct dependencies against `package.json`; no dependency or lockfile changed.
- Hosted CI rerun, public issue updates, production smoke, live-provider/worker qualification, Lighthouse, image builds, backup/restore rehearsals and physical-device checks: outside the assigned local repair scope.
- A second identical application build: no application, dependency or schema source changed; candidate browser tests use the verified main application build.
