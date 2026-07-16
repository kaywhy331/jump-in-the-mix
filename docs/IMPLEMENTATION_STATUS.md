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
- Automatic reconciliation after Contact, Jump Date, Mix, audience, lifecycle, personalization, import, provider-sync, and template-import changes.
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
- Exact email matching, then exact normalized-phone matching, followed by conservative fuzzy name/company review with a supporting partial contact-method overlap.
- Explicit Create, non-destructive Merge, Prefer Imported, and Skip decisions; ambiguous exact matches cannot create another duplicate through the review UI.
- Merge unions methods, addresses, Groups, Jump Dates, and custom values while retaining Public Notes with import provenance and preserving existing primary choices unless the user selects Prefer Imported.
- Server-side workspace, plan, Group, custom-field, calendar, contact-method, and primary-value validation.
- Authenticated and rate-limited import API; administrator support sessions remain view-only.
- Idempotent 25-row browser batches with per-row isolation, audit records, automatic Jump reconciliation, progress, downloadable error CSV, and retryable server failures.
- Unit, route-boundary, and PostgreSQL integration coverage for parsing, matching, plan handling, workspace isolation, merge preservation, inactive-type creation, and retries.

### Google Contacts

- Plus/Pro one-way Google-to-Jump-in-the-Mix connection managed from My Account.
- Exact configured redirect URI, short-lived one-time OAuth state stored only as a SHA-256 hash, read-only Contacts scope, and explicit offline access.
- OAuth access and refresh tokens encrypted with AES-256-GCM before database storage; tokens are never returned by the account status API.
- Automatic access-token refresh, revoked-credential handling, reconnect flow, remote revocation, and local credential removal.
- Google label/group discovery with All Contacts or selected-label import configuration.
- Review preview with new, linked/exact, ambiguous/fuzzy, and remotely deleted classifications.
- Exact normalized email/phone auto-merge option; fuzzy and ambiguous matches are held safely for review rather than merged silently.
- Contact plan-capacity validation before a sync is queued.
- Structured names, company, labeled emails, phones, addresses, Public Notes, Birthdays, and Anniversaries; Private Notes are never imported.
- Existing primary email, phone, and address remain selected during merges.
- External provider links preserve identity across incremental updates; a Google deletion retires the link but never deletes the local Contact.
- Full initial sync, stored incremental sync cursor, expired-cursor recovery through a new full sync, and scheduled daily refresh through the background worker.
- Provider changes queue automatic Jump reconciliation after successful Contact creates or updates.
- User-visible sync progress, recent run history, counts, errors, next scheduled refresh, and reconnect/disconnect state.
- Workspace-scoped audit records, authenticated provider routes, rate limits, support-view mutation blocking, scheduled-run idempotency, and encrypted-secret tests.
- Unit, static-boundary, and PostgreSQL integration coverage for credential encryption, Person normalization, group selection, cursor handling, Contact creation/update, provider links, remote deletion preservation, and duplicate prevention.

### Platform and Community Mix Templates

- Separate Jump in the Mix and Community libraries with full-text search, Category and Industry filters, and Featured, Trending, Most Imported, and Newest ordering.
- Human-readable previews of channel, timing, Target Jump Date Type, subjects, messages, and call/voicemail scripts instead of raw JSON.
- Compatibility normalization for canonical and legacy `steps`, `jumps`, `sequence`, and nested `content` payload shapes.
- Strict validation of channels, required content, day offsets, approved placeholders, and Phone-Call-only Private Notes before import or moderation.
- Atomic import into an independent Draft Mix with new reusable Jump templates, immutable first versions, ordered Mix rows, versioned import record, audit record, and import count.
- Explicit repeated-import confirmation; each import remains an independent Draft and cannot inherit a contributor's audience or activation state.
- Date-triggered imports reuse an existing system/workspace Jump Date Type or create a custom type only within the importing plan's active allowance.
- Community Public Profiles with display name, title, short bio, HTTPS avatar, and HTTPS website; private account and workspace data are not exposed.
- Free/Plus/Pro Community sharing limits of 0/3/10 pending, approved, or flagged Mixes.
- Versioned submission and resubmission, contributor-controlled unpublishing, one-vote-per-workspace toggling, self-vote rejection, and trending scoring.
- Platform-admin moderation queue with search, source/status filters, human previews, contributor context, approve/flag/reject/unpublish states, moderation notes, and featured placement.
- Platform templates created from tested administrator-workspace Mixes and edited through structured Jump fields rather than raw JSON.
- Companion metadata tables preserve compatibility with existing seeded Shared Mix records while adding review state, versions, votes, contributor profiles, and import-version history.
- Official seed templates include complete, validated Jump content for lead follow-up, referrals, client onboarding, and renewals.
- Unit, static-boundary, and PostgreSQL integration coverage for normalization, privacy boundaries, plan limits, atomic Draft imports, date-type creation, versioning, voting, repeated imports, and cross-workspace source rejection.

