# Private data retention

The application now has a bounded private-data cleanup pass on the existing worker. This runbook describes application behavior, not proof that a production worker or public privacy policy has been qualified. Migration `20260909100000_private_data_retention` adds markers, consistency checks, indexes and an empty checkpoint table; it does not delete existing content during deployment. Apply matching web/worker code and regenerate Prisma after migration.

## Retained data and cleanup

| Data | Implemented behavior |
| --- | --- |
| Provider event details | After 30 days from receipt, remove provider IDs and recipient hashes. Preserve these details while an unretired ledger for a matching recipient still has uncertain acceptance, so a later receipt association can reconcile the event. |
| Provider replay records | Keep the event ID, type, event/receipt times and retirement marker. A replay of that ID remains a duplicate after the details expire. A new verified adverse event still applies normal suppression rules. |
| Email ledger details | After 400 days without recorded email activity or a newer attempt, remove the recipient hash and provider ID. Active/recoverable invitation deliveries protect their current and archived ledger generations. |
| Legacy provider references | Provider IDs on old, already-purged outbox/history records also expire after 400 days from their relevant record activity when no unretired ledger still needs them. A recent purge or record change can conservatively extend this period. |
| Email key records | Keep the hashed delivery key, payload fingerprint, category, original first-attempt clock and recorded outcome timestamps. A retired key is refused before any send reservation, even if it previously had provider acceptance. Late acceptance cannot repopulate retired identifiers. These are purpose-limited records, not a claim of anonymization. |
| Email API attempts | Remove attempts older than 400 days in bounded batches. The complete 24-hour/31-day capacity windows remain intact. Cleanup cannot reset the original delivery clock or refund sending capacity in those windows. |
| Unusable invitation content | Remove frozen email payloads after the grant has been accepted/revoked, or the staff offer has expired, for at least 30 days and the delivery has no active lease or recent change. Keep a sent state as sent; unused queued/review records become canceled. Mark the payload as expired. Active invitations keep their frozen content. |
| Unusable customer token ciphertext | Remove ciphertext 30 days after acceptance/revocation. Keep the token hash, grant identity, source and quota relationship. The database rejects making a purged grant active again. |
| Unconfirmed waitlist requests | Remove unconfirmed waiting requests older than 30 days only when there is no current confirmation opportunity, recent entry change, grant or verification. Confirmed waiting entries are not silently expired or moved in the FIFO order. |
| Verification records | Remove expired email-verification/recovery records after another 30 days. Unexpired records remain usable. |
| Resolved/closed support conversations | Remove after 180 days without case activity or changes. A newer message, recent notification activity, queued/sending support email, active customer view, reopening or unresolved status protects the conversation. Removing the case also removes its messages, encrypted notifications, generation history and old view records. Support delivery ledgers in queue/sending/review remain protected while the case exists; an old inactive closed case can still expire. |
| Support purge audit | Record the case ID, policy duration and purge action without copying the title, conversation, private view reason or requester details. Existing platform audit follows its own retention period. |
| Expired support-view records and platform audit | Remove old expired views and platform audit records after 400 days. Recent permission/recovery/security receipts remain available. |
| Reports, jobs, worker heartbeats and sessions | Existing cleanup remains: expired exports, 400-day daily reports/storage observations, completed jobs after 30 days, failures and relevant preparation receipts after 90 days, old heartbeats after 30 days, and expired sessions/temporary idempotency records. |
| Import retry receipts | Seven-day expiry is extended while the matching import has a resumable job. This prevents a delayed retry from duplicating already saved contacts. Closed imports cannot resume; their expired receipts can be removed. Cleanup handles at most 1,000 eligible idempotency keys per pass. See [import recovery](WORKER_RECOVERY_QUALIFICATION.md). |

The 400-day email-detail window is measured against retained activity, not just the initial request. Receipt timestamps remain facts after identifier minimization, so invitation reports still count each grant once across retained generations. Historical attempt/failure totals can change after retention; saved reports and exports keep their existing definition and observation time.

Active invitation content is deliberately retained while that original offer can still be used or recovered. There is no automatic expiration of a valid customer grant and no new invitation allocation. Suppression records, recipient opt-outs and clearance watermarks are not removed by this pass. A cleanup cannot reinstate a blocked recipient, erase a used referral slot, change admission limits, release a wave or send an email.

