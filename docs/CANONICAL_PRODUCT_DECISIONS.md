# Canonical product decisions

**Status:** Active implementation contract
**Effective:** September 4, 2026
**Payments roadmap updated:** September 7, 2026
**Audience:** Product, design, engineering, support, and operations

This is the single source of truth for the product. Older specifications are historical context only. When code, copy, tests, or another document disagrees with this file, this file wins.

## Initial launch access and costs

September 8, 2026 decision: free access through **weekly waitlist waves, manual administrator invitations, and personal referrals**. The homepage has a Join the waitlist entry point. A waitlist entry does not create an account. Every 7 days the worker invites up to 10 confirmed entries: 5 oldest by signup date, then 5 selected randomly from the rest. Administrators may send additional selected invitations; each member also has five lifetime invitations, created and sent only through the Jump in the Mix System Mix. Each access URL is unique, single-use, and bound to the recipient email. Every new member receives five personal invitations, usable after email verification.

Granting access automatically removes the normalized email from the active administrator Waiting queue and preserves access/delivery/join history. Wave and referral issuance share one identity/access service so simultaneous requests cannot create duplicate admissions, send stale wave invitations, or spend an extra member slot. Platform wave grants do not spend an administrator's five personal slots.

The administrator console must cover waitlist/waves, access, reports, mixes, users/support, logs, operations, and per-person staff permissions. Use role templates plus explicit individual permissions, mandatory staff MFA, server-enforced checks, versioned mix changes, and complete platform audit events. Customer workspace access requires an assigned active support case, a separate permission, and a timed view bound to the handler’s current session; private reads are audited. Keep secret access URLs out of admin reports. [Support case workflow](SUPPORT_CASE_ACCESS.md). [Full infrastructure and delivery plan](ADMIN_OPERATIONS_INFRASTRUCTURE_PLAN.md).

Waitlist confirmation, weekly waves, manual selection, a shared invitation email outbox, shared admission locking, withdrawal/confirmed rejoining, and access history are implemented locally. Named staff roles, individual overrides, MFA, session revocation, last-Owner protection, and platform audit are also implemented locally. Signed provider events, bounce/complaint suppression, email budgets with a protected account reserve, and email diagnostics are implemented; new account email summaries require opt-in. See [Email operations](EMAIL_OPERATIONS.md). Customer suspension/restoration, session revocation, fresh authorization and access-change audit records are implemented locally; staff controls remain Owner-managed in Team. See [Account administration](USER_ADMINISTRATION.md). New staff onboarding uses recipient-bound, seven-day email invitations, limited initial roles, and mandatory MFA in production; the remaining expanded control plane and external qualification are still open. See [Staff access](STAFF_ACCESS.md). See [Waitlist operation](WAITLIST_OPERATIONS.md). Payments and native iOS/Android clients remain deferred until traction warrants them.

Keep costs low: use free email and the free Render Hobby workspace, test free web hosting only for a limited rehearsal, and target roughly $22/month in core services for a small paid Render launch. Free Render Postgres is disposable and expires after 30 days. Scale based on measured performance and demand. Details and remaining gates: [production launch plan](PRODUCTION_LAUNCH_PLAN.md).

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

The primary distribution is a hosted, multi-tenant free beta with PostgreSQL, a web service, and the durable background worker. The target launch requires a unique access grant from an administrator waitlist wave or a personal invitation sent through the System Mix. Email verification and recovery are mandatory. Google, Apple, email-link, and password sign-in remain available for existing accounts when configured; only a valid access-grant signup flow can create hosted accounts.

The Docker edition remains a secondary privacy-oriented option. It is single-owner, loopback-only by default, may operate without transactional email, and provides an operator CLI for password recovery. Help must never imply that a support team or email delivery exists when it is not configured.

