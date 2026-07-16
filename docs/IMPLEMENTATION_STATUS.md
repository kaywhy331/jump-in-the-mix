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
- Selected-Contact CSV export with primary values, Groups, Jump Dates, Public Notes, and custom fields; Private Notes are excluded.
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
- The complete authenticated application subtree is protected by a server layout; admin pages additionally require `requirePlatformAdmin()`.
- A server-enforced route matrix verifies the authenticated layout, admin pages, impersonation entry points, and the central mutation boundary.
- CI provisions the real Prisma schema in PostgreSQL before running isolation and authorization integration suites.

### Authentication, request security, and My Account

- Registration and login use database-backed IP and email throttling with time-bounded blocks.
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

### Production migration and restoration foundation

- The repository now contains Prisma migration history instead of relying exclusively on `db push`.
- A no-op historical marker supports existing populated MVP databases after a one-time `migrate resolve --applied` baseline step.
- The guarded forward migration adds Private Notes, historical Mix sequence support, authentication throttling, Mix stops, action events, fixed-date broadcast schedules, and administrator support-session records.
- Existing MixStep rows are backfilled with `isActive = true` and a non-null `updatedAt`; the old unique sort-position index is replaced by an active-sequence ordering index.
- CI automatically provisions a populated legacy database, resolves the historical baseline, applies the forward migration, validates legacy-data preservation, executes the reviewed pre-traffic reverse SQL, and reapplies the forward migration.
- A production runbook documents backup, staging restoration, row-count checks, worker pausing, first deployment, smoke testing, and backup-based production rollback.

### Audited view-only administrator support

- A protected Admin Users page searches accounts and workspace memberships without exposing the feature to ordinary users.
- Starting a support view requires a platform administrator, a valid target workspace membership, and a 10–500 character support reason.
- The support token is cryptographically random, stored only as a SHA-256 hash, and expires after 30 minutes by default.
- The authenticated actor remains the administrator while the application read context is switched to the selected target workspace.
- A persistent banner identifies the viewed user, reason, expiration, and view-only restrictions.
- Every impersonated browser mutation is rejected centrally with HTTP 403 except the explicit End View-Only Session route.
- Target-account password, device-session, and other security controls are hidden during support access.
- Start and end events are written to the target workspace audit log with the administrator, reason, expiry, and view-only mode.
- PostgreSQL integration tests cover token hashing, actor binding, target membership, expiry, non-admin rejection, and start/end audit records.

## Remaining P0 work

- Restore a real encrypted backup in production-like staging and complete the documented application/worker smoke matrix.
- Add full browser-driven end-to-end tests for authenticated routes and cross-workspace 404/redirect behavior; the current matrix is server-enforced and integration-tested but not yet browser-automated.
- Require MFA for platform administrators before enabling support impersonation in production.
- Validate production transactional-email delivery and inbox placement before enabling mandatory email verification.
- Complete the final security, accessibility, and operational launch review.

## Remaining P1 work

- CSV/VCF import, mapping, deduplication, merge review, export, and error report.
- Google Contacts OAuth, encrypted credential service, preview, incremental sync, and logs.
- Platform/community Mix Templates, moderation, voting, contributor profiles, and atomic imports.
- Final four-question AI Mix Wizard and provider-backed refinement.
- Stripe Checkout, Customer Portal, verified webhook reconciliation, and downgrade workflow.
- My Account billing/integrations, referrals, Help/FAQ, support tickets, and the broader administration dashboard.
- Observability, encrypted backup automation, load testing, and production-like staging validation.

## Validation policy

A documentation claim is not completion. A feature is complete only when its acceptance criteria in the Master PRD pass in automated tests and production-like staging.
