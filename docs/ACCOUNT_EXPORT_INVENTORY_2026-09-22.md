# Account export inventory — September 22, 2026

The JSON download is an owner-data export, not a database backup or an import/restore format. CSV is a smaller spreadsheet bundle. The forensic audit exposed omitted contact relationship preferences and explicit Mix stops; the implementation also reviewed all 107 Prisma models for owner-facing records.

| Owner data | JSON location |
| --- | --- |
| Account profile, display/scheduling, owner reminders and customer sending preferences | Account/workspace and preference fields |
| Contacts, primary methods, addresses, notes, dates, custom values, DNC, preferred channel, priority, relationship status and existing next-commitment date | `contacts`, including `relationshipState` |
| Empty custom-field definitions, tags, group activity, saved contact views, merge history | `customFieldDefinitions`, `groups`, `contactGroupStates`, `savedContactViews`, `contactMergeRecords` |
| Templates, all saved versions and channel variants, Mix steps/assignments, broadcast timing, person-specific stops | `templates`, `mixes`, `broadcastSchedules`, `mixStops` |
| Due/completed/canceled follow-ups, drafts, attempts with the owner's own decrypted recipient, handoff gestures, delivery receipts | `jumps`, `followUpDrafts`, `followUpAttempts`, `handoffEvents`, `automatedDeliveries` |
| Stage metadata, actual Mix/Beat connections and saved runs, early updates/corrections/Undo history, dated callback commitments | `journey`, `mixWorkflow` |
| Mega-mix installations, named Mega-Mixes and their Mixes, Marketplace public name, shares, favorites, added copies and reports (reports received omit the reporter), favorites, imported template provenance, initial marketing situation | `megaMixInstallations`, `megaMixPipelines`, `marketplace`, `mixFavorites`, `sharedMixImports`, `marketingPreference` |
| Calendar entries/connections, appointment bindings, intake setup and receipts, contact import batches | `calendar`, `appointmentBindings`, `leadIntake`, `imports` |
| Review responses and owner-created access invitations | `reviewRequests`, `accessInvitations` |
| The requesting user's support conversations and visible replies | `supportTickets` |
| Reminder receipts and device metadata without delivery credentials | `reminderDeliveries`, `reminderDevices` |

Security exclusions are explicit in the JSON: password hashes, sessions, provider credentials/webhooks, private calendar subscription URLs and keys, push endpoints/authentication keys, and invitation tokens. CalendarPreference contains only subscription credentials, so it is intentionally excluded. Auth identity metadata is included without OAuth state or credentials. Review and invitation links' secret tokens are excluded while owner-visible status remains available.

Platform staff administration, platform analytics, shared system-catalog source, and internal jobs/transport/audit queues are operational records rather than the account's editable data; they are listed separately as operational exclusions. The owner's installed/customized content and recorded customer history are included. This inventory makes no claim about legal data-access completeness or measured migration outcomes.

Verification uses stored fixture values, including DNC, channel, priority, relationship status, next commitment, and a Mix stop attributed to its person and Mix. The integration suite exercises the authenticated JSON route and its security-exclusion declaration.

## How the JSON is produced (Release C-1, September 25, 2026)

The JSON download is written while it is read ([`src/lib/account-export-stream.ts`](../src/lib/account-export-stream.ts)). Sign-in, the refusal during a support view and the limit of six exports an hour run first, unchanged.

- **Same document.** Sections appear in the same order with the same content. The one visible change: `mixWorkflow.definitions` now follows `mixWorkflow.instances`, because the distinct definitions are collected while the saved runs are written. Their ids (the first 16 hexadecimal characters of the SHA-256 of the definition) and content are unchanged.
- **Read page by page.** Each list is read in pages of 500 rows. Sections whose rows carry whole documents read fewer: follow-ups 200, intake receipts 200, templates and their versions 100, saved runs 100, merge records 100, import batches 10. Each page keeps the section's existing sort column and adds a unique tie-break (usually `id`), and the next page starts after the last row written. Lists that grow without bound are read the same way for each parent row: group memberships, Mix assignments, template versions, Journey stage rules, support messages and push reminder receipts. A contact's own details (emails, phones, addresses, dates, custom values, groups) are read with its page, in creation order. Sections that had no stated order now use creation time and then id; Journey placements are ordered by person, and lead-intake identities by connection and external id. The server holds one page, up to 64 KB of text waiting for the network, and the distinct workflow definitions.
- **Not a snapshot.** Each page is a separate read. No transaction spans the download, so a slow download does not hold a database connection. The parallel reads this replaced were not a snapshot either. During a download:
  - a record that changes can appear with its old or its new values;
  - a record added during the download appears only in sections that have not been written yet;
  - a draft saved during the download can appear twice or be missed, because drafts are ordered by their last save.

  `exportedAt` records when the export started.
- **Failures.** If a read fails after the download has started, the transfer is aborted rather than completed, so the browser reports a failed download instead of saving a truncated file. A failure on the first read still answers with an error status. A cancelled download stops reading.
- **Spreadsheet bundle.** The CSV bundle is still built in memory, from three reads (contacts, timeline and follow-ups). Streaming it was out of scope for Release C-1.

[`tests/account-export-stream.integration.test.ts`](../tests/account-export-stream.integration.test.ts) compares the streamed document with Release B's in-memory export on a fixture that fills every section, with ties on every sort column. It runs once with default pages and once with two-row pages. It also checks page limits, a failure in the middle of a download, a failure on the first read, and cancellation.
