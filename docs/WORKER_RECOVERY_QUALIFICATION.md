# Worker and import recovery

The launch requires a supervised worker that makes progress without web traffic. A fresh heartbeat shows that the process can reach the database; it does not prove that a particular job finished. Use the saved job, import, preparation and incident records alongside the independent monitor.

## Import guarantees

Each imported row saves the contact, dates, audit entry, preparation job and retry receipt in one PostgreSQL transaction. A failed receipt write rolls back that row. A crash after commit leaves a receipt that the next attempt reuses, including for contacts without email or phone numbers. Previously reported results remain unchanged.

Progress updates every 25 rows. Cancellation collects any committed receipts that have not reached the progress report, then closes the batch and its job. It preserves contacts already saved. Row writes, progress and completion check the active job lease and current account ownership under database locks. A canceled batch or replaced worker cannot restart those writes. Database failures interrupt the job; validation failures appear as rejected rows.

Expired row receipts remain while the batch has a resumable job. Cleanup removes at most 1,000 eligible keys per pass. Completed or canceled imports cannot be retried from Operations. Failed imports may be retried by a currently authorized staff member with the existing session and MFA checks. Retry resets only the terminal failure the operator reviewed.

An expired lease at its attempt limit is settled as failed without executing another attempt. Operations must review it before retrying. Import failure messages do not include contact contents or database connection details.

## Upgrade from older import code

Migration `20260909120000_import_crash_recovery` handles ambiguous imports from the earlier code, which saved contacts and receipts separately. It closes running or failed imports, and queued imports that already started or had a claimed attempt. Saved results, counters, contacts and payload remain; a system audit records the review requirement. Untouched queued imports and previously closed imports retain their state.

This release requires a worker stop before migration, including background invocations and any scheduler that can start the old worker:

1. Pause automatic web/worker deployments before publishing this release; the current Render blueprint enables deployment after successful checks. Pause customer traffic at the host or proxy and pause worker triggers. Stop and drain every old worker, and confirm no old import transaction is still executing. There is no separate import-pause switch in the application.
2. Take and qualify the private backup using the established recovery procedure.
3. Apply committed migrations with the migration role, then verify the database against the new immutable application release.
4. Start the matching web and supervised worker release. Check readiness, independent monitoring and actual job progress before reopening imports.
5. Review closed older imports against saved results and existing contacts. Import only the remaining rows using a new import identifier. Do not reset their old jobs or reopen their batches.

Do not run this migration while old worker code can still execute. The new database release barrier cannot fence code from the older release. Rolling back to that code would reintroduce the import gap; keep traffic and workers paused while repairing a failed upgrade. Production deployment and migration remain separate release actions.

## Repeatable local qualification

Use an explicitly configured loopback PostgreSQL database named `jitm_design_...`, with permission to create and drop a disposable test database:

```sh
npm run worker:qualify
```

The qualification creates and migrates its own database, runs actual Node worker processes and deletes its database afterward. It does not start a web server or make application HTTP requests. Delivery credentials are blank and fixtures contain no external integrations. Allow about six minutes for the real five-minute recurrence case.

The process cases cover two workers competing for a future job, an exhausted stale lease, a real `SIGKILL` between import rows, and a connection outage through a loopback proxy followed by supervisor-style restart. The crash test proves that a fresh lease is left alone, then explicitly ages its timestamp to exercise recovery without waiting ten minutes. The five-minute maintenance test uses the normal production interval, without a clock override.

The regular test suite includes the four shorter process cases and the PostgreSQL import failure, cancellation, takeover, receipt-retention and populated-upgrade cases. Set `RUN_WORKER_UNATTENDED_TESTS=true` to include the real five-minute case; CI enables it. Remote CI execution is separate evidence from a local run.

## Remaining hosted proof

Local worker processes do not establish Render service supervision, hosted networking behavior, deployment revision coordination, CPU or memory limits, cold starts, recurring external scheduler delivery, real provider effects or backup durability. Run the corresponding deployment checks on the chosen host and record its release and monitor receipts. No paid service is required by these local recovery changes.
