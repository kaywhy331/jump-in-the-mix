# Operational alerts

This is an implemented local capability and a deployment runbook, not proof that production monitoring is running. Migration `20260909090000_operational_alerts` creates empty monitoring records; it does not seed a healthy state. The web app, independent monitor and generated Prisma client must use matching code after migration.

## What is checked

The independent `ops:check` / `ops:watch` command observes the web readiness endpoint and reads aggregate database evidence. It is intentionally separate from the customer worker: a stopped worker cannot certify its own health. No new hosted monitoring product or messaging provider is required by this code. An always-available monitoring host, supervision and actual channel delivery still need qualification. Polling can wake sleeping services; include that activity when checking the chosen hosting allowance.

| Check | Evidence and default threshold |
| --- | --- |
| Web | The configured origin's `/api/health/ready` must return HTTP 200. Redirects are refused; timeout is ten seconds. No response body is retained. |
| Worker | A RUNNING heartbeat within `WORKER_HEARTBEAT_STALE_SECONDS`, default 90 seconds. Missing or stale is critical. Match the threshold to the qualified worker runtime. |
| Jobs | Unresolved failed jobs, or due work at least 15 minutes overdue without a current ten-minute lease. Any recorded problem is a warning. |
| Invitations | Any REVIEW delivery, queued work overdue by 15 minutes, or a sending lease older than five minutes. Budget-deferred messages with a future next-attempt time are not overdue. |
| Email | Rolling 24-hour and 31-day attempts against both total allowance and the non-authentication portion. Warn at 80%; critical at 100%. This is conservative application accounting, not a provider invoice. |
| Database | PostgreSQL physical database bytes against `OPS_DATABASE_LIMIT_BYTES`. Warn at 80%; critical at 100%. Zero means the allowance is unknown. Compare with the actual provider console; this does not measure other hosting costs. |
| Backup | Age of a matching backup command receipt, existing archive and version-two manifest. Warn at 80% of 36 hours; critical after 36 hours. Missing, mismatched or unsupported artifacts are unknown. |
| Restore | Age of a completed content-and-foreign-key verification receipt for the same source. Warn at 80% of 30 days; critical after 30 days. Missing proof is unknown. |
| Administrator verification | Currently blocked MFA enrollment/verification rate-limit records. A warning requests investigation; it does not prove a compromised account. |
| Support access | At least ten support-view starts in the preceding hour, across administrators. Adjust `OPS_SUPPORT_VIEWS_PER_HOUR` to a justified operating threshold. This aggregate signal is not a judgment about an individual. |
| Notification setup | Whether a valid private operational webhook is configured. Endpoint acceptance and failures are shown separately in the notification history. |

Invalid numeric limits stop the check instead of silently selecting a healthy default. Database queries run in a repeatable-read transaction with bounded query/transaction time. Only whitelisted numeric evidence is persisted or sent; email addresses, names, contacts, messages, credentials, destination URLs and raw provider errors are excluded.

## Incidents, acknowledgments and delivery

**Admin → Operations → Operational alerts** shows the last complete observation, each check, missing evidence and recent notification receipts. The Overview links to this page for staff with `operations.read`. A missing, stale or failed monitor is prominently labeled: saved results do not establish current health.

A non-OK check opens an incident. The same condition does not emit an alert on every poll. An unacknowledged incident gets at most one new reminder per 24 hours. A state change is recorded separately; recovery requires a later successful observation. New incidents and higher severity clear an earlier acknowledgment. Numeric evidence changes invalidate an already-rendered acknowledgment form without generating another notification by themselves.

Acknowledgment requires `operations.read` and `operations.manage`, a current verified staff account/session, enabled MFA when required, the current revision and a reason. Owner and Operator templates include the new permission; individual denies still apply. An audit identifies the real actor. Acknowledgment stops pending reminders and leaves the problem open. It cannot undo a message already in flight.

The notification outbox records a stable event ID, a sending lease, attempt reservations and endpoint acceptance. It retries the same event at most five times within 24 hours, then leaves a visible failure. The destination receives an `Idempotency-Key` header and `eventId` in the JSON, but generic webhooks may not deduplicate: a timeout can result in a duplicate notification. At most 20 notices are processed per monitor pass. State changes cancel obsolete queued notices; uncertain attempted warnings can still receive a recovery notice. No recovery message is created for a warning that was never attempted.

Operational notification records are retained for 90 days and cleaned by successful independent monitor passes. Platform transition and acknowledgment audits follow the broader platform audit policy. No invitation/email ledger is removed or reset by this cleanup.

## Independent setup

For the prepared Render/S3/SNS runtime and an AWS check outside Render, use [Independent production monitoring](INDEPENDENT_MONITOR_DEPLOYMENT.md). This supports direct S3 metadata evidence and SNS as an alternative to the HTTPS webhook. Activation, additional service cost and actual email receipt remain separate from local implementation proof.

