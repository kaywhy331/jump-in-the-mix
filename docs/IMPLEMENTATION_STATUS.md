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
- Explicit Mix pause and archive behavior that removes future pending work while preserving history.
- A mobile-oriented Jump page that defaults to overdue plus today, places Pending above Completed, supports Done/Undo/Skip, and exposes direct channel actions.
- Due, Week, Month, status, and channel filters.
- Jump scheduling unit coverage for leap years, month-end behavior, timezones, and key stability.

### Contacts and Groups

- Structured Contact creation and editing.
- Multiple email addresses, phone numbers, and structured addresses.
- One explicit primary email, phone, and address.
- Email normalization and duplicate checks scoped to the active workspace.
- Phone normalization and validation.
- Public Notes and Private Notes stored separately.
- Private Notes available only to Phone Call Jump scripts.
- Contact Group creation, deletion, filtering, display, and individual membership editing from the Contacts experience.
- Jump Date removal and Mix-assignment removal with reconciliation.
- Contact-input unit coverage for normalization, deduplication, addresses, and primary selections.

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
- Click-to-insert Contact and My Info placeholders.
- Phone-call-only Private Notes placeholders.
- Immutable content versions.
- Existing active Mix sequence items move to the new content version while completed Jump snapshots remain unchanged.
- Channel immutability after creation to preserve historical interpretation.
- Mix association display and archive protection while a Jump is actively used.

### Mix builder

- Manual Mix creation and editing.
- Draft, Active, and Paused states with active-plan-limit enforcement.
- Target Jump Date Type, manual-start, and broadcast action modes.
- Contact Group and all-active-Contacts audience options.
- Ordered Jump #1, Jump #2, and later sequence editing.
- Add, remove, move, and replace reusable Jumps.
- Day offsets and optional local send times.
- Category, industry, framework, and description fields.
- Transactional saves.
- Removed sequence rows with completed history are retained internally as inactive; unused rows are deleted.
- Future pending Jumps reconcile after every save without rewriting completed history.

## Remaining P0 work

- Reviewed production Prisma migration and populated-database migration test.
- Cross-workspace authorization test suite for every read and mutation.
- Contact custom-field definition and value management UI.
- Bulk Contact selection, Group assignment, Apply Jump, CSV export, and archive actions.
- Fixed-date broadcast scheduling and a clearer distinction between broadcast snapshots and manual starts.
- MixStop and communication action-event models/UI.
- Email verification, password recovery, rate limiting, CSRF/origin review, and session management.

## Remaining P1 work

- CSV/VCF import, mapping, deduplication, merge review, export, and error report.
- Google Contacts OAuth, encrypted credential service, preview, incremental sync, and logs.
- Platform/community Mix Templates, moderation, voting, contributor profiles, and atomic imports.
- Final four-question AI Mix Wizard and provider-backed refinement.
- Stripe Checkout, Customer Portal, verified webhook reconciliation, and downgrade workflow.
- My Account, referrals, Help/FAQ, support tickets, and administration dashboard.
- Accessibility, observability, encrypted backup/restore, security review, load testing, and staging validation.

## Validation policy

A documentation claim is not completion. A feature is complete only when its acceptance criteria in the Master PRD pass in automated tests and production-like staging.
