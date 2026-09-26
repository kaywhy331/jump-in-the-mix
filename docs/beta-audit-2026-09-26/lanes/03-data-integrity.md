# Lane 3 — Data integrity and trust

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

Reviewer: Lane 3 (static, traced). Code: `/tmp/jitm-beta-audit-20260926` at production commit `4b5abd8`. Nothing was built, run against a database, or deployed. Computations used `node -e` with Node built-ins, plus one run of the app's own dependency `libphonenumber-js@1.13.13` (the production version) to compute phone keys. No marketing reference files were read (none bear on this lane).

**Lane verdict: blocks inviting until DATA-01 is fixed; after that, GO WITH CONDITIONS.**
Changing a time setting brings completed follow-ups back as new pending ones. The same happens after the owner changes their time zone, default follow-up time, quiet hours, working hours or a Mix's Beat timing. Owners who turned on automatic email get the same emails re-sent to customers (DATA-01). An existing integration test already shows it happening. Three HIGH items should be fixed, or have a written workaround, before invites:
- Re-starting a finished Mix silently does nothing (DATA-02).
- One unreadable date rejects a whole import row, and Outlook's "0/0/00" could reject every row (DATA-03).
- Recovery has not been proven on the current schema (DATA-04).

The idempotency, concurrency and deletion work from Releases A–C is sound (see "What holds up").

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| DATA-01 | BLOCKER | VERIFIED (mechanism + existing test); user effect INFERRED | Changing time zone, time settings or a Mix's timing re-creates completed follow-ups as new pending ones, and automatic email sends them again |
| DATA-02 | HIGH | VERIFIED (code); user effect INFERRED | "Start mix" for someone who already finished a manual Mix does nothing but says "Follow-ups are being prepared" |
| DATA-03 | HIGH | VERIFIED (code + computed); Outlook file format INFERRED | Import rejects the whole row for one unreadable date; Outlook's "0/0/00" (and day-first or "TBD" dates) fail every such row (prior CON-F13 still open) |
| DATA-04 | HIGH | VERIFIED (docs/code); production state NOT RUN | Recovery is unproven for today's schema: the last production restore was 2026-09-10 at 48 of 71 migrations, cutover was never rehearsed, backups expire after 7 days, and a failed backup raises no alert |
| DATA-05 | MEDIUM | VERIFIED (computed); real export files INFERRED | Import silently stores wrong values: Outlook and Google address columns are mis-mapped, and accented names are corrupted (Windows-1252 CSV, vCard 2.1) |
| DATA-06 | MEDIUM | VERIFIED (code) | Duplicate saved dates double every date-based follow-up (a merge moves all dates, a manual and an imported birthday are both kept, "Add date" has no double-tap guard) |
| DATA-07 | MEDIUM | VERIFIED (code) | A phone-only match defaults to merging a different person into an existing one; the form refuses a household or office number shared by two people |
| DATA-08 | MEDIUM | VERIFIED (code + computed) | The spreadsheet export drops Do-not-contact and private notes and cannot be re-imported; the "complete JSON backup" has no restore path |
| DATA-09 | LOW | VERIFIED (code); double-submit effect INFERRED | Other creates have no idempotency key (bulk one-time messages, calendar entries, finishing onboarding) |
| DATA-10 | LOW | VERIFIED (code) | Time edge cases: evening send times move to 08:00 the same day; saved dates keep the zone they were saved in; DST "choose UTC" (prior TOD-F15 still open) |
| DATA-11 | LOW/PARKED | VERIFIED (code) | No way to permanently delete one person; import batches keep every uploaded row for the life of the account |

## Flows traced

- **Outcome recording.** Today card or tray (`src/components/JumpWorkflow.tsx:115-128` keeps one request id per logical attempt; `:145-162` `saveOutcome`) → `POST /api/jumps/[jumpId]/outcome` (`route.ts:130-139` key `jump-outcome:<jumpId>:<requestId>` plus replay; `:203-209` re-check inside the transaction; `:212-240` status transition guarded on `status`; `:319-326` key stored in the same transaction; `:331-337` replay after a race) → `queueWorkflowForJump` → `ContactActivity` + `AuditLog`.
- **Contact create and edit.**
  - Create: `ContactForm.tsx:86-90` (id minted on first submit, reused) → `contact-actions.ts:281-382` (`contact-create:<userId>:<requestId>`, workspace row lock `:306`, receipt `:375-377`) → `generate-jumps` job.
  - Edit: `contact-actions.ts:384-470` (fingerprint re-computed under `SELECT … FOR UPDATE` at `:407-409`).
- **Import.** `ContactImportWizardV2.tsx:278-291` (`file.text()` → `parseContactFile` → `guessImportMappings` → `analyze`, all in the browser) → `POST /api/contacts/import` mode `match` (`contact-import-service.ts:154-181`) → mode `queue` (`contact-import-jobs.ts:97-160`, unique `(workspaceId, importId)`) → worker `runContactImportBatch` (`:204-263`, 25-row chunks under a lease) → `commitContactImportBatch` (`contact-import-service.ts:670-729`, row receipt `contact-import:<importId>:<rowId>`) → `createImportedContact` / `mergeImportedContact` → `generate-jumps`. Cancel: `DELETE` → `cancelContactImportBatch` (`contact-import-jobs.ts:174-202`).
- **Merge.** `/contacts/duplicates` → `mergeContactsAction` (`contact-merge-actions.ts:53-265`: workspace lock `:88`; saved dates moved wholesale `:131`; assignments `:173-183`; stops copied `:185-196`) → `generate-jumps` for the survivor.
- **Archive and restore.** `contact-lifecycle-actions.ts:17-113` (restore idempotent `:61`; bulk undo under row locks `:94`).
- **Mix start.** Contact profile "Start mix" (`ContactProfile.tsx:144`, `:258`) → `assignMixToContactAction` (`contact-mix-actions.ts:18-58`, upsert on `assignmentKey`) → `generate-jumps` → `reconcileJumps` (`jump-engine.ts:188-755`).
- **Scheduling.** `reconcileJumps`:
  - triggers: manual `jump-engine.ts:457-468`, date `:430-441`, broadcast `:444-456`, appointment `:419-429`
  - time: `:510-523` (default time, quiet hours, weekend rule, working hours)
  - key: `:530-538` → `createJumpUniquenessKey` (`jump-schedule.ts:192-203`)
  - create, update and stale pass: `:624-752`
  - periodic run every 5 minutes for every workspace: `src/worker/index.ts:299-323`
