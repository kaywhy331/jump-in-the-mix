# Implementation Status

This document distinguishes the runnable independent application from the complete product described in the approved Master PRD.

## Implemented foundation

- Dockerized Next.js application, PostgreSQL, Prisma, and background worker.
- Registration, password login, opaque hashed sessions, and workspace ownership.
- Public landing page and local guided demo.
- Contact creation, Jump Dates, starter Mixes, and direct Contact-to-Mix assignment.
- Deterministic AI-Wizard fallback.
- Background Jump generation and reconciliation.
- Native SMS, email, phone, and WhatsApp compose actions.
- Server-side plan limits.

## PRD core-foundation tranche

The `agent/prd-core-foundation` change set now includes:

### Scheduling and action queue

- The canonical product decision record.
- Corrected Free/Plus/Pro limits for Contacts, Groups, custom Jump Date Types, active Mixes, sharing, Google Contacts, AI, and voicemail.
- Timezone-aware logical-date scheduling helpers.
- Stable deterministic Jump keys based on workspace, Contact, Mix, Mix Jump, occurrence, local schedule, and timezone.
- Lifecycle reconciliation that creates missing records, updates mutable records, reactivates resumed occurrences, and cancels obsolete pending records.
- Automatic reconciliation after onboarding, Contact and Jump Date changes, Mix changes, activation, assignment, and audience changes.
- Explicit Mix pause and archive behavior that removes incomplete work while preserving completed history.
- Fixed-date broadcasts with a required local date, local time, IANA timezone, and explicit Contact/Group audience.
- Broadcast edits reconcile future pending work, so date, time, timezone, sequence, and audience changes do not leave duplicates or stale tasks.
- Manual-start assignments retain their original start date when the Mix is edited; broadcasts use a separate persisted trigger record.
- A mobile-oriented Jump page that defaults to overdue plus today, places Pending above Completed, supports Done/Undo/Skip, and exposes direct channel actions.
- Due, Week, Month, status, and channel filters.
- Durable communication action events for copied content, opened composers, phone calls, and voicemail actions.
- Recent action history in the expanded Jump view.
- Jump scheduling, broadcast validation, and rendering unit coverage for leap years, month-end behavior, timezones, key stability, and private-note restrictions.

### Contacts, Groups, and custom fields

- Structured Contact creation and editing.
- Multiple email addresses, phone numbers, and structured addresses.
- One explicit primary email, phone, and address.
- Email normalization and duplicate checks scoped to the active workspace.
- Phone normalization and validation.
- Public Notes and Private Notes stored separately.
- Private Notes available only to Phone Call Jump scripts.
- Contact Group creation, deletion, filtering, display, and individual membership editing from the Contacts experience.
- Jump Date removal and Mix-assignment removal with reconciliation.
- Mobile-first multi-select, Select All/Deselect All, and a persistent bulk action bar.
- Bulk Contact Group assignment and removal.
- Apply Jump for an existing reusable Jump or one-time channel content.
- One-time applied Jumps are protected from normal Mix reconciliation and appear immediately in the Jump queue.
- Selected-Contact CSV export with primary values, Groups, Jump Dates, and Public Notes; Private Notes are excluded.
- Bulk archive with pending-Jump cancellation and completed-history preservation.
- Workspace-owned Contact custom-field definitions with stable placeholder keys.
- Custom-field create, rename, delete, usage counts, Contact value editing, Contact search, and Contact detail display.
- Dynamic `{{contact.custom.<key>}}` placeholders in reusable and one-time Jumps.
- Scheduled and one-time rendering use the same custom-field and Private Notes rules.
- Contact-input, custom-field, rendering, and export unit coverage for normalization, deduplication, addresses, primary selections, placeholders, and CSV escaping.

### Jump Date Types

- Tenant-owned custom Jump Date Types without per-user duplication of global system records.
- Create, search, rename, safely delete, activate, and deactivate custom types.
- Deletion protection while a type is used by Jump Dates or active Mixes.
- Free/Plus/Pro active-type limits.
- Downgrade-safe active selection that preserves inactive overage records.
- Custom types shown before global system types in Contact and Mix flows.
- Contextual management from the Mix editor and Settings hub.

### Reusable Jumps

