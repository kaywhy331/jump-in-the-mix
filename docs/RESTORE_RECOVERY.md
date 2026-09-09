# Restoring a database safely

The restore command verifies an archive and leaves the target under an application recovery hold. A successful restore or smoke check does **not** authorize reopening customer access or sending. An older backup can contain accounts deleted later, revoked sessions, withdrawn consent and messages already sent or canceled.

## Prepare and verify

1. Keep the source and recovery target separate. Create an empty target with the same application schema name. Isolate it from customer traffic, old application releases, workers, schedulers and provider dispatch. Stop all other target database clients before restoring; the command checks for connected clients before loading data.
2. Retrieve the encrypted archive, its adjacent `.manifest.json` and the independent `BACKUP_ENCRYPTION_KEY`. Retain the application encryption key needed to read encrypted application records separately. Store keys through the existing secret-management process, outside the backup artifact directory.
3. Configure `RESTORE_DATABASE_URL` with a database-owner recovery credential. Set `DATABASE_URL` to the original source identity for the existing in-place protection. Run `npm run db:restore -- --input /secure/ARCHIVE.jitm-backup.enc`, then `npm run db:smoke-restored` against that target. Do not point web or worker services at it as a shortcut to checking the restore.
4. Retain the private command evidence and recovery identifier. Successful output reports `recovery: "held"`; new archives also report `manifestAuthenticated: true`. The database hold records archive/source identifiers and verification flags, without storing a recovery key or invitation URL. Verification failure leaves the hold in place.
5. For independent backup-freshness evidence, `npm run db:qualify-backup -- --input /secure/ARCHIVE.jitm-backup.enc` requires a separate empty loopback target and `OPS_RESTORE_RECEIPT_FILE`. It requires an authenticated current-format manifest and checks content and foreign keys before writing the receipt. Its `applicationReady: false` result is deliberate. Keep receipt and artifact access restricted.

New manifests authenticate their complete contents with HMAC-SHA256 using a purpose-derived key from the backup encryption key. The archive retains its existing AES-256-GCM authentication. Changing source identity, counts, digests, timestamps or archive metadata invalidates the manifest. Unsigned legacy manifests remain readable for recovery, but their metadata is untrusted and they cannot produce a qualified restore receipt through this command. Version-one archives also lack content-digest proof. Capture a new signed backup from the authoritative source when it remains available; do not add a signature to an old manifest and call its origin verified.

## How the hold works

Before loading archive data, restore writes the `jitm.recovery_hold` database setting in a committed owner transaction. It resides outside application tables and survives application-schema restoration. The matching web release reads the persistent database catalog on each dynamic request; any value, including an empty or malformed value, holds access. Failed catalog reads return a generic 503. Fixed public assets and liveness remain available; readiness reports `recovery-held`. Requests already in flight are not retracted.

The query reads database-wide catalog settings directly because role/session defaults can override the effective session setting. PostgreSQL reserves changing database defaults to the owner or superuser, and stores them in `pg_db_role_setting`. Use separate restricted application credentials in production; an application process connected as the database owner has the owner's ability to change the hold. [ALTER DATABASE](https://www.postgresql.org/docs/16/sql-alterdatabase.html), [database/role settings catalog](https://www.postgresql.org/docs/16/catalog-pg-db-role-setting.html).

The matching worker uses the same catalog condition in its release barrier. A new worker neither records a healthy heartbeat nor claims jobs while held. An already-running worker rechecks between work on its existing interval; this does not interrupt an in-flight provider request. The backup command refuses held sources so a recovered historical database cannot silently replace live backup evidence.

This is an application guard, not database network isolation. The connected-client precheck cannot prevent a new connection immediately afterward. Older code and direct database clients do not honor the guard. Keep recovery credentials, target connectivity, services and traffic under operator control throughout the procedure. Managed point-in-time recovery or a provider console restore does not run this command and therefore does not automatically install its hold; keep those targets isolated too.

## Capture and review newer state

