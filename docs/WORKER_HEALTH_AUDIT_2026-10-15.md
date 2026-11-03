# Worker health and external uptime audit — October 15, 2026

> Historical evidence from candidate `68dfd3f`; observations and test results below are from October 15, not a current production health claim. On November 2, 2026, the disabled proposal was revised for JITM-M1-S2. Kevin's October 26 free-tier approval supersedes the missing recipient approval below; he enters the recipient privately. Follow the [current activation steps](INDEPENDENT_MONITOR_DEPLOYMENT.md#free-tier-b-08-activation--kevins-steps), not the historical input requests.

## Verdict and acceptance

**Current worker health was observed; B-08 activation preparation remains blocked on the account and alert recipient.** Public checks returned worker/readiness 200 and independent-monitor 503. These are separate signals. No current Render worker failure was reproduced, and issue #75's retired Netlify upload failure is not evidence of one.

This is Dispatch task JITM-02, not positioning standard JITM-02. Scope: current Render service configuration, heartbeat/recovery evidence, controlled local checks and a disabled external-monitor proposal. No application code, production configuration, customer data, messaging, billing or credentials changed. No account, monitor, alert, deployment, GitHub post or merge was created.

| Acceptance | Result and evidence |
|---|---|
| 1. Current host/services and heartbeat/health expectations | **VERIFIED-CODE/RUNTIME:** live Render service/deploy metadata, source contract and three public GET samples below. Environment overrides and exact heartbeat-row timestamps were not read. |
| 2. Controlled health/failure check or exact untested blocker | **VERIFIED-RUNTIME:** six local uptime tests and 30 focused worker/monitor tests passed. **BLOCKED:** full worker process qualification rejected the missing disposable loopback PostgreSQL configuration before starting a worker. |
| 3. Destination, cadence and recipient ready for scoped activation | **BLOCKED:** endpoint/cadence configuration is prepared, but no approved provider account or exact alert recipient is available. The coordinator confirmed this and asked Kevin; recipient/account fields remain null. Free-plan eligibility and provider control mapping also need verification. |

**Overall dispatch acceptance is incomplete.** The health audit and disabled proposal are reviewable deliverables; neither constitutes monitoring activation or alert-delivery qualification.

Workflow: WF-01/WF-07 with `jitm-audit`, the ReiPo role through `orca-fleet`/`orca-tokenpak`, and the Render monitoring skill. Governing rules: JITM-00 §2.3–§2.4 and §2.9; JITM-12 §2.1–§2.7, §2.13 and §2.21; JITM-14 §2.1–§2.5, §2.25 and §2.27–§2.30; JITM-15 §2.1–§2.2, §2.9–§2.10 and §2.16–§2.18; JITM-16 §2.5–§2.10; JITM-17 §2.12–§2.15.

## Baseline and prerequisite

**VERIFIED-RUNTIME:** fresh `origin/main` remains `0a50aedcb752c61242c784696f5570d8083155ce`. The assigned branch is `kaywhy331/dispatch-job_f291d6e5968c`. Prerequisite candidate `18e5d33065d1b7d35f06c4222be42aab2f37de7b` descends from that baseline; all three artifact SHA-256 values matched the supplied private handoff. It was cherry-picked as `b3599090314a980ef281b3e0a3e38f974f6e9c3f` before this task's documentation edits; `git diff 18e5d33 HEAD` then showed identical trees. The dirty registered root was not changed.

The [release-ledger audit](RELEASE_LEDGER_AUDIT_2026-10-15.md) supplies the prerequisite dispositions. #157/#158's completed Today/Profile work and #75's retired-host context remain outside this task. The release-note candidate #159 was not substituted for the current application commit.

## Current configuration and health contract

**VERIFIED-RUNTIME:** Render returned the following metadata on October 15 UTC. Both services are on branch `main`, have one instance in Oregon, use the `0.5c-512mb` plan, are not suspended, and have automatic deploys off. These describe existing services; no plan was changed.

