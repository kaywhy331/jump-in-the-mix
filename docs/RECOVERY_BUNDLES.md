# Complete recovery bundles and a source cutoff

An authenticated state export detects omitted content changes but cannot reconstruct them. A complete recovery bundle contains the encrypted database archive, signed manifest and encrypted recovery-state sidecar from the **same PostgreSQL snapshot**. Restoring that bundle into a new empty target recovers all captured row contents, including corrected notes, newer accounts, withdrawals and actual email receipts. It does not merge those contents into an older restored database.

## Capture and restore

With the existing source database and independent backup key configured:

```bash
npm run db:backup-recovery -- --output /private/recovery/final.jitm-backup.enc --retention-days 0
```

Keep these three files together under their original names:

- `final.jitm-backup.enc`
- `final.jitm-backup.enc.manifest.json`
- `final.jitm-backup.enc.recovery-state.enc`

Files use mode 600. The signed manifest binds the sidecar's filename, size, encrypted checksum, logical digest, schema and capture time to the full archive. Complete-row hashes must reproduce every table digest in the manifest. Capture retains the existing read-only exported snapshot until `pg_dump` finishes, so a concurrent commit cannot mix older evidence with newer archive contents. The state exporter still enforces its documented row, byte and schema limits; exceeding them refuses a bundle instead of omitting data.

Upload all three files to independently managed private storage and verify retrieval with the separately retained key. This command does not upload or schedule anything. Its local retention removes the fixed adjacent manifest and sidecar with an expired archive; it never follows a path supplied by a manifest. Keep recovery-event bundles outside rotating backup directories or disable their local age-based retention. Provider-side retention is a separate responsibility.

Restore with `db:restore` into a separate empty target as described in [Restore recovery](RESTORE_RECOVERY.md). When the manifest declares a sidecar, a missing, symlinked, tampered or substituted sidecar refuses before target writes. After loading, every restored row identity, full-row digest and schema must match the bundled state. The hold records `recoverySnapshot` only after that comparison passes. The target remains held.

Use the bundled sidecar and manifest with [restriction plan/apply](RECOVERY_RESTRICTIONS.md). A full matching restore followed by restrictions provides a verifiable path for captured contents plus fresh access/sending restrictions. It does not cover writes made after capture. Do not apply an old restriction plan to a newer restore.

## Finalize an available authoritative source

`db:finalize-recovery-source` supplies a final cutoff for the available-source path. **Apply takes the source database offline.** This is a planned recovery/cutover operation, not a scheduled backup or an ordinary deployment. Complete target preparation and the wider cutover plan first, including [recovery enrollment and guarded reopening](RECOVERY_REOPENING.md).

Stop public traffic, web processes, workers, schedulers, monitors that connect to the source, and all other database clients. Drain in-flight provider requests and preserve their receipts before the last bundle; database equality alone cannot resolve an email accepted by a provider but never recorded locally. Keep source and target isolated from dispatch throughout recovery. The source owner needs access to the separate `postgres` maintenance database on the same server. Finalization refuses default/template databases, a held source, subscriptions, unsupported extensions, prepared transactions and other source backends. It does not terminate clients or alter provider configuration.

Capture the final bundle, then prepare a read-only 30-minute plan:

```bash
npm run db:finalize-recovery-source -- \
  --input /private/recovery/final.jitm-backup.enc \
  --output /private/recovery/source-plan.json
```

Review its source identity, database OID, archive/state/content digests and offline consequences. The source's full contents and required migration checksums must match the bundle. Changed notes, new rows, status updates and operational timestamps require a new bundle and plan. The plan contains no customer contents or database credentials.

Apply the exact reviewed plan with an operator and concise reason:

```bash
npm run db:finalize-recovery-source -- \
  --input /private/recovery/final.jitm-backup.enc \
  --apply --plan /private/recovery/source-plan.json \
  --operator 'Recovery operator name' \
  --reason 'Finalize the reviewed source for isolated recovery' \
  --output /private/recovery/source-cutoff.json
```

Apply first verifies the plan and current source. A maintenance connection commits a pending marker and `ALLOW_CONNECTIONS false`, while the original source session stays connected for a final comparison. It then rechecks other backends, prepared transactions and subscriptions, locks all public tables and compares every captured row again. A racing connection or changed content cannot produce a success receipt. PostgreSQL's connection flag blocks new connections; existing sessions and prepared transactions need the separate checks. See [ALTER DATABASE](https://www.postgresql.org/docs/16/sql-alterdatabase.html), [prepared transactions](https://www.postgresql.org/docs/16/view-pg-prepared-xacts.html) and [subscription catalog](https://www.postgresql.org/docs/16/catalog-pg-subscription.html).

Success commits a purpose-signed receipt in source database metadata and writes a private copy. It identifies the archive, source, database OID, plan, full-content digest, final observation time and operator. No application rows change. Source database connections remain disabled. `applicationReady: false` and `releaseAllowed: false` refer to the recovery target and are mandatory.

