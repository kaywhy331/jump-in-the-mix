# Implementation Status

This document distinguishes the runnable independent application from the complete product described in the approved Master PRD.

## Implemented foundation

- Dockerized Next.js application, PostgreSQL, Prisma, and background worker.
- Registration, password login, opaque hashed sessions, and workspace ownership.
- Public landing page and local guided demo.
- Basic Contacts and Jump Dates.
- Starter Mix creation and deterministic AI-Wizard fallback.
- Mix assignment and background Jump generation.
- Native SMS, email, phone, and WhatsApp compose actions.
- Server-side contact and Mix limits.

## PRD core-foundation tranche

The `agent/prd-core-foundation` change set adds:

- the canonical product decision record;
- corrected Free/Plus/Pro limits for Contacts, Groups, custom Jump Date Types, active Mixes, sharing, Google Contacts, AI, and voicemail;
- timezone-aware logical-date scheduling helpers;
- stable deterministic Jump keys based on workspace, Contact, Mix, Mix Jump, occurrence, local schedule, and timezone;
- lifecycle reconciliation that creates missing records, updates mutable records, reactivates resumed occurrences, and cancels obsolete pending records;
- automatic reconciliation after onboarding, Jump Date creation, Mix activation, and assignment;
- explicit Mix pause and archive behavior that removes future pending work while preserving history;
- a mobile-oriented Jump page that defaults to overdue plus today, places Pending above Completed, supports Done/Undo/Skip, and exposes direct channel actions;
- Due, Week, Month, status, and channel filters;
- Jump scheduling unit coverage for leap years, month-end behavior, timezones, and key stability.

## Remaining P0 work

- Reviewed production Prisma migration and populated-database migration test.
- Cross-workspace authorization test suite for every read and mutation.
- Complete Contact editing with multiple emails, phones, addresses, primary selectors, private notes, Groups, and custom fields.
- Custom Jump Date Type management and downgrade activation selection.
- Reusable Jumps manager and immutable editing workflow.
- Complete transactional Mix builder with targeting, reordering, and local send-time editing.
- MixStop and action-event models/UI.
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