| Service | Current configuration / deploy |
|---|---|
| Web `jump-in-the-mix-web`, `srv-dagt93lbedkc738552o0` | Public site `https://jumpinthemix.com`; Render URL `https://jump-in-the-mix-web.onrender.com`; starts `node --max-semi-space-size=8 .next/standalone/server.js`; platform health path `/api/health/ready`. Live deploy `dep-db7vv2rncjis73e3h700`, finished October 14 at 22:21:23 UTC. |
| Worker `jump-in-the-mix-worker`, `srv-dagta4uq1p3s738rnlr0` | Background worker; starts `node --import tsx src/worker/index.ts`. Live deploy `dep-db7vu58m7kps73cg7iq0`, finished October 14 at 22:17:21 UTC. |
| Application revision | Both live deploys name `0a50aedcb752c61242c784696f5570d8083155ce`, matching fresh main. |
| Failure notifications | Both service responses say `notifyOnFail: default`. This is inherited notification configuration, **not** proof of the effective workspace setting, recipient or inbox delivery. |

The service commands match [render.yaml](../render.yaml):37–78. **VERIFIED-CODE only:** the worker Blueprint requests a 300-second shutdown delay; the inspected Render response does not expose that value, so its live application is **NOT RUN**. The public worker endpoint is served by the web service and reads database evidence; it is not an HTTP port on the background worker.

| Signal | Actual source behavior | Limits |
|---|---|---|
| `/api/health/live` | `src/app/api/health/live/route.ts:1`: process responds with `status: ok` and a timestamp. | No database or worker check. |
| `/api/health/ready` | `src/app/api/health/ready/route.ts:4`: validates production configuration and the database release boundary; invalid configuration, unavailable/incompatible schema or recovery hold returns 503. | Does not check the worker or independent monitor. |
| `/api/health/worker` | `src/app/api/health/worker/route.ts:3`: latest RUNNING heartbeat must be no older than `WORKER_HEARTBEAT_STALE_SECONDS`; default 90 seconds, accepted range 30–3,600, invalid input falls back to 90. Missing/stale heartbeat or query error returns 503; responses use `no-store`. | No worker ID, deployment ID, exact age or job-progress proof is exposed. Live threshold override was not inspected. |
| `/api/health/monitor` | `src/app/api/health/monitor/route.ts:4`: `OperationsMonitor.primary` needs a completed observation, no last error, and age within `OPS_MONITOR_STALE_SECONDS` (default 900). | Measures the independent operations runner, not the customer worker, and does not certify all eleven operational checks as healthy. Missing/stale/error/query/configuration failure can all produce the same 503. |

**VERIFIED-CODE:** `src/worker/index.ts:24–35, 360–460` writes a heartbeat at startup, every 15 seconds and around work. Normal shutdown stops claims, drains or pauses current work and marks the worker STOPPED. Job leases last ten minutes and renew every 30 seconds; expired claims and saved import receipts support resumption. Maintenance runs at five-minute intervals, with notification-related passes every minute. The database release barrier runs before startup/claims and every 30 seconds in the persistent loop; an incompatible release or recovery hold prevents ordinary progress (`src/lib/database-release.ts:12,63,68`). A healthy heartbeat alone does not prove that a specific job completed.

**VERIFIED-RUNTIME, bounded history:** Render event queries for each service from October 14 22:00 UTC, limited to `server_failed`, `server_restarted`, `server_available` and `deploy_ended`, returned only the successful current deploy event. No failure/restart event appeared in those responses. This is not proof of restart behavior, complete log coverage or a historical uptime percentage.

## Public observations and recovery qualification

Three credential-free GET samples ran on October 15 at **13:44:08, 13:44:58 and 13:45:49 UTC**. Redirects were refused. No account was signed in and no job was created.

| Path | Sample 1 | Sample 2 | Sample 3 | Evidence |
|---|---|---|---|---|
| `/` | 200 | 200 | 200 | VERIFIED-RUNTIME, public site responding |
| `/api/health/live` | 200 | 200 | 200 | VERIFIED-RUNTIME, `ok`, advancing server timestamps |
| `/api/health/ready` | 200 | 200 | 200 | VERIFIED-RUNTIME, database `ready`, configuration `valid` |
| `/api/health/worker` | 200 | 200 | 200 | VERIFIED-RUNTIME, `ready` |
| `/api/health/monitor` | 503 | 503 | 503 | VERIFIED-RUNTIME, `not-ready` |

All responses reported Cloudflare `DYNAMIC`; ready/worker/monitor carried `Cache-Control: no-store`. The samples span about 101 seconds. **INFERRED:** if the live worker threshold is the source default of 90 seconds, heartbeat evidence advanced during this window; because environment values and raw heartbeat rows were not read, continuous 15-second cadence is not asserted.

