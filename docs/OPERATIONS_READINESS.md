# Operations readiness

## Health

- `/api/health/live` proves the web process can answer.
- `/api/health/ready` checks PostgreSQL release compatibility, absence of an application recovery hold, and production configuration.
- `/api/health/monitor` checks whether the independent monitor completed recently; it does not certify that every product check is healthy.
- `/api/health/worker` proves a worker heartbeat is newer than `WORKER_HEARTBEAT_STALE_SECONDS` (90 seconds by default).

Alert independently on these endpoints. A live web process with an unhealthy worker does not satisfy the product promise.

The dedicated Netlify test site uses a 180-second worker threshold, verified with a ready response at about 177 seconds and a not-ready response at about 199 seconds. Its dispatch setting must cover preview deployments as well as production, because promoting a preview retains that environment. Activity-triggered wakeup now passes the hosted check; recurring unattended processing remains a separate qualification. See [Netlify deployment](NETLIFY_DEPLOYMENT.md#publishing-a-separately-built-test-package).

## Encrypted backup and restore

Configure a dedicated `BACKUP_ENCRYPTION_KEY`; never reuse `DATA_ENCRYPTION_KEY`. `npm run db:backup` creates an authenticated encrypted archive plus an authenticated version-two manifest with checksum, PostgreSQL version, applied migrations, and every base table in the selected schema. Each table has a row count and an order-independent SHA-256 content digest, including migration history. Newly added tables need no manual verification list. Keep both files private and copy both to durable encrypted storage. Backup refuses a source with an application recovery hold.

The manifest and `pg_dump` share one exported, read-only PostgreSQL snapshot. Normal application writes may continue during backup; avoid schema migrations until capture completes. Contents are hashed inside PostgreSQL, and verification transfers only hashes and counts. SHA-256 of sorted JSONB row hashes is identified as `sha256-jsonb-sorted-v1`; it verifies restored row values without depending on physical row order.

Production in-place restore is blocked. Set `RESTORE_DATABASE_URL` to a separate empty, isolated database with the same schema name as the source and an owner recovery credential. Stop other target clients, then run:

```bash
npm run db:restore -- --input /secure/pre-release.jitm-backup.enc
npm run db:smoke-restored
```

Restore applies the SQL in one transaction, then checks table inventory, every recorded count and digest, migrations and extensions. The smoke check discovers all declared foreign keys, including composite keys, nullable keys and references into other schemas. Version-one archives remain readable with their original count-based checks; they cannot prove content equality. Reusing an existing archive or decrypted-output filename fails without deleting that existing file.

Restore installs a database-level application hold before loading data and retains it after verification. The matching web release returns 503 for dynamic access and the worker release barrier refuses claims. Unsigned legacy manifests are readable but cannot qualify a trusted restore receipt. Successful archive/foreign-key checks do not reconcile later deletions, revoked access or send decisions. The available-source full-bundle, restrictions, cutoff and guarded-release path is implemented; do not manually clear the hold. Follow [Restore recovery](RESTORE_RECOVERY.md), including isolation and database-role limitations.

The [recovery-state commands](RECOVERY_STATE.md) capture encrypted source restrictions and hashed row inventories, then compare them with a held restore using the authenticated backup manifest. Their report is read-only and explicitly does not permit reopening. The separate [restriction plan/apply command](RECOVERY_RESTRICTIONS.md) applies selected deletion, access and customer-send restrictions in one transaction, retaining the hold and an idempotent receipt. For full captured contents and recorded send history, use `db:backup-recovery` and restore its matching three-file bundle into a fresh target. The [complete-bundle runbook](RECOVERY_BUNDLES.md) also provides the reviewed available-source cutoff operation, which takes that source offline and can bind its receipt to the exact restricted target. [Guarded target release](RECOVERY_REOPENING.md) now restores fresh Owner password/MFA, invalidates disabled integration credentials and rebuilds safe background work. Independent storage/key recovery, source-unavailable history, actual provider delivery and hosted qualification remain open.

CI/local rehearsal creates and removes its own temporary target **on the source server**. Use it only where temporary databases are authorized. To qualify a hosted source without creating hosted fixtures, take its backup separately, provision an empty loopback database, and use the restore/smoke commands above against that local target.

```bash
npm run db:rehearse-restore
```

For the recovery regression suite, set `RECOVERY_TEST_DATABASE_URL` to a loopback PostgreSQL instance whose role can create databases, then run `npx vitest run tests/backup-database.integration.test.mjs`. The suite owns and removes unique databases; it rejects remote hosts. It requires `pg_dump`, `pg_restore` and `psql` on PATH. Set `OPS_ALERT_WEBHOOK_URL=''` during local verification to suppress external alerts. CI enables this suite against its PostgreSQL service.

Keep the archive from before the dormant-feature retirement migration until the release is fully qualified; it may contain sensitive data that no longer has a table in the current schema.

## Staging and release

Use a production-like staging origin, private PostgreSQL, a real worker, and a dedicated synthetic account:

```bash
STAGING_BASE_URL=https://staging.example.com \
STAGING_SMOKE_USER_EMAIL=smoke@example.com \
STAGING_SMOKE_USER_PASSWORD='from-secret-manager' \
npm run smoke:staging
```

The smoke verifies web/database readiness, current worker heartbeat, sign-in, and core authenticated routes on desktop and mobile profiles. Provider qualification separately verifies email inbox placement, Google/Apple consent, push permission/delivery, and optional Twilio delivery. Physical iPhone and Android native handoffs remain required.

Release order is backup → restore proof → immutable build → migration → ready web → ready worker → automated smoke → manual provider/device checks → reopen traffic. Record commit, backup identifier, migration output, health results, and operator. The import recovery release adds a required stop-and-drain step for older workers before migration; follow [worker recovery](WORKER_RECOVERY_QUALIFICATION.md#upgrade-from-older-import-code).

That order describes an upgrade of the authoritative database. Promoting a restored target additionally requires the unfinished reconciliation and guarded reopening in [Restore recovery](RESTORE_RECOVERY.md). A backup rehearsal receipt does not release that target's hold.

## Worker and jobs

Run at least one continuously supervised worker. It owns reconciliation, imports, notifications, reviewed automatic delivery, cleanup, and heartbeat. Monitor failed jobs, stale locks, unusual retries, and notification/provider failure rates. Retry only jobs that reached a recorded failed state; idempotency is not a reason to ignore unexplained repetition.

Use `npm run worker:qualify` against a disposable loopback database for the actual process-crash, connection-outage and five-minute maintenance checks. See [worker recovery qualification](WORKER_RECOVERY_QUALIFICATION.md) for import guarantees, upgrade handling and the limits of local evidence.

## Bounded load probe

The default probe exercises readiness. Customer mode checks six authenticated routes with separate account markers, full-response timings and per-route failure limits. The isolated `load:qualify` command builds synthetic accounts in a new local database and runs the current standalone package; see [Customer load qualification](CUSTOMER_LOAD_QUALIFICATION.md). These probes provide regression evidence, not hosted capacity certification:

```bash
LOAD_SMOKE_URL=https://staging.example.com \
LOAD_TEST_ACKNOWLEDGE=true \
npm run load:smoke
```

Tune concurrency, duration, error rate, and p95 thresholds with the documented environment variables in `.env.example`. Never point it at an unapproved customer environment.

See [Hosted deployment](HOSTED_DEPLOYMENT.md), [Migration runbook](MIGRATION_RUNBOOK.md), and [Manual device qualification](MANUAL_DEVICE_QUALIFICATION.md).

## Durable operational alerts

Independent checks, incident history, acknowledgments, daily reminders, bounded webhook delivery, a database-outage fallback and backup/restore receipts are implemented. Use [Operational alerts](OPERATIONAL_ALERTS.md) for exact thresholds, permissions, the restricted monitor-role grants, supervised-host setup and qualification. The normal worker does not certify itself. No production monitor or external notification is enabled by the local implementation.
