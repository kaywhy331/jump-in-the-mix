# Public-route Lighthouse reproducibility fix — October 16, 2026

VERIFIED: the six public routes pass the unchanged budgets in both complete local matrices: 18 baseline samples and 18 candidate samples. The candidate makes the existing measurement profile explicit, retains each attempt's conditions and distribution, rejects incomplete or unhealthy collections, and cleans up its own interrupted app/browser processes. No page optimization or production performance improvement is claimed.

The work is on `kaywhy331/dispatch-job_bec9f0eef6e0`, based on freshly verified main `0a50aedcb752c61242c784696f5570d8083155ce`. Prerequisites `18e5d33` and `e0fac67` were validated and applied as `75ce736` and `be0d3c8`. All four predecessor candidate hashes and 43 evidence hashes matched. Application source, public assets, schema and dependency versions remain main's; the local receipt binds the final candidate and evidence with SHA-256. No pull request was opened in this bounded dispatch.

## Scope, workflow and changes

WF-01 operations repair, WF-07 baseline investigation and WF-05 review; skills: `orca-fleet` (Trix), `orca-tokenpak`, `jitm-audit` and `jitm-review`. Applied JITM-10 §2.18, JITM-12 §2.1–§2.5, §2.13–§2.14 and §2.24–§2.25, JITM-13 §2.1–§2.2, and JITM-15 §2.16.

- [Configuration](../.lighthouserc.cjs): pin the already-effective mobile, CPU, network, locale and cold-storage settings; match the target URLs to the chosen local port.
- [Runner](../scripts/run-lighthouse.mjs) and [focused tests](../tests/lighthouse-evidence.test.mjs): retain all reports, conditions, warnings and sample values; verify route/sample completeness and effective settings; preserve budget failures; reject stale, duplicate, redirected, errored or unhealthy samples. Refuse occupied app ports. Each invocation has its own process group and temporary browser directory; Linux cleanup verifies the PID, profile and process group before stopping a detached browser.
- [Measurement guide](LIGHTHOUSE_MEASUREMENTS.md), [browser guide](BROWSER_E2E.md) and the package command: document the healthy fixture, exact profile, artifact interpretation and failure behavior.

VERIFIED: configuration comparison proves all assertions, all six paths and three samples per route remain unchanged. Each explicitly pinned setting equals the effective setting in all 18 baseline reports. LCP remains **2500 ms**; performance 0.90, accessibility 0.95, best practices 0.90 and CLS 0.1 remain unchanged. There is no automatic retry, discarded slow sample, budget increase or disabled assertion.

## Conditions and distributions

VERIFIED-RUNTIME: one local production build; Node 22.22.0, npm 10.9.4, LHCI 0.15.1, Lighthouse 12.6.1 and Playwright Chromium 145.0.7632.6. Linux host: four logical CPUs, i5-6300U, approximately 3.8 GiB RAM with swap. Heavy jobs ran serially. A task-owned loopback database with all 79 migrations supplied healthy manifest, browser-context, recovery-boundary and waitlist responses. The database was empty of customer data; no customer outreach was configured.

All samples used a 412 × 823 mobile viewport, scale 1.75, cold browser storage and a fourfold CPU multiplier. Observed DevTools throttling used 562.5 ms request latency, 1474.56 Kbit/s download and 675 Kbit/s upload. The controlled simulation used the same build and browser with 150 ms RTT and 1638.4 Kbit/s throughput. Each report records its effective settings, tool versions and CPU benchmark; these are lab conditions, not a physical-device equivalence.

The table lists chronological LCP samples in milliseconds, rounded only for display. The full-precision distributions remain in the raw reports and summaries. “Selected” is the existing `median-run` assertion: LHCI chooses a representative run near median FCP/interactivity, which can differ from numerical median LCP. Its aggregation was preserved.