## Execution and concurrency

`cleanupOperationalData()` runs `runDataRetention()` during the existing maintenance pass. Each private-data class processes at most 100 candidate rows by default; the internal test/maintenance entry point accepts 1–500. Cascading messages for a selected support case can exceed that row count. An older backlog takes multiple passes. PostgreSQL query and transaction timeouts bound each phase; a failure is reported for retry instead of claiming the backlog is gone.

Email cleanup takes the same access and sending-capacity locks used by issuance, suppression, receipt recording and reservations. It rechecks eligibility inside its transaction. Support cleanup takes staff authority and case-row locks. Reopening either completes first and protects the case, or sees that the old case has already been removed; it cannot produce a reopened case with a purged thread. Active or locked records remain protected.

Successful phases may commit before a later phase fails. Repeating the pass is idempotent: retired records stay retired and no replacement email key, invitation or case is generated. The final aggregate audit and completion checkpoint commit together. Error text is fixed and excludes raw SQL, customer content and credentials.

## Administrator and customer visibility

**Admin → Operations → Data retention** requires `operations.read` and current staff MFA. It shows the last complete pass and an allowlisted set of aggregate counts. A missing checkpoint, recorded failure or success older than 24 hours is labeled as requiring attention. A successful bounded pass does not prove every eligible record in a backlog has already been processed.

Recovery screens omit invitations whose frozen private content has expired. The server also refuses a crafted stale recovery request. Admin Email labels provider events whose private details have expired while their replay records remain. Existing permissions still control these screens.

Help, the support conversation list and individual conversations explain the 180-day policy. A purged case no longer appears in the customer's list, and its former URL cannot reveal the deleted thread. The customer can open a new conversation. Pending support email remains an explicit retention exception until delivery handling resolves it; stalled support-email recovery remains a separate operational task.

## Deployment and verification limits

Before public launch, match the public privacy notice to these actual rules and identify the business/contact owner. Confirm the maintenance process runs unattended and inspect real cleanup checkpoints. Application cleanup does not erase already-delivered emails, downloaded exports, provider-held data, private runner logs or historical backups. Backup storage/key retention and deletion after restoring an older backup need their own qualified operating procedure. Restore holds application access before loading archived data. The available-source full-bundle, restrictions, cutoff and guarded reopening path is implemented; independently retained evidence, unavailable-source history, provider/log deletion and hosted recovery still require qualification. See [Restore recovery](RESTORE_RECOVERY.md).

Encrypted [recovery-state exports](RECOVERY_STATE.md) contain selected account/recipient identifiers and restriction state plus hashed row inventories. They do not copy contact notes, passwords or access-token values, but are still personal-data artifacts. Their external storage, retention, key recovery and coverage must be included in the same operating procedure. The read-only comparison detects newer changes; it does not itself erase recovered historical data or authorize reopening.

The separate [recovery restriction operation](RECOVERY_RESTRICTIONS.md) can erase restored accounts absent from an authenticated newer source snapshot while retaining the recovery hold. It also clears restored credentials and conservatively restricts customer sending. Migration 46 closes four historical workspace-erasure gaps: contact-group state, Jump action events, broadcast schedules and Mix stops now cascade with their workspace; existing orphans are removed and late orphan writes are rejected. This does not recover omitted content corrections, cover changes after the captured source point, delete offsite artifacts or authorize reopening. Retain encrypted pre-migration evidence and keys under the private recovery retention process until qualification is complete.

`tests/data-retention.integration.test.ts` uses disposable PostgreSQL records to test key/replay protection, rolling budgets, active/current/historical invitation evidence, exact cutoffs, bounded batches, stale leases, staff expiry, waitlist confirmation opportunities, support exceptions and reopening races, database consistency checks, and checkpoint failure/recovery. `DATA_RETENTION_E2E=1` enables the packaged-browser admin/customer flows with required MFA and capture disabled. No test starts a sending worker or contacts a real email provider.

See [Email operations](EMAIL_OPERATIONS.md), [Support case access](SUPPORT_CASE_ACCESS.md), [Report definitions](ADMIN_REPORTS.md) and [the product completion ledger](PRODUCT_COMPLETION.md). These local controls do not close the full launch goal.

Support notification recovery and its retention exceptions are described in [Support email operations](SUPPORT_EMAIL_OPERATIONS.md).
