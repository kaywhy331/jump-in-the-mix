# Jump in the Mix — Independent Application

A portable, self-hosted implementation of **Jump in the Mix**, a relationship follow-through application for entrepreneurs and small-to-medium businesses.

The core journey is:

```text
Contact → Jump Date → Mix → scheduled Jump → completed follow-up
```

## Fastest local start

Read [START_HERE.md](START_HERE.md), then use the launcher for your operating system:

| Platform | Start | Stop | Reset demo |
|---|---|---|---|
| Windows | `start-local.cmd` | `stop-local.cmd` | `reset-local.cmd` |
| macOS | `start-local.command` | `stop-local.command` | `reset-local.command` |
| Linux | `./start-local.sh` | `./stop-local.sh` | `./reset-local.sh` |

Docker Desktop/Engine is the only prerequisite for the guided local path. The launcher creates local secrets, builds the application, prepares PostgreSQL, seeds a demo workspace, waits for readiness, and opens the browser.

### Guided demo

Click **Open the guided demo** on the sign-in page. Manual fallback:

```text
Email:    demo@jumpinthemix.local
Password: JumpInTheMix123!
```

The demo starts on Plus and includes sample Contacts, Jump Dates, a Mix, reusable Jumps, generated Jump tasks, platform Mix Templates, and account/help content.

## Implemented capabilities

### Core product

- Registration, password login, optional email verification, password recovery, remote session management, request-origin enforcement, and security headers.
- Workspace-derived multi-tenancy with PostgreSQL isolation coverage.
- Complete Contact create/edit flows with multiple emails, phones, addresses, primary selections, Public Notes, Private Notes, Groups, and custom fields.
- Bulk Contact Group changes, Apply Jump, selected CSV export, and archive.
- Custom Jump Date Types with Free/Plus/Pro limits and downgrade-safe inactive records.
- Reusable SMS, email, phone-call, voicemail-script, and WhatsApp Jumps with immutable versions and placeholders.
- Transactional Mix builder with Target Jump Date Type, manual-start, and fixed-date broadcast triggers; Group/all-Contact audiences; ordered Jumps; offsets; and local times.
- Timezone-aware, idempotent lifecycle reconciliation that creates, reschedules, restores, and cancels future Jump tasks while preserving completed history.
- Jump execution page with overdue-plus-today default, Done/Undo/Skip, direct channel actions, filters, action events, and Contact-specific Stop Mix.

### Contact acquisition and integrations

- Local-first CSV and VCF import wizard:

  ```text
  Upload → Map → Dedupe → Review → Import → Summary
  ```

- Structured field mapping, Jump Date import, workspace custom fields, exact and conservative fuzzy matching, explicit merge choices, plan checks, per-row isolation, idempotent retries, and downloadable error CSV.
- Progressive Device Contact Picker / Quick Add with a stable manual fallback, exact-match merge, fuzzy-review hold, capacity preflight, audit, and reconciliation.
- Optional browser voice dictation for Public Notes on the manual create form.
- Plus/Pro one-way Google Contacts integration with encrypted OAuth credentials, selected labels, preview, exact-match merging, incremental cursors, scheduled worker refresh, sync history, reconnect/disconnect, and preserved local Contacts after Google deletion.

### Templates, AI, billing, support, and referrals

- Separate platform and Community Mix Template libraries with human-readable previews, search, Category/Industry filters, Featured/Trending/Popular/Newest ordering, voting, import history, profiles, moderation, and atomic independent Draft imports.
- Plus/Pro AI Mix Wizard with guided preflight, a deterministic built-in strategist, optional strict provider generation, expiring review drafts, refinement, content/privacy validation, and atomic publication into a normal Draft Mix.
- Stripe-hosted Checkout, Customer Portal, server-side success verification, signed raw-body webhook processing, event idempotency, lifecycle reconciliation, and downgrade-safe preservation.
- Searchable Help/FAQ, private threaded support tickets, user replies/reopen, administrator triage and responses, branded email, durable delivery state, and retry controls.
- Referral links, 30-day Plus rewards, verification-aware qualification, 360-day referrer cap, paid-plan banking/handoff, history, sharing controls, and administrator analytics.

### Administration and security

- Production-default administrator MFA with TOTP, encrypted secrets, current-password enrollment confirmation, ten one-time recovery codes, replay protection, rate limits, bounded per-session step-up, and credential-event invalidation.
- Time-limited, audited, view-only administrator support sessions with central mutation rejection.
- Admin overview, User directory, Billing, Support, Mix Templates, Integrations, Referrals, Operations, Audit, and validated System Settings.
- Audited failed-job retry, sanitized provider diagnostics, webhook visibility, allowlisted no-code options/feature flags, and durable worker-heartbeat visibility.