**INFERRED:** the monitor result is consistent with the documented unactivated independent monitor. The public route cannot distinguish an absent monitor from stale observations, a saved error or a failed query; this audit does not claim to diagnose which condition produced it. Read only the operational monitor row/status and effective runner configuration in a separately scoped check before prescribing a repair. Do not lengthen freshness limits or seed a healthy row.

**VERIFIED-RUNTIME:** local controlled tests distinguish HTTP 200 from 503, reject redirects and network errors, fail when only `/monitor` is unhealthy, reject unsafe origins, and simulate unavailability without calling the product. The focused worker/monitor suites exercise lost-lease pause/retry behavior, durable outage/recovery deduplication, bounded retries and notification payload/destination validation, with mocked delivery only. See the [evidence index](worker-health-audit-2026-10-15/README.md) for commands, initial setup failures and results.

**BLOCKED:** `npm run worker:qualify` exited 1 at its guard: `Worker qualification requires a disposable jitm_design_ database on loopback.` `DATABASE_URL` was absent; PostgreSQL command-line tools were not on PATH. No process-crash, connection-outage or real five-minute maintenance case ran. The next validation needs a disposable local PostgreSQL server with permission to create/drop its own test database, matching generated client and blank delivery credentials. Production failure injection was not authorized and was not attempted.

## B-08 disabled activation proposal

**Updated November 2, 2026:** the [configuration proposal](worker-health-audit-2026-10-15/b08-monitor-proposal.json) is a provider-neutral specification, **not an executable vendor API payload**. It contains no credentials, recipient address or automation. All enable flags remain false; account and recipient references remain null. Kevin's free-tier approval is recorded in owner decision `note_9c3e64031d71595d`; signup and private recipient entry are his steps.

The two monitored URLs resolve from the current deployment's `APP_URL` plus `/api/health/live` and `/api/health/ready`, the public health paths in `src/proxy.ts`. Use HTTPS GET, require HTTP 200, verify TLS and refuse redirects. Cadence, timeout and incident/recovery thresholds remain unset until Kevin configures the provider. No detection or delivery time is promised. Incident and recovery email are intended; SMS, phone calls, webhooks and repeating reminders remain off.

These monitors establish web liveness/readiness only. Worker health and `/api/health/monitor` remain separate qualification work; the October monitor 503 below is historical, not a current observation. The existing paid [independent monitor package](INDEPENDENT_MONITOR_DEPLOYMENT.md) and `infra/operations/render-monitor.yaml` remain unactivated by this task. Their older cost figures were not requalified or approved.