- Searchable reusable Jumps manager.
- SMS, email, phone-call, voicemail-script, and WhatsApp content.
- Channel-specific validation and Pro enforcement for Ringless Voicemail content.
- Click-to-insert Contact, Contact custom-field, and My Info placeholders.
- Phone-call-only Private Notes placeholders.
- Immutable content versions.
- Existing active Mix sequence items move to the new content version while completed Jump snapshots remain unchanged.
- Channel immutability after creation to preserve historical interpretation.
- Mix association display and archive protection while a Jump is actively used.

### Mix builder and Contact-specific stops

- Manual Mix creation and editing.
- Draft, Active, and Paused states with active-plan-limit enforcement.
- Target Jump Date Type, manual-start, and fixed-date broadcast modes.
- Contact Group and all-active-Contacts audience options.
- Ordered Jump #1, Jump #2, and later sequence editing.
- Add, remove, move, and replace reusable Jumps.
- Day offsets and optional local send-time overrides.
- Category, industry, framework, and description fields.
- Transactional saves.
- Removed sequence rows with completed history are retained internally as inactive; unused rows are deleted.
- Future pending Jumps reconcile after every save without rewriting completed history.
- A Contact-specific Mix stop that cancels pending work without deleting the Mix, assignment, or history.
- Stop Mix from a Jump or Contact record, and Resume from the Contact record.
- Reconciliation excludes stopped Contact/Mix pairs and restores valid future work after resume.

### Tenancy and authorization validation

- Central workspace-scoped repository functions for Contacts, Groups, Mixes, reusable Jumps, generated Jumps, custom fields, and available Jump Date Types.
- PostgreSQL integration tests prove that Workspace A cannot retrieve Workspace B core records, mix Contact IDs across bulk operations, write custom values to another workspace's Contact, or schedule another workspace's Mix.
- Global system Jump Date Types remain visible across workspaces while tenant custom types remain private.
- Static regression tests require every tenant server action export to derive the workspace through `requireWorkspace()`.
- The Jump action-event endpoint is regression-tested for authenticated, workspace-scoped lookup.
- CI provisions the real Prisma schema in PostgreSQL before running the isolation suite.

### Authentication, request security, and My Account

- Registration and login now use database-backed IP and email throttling with time-bounded blocks.
- Unknown accounts still execute a bcrypt comparison, reducing account-enumeration timing differences.
- Passwords require at least 12 characters and remain within bcrypt's supported input length.
- Optional email verification uses one-time, expiring tokens stored only as SHA-256 hashes.
- Password recovery uses one-time, expiring links; completing a reset invalidates every active session.
- Transactional verification, reset, and password-change emails support Resend in production and a development-only preview path.
- The authenticated request boundary rejects untrusted cross-origin mutations while leaving explicit webhook routes available for future signed provider callbacks.
- Security headers, constrained Server Action origins, and a one-megabyte Server Action body limit are applied centrally.
- Sessions store the device user agent, client IP, last-seen time, expiration, and only a hash of the opaque cookie token.
- A configurable per-user session cap removes the oldest sessions when the cap is exceeded.
- My Account displays identity, plan state, password controls, and active sessions on desktop and mobile.
- Users can revoke one remote session, sign out other devices, or sign out everywhere.
- Changing a password retains the current session and closes every other session.
- The Jump action-event API has an authenticated per-user/workspace throttle and returns `429` with `Retry-After` when exceeded.
- Unit, PostgreSQL integration, and static boundary tests cover password policy, token invalidation, throttling, origin enforcement, and session/recovery wiring.

## Remaining P0 work

- Reviewed production Prisma migration and populated-database migration/rollback and restoration test.
- Browser-level cross-workspace route matrix, audited administrator impersonation controls, and authorization tests for future modules as they are added.
- Production transactional-email configuration and end-to-end inbox verification before enabling mandatory email verification.

## Remaining P1 work

- CSV/VCF import, mapping, deduplication, merge review, export, and error report.
- Google Contacts OAuth, encrypted credential service, preview, incremental sync, and logs.
- Platform/community Mix Templates, moderation, voting, contributor profiles, and atomic imports.
- Final four-question AI Mix Wizard and provider-backed refinement.
- Stripe Checkout, Customer Portal, verified webhook reconciliation, and downgrade workflow.
- My Account billing/integrations, referrals, Help/FAQ, support tickets, and administration dashboard.
- Accessibility, observability, encrypted backup/restore, security review, load testing, and staging validation.

## Validation policy

A documentation claim is not completion. A feature is complete only when its acceptance criteria in the Master PRD pass in automated tests and production-like staging.
