# Current implementation status

**Source of truth:** [Canonical product decisions](CANONICAL_PRODUCT_DECISIONS.md)
**Deployment:** hosted free beta plus a secondary single-owner Docker edition

## Product

- Phone-first navigation: Today, Contacts, Plans, More, with global Quick Add.
- Three-part onboarding captures business type, business/signature, and the first person.
- Ready-made plans for home services, real estate, insurance/finance, and a generic reconnect case.
- Simple plan editor with optional advanced timing, one-screen plan setup, tags, saved dates, contact history, and compact mobile contact entry.
- Prepared message preview/edit, text/email/call handoff, return tray, outcomes, next promise, snooze, stop, and undo.
- Morning digest, Monday report, Web Push, optional reviewed automatic delivery, and customer review/referral requests.
- Spreadsheet/JSON export, session controls, password recovery, and account deletion.

## Platform

- Hosted password, magic-link, Google, and Apple sign-in with mandatory verified email/recovery in production.
- Workspace-isolated PostgreSQL data and centralized request-origin enforcement.
- Timezone-safe logical scheduling, bounded per-business reconciliation, and trigram contact search.
- Durable worker leases, heartbeats, notification receipts, automatic-delivery claims, and idempotent outcomes.
- Encrypted backup/restore with manifests and separate-database restoration.
- Curated ready-made-plan administration, private support conversations, audited view-only support access, administrator MFA, job recovery, and audit search.

## Retired

Paid tiers and billing, Stripe, Google Contacts synchronization, AI-generated plan drafts, community plan publishing/voting, signup-reward referrals, user layout persistence, and unused provider/webhook scaffolding have been removed from active code and schema. Migration `20260904200000_retire_dormant_features` maps legacy enum values, preserves core customer data and curated plans, and drops the retired data.

## Release gates

The repository gate includes static validation, Prisma validation/generation, populated and greenfield migration rehearsal, unit/integration tests, build, seed, encrypted restore rehearsal, desktop/mobile browser tests, accessibility scans, Lighthouse budgets, dependency audit, and web/worker container builds.

External release blockers are provider credentials and successful qualification on a real iPhone and Android device. A repository test cannot substitute for carrier, OS composer, push-permission, or inbox behavior.