**Provider selection evidence:** no existing approved external account was established. Better Stack's [current pricing page](https://betterstack.com/uptime/pricing/), read October 15 UTC, labels its zero-cost tier “Free for personal projects”; that does not establish eligibility for this business application. HetrixTools' [pricing page](https://hetrixtools.com/pricing/) returned a 403 page, so its current free limits/eligibility were not verified. Neither provider is selected or claimed ready. The proposal's zero-budget requirement prevents substituting a paid plan silently.

**Historical blocker, October 15:** the exact provider/account reference and approved recipient were unavailable, so acceptance 3 was incomplete. The later owner decision resolves the free-tier/recipient approval; the actual address stays private and must not be inferred from repository content. Provider eligibility, control mapping, signup and activation remain unverified.

The [activation guide](INDEPENDENT_MONITOR_DEPLOYMENT.md#free-tier-b-08-activation--kevins-steps) gives Kevin the remaining steps, including actual failure and recovery receipt checks using a controlled target. Confirm Render's effective inherited failure notifications separately. No account, monitor or alert was activated in this documentation task.

## Scheduled smoke and notification coverage

**VERIFIED-CODE:** `.github/workflows/production-smoke.yml:3–8,18–36` requests hourly execution at minute 17 UTC; it retries a failed smoke once after 60 seconds. `scripts/production-smoke.mjs:21` checks live/ready/worker, public pages, redirects and headers, but not the independent-monitor endpoint. Green smoke therefore does not contradict monitor 503.

**VERIFIED-RUNTIME:** the latest eight returned scheduled runs all succeeded. The most recent is [38743204215](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/38743204215), created October 15 at 13:30:00 UTC on `0a50aed`. Previous starts include 07:31:56 and 01:32:31 UTC that day. Adjacent starts across the returned history are about 192–364 minutes apart, not one hour. The cause is unverified; no schedule was changed or manually triggered. Successful runs prove those checks executed, not that a failed-run email reached Kevin. B-08 must remain independent of Actions under JITM-14 §2.30.

## Findings by dimension

Scoped JITM-17 §2.12 scores: engineering/worker recovery evidence **2**; testing/evidence **2**; release/monitoring coverage **1**; records **3**; agent conduct **3**. Other product, UI, device and design dimensions were not assessed. The scores concern this operational scope, not overall product readiness.

| ID | Rule | Finding and evidence | Label | Severity | Direction |
|---|---|---|---|---|---|
| MON-01 | JITM-14 §2.30 | B-08 has no established account/recipient or inbox failure/recovery receipt; Render's `default` notification setting does not prove those details. | VERIFIED-DOC/RUNTIME; delivery NOT RUN | HIGH, existing | Supply private input and separately authorize scoped activation/receipt qualification. |
| MON-02 | JITM-12 §2.1, §2.5; JITM-14 §2.30 | Independent-monitor health is 503 in all three samples; worker and ready are 200. Exact monitor cause remains unknown. | VERIFIED-RUNTIME; cause INFERRED only | MEDIUM | Inspect scoped monitor evidence; retain the 503 and existing thresholds until correctly resolved. |
| MON-03 | JITM-14 §2.30 | Hourly cron is configured, but eight returned scheduled successes have roughly 3–6 hour gaps. | VERIFIED-CODE/RUNTIME | MEDIUM | Investigate scheduling history/settings separately; do not depend on this for rapid independent outage alerts. |
| WRK-01 | JITM-12 §2.3, §2.6, §2.21 | Actual process-crash/restart and recurrence qualification did not run; local database guard failed. Live shutdown delay and exact heartbeat override are unverified. | BLOCKED / NOT RUN | MEDIUM, evidence gap | Supply disposable local PostgreSQL; run the existing process suite and retain its receipt. Inspect hosted settings only within approved scope. |

## Documents that disagree with each other

- JITM-14 §2.30/D13 requires a free external signal. The older independent-monitor deployment document prepares additional paid services and requires separate approval. It is not an approved free B-08 account or evidence of activation.
- Main's historical Actions-billing narrative is stale relative to current successful smoke runs and the prerequisite release-ledger audit. This task does not amend the pending standards/release-ledger work.

## Documents that disagree with code or live evidence

- `WORKER_RECOVERY_QUALIFICATION.md:21` says the Blueprint enables automatic deploys; current `render.yaml` and both live service responses have them off. JITM-14 §2.5 governs.
- `OPERATIONS_READINESS.md:58` retains an older web-first release sequence. JITM-14 §2.14 governs worker-first release order; no release was attempted.
- The smoke workflow's hourly description is a requested schedule, not the cadence demonstrated by the returned run history. Do not convert these successes into a claim of continuous hourly coverage.

## Gaps and questions for Kevin

No new product or policy decision was made. The coordinator has the pending input request: supply the approved free-monitor provider/account and the exact private alert recipient/contact. These are the only input fields that can complete the prepared activation handoff; provider eligibility and control mapping must then be checked. Enabling alerts and observing inbox delivery require the subsequent task's explicit scope.

All twelve drift command groups were rerun; their output is byte-identical to the verified prerequisite refresh. The [drift record](worker-health-audit-2026-10-15/DRIFT_BASELINE.md) carries counts and limits. No source was changed to improve a metric.

## NOT READ / NOT RUN

- NOT READ: customer records, raw production job payloads/logs, private inboxes, environment secret values, the exact heartbeat/operations-monitor database rows, effective workspace notification settings or provider account inventory. Render service inventory was attempted but blocked by the connector's missing selected workspace; named service reads succeeded. No absence of a monitor service is claimed.
- BLOCKED: full worker process qualification, for the exact local database prerequisite above. Initial sandbox/setup failures and successful permitted retries are retained in the evidence index.
- NOT RUN: production failure injection/restart, database writes or probes, hosted recovery/restore rehearsals, external alert/inbox qualification, monitor creation/activation, migrations, deploys, merges, public posting, billing/credential changes or customer messages.
- NOT RUN: full application build/typecheck, full database/integration/browser/CI suites, image builds, load qualification, Lighthouse, accessibility or physical-device checks. This task changes documentation/proposal artifacts only; its scoped local and public checks are listed with their limits.