`db:export-recovery-state` now captures an encrypted, authenticated source snapshot of safety fields and hashes for every table/row. `db:review-recovery-state` compares it with the held restore and reports missing records, changed restrictions and changed send decisions without exposing row contents. Both use read-only database transactions. See [Recovery state](RECOVERY_STATE.md) for commands, prerequisites and qualification. This provides evidence at a capture point; it does not establish continuous coverage, apply reconciliation or release access.

## Apply reviewed restrictions while held

The separate `db:reconcile-recovery-state` command prepares an authenticated 30-minute plan and applies selected corrections in one locked transaction. It erases accounts missing from the newer source, removes restored credentials and staff authority, preserves recipient restrictions and lifetime invitation counts, revokes unused invitations, cancels unfinished customer work and pauses admission/connections. A stale or edited plan refuses; a committed plan can be retried without applying it twice. Read the full consequences and prerequisites in [Recovery restrictions](RECOVERY_RESTRICTIONS.md). This operation is for an isolated recovery target and retains its hold.

## Complete contents and an available-source cutoff

`db:backup-recovery` creates a full encrypted archive and matching authenticated state evidence from one snapshot. Restoring that newer bundle into a fresh target recovers the captured content corrections, newer accounts and actual send receipts that a hash-only export cannot reconstruct. Restore verifies every row and records that match in the hold. `db:finalize-recovery-source` can then establish a reviewed cutoff by taking an available authoritative source offline only when its full contents match the bundle. It provides signed evidence, live verification and a guarded resume operation for incomplete attempts. Its `--bind-target` and `--verify-target` operations verify the complete snapshot/restriction lineage and current target contents against the finalized source, retaining the hold. Read [Complete recovery bundles](RECOVERY_BUNDLES.md) before applying this source-offline operation. Neither command releases the target.

## Guarded reopening and remaining external qualification

Use [db:reopen-recovery-target](RECOVERY_REOPENING.md) after a full bundle, restrictions and bound source cutoff. It prepares private Owner enrollment and a signed plan, requires fresh authenticator verification, validates the retained data key, replaces disabled integration credentials and rebuilds safe background work. Its atomic apply records the release receipt and removes the hold; admissions and customer messaging remain paused. Do not remove the hold manually to make readiness pass. Remaining external qualification must establish:

- Independently retained full recovery evidence and a procedure for a source that is no longer available. The available-source bundle/cutoff path is implemented locally; independent storage/key retrieval and continuity beyond available evidence remain to qualify.
- Preserve the verified cutoff/target lineage through subsequent recovery operations and investigate provider-side uncertain sends. Full bundle restoration and target cutoff checks cover captured database contents and recorded send outcomes; they do not settle unrecorded provider acceptance or give an older partial restore full coverage from a later state hash.
- Real Owner sign-in/MFA and customer reset-email delivery on the intended host. Customers reconnect integrations and regain staff permissions individually; old credentials are not restored.
- A rehearsed cutover, restored application-key access, backup storage/key retention and deletion procedures, and evidence on the intended hosted runtime. Account-deletion and provider/log retention procedures must cover recovered historical data.

The hold and archive checks are implemented and tested locally. These remaining items keep disaster recovery and the full public-launch goal open; they are not satisfied by content equality, a green smoke check or a recent restore receipt.

## Local verification

The database tests own and remove isolated loopback targets. They cover signed and legacy archives, tampered metadata, content verification, connected-target refusal, persisted holds, restricted-role/session-override denial and a real worker held before claims. The production-package HTTP test holds an already-running web process, checks old sign-in tokens and authenticated routes, then interrupts only its owned database connection proxy. It verifies bounded 503 responses and connection recovery without restarting shared PostgreSQL. A disposable test-only removal of the hold checks uncached behavior; it is not a production release procedure.

Run the focused database tests with `RECOVERY_TEST_DATABASE_URL` configured and the packaged HTTP test with `RUN_RECOVERY_WEB_TESTS=true`. See the exact checkpoint in [Product completion](PRODUCT_COMPLETION.md). No real mail, push, public deployment or provider cutover is part of these local tests.
