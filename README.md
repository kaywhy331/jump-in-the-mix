# Jump in the Mix — Independent Application

A portable, self-hosted implementation of **Jump in the Mix**, a relationship follow-through application for entrepreneurs and small-to-medium businesses.

The implemented core journey is:

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

The demo starts on Plus and includes sample Contacts, Jump Dates, a Mix, reusable Jumps, and generated Jump tasks.

## Implemented capabilities

### Core product

- Problem-first public landing page.
- Registration, login, optional email verification, password recovery, and remote session management.
- Hashed opaque sessions, database-backed authentication throttles, request-origin enforcement, and security headers.
- Immutable workspace ownership and tested tenant isolation.
- Complete Contact create/edit flows with multiple emails, phones, addresses, primary selections, Public Notes, Private Notes, Groups, and custom fields.
- Bulk Contact Group changes, Apply Jump, CSV export, and archive.
- Custom Jump Date Types with Free/Plus/Pro limits and downgrade-safe inactive records.
- Reusable SMS, email, phone-call, voicemail-script, and WhatsApp Jumps with immutable versions and placeholders.
- Transactional Mix builder with date, manual-start, and fixed-date broadcast triggers; Group/all-Contact audiences; ordered Jumps; offsets; and local times.
- Timezone-aware, idempotent lifecycle reconciliation that creates, reschedules, restores, and cancels future Jump tasks while preserving completed history.
- Jump execution page with overdue-plus-today default, Done/Undo/Skip, direct channel actions, filters, action events, and Contact-specific Stop Mix.
- View-only, time-limited, audited administrator support sessions.

### Contact acquisition

- Local-first CSV and VCF import wizard:

  ```text
  Upload → Map → Dedupe → Review → Import → Summary
  ```

- Structured field mapping, Jump Date import, workspace custom fields, exact and conservative fuzzy matching, explicit merge choices, plan checks, per-row isolation, idempotent retries, and downloadable error CSV.
- Plus/Pro Google Contacts integration with encrypted OAuth credentials, selected Google labels, preview, exact-match merging, incremental sync, daily worker refresh, sync history, reconnect/disconnect, and preserved local Contacts after Google deletion.

### Operations and validation

- PostgreSQL and Prisma with complete committed migration history.
- Clean-database and populated-legacy migration rehearsals in CI.
- Background worker for Jump reconciliation and Google Contacts synchronization.
- User-visible sync history and administrator Google integration diagnostics.
- Unit, static-boundary, PostgreSQL integration, migration, tenancy, authentication, import, Google sync, and production-build validation.

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the exact completion boundary.

## Deliberately remaining

The following are not represented as complete:

- Stripe Checkout, signed webhook reconciliation, Customer Portal, downgrade selection, and production Price IDs.
- Platform/community Mix Templates with moderation, voting, profiles, sharing limits, and atomic import.
- Final four-question provider-backed AI Mix Wizard and AI Assistant.
- Device Contact Picker / Quick Add polish.
- Referral rewards, Help/FAQ, support tickets, and the broader admin control plane.
- WhatsApp Assistant account linking and verified webhook operations.
- Automated encrypted backups, full observability, load testing, and production-like launch review.

## Architecture

```text
Browser
  ↓
Next.js web application
  ↓
PostgreSQL ← background worker
                 ├─ Jump reconciliation
                 └─ Google Contacts sync
```

The default Compose stack exposes only the application on `127.0.0.1`. PostgreSQL remains on Docker’s private network.

## Developer setup without Docker

Native development requires Node.js 22+ and PostgreSQL 16+.

```bash
cp .env.example .env
# Update DATABASE_URL and generate unique local secrets.
npm install
npm run setup
npm run dev
```

Start the worker in another terminal:

```bash
npm run dev:worker
```

## Useful commands

```bash
npm run quickstart          # Docker launcher flow
npm run setup               # Generate Prisma client, create schema, and seed
npm run dev                 # Web application
npm run dev:worker          # Background worker
npm run db:deploy           # Apply committed Prisma migrations
npm run db:studio           # Prisma Studio in native development
npm run validate:static     # Schema, syntax, and local-import validation
npm run typecheck           # TypeScript semantic validation
npm test                    # Unit and PostgreSQL integration tests
npm run build               # Production Next.js build
npm run check               # Full local quality gate
```

## Local configuration

The launchers create `.env` from `.env.example` and generate local encryption/rate-limit secrets.

To change the browser port:

```env
APP_PORT=3001
APP_URL=http://localhost:3001
```

After changing `.env`, restart the stack. Rebuild after source changes.

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

## Product vocabulary

- **Jump Date Type** — a trigger classification such as Birthday, Anniversary, or a workspace-specific custom type.
- **Jump Date** — one logical trigger date associated with a Contact.
- **Jump** — reusable communication content in authoring views, and the scheduled actionable item on the Jump execution page.
- **Mix** — an ordered sequence of Jumps with targeting and timing rules.
- **My Info** — workspace personalization fields and signatures.
- **My Account** — identity, plan, integrations, sessions, and future billing/support controls.

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
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) — actual implementation boundary and roadmap.
- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — intended product experience.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture direction.
- [docs/CANONICAL_PRODUCT_DECISIONS.md](docs/CANONICAL_PRODUCT_DECISIONS.md) — canonical product and data decisions.
- [docs/MIGRATION_RUNBOOK.md](docs/MIGRATION_RUNBOOK.md) — production migration and restoration procedure.
- [docs/GOOGLE_CONTACTS.md](docs/GOOGLE_CONTACTS.md) — Google OAuth, sync, and operational runbook.
- [docs/SECURITY.md](docs/SECURITY.md) — implemented and required security controls.
- [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md) — smoke-test checklist.
- [docs/BASE44_MIGRATION.md](docs/BASE44_MIGRATION.md) — historical migration planning.

## Before a public launch

Restore a real encrypted backup in production-like staging; execute the application and worker smoke matrix; complete browser-driven authorization tests; require administrator MFA; validate transactional-email delivery; configure and test provider credentials; automate backups and alerts; complete accessibility, security, privacy, and operational reviews; and load-test realistic Contact and reconciliation volumes.
