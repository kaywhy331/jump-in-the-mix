# Scheduled encrypted backups

`npm run db:backup-s3` runs the existing shared-snapshot recovery backup, then uploads its complete three-file bundle to private S3 storage. It validates the authenticated manifest, source identity, filenames, sizes and local hashes before uploading. S3 checks SHA-256 during each upload; the runner verifies the stored checksum, size and AES256 storage encryption with HEAD. The manifest is published last, after both encrypted data files pass verification. A run reports success only after all three stored files pass.

Every invocation has a unique name and private temporary directory. The storage credential permits creation with `If-None-Match: *` and checksum inspection under `production/`; it has no delete, overwrite, bucket-administration or SSM key-retrieval permission. Interrupted uploads can leave incomplete bundles, which expire under the bucket lifecycle. A manifest alone is never sufficient for restore: retrieve and verify all three files. Temporary local copies are removed on success, error and handled termination; the cron filesystem is ephemeral after forced termination.

## Production configuration

[The separate Render Blueprint](../infra/operations/render-backup.yaml) defines a daily **10:17 UTC** job in Oregon on the 0.5 CPU / 512 MiB plan. It uses a dedicated [backup image](../infra/operations/backup.Dockerfile) with PostgreSQL 16 and AWS CLI v2. Automatic deployment is disabled so the job runs reviewed code. It does not run the application worker or migrations.

- Use the same canonical internal database endpoint as monitoring. Create a dedicated login with no superuser, role creation, database creation or inherited privileged memberships; apply [backup grants](../infra/operations/backup-grants.sql) as the migration owner. Verify every application table is readable, table writes and schema creation are denied, and the resulting archive contains the expected table inventory. Future migrations must keep using that owner or reapply default grants for the new owner.
- Supply only `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, the dedicated AWS access key pair, region, bucket, prefix and expected bucket owner. Do not attach the application's shared environment group. The job needs no sender credential, application encryption key or web session secret.
- [The writer policy](../infra/operations/backup-writer-policy.json) is scoped to the current production bucket. A different environment must change its bucket and prefix consistently. Keep IAM credentials in the runner's private environment and rotate them by installing and verifying a new key before retiring the old one.
- Escrow `BACKUP_ENCRYPTION_KEY` separately in SSM SecureString. Preserve the matching application data-encryption key independently for recovery. The scheduled writer cannot retrieve either escrowed key.
- Keep public-access blocking, BucketOwnerEnforced ownership, default SSE-S3, TLS-only access and seven-day expiry enabled on the bucket. S3 rounds the expiry date to the next UTC day and deletion is asynchronous; the public notice describes that timing.

The cron service has a $1/month minimum and otherwise bills for active runtime. Storage and transfer are additional. See [Render cron documentation](https://render.com/docs/cronjobs). This configuration does not buy a separate continuous monitoring service.

## Qualification and ongoing operation

After the reviewed image builds, trigger one run while no scheduled run is active. Inspect its successful event and receipt, then independently download the three named objects. Recover the backup key from SSM and run `db:qualify-backup` against a fresh isolated loopback PostgreSQL target, using the internal source URL for identity. The qualification command never connects to that source. Verify content, foreign keys and the retained recovery hold, then remove the local database and redundant encrypted copies. Keep sanitized receipts. Never reopen a restored database using backup verification alone; follow [the recovery procedure](RESTORE_RECOVERY.md).

The signed manifest is the offsite completion marker. This job deliberately does not write a local monitor receipt pointing to its soon-to-be-removed staging files. An independent monitor still needs a controlled retrieval path to durable local evidence, the same canonical source identity, an actual alert destination and an outer availability check. A configured schedule and a manually successful run are distinct from observing the first automatic run. Record each explicitly in the completion ledger.

Single-object publication is bounded to 5 GiB per encrypted file; larger databases need a reviewed multipart implementation before reaching that limit. Recovery-state capture also requires a measured memory budget as customer data grows. Missing or overdue backups must remain visible until the independent monitoring path is qualified.
