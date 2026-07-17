# Operations readiness: encrypted backups, restore qualification, worker health, and staging smoke

This runbook turns the remaining repository-owned launch checks into repeatable commands. It does not replace provider qualification or a real production change window.

## Required tools and secrets

The backup and restore commands require PostgreSQL client tools compatible with the deployed server:

```bash
pg_dump --version
pg_restore --version
```

Configure a dedicated backup key. Do not reuse `DATA_ENCRYPTION_KEY`:

```text
BACKUP_ENCRYPTION_KEY=<64 hex characters or base64-encoded 32-byte key>
BACKUP_DIR=/secure/backup/location
BACKUP_RETENTION_DAYS=30
```

Optional operational alerts can be delivered to a generic JSON webhook:

```text
OPS_ALERT_WEBHOOK_URL=https://...
```

The payload includes `text`, `title`, `severity`, `environment`, `timestamp`, and redacted structured details. Alert delivery failure never hides the original command failure.

## Create an encrypted backup

Pause application and worker writes before the final pre-deployment backup. The command records critical table counts and migration state before and after `pg_dump`; if those integrity markers change during capture, the backup is rejected. The final pre-deployment backup still requires an application and worker write freeze.

```bash
npm run db:backup
```

A successful run creates:

```text
.backups/jump-in-the-mix-<timestamp>.jitm-backup.enc
.backups/jump-in-the-mix-<timestamp>.jitm-backup.enc.manifest.json
```

The archive uses AES-256-GCM with a random IV and authentication tag. The manifest records the encrypted archive checksum, PostgreSQL version, applied Prisma migrations, table count, and critical row counts. Files older than `BACKUP_RETENTION_DAYS` are removed after a new successful backup.

Use a custom location when the backup must be copied immediately to encrypted object storage:

```bash
npm run db:backup -- --output /secure/export/pre-deploy.jitm-backup.enc
```

## Restore into a separate empty database

Production in-place restore is intentionally blocked. Create a separate empty target and provide its URL:

```text
RESTORE_DATABASE_URL=postgresql://.../jitm_restore?schema=public
```

Then run:

```bash
npm run db:restore -- --input /secure/export/pre-deploy.jitm-backup.enc
npm run db:smoke-restored -- --database-url "$RESTORE_DATABASE_URL"
```

Restore validation performs all of the following:

- verifies the encrypted archive checksum against the manifest;
- authenticates and decrypts the AES-256-GCM archive;
- refuses a non-empty target database;
- restores with `pg_restore --exit-on-error --no-owner --no-privileges`;
- compares applied migration history, table count, and critical row counts;
- checks core foreign-key relationships for orphaned rows;
- proves a transaction can write, read, and roll back in the restored database.

## Automated local or CI rehearsal

The rehearsal creates a temporary PostgreSQL database on the same server, captures an encrypted backup of `DATABASE_URL`, restores it, runs the relational smoke checks, and removes the temporary database.

```bash
npm run db:rehearse-restore
```

Set `KEEP_BACKUP_ARTIFACT=1` only when you need the encrypted rehearsal archive for diagnostics.

## Worker health

Every worker records a durable heartbeat every 15 seconds. The web application exposes a separate worker readiness endpoint:

```text
GET /api/health/worker
```

A running heartbeat older than `WORKER_HEARTBEAT_STALE_SECONDS` is unhealthy. The default is 90 seconds. Web/database readiness remains available at:

```text
GET /api/health/ready
```

Admin → Operations shows healthy, stale, and stopped worker records alongside jobs, provider errors, and webhook diagnostics.

## Production-like staging smoke

Use a dedicated staging workspace and test user. The smoke suite is read-only after sign-in and runs on desktop Chromium plus a Pixel 7 profile.

```text
STAGING_BASE_URL=https://staging.example.com
STAGING_SMOKE_USER_EMAIL=staging-smoke@example.com
STAGING_SMOKE_USER_PASSWORD=<secret>
```

Run:

```bash
npm run smoke:staging
```

The suite verifies:

- web/database readiness;
- current worker heartbeat;
- password sign-in;
- Jumps, Contacts, Mixes, Templates, Help, and My Account routes;
- successful page rendering without application-error output.

Provider-specific Google, Stripe, email, and physical-device checks remain separate because they require real external accounts and infrastructure.

## Bounded load smoke

The built-in probe exercises only `/api/health/ready`. It is intended to identify obvious latency or availability regressions, not to establish full capacity.

```text
LOAD_SMOKE_URL=https://staging.example.com
LOAD_TEST_ACKNOWLEDGE=true
LOAD_SMOKE_DURATION_SECONDS=30
LOAD_SMOKE_CONCURRENCY=10
LOAD_SMOKE_MAX_REQUESTS=5000
LOAD_SMOKE_MAX_ERROR_RATE=0.01
LOAD_SMOKE_MAX_P95_MS=1000
```

Run:

```bash
npm run load:smoke
```

The probe stops at the earlier of its duration or `LOAD_SMOKE_MAX_REQUESTS`. The report includes throughput, status distribution, error rate, and min/p50/p95/p99/max latency. The command fails if the configured error-rate or p95 threshold is exceeded.

## Production deployment sequence

1. Confirm CI, migration rehearsal, and encrypted backup/restore rehearsal are green.
2. Pause the worker and application writes.
3. Run `npm run db:backup` and copy the archive plus manifest to durable encrypted storage.
4. Restore that exact archive into an isolated staging database.
5. Point the staging web and worker processes at the restored database.
6. Run `npm run smoke:staging` and the documented provider matrices.
7. Compare critical row counts and investigate every unexpected difference.
8. Deploy migrations to production.
9. Start the web application, confirm `/api/health/ready`, then start the worker and confirm `/api/health/worker`.
10. Reopen traffic only after Jumps, Contacts, Mixes, Templates, Help, Account, Admin Operations, and one worker job complete successfully.

## Recovery policy

If a launch-blocking issue is discovered, stop all writes and restore the validated pre-deployment archive into a clean database. Point the previous application and worker versions at that restored database. Do not run reverse SQL against a live database containing data written by newer application versions.
