# Implementation Status

This document distinguishes the runnable independent application from the complete product described in the approved Master PRD. A documentation claim is not completion: a capability is complete only when its acceptance criteria pass automated tests and production-like staging.

## Implemented foundation

- Dockerized Next.js application, PostgreSQL, Prisma, and background worker.
- Registration, password login, opaque hashed sessions, and workspace ownership.
- Public landing page and local guided demo.
- Contacts, Jump Dates, reusable Jumps, Mixes, and the Jump action queue.
- Background Jump generation and reconciliation.
- Native SMS, email, phone, voicemail-script, and WhatsApp compose actions.
- Server-side plan limits and downgrade-safe inactive records.

## PRD core-foundation change set

### Scheduling and action queue

- Canonical Jump, Jumps, Mix, Jump Date, and Jump Date Type decisions.
- Corrected Free/Plus/Pro limits for Contacts, Groups, custom Jump Date Types, active Mixes, sharing, Google Contacts, AI, and voicemail.
- Timezone-aware logical-date scheduling and deterministic Jump keys.
- Lifecycle reconciliation that creates missing work, updates mutable work, restores resumed occurrences, and cancels obsolete pending work.
- Automatic reconciliation after Contact, Jump Date, Mix, audience, lifecycle, personalization, import, provider-sync, template-import, and AI-draft publication changes.
- Explicit Mix pause/archive and Contact-specific Stop/Resume behavior while preserving completed history.
- Fixed-date broadcasts with a logical date, local time, IANA timezone, and explicit audience.
- Jump page defaults to overdue plus today, orders Pending above Completed, and supports Done, Undo, Skip, direct actions, date/status/channel filters, and durable action events.

### Contacts, Groups, and custom fields

- Structured Contact creation and editing.
- Multiple labeled emails, phones, and structured addresses with one explicit primary value for each.
- Workspace-scoped normalization, validation, and exact-duplicate prevention.
- Public Notes and Phone-Call-only Private Notes.
- Contact Group creation, deletion, filtering, display, individual editing, and bulk assignment/removal.
- Mobile-first multi-select, Select All/Deselect All, Apply Jump, selected CSV export, and bulk archive.
- Workspace-owned custom-field definitions, values, search, stable placeholders, and export.
- Contact and personalization changes reconcile future pending Jumps automatically.

### Contact import and acquisition

- Local-first CSV and VCF parsing with a 10 MB and 5,000-row boundary.
- Upload → Map → Dedupe → Review → Import → Summary workflow.
- Native CSV support for quoted values, embedded newlines, comma/tab/semicolon exports, repeated methods, and mobile file selection.
- vCard 3.0/4.0 support for names, organizations, labeled emails, phones, addresses, notes, birthdays, and anniversaries.
- Automatic mapping for core Contact fields, repeated methods, structured addresses, Public Notes, workspace custom fields, Birthdays, Anniversaries, and unfamiliar date columns.
- One-time, monthly, and yearly Jump Date mapping without converting logical dates through the browser timezone.
- Existing global or workspace Jump Date Type reuse by normalized name; unfamiliar types become workspace-owned custom types.
- Custom Jump Date Types beyond a downgraded plan allowance remain preserved but inactive.
- Exact email matching, then exact normalized-phone matching, followed by conservative fuzzy name/company review with supporting contact-method overlap.
- Explicit Create, non-destructive Merge, Prefer Imported, and Skip decisions.
- Server-side workspace, plan, Group, custom-field, calendar, contact-method, and primary-value validation.
- Authenticated, rate-limited, idempotent browser batches with per-row isolation, audit records, automatic Jump reconciliation, progress, error CSV, and retries.
- Progressive Device Contact Picker on supported secure-context browsers with one-or-many selection and no photo access.
- Stable Quick Add fallback to the compact manual Contact form on unsupported browsers.
- Device-selected records reuse workspace-scoped exact/fuzzy matching, Contact-capacity preflight, row idempotency, audit, and reconciliation.
- Ambiguous and fuzzy device matches remain unchanged for review rather than being silently merged.
- Optional browser voice dictation appends a local transcript to Public Notes on the create form; Private Notes never expose the control.

