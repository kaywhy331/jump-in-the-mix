# Customer load qualification

Use authenticated page requests to assess how account size affects the server. `load:smoke` defaults to readiness; `LOAD_SMOKE_MODE=customer` adds Contacts, contact search, the second contacts page, Mixes, Today, and completed follow-up history. Each response must contain its expected heading and synthetic account marker, and must not contain another account’s marker. Redirects, expired sessions, streamed errors, failed body reads and oversized responses fail qualification.

## Local rehearsal

Build the current app, then run against an explicitly named loopback test database:

```bash
npm run db:generate
npm run build
DATABASE_URL=postgresql://jitm@127.0.0.1:55439/jitm_design_waitlist \
LOAD_SMOKE_CONCURRENCY=5 \
LOAD_SMOKE_DURATION_SECONDS=30 \
LOAD_SMOKE_MAX_REQUESTS=180 \
npm run load:qualify
```

Use the connection for your own isolated local PostgreSQL installation. The command uses that server to create a new, uniquely named database, applies the committed migrations, creates synthetic accounts, starts the standalone server on a loopback port, runs the probe, then stops its server and drops only its own database. It requires local database-creation permission and a current `.next/standalone/server.js` package. It does not migrate or seed the database named in the supplied URL.

Defaults are five accounts, 1,000 contacts per account, 24 completed/skipped historical follow-ups plus one pending follow-up per contact, and 30 mixes with six beats each per account. Contacts have synthetic notes, email addresses and tag memberships. Fixtures use UTC timestamps and real hashed session records. This exercises application session validation, workspace authorization, data access and server rendering; it does not measure password login or email admission. A worker is not launched and sender/push/dispatch credentials are blank in the child environment.

Optional `LOAD_FIXTURE_ACCOUNTS`, `LOAD_FIXTURE_CONTACTS`, `LOAD_FIXTURE_HISTORY` and `LOAD_FIXTURE_MIXES` change the profile within hard limits. The entire fixture is capped at 600,000 follow-ups. The command prints its private evidence directory and writes a JSON report containing the build ID, exact profile, database size, observed server peak RSS when available, and per-route measurements. `LOAD_FIXTURE_REPORT_FILE` additionally copies that credential-free report to a chosen path. Session credentials are held in a private temporary file and removed during normal/error/SIGTERM cleanup. A forced process or host kill still requires inspecting and removing the exact orphaned `jitm_design_load_...` database and private temporary directory; never remove another test database by pattern.

## Existing authorized staging accounts

Customer mode also accepts a private JSON file bound to the exact target origin:

```json
{
  "origin": "https://staging.example.com",
  "accounts": [
    { "marker": "LOAD_STAGING_OWNER_01", "cookie": "jitm_session=REPLACE_WITH_THE_SYNTHETIC_SESSION_TOKEN" }
  ]
}
```

Use synthetic account names containing only letters, digits, underscores or hyphens (12–100 characters) as markers. Each account needs a distinct name and its own valid session cookie from authorized staging sign-in. Store this file with mode 600. Do not use customer accounts, put tokens on a command line, commit the file, or attach it to an issue. Private-test Basic Auth deployments are not supported by this probe; use a separately authorized test environment rather than weakening its access gate.

```bash
LOAD_SMOKE_URL=https://staging.example.com \
LOAD_SMOKE_MODE=customer \
LOAD_SMOKE_ACCOUNTS_FILE=/private/path/load-accounts.json \
LOAD_TEST_ACKNOWLEDGE=true \
npm run load:smoke
```

The probe never follows redirects or forwards credentials to a different origin. It issues only the six fixed GET routes. Application GETs can still refresh sessions or wake an already-configured worker, so staging must have its normal delivery safeguards. This command is not authorization to run load against a public customer service.

## Reading the evidence

- Concurrency is the number of simultaneous requests in a closed-loop probe; each completed request starts another until the duration or request cap is reached. It is not a count of daily active users or a modeled arrival rate.
- First observations for each account/route are reported separately. They warm application/database caches but do not simulate a sleeping host or database cold start.
- Latency includes reading and validating the complete response. Header arrival timing is reported separately. A successful header followed by a failed body counts as one failed request. Body buffering is limited to 4 MiB per request and each request has a ten-second timeout.
- Limits apply to every route, so a fast page cannot hide a slow one. Each route needs at least ten measured requests; every account/route must appear in the measured run. Any detected account-data crossover fails regardless of the configured error allowance.
- Response bytes describe the received/decompressed HTML body, not compressed wire bytes, JavaScript hydration, browser responsiveness, LCP or INP. Peak RSS covers the observed web process, not all container/provider/database overhead.
- CI uses a smaller two-account fixture and a three-second per-route ceiling to catch functional/performance regressions on shared runners. That is not the public product’s capacity or responsiveness target. The updated workflow still needs a remote run.

