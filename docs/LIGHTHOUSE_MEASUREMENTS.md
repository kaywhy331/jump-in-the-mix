# Public-route Lighthouse measurements

`npm run test:lighthouse` measures the homepage and five profession routes using the production build. The thresholds in [the configuration](../.lighthouserc.cjs) implement JITM-10 §2.18. In particular, the LCP limit remains **2500 ms**, with the existing `median-run` aggregation. There are three sequential samples per route and no automatic retries.

## Reproduce the fixture

Use an isolated worktree with the locked dependencies (`npm ci`) and installed Chromium (`npx playwright install chromium`). Run one heavy job at a time; stop other task-owned browsers and build processes before measuring (JITM-12 §2.24).

Configure the local test environment as in [Browser coverage](BROWSER_E2E.md) and [Local testing](LOCAL_TESTING.md): a disposable loopback `jitm_design_*` database with the current migrations, `APP_URL` matching the measurement origin, and automatic customer email off. The public document can return 200 while its manifest, browser-context request or prefetched pages return 503 if the database is unavailable. Such a fixture does not qualify the gate. No customer data or external sending is needed.

Generate the client, apply migrations to that local database and build with `npm run db:generate`, `npm run db:deploy` and `npm run build`. Prepare the standalone assets as CI does: copy `public` into `.next/standalone/public` and `.next/static` into `.next/standalone/.next/static`. The build, dependency installation and database work must finish before collection starts.

Choose a free port and run, for example, `PORT=3184 npm run test:lighthouse`. The runner binds its server to loopback and the configured URLs use the same port; the default remains 3000. It rejects an occupied port. The command starts and stops its own app server and gives each invocation a separate temporary browser directory. On Linux, interrupted detached browsers are stopped only after their recorded PID, unique profile and process group match; cleanup failure fails the command. Automatic cleanup of interrupted browser profiles on other operating systems is unqualified and reports a manual-cleanup error. Stop the disposable database when finished.

For a controlled diagnostic, use `node scripts/run-lighthouse.mjs --config=<local-config.cjs>` with a local copy of the configuration. Record the changed variable, keep the same built assets, and retain the whole attempt. A diagnostic that changes the measurement method or route matrix is not a passing run of the canonical gate.

## Fixed conditions and evidence

The configuration pins the existing mobile defaults: 412 × 823 viewport, device scale 1.75, cold storage, fourfold CPU slowdown, and DevTools network latency 562.5 ms with download 1474.56 Kbit/s and upload 675 Kbit/s. The simulation inputs remain 150 ms RTT and 1638.4 Kbit/s. Simulation and applied DevTools rates are different inputs; changing only RTT does not control DevTools latency. Fourfold slowdown is relative to the host CPU, not a hardware-independent phone speed.

Every invocation writes a distinct directory under `.artifacts/lighthouse/`:

- `conditions.json`: UTC start, source commit, build ID, configuration/lock hashes, tool versions, host memory/load, selected settings and unchanged assertions.
- Raw JSON and HTML reports, plus LHCI's manifest when collection reaches its filesystem export. Partial JSON reports are retained even when collection fails.
- `summary.json`: every sample in time order, LCP min/median/max, the LCP selected by the existing assertion, category scores, benchmark index, effective settings, LCP element, warnings, completeness errors, browser cleanup and command exit status. The raw assertion results are retained too.

The runner preserves LHCI's budget failure status and also fails for a missing route/sample, duplicate or stale sample, changed configured conditions, runtime error, missing metric/category/network evidence, redirect or HTTP error. This prevents an interrupted collector from succeeding merely because the subset it collected passed. It never drops a slow sample or increases a threshold. Warnings remain visible in both the summary and console; investigate them before interpreting the distribution.

## Interpret a comparison

Compare the same build, browser version, route set, storage state and settings. Read all samples and their benchmark indices. Report host conditions and failed first attempts as well as repeats (JITM-12 §2.4). A slower CPU or competing workload can change observed timing despite identical bytes. Do not lower the CPU multiplier, discard tails or keep retrying until the gate passes.

LHCI 0.15.1's `median-run` selects a representative run near the median FCP and interactivity values. Its LCP can differ from the numerical median LCP. The summary labels both and leaves the existing gate intact. Performance, accessibility and best-practices retain their existing aggregation too.

Use a healthy observed run as the current gate. A paired simulated run can diagnose estimator sensitivity; a clean pass under simulation does not replace an observed failure. If repeated healthy observed measurements exceed the budget, preserve the failing reports and identify the LCP element, network/CPU conditions and reproduction command. Investigate a page defect instead of weakening the gate. These are local mobile lab measurements, not production field data or physical-device qualification.
