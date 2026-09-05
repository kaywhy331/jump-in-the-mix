# Local testing

## Self-hosted product smoke

Initialize and start the production-like Docker edition:

```bash
npm ci --no-audit --no-fund
npm run pilot:init
npm run pilot:up
npm run pilot:health
```

Open `http://127.0.0.1:3000/register`, create the owner, complete business setup, and confirm Today contains a prepared follow-up with no unresolved placeholders. Exercise Text/Email/Call, the return tray, undo, snooze, contact history, export, and password recovery. Stop with `npm run pilot:down`.

The developer demo is separate and may be started with `npm run quickstart`. Demo data must never be loaded into a production database.

## Repository checks

With PostgreSQL available through `DATABASE_URL`:

```bash
npm ci --no-audit --no-fund
npm run db:generate
npm run validate:static
npm run db:rehearse-migration
npm run db:deploy
npm run typecheck
npm test
npm run build
RESET_DEMO_DATA=true DEMO_MODE=true npm run db:seed
npm run db:seed:e2e-admin
npm run db:rehearse-restore
npx playwright install chromium
npm run test:e2e
npm run security:audit
```

Run database tests serially when a local Prisma Postgres development server cannot safely multiplex prepared statements:

```bash
npx vitest run --no-file-parallelism --maxWorkers=1
```

## Manual journey

Verify both desktop and phone viewports:

1. Create an account and complete the three-part business setup.
2. Confirm the first message uses the owner’s business name/signature and the displayed time matches their timezone.
3. Add, edit, archive, restore, search, and deduplicate a contact.
4. Start a ready-made plan and build a simple custom plan.
5. Complete and undo a follow-up; return from a native composer and record the result.
6. Enable a digest or push notification and confirm quiet hours are respected.
7. Export spreadsheet and JSON data, revoke a session, and exercise account deletion with a synthetic account.

Never put real customer data, provider tokens, passwords, databases, or backup archives in fixtures or test reports.
