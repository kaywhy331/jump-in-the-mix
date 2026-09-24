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
| Mega-mix installations, named Mega-Mixes and their Mixes, favorites, imported template provenance, initial marketing situation | `megaMixInstallations`, `megaMixPipelines`, `mixFavorites`, `sharedMixImports`, `marketingPreference` |
| Calendar entries/connections, appointment bindings, intake setup and receipts, contact import batches | `calendar`, `appointmentBindings`, `leadIntake`, `imports` |
| Review responses and owner-created access invitations | `reviewRequests`, `accessInvitations` |
| The requesting user's support conversations and visible replies | `supportTickets` |
| Reminder receipts and device metadata without delivery credentials | `reminderDeliveries`, `reminderDevices` |

Security exclusions are explicit in the JSON: password hashes, sessions, provider credentials/webhooks, private calendar subscription URLs and keys, push endpoints/authentication keys, and invitation tokens. CalendarPreference contains only subscription credentials, so it is intentionally excluded. Auth identity metadata is included without OAuth state or credentials. Review and invitation links' secret tokens are excluded while owner-visible status remains available.

Platform staff administration, platform analytics, shared system-catalog source, and internal jobs/transport/audit queues are operational records rather than the account's editable data; they are listed separately as operational exclusions. The owner's installed/customized content and recorded customer history are included. This inventory makes no claim about legal data-access completeness or measured migration outcomes.

Verification uses stored fixture values, including DNC, channel, priority, relationship status, next commitment, and a Mix stop attributed to its person and Mix. The integration suite exercises the authenticated JSON route and its security-exclusion declaration.