- **Automatic delivery.** Worker minute pass → `runAutomaticDeliveries` (`automatic-delivery.ts:99-286`):
  - uncertain-lease sweep `:100-108`
  - candidates `:147-172`
  - claim under a contact row lock `:187-210`
  - re-check `:222-232`
  - send `:236`
  - settle `:241-272`
- **Worker jobs.** `claimJob` (`worker/index.ts:103-138`) → `processJob` (lease renewal `:217-230`, pause/return `:203-210`, retry and backoff `:245-262`).
- **Export.** `GET /api/account/export` (`route.ts:13-70`: support view refused, 6 per hour) → the JSON streams from `account-export-stream.ts:228-327`; the CSV bundle comes from `contact-export.ts:38-151`.
- **Account deletion.** `/account?section=privacy` → `deleteAccountAction` (`account-deletion-actions.ts:16-51`) → `deleteAccountData` (`account-deletion.ts:36-127`: explicit deletes, then `workspace.deleteMany` and `user.delete` cascading through foreign keys).
- **Backup and restore.**
  - Backup: Render cron `infra/operations/render-backup.yaml:9` (daily 10:17 UTC) → `scripts/backup-to-s3.mjs:15-35` → `scripts/backup-database.mjs:71-155` (snapshot `pg_dump` plus recovery state plus authenticated manifest) → S3 `production/`.
  - Restore: `scripts/restore-database.mjs` (separate target only, recovery hold, digest and foreign-key checks).
  - Rehearsal: `scripts/rehearse-backup-restore.mjs` (local or CI, `.github/workflows/ci.yml:182-186`).
  - Qualification: `scripts/qualify-backup.mjs` (production archive → loopback target).

## Findings

### DATA-01 — Changing time zone, time settings or a Mix's timing re-creates completed follow-ups as new pending ones, and automatic email sends them again
- Severity: BLOCKER · Label: VERIFIED (code path, plus an existing integration test that asserts the regeneration); what the user sees is INFERRED · Prior: none (new)
- What the user experiences: a plumber marks three follow-ups done this week. On Friday he changes something time-related:
  - his time zone (Account → Personal preferences, or the Journey preferences editor)
  - Scheduling defaults: default follow-up time, quiet hours or weekend handling
  - Journey preferences: working days or hours
  - a Beat's day or time in the Mix editor

  Within five minutes, Today lists those customers again as "N days overdue". The Done list still shows them as done. If he opted into automatic email, each of those emails goes to the customer a second time about 30 minutes later (the default review window). The same applies to skipped Beats and to any Beat in the last 45 days.
- Reproduction:
  1. On a fresh account, open a contact → "Start mix" with a Mix whose first Beat is day 0. Wait for "Follow-ups are being prepared" to finish.
  2. `/jumps`: mark that follow-up done.
  3. `/account/preferences`: change the default follow-up time (for example 10:00 → 09:30) and save. If only the Journey preferences editor is shown, change "working hours start" or the time zone instead.
  4. Reload `/jumps` once the worker has run (the scheduling save queues the job; a time zone change is picked up by the 5-minute pass).
  5. The same Beat for the same person is pending again.
- Evidence:
  - The follow-up's identity is hashed from its local time and time zone. `src/lib/jump-schedule.ts:192-203` — `createJumpUniquenessKey` hashes `input.occurrenceKey, input.scheduledLocalDateTime, input.timezone`. `src/lib/jump-engine.ts:536-537` — "scheduledLocalDateTime: anchored ? ANCHORED_KEY_PART : localDateTime, timezone: anchored ? ANCHORED_KEY_PART : trigger.timezone".
  - Those inputs come from owner settings:
    - `jump-engine.ts:359`, `:458` — manual-start Mixes use the owner's time zone (`const timezone = workspaceTimezone`)
    - `:515-516` — "const requestedMinutes = mixStep.sendTimeMinutes ?? trigger.timeMinutes ?? personalRule.defaultFollowUpMinutes; sendTimeMinutes = outsideQuietHours(…)"
    - `:514` — weekend rule
    - `:519-520` — working-hours availability
  - Nothing checks for a completed row of the same occurrence:
    - `jump-engine.ts:626-634` — when no row carries the new key: "creates.push({ ...desiredJump, status: "PENDING" })"
    - `:638` — "if (!canReconcile(existing)) continue;" protects DONE or SKIPPED rows only while their key still matches
    - `:483` — the Journey path skips only CANCELED visits, not DONE ones
    - `:56`, `:297` — the window reaches back `DEFAULT_PAST_DAYS = 45`
  - Existing test that proves it: `tests/draft-continuity.test.ts:98-109` ("leaves a draft on a row the owner completed after the pass read it"). It sets the row to `status: "DONE"`, changes the broadcast `timeMinutes: 750`, then asserts `expect(result.created).toBe(1); const regenerated = await pendingJump();`. The draft behaviour is what the test checks; that the occurrence is regenerated is taken for granted.
  - Computed: the same occurrence gets three different identities.
    ```
    node -e (sha256 of the key parts)
    before  (America/New_York, 10:00): 239471ec4c3ac472
    tz edit (America/Chicago, 10:00):  2f3693b18e120e83
    time edit (America/New_York, 09:00): b35bb310b2ef675d
    ```
  - What queues or picks up the change:
    - `src/lib/account-preference-actions.ts:67-73` — the scheduling save queues `generate-jumps`
    - `src/lib/journey-preference-service.ts:7-13` — saves the time zone, default time and quiet hours, and queues `generate-jumps`
    - `src/lib/mix-editor-actions.ts:376` — the Mix save queues `generate-jumps`
    - `src/worker/index.ts:299-318` — every workspace is reconciled every 5 minutes
  - Automatic re-send:
    - `src/lib/automatic-delivery.ts:147-156` — candidates are `status: "PENDING"` with `scheduledAt: { lte: threshold }`. There is no lower bound, so a 10-day-old occurrence qualifies.
    - `:227` — eligibility counts from `createdAt: { lte: currentThreshold }` (creation plus the review window)
    - `:193-197` — deduplication is per `jumpId` only, and the regenerated row has a new id
    - `:86` — the email idempotency key is `automatic-follow-up:${jumpId}`, so the provider sends again
  - In workspaces without Journey connections, a merge probably causes the same effect (INFERRED). The survivor inherits the merged person's assignment, and the keys include `contactId`.