Verify a receipt through the maintenance database without reopening the source:

```bash
npm run db:finalize-recovery-source -- \
  --verify --receipt /private/recovery/source-cutoff.json \
  --output /private/recovery/source-verification.json
```

Verification requires a valid receipt matching the committed source marker, the original database OID and catalog row revision, disabled connections, no other source backends, no prepared transactions and no subscriptions. Reopening and then reclosing the source changes that revision and invalidates the receipt even if the marker was retained. Other database-attribute changes, replaced/deleted metadata, a recreated database, or an unavailable source server also refuse verification. The receipt binds the full transaction ID that disabled connections and refuses verification after one billion further cluster transactions, avoiding reliance on a wrapped 32-bit row revision. See [PostgreSQL row versions](https://www.postgresql.org/docs/16/ddl-system-columns.html) and [transaction/snapshot functions](https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-PG-SNAPSHOT). This is a live observation, not permission to promote a target. Infrastructure administrators can change database controls; keep the source isolated and reverify before any eventual cutover.

## Interrupted or failed finalization

If reporting failed after the receipt committed, retry the **same** apply plan with a new output path. It can retrieve an unchanged committed receipt after the plan's original expiry without reopening or reapplying anything. An edited plan or a different bundle cannot retrieve it.

If connection denial committed but final verification failed, the source retains a **pending** marker and may be offline. Existing clients that raced the denial are not killed and must still be stopped. Neither apply retries nor receipt verification convert a pending marker into success. To abandon that incomplete attempt and resume the unchanged authoritative source, stop remaining clients and use:

```bash
npm run db:finalize-recovery-source -- \
  --resume-source --plan /private/recovery/source-plan.json \
  --operator 'Recovery operator name' \
  --reason 'Abandon incomplete finalization and resume the authoritative source' \
  --output /private/recovery/source-resumed.json
```

Resume requires the source owner, exact signed plan, original database OID and matching pending marker. It records a signed resume receipt and reenables source connections atomically. A successful finalization cannot be resumed by this command. Resume cancels that plan; capture a new bundle and prepare a new plan for another attempt. A lost resume output can be retrieved using the same operation and a new output path. No target hold is removed.

No command automatically reenables a failed source or replaces an existing output file. Keep the plan and private evidence recoverable independently. Missing keys/plans, unavailable maintenance access or conflicting infrastructure changes require the infrastructure owner's recovery procedure.

## Bind the cutoff to the held target

After restoring the exact complete bundle and applying its restriction plan, set `RESTORE_DATABASE_URL` to that separate, isolated target. Stop other target clients. Use the source cutoff receipt, with the same backup key and original `DATABASE_URL`:

```bash
npm run db:finalize-recovery-source -- \
  --bind-target --receipt /private/recovery/source-cutoff.json \
  --operator 'Recovery operator name' \
  --reason 'Bind the restricted restore to the verified final source' \
  --output /private/recovery/target-cutoff.json
```

The target owner is required. The command verifies that the source remains finalized, the target hold identifies that exact full bundle, restrictions were applied directly to the matching snapshot, and every current target row still matches the committed restriction receipt. It locks target tables during the check and verifies the source again before recording a signed cutoff binding in the hold. There are no application-row changes. Missing full-bundle evidence, a different restriction lineage, stale contents, an edited receipt or a changed source refuses the operation. A repeated bind returns the same committed receipt.

Reverify both sides without changing the target hold:

```bash
npm run db:finalize-recovery-source -- \
  --verify-target --receipt /private/recovery/source-cutoff.json \
  --output /private/recovery/target-verification.json
```

`--receipt` takes the **source** cutoff receipt for both commands. Target verification requires the previously bound target receipt and checks the current source barrier and target contents again. A signed source receipt alone cannot certify a different or subsequently edited restore. These are stage-specific receipts; future recovery operations must explicitly preserve their lineage when they change target rows.

The target stays under its application hold. Target network isolation remains necessary: connected-client checks and table locks do not stop an infrastructure administrator or old application code from connecting later. Neither `target-cutoff-bound` nor `target-cutoff-verified` permits reopening.

## Remaining recovery gates

This path supplies complete captured contents and a verified cutoff when the authoritative source is available. A lost source without a sufficiently current full artifact or retained change history still requires a separate recovery decision; a state hash cannot recreate missing contents. Provider-side uncertain sends also remain subject to receipt investigation and sending pauses.

The next command, [db:reopen-recovery-target](RECOVERY_REOPENING.md), restores fresh Owner access, invalidates disabled integration credentials, rebuilds safe background work and releases the hold atomically after current evidence and MFA verification. Customers recover their passwords through the normal verified-email flow. Independent artifact/key retrieval, deletion/retention, intended-host support for the maintenance operation, provider receipts and the actual cutover require qualification. These commands neither deploy the application nor contact an email provider.
