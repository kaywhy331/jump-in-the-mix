# Operations readiness

## Health

- `/api/health/live` proves the web process can answer.
- `/api/health/ready` proves PostgreSQL connectivity and validates production configuration.
- `/api/health/worker` proves a worker heartbeat is newer than `WORKER_HEARTBEAT_STALE_SECONDS` (90 seconds by default).

Alert independently on all three. A live web process with an unhealthy worker does not satisfy the product promise.

## Encrypted backup and restore

Configure a dedicated `BACKUP_ENCRYPTION_KEY`; never reuse `DATA_ENCRYPTION_KEY`. `npm run db:backup` creates an authenticated encrypted archive plus manifest with checksum, PostgreSQL version, applied migrations, table inventory, and critical row counts. Copy both to durable encrypted storage.

Production in-place restore is blocked. Set `RESTORE_DATABASE_URL` to a separate empty database, then run:

```bash
npm run db:restore -- --input /secure/pre-release.jitm-backup.enc
npm run db:smoke-restored
```

CI/local rehearsal creates and removes its own temporary target:

```bash
npm run db:rehearse-restore
```

Pause application and worker writes for the final pre-release backup. Keep the archive from before the dormant-feature retirement migration until the release is fully qualified; it may contain sensitive data that no longer has a table in the current schema.

## Staging and release

Use a production-like staging origin, private PostgreSQL, a real worker, and a dedicated synthetic account:

```bash
STAGING_BASE_URL=https://staging.example.com \
STAGING_SMOKE_USER_EMAIL=smoke@example.com \
STAGING_SMOKE_USER_PASSWORD='from-secret-manager' \
npm run smoke:staging
```

The smoke verifies web/database readiness, current worker heartbeat, sign-in, and core authenticated routes on desktop and mobile profiles. Provider qualification separately verifies email inbox placement, Google/Apple consent, push permission/delivery, and optional Twilio delivery. Physical iPhone and Android native handoffs remain required.

Release order is backup → restore proof → immutable build → migration → ready web → ready worker → automated smoke → manual provider/device checks → reopen traffic. Record commit, backup identifier, migration output, health results, and operator.

## Worker and jobs

Run at least one continuously supervised worker. It owns reconciliation, imports, notifications, reviewed automatic delivery, cleanup, and heartbeat. Monitor failed jobs, stale locks, unusual retries, and notification/provider failure rates. Retry only jobs that reached a recorded failed state; idempotency is not a reason to ignore unexplained repetition.

## Bounded load probe

The included probe exercises only readiness and is a regression signal, not capacity certification:

```bash
LOAD_SMOKE_URL=https://staging.example.com \
LOAD_TEST_ACKNOWLEDGE=true \
npm run load:smoke
```

Tune concurrency, duration, error rate, and p95 thresholds with the documented environment variables in `.env.example`. Never point it at an unapproved customer environment.

See [Hosted deployment](HOSTED_DEPLOYMENT.md), [Migration runbook](MIGRATION_RUNBOOK.md), and [Manual device qualification](MANUAL_DEVICE_QUALIFICATION.md).
