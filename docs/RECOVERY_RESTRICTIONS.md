# Applying restrictions to a held restore

`db:reconcile-recovery-state` prepares a signed plan and applies a bounded set of access, deletion and sending restrictions to an isolated recovery target. It leaves the application recovery hold in place. This is a recovery operation with substantial account changes; it is not a routine upgrade or a command for the live source.

## Prepare the target and evidence

1. Follow [Restore recovery](RESTORE_RECOVERY.md). Keep the target disconnected from public traffic, older application releases, workers, schedulers and provider dispatch. Stop other database clients. The database owner is required for apply; a staff account alone cannot run it.
2. Retain the original signed backup manifest, the backup key and a newer authenticated [source-state export](RECOVERY_STATE.md). Keep `DATABASE_URL` as the original source identity and `RESTORE_DATABASE_URL` as the separate target. The correction command does not connect to the source.
3. Apply this release's migrations while the target remains isolated and held. Migration `20260909130000_workspace_history_erasure` is required. It removes existing workspace orphans from four historical tables and adds cascading foreign keys. It preserves rows belonging to existing workspaces. Review and retain a backup before migration.
4. Use a private operations machine and directory. Keep `BACKUP_ENCRYPTION_KEY` in the existing secret environment. Do not put keys, database credentials or customer contents in command arguments, operator names or reasons.

The state must match the source, the target's authenticated/content-verified hold and the original archive. It must be at least as recent as the backup and have the same table/column/key shape as the migrated target. A snapshot covers its capture point only. It does not establish the final outage cutoff or recover changes made later.

## Generate and review the plan

Use new filenames; outputs are private and existing files are refused:

```bash
npm run db:reconcile-recovery-state -- \
  --state /private/recovery/source-state.enc \
  --backup-manifest /private/recovery/backup.enc.manifest.json \
  --output /private/recovery/restrictions-plan.json
```

Review the counts in `effects`, every table in `differences`, and the source/target/archive/recovery bindings. The plan contains no record identities or customer contents. It expires after 30 minutes and is authenticated using a purpose-derived key. Editing even a count invalidates it. The read-only report from `db:review-recovery-state` is a different artifact and cannot be applied.

The planned consequences are:

| Area | Applied behavior |
| --- | --- |
| Deleted accounts | Delete restored users absent from the newer source and their owned workspaces, related support/waitlist records and setting authors. Retain a content-free deletion audit. Refuse an old owner's deletion if its workspace still exists in the source under changed ownership. |
| Customer access | Correct surviving account emails, clear passwords and require fresh sign-in. Preserve or add suspension, advance access revisions and keep the higher lifetime referral count. Remove memberships no longer matching the source; never add access. |
| Staff and credentials | Disable every staff membership and platform-admin flag. Remove all sessions, MFA credentials/sessions, OAuth links/pending states, verification tokens, push subscriptions and calendar-feed credentials. Session-bound report exports are removed by their foreign keys. Fresh operator access still needs a qualified recovery procedure. |
| Recipient restrictions | Preserve or add contact archive/do-not-contact and active email suppressions. Cancel pending Jumps for blocked contacts. Apply newer non-waiting waitlist states without clearing an existing withdrawal or suppression. |
| Invitations | Revoke unused customer/staff invites. Purge customer invitation secrets and cancel/purge unfinished invitation deliveries. Consumed lifetime invitation slots are not refunded. |
| Other customer work | Cancel unfinished support-email deliveries, notifications, automatic deliveries and imports; remove unfinished jobs. Preserve known results and delivery history. This does not establish that newer messages were delivered. Operational monitor notices are outside this customer-send policy. |
| Pauses | Pause all four admission controls and automatic waitlist waves. Disable automation, summaries, push, intake and calendar connections. Remove public review links. Existing connection secrets remain encrypted but disabled and must be reconciled before any reenablement. |

These are conservative restrictions across the whole target, including records unchanged since the backup. Do not use this procedure if the reviewed consequences are inappropriate for the recovery. An ownership conflict requires explicit resolution while held; it is never silently resolved by deleting a retained workspace.

## Apply the exact plan

With other target clients stopped and the network/service isolation still in place:

```bash
npm run db:reconcile-recovery-state -- \
  --state /private/recovery/source-state.enc \
  --backup-manifest /private/recovery/backup.enc.manifest.json \
  --apply --plan /private/recovery/restrictions-plan.json \
  --operator 'Recovery operator name' \
  --reason 'Apply reviewed restrictions to the isolated restore' \
  --output /private/recovery/restrictions-receipt.json
```

Apply authenticates the plan, verifies migration checksums and the four workspace erasure constraints, rejects other connected clients, and locks all public tables before comparing their contents with the reviewed snapshot. A changed target or source artifact requires a new plan. The lock prevents competing table writes during the transaction; it does not replace network isolation or stop a new client from connecting after the precheck.

Corrections, the platform audit and the receipt in the persistent hold commit together. Any pre-commit failure rolls back all corrections. Successful output is `applied-held` with `applicationReady: false` and `releaseAllowed: false`. The receipt identifies the operator, plan, before/after content digests and mutation counts. It does not contain a backup key or customer record contents.

If output fails or the process is interrupted, the transaction may already have committed. Keep the target isolated. Retry the **same** signed plan with the same state and a **new** output path. If its receipt is committed and the target still matches, the command returns `already-applied` without changing rows again; this retry can inspect a committed plan after its original expiry. A changed target refuses that retry. Do not create a fresh plan merely to conceal an uncertain previous result.

## Still required before reopening

The hold remains mandatory until the separate [guarded reopening command](RECOVERY_REOPENING.md) verifies the complete-bundle cutoff lineage and fresh enrollment. This restriction operation does not reconstruct omitted notes, corrected contact details, newer accounts, retained content or newer accepted-send receipts. Per-table differences can therefore remain after apply. For complete contents, restore a newer [full recovery bundle](RECOVERY_BUNDLES.md) into a fresh target, then prepare a new restriction plan using its matching sidecar and manifest. The bundle path recovers recorded contents at capture; its available-source finalization command can supply a verified cutoff. It does not merge omitted changes into this older target.

The available-source full-bundle, cutoff and reopening commands supply complete captured contents, fresh Owner access, integration invalidation and safe background work. An older partial restore cannot use their release path without matching full evidence. Independently retained history for an unavailable source, backup storage/key recovery, provider/retention procedures and the intended hosted runtime still require qualification. No receipt from this restriction command authorizes reopening by itself.

## Local verification

The recovery-state PostgreSQL suite exercises the actual CLI against its own encrypted backup and isolated restore. It covers edited/expired/stale plans, connected clients, missing foreign keys, ownership conflicts, transaction rollback after an injected deletion failure, legitimate email reuse, credential clearing, recipient restrictions, canceled customer work, intact hold metadata under alternate SQL string settings, and an unchanged second apply. The ordinary account-deletion test and migration rehearsal cover all four historical tables, orphan cleanup and refusal of a late orphan write. These checks do not contact a provider or change production.
