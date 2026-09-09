# Reopening a recovered target

`db:reopen-recovery-target` completes the available-source recovery path after a verified complete bundle, committed restrictions and a bound source cutoff. It restores one Owner with fresh credentials, replaces disabled integration secrets, rebuilds safe background work and removes the target hold in one transaction. This operation is for recovery, not a normal deployment or account reset.

Keep source and target services stopped and target network access restricted throughout preparation and apply. The source must remain finalized and refuse connections. Provider calls already in flight must be drained and their receipts reviewed before the final bundle; these commands cannot observe a provider's internal queue. Do not use this path if the authoritative source or its final history is unavailable.

## Prepare access

Complete [the bundle and cutoff procedure](RECOVERY_BUNDLES.md), including `--bind-target`. Use the intended deployed revision and configure the intended web/worker environment in the operator process. `DATABASE_URL` identifies the closed source; `RESTORE_DATABASE_URL` connects to the held target as its owner. Supply the independent `BACKUP_ENCRYPTION_KEY`. `DATA_ENCRYPTION_KEY` must decrypt retained application records; do not replace it with a newly generated key. Both application keys and all configured provider credentials must be available through the secret manager.

Choose an existing, verified, unsuspended account whose owner will operate recovery. Other accounts and staff stay restricted. Preparation creates fresh credentials but changes no database rows:

```bash
npm run db:reopen-recovery-target -- \
  --receipt /secure/source-cutoff.json \
  --owner-email operator@example.com \
  --output /secure/release-plan.json \
  --enrollment-output /secure/owner-enrollment.json
```

Both outputs must be new paths. They are created with mode 0600 and never overwritten. The enrollment file contains the new password, authenticator secret/URI and ten recovery codes in plaintext. Transfer these through the operator's secure password manager and authenticator. Never commit them, attach them to a support case, print them into a runner log or share them in chat. The plan contains a password hash and encrypted MFA material and is also private.

Review the plan's source/target identifiers, origin, selected account, cutoff and declared effects. It expires in 30 minutes. The runtime configuration is authenticated without exposing its secrets; changing relevant auth, email, integration, worker, report or public operator settings requires a new plan. Hosted configuration must pass the existing production checks and staff MFA must be mandatory. Configuration validation does not prove provider ownership, inbox delivery or the actual host's environment.

Create a separate mode-0600 JSON verification file with the enrollment's `planId` and a current six-digit authenticator `code`, stored as a string. Enter this through a private editor, not a command argument or shell history. Example shape: `{"planId":"the-reviewed-plan-id","code":"six digits from the authenticator"}`.

## Apply the reviewed release

```bash
npm run db:reopen-recovery-target -- \
  --apply \
  --receipt /secure/source-cutoff.json \
  --plan /secure/release-plan.json \
  --verification-file /secure/authenticator-verification.json \
  --operator "Recovery operator" \
  --reason "Reopen the reviewed replacement after source finalization" \
  --output /secure/target-release.json
```

Apply rechecks source finalization, target ownership, migration checksums, complete contents and signed phase lineage. It refuses other target clients, prepared transactions and subscriptions. It locks the public tables, validates the retained ciphertext with the application key, and verifies the newly enrolled authenticator. A final source verification occurs before commit.

The transaction:

- Installs the new password and MFA credential and makes the chosen account an active Owner with no permission overrides. The enrollment code is consumed; use a later code at the first staff sign-in. Old sessions, reset links, OAuth identities and staff credentials remain removed by the preceding restrictions.
- Rotates every intake token while retaining disabled connections and their receipt/identity history. Clears disabled calendar URLs while preserving calendar entries. Calendar feeds, push subscriptions and public review links stay invalidated. Customers reconnect deliberately after review.
- Queues one follow-up preparation job for each unsuspended owner's workspace, resets reconciliation timing, and queues interrupted reports under the current report definition. Obsolete interrupted report definitions become Failed. Completed history is preserved. Imports remain canceled with saved results available for review.
- Removes copied worker heartbeats. Fresh worker execution must establish health. Admission, waitlist waves, notifications and automatic sending remain paused; canceled deliveries are not replayed.
- Records a content-free platform audit and a purpose-signed `jitm.recovery_release` database receipt, then removes `jitm.recovery_hold` atomically with the row changes.

The returned `target-released` receipt permits this database to serve the matching application, subject to the remaining deployment checks. `readinessVerified: false` is deliberate: the command does not start services, test inboxes, check DNS or claim the product is deployed.

## Interrupted reporting and first startup

A failure before commit leaves the target held with no partial credentials or jobs. If commit succeeded but the output was lost, repeat the exact plan/apply with a new output path. `already-released` retrieves the signed committed receipt without repeating mutations, even after plan expiry or subsequent application writes. The verification file still identifies the same plan, but a new MFA code is not required merely to retrieve that receipt. This is a historical receipt, not a fresh readiness result. Another plan, recreated database, changed configuration or reopened source refuses it.

After receiving and retaining the receipt, start the reviewed web and worker revision against the target. Verify database release, web readiness, a new worker heartbeat and completion of recovery preparation jobs. Sign in with the new Owner password and a fresh MFA code. Confirm customer content, restrictions and paused delivery controls before opening customer traffic. Other customers use the normal password-reset flow; qualify actual reset delivery before inviting them back. Staff access and integrations are restored individually. Resume admissions or sending only after reviewing current capacity, recipient choices and provider state.

Keep the source offline. A rollback after target writes needs a new recovery decision; re-enabling the old source loses those writes. Retain private receipts with the encrypted bundle according to the recovery retention policy. Delete temporary verification/enrollment files after secure enrollment and receipt verification; preserve recovery codes in the password manager. Filesystem removal does not promise physical erasure from snapshots or provider backups.
