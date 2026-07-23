# Jump in the Mix

Jump in the Mix is a single-user relationship follow-through application. It helps one person remember relationship context, prepare follow-ups, complete Jumps, organize Contacts, and build repeatable Mixes without turning the experience into a team CRM.

This repository is currently a `v0.1.0-rc.1` release candidate for a small private pilot. It is not generally production-certified.

## What is included

- Today: prepared follow-up actions, completion outcomes, snooze, and undo
- Contacts: live search, relationship notes and timeline, Important Dates, archive/restore, and duplicate review
- Mixes and Templates: manual action authoring, explicit audiences, workload review, and reusable templates
- Quick Add and resumable CSV/VCF imports
- Personal profile, scheduling preferences, sessions, data export, and account deletion
- PostgreSQL-backed persistence, a background worker, health checks, and encrypted backup/restore tooling

The active product does not include billing, pricing tiers, subscriptions, teams, invitations, workspace switching, Google integration, Stripe, external AI providers, or referral rewards. Some historical database structures remain dormant to avoid unsafe migration churn.

## Pilot requirements

- Docker with Docker Compose v2
- Node.js 22 or newer for the convenience commands
- A supported current desktop or mobile browser
- Enough local disk space for PostgreSQL data and encrypted backups

PostgreSQL is not published to the host in the pilot profile. The web application binds to `127.0.0.1` by default. Web and worker containers run as the non-root `node` user.

## Start a private pilot installation

```bash
npm ci --no-audit --no-fund
npm run pilot:init
npm run pilot:up
```

`pilot:init` creates an ignored `.env` with unique random secrets. It never creates an account or prints credentials. Open `http://127.0.0.1:3000/register`, create the one owner account, and confirm the timezone during onboarding. Registration closes after that owner is created.

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

Data remains in the operator-controlled PostgreSQL environment. Keep the application loopback-only unless you can provide TLS, host hardening, access controls, monitoring, and tested recovery. See [SECURITY.md](SECURITY.md) for private reporting guidance.

Never post Contact data, relationship notes, databases, backups, screenshots containing personal data, or credentials in a public GitHub issue.

## License

No open-source license has been selected yet. Source availability does not by itself grant reuse rights. The repository owner should choose a license before inviting redistribution; common options include MIT (permissive), Apache-2.0 (permissive with an express patent grant), or a proprietary license for a closed pilot.
