# Lane 9 — Test suite health

> Written by the lead, who ran every command below on TrixBot against production commit `4b5abd8`. The reconciled findings are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md).

**Lane verdict.** The suites are healthy on the production commit, but they did not catch the two core-loop defects this audit reproduced (LOOP-01, DATA-01). The tests for those flows assert the wrong thing: one checks that a saved-date row exists, the other asserts the regeneration. CI has never finished a run on this code line, so the evidence below is the only full test record for `4b5abd8`.

## Results

| Check | Command (CI's environment unless noted) | Result | Evidence |
|---|---|---|---|
| Static validation | `npm run validate:static` | clean: schema, syntax, 625 files' imports and the Server Action boundary | [validate-static.txt](../runtime/validate-static.txt) |
| Types | `npm run typecheck` | clean (1 min 08 s, peak RSS 1.7 GB) | [typecheck.txt](../runtime/typecheck.txt) |
| Unit and integration | `vitest run --shard=N/6` on the empty `jitm_design_beta0926` database, with `RUN_PUSH_DATABASE_TESTS`, `RUN_PLAN_DATABASE_TESTS` and `RUN_WORKER_UNATTENDED_TESTS` on (as CI) | **2,159 passed, 10 skipped, 0 failed** (288 files) | [vitest-summary.txt](../runtime/vitest-summary.txt) |
| — the same without a PostgreSQL client | (first shard 1/3 run) | 5 tests and 2 suites fail with `spawn pg_dump ENOENT`. TrixBot has no `pg_dump`; a PostgreSQL 17.11 client on PATH fixes it. This is host tooling, not a product fault. | same |
| Build | `npm run build` | passed (2 min 42 s, peak RSS 1.7 GB, no warnings); `BUILD_ID FClny-lBDTPb9hLkpihc_` | [build.txt](../runtime/build.txt) |
| Encrypted backup and restore | `npm run db:rehearse-restore` (after seeding) | passed: backup → restore into `jitm_restore_*` → foreign-key and content checks | [db-rehearse-restore.txt](../runtime/db-rehearse-restore.txt) |
| Dependencies | `npm run security:audit` | passes at `--audit-level=high`; 1 moderate advisory (`baseline-browser-mapping`) | [npm-audit.txt](../runtime/npm-audit.txt) |
| Browser, main suite, desktop | `playwright test <5 files> --project=desktop-chromium` × 16 batches | 306 passed, **1 failed**, 80 skipped (gated suites) | [e2e/](../runtime/e2e/) |
| Browser, required-MFA staff group | the 14 CI files with their `*_E2E=1` flags | 54 passed, **1 failed**, 2 skipped | same |
| Browser, staff and waitlist group | 4 files with `STAFF_E2E`/`WAITLIST_E2E` against a server with `AUTH_REQUIRE_ADMIN_MFA=false` | 11 passed, **1 failed** | same |
| Browser, main suite, phone | `--project=mobile-chromium` (Pixel 7) × 16 batches | 257 passed, **1 failed**, 129 skipped (desktop-only tests) | same |
| CI on GitHub | read-only `gh` | `4b5abd8`: 0 check-runs. PR #83 (`a1f64aa`): `validate` cancelled at the 60-minute job cap, `secret-history` failed, image builds and the dependency audit passed. PR #82: `validate` cancelled at the cap. | [github-ci-state.txt](../runtime/github-ci-state.txt) |

## Browser failures, classified by rerun

Each failure was rerun alone, in its own file and repeatedly. Where a product defect was possible, the flow was reproduced by hand.

| Test | Group | Rerun evidence | Classification |
|---|---|---|---|
| `journey-connections.spec.ts:310` "delete an individual branch and a shared join…" | desktop | passes alone ([log](../runtime/e2e/rerun-jc-alone.txt)) and in its file, 17/17 ([log](../runtime/e2e/rerun-jc-file.txt)) | order-dependent test; noted in the C-1 record |
| `admin-workflow-regressions.spec.ts:92` "a different staff session cannot recover…" | MFA | 4 of 5 repeats pass, and once more with capture on ([log](../runtime/e2e/rerun-awr-repeat5.txt)) | timing race in the test (focus event against the periodic check); listed as order-only in the A2 record |
| `onboarding-invitations.spec.ts:60` "three mixed-channel invitations…" | phone | fails 4 of 4 ([log](../runtime/e2e/rerun-oi-repeat4.txt)). The failure screenshot shows the tapped card selected and no sheet. | test taps "Review" right after navigation, before the page is interactive. By hand the tap opens the review at 412 px and with the Pixel 7 profile ([e8](../runtime/walkthroughs/e8.txt), [e8b](../runtime/walkthroughs/e8b.txt)). Pre-existing: 1 of 6 on the live build per the D notes. |
| `staff-permissions.spec.ts:64` "an ended support cookie can be cleared…" | staff (MFA off) | fails 3 of 3 with `AUTH_REQUIRE_ADMIN_MFA=false` ([log](../runtime/e2e/rerun-sp.txt)). The whole file passes 6 of 6 with MFA required ([log](../runtime/e2e/rerun-sp-mfa-on.txt)). | CI configuration mismatch: the test expects the MFA step, and production requires MFA. CI would fail here if its browser step ever finished. |

**Totals: 628 passed and 4 failed across 632 executed tests.** None of the failures is caused by product code.
- The desktop, MFA and phone groups ran in one background job from 17:14 to 18:02 UTC; the staff group ran from 18:09 to 18:10 UTC.
- Batch logs: [../runtime/e2e/summary.txt](../runtime/e2e/summary.txt).
- The pre-existing failures listed in the A2 and B records all pass now (repaired in B, `5c0c1c7`, and in the D commits), apart from the three named above.

## Findings

### TEST-03 — Four browser tests fail for test reasons (LOW, VERIFIED by reruns)
See the classification table above. Fix direction: wait for hydration in the phone invitation test; run the staff group with MFA, or make `staff-permissions:64` depend on the flag; stabilise the two order- and timing-dependent tests.

### TEST-01 — Critical beta flows have no test that would catch today's defects (MEDIUM, VERIFIED)
- **Next promise.** `e2e/jump-outcome-timeline.spec.ts:98` asserts that a `JumpDate` labelled "Next commitment" exists. It never checks for a follow-up, so LOOP-01 passes it.
- **Completed follow-ups after settings changes.** `tests/draft-continuity.test.ts:98-109` asserts `created: 1` after a completed row plus a broadcast time change. That is the DATA-01 regeneration written down as expected behaviour. No test changes the weekend rule, time zone, quiet hours or working hours after a completion.
- **"Add to a mix" / "Start mix".** `e2e/relationship-vocabulary.spec.ts` and `e2e/mega-mixes.spec.ts` assert the "Start saved. Follow-ups are being prepared." notice, not the follow-ups (LOOP-02).
- **Invitation to first follow-up.** No test goes from an emailed invitation to the verification email to onboarding to the first follow-up. The specs seed a verified user, mint tokens in the database, or read rows. The "Save & schedule follow-up" path in a workspace set up the recommended way is untested (ONB-01).
- **Automatic email identity.** No test asserts the From and Reply-To of an automatic customer email (MSG-01).
- **Imports.** No test covers an Outlook export with `0/0/00` dates, a Windows-1252 CSV or a vCard 2.1 file (DATA-03, DATA-05).
- **Fix direction.** Add one test per item alongside the blocker fixes. Each is small, and each would have failed on `4b5abd8`.

### TEST-02 — The `secret-history` check fails on PR #83 and the reason is unknown (MEDIUM, VERIFIED gh / NOT RUN identity)
- **Evidence.** `gh pr checks 83`: `secret-history fail`. The job log is no longer retrievable. A local scan of the 267 commits not on `main` (`git log -p origin/main..4b5abd8`) found no AWS key, Resend key, webhook secret, private key, GitHub token or Render key pattern. `.gitleaksignore` already lists four fixture fingerprints of the `generic-api-key` rule, so a new fixture hit is the likely cause.
- **Fix direction.** Re-run the job, read the rule and file, then allowlist the fixture or rotate the secret.

### Pre-existing process findings (not new; see lane 0)
- **PRO-F1 (still open).** CI cannot finish the browser step within its 60-minute cap, so no release since 2026-09-17 has had a completed CI run.
- **PRO-F5 (now measured).** The spec suite result on `4b5abd8` is above.

## NOT RUN
- **Lighthouse CI's own `lhci autorun`.** It starts its own server on :3000, which would collide with the audit server. Lighthouse was run directly instead, on the local build and on production; see [lighthouse.txt](../runtime/lighthouse.txt) and the main report §5 lane 8.
- **The CI-only hosted suites** `tests/recovery-hold-runtime.integration.test.mjs` (`RUN_RECOVERY_WEB_TESTS`) and `tests/hosted-load-fixture.integration.test.mjs` (`RUN_HOSTED_LOAD_WEB_TESTS`), and `npm run load:qualify`. They need an owner connection with role-creation rights and exclusive use of the packaged server; they were not run, to keep the shared database untouched. 

**Outcome of the CI-only suites** ([ci-only-suites.txt](../runtime/ci-only-suites.txt)):
- The recovery-boundary suite (`RUN_RECOVERY_WEB_TESTS=true`) did run afterwards against the packaged build and passed 2 of 2.
- The hosted load-fixture rehearsal (`RUN_HOSTED_LOAD_WEB_TESTS=true`) failed to start its isolated fixture on TrixBot. All 5 tests stop at fixture start in about 0.1 s, which is environmental. The same CI step passed on PR #83 (run 36178561878, `a1f64aa`), so it counts as **NOT RUN here**.
- `npm run load:qualify` was not run; a Render-sized load run is in [free-plan-sizing.txt](../runtime/free-plan-sizing.txt).
