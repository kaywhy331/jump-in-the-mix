# Canonical product decisions

**Status:** Active implementation contract
**Effective:** September 4, 2026
**Audience:** Product, design, engineering, support, and operations

This is the single source of truth for the product. Older specifications are historical context only. When code, copy, tests, or another document disagrees with this file, this file wins.

## Product and customer

Jump in the Mix is a phone-first follow-up CRM for owner-operated small businesses. The first launch audiences are home services, real estate, and insurance or financial services.

The product helps an owner:

- keep estimates and new leads from going quiet;
- check in after a job or closing;
- earn reviews and referrals without sounding pushy;
- remember renewals, anniversaries, and promised callbacks;
- open the app and immediately know who to contact next.

A new customer must be able to create an account, identify their business, add one person, and see a useful prepared follow-up in minutes from a phone. Docker knowledge is never required for the hosted product.

## Product language

Customer-facing language is deliberately ordinary:

| Meaning | Customer-facing word |
|---|---|
| Due work | Today |
| One scheduled action | Follow-up |
| A timed sequence | Plan |
| A reusable starting point | Ready-made plan |
| A contact grouping | Tag |
| A trigger such as a birthday or job completion | Saved date |
| Reusable or private relationship context | Note / Private note |

“Jump in the Mix” is the brand, not a noun for work. Internal database names such as `Jump`, `Mix`, `DateType`, and `Group` remain compatibility boundaries and must not leak into customer copy. Do not expose “Action Template,” “Mix Template,” “day offset,” “snapshot,” “broadcast,” “activation impact,” or “reconciliation.”

## Navigation and core loop

Primary navigation has four destinations:

1. **Today** — overdue and due follow-ups, ordered by what needs attention next.
2. **Contacts** — people, notes, history, tags, and saved dates.
3. **Plans** — ready-made plans and simple custom plans.
4. **More** — business settings, account, notifications, privacy, and help.

Quick Add is available everywhere. The core loop is:

```text
Add a person or log what happened
  -> choose or infer when to follow up
  -> review the prepared message on Today
  -> open the phone composer, copy, or call
  -> record the outcome and next promise
```

## Delivery and notifications

Human review is the default. The app opens the phone’s native text, email, WhatsApp, or call experience and does not claim carrier-confirmed delivery.

Automatic email or SMS delivery is an explicit, default-off option. It requires configured providers, a 15-minute to 24-hour review window, quiet-hour enforcement, one durable claim per follow-up, and a permanent receipt. An uncertain provider result is never retried automatically.

Morning email digests, due Web Push notifications, and Monday owner reports are configurable. All notification timing uses the owner’s timezone and quiet hours.

## Hosted and self-hosted editions

The primary distribution is a hosted, multi-tenant free beta with PostgreSQL, a web service, and the durable background worker. Registration remains open, email verification and recovery are mandatory, and Google, Apple, email-link, and password sign-in are supported when their credentials are configured.

The Docker edition remains a secondary privacy-oriented option. It is single-owner, loopback-only by default, may operate without transactional email, and provides an operator CLI for password recovery. Help must never imply that a support team or email delivery exists when it is not configured.

Billing, paid tiers, Stripe, Google Contacts synchronization, the AI plan wizard, and legacy signup-reward referrals are retired during the free beta. They must not compile into the active application or gate core behavior. Hosted administration, support conversations, ready-made plan curation, customer review requests, and customer-to-customer referral prompts remain supported.

## Data and tenancy

`workspaceId` is the authorization boundary. It comes only from the authenticated session and is never trusted from browser input. Every route, action, worker job, import, export, and administrator support view must preserve this boundary.

Each account currently owns one business workspace. The internal workspace model supports hosted isolation but is not a user-facing collaboration concept. There are no seats, invitations, role-management screens, or workspace switcher in the beta.

Contacts, tags, saved dates, plans, imports, and follow-ups have no commercial limits. Contact methods are diffed by stable normalized identity on edit. Completed history and rendered messages are immutable.

## Time and scheduling

Scheduling is defined by a logical local date, IANA timezone, local send time, and derived UTC instant. Server-rendered dates always receive the signed-in owner’s locale and timezone. The server and containers run in UTC for deterministic behavior.

February 29 becomes February 28 in non-leap years. Monthly dates on the 29th through 31st clamp to the final valid day. Quiet hours, weekend rules, and snooze presets are applied in the owner’s timezone.

The worker repairs schedules in bounded workspace batches. Deterministic uniqueness keys make scheduling and outcome writes idempotent.

Editing business details intentionally refreshes the rendered message on every still-pending follow-up so a corrected signature or service name is reflected before the customer sees it. Completed history remains immutable. If a hosted workspace grows to thousands of pending follow-ups, move this refresh to a versioned, chunked job rather than weakening that correctness rule.

## Privacy, security, and ownership

Sessions use opaque hashes, `SameSite=Strict`, a 14-day maximum, caps per user, and rotation after password changes. Mutation requests pass the origin boundary and nonce-based content security policy. Sensitive values and backups are encrypted with separate keys.

Users can export a spreadsheet bundle or complete JSON, inspect and revoke sessions, and permanently delete their account after reauthentication. Provider delivery, notification, review, action, and administrator-access events leave auditable receipts.

## Experience and quality bar

- One responsive DOM; no duplicated mobile and desktop content.
- A 13px minimum for meaningful text; smaller text is decorative only.
- Touch targets are at least 44 by 44 CSS pixels.
- System light/dark preference is respected.
- Menus and mobile tasks use the shared accessible sheet; native disclosure remains appropriate for optional long-form content such as FAQs and advanced fields.
- Empty states describe the next useful business action.
- Copy never explains workers, database state, or other implementation details.
- CI runs static checks, schema and migration rehearsals, unit/integration tests, production build, browser tests, axe scans, Lighthouse budgets, backup/restore rehearsal, dependency audit, and container builds.
- Release qualification includes iPhone Safari and Android Chrome handoffs before external launch; results are recorded in the manual device matrix.

## What stays deliberately strong

Preserve timezone-safe logical scheduling, deterministic and idempotent outcomes, durable worker leases, return-from-composer recovery, undo, append-only history, duplicate-safe imports, encrypted backup/restore, and the centralized request boundary. Product simplification must not weaken these foundations.