### Jump Date Types

- Tenant-owned custom Jump Date Types without per-user duplication of global system records.
- Create, search, rename, safe delete, activate, deactivate, and downgrade-safe active selection.
- Custom types appear before global types in Contact and Mix flows.

### Reusable Jumps

- Searchable reusable SMS, email, phone-call, voicemail-script, and WhatsApp Jumps.
- Channel-specific validation, Pro enforcement for Ringless Voicemail content, and click-to-insert Contact/My Info/custom placeholders.
- Phone-call-only Private Notes placeholders.
- Immutable content versions; active Mix associations move forward while completed Jump snapshots remain unchanged.
- Mix association display, links to associated Mixes, and archive protection while actively used.

### Mix builder and Contact-specific stops

- Manual Mix creation and transactional editing.
- Draft, Active, and Paused states with active-plan-limit enforcement.
- Target Jump Date Type, manual-start, and fixed-date broadcast modes.
- Contact Group and all-active-Contacts audiences.
- Ordered Jump #1, Jump #2, and later sequence editing with add/remove/replace/reorder, offsets, and optional local times.
- Category, industry, framework, and description metadata.
- Removed sequence rows with history remain internally inactive; unused rows are deleted.
- Future pending Jumps reconcile after every save without rewriting completed history.
- Contact-specific Mix Stop and Resume preserve the assignment and completed history.

### Tenancy and authorization validation

- Central workspace-scoped repositories for Contacts, Groups, Mixes, reusable Jumps, generated Jumps, custom fields, and Jump Date Types.
- PostgreSQL tests prove Workspace A cannot retrieve or mutate Workspace B core records, import into another workspace, mix Contact IDs across bulk actions, or schedule another workspace's Mix.
- Global system Jump Date Types remain visible while tenant custom types remain private.
- Static regression tests require tenant server actions to derive workspace identity from the authenticated session.
- The authenticated application subtree is protected by its server layout; admin pages additionally require platform-admin authorization.

### Authentication, request security, and My Account

- Database-backed IP/email throttling for registration, login, verification, recovery, password changes, Jump events, Contact imports, and Google integration routes.
- Unknown-account bcrypt comparison and generic invalid-login errors.
- Minimum 12-character passwords within bcrypt's supported input size.
- Optional one-time email verification and password recovery with hashed, expiring tokens.
- Branded HTML/text transactional email through Resend with development-only previews.
- Central Origin and Fetch Metadata mutation boundary, constrained Server Action origins, security headers, and request-size limits.
- Hashed opaque session tokens with device/IP/last-seen/expiration metadata, session caps, remote revocation, and sign-out-everywhere.
- My Account identity, plan state, Google Contacts, password, and active-device controls.

### Production migration and restoration foundation

- Complete Prisma migration history instead of relying exclusively on `db push`.
- A generated and drift-checked legacy baseline plus guarded forward migrations.
- Supported clean-database deployment and existing populated-MVP upgrade paths.
- Automated populated migration, data-preservation, reverse-SQL, forward-reapplication, and clean-deployment rehearsals.
- Production runbooks for backup, restore, row-count checks, worker pause/restart, smoke testing, and backup-based rollback.

### Audited view-only administrator support

- Protected Admin Users search with workspace, plan, verification, and usage context.
- Time-limited support views require a valid target membership and documented support reason.
- Random support token stored only as a SHA-256 hash.
- Real administrator remains the audit actor while the read context switches to the selected workspace.
- Persistent view-only banner; every browser mutation is rejected except ending the support session.
- Target password/device controls remain hidden; start/end events are audited.

## Remaining P0 work

- Restore a real encrypted backup in production-like staging and complete the documented application/worker smoke matrix.
- Add full browser-driven end-to-end tests for authenticated routes, import, Google, template-library, and mutation-rejection behavior.
- Require MFA for platform administrators before support views are enabled operationally.
- Validate production transactional-email delivery and inbox placement before mandatory verification is enabled.
- Complete the final security, accessibility, and operational launch review.

## Remaining P1 work

- Device Contact Picker / Quick Add capability and browser fallback polish.
- Final four-question AI Mix Wizard and provider-backed refinement.
- Stripe Checkout, Customer Portal, verified webhook reconciliation, downgrade workflow, and production Price IDs.
- My Account billing, referrals, Help/FAQ, support tickets, and the broader administration dashboard.
- Observability, encrypted backup automation, load testing, and full production-like staging validation.
