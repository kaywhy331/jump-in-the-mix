# Single-user product scope

## Product boundary

Jump in the Mix is a structure-first application for one signed-in individual managing personal and professional relationships. The supported product is not an organization, team, enterprise CRM, subscription, billing, multi-workspace, paid-tier, or external-provider product.

The primary product areas are:

1. Today
2. Contacts
3. Mixes
4. Templates
5. Quick Add
6. Settings
7. Personal account and data controls

## Supported behavior

Each user operates in one personal data space. An internal `Workspace` record and `workspaceId` foreign keys may remain as dormant implementation details while the schema is simplified safely over time. They do not create a user-facing workspace concept.

The application supports personal profile and password management, active sessions, timezone and scheduling defaults, quiet hours, weekend scheduling, personal notification preferences, data export, and account deletion.

Core relationship workflows include prepared actions, communication outcomes, undo, follow-up scheduling, append-only relationship history, Contact search and import, Contact archive/restore and duplicate review, Mix authoring, optional reusable templates, explicit audiences, and background reconciliation.

## Visible navigation

Desktop and mobile navigation expose only:

- Today
- Contacts
- Mixes
- Templates
- More or Settings

Quick Add remains globally accessible.

## Explicitly dormant or unavailable

The active product does not render or expose:

- plans, pricing, subscriptions, billing, payments, invoices, upgrades, or downgrades
- teams, members, invitations, role management, ownership transfer, organizations, or workspace switching
- Stripe, Google production connections, external AI providers, provider API keys, or provider qualification controls
- referral rewards or community monetization

Billing, team, invitation, workspace-switching, and external-provider routes return not found or redirect to the personal Account area. No active navigation links to them.

Historical database columns, migrations, internal types, and preserved branches may retain names related to deferred capabilities. They must remain dormant, must not gate personal features, and are covered by an explicit terminology-scan allowlist rather than destructively removed.

## Capability policy

Contacts, Groups, Mixes, templates, imports, actions, and activation are not limited by a subscription tier. Security, integrity, request-origin, configuration, and operational protections apply uniformly and do not depend on a commercial plan.

## Deferred qualification

Real Stripe, Google OAuth, external AI, team collaboration, multi-workspace behavior, and offsite provider infrastructure are deferred. Their existing branches remain preserved for possible future product phases; they are not ported into the single-user consolidation branch.

