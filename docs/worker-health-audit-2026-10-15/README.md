# Worker health audit evidence

> Historical October 15 evidence imported from `68dfd3f`. The November 2 documentation task revises only the disabled proposal and activation guidance; the runtime checks listed here were not rerun. For the current owner steps, see the [activation guide](../INDEPENDENT_MONITOR_DEPLOYMENT.md#free-tier-b-08-activation--kevins-steps).

Parent: [Worker health and external uptime audit](../WORKER_HEALTH_AUDIT_2026-10-15.md). All dates/times are UTC. Application source is `0a50aedcb752c61242c784696f5570d8083155ce`; prerequisite documentation is imported as `b3599090314a980ef281b3e0a3e38f974f6e9c3f`. No application source changed during these checks.

## Source register

| Source | Evidence / scope |
|---|---|
| [Prerequisite audit](../RELEASE_LEDGER_AUDIT_2026-10-15.md) and private handoff | VERIFIED-DOC/RUNTIME: source candidate `18e5d33`, common base `0a50aed`, all three committed file hashes matched; cherry-picked before editing. The required private handoff was present. |
| [Render Blueprint](../../render.yaml), `src/worker/index.ts`, health routes | VERIFIED-CODE: actual commands, heartbeat/lease intervals and endpoint semantics. |
| [Recovery runbook](../WORKER_RECOVERY_QUALIFICATION.md), `src/lib/database-release.ts` | VERIFIED-CODE/DOC: release/recovery barrier, process-suite prerequisites and evidence limitations. |
| [Operations alerts](../OPERATIONAL_ALERTS.md), `src/lib/operations-policy.ts` | VERIFIED-CODE/DOC: independent runner, default 300-second cadence / 900-second freshness; distinct from external HTTP checks whose cadence is now an activation-time setting. |
| [Independent deployment package](../INDEPENDENT_MONITOR_DEPLOYMENT.md), `infra/operations/uptime.py` | VERIFIED-CODE/DOC: pre-existing paid activation package and controlled availability-check failure path; no activation inferred. |
| [D13](../standards-audit-2026-09-28/OWNER_DECISIONS.md#d13--outage-alerting-question-1) | VERIFIED-DOC: free external outage signal independent of CI, with actual alert delivery to Kevin. |
| [Scheduled smoke](../../.github/workflows/production-smoke.yml), `scripts/production-smoke.mjs` | VERIFIED-CODE: hourly cron, one retry and endpoint scope. GitHub history is separate runtime evidence. |
| Installed Next.js route-handler guide | VERIFIED-DOC: read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`; no Next.js code was written. |

## Commands and results

| Check | Result |
|---|---|
| `git fetch origin`; ancestry/hash checks; prerequisite cherry-pick; `git diff 18e5d33 HEAD` immediately after import | VERIFIED-RUNTIME PASS. Main remains `0a50aed`. Initial fetch hit read-only shared Git metadata; permitted retry succeeded. Only the assigned branch was updated. |
| Render `get_service`, `list_deploys` on the two named service IDs | VERIFIED-RUNTIME: both live at `0a50aed`, auto-deploy off; startup commands and web readiness path agree with source. Private responses retained. |
| Render `list_events`, from October 14 22:00 UTC, four event types, limit 20 per service | VERIFIED-RUNTIME: only each current successful deploy event was returned; no failure/restart in those bounded responses. No complete historical uptime or restart claim. |
| Render `list_services` | BLOCKED: connector required a selected workspace. No workspace was guessed. Named service reads remained available; monitor absence was not established. |
| Credential-free GET collection, three samples 50 seconds apart | VERIFIED-RUNTIME: 15 observations at October 15 13:44:08–13:45:49 UTC; homepage/live/ready/worker each 200 three times, monitor 503 three times. No redirects followed or private data retained. Initial sandbox DNS failure was resolved by a permitted network retry. |
| `gh run list --repo kaywhy331/jump-in-the-mix --workflow production-smoke.yml --limit 8 --json databaseId,event,status,conclusion,headSha,createdAt,updatedAt,url` | VERIFIED-RUNTIME: eight scheduled successes; latest `38743204215`, October 15 13:30 UTC. Adjacent start gaps 358.07, 359.42, 191.62, 219.33, 293.25, 363.57, 347.07 minutes. Initial sandbox API connection failed; permitted retry succeeded. |
| `python3 -m unittest discover -s tests -p uptime_test.py -v` | VERIFIED-RUNTIME PASS, six tests. First sandbox attempt failed before any test: loopback socket `PermissionError`. Permitted rerun passed. Mocked/fake HTTP responses and the local test server are not a provider or production delivery test. |
| `npm ci --include=dev --no-audit --no-fund` | VERIFIED-RUNTIME PASS on permitted retry, 566 packages installed. First attempt failed in esbuild's binary check with `EPERM`; initial log retained. Deprecation warnings remained. No dependency manifest/lockfile changed. |
| Focused test command below, before client generation | VERIFIED-RUNTIME FAIL: 16 tests passed; worker suite could not collect because the generated Prisma client was absent. Setup failure, not a product regression. |
| `npm run db:generate` | VERIFIED-RUNTIME PASS: generated client and schema-release metadata, 79 migrations / 118 models. No database migration was applied. |
| Same focused test command after client generation | VERIFIED-RUNTIME PASS: three files, 30 tests, 2.48 seconds. Worker pause/lease behavior and operations notification bounds/recovery use mocked dependencies/delivery; no live database or external recipient was contacted. |
| `npm run worker:qualify` | BLOCKED, exit 1 before spawning tests: missing loopback `jitm_design_*` database configuration. `DATABASE_URL` was absent; `psql`, `pg_ctl` and `pg_isready` were not on PATH. No actual process-crash or five-minute recurrence test passed in this audit. |
| All twelve original drift groups | VERIFIED-RUNTIME PASS: output byte-identical to the prerequisite refresh; see [drift record](DRIFT_BASELINE.md). |

The focused tests ran with a synthetic loopback URL to a closed port and blank operational/Resend destinations:

```sh
DATABASE_URL=postgresql://synthetic@127.0.0.1:1/jitm_design_worker_health OPS_ALERT_WEBHOOK_URL='' OPS_ALERT_SNS_TOPIC_ARN='' RESEND_API_KEY='' npm exec vitest run tests/worker-shutdown.test.ts tests/operations-monitor.test.ts tests/operations-sns.test.ts --reporter=verbose
```

These tests mock database/delivery behavior. This URL is not a working process-qualification database.

## Files and private evidence

- [Disabled B-08 proposal](b08-monitor-proposal.json): provider-neutral configuration; all enable flags false, private account/recipient null. It is not a deployable provider payload.
- [Drift refresh](DRIFT_BASELINE.md): all twelve groups compared with prerequisite output.
- Private evidence stays in `.artifacts/worker-health-20261015/`: `render-evidence.json`, `render-final-events.json`, `public-health.py`, `public-health.jsonl`, `production-smoke-runs.json`, `npm-ci.log`, `npm-ci-retry.log`, `db-generate.log`, `focused-tests.log`, `focused-tests-retry.log`, `worker-qualify.log`, `run-drift.sh`, `drift-output.txt` and provider-page captures. Python test results are recorded from the tool transcript above.
- The private `HANDOFF.md` carries the actual workspace, candidate commit, artifact hashes, coordinator input checkpoint and exact next steps. No private evidence is staged.

## Documentation validation

**VERIFIED-RUNTIME:** `npm run standards:check` passed (18 standards, eight workflows, seven skills, 44 documents in its configured scope), with the pre-existing 359-line JITM-09 warning. Staged whitespace passed. The scoped artifact validator passed all 19 relative links in the three new Markdown documents, the disabled proposal's null private inputs/zero budget/HTTPS destinations, and all 15 recorded public observations. The private handoff retains the commands and final file hashes. These checks validate the artifacts, not provider configuration or production recovery.

## NOT READ / NOT RUN

Raw customer/production database rows, job payloads, secret environment values, private inboxes, exact provider/account configuration and effective Render workspace notifications were not read. Full process qualification is BLOCKED as above. Full application/CI/browser/device/restore/load suites, live failure injection, provider delivery, activation, production writes, deployment, merging and public posting were NOT RUN; no such results are claimed.