### Google Contacts

- Plus/Pro one-way Google-to-Jump-in-the-Mix connection managed from My Account.
- Exact configured redirect URI, short-lived one-time OAuth state stored only as a SHA-256 hash, read-only Contacts scope, and offline access.
- OAuth access and refresh tokens encrypted with AES-256-GCM before database storage.
- Automatic access-token refresh, revoked-credential handling, reconnect, remote revocation, and local credential removal.
- Google label/group discovery with All Contacts or selected-label import configuration.
- Review preview with new, linked/exact, ambiguous/fuzzy, and remotely deleted classifications.
- Exact normalized email/phone auto-merge option; fuzzy and ambiguous matches are held for review.
- Contact plan-capacity validation before a sync is queued.
- Structured names, company, labeled emails, phones, addresses, Public Notes, Birthdays, and Anniversaries; Private Notes are never imported.
- External provider links preserve identity across incremental updates; Google deletion never deletes the local Contact.
- Full initial sync, stored incremental cursor, expired-cursor recovery, and scheduled refresh through the worker.
- User-visible sync progress, history, counts, errors, next refresh, reconnect/disconnect, and sanitized admin diagnostics.

### Platform and Community Mix Templates

- Separate Jump in the Mix and Community libraries with search, Category/Industry filters, and Featured, Trending, Most Imported, and Newest ordering.
- Human-readable previews of channel, timing, Target Jump Date Type, subjects, messages, and scripts instead of raw JSON.
- Compatibility normalization for canonical and legacy `steps`, `jumps`, `sequence`, and nested `content` payloads.
- Strict validation of channels, required content, offsets, approved placeholders, and Phone-Call-only Private Notes.
- Atomic independent Draft imports with new reusable Jumps, immutable first versions, ordered Mix rows, versioned import records, audits, and counts.
- Explicit repeated-import confirmation.
- Community Public Profiles with display name, title, bio, HTTPS avatar, and HTTPS website while private account/workspace data stays hidden.
- Free/Plus/Pro Community sharing limits of 0/3/10.
- Versioned submissions, contributor unpublishing, one-vote-per-workspace toggling, self-vote rejection, and trending scoring.
- Platform-admin moderation with search, source/status filters, previews, contributor context, approve/flag/reject/unpublish, notes, featured placement, and official-template authoring.
- Administrator-controlled Community availability blocks discovery, voting, imports, and new submissions while preserving all existing content and independent imports.

### AI Mix Wizard

- Plus/Pro four-part preflight covering objective/framework, trigger/audience, timing/intensity, and channels/My Info context.
- Custom objective, strategic approach, market context, My Product placeholder, Contact Group labels, broadcast scheduling, preferred local time, and quiet-hour context.
- Built-in deterministic strategist without a provider key and optional provider-backed strict structured output.
- Provider requests use `store: false` and never query or transmit Contact rows, contact methods, addresses, Group memberships, Jump history, or Private Notes.
- Generated, refined, and manually edited drafts are revalidated for channels, content, timing, approved placeholders, and Phone-Call-only Private Notes.
- Personal SMS copy rejects automated-marketing opt-out language.
- Workspace-scoped, resumable review drafts expire after 48 hours and cannot publish more than once.
- Atomic publication creates a normal editable Draft Mix, reusable Jumps, immutable versions, ordered rows, audience assignments, optional broadcast schedule, audit records, and reconciliation.
- Objectives, reviewed tones, and strategic-framework labels load from validated platform settings.
- An administrator may disable new external-provider generation; the built-in strategist remains available and existing review drafts remain intact.

### Stripe billing and plan lifecycle