| Route | Baseline samples | Median / selected | Candidate samples | Median / selected |
|---|---|---|---|---|
| `/` | 2201, 2186, 2225 | 2201 / 2186 | 2117, 2169, 2214 | 2169 / 2169 |
| `/for/real-estate-agents` | 2236, 2171, 2190 | 2190 / 2171 | 2168, 2175, 2283 | 2175 / 2175 |
| `/for/consultants` | 2168, 2168, 2191 | 2168 / 2168 | 2156, 2196, 2160 | 2160 / 2156 |
| `/for/photographers` | 2234, 2245, 2107 | 2234 / 2245 | 2169, 2190, 2192 | 2190 / 2192 |
| `/for/contractors` | 2229, 2258, 2168 | 2229 / 2229 | 2177, 2170, 2180 | 2177 / 2180 |
| `/for/independent-recruiters` | 2190, 2189, 2195 | 2190 / 2189 | 2208, 2203, 2195 | 2203 / 2203 |

VERIFIED-RUNTIME: baseline LCP was 2107–2258 ms, performance 0.92–0.95 and benchmark index 1407–1561. Candidate LCP was 2117–2283 ms, performance 0.93–0.95 and benchmark index 1141–1536.5. Candidate accessibility and best-practices scores were 1.00 and 1.00 throughout; maximum CLS was 0.000125. Both complete gates passed every assertion. All 36 healthy observed reports had zero HTTP error responses and zero run warnings.

### Controlled estimator comparison

VERIFIED-RUNTIME: five simulated photographers samples on identical built assets were **3043, 3041, 3044, 3045 and 3042 ms**, median 3043 and selected 3045 ms. The unchanged 2500 ms assertion failed and the runner returned 1 while retaining all five reports. The paired observed baseline for that route was 2234, 2245 and 2107 ms. The simulated run's benchmark range was 1494.5–1523.5, overlapping the observed baseline's range.

