# Recovery state and review

An older backup can restore data that was subsequently deleted, restore revoked access, or put completed messages back in a queue. The export and review commands provide authenticated evidence of newer state and a comparison with the held target. They do not apply corrections or release the hold. A separate [signed restriction plan and apply command](RECOVERY_RESTRICTIONS.md) now handles selected account, recipient and customer-send restrictions while retaining the hold.

## Capture while the authoritative source is available

Use a private operations environment with `DATABASE_URL` identifying the source and `BACKUP_ENCRYPTION_KEY` available from the existing secret store. Use a new filename in a private directory:

```bash
npm run db:export-recovery-state -- --output /private/recovery/source-state.enc
```

The command opens one read-only repeatable-read transaction. It captures all ordinary application tables, primary-key definitions, column types/nullability, a hash of every row identity, a hash of every complete row, and the selected safety fields listed below. A concurrent writer does not produce a mixture of old and new committed rows across tables. PostgreSQL defines this snapshot behavior for repeatable-read transactions. [Transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html).

| Evidence | Purpose |
| --- | --- |
| User presence, email, suspension, access revision and lifetime referral count | Identify deleted accounts and newer access restrictions without restoring passwords or resetting invitation allowances. |
| Workspace ownership, membership and staff permission state | Identify changed ownership, staff revocation and permission changes. |
| Contact archive/do-not-contact, waitlist and suppression state | Identify newer recipient restrictions and withdrawal. |
| Invitation and support generations, email acceptance, automatic delivery and Jump state | Identify newer accepted/canceled work before any sending resumes. |
| Automation, notification and intake/calendar enablement | Identify settings that must not silently resume from the older backup. |
| Every table's hashed identities and complete-row hashes | Detect missing or changed records even when their contents are outside the selected safety fields. New tables are not silently omitted. |

The file is authenticated encryption using a purpose-derived key from the backup key. Ordinary encrypted database archives cannot be used as recovery-state files. It deliberately contains selected account/recipient emails, relationship identifiers and restriction state, so treat it as personal data. Contact notes, message bodies, passwords, MFA material and access-token values are not copied. Primary identities are hashed inside PostgreSQL, including composite and large numeric keys; values from an unexpected future primary key are not exported verbatim. Included index columns are not part of row identity. [PostgreSQL index catalog](https://www.postgresql.org/docs/16/catalog-pg-index.html).

Store a completed encrypted file outside the application host, with independently recoverable keys. The command prints a source hash, state ID, capture time, encrypted-file checksum and counts, without row contents. It does not upload anything, create a schedule, prove offsite durability or certify continuous coverage. Copying a file and verifying its key/retrieval are still required operating work.

## Review a held restore

Keep `DATABASE_URL` as the original source identity; the review command does not connect to that source. Set `RESTORE_DATABASE_URL` to the separate held target and provide the original backup's authenticated manifest:

```bash
npm run db:review-recovery-state -- \
  --state /private/recovery/source-state.enc \
  --backup-manifest /private/recovery/backup.enc.manifest.json \
  --output /private/recovery/review.json
```

The command rejects an unsigned backup manifest, a mismatched source/archive/hold, a state older than the backup, a future state timestamp, or a different table/column/key shape. The target must retain its authenticated/content-verified recovery hold. If the source has newer migrations, review and apply the required target migrations while it remains isolated, then retry the comparison.

The private report counts records missing from the source, records missing from the restore, changed/unchanged records, and changes to the selected safety fields. It includes no row identities, email addresses or record contents. It binds the observation to the recovery ID, original archive, encrypted state's logical digest and the target snapshot's digest. These are evidence identifiers; the report is not a signed approval or a future mutation input.

`applicationReady: false`, `mutationsApplied: 0`, `releaseAllowed: false` and `continuousCoverage: false` are deliberate, even when all counts are zero. A changed complete-row hash can represent a removed note, a correction, ordinary activity or an operational timestamp. The report cannot infer intent or reconstruct omitted content from a hash.

## Limits and failure handling

- Source credentials must see every table and row. A source already under a recovery hold is refused. Capture uses `row_security=off` to produce an error if a policy would filter rows; it does not grant permission to bypass that policy. A hidden row must never be classified as a deletion. [Row security and backups](https://www.postgresql.org/docs/16/ddl-rowsecurity.html).
- Current format supports the `public` schema, ordinary non-inherited tables with primary keys, up to 500 tables, one million rows and a 128 MiB plaintext artifact. A missing key, required safety field, table privilege, size allowance or supported shape stops capture. There is no partial-success output.
- Rows are fetched in batches of 500. Each database statement is bounded to 15 seconds, connection setup to five seconds and capture to five minutes between reads. Run large captures/reviews on an operations machine with sufficient memory, separately from the web process; the final encrypted artifact and comparison are assembled in memory. These limits are not a claim that a small hosted instance can handle the maximum profile.
- Outputs are new files with mode 600; existing files are never overwritten. Temporary plaintext uses a private temporary directory and is removed on normal completion or caught failure. SIGINT/SIGTERM request cancellation and let an in-flight bounded read finish before cleanup. A forced process/host kill can still leave its private temporary directory or an incomplete encrypted output; inspect only that operation's files and verify authentication before using an artifact.
- A snapshot only covers its capture point. It cannot recover restrictions changed afterward. A source becoming unavailable, even immediately after export, does not make that snapshot current through the outage. Retention, an independently retained change history or a verified final source cutoff, and recovery-key procedures still need qualification.

Selected typed restrictions are implemented in [Recovery restrictions](RECOVERY_RESTRICTIONS.md). [Complete recovery bundles](RECOVERY_BUNDLES.md) now restore the full captured contents together with matching state evidence into a fresh target; a separate reviewed source-finalization command supplies a cutoff for an available source and binds it to the unchanged restricted target. A standalone state export still cannot reconstruct omitted contents. Refreshed operator/customer access and guarded reopening remain required in [Restore recovery](RESTORE_RECOVERY.md). Keep the target held until those operations are implemented and qualified.

## Verification

`tests/recovery-state.integration.test.mjs` creates and removes its own loopback source and restore databases. It applies the full migration chain and exercises real encrypted backup/restore, 99 application/history tables plus a future table, composite/included keys, large numeric identities, multiple cursor/file chunks, account deletion, consent/access changes, receipt changes, format/source/time rejection, tampering, read-only credentials, row-security refusal, concurrent commits and actual export-process interruption. No production migration or provider delivery is part of this suite.
