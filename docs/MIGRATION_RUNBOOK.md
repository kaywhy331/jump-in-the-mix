# Database migration runbook

Prisma migrations are append-only production history. Never edit a migration already applied outside disposable development data.

## Current chain

The repository begins with `20260715000000_existing_mvp_baseline` and applies every directory in timestamp order. The September product migrations add notification/reconciliation state, hosted authentication, automatic delivery/reviews, and finally retire dormant subsystems:

```text
20260904170000_product_platform
20260904180000_hosted_auth
20260904190000_automatic_delivery_and_reviews
20260904200000_retire_dormant_features
```

The retirement migration is intentionally destructive. It preserves users, businesses, contacts and methods, tags, saved dates, plans and steps, prepared/completed follow-ups, imports, preferences, notification/review/automatic-delivery data, support, administrator security, audit history, jobs, and curated ready-made plans. It maps:

- follow-up status `COPIED` → `PENDING`;
- follow-up status `SENT` → `DONE`;
- contact source values from removed integrations → `MANUAL`;
- all legacy workspace roles → `OWNER`;
- platform-approved ready-made plans → the curated status.

It removes billing/subscriptions, contact-sync and OAuth credentials, AI drafts/capture links, old webhooks, signup-reward referrals, account-deletion provider-revocation remnants, saved card layouts, community plan submissions/votes, and retired columns/enums. An old backup may therefore contain encrypted provider material and must remain protected even though the new application cannot read it.

## Before deployment

1. Confirm the intended commit and inspect every new migration SQL file.
2. Run `npm run db:rehearse-migration` against disposable PostgreSQL.
3. Run the complete unit/integration suite and production build.
4. Freeze writes and create `npm run db:backup` with a unique backup key.
5. Run `npm run db:rehearse-restore` and preserve the production backup plus manifest outside the host.
6. Record pre-deploy migration names and critical row counts.

The migration rehearsal builds both a populated legacy schema and a greenfield schema. It confirms core records and curated plans survive, legacy values are mapped, retired tables/columns disappear, required indexes exist, and every committed migration is recorded.

## Deploy

Run once from the release artifact:

```bash
npm run db:deploy
```

Do not use `prisma db push` in hosted production. Start the web service, require `/api/health/ready`, then start the worker and require `/api/health/worker`. Run the hosted smoke suite and compare critical counts.

## Rollback

Application-only rollback is safe when the prior revision supports the new schema. Redeploy that immutable revision and smoke-test it.

Do not run reverse SQL on a database that accepted newer writes. For a schema/data rollback, stop web and worker writes, restore the validated pre-deploy archive into a separate empty database, point the previous revision at it, verify health and critical counts, then reopen traffic. Retain the failed database for investigation.

## Failure handling

- A failed migration blocks the release; do not mark it applied unless an operator has verified the SQL completed exactly as intended.
- Never retry destructive SQL blindly after a partial provider or platform failure.
- Redact database URLs and customer data from logs and tickets.
- Test a real managed-backup restore at least quarterly, not only the local rehearsal.