## September 8 local observations

Both initial and optimized five-request runs completed 180 measured requests plus 30 first observations against five accounts, 5,000 contacts, 125,000 follow-ups and 150 mixes. All requests and account checks passed. The database occupied about 190 MB. These are single local runs on a shared machine; timing and memory differences are observations, not statistically established improvements or Render sizing evidence.

| Route | Initial full-response p95 | Optimized full-response p95 |
| --- | ---: | ---: |
| Contacts | 385 ms | 356 ms |
| Contact search | 360 ms | 334 ms |
| Contacts page 2 | 401 ms | 307 ms |
| Mixes | 474 ms | 368 ms |
| Today | 521 ms | 445 ms |
| Follow-up history | 503 ms | 411 ms |

The Mixes response fell from 739,384 to 503,522 bytes because the first page now contains 20 mixes. Navigation reaches the remaining results and preserves search/status filters; an out-of-range page is clamped to the last page. The query no longer counts follow-ups that the screen does not display or loads schedules for off-page mixes. Contacts now receives at most 50 aggregated follow-up summaries instead of every historical follow-up for those contacts; the database still evaluates the relevant history. No migration, paid cache or extra service is required.

Observed peak web RSS was about 447 MiB initially and 431 MiB afterward. Do not infer that a 512 MiB hosted service has enough headroom from those observations. Qualify the intended runtime under its actual memory/CPU limits, ordinary and burst traffic, imports/background work, idle wakeups and restarts. Measure those conditions before increasing invitation volume or selecting a larger paid instance. Browser/device performance and unattended worker qualification remain separate launch gates.

The optimized ten-concurrent-request run also passed all 240 measured requests plus 30 first observations. Per-route p95 ranged from 615 to 763 ms; observed peak web RSS was about 426 MiB. All six routes had 40 measured samples and every account/route was exercised. The variance in RSS reinforces the need for actual hosted headroom qualification. A separate live SIGTERM rehearsal confirmed unsuccessful exit, child shutdown, removal of the exact fixture database and removal of the private session file.

## Recovery-hold request check

After adding the per-request database catalog check, the same five-account profile passed 180 measured requests plus 30 first observations. Per-route full-response p95 was 314 ms for Contacts, 326 ms for search, 315 ms for page 2, 370 ms for Mixes, 448 ms for Today and 421 ms for follow-up history. Every route had 30 measured samples; no request or account-isolation check failed. Observed web peak RSS was about 408 MiB. The owned load database, server and session file were removed.

This single local run supports the request-check regression assessment; it does not establish hosted capacity. Its report records build `tre5rXMjkShJfEgmfqnW7`. A subsequent build changes only the recovery-held background-worker error instruction, with no change to the measured request path. Evidence is retained with the recovery-hold checkpoint.


## September 9 constrained Node runtime

GitHub CI at `96cdedd` completed 120 requests with no errors and a 111 ms overall p95, but the unconstrained web process peaked at about 554 MiB RSS. That result does not qualify the planned 512 MiB Render instance.

A follow-up used systemd cgroups with a **512 MiB memory limit, no swap and 50% CPU quota** on Node 22.23.2. The meaningful comparison constrained only the packaged web process; the traffic generator and PostgreSQL ran outside its cgroup. The fixture contained five accounts, 5,000 contacts, 125,000 follow-ups and 150 mixes, with five concurrent requests. No out-of-memory or memory-limit event occurred.

| Web runtime | Completed / errors | Overall p95 | Per-route p95 | Cgroup peak memory | Result |
| --- | --- | --- | --- | --- | --- |
| Default Node heap settings | 153 / 0 in 60 seconds | 3,473 ms | 3,085–3,553 ms | 275 MiB | Exceeded the existing 3-second route budget |
| `--max-semi-space-size=8` | 180 / 0 | 1,514 ms | 1,465–1,864 ms | 244 MiB | Passed the existing budget |

Node selected a roughly 259 MiB heap limit in the initial constrained controller probe. Its small default young-generation space is a performance tradeoff on low-memory instances; the [Node CLI documentation](https://github.com/nodejs/node/blob/v22.23.2/doc/api/cli.md#--max-semi-space-sizesize-in-mib) explains the semi-space setting. The Render start command and normal load qualifier now use the measured 8 MiB setting. The qualifier records its web Node options in the report.

These are local observations, not statistically established speedups or Render qualification. The database was not constrained to Render's planned compute size, and physical CPU performance and surrounding workload differ by host. Actual hosted capacity, sustained bursts, worker/database contention and restarts still need qualification before increasing invitation volume. Evidence is under `.artifacts/runtime-sizing/`; the earlier all-processes-limited control is retained separately because it also throttled the traffic generator and cannot isolate web-service capacity.
