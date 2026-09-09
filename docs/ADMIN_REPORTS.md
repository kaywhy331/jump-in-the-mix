# Administration reports

Open **Admin → Reports** with `reports.read`. Owner, Operator, Growth and Analyst receive this permission by default. An individual denial overrides the role. Staff must have a verified account, active membership and current-session MFA when required. Customer accounts and support views cannot open reports.

Choose 7, 30 or 90 days, or a custom inclusive UTC range of up to 366 days. Today is partial. Each refresh observes retained data through the displayed time; it does not recreate a past database snapshot. Invalid or repeated date parameters fail visibly. Refreshes are limited to 30 per staff account per five minutes; SQL has a 15-second statement timeout inside a repeatable-read transaction.

## Definitions

| Report | Population and meaning |
| --- | --- |
| Confirmed waiting / age | Current confirmed `WAITING` rows across all dates; age starts at the retained request date. Account eligibility, suppression and admission still apply at release. |
| Waitlist conversion | Requests created in range; their confirmation, grant and join timestamps through observation time. Withdrawn is current state. These counts overlap and are not a sequential funnel: a referral can grant access without waitlist confirmation. |
| New accounts / activation | Customer accounts created in range, including suspended accounts. Setup, retained contacts and prepared mixes are separate facts. Activation requires current setup completion plus at least one owner-recorded completed outcome or `jump.done` event since creation. Automatic completion does not activate an account. |
| Active members | Distinct workspace owners with meaningful authenticated use in range, regardless of account creation date. Copy, compose, call, voicemail, outcome and manual done/skip/reopen events count; merely opening a follow-up does not. |
| D7 / D30 | New-account cohort with first-week meaningful use. Return windows are elapsed days `[7,8)` and `[30,31)` after creation. The entire return window must have elapsed for inclusion in its denominator. A zero denominator is a dash, not a zero-percent retention claim. |
| Invitation source | Grants created in range; accepted and activated outcomes through observation time. One account has one accepted grant. Distinct inviting members is source-cohort participation, not a historical eligible-member denominator or viral coefficient. |
| Median time to join | Median elapsed hours from grant creation to acceptance, among accepted invitations only. Outstanding invitations are not assigned an estimated acceptance time. |
| Wave outcomes | Latest 30 waves actually released in range. Original FIFO/random selection counts coexist with retained grant counts, which can be smaller after deletion. Provider acceptance, delivery receipt, account joining and activation are separate facts. |
| Library use | Top 20 retained public catalog versions by completed follow-ups and new copies. Copies made in range and outcomes recorded in range have different populations. Customer edits do not change source-version attribution; private mix titles are not selected. Legacy imports without provenance remain unknown. |
| Completed / skipped / connected | Completed and skipped count distinct follow-ups in those current statuses by completion timestamp, including automatic completion. Connected requires an owner-recorded connected outcome in range. These counts do not establish detected replies or message reads. |
| Email and jobs | Email attempts are outbound API attempts, including retries. Email failures use retained `failedAt` timestamps; bounces/complaints are separate in Admin Email. Job failures use retained terminal failure timestamps; retry or retention can change historical totals. |
| Current usage | Application email ceilings cover rolling 24 hours / 31 days and include the essential-email reserve. Whole connected database size includes indexes and other schemas. No hosting bandwidth/CPU or provider invoice integration is installed; dollar costs are not inferred. |

Provider acceptance and delivery receipt counts include all retained email generations for a grant, using the earliest known timestamps through observation time. A reviewed repeat does not erase an earlier receipt or count the grant again. Late provider events still apply to the archived generation’s ledger. Legacy recorded sending timestamps can establish provider acceptance, but never delivery. Queued/review counts describe the current generation and may coexist with an earlier accepted/delivered email. Missing ledger evidence remains unknown.

Meaningful events require matching workspace, owner and follow-up records. Automated actors, support actors, cross-workspace events, page opens and staff-only accounts do not count as member use. This is owner-based reporting for the current owner-operated product, not multi-seat analytics. Daily unique member counts cannot be summed to obtain a period's unique members.

## Exclusions and privacy

The seeded `demo_user` and staff-only users are excluded automatically. Configure optional `REPORT_EXCLUDED_USER_IDS` and `REPORT_EXCLUDED_EMAILS` as comma-separated lists, at most 100 distinct entries per list. Email matching is case-insensitive. Invalid configuration fails the report rather than silently including part of a test population. Excluded inviters and recipients are omitted from growth reporting. Operational email attempts and storage still include actual staff/test usage.

Only aggregate columns leave PostgreSQL. General reports do not select customer identity, contact details, private notes, message bodies, tokens, outbox ciphertext, session details or provider payloads. Public catalog titles are displayed. Access depends on `reports.read`; the browser payload receives no hidden customer row collection.

## Background exports

Choose **Prepare CSV export** on a valid live report, then open **Your exports** and refresh status. Generation runs on the existing worker after customer jobs. The file uses data observed when the worker prepares it, which may differ from the earlier screen. It contains explicit aggregate fields in a rectangular `section,dimension,metric,value` CSV, including UTC dates, definition version and interpretation notes. Empty observations remain blank. Spreadsheet formulas, quotes and line breaks are escaped.

The export includes all source, wave and public library version dimensions within the bounds, rather than only the screen's 30 waves / 20 versions. More than 5,000 wave or library dimensions, or a file over 512 KiB, fails visibly; it never silently truncates a successful export. Choose a shorter range if needed. The 366-day and SQL execution bounds also apply.

