# Hosted customer performance qualification

This procedure tests the deployed application with synthetic accounts in a new logical PostgreSQL database. It does not load customer accounts or create a public test service. Local lifecycle tests validate the tooling; only measurements taken on the intended hosted plans can qualify hosted performance. Both hosted baselines below missed the response-time budget; hosted performance remains unqualified.

## September 10 performance release repeat

PR #50 is live at `840261884697ed60d9df658d8c648a63ab1d5549`, with migration 48 applied. The repeated isolated web job served actual standalone build `oNK6I_Tf7y7N3Y8Bk2FNw`. It used the same five-account profile, six routes, five concurrent requests and 3,000 ms per-route p95 ceiling as the earlier baseline.

| Route | Earlier p95 | Released query changes p95 |
| --- | ---: | ---: |
| Contacts | 4,363 ms | 1,612 ms |
| Contact search | 2,141 ms | 1,543 ms |
| Contacts, page 2 | 2,224 ms | 1,901 ms |
| Mixes | 3,014 ms | 1,111 ms |
| Today | 7,633 ms | 1,424 ms |
| Completed follow-up history | 6,710 ms | 5,473 ms |

All 30 first observations and 180 measured requests returned the expected isolated pages without errors. Throughput increased from 1.68 to 3.59 requests per second. History remained over budget, so the controller stopped before burst, restart or background-contention qualification. Container peak memory was approximately 421 MiB, with no increased memory-limit events. Production readiness and worker health remained healthy, and the fixture database, role, tunnel and private files were removed.