The current free beta has no active billing or paid tiers. Stripe is planned for future payments, as confirmed by the owner on September 7, 2026. The payment model, pricing, access rules, and activation date are undecided. This supersedes the earlier exclusion of Stripe from the roadmap; it does not activate billing or introduce feature limits. Treat payments as a new implementation with reviewed migrations and payment-lifecycle tests. The anticipated hosting structure and remaining decisions are recorded in [Production structure and launch preparation](PRODUCTION_LAUNCH_PLAN.md); deployment and public launch are deferred while that work is finalized.

Google Contacts synchronization, the AI plan wizard, and legacy signup-reward referrals remain retired during the free beta. They must not compile into the active application or gate core behavior. Hosted administration, support conversations, ready-made plan curation, customer review requests, and customer-to-customer referral prompts remain supported.

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

## Voice and assistant scope

The September 8 example PRD was critically reviewed in [Voice PRD review](VOICE_PRD_REVIEW.md). The selected launch implementation extends short dictation, private temporary capture drafts, and a factual spoken Today briefing. These are implemented locally; see [Voice workflows](VOICE_WORKFLOWS.md). Physical-device speech qualification remains required in the completion ledger. The proposed paid realtime assistant, inbox analysis, messaging bridges and native clients are deferred pending usage evidence; the free closed-access model stays in place. QR contact intake must remain separate from account invitations and cannot bypass System Mix or its five-person limit.

## Admission capacity

Customer accounts plus unused invitations must fit an administrator-configured ceiling before issuing another grant. A separate outstanding-invitation ceiling limits pending growth. Both default to zero until configured; existing invitations remain valid. Suspended and unverified customers count, while staff-only accounts do not. The five lifetime System Mix invitations remain the product rule, independent of available platform capacity.

Weekly waves and manual selections require room for their whole eligible batch. Capacity delays preserve the weekly due date; resumed capacity produces one wave and skips missed slots. Independent collection, new-grant, referral, and emergency-redemption pauses have explicit effects; they do not silently revoke existing links. See [Admission controls](ADMISSION_CONTROLS.md).


## Library release lifecycle

Library edits create immutable drafts. Publishing, hiding, or rolling back is a separate permission-gated operation with current credentials, recent MFA, a reason, and a stale-form check. Rollback can select only a previously published version. Staff-only accounts can author content; owning a customer workspace is optional.

Customer setup is bound to the published version it previewed. Existing customer copies remain independent. Re-running catalog setup installs missing reviewed plans and cannot overwrite existing drafts, visibility choices, or rollbacks. See [Library administration](LIBRARY_ADMINISTRATION.md). System Mix invitation-copy releases use the separate workflow below.


## System Mix copy releases

- System Mix invitation subjects and introductions use immutable saved versions, separate editor/publisher permissions, recent MFA/password release checks and audited rollback. The unique access URL, recipient notice, preference link and five lifetime invitation rules remain application controls. See [System Mix administration](SYSTEM_MIX_ADMINISTRATION.md).
- A member must review again if the published wording or selected names changed. Allocation records the reviewed version and freezes the complete email in the existing outbox. A later release cannot alter prepared messages, consume an extra slot on retry or replace their access tokens.

## Aggregate report definitions

Admin Reports uses bounded UTC ranges and `reports.read`. Activation requires setup plus an owner-recorded completed follow-up. Retention uses meaningful owner actions and fully elapsed D7/D30 return windows; page opens, automation and support actors do not count. Grant issuance, email transport, account joining and activation remain separate facts. Growth excludes demo, staff-only and configured test identities; operational usage counts all traffic. General analytics contains aggregate counts and public library titles, with no customer content or identity payload. Live retained data can restate earlier totals. See [Reports](ADMIN_REPORTS.md) for exact populations, stored history and export rules.

The existing worker generates bounded daily aggregate reports and encrypted CSV exports after customer jobs. Saved history is partitioned by metric definition/exclusions and labels observation times. Export access is bound to the original staff session, expires after 24 hours, and is reauthorized at generation/download; quota receipts survive sign-out. No extra paid analytics service or object store is required. Operator retries apply only to the reviewed terminal failure and cannot replace a running job's lease.