- Root cause: the scheduler identifies a legacy follow-up by its computed local time and time zone rather than by the occurrence. The regeneration logic (`ownedByOccurrence`, `jump-engine.ts:275-292`) carries snoozes and drafts from pending rows only. It never asks whether that occurrence was already completed or skipped.
- Fix direction: before creating, look up any DONE or SKIPPED row with the same `(contactId, mixStepId, jumpDateId, templateSnapshot.originalLocalDate)` and skip the occurrence. Alternatively, drop the time and time zone from the legacy key, as anchored rows already do. Also make automatic delivery refuse a row whose occurrence already has a completed sibling. Add the missing test: complete, change the time, and assert `created === 0`.
- Runtime check for the lead: the reproduction above on the production build with the worker running. Also run `npx vitest run tests/draft-continuity.test.ts`; its last case documents the regeneration.

### DATA-02 — "Start mix" for someone who already finished a manual Mix does nothing but says "Follow-ups are being prepared"
- Severity: HIGH · Label: VERIFIED (code); what the user sees is INFERRED · Prior: none
- What the user experiences: a repeat customer calls for a new estimate. The owner opens the person and starts the same "Estimate follow-up" Mix they ran in spring. The page says "Start saved. Follow-ups are being prepared." Nothing new ever appears on Today. "Remove" followed by "Start mix" does not help either: it resumes the old run instead of starting a new one.
- Reproduction:
  1. On a contact, "Start mix" with a manual-start Mix that has one Beat on day 0.
  2. Mark it done on `/jumps`.
  3. Back on the contact (`/contacts/<id>`), "Start mix" with the same Mix. The success notice shows.
  4. `/jumps` shows no new follow-up.
- Evidence:
  - `src/lib/contact-mix-actions.ts:32-42` — upsert on `assignmentKey` with "update: { isActive: true }", so the old `startDate` is kept.
  - `jump-engine.ts:459` — "const startDate = assignment.startDate ?? assignment.createdAt"
  - `:464` — the occurrence is `manual:<that date>`, so the same keys are rebuilt and match the DONE rows (or fall outside the 45-day window).
  - The Journey path restarts correctly: `src/lib/journey.ts:52` — "update: { startDate: now, isActive: true }".
  - `ContactProfile.tsx:65` — every active Mix is offered, including ones already assigned. `:174` — the success notice.
- Root cause: the manual start path reuses the earlier assignment's start date.
- Fix direction: when the existing assignment has no pending Beats (or is inactive), set `startDate: now`, as `journey.ts` does. If a run is still pending, say so ("already running, next Beat on …") instead of confirming a start. Owner decision on the semantics.
- Runtime check for the lead: the reproduction above (a few minutes, no waiting).

### DATA-03 — Import rejects the whole row for one unreadable date; Outlook's "0/0/00" (and day-first or "TBD" dates) fail every such row
- Severity: HIGH · Label: VERIFIED (code path, computed parser output); the Outlook "0/0/00" file format is INFERRED · Prior: CON-F13 (a bad email or phone failing the whole row, and duplicates inside one file failing after queueing) is still open
- What the user experiences: a realtor exports contacts from classic Outlook and imports the CSV. Outlook writes "0/0/00" in Birthday and Anniversary for everyone without those dates. Every such row becomes a red card, "Column “Birthday” has an invalid date: 0/0/00 · Will be reported as failed". If all rows fail, the button reads "Queue 0 valid rows" and is disabled. Nothing points to the fix (set that column to "Do not import" in the collapsed mapping editor). The same happens with a hand-made sheet whose "Closing Date" says "TBD", or a UK/AU user's "31/12/1985". Each such row, with its good name, phone and email, is lost.
- Reproduction: `/contacts/import`, upload this file (UTF-8):
  ```
  First Name,Last Name,E-mail Address,Mobile Phone,Birthday,Anniversary
  Ana,Pena,ana@example.com,(555) 201-0001,0/0/00,0/0/00
  Bob,Smith,bob@example.com,(555) 201-0002,4/12/1980,0/0/00
  Cara,Lee,cara@example.com,(555) 201-0003,31/12/1985,
  Dan,Ng,dan@example.com,(555) 201-0004,,TBD
  ```
