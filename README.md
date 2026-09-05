# Jump in the Mix

Jump in the Mix is a phone-first follow-up CRM for owner-operated small businesses. It prepares the texts, calls, and emails that keep estimates moving, customers cared for, and a business top of mind for repeat work and referrals.

The primary product is a hosted free beta. A Docker-based, single-owner edition remains available as a secondary privacy-oriented option. The active product contract is [docs/CANONICAL_PRODUCT_DECISIONS.md](docs/CANONICAL_PRODUCT_DECISIONS.md).

## What is included

- Today: prepared follow-ups, completion outcomes, snooze, and undo
- Contacts: live search, notes and timeline, saved dates, archive/restore, and duplicate review
- Plans: vertical ready-made plans and a simple custom-plan builder
- Quick Add and resumable CSV/VCF imports
- Business profile, scheduling preferences, digests, Web Push, sessions, spreadsheet/JSON export, and account deletion
- Optional, review-window-protected email/SMS delivery and review/referral requests
- PostgreSQL-backed persistence, a background worker, health checks, and encrypted backup/restore tooling

The free beta does not include billing, paid tiers, teams, Google Contacts sync, Stripe, an AI plan wizard, or signup-reward referrals.

## Hosted deployment

For Netlify, use [docs/NETLIFY_DEPLOYMENT.md](docs/NETLIFY_DEPLOYMENT.md), which covers Next.js, scheduled background processing, PostgreSQL, and the publish checks.

The hosted topology is one web service, one worker service, and PostgreSQL. The checked-in deployment blueprint provisions that topology and runs committed migrations before the web release. See [docs/HOSTED_DEPLOYMENT.md](docs/HOSTED_DEPLOYMENT.md) for required secrets, DNS/provider setup, rollback, and smoke checks.

Hosted production requires HTTPS, verified transactional email, strong unique secrets, and provider credentials for each enabled sign-in or delivery option. `PILOT_MODE` and `DEMO_MODE` must both be false.

## Self-hosted requirements

- Docker with Docker Compose v2
- Node.js 22 or newer for the convenience commands
- A supported current desktop or mobile browser
- Enough local disk space for PostgreSQL data and encrypted backups

PostgreSQL is not published to the host in the pilot profile. The web application binds to `127.0.0.1` by default. Web and worker containers run as the non-root `node` user.

## Start a self-hosted installation

```bash
npm ci --no-audit --no-fund
npm run pilot:init
npm run pilot:up
```

`pilot:init` creates an ignored `.env` with unique random secrets. It never creates an account or prints credentials. Open `http://127.0.0.1:3000/register` and create the one owner account. Registration closes after that owner is created.

To configure values manually, copy `.env.example` to `.env`, set `NODE_ENV=production`, `PILOT_MODE=true`, `DEMO_MODE=false`, and replace every `GENERATE_ME` value. Then start the profile with:

```bash
docker compose -f docker-compose.yml -f compose.pilot.yml up -d --build
```

Unsafe or missing pilot secrets stop setup with field-level errors. Never commit `.env`.

## Operations

```bash
npm run pilot:status
npm run pilot:logs
npm run pilot:health
npm run pilot:backup
npm run pilot:down
```

Restore and upgrade are intentionally guarded:

```bash
npm run pilot:restore -- backup-file.jitm-backup.enc --confirm=RESTORE
npm run pilot:upgrade
```

A restore requires an adjacent manifest and a separately configured, empty `RESTORE_DATABASE_URL`; in-place restore is blocked. An upgrade creates an encrypted backup before rebuilding or migrating. See [the pilot runbook](docs/PILOT_RUNBOOK.md) before operating real relationship data.

The operator owns backup retention and must test restoration. Local encrypted files are not offsite backups.

## Development and validation

The existing development Compose profile remains available through `npm run quickstart`. It is separate from the pilot project and may enable explicitly labeled demo-only behavior.

```bash
npm run check
npm run test:e2e
npm run db:rehearse-restore
npm run security:audit
```

CI validates migrations, source boundaries, TypeScript, unit/integration tests, the production build, encrypted backup/restore, browser workflows, and production/worker images. Automated coverage does not replace the outstanding physical-device and screen-reader qualification recorded in [the manual device matrix](docs/MANUAL_DEVICE_QUALIFICATION.md).

## Security and privacy

Hosted accounts are isolated by workspace in PostgreSQL. In the self-hosted edition, data remains in the operator-controlled environment. Keep a self-hosted installation loopback-only unless you can provide TLS, host hardening, access controls, monitoring, and tested recovery. See [the security model](docs/SECURITY.md) for controls and private reporting guidance.

Never post Contact data, relationship notes, databases, backups, screenshots containing personal data, or credentials in a public GitHub issue.

## License

No open-source license has been selected yet. Source availability does not by itself grant reuse rights. The repository owner should choose a license before inviting redistribution; common options include MIT (permissive), Apache-2.0 (permissive with an express patent grant), or a proprietary license for a closed pilot.