### Operations and validation

- PostgreSQL and Prisma with complete committed migration history.
- Populated-upgrade, PRD-core rollback/reapply, clean-deployment, administrator-control-plane, administrator-MFA, Contact-Group-activation, and worker-heartbeat migration rehearsals.
- AES-256-GCM encrypted backup archives, checksummed manifests, empty-target restoration, critical row-count comparison, relational integrity smoke checks, and automated CI restore rehearsal.
- Separate web/database and worker readiness endpoints, with healthy/stale workers visible in Admin · Operations.
- Explicit production-like staging smoke and a bounded readiness load probe with configurable thresholds and optional operational alerts.
- Background worker for Jump reconciliation, Google Contacts synchronization, and referral entitlement maintenance.
- Unit, static-boundary, PostgreSQL integration, migration, tenancy, authentication, import, Quick Add, Google, Templates, AI, billing, support, referral, administrator, backup/restore, and production-build validation.
- Playwright desktop Chromium and Pixel 7 coverage for sign-in, Jump rendering, Contact acquisition, Quick Add, platform Templates, AI Wizard, support submission, administrator MFA, Admin access, and view-only mutation rejection.

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the exact completion boundary.

## Deliberately remaining

Checked-in implementation and deterministic CI do not replace production qualification. Remaining launch gates include:

- Restore a real encrypted backup in production-like staging and run the application/worker smoke matrix.
- Validate real Google OAuth/People API consent, token refresh, revocation, incremental sync, disconnect, and recovery using isolated provider accounts.
- Validate the complete Stripe test-mode lifecycle, including Checkout, Customer Portal, plan changes, failed payments, duplicate events, cancellation, downgrade, and referral-bank handoff.
- Validate production transactional-email delivery and inbox placement.
- Qualify the Contact Picker on physical Android devices.
- Complete final accessibility, security, alert ownership, load/capacity, privacy, backup-retention, and incident-response reviews.

## Architecture

```text
Browser
  ↓
Next.js web application
  ↓
PostgreSQL ← background worker
                 ├─ Jump reconciliation
                 ├─ Google Contacts sync
                 ├─ referral entitlement reconciliation
                 └─ durable health heartbeat
```

The default Compose stack exposes only the application on `127.0.0.1`. PostgreSQL remains on Docker's private network.

## Developer setup without Docker

Native development requires Node.js 22+ and PostgreSQL 16+.

```bash
cp .env.example .env
# Update DATABASE_URL and generate unique local secrets.
npm install --no-audit --no-fund
npm run setup
npm run dev
```

Start the worker in another terminal:

```bash
npm run dev:worker
```

## Useful commands

```bash
npm run quickstart             # Docker launcher flow
npm run setup                  # Generate Prisma client, create schema, and seed
npm run dev                    # Web application
npm run dev:worker             # Background worker
npm run db:deploy              # Apply committed Prisma migrations
npm run db:rehearse-migration  # All isolated migration rehearsals
npm run db:backup              # Encrypted pg_dump archive plus manifest
npm run db:restore             # Restore into a separate empty database
npm run db:rehearse-restore    # Encrypted backup/restore/relational smoke rehearsal
npm run smoke:staging          # Desktop/mobile production-like staging smoke
npm run load:smoke             # Bounded readiness load probe
npm run db:studio              # Prisma Studio in native development
npm run validate:static        # Schema, syntax, and local-import validation
npm run typecheck              # TypeScript semantic validation
npm test                       # Unit and PostgreSQL integration tests
npm run test:e2e               # Desktop/mobile Playwright tests
npm run build                  # Production Next.js build
npm run check                  # Static, type, unit/integration, and build gate
```

The optional Compose operations image includes PostgreSQL client tools:

```bash
docker compose --profile ops run --rm operations npm run db:backup
```

## Local configuration

The launchers create `.env` from `.env.example` and generate local encryption/rate-limit secrets. Backup automation additionally requires its own `BACKUP_ENCRYPTION_KEY`.

To change the browser port:

```env
APP_PORT=3001
APP_URL=http://localhost:3001
```

After changing `.env`, restart the stack. Rebuild after source changes.

### Administrator MFA

Production defaults to requiring administrator MFA. Configure explicitly:

```env
AUTH_REQUIRE_ADMIN_MFA=true
AUTH_ADMIN_MFA_MAX_AGE_MINUTES=720
DATA_ENCRYPTION_KEY=<unique high-entropy secret>
AUTH_RATE_LIMIT_SECRET=<unique high-entropy secret>
```

See [docs/ADMIN_MFA.md](docs/ADMIN_MFA.md) for enrollment, recovery, migration, and incident procedures.

### Google Contacts

Google Contacts is optional. It requires:

```env
APP_URL=https://your-host.example
DATA_ENCRYPTION_KEY=<unique secret>
GOOGLE_CLIENT_ID=<OAuth web client ID>
GOOGLE_CLIENT_SECRET=<OAuth web client secret>
GOOGLE_REDIRECT_URI=https://your-host.example/api/integrations/google/callback
GOOGLE_SYNC_HOURS=24
```

The redirect URI must exactly match an authorized URI on the Google OAuth client. The background worker must be running for queued and scheduled syncs.

See [docs/GOOGLE_CONTACTS.md](docs/GOOGLE_CONTACTS.md) for deployment and smoke-testing instructions.

### Backup, restore, worker health, and staging

Configure a dedicated backup key and follow [docs/OPERATIONS_READINESS.md](docs/OPERATIONS_READINESS.md). The restore command refuses in-place restoration and requires a separate empty database.

```env
BACKUP_ENCRYPTION_KEY=<dedicated 32-byte key>
BACKUP_DIR=/secure/backups
BACKUP_RETENTION_DAYS=30
WORKER_HEARTBEAT_STALE_SECONDS=90
LOAD_SMOKE_MAX_REQUESTS=5000
```

## Product vocabulary

- **Jump Date Type** — a trigger classification such as Birthday, Anniversary, or a workspace-specific custom type.
- **Jump Date** — one logical trigger date associated with a Contact.
- **Jump** — reusable communication content in authoring views, and the scheduled actionable item on the Jump execution page.
- **Mix** — an ordered sequence of Jumps with targeting and timing rules.
- **My Info** — workspace personalization fields and signatures.
- **My Account** — identity, plan, billing, integrations, referrals, support, sessions, and security controls.

Stable internal names such as `StepTemplate`, `StepVersion`, and `MixStep` remain implementation details and are not customer-facing vocabulary.

## Important behavior

- The current application does not automatically send customer outreach. It opens native SMS, email, phone, WhatsApp, or other configured compose actions.
- Opening a composer is recorded as an action event, not proof of delivery or task completion.
- Completed and skipped Jumps preserve their rendered snapshots.
- Downgrades preserve work and restrict future active usage instead of deleting data.
- Google Contacts is one-way in this release and never deletes a local Contact because it disappeared from Google.
- External integrations require production credentials, provider configuration, and production-like staging validation before handling real customer data.

## Documentation

- [00_START_HERE.txt](00_START_HERE.txt) — shortest nontechnical start instructions.
- [START_HERE.md](START_HERE.md) — detailed local installation path.
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) — implementation boundary and roadmap.
- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — intended product experience.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture direction.
- [docs/CANONICAL_PRODUCT_DECISIONS.md](docs/CANONICAL_PRODUCT_DECISIONS.md) — canonical product and data decisions.
- [docs/MIGRATION_RUNBOOK.md](docs/MIGRATION_RUNBOOK.md) — production migration and restoration procedure.
- [docs/OPERATIONS_READINESS.md](docs/OPERATIONS_READINESS.md) — encrypted backup, restore, worker health, staging smoke, load probe, and alerting.
- [docs/ADMIN_MFA.md](docs/ADMIN_MFA.md) — administrator enrollment, recovery, and security runbook.
- [docs/BROWSER_E2E.md](docs/BROWSER_E2E.md) — desktop/mobile browser coverage and provider boundaries.
- [docs/ADMIN_CONTROL_PLANE.md](docs/ADMIN_CONTROL_PLANE.md) — administrator operations and no-code controls.
- [docs/GOOGLE_CONTACTS.md](docs/GOOGLE_CONTACTS.md) — Google OAuth, sync, and operational runbook.
- [docs/SECURITY.md](docs/SECURITY.md) — implemented and required security controls.
- [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md) — smoke-test checklist.
- [docs/BASE44_MIGRATION.md](docs/BASE44_MIGRATION.md) — historical migration planning.

## Before a public launch

Restore a real encrypted backup in production-like staging; run the application and worker smoke matrix; rerun the checked-in browser suite against staging; complete real Google, Stripe, email, and physical-device qualification; automate backups and alerts; and complete accessibility, security, privacy, incident-response, operational, and load reviews.