- Server-side Plus and Pro catalog with monthly and annual Price-ID allowlists; arbitrary browser Price IDs are rejected.
- Stripe-hosted Checkout and short-lived Customer Portal sessions.
- One Stripe Customer per workspace with workspace/user metadata copied to Checkout and Subscription objects.
- Authenticated, owner/admin-only, database-rate-limited Checkout and portal routes; view-only support sessions cannot mutate billing.
- Public raw-body Stripe webhook with HMAC timestamp/signature verification.
- Event-ID idempotency with Processing, Processed, and Failed diagnostics.
- Reconciliation for Checkout completion, Subscription create/update/delete/pause/resume, invoice paid, and invoice payment-failed events.
- Strict entitlement mapping from approved recurring Price IDs.
- Stripe period dates, status, cancellation state, Customer ID, and Subscription ID mirrored into workspace and Subscription records.
- Past-due workspaces keep paid access during recovery; fully paused/canceled/unpaid/incomplete subscriptions return to Free.
- Downgrade safeguards preserve records while pausing excess active Mixes, canceling their future incomplete Jumps, deactivating excess custom Jump Date Types, and unpublishing excess Community contributions.
- My Account billing summary, usage guidance, annual-first plan selection, billing return state, verification/cancel pages, and admin Billing diagnostics.

### Referral rewards

- One unique, workspace-scoped invitation code with a short `/r/<code>` route and a 30-day HTTP-only attribution cookie.
- Server-side invitation resolution; public registration never accepts a trusted referrer workspace ID.
- A qualified friend and the referrer each receive 30 days of Plus.
- Mandatory email verification delays qualification until the friend verifies the account.
- One referred workspace may be attributed once, and each referral has one Referrer and one Referred reward record.
- Referrer earnings are capped at 360 days from durable reward history.
- Paid Plus and Pro remain controlled by Stripe while referral days are banked separately.
- Unused active referral time is banked during a paid upgrade and resumes after paid access ends.
- Referral expiration returns the workspace to Free through the existing downgrade-preservation safeguards.
- Worker, authenticated-request, Checkout-verification, and Stripe-webhook reconciliation keep entitlement state current.
- Mobile and desktop share controls use the Web Share API with a clipboard fallback and friendly invitation copy.
- My Account shows the invite, qualified/pending history, active and banked days, expiration, and cap progress.
- View-only support access can inspect existing history without creating or exposing an invitation code.
- Admin · Referrals provides search, status filtering, qualification counts, active referral Plus, banked days, reward state, and cap visibility.
- Dedicated Prisma migration plus static, boundary, migration-rehearsal, and PostgreSQL lifecycle coverage.

### Jump Date Types, reusable Jumps, and Mix builder

- Tenant-owned custom Jump Date Types without per-user duplication of global system records.
- Create, search, rename, safe delete, activate, deactivate, and downgrade-safe active selection.
- Searchable reusable SMS, email, phone-call, voicemail-script, and WhatsApp Jumps.
- Channel validation, Pro voicemail enforcement, Contact/My Info/custom placeholders, and Phone-Call-only Private Notes.
- Immutable content versions; active Mix associations move forward while completed snapshots remain unchanged.
- Transactional Mix creation/editing with Draft, Active, Paused, Target Jump Date Type, manual-start, fixed broadcast, Contact Group/all-active-Contact audiences, ordered Jumps, offsets, times, and metadata.
- Removed sequence rows with history remain internally inactive; unused rows are deleted.
- Contact-specific Mix Stop and Resume preserve assignments and completed history.
- New and existing Mix editors consume validated administrator-managed Category and Industry lists.

### Tenancy, authentication, and request security

- Central workspace-scoped repositories and PostgreSQL cross-workspace isolation tests for core records and mutations.
- Tenant identity derives from authenticated context rather than browser-supplied workspace fields.
- Database-backed throttling for authentication, recovery, password changes, Jump events, imports, Quick Add, Google integration, AI, billing, and support.
- Generic login errors, unknown-account bcrypt comparison, minimum 12-character passwords, optional verification, and password recovery.
- Branded HTML/text transactional email through Resend with development previews.
- Central Origin and Fetch Metadata mutation boundary, constrained Server Action origins, security headers, and request-size limits.
- Hashed opaque sessions with device/IP/last-seen/expiration metadata, caps, remote revocation, and sign-out-everywhere.
- My Account identity, plan state, billing, usage, Google Contacts, referrals, Help/tickets, password, and active-device controls.

### Help, FAQ, and support tickets