INFERRED: switching back to simulation would reintroduce estimator sensitivity rather than demonstrate a page-source regression. This experiment shows a stable higher estimate, not the bimodal distribution recorded historically in [issue #59](https://github.com/kaywhy331/jump-in-the-mix/issues/59). The original three-sample observed matrix already passed, so increasing the sample count was unnecessary. The chosen correction retains that method and improves fixture, process and evidence controls.

## Failed attempts and reproduced harness defects

VERIFIED-RUNTIME: the first local fixture had an unavailable database. Its document returned 200 while the manifest, browser-context and prefetched waitlist returned 503. Three homepage LCP samples were 2462, 2167 and 2128 ms with load-limit warnings; these were retained as setup failures and excluded from qualification. After applying migrations to the disposable fixture, those dependency routes returned 200 and the complete baseline had no such warnings.

VERIFIED-RUNTIME: interrupting the original collector produced **exit 0 with only three homepage reports**, omitting five required routes. The final runner's immediate interruption check reproduces upstream LHCI exit 0 with **1/18 reports**, then correctly returns 1 and releases the app port. An additional real interruption while the next browser was active returned 1, retained 1/18 reports, released the app port and proved the owned detached browser exited.

Development attempts are retained too: collector interruption first left an app process, and detached browsers survived the first cleanup approach. A subsequent full attempt was interrupted after detecting that server reuse; another was stopped to finish browser isolation. Earlier task-owned browser groups were identified by exact worktree, PID and profile and stopped before final verification. The new private temporary-directory cleanup closes that path. A strict development driver also failed because it expected upstream exit 0 when the one collected sample independently failed its budget (LCP 4819 ms, CPU benchmark 347); the actual incomplete-result rejection and port cleanup succeeded. That failed driver result is not overwritten by the corrected tests. Resource contention contributing to that slow sample is INFERRED, not an isolated causal finding.

## Verification and review

| Check | Evidence label and result |
|---|---|
| Locked install, client generation and production build | VERIFIED PASS; current task logs retained |
| Original healthy gate | VERIFIED PASS, 6 routes × 3 samples |
| Final canonical `PORT=3184 npm run test:lighthouse` | VERIFIED PASS, 6 routes × 3 samples; complete evidence and no warnings |
| Paired simulated diagnostic | VERIFIED FAIL at unchanged LCP budget, exit 1 retained |
| `npx vitest run tests/lighthouse-evidence.test.mjs` | VERIFIED PASS, 18 tests, no skips |
| Real partial-collection and active-browser interruption | VERIFIED PASS for failure detection and cleanup; intentionally incomplete measurement attempts |
| Static source validation and script syntax | VERIFIED PASS; 750 parsed files, 682 resolved imports |
| Configuration equivalence and whitespace | VERIFIED PASS |
| Twelve drift-baseline command groups | VERIFIED identical to the validated prerequisite output; no application-source drift |
| Standards checker | VERIFIED FAIL: two inherited AGENTS bootstrap conflicts, plus the existing JITM-09 length warning; unchanged from prerequisite evidence |
| Local browser fallback | VERIFIED PASS: four route/theme cases, eight screenshots after settled scrolling; hero visible, correct route, ready demo, focused field fully visible |
| Final resource cleanup | VERIFIED PASS: owned app and database stopped, ports 3184/55484 released, no task-owned Chrome remains |

Review verdict: Approve for the scoped task files. Scores: quality bar 3 for this local matrix; testing/evidence 3; documents 3; agent conduct 3. This is implementing-worker review, not independent QA or a release verdict. Inherited workspace standards errors remain separate from this diff.

| ID | Rule | Finding and correction | Evidence | Label | Severity |
|---|---|---|---|---|---|
| MEAS-01 | JITM-12 §2.3–§2.5 | An interrupted collection could pass with missing routes; exact sample/route coverage now fails it | Original partial export and final interruption receipts | VERIFIED | MEDIUM, corrected |
| MEAS-02 | JITM-12 §2.24–§2.25 | Interrupted app/browser processes could remain and affect later samples; occupied-port rejection and owned-process cleanup added | Real port and browser cleanup receipts, ownership test | VERIFIED | MEDIUM, corrected |
| MEAS-03 | JITM-12 §2.1 | The living guide generalized historical stability; it now requires current conditions and reports both LCP statistics | Browser/measurement guide diff and sample summaries | VERIFIED | LOW, corrected |

The native Orca browser was unavailable for the exact assigned workspace. The locked local browser therefore opened `http://127.0.0.1:3184/` and `/for/photographers` in light/dark mobile contexts, captured each hero, clicked its demo link and asserted the resulting route, ready state, focus and field visibility before capturing the settled page. No form or native-send control was activated. The private browser receipt lists the eight screenshots; initial captures taken during scrolling and a failed exact-center assumption are retained separately. Visual inspection confirmed the hero and focused draft in the light/dark captures.

## Document comparisons, gaps and handoff

The historical issue describes an older simulated-estimate race; this task does not claim to reproduce its bimodality. The living browser guide now distinguishes historical evidence from current measurements. JITM-10's budget wording and LHCI's `median-run` selector are both made explicit in the report; no policy or aggregation was changed. No new owner decision is needed for this scoped correction.

Raw evidence is private under `.artifacts/jitm04-20261016/` and `.artifacts/lighthouse/`. `README.md` in the former indexes failed attempts, distributions, commands, native-browser limitation and fallback, fixture cleanup and manifests. The final candidate, actual workspace, file hashes and dependent handoff are in its `HANDOFF.md` and `candidate-manifest.json`. Public-route application bytes remain unchanged; the prerequisite polling/fixture candidate is included for dependent tasks. The coordinator can review and integrate this exact local candidate before JITM-06 physical-device qualification. Hosted runner behavior still needs the separately authorized CI run; no production or field qualification follows from these lab results.

## NOT READ / NOT RUN

Production/customer data, private credentials and unrelated service state were NOT READ. Full application CI and unit/browser matrices, hosted Actions rerun, production/field performance, physical devices and assistive technology, image builds, load/backup/restore and migration rehearsals beyond the empty local fixture, non-Linux interrupted-browser cleanup, and an independent reviewer were NOT RUN for this tooling-only deliverable. Native Orca browser automation was BLOCKED by `browser_unavailable` on the exact assigned workspace; the locked local browser fallback is recorded separately. No push, public issue comment, PR, merge, deploy, provider spend, credential change or customer message was performed.