The route improvements are measured results for this temporary-tunnel workload, not browser timings or an admission-capacity guarantee. A separate local experiment confirmed that the exact completed-history count reads table pages on a freshly populated table, then uses the existing index after PostgreSQL vacuum establishes row visibility. Counting the non-null status column instead did not provide a material reason to change application behavior. The larger database plan is prepared for an owner-approved capacity test; its recurring price is $19/month versus the current $6/month, with a brief database interruption during the change. No compute plan has been changed. See [Render pricing](https://render.com/pricing) and [changing a database compute plan](https://render.com/docs/postgresql-creating-connecting#changing-your-compute-plan).

## September 10 baseline and query follow-up

Application `405720f207d1de2cb47a0af6ad66e47597fdb891`, standalone build `SLBSaq04Vb-lqzOo4BrTl`, ran in an isolated Render job with observed limits of 0.5 CPU and 512 MiB. The database shared the production PostgreSQL plan (0.1 CPU, 256 MiB) while using separate synthetic rows and a restricted fixture role. The external generator connected through a temporary authenticated Cloudflare tunnel; the gate, tunnel and supervisor shared the web job's resources. These timings include that network path and do not measure the public Render edge or browser rendering.

Batched fixture tooling from PR #49 created the full five-account profile: 5,000 contacts, 125,000 follow-ups and 150 mixes. All 30 first observations and 180 measured requests returned the expected isolated pages without errors. At five concurrent requests, four of the six routes exceeded the unchanged 3,000 ms full-response p95 limit:

| Route | Full-response p95 |
| --- | ---: |
| Contacts | 4,363 ms |
| Contact search | 2,141 ms |
| Contacts, page 2 | 2,224 ms |
| Mixes | 3,014 ms |
| Today | 7,633 ms |
| Completed follow-up history | 6,710 ms |

The controller stopped after the failing baseline, so burst, restarts and background contention were not run. Web container peak memory was approximately 373 MiB with no new memory-limit events. Production readiness and worker observations remained healthy. The fixture database, role, tunnel and private transferred files were removed; the job finished successfully after reporting the failed performance result.

Local PostgreSQL query profiling then identified two unnecessary reads: fetching completed history even when pending work already filled the page, and a combined pagination probe that scanned all 125,000 rows to establish that no earlier page existed. The candidate reads ordering groups only as needed, probes them separately, retains additive daily date constraints, and adds a completion-date index. Navigation, filters and workspace boundaries remain required regression checks. These local results do not qualify the candidate's hosted performance; repeat the original profile and budgets after release.

A temporary tunnel is an alternative when registered SSH access is unavailable. Use separate Render one-off web and worker jobs from the exact reviewed build. Keep the tunnel target on loopback and enforce an exact synthetic-session allowlist, fixed customer routes and a separate secret for fixed control/import operations. Retain both application and uploaded tooling commits/checksums. The tunnel must expose only synthetic fixture operations, receive no production delivery credentials, and stop with exact-target cleanup. See [Render one-off jobs](https://render.com/docs/one-off-jobs) and [Cloudflare temporary tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Execution boundaries

Use separate temporary instances of the reviewed web and worker release. [Render ephemeral SSH instances](https://render.com/docs/ssh) receive no public traffic and do not run the service start command. They use the latest successful build and are billed for their duration; confirm the actual commit and plan before starting. They are deleted after the SSH connection closes, with a maximum lifetime of 24 hours. Stop their processes and verify fixture cleanup before disconnecting. Do not create an instance before confirming the account's registered SSH key works.

The database remains on its private network. [Render supports additional logical databases](https://render.com/docs/postgresql-creating-connecting) on an existing instance. This isolates fixture rows, but shares database CPU, memory and storage with the source service. Observe public readiness and worker health from outside Render during setup and measurement. Stop if the public service becomes unhealthy, memory events increase, or database capacity approaches its limit. Do not increase instance sizes or admission limits to make a test pass without the corresponding authorization.

Keep the traffic generator outside the web container. An SSH forward must bind to `127.0.0.1` on both ends and use the same port as the private plan. The reported origin is that loopback address. This measures the web application, managed database and SSH/network path; it does not measure the public CDN, browser rendering or physical-device responsiveness. SSH and the fixture supervisor consume some of the container's resources, so retain container-level measurements alongside the web process's peak RSS.

## Private configuration

Prepare a JSON plan locally in a mode-600 file. Use fresh random identifiers and keys for each run; never put its contents in a command, log, PR or chat:

| Field | Required value |
| --- | --- |
| `version` | `1` |
| `id` | 12 lowercase hexadecimal characters from six random bytes |
| `token` | 64 hexadecimal characters from 32 random bytes |
| `sourceUrl` | Independently retrieved migration-owner URL for the reviewed source database |
| `sourceHash` | `loadSourceHash(sourceUrl)` from `scripts/lib/hosted-load-plan.mjs` |
| `expectedCommit` | Exact 40-character Git commit deployed to both temporary instances |
| `port` | An unused loopback port, 1024–65535 |
| `expiresAt` | ISO timestamp, preferably 45 minutes ahead; hard maximum 90 minutes |
| `profile` | `{ "accounts": 5, "contactsPerAccount": 1000, "historyPerContact": 24, "mixesPerAccount": 30, "beatsPerMix": 6 }` |

Transfer the plan over authenticated SSH as private file contents. Keep the independently retrieved owner credential out of shared service environment variables. Preserve the reviewed source identity and exact release commit; a connection override in the URL query string is refused. Use the matching script revision and committed migrations. If tooling is uploaded separately from the deployed build, retain both the tooling commit and application commit in the evidence.

On the temporary web instance, from the application directory:

```bash
node scripts/serve-hosted-load-fixture.mjs /private/run/plan.json /private/run/output
```

The output directory must not already exist. Keep stdin connected. The supervisor verifies source ownership and absence of a recovery hold, creates `jitm_design_load_<id>` with an ownership marker, migrates only that fresh target, and creates `jitm_load_<id>` with an expiring password. It refuses existing database/role names. The test login receives application DML, read-only migration evidence, and no ownership or role-creation rights. Metadata checks reject inherited access to source application tables, sequences, schema creation or security-definer functions. Source customer rows are neither queried nor changed by the supervisor.

It then seeds the bounded profile, analyzes the target and starts the standalone web server. The child receives only an allowlisted environment with synthetic encryption/rate-limit keys and no real email, push, AWS, webhook or dispatch credentials. Packaged Next environment files are refused before database access so they cannot restore production credentials. Output files `accounts.json` and `worker.json` have mode 600. Copy the accounts file privately to the external traffic generator; give the temporary worker only `worker.json`, which contains the restricted fixture URL and synthetic keys. Do not give it the source plan. Synthetic account sessions last one hour; setup and tests must finish within that window.

On the matching temporary worker instance:

```bash
node scripts/run-hosted-load-worker.mjs /private/run/worker.json
```

The worker is the existing native application worker, with delivery credentials removed and a deadline before fixture expiry. Build-commit mismatches fail before it starts.

## Required observations

Retain credential-free JSON from supervisor stdout and the external probe, plus instance IDs/plans, app/tooling commits, Node version, timestamps and source-health observations. Keep `process.log` private. Do not upload plan/account/worker files as CI artifacts.

1. Record initial readiness and the first authenticated page observations separately. This is startup of an owned web process on an already running container/database, not a sleeping-host or database cold-start result.
2. Run the six fixed routes in customer mode with five concurrent requests, the representative profile above, zero allowed errors, and the existing 3,000 ms per-route full-response p95 ceiling. Then run a ten-concurrent-request burst with the same thresholds. Allow at least ten measured samples per route and cover every account/route. Record time limits and request caps rather than inferring a daily active-user capacity.
3. Send `snapshot` on the supervisor's stdin before and after each measured phase. Snapshots include cgroup memory/CPU counters, peak web RSS, fixture database size, job/import aggregates and contact counts. Compare counters over time; a cumulative peak cannot identify which phase caused it.
4. Queue a synthetic contact import through the existing authenticated `POST /api/contacts/import` API with `mode: "queue"` and valid records/resolutions. Run the actual fixture worker on its separate hosted plan while probing pages. Record the import size, successful completion, failed jobs and route budgets during contention. Starting a worker without confirmed overlapping work is not contention evidence.
5. Send `restart` and `crash-restart` separately. Each stops only the owned fixture web process, starts it again and emits readiness timing. Confirm authenticated pages still work and jobs complete without duplication. These observations do not qualify Render supervisor failover, managed-database restarts or unavailable-source recovery.
6. Stop the fixture worker first, then send `stop` to the supervisor. Require `databaseRemoved`, `roleRemoved` and `credentialsRemoved` to be true in the cleanup receipt. Check the exact database and role are absent, remove every transferred plan/account/worker copy, and disconnect both temporary instances. Confirm their termination and public service health.

The existing [load probe](CUSTOMER_LOAD_QUALIFICATION.md) accepts the private accounts file and exact loopback origin. Run it with a clean environment and no alert credentials; a failing probe must not send an unapproved operational email. Do not treat changing the profile, concurrency or thresholds as passing the originally intended workload.

## Failure handling and local validation

SIGINT, SIGTERM, stdin closure and expiry stop the owned web process and attempt exact-target cleanup. Existing or changed ownership markers are refused. SIGKILL, a disconnected host, database unavailability or failed cleanup can leave resources behind. Preserve the private plan, inspect only its exact identifiers and original ownership markers, and remove confirmed owned leftovers with the operator credential. Never drop databases or roles by a name pattern. A password deadline does not terminate existing database sessions.

The executable lifecycle suite uses a newly created, migrated loopback source with a sentinel account. It checks actual source read/write denial, authenticated account isolation, graceful/forced web restart, queued imports with the native worker, cancellation cleanup, recovery holds, inherited PUBLIC privileges and refusal to adopt an existing database. Build and prepare the standalone assets first, then run:

```bash
RUN_HOSTED_LOAD_WEB_TESTS=true npx vitest run tests/hosted-load-fixture.integration.test.mjs
```

`DATABASE_URL` must point to an owned loopback `jitm_design_` test installation with database/role creation permission. The ordinary unit suite checks plan identities, query overrides, private-file permissions, expiration, fixture bounds and credential stripping. CI runs the lifecycle suite after preparing the standalone package and before switching its browser tests to restricted credentials. These checks establish tool behavior, not hosted performance.

## September 12 follow-up: the completed-history cursor

Local profiling on the documented fixture (five accounts, 5,000 contacts, 125,000 follow-ups) found why the completed-history view stayed over budget. Its cursor predicate, `scheduledAt < X OR (scheduledAt = X AND id < Y)`, is not a B-tree range, so PostgreSQL walked the workspace's whole DONE group as a heap filter on every request: the first-page "previous page" probe alone filtered 20,000 rows and read about 2,590 buffers. `withinGroup` in `src/lib/today-list.ts` now adds the inclusive bound the OR already implies (`scheduledAt >= X` after the cursor, `<= X` before it), so the scan starts at the cursor. Result sets, order and cursors are unchanged; the six database-backed cursor cases in `tests/today-list.integration.test.ts` pass.

Measured locally with `EXPLAIN (ANALYZE, BUFFERS)` on the exact statements Prisma issues: the first-page probe fell from 2,590 buffers to 29, the last-page probe from 2,652 to 3, and a middle-cursor page from 1,416 to 29. An interleaved A/B of the full page's database work at five concurrent workers moved p95 from 443 ms to 152 ms on a fully cached local database. These are local numbers; the hosted workload above must be re-run to confirm the 3,000 ms budget on the 0.1-CPU database. No index change is needed; an optional `("workspaceId", "status", "scheduledAt", "id")` index would make the probes index-only but is not required.

