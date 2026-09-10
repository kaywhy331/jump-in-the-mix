# Hosted customer performance qualification

This procedure tests the deployed application with synthetic accounts in a new logical PostgreSQL database. It does not load customer accounts or create a public test service. Local lifecycle tests validate the tooling; only measurements taken on the intended hosted plans can qualify hosted performance. No hosted capacity result is recorded yet.

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
