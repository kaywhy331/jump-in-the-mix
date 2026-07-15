# Implementation Status

This document distinguishes the **runnable core starter** from the broader product specification. The design documents describe the intended full MVP; only the items under “Runnable now” are currently wired end-to-end.

## Runnable now

### Installation and operations

- Dockerized Next.js web application
- PostgreSQL database
- Background worker process
- One-click launchers for Windows and macOS
- Shell launchers for Linux/macOS
- Automatic `.env` creation and secure local key generation
- Automatic schema setup and demo seeding
- Readiness and liveness health checks
- Diagnostic, stop, and destructive reset scripts
- Responsive seeded demo workspace

### Product experience

- Problem-first public landing page
- Registration and email/password sign-in
- Opaque, hashed server-side sessions
- Workspace ownership foundation
- One-screen guided onboarding with a skip option
- Dashboard with first-win checklist
- Contact search, creation, detail, and archive actions
- Contact email and phone storage
- Important Dates on contacts
- One-time, monthly, and yearly recurrence fields in the data model
- Starter Mix creation
- Plus/Pro AI Mix Wizard preflight
- Deterministic Mix message generation without requiring an AI API key
- Mix timeline, activation, and contact assignment
- Background Jump generation/reconciliation
- Today, Upcoming, Past, and Completed Jump views
- SMS, email, phone, and WhatsApp deep links
- Done and Skip actions
- Server-side Free/Plus/Pro entitlement checks

### Engineering validation

- Prisma schema validation
- TypeScript semantic type checking
- Source syntax validation
- Local import resolution validation
- Unit tests for placeholders and Mix generation
- Successful Next.js production build

## Schema and documentation scaffolding only

The database has room for the following capabilities, and their desired behavior is documented, but the complete API routes, provider clients, and customer-facing flows are **not yet implemented**:

- Stripe Checkout, webhook reconciliation, and Customer Portal
- Google Contacts OAuth and incremental sync
- Microsoft/Outlook OAuth and delta sync
- WhatsApp Business assistant linking and webhooks
- Website/Zapier inbound webhook capture
- CSV field-mapping/import UI
- Natural-language Quick Capture
- Contact Groups management UI
- Referral workflow UI
- Shared Mix library and moderation
- Administration dashboard
- Integration credential encryption service
- Audit-log writing across all mutations

## Deliberately deferred beyond the MVP

- Automated outbound contact SMS/email delivery
- Ringless voicemail delivery
- Live AI phone calls
- Two-way Google/Microsoft contact sync
- Salesforce, HubSpot, Pipedrive, or Zoho connectors
- Team invitations and seat billing
- Paid Shared Mix marketplace
- Social-network monitoring
- Full analytics warehouse
- “Drops” as a separate product concept

## Production hardening still required

- Create, review, and commit the initial Prisma migration
- Email verification and password reset
- Login/API rate limiting and abuse protection
- CSRF review for all mutation paths
- User-facing error boundaries and toast handling
- Structured logging, metrics, and alerting
- Automated encrypted backups and a tested restoration process
- Accessibility audit
- Browser and device testing
- Privacy policy, terms, consent language, and data-retention policy
- Independent security review before real customer data is imported
- Load testing of Jump generation and large imports
- Staging validation of every external integration

## Current validation caveat

A production build, schema validation, typecheck, and unit tests were completed in the artifact environment. Docker itself is not available in that environment, so the complete Compose startup was not executed there. Run the included launcher on a Docker-enabled machine and complete the smoke test in `docs/LOCAL_TESTING.md` before accepting the local stack.