Requests are atomic and idempotent for the same form submission. Limits are two pending exports per administrator, ten pending globally, five new requests per administrator per rolling 24 hours, and fifty globally. Daily allowances use audit receipts that survive session deletion. Every request, successful generation, cancellation and download is audited without CSV contents. The request/download HTTP paths have additional rate limits.

Files are encrypted with `DATA_ENCRYPTION_KEY` and bound to the export ID and original application session. They expire 24 hours after request. Request, generation, publication and download recheck the current staff permission/session/MFA. Permission loss during calculation prevents publication; a lost job lease cannot publish. A copied download URL does not authorize another sign-in, even for the same administrator. Sign-out/session deletion cascades stored files; expiration denies download immediately and the retention worker removes the row. A previously downloaded local file remains under the administrator's control.

Exports retry at most three worker attempts. A successful file remains frozen on duplicate execution. Inspect failed report jobs in Admin Operations; retrying a terminal job still rechecks the original session and expiry. Operator retry validates the exact failure shown, current permission/session/MFA and an unlocked terminal job inside one transaction. It cannot steal an active lease because an earlier attempt left an error. Expired or canceled requests require a new export. No invitation email is sent for a report download.

## Saved daily reports and storage history

**Saved daily reports** shows the observation time, daily counts and whole-database size, with a permission-gated detail view for each ready record. These are aggregates stored in PostgreSQL, including source/wave/library-version dimensions, not customer event copies. The definition version and a hash of the configured exclusions partition history. Definition version 2 preserves invitation receipts across reviewed email generations; older saved records/exports are not rewritten or mixed into the new definition’s history. Changing exclusions shows the matching population only; earlier definitions are not mixed into a growth chart.

The worker's maintenance pass queues the latest seven completed UTC days once per daily schedule, recalculating recent days for late changes. Existing cohorts at age 9 and 32 days are refreshed after every account in that UTC creation-day cohort has a fully elapsed D7 or D30 window. This is at most nine bounded jobs per daily batch; customer jobs have priority. Simultaneous scheduler passes share a database lock and do not duplicate a batch. Failed jobs use the same three-attempt worker recovery path.

The next batch is due at 00:10 UTC on the following day. An installation or definition change can backfill the latest seven days from retained records; older reports are not invented. Longer outages can leave gaps or older observation times. The screen labels both explicitly. The retention pass removes daily records older than 400 days. Reads are paginated and history list queries extract only the displayed aggregate columns, rather than loading every saved payload.

Storage size is measured at **observation time**, not retrospectively at the selected activity date. The independent `ReportStorageObservation` series keeps the first successful measurement each UTC day. Recalculating an old activity cohort cannot overwrite that series, and changing growth exclusions cannot hide it. History shows measured dates/times separately from the activity-date table. A day without a successful report calculation has no storage measurement; there is no fabricated backfill. These observations are also removed by retention after 400 days.

An individual saved report additionally retains the storage/usage seen during its calculation; several reports calculated together can have nearly identical measurements. Email ceilings displayed on a saved detail page are labelled as current configuration. Cohort outcomes are observed through that saved calculation time; they are not guaranteed lifetime outcomes. Daily unique-member counts must not be summed to estimate period uniqueness.

Migrations `20260909050000_report_storage` and `20260909051000_report_storage_observations` add only report tables, indexes, checks and foreign keys. They preserve existing custom constraints and indexes. Upgrade the web app and worker together after applying them; an older worker does not recognize the new report task names. The existing worker/retention schedule supplies processing; no analytics warehouse, extra paid worker or object store is required.

## Historical limits and remaining work

These live reports use retained records. Account deletion, waitlist withdrawal/rejoining, setup changes, reopened follow-ups, cleared failures and retention can restate prior totals. Cohort outcomes can legitimately improve after the selected period ends. Old system data without a reliable actor/version is not backfilled with an invented fact.

Daily rollups, asynchronous exports and observed database-size history are implemented. Independent allowance and health alerts are implemented locally; see [Operational alerts](OPERATIONAL_ALERTS.md). Historical referral eligibility denominators and external hosting usage integration remain open in the product completion ledger. Representative production-volume query/load qualification also remains open; small fixture correctness does not establish capacity. The application does not infer actual provider charges from its own counters.

## Local verification

`tests/admin-report-range.test.ts` checks UTC dates, leap years, invalid/ambiguous ranges, bounded exclusions and empty denominators. `tests/admin-reports.integration.test.ts` checks exact totals against a disposable PostgreSQL fixture, including automation/support exclusions, retention maturity, UTC boundaries, library provenance, distinct counts and private-content sentinels.

`tests/report-storage.integration.test.ts` exercises encrypted and frozen exports, concurrent requests/capacity, durable allowances, permission/lease races, session binding, substitution/expiry checks, CSV safety/size, complete dimensions, scheduling, saved aggregates and retention. Worker tests verify customer-first report dispatch and terminal failure handling. The migration rehearsal checks an additive upgrade, ready-state constraints and session cascades on a populated disposable schema.

`REPORTS_E2E=1 AUTH_REQUIRE_ADMIN_MFA=true` enables `e2e/admin-reports.spec.ts` on a loopback `jitm_design_*` database. It exercises the packaged page, date controls, trends, payload privacy, permission/MFA/customer/anonymous boundaries, actual CSV downloads, cross-session/expired-file denial, saved-history detail, phone/desktop widths and both themes. All image capture is disabled. Fixtures execute only their scoped report jobs and never invoke a sending worker or a real email service.
