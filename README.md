# Jump in the Mix — Independent MVP

A portable, self-hosted starter for **Jump in the Mix**, a relationship follow-up application for entrepreneurs and small-to-medium businesses.

The current runnable MVP covers the core journey:

```text
Contact → Important Date → Mix → Jump → completed follow-up
```

## Fastest path: no terminal setup

Read [START_HERE.md](START_HERE.md), then use the launcher for your operating system:

| Platform | Start | Stop | Reset demo |
|---|---|---|---|
| Windows | `start-local.cmd` | `stop-local.cmd` | `reset-local.cmd` |
| macOS | `start-local.command` | `stop-local.command` | `reset-local.command` |
| Linux | `./start-local.sh` | `./stop-local.sh` | `./reset-local.sh` |

Only Docker Desktop/Engine is required. Start with `00_START_HERE.txt`. The launcher creates local secrets, builds the application, prepares PostgreSQL, seeds a safe demo workspace, waits for readiness, and opens the browser.

### Guided demo

Click **Open the guided demo** on the sign-in page. Manual fallback:

```text
Email:    demo@jumpinthemix.local
Password: JumpInTheMix123!
```

The demo starts on the Plus plan and includes sample contacts, Important Dates, a Mix, and Jumps, so a reviewer can experience the product before configuring anything.

## What is runnable now

- Problem-first public landing page
- Account registration and email/password sign-in
- Secure opaque server-side sessions
- Workspace ownership foundation
- One-screen onboarding with a skip option
- Guided local demo with one-click entry
- Dashboard with first-win checklist
- Contact list, search, creation, detail, and archive actions
- Important Dates attached to contacts
- Starter Mix creation
- Plus/Pro-gated AI Mix Wizard preflight with deterministic message generation
- Mix activation and assignment to contacts
- Background Jump generation and reconciliation
- Today, Upcoming, Past, and Completed Jump views
- Native SMS, email, phone, and WhatsApp deep links
- User-confirmed Jump completion and skip states
- Free, Plus, and Pro limits enforced in server actions
- Responsive desktop/mobile experience
- PostgreSQL schema prepared for integrations, billing, sharing, auditing, and future teams
- Health checks, Docker build, one-command setup, diagnostics, tests, and static validation

## Designed but not yet connected

The schema and product specifications include these modules, but their live API routes and complete UI are not part of this runnable core starter yet:

- Stripe Checkout, webhooks, and Customer Portal
- Google Contacts and Microsoft Contacts OAuth/sync
- WhatsApp assistant webhooks and account linking
- CSV mapping/import flow
- Natural-language Quick Capture
- Shared Mix browsing/publishing
- Groups and referral workflow UI
- Website/Zapier inbound webhooks
- Administration dashboard
- Email verification, password reset, and production rate limiting

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the exact cut line. The other specification documents describe the intended completed product and should be treated as the implementation roadmap.

## Local Docker architecture

```text
Browser
  ↓
Next.js web app
  ↓
PostgreSQL ← background worker
```

The default Compose stack exposes only the app on `127.0.0.1`. PostgreSQL remains inside Docker’s private network, which avoids local port conflicts and accidental network exposure.

## Developer setup without Docker

Docker is recommended. Native development requires Node.js 22+ and PostgreSQL 16+ already running.

```bash
cp .env.example .env
# Update DATABASE_URL for your local PostgreSQL instance.
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
npm run quickstart          # Starts the Docker flow through the platform launcher
npm run setup               # Generate Prisma client, create schema, and seed
npm run dev                 # Run the web app
npm run dev:worker          # Run the background worker
npm run db:studio           # Open Prisma Studio in native development
npm run validate:static     # Validate Prisma schema, source syntax, and local imports
npm run typecheck           # TypeScript semantic validation
npm test                    # Unit tests
npm run build               # Production Next.js build
npm run check               # Full local quality gate
```

## Local configuration

External integrations can remain blank while testing the core application. The launchers create `.env` from `.env.example` and generate `DATA_ENCRYPTION_KEY` automatically.

To change the browser port:

```env
APP_PORT=3001
APP_URL=http://localhost:3001
```

After changing `.env`, restart:

```bash
./stop-local.sh
./start-local.sh
```

After changing application source code, rebuild the local images:

```text
Windows: rebuild-local.cmd
macOS:   rebuild-local.command
Linux:   ./start-local.sh --rebuild
```

## Product vocabulary

- **Important Date** — a contact date such as Follow-up, Renewal, Birthday, or Event. Internally represented by `JumpDate`.
- **Mix** — a follow-up plan containing ordered communication Steps.
- **Step** — an email, SMS, call, voicemail, or WhatsApp template.
- **Jump** — one generated action for one contact at one scheduled time.

## Important MVP behavior

- The core MVP does **not** automatically send customer outreach. It opens the user’s native messaging/calling app.
- “Sent” is user-confirmed in the current MVP, not carrier-confirmed delivery.
- Completed Jumps preserve message snapshots.
- Downgrades should preserve data; creation above a plan limit is restricted rather than deleting records.
- External integrations must be implemented and security-reviewed before importing real customer data.

## Validation performed on this delivery

The project was validated with:

- Prisma schema validation through Prisma’s schema WASM package
- TypeScript semantic type checking
- Unit tests for placeholders and deterministic Mix generation
- Next.js production build
- Source syntax and local-import validation

The local Docker runtime could not be launched inside the artifact environment because Docker itself is unavailable there. The platform launch scripts and Compose configuration are included for validation on a Docker-enabled computer.

## Documentation

- [00_START_HERE.txt](00_START_HERE.txt) — shortest nontechnical start instructions
- [START_HERE.md](START_HERE.md) — detailed nontechnical installation path
- [EASY_START_RELEASE_NOTES.md](EASY_START_RELEASE_NOTES.md) — installation and first-run improvements
- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — product requirements and intended experience
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — target architecture
- [docs/AMBIGUITIES_RESOLVED.md](docs/AMBIGUITIES_RESOLVED.md) — canonical product decisions
- [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md) — smoke-test checklist
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) — actual build status and roadmap
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — planned integration contracts
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment direction
- [docs/SECURITY.md](docs/SECURITY.md) — security requirements
- [docs/BASE44_MIGRATION.md](docs/BASE44_MIGRATION.md) — migration planning

## Before a public launch

Generate and review a committed Prisma migration, implement the production integration routes, add password recovery and email verification, enable rate limiting, automate encrypted backups, complete an accessibility/security review, and test the full stack on staging with production-like credentials.