1. Apply the migration and generate the matching Prisma client. Install the repository's locked dependencies, including `tsx`, on an **independent, supervised host**. The monitor needs network access to the database and web origin. Keep the web/worker and this host's failure domains separate.
2. Put private configuration in the host's secret/environment file. `DATABASE_URL` is the monitoring connection; use an appropriate restricted database role. The queries need operational metadata, aggregate usage and writes to the three Operations tables plus platform transition audit inserts. They do not need customer message content, sender credentials or the data-encryption key. Use [the column grants](../infra/operations/monitor-grants.sql) for an existing dedicated login role, with database CONNECT permission as required by the provider. The local qualification exercises this role against the real monitor and proves that customer fields, invitation ciphertext, rate-limit keys and staff-actor audit inserts are denied. Apply and verify the grants against the deployed schema before launch.
3. Set `APP_URL`, the four email allowance/reserve variables, the qualified worker heartbeat threshold, `OPS_DATABASE_LIMIT_BYTES`, and a private `OPS_ALERT_WEBHOOK_URL`. The webhook must use HTTPS; plain HTTP is accepted only for loopback test sinks. Do not put secrets in command arguments. Webhook redirects are refused.
4. Set `OPS_MONITOR_STATE_FILE`, `OPS_BACKUP_RECEIPT_FILE` and `OPS_RESTORE_RECEIPT_FILE` to absolute paths on private durable storage. The default monitor cadence is 300 seconds; its public freshness threshold is 900 seconds. Keep the web's freshness threshold and the independent runner's interval consistent.
5. Run `npm run ops:check` and inspect **Operational alerts**, command output and the actual administrator channel. Exit 0 means an observation completed (it may contain alerts); exit 1 means monitoring failed. The output names checks needing attention and confirmed notification count, without private source records.
6. Supervise `npm run ops:watch`. [The systemd unit](../infra/operations/jitm-monitor.service) is a reviewable template: provision the named service account/directories, install Node/npm in its executable path, configure the environment file, and adapt checkout/storage paths. No service is installed or started by this repository change. An ephemeral CI filesystem alone does not retain outage deduplication state.
7. Configure a separate availability check for `/api/health/monitor`, alongside live/ready/worker health endpoints. Its 200 response proves recent complete independent observations, not that every product check is healthy. If the monitor itself disappears, this outer check must notify the operator. Qualify alert receipt, recovery, process restart and a stopped worker before launch.

When PostgreSQL is unavailable, the monitor's small private local state file reserves alert attempts and retains the event ID across invocations. It sends a generic monitor-unavailable notice without a database dependency, with five attempts and daily reminders, then sends recovery after monitoring works again. A ten-minute file lease serializes local invocations; normal database checks also use a two-minute database lease. Run one supervised monitor per environment and keep its state file across restarts. A corrupt/unwritable state file fails visibly rather than discarding deduplication history.

## Backup evidence and restore qualification

Set `OPS_BACKUP_RECEIPT_FILE` on the backup runner. A successful `npm run db:backup` writes the receipt atomically only after the encrypted archive and manifest exist. It includes a hash of the source host/port/database/schema, the artifact locations and checksum. It stores no database password. Changing only database credentials does not change the source identity; changing endpoint aliases does, so backup and monitor must use the same canonical database endpoint.

The monitor checks receipt/manifest agreement, source identity, file availability, size and age. It does **not** read and rehash the entire archive every five minutes. Freshness does not prove archive integrity, offsite durability, encryption-key recovery or restoration; those require the separate restore qualification. Keep both archive and manifest in private durable storage outside the application host. If either artifact is moved, regenerate an appropriate backup receipt through the controlled backup pipeline rather than editing timestamps to silence the alert.

For an authorized loopback source where creating disposable databases is permitted, `npm run db:rehearse-restore` records `OPS_RESTORE_RECEIPT_FILE` after a full isolated restore and foreign-key smoke check. Its disposable backup deliberately does not replace the durable backup-freshness receipt.

For a hosted source, first create and transfer a current encrypted backup and manifest, then provision a separate empty loopback restore target. Set the source `DATABASE_URL` for identity, the separate `RESTORE_DATABASE_URL`, the dedicated `BACKUP_ENCRYPTION_KEY` and a private `OPS_RESTORE_RECEIPT_FILE`. Run:

```bash
npm run db:qualify-backup -- --input /secure/backup.jitm-backup.enc
```

This command restores only into the explicitly configured empty loopback target, verifies all recorded table contents and declared foreign keys, then writes the success receipt. It does not create/drop databases on the hosted source or delete the local restored database. A failed run leaves any previous successful receipt intact and does not reset its age. Source manifests predating this source-identity metadata remain supported by the normal restore command but cannot establish current monitoring proof.

## Local verification and remaining qualification

The operations integration tests exercise real PostgreSQL observations, leases, incident transitions, acknowledgments, authority changes, retries, cancellation/acceptance races and evidence redaction. The independent CLI test uses a real loopback health server and webhook sink, then a closed database port to exercise its outage path. Artifact tests cover restart state, missing/invalid files and source binding. The encrypted recovery suite runs actual backup and isolated restore commands before accepting a receipt. Browser tests use `OPS_ALERTS_E2E=1` with required MFA and capture disabled.

No external notification, production migration, monitoring-host provisioning or paid service is enabled by these tests. Actual supervision, restricted database-role validation, durable artifact storage, monitoring-channel receipt, outer monitor availability checks and provider allowances remain production qualification requirements. See [the completion ledger](PRODUCT_COMPLETION.md).