- Evidence:
  - `src/lib/contact-import-mapping.ts:130-141` — any header containing birthday, anniversary, date, renewal, closing, appointment, event, follow up or contract is auto-mapped to a saved date.
  - `:250-255` — "if (!parsed) { errors.push(`Column “${header}” has an invalid date: ${cell}`)".
  - `ContactImportWizardV2.tsx:187` — rows with errors are excluded; `:442` "Will be reported as failed"; `:451` the button is disabled when no row is valid.
  - Computed parser output:
    ```
    "0/0/00" -> null   "29/02/1980" -> null   "31/12/1985" -> null
    "12/03/1985" -> 1985-12-03 (read month-first in every region)
    "February 29" -> 2001-03-01 (via new Date)
    ```
  - Still open from CON-F13: `contact-import-mapping.ts:268-275` (a bad email or phone fails the row). `contact-import-service.ts:154-181` matches rows only against saved contacts, so two rows in one file sharing a phone both default to CREATE and the second fails at `assertNoMethodConflict` (`:260-285`). "Retry failed rows" re-uses the same CREATE decision.
  - Also: `contact-file-parser.ts:81` numbers data rows by position among non-empty rows. After a blank line or a multi-line cell, the "Row N" in the error CSV no longer matches the spreadsheet row.
- Root cause: validation is per row rather than per value.
- Fix direction: treat "0/0/00" and empty-date sentinels as blank. Drop an unreadable date (or email or phone) with a row warning instead of failing the row (owner decision, see CON-F13). Show a "N rows have unreadable dates in column X — skip that column?" prompt. Group duplicates inside the file at analysis time.
- Runtime check for the lead: upload the CSV above. Expected with today's code: 3 red cards (Ana, Cara, Dan) and only Bob queueable. If possible, confirm with a real classic-Outlook export that its blanks are written as "0/0/00".

### DATA-04 — Recovery is unproven for today's schema: last production restore 2026-09-10 at 48 of 71 migrations, cutover never rehearsed, 7-day expiry, failed backups not alerted
- Severity: HIGH · Label: VERIFIED from the repo's own records and code; production S3 and Render state NOT RUN · Prior: none (the prior ops audit listed the backup design as fine)
- What the user experiences: nothing, until an incident (a bad migration, a DATA-01-style corruption, an operator mistake). Then recovery depends on a procedure the runbook itself calls unqualified. There is no restore point older than a week.
- Where production backups go: an encrypted `pg_dump` snapshot, recovery state and an authenticated manifest, written daily at 10:17 UTC to `s3://jump-in-the-mix-backups-602326733999-us-west-2/production/` in us-west-2 (`infra/operations/render-backup.yaml:9,24-29`). The credential can write but not delete or overwrite (`docs/SCHEDULED_BACKUPS.md:5`).
- How long they are kept: "seven-day expiry" (`docs/SCHEDULED_BACKUPS.md:15`). Render point-in-time recovery is also "reported available" (`docs/PRODUCT_COMPLETION.md:5`); its window is NOT RUN.
- Who holds the keys: `BACKUP_ENCRYPTION_KEY` is in the cron's Render environment and "Escrow[ed] … in SSM SecureString" in AWS account 602326733999, as is the application `DATA_ENCRYPTION_KEY` (`SCHEDULED_BACKUPS.md:14`; `PRODUCT_COMPLETION.md:61`). The repo does not say who else can reach that account. Question for Kevin.
- Restores of real production backups:
  - A hosted backup was restored into an isolated database on 2026-09-09 (99 tables, 46 migrations; `PRODUCT_COMPLETION.md:61-62`) and on 2026-09-10 (99 tables, 48 migrations; `:31`).
  - Since then 23 migrations have landed (71 in `prisma/migrations`) and the schema now declares 114 models against the 99 tables verified then, including new tables for drafts, attempts, appointment bindings, workflows, Marketplace and Mega-Mix pipelines.
  - Release B took a backup before its migration (`docs/AUDIT_RELEASE_B_2026-09-25.md:84`) but restored nothing.
  - `docs/RESTORE_RECOVERY.md:39-46` lists as still open: "A rehearsed cutover, restored application-key access, backup storage/key retention and deletion procedures, and evidence on the intended hosted runtime".
- Failure visibility:
  - `scripts/backup-to-s3.mjs:29` blanks `OPS_ALERT_WEBHOOK_URL` for the inner run; `:37-39` only logs "Scheduled encrypted backup failed…".
  - The independent monitor that would notice a stale backup "has not been activated" (`docs/INDEPENDENT_MONITOR_DEPLOYMENT.md:3`, $7.25/month; not recommended here).
- Only CI rehearses the tooling: `.github/workflows/ci.yml:182-186` runs `npm run db:rehearse-restore` on synthetic data.
- Fix direction (costs nothing):
  - Before inviting, run `npm run db:qualify-backup` once on today's production S3 bundle into a loopback database (the procedure is in `SCHEDULED_BACKUPS.md:21`).
  - Write a one-page emergency path: Render point-in-time restore vs. S3 bundle plus `db:restore` plus `db:reopen-recovery-target`, with who does what.
  - Turn on Render's own failed-run notification for the cron job if the plan offers it, or add a weekly manual check of the S3 prefix.
  - Record who can reach the keys.
- Runtime check for the lead: `npm run db:rehearse-restore` locally, as planned (it proves the tooling on the 71-migration schema). Ask Kevin for the S3 listing of `production/` (newest three objects and their dates) and the Render cron run history. Read the backup retention sentence on https://jumpinthemix.com/privacy (it comes from the `PUBLIC_BACKUP_RETENTION_NOTICE` environment variable) and compare it with the 7-day expiry and the point-in-time recovery window.