- Help is a primary navigation destination.
- FAQ appears above the support form, searches instantly, filters by topic, and keeps answers collapsed until opened.
- FAQ covers Contacts, Jumps, Mixes, Jump Dates, Templates, AI, billing, imports/sync, privacy/security, and troubleshooting.
- Workspace- and requester-scoped support tickets with category, priority, status, durable threaded messages, and server timestamps.
- Users can submit, view, reply, and reopen resolved tickets from Help and My Account.
- Platform-admin queue with search, status/category/priority filters, requester/workspace/plan/usage context, prepared responses, resolve/reopen/close controls, and failed-email diagnostics.
- Administrator messages are labeled **Jump in the Mix Response**.
- Administrator responses commit before email delivery; failures remain visible and retryable without losing the thread.
- Branded HTML/text email includes the ticket title, formatted response, direct ticket route, and support footer.
- User and administrator ticket actions are audited; view-only support sessions cannot mutate tickets.
- Dedicated Prisma support migration plus unit, static-boundary, email, migration, and PostgreSQL lifecycle/isolation coverage.

### Production migration and restoration foundation

- Complete Prisma migration history instead of relying exclusively on `db push`.
- Generated, drift-checked legacy baseline plus guarded forward migrations.
- Supported clean-database deployment and existing populated-MVP upgrade paths.
- Automated populated migration, data-preservation, reverse-SQL, forward-reapplication, and clean-deployment rehearsals.
- Production runbooks for backup, restore, row-count checks, worker pause/restart, smoke testing, and backup-based rollback.
- Dedicated forward migrations for the PRD core, Mix Template library, Help/support center, referral rewards, and administrator control plane.
- Independent clean-schema rehearsal verifies the control-plane migration record, `PlatformSetting` table, and durable JSON setting write.

### Audited view-only administrator support

- Protected Admin Users search with workspace, plan, verification, and usage context.
- Time-limited support views require a valid target membership and documented support reason.
- Random support token stored only as a SHA-256 hash.
- Real administrator remains the audit actor while the read context switches to the selected workspace.
- Persistent view-only banner; every browser mutation is rejected except ending the session.
- Target password/device/billing/ticket/referral-sharing controls remain hidden; start/end events are audited.

### Administration and observability control plane

- Operational overview for users, workspaces, plan distribution, active Contacts and Mixes, incomplete/completed Jumps, support queue, moderation queue, and provider/job issues.
- Shared mobile-friendly administrator navigation across users, billing, support, Mix Templates, integrations, referrals, operations, audit, and system settings.
- Background-job filtering with a server-validated retry action limited to failed jobs.
- Recent synchronization results, sanitized integration failures, and webhook processing diagnostics without provider credentials.
- Read-only audit explorer with actor, source, workspace, user, action, and entity filters plus collapsed structured event data.
- Allowlisted `PlatformSetting` model and no-code UI for reviewed dropdown options and feature flags.
- Unknown setting keys, empty lists, duplicate values, unsupported classification values, and invalid flags are rejected server-side.
- Mix and AI authoring consume managed settings with reviewed defaults when no override exists.
- Platform-setting changes and recoverable job retries create administrator audit records when a workspace context exists.
- Dedicated migration, clean-schema rehearsal, unit validation, static authorization tests, and PostgreSQL persistence coverage.

## Remaining P0 work

- Restore a real encrypted backup in production-like staging and complete the documented application/worker smoke matrix.
- Add full browser-driven end-to-end tests for authenticated routes, native Quick Add, imports, Google, Templates, AI Wizard, billing, referrals, Help/tickets, administration, and mutation rejection.
- Require MFA for platform administrators before support views are enabled operationally.
- Validate production transactional-email delivery and inbox placement before mandatory verification and support-email reliance.
- Complete a real Stripe test-mode Checkout, Customer Portal, plan-change, failed-payment, cancellation, duplicate-webhook, pause/resume, downgrade, and referral-bank handoff smoke matrix.
- Complete the final security, accessibility, and operational launch review.

## Remaining P1 work

- User-guided selection for which over-limit Contact Groups remain active after a downgrade; Groups are currently preserved and new creation is blocked until within the plan limit.
- Encrypted backup automation, alert delivery, load testing, and full production-like staging validation.
- Optional background/resumable import jobs for very large files; the current bounded browser workflow requires the page to remain open while batches finish.