### DATA-05 — Import silently stores wrong values: Outlook and Google address columns mis-mapped; accented names corrupted
- Severity: MEDIUM · Label: VERIFIED (header mapping and decoding computed with the repo's rules); the exact bytes of real exports are INFERRED · Prior: CON-F2 (fixed for phones and emails; addresses were never covered)
- What the user experiences:
  - Outlook: every address imports as `state = "United States of America"` plus the ZIP, with no street or city.
  - Google: the whole multi-line "Home" address lands in street 1, and the "Work" address lands in street 2 of the same address. A contact with a job title but no company gets the title as company.
  - A customer list saved from Excel's default "CSV (Comma delimited)" (Windows-1252) turns "José Peña" into "Jos� Pe�a".
  - An Android vCard 2.1 export turns it into "JosÃ© PeÃ±a". "Hi {{First Name}}" then goes to the customer with the mangled name.
  - Separately, a large iPhone `.vcf` export with photos is refused at 10 MB before the photos are dropped, and there is no in-app guidance on how to export from an iPhone. The device picker is Android-only.
- Reproduction: import each file and open "Preview mapped contacts" and the created contacts.
  1. Outlook headers: `First Name,Last Name,Mobile Phone,Business Street,Business City,Business State,Business Postal Code,Business Country/Region` with a row `Ana,Pena,(555) 201-0001,12 Main St,Springfield,IL,62701,United States of America`.
  2. Latin-1 file: `printf 'First Name,Last Name,Phone\nJos\xe9,Pe\xf1a,555-201-0004\n' > latin1.csv`.
  3. vCard 2.1:
     ```
     BEGIN:VCARD
     VERSION:2.1
     N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Pe=C3=B1a;Jos=C3=A9;;;
     TEL;CELL:555-201-0005
     END:VCARD
     ```
- Evidence:
  - `contact-import-mapping.ts:120` — `/address 1|street 1|…/` matches "Address 1 - City", "- Region", "- Postal Code", "- Country". `:121` — "Address 2 - …" → street2. `:123` — `/^state$|province|region/` matches "Business Country/Region". Outlook "Business Street", "Business City" and "Business State" match no rule. `:116` — "Organization Title" and "Organization Department" map to company. `:287-296` — the first non-empty value wins.
  - Computed mapping (repo regexes):
    ```
    "Address 1 - City" -> street1   "Address 2 - Formatted" -> street2
    "Business Street" -> ignore     "Business City" -> ignore
    "Business Country/Region" -> state
    ```
    `src/lib/contact-import-mapping.test.ts:110-122` uses `toMatchObject` and never asserts these columns.
  - Encoding: `ContactImportWizardV2.tsx:283` — `parseContactFile(await file.text(), …)`, which always decodes as UTF-8. `contact-file-parser.ts:28,39` strips only a UTF-8 BOM. `:84-86` decodes quoted-printable byte by byte (`String.fromCharCode(parseInt(hex,16))`).
  - Computed decoding:
    ```
    Latin-1 bytes decoded as UTF-8: "Jos�"
    QP "Jos=C3=A9 Garc=C3=ADa" -> "JosÃ© GarcÃ­a"
    ```
  - `contact-file-parser.ts:101` — the 10 MB check runs on the raw vCard, photos included.
  - `DeviceContactQuickAdd.tsx:176` — "Device contact selection isn’t available in this browser. Import a CSV or vCard file…" (no export steps).
- Fix direction:
  - Map `Address N - Street/City/Region/Postal Code/Country` and Outlook `Business|Home|Other Street/City/State/Postal Code/Country/Region` to structured fields per address group.
  - Decode files with a charset sniff (UTF-16 BOM, then UTF-8 validity, then windows-1252).
  - Decode quoted-printable to bytes, then `TextDecoder(charset)`.
  - Strip `PHOTO` lines before the size check.
  - Add a two-line "How to export from iPhone / Google / Outlook" note (Lane 2 owns the copy).
- Runtime check for the lead: the three files above.

### DATA-06 — Duplicate saved dates double every date-based follow-up
- Severity: MEDIUM · Label: VERIFIED (code) · Prior: none
- What the user experiences: the owner merges two "Bob" records that both had "Birthday · Feb 3". From then on Bob gets two identical birthday follow-ups every year. With automatic email on, he gets two birthday emails. The same happens when a birthday typed by hand (note empty) is later imported from a file (label "Birthday"), or when "Add date" is tapped twice on a slow phone.
- Reproduction:
  1. Create two contacts with the same phone in different formats. Add the same yearly Birthday date (a few days ahead) to each.
  2. Have an active date-triggered Birthday Mix.
  3. Merge them on `/contacts/duplicates`.
  4. The survivor's "Saved dates" lists the birthday twice, and Today shows two follow-ups on that day.
- Evidence:
  - `contact-merge-actions.ts:131` — "tx.jumpDate.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id } })", with no deduplication.
  - `jump-engine.ts:432-437` — each saved date is its own occurrence ("occurrenceKey: `jump-date:${jumpDate.id}:…`").
  - `contact-import-service.ts:347-363,627-630` — the import deduplication key includes the normalized label, so a manual date (label null) and an imported one (label "Birthday") are both kept.
  - `important-date-actions.ts:54-124` — no request id and no duplicate check. `ContactProfile.tsx:253` — the "Add date" form uses a plain submit button.
- Fix direction: dedupe saved dates by `(dateTypeId, month, day, recurrence, dateValue)`, ignoring the label, in merge, import and create. Add a request id to "Add date".
- Runtime check for the lead: the merge reproduction above.

### DATA-07 — A phone-only match defaults to merging a different person into an existing one; the form refuses shared household or office numbers
- Severity: MEDIUM · Label: VERIFIED (code) · Prior: none
- What the user experiences: a realtor has "John Smith, (555) 201-0006". Their import file has "Jane Smith, (555) 201-0006, jane@example.com, Birthday 1982-05-01" (same home phone). The review card says "Exact duplicate · John Smith · Exact phone", preselected "Merge without overwriting". After queueing, Jane never exists: John gains her email, and her birthday becomes his, so John gets Jane's birthday follow-up. Typing Jane in by hand with that number is refused: "That phone already belongs to John Smith. Use Find duplicates if these are the same person."
- Reproduction: create John as above, then import:
  ```
  First Name,Last Name,Phone,Email,Birthday
  Jane,Smith,(555) 201-0006,jane@example.com,1982-05-01
  ```
- Evidence:
  - `contact-import-service.ts:105-117` — any shared phone is an exact reason. `:170` — "if (exact.length === 1) return { … kind: "EXACT", … recommendedAction: "MERGE" }".
  - `:473-640` — `mergeImportedContact` keeps the existing display name and adds the incoming emails and saved dates.
  - `contact-actions.ts:240-250` and `:72-84` — any other contact (archived included) holding the number blocks the form.
- Fix direction: when names clearly differ, recommend "Skip" or "Create" and show both names side by side. Decide whether a number may be shared (owner question).
- Runtime check for the lead: the import above, then read John's profile.

### DATA-08 — The spreadsheet export drops Do-not-contact and private notes and cannot be re-imported; the "complete JSON backup" has no restore path
- Severity: MEDIUM · Label: VERIFIED (code + computed) · Prior: none (ACC-F10 and OPS-F8, export memory and throttling, are fixed)
- What the user experiences: an owner downloads the "Spreadsheet bundle" to mail-merge elsewhere. `contacts.csv` has no Do-not-contact flag, so a customer who asked not to be contacted can be texted from the new tool. Private notes are missing too. If they (or support) re-import `contacts.csv`, every person with a saved date fails, because "Saved Dates" is read as a date column. Addresses, tags, secondary phones and emails, and custom fields are dropped. Phones typed with "+" come back as "'+1…", which does not match their owner (so duplicates are created) and cannot be dialled. The Account page calls the JSON "a complete JSON backup", but nothing can import it.
- Reproduction: `/account?section=privacy` → "Spreadsheet bundle" from an account with a contact that has a saved date, a "+1 …" phone and Do-not-contact on. Open `contacts.csv`, then import it at `/contacts/import`.
- Evidence:
  - `src/lib/contact-export.ts:46-60` — the header lacks private notes, DNC, relationship and labels. `:28-35` — `neutralizeSpreadsheetFormula` prefixes "'" to values starting with "+".
  - `src/app/api/account/export/route.ts:50` — the README says the JSON has "relationship preferences".
  - `src/app/(app)/account/page.tsx:65` — "or a complete JSON backup". `docs/ACCOUNT_EXPORT_INVENTORY_2026-09-22.md:3` — "not a database backup or an import/restore format".
  - Computed:
    ```
    guessImportMappings(export headers):
      "All Phones"/"All Emails"/"Primary Address"/"Tags"/"Custom: …" -> ignore
      "Saved Dates" -> DATE
    parseImportDate("Birthday · 1980-02-29 · YEARLY") -> null
    libphonenumber: key("'+15551234567") = "15551234567"  (vs stored "+15551234567")
    ```
- Fix direction: add "Do not contact", "Private notes" and labels to `contacts.csv`. Make the importer strip one leading apostrophe and recognise its own export headers. Reword "complete JSON backup" as "complete JSON copy (for your records; it can't be imported)".
- Runtime check for the lead: the export-then-import round trip above.

### DATA-09 — Other creates have no idempotency key
- Severity: LOW · Label: VERIFIED (code); the double-submit effect is INFERRED · Prior: CON-F14 (fixed for contact create; these paths remain)
- What the user experiences: on a weak signal, "Schedule message" for selected contacts, a new calendar event, or "Finish setup" can be sent twice. The owner gets two one-time follow-ups per person, two appointments (each with its bound follow-ups), or two first contacts.
- Evidence:
  - `src/lib/bulk-contact-actions.ts:162` — "const batchId = randomUUID()" per request; `:220` — the key includes `batchId`. The button at `ContactsBulkWorkspace.tsx:241` is plain. These follow-ups sit on an ARCHIVED hidden Mix, so they are never auto-sent (`:208`).
  - `src/lib/calendar-actions.ts:20-24` — new entries have no request id.
  - `src/lib/onboarding-actions.ts:84-129` — `randomUUID()` contact id with no receipt.
- Fix direction: the same pattern as `ContactForm.tsx:86-90` (id minted on first submit and stored in `IdempotencyKey`).
- Runtime check for the lead: double-click "Schedule message" with network throttling, then count the rows on Today.

### DATA-10 — Time edge cases
- Severity: LOW · Label: VERIFIED (code, computed) · Prior: TOD-F15 (the DST "choose UTC" wording) is still open
- What the user experiences:
  - A Beat set for 21:00 goes out at 08:00 the same morning (13 hours early) when no Journey preferences exist.
  - After moving from New York to Los Angeles, date-based follow-ups stay at New York clock times (10:00 ET = 07:00 PT), because each saved date keeps the zone it was saved in.
  - Booking 1:30 AM on 2026-11-01 asks a plumber to "Choose UTC".
- Evidence:
  - `src/lib/personal-scheduling.ts:41-45` — "return inside ? end : minutes;" keeps the same date. Compare `snooze-schedule.ts:86-91`, which moves to the next day.
  - `important-date-actions.ts:63,143` — the time zone is stored per date; `jump-engine.ts:439` — "timezone: jumpDate.timezone || workspaceTimezone".
  - `calendar-time.ts:23` — the UTC instruction.
  - DST arithmetic computed with the repo's `zonedDateTimeToUtc`:
    ```
    2026-11-01 01:30 (ambiguous) -> 05:30Z = 01:30 EDT (first occurrence)
    2027-03-14 02:30 (nonexistent) -> 06:30Z = 01:30 EST (one hour earlier)
    2027-03-14 10:00 -> 14:00Z = 10:00 EDT; 2026-11-01 10:00 -> 15:00Z = 10:00 EST (correct)
    ```
- Fix direction: move to the next morning for overnight quiet hours. Re-anchor saved dates to the owner's zone when it changes (owner decision). Offer "first or second 1:30".
- Runtime check for the lead: none needed.

### DATA-11 — No way to permanently delete one person; import batches keep every uploaded row
- Severity: LOW/PARKED · Label: VERIFIED (code) · Prior: ACC-F1 (its "clear the payload after completion" suggestion was not done)
- What the user experiences: a customer asks the plumber to delete their details. The app only offers Archive, which keeps everything, and a bad import cannot be undone except by archiving in bulk. The full uploaded file stays inside the import batch for the life of the account.
- Evidence:
  - The repository has no `contact.delete`/`deleteMany` outside generated code (checked with `grep`).
  - `prisma/contact-import-batches.prisma` — `payload Json`. `src/lib/data-retention.ts` and `operational-retention.ts` have no rule for import batches.
  - `/privacy` says "Saved customer information stays with the account unless deleted".
- Fix direction: an owner-only "Delete permanently" for archived people (cascade). Clear `ContactImportBatch.payload` once a batch is terminal.
- Runtime check for the lead: none.

## What holds up

- **Outcome idempotency (prior TOD-F3 closed).**
  - One request id per logical attempt, kept across retries (`JumpWorkflow.tsx:115-128`, `outcomeRequestKey` `:99-101`).
  - The key is stored in the same transaction and replayed on a race (`outcome/route.ts:132-139, 203-209, 319-326, 331-337`).
  - A 409 carries the current status, so a retry after a lost response shows "Already marked done" (`JumpWorkflow.tsx:158`).
- **Contact create (CON-F14 closed) and edit (CON-F7 closed).**
  - Create: the request id is minted on the first submit and reused (`ContactForm.tsx:86-90`); receipt under the workspace lock (`contact-actions.ts:306-314,375-377`).
  - Edit: the fingerprint of every overwritten value is re-read under `FOR UPDATE` (`contact-actions.ts:407-409`, `contact-revision.ts:35-46`).
- **Other concurrent edits are guarded.**
  - Mix editor: `updatedAt` under a workspace lock (`mix-editor-actions.ts:255-262`; MIX-F4 closed).
  - Journey: revision (`mix-workflow.ts:39-43`).
  - Drafts: revision and conflict payload (`jump-drafts.ts:146-176`).
  - Relationship state: version (`contact-state-actions.ts:79-84`).
  - Note edits: compare-and-swap on `expectedSummary` (`activity/route.ts:218-219`).
  - The inline "Customer summary" form that had no guard is not rendered anywhere (`ContactInlineBasicsForm` has no importer).
- **Reconciliation does not overwrite owner actions.**
  - Updates are guarded on `(status, updatedAt)` (`jump-engine.ts:677-681`).
  - The stale pass never cancels rows created or touched after it started (`:736-737`; OPS-F3 closed).
  - Snoozes and drafts are carried to regenerated pending rows (`:275-292, 624-673`).
  - DATA-01 is the gap: completed rows are not considered.
- **Import plumbing.**
  - Per-row receipts `contact-import:<importId>:<rowId>` (`contact-import-service.ts:696-699`) and a unique `(workspaceId, importId)`, so a double "Queue" returns the same batch (`contact-import-jobs.ts:119-120`).
  - Lease-locked, resumable, cancellable, with committed rows reported on cancel (`:174-202`).
  - Body read with a hard 12 MB cap and 413 (`import/route.ts:118-131`).
  - CSV parser handles the UTF-8 BOM, CRLF, quoted newlines and commas, empty rows, and `,` `;` or tab delimiters (`contact-file-parser.ts:27-70`).
  - Apple vCard 3.0 (`item1.TEL;type=CELL`, `BDAY;VALUE=date`) parses (`:114-139`).
  - Google and Outlook phone and email headers map (verified by computation; CON-F2 closed for those).
- **Automatic delivery safety.**
  - Unique `jumpId` (`migrations/20260904190000…:29`); contact row lock with one PROCESSING per contact (`automatic-delivery.ts:187-190`).
  - Full re-check before the provider call (`:222-232`); an uncertain lease is never re-sent (`:100-108`).
  - The provider idempotency key is per jump (`:86`).
  - Bulk one-time follow-ups are never auto-sent: their Mix is ARCHIVED, and the candidates query requires `mix.status: ACTIVE` (`bulk-contact-actions.ts:208`, `automatic-delivery.ts:152`).
- **Worker jobs.**
  - Optimistic claim on `attempts` (`worker/index.ts:123-134`), 30-second lease renewal (`:217-230`).
  - A pause returns the attempt (`:203-210`).
  - Every task is idempotent or convergent: `generate-jumps` is a reconcile; import is per row; the phone sweep recomputes from display values; workflow commands are deduplicated by `requestId`.
- **Phone keys (CON-F3 and CON-F5 closed).** Computed with the production libphonenumber:
  ```
  "(555) 123-4567", "555-123-4567", "1-555-123-4567", "+1 555 123 4567", "555.123.4567" -> +15551234567
  "x12"/"ext. 12" -> +15551234567;ext=12
  "011 44 7911 123456" -> +447911123456
  "0412 345 678" (US) -> legacy 0412345678, not read as +1 041…
  "555-1234" -> legacy 5551234
  ```
  - The sweep is convergent and reversible for keys, because display values are never changed (`phone-canonicalization.ts:49-92`).
  - Only same-contact duplicate rows are merged (a label may be lost).
- **Time arithmetic.**
  - "N days overdue" uses calendar dates (`today-view.ts:13-17`; TOD-F12 closed).
  - Snooze presets use logical dates (`snooze-schedule.ts:128-165`).
  - Feb 29 and month-end recurrence clamp correctly (computed: "Feb29 yearly: 2026-02-28, 2027-02-28, 2028-02-29"; "31st monthly: … 2027-02-28, … 2027-04-30").
  - Keys use local time, so they are stable across DST.
- **Account deletion (the prior ACC-F1 P0 was correctly downgraded).**
  - Explicit deletes cover staff, support and MFA rows; workspace and user cascade through foreign keys; open Marketplace reports are anonymised; staff replies are kept.
  - 30-second transaction, and the audit is marked FAILED on rollback (`account-deletion.ts:36-127`).
  - A schema-guard test fails the build if a scoped table lacks a cascade (`tests/account-deletion-schema-guard.test.ts`).
  - What remains is pseudonymous or time-boxed: the `AccountDeletionAudit` hash, email-ledger hashes and platform audit (≤400 days), S3 backups (7 days) and provider logs. This matches the `/privacy` retention section, apart from the backup sentence, which comes from an environment variable (NOT RUN).
- **JSON export completeness.**
  - Compared with all 114 models: every workspace- or user-scoped owner table is in the document, including drafts, attempts (decrypted recipient), automatic deliveries, workflow instances, journey, Marketplace, import batches, reviews and reminder devices.
  - Deliberately excluded: `AuditLog`, `AdminImpersonation`, `IdempotencyKey`, `Job`, `Session`, `CalendarPreference`, email transport ledgers. The `Workspace.name` row is absent (trivial).
  - Streamed, paged, rate-limited, and refused during support views (`account-export-stream.ts:228-327`, `route.ts:14-23`).
- **Backup and restore tooling.**
  - Snapshot-consistent dump plus authenticated manifest (`backup-database.mjs:92-128`).
  - Write-once S3 credential; restore refuses the source database, verifies checksum, table digests and foreign keys, and holds the target (`restore-database.mjs:38-140`).
  - CI runs the rehearsal (`ci.yml:182-186`).

## Test coverage for this lane

| Flow | Tests |
|---|---|
| Outcome idempotency and retry | `tests/jump-outcome-idempotency.test.ts`; e2e `outcome-retry.spec.ts`, `jump-outcome-timeline.spec.ts` |
| Contact create receipt and stale edit | `src/lib/contact-actions.test.ts`, `tests/contact-save-integrity.integration.test.ts`, `tests/contact-update-integrity.test.ts`; e2e `save-recovery.spec.ts` |
| Mix stale save and Journey revision | `tests/mix-stale-save.integration.test.ts`, `tests/mix-workflow-rule-save.integration.test.ts` |
| Reconciliation races, snoozes, drafts | `tests/reconciliation-fresh-rows.test.ts`, `snooze-reconciliation*.test.ts`, `draft-continuity.test.ts`, `draft-merge.test.ts` |
| Import | `tests/contact-import*.ts` (7 files), `import-lock.integration.test.ts`, `src/lib/contact-import-mapping.test.ts`; e2e `contact-search-import-jobs.spec.ts` |
| Merge, archive, restore | `tests/contact-lifecycle-actions.integration.test.ts`, `contact-bulk-undo.integration.test.ts`, `phone-canonicalization.integration.test.ts` |
| Phones | `tests/phone-number.test.ts`, `phone-canonicalization.integration.test.ts`, `src/lib/phone-dial.test.ts`; e2e `phone-region.spec.ts` |
| Automatic delivery | `tests/automatic-delivery*.test.ts`, `delivery-hold.test.ts`, `src/lib/automatic-delivery-window.test.ts` |
| Time | `tests/jump-schedule.test.ts`, `src/lib/today-view.test.ts`, `src/lib/snooze-schedule.test.ts`, `tests/journey-scheduling.integration.test.ts` |
| Export and deletion | `tests/account-export-stream.integration.test.ts`, `account-export-limits.test.ts`, `src/lib/contact-export.test.ts`, `tests/account-deletion*.ts` (4 files) |
| Backup and restore | `tests/backup-*.mjs`, `s3-backup-store.test.mjs`, `recovery-*.mjs`; CI `db:rehearse-restore` |

**Critical flows with no test:**
- A completed or skipped Beat must not come back after a time zone, scheduling, Journey-preference or Mix-timing change (DATA-01). The only related test asserts the opposite.
- Re-starting a finished manual Mix (DATA-02).
- A merge where both records have the same saved date (DATA-06).
- Import of "0/0/00", day-first and "TBD" dates; Outlook and Google address columns; non-UTF-8 CSV; vCard 2.1 quoted-printable (DATA-03, DATA-05).
- The export → import round trip (DATA-08).
- A restore of a current-schema production backup (DATA-04).

## NOT RUN

- Browser reproduction of every finding: the lead's runtime lane. Every "What the user experiences" above is INFERRED until then.
- Real export files from classic Outlook ("0/0/00"), Google, an iPhone (photo size) and Android vCard 2.1. This needs real accounts and devices.
- Production:
  - the S3 `production/` listing (backup freshness and ages)
  - the Render cron run history
  - the Render point-in-time recovery window
  - the text of `PUBLIC_BACKUP_RETENTION_NOTICE` on `/privacy`
  - whether any account has automatic email on (the DATA-01 re-send exposure)
  - whether CI ran for `4b5abd8`

  These need production or AWS access, which is not mine.
- vitest, Playwright and `db:rehearse-restore` (not allowed for reviewers; the lead runs them).

## Questions for Kevin

1. DATA-01: should a completed or skipped Beat ever come back when a time setting or a Mix's timing changes? (Recommended: never; only pending ones move.)
2. DATA-02: when "Start mix" is used on someone who already finished that Mix, should it start over from today? If a run is still in progress, resume it or refuse?
3. May two people share one phone number or email (household landline, office main line)? This decides the form refusal and the import's default MERGE.
4. Import: when one date, email or phone in a row can't be read, drop just that value with a warning, or fail the row (CON-F13)?
5. Backups: who besides you can reach AWS account 602326733999 (SSM keys) and the Render account? Is the 7-day expiry intended, given a corruption bug may be noticed later? Will you run `db:qualify-backup` on today's backup before invites?
6. Export: should `contacts.csv` include Do-not-contact and private notes? Should "complete JSON backup" be reworded, since there is no import?
7. Should owners be able to permanently delete a single person on a customer's request?
