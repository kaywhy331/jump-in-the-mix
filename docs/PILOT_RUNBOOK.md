# Single-user pilot runbook

This runbook operates the private, single-user release candidate. The pilot profile runs PostgreSQL, migrations/setup, web, and worker only. It does not enable demo accounts, payment, Google, external AI, teams, invitations, or subscriptions.

## Prerequisites

- Docker with Compose v2
- Node.js 22 or newer for the `npm run pilot:*` commands
- A current browser
- Local disk space for the PostgreSQL volume and encrypted backups
- A host account and filesystem that only the pilot owner can access

Clone the repository, check out the intended release tag or reviewed commit, and install the locked JavaScript dependencies:

```bash
npm ci --no-audit --no-fund
```

## Environment creation

Recommended:

```bash
npm run pilot:init
```

This creates an ignored `.env` with unique database, rate-limit, data-encryption, and backup-encryption secrets. It refuses to overwrite an existing `.env`, creates no application account, and prints no secret.

For manual configuration, copy `.env.example` to `.env`, set `NODE_ENV=production`, `PILOT_MODE=true`, `DEMO_MODE=false`, and replace every `GENERATE_ME` placeholder. Keep `APP_URL` on loopback unless a qualified TLS reverse proxy and access controls are in place. Never reuse secrets between installations or commit `.env`.

## First-run owner setup

Start the installation:

```bash
npm run pilot:up
```

Open `http://127.0.0.1:3000/register`. Create the private owner account with a unique password of at least 12 characters, then confirm the timezone during onboarding. The registration transaction is serializable and only succeeds while the database contains no user. After the first owner exists, `/register` shows a closed state and direct registration attempts are rejected.

No default login is generated. Pilot setup does not seed the development demo account.

## Routine operations

```bash
npm run pilot:up       # validate configuration, start, and check health
npm run pilot:down     # stop containers; preserve the database volume
npm run pilot:status   # show running and completed services
npm run pilot:logs     # follow bounded recent service logs
npm run pilot:health   # readiness, worker heartbeat, and migration status
```

The pilot project is named `jump-in-the-mix-pilot`. Its default persistent database volume is `jump-in-the-mix-pilot_jitm_postgres`. PostgreSQL has no host port. The web port is published on `127.0.0.1` only.

The completed `setup` container should show exit code 0. PostgreSQL, web, and worker should be healthy. Treat restart loops, a failed setup container, a non-ready endpoint, or pending migrations as a blocking condition.

## Encrypted backup

```bash
npm run pilot:backup
```

The operations container creates an AES-256-GCM encrypted archive and adjacent manifest in `.backups`. The backup command verifies a stable database snapshot and writes a checksum. Store copies outside the application host using an access-controlled destination. A local encrypted file is not an offsite backup.

Keep `BACKUP_ENCRYPTION_KEY` separately protected. Losing that key makes the archive unrecoverable; exposing it defeats the archive's confidentiality.

## Safe restore rehearsal

Restore never overwrites the live database. Create a separate, empty PostgreSQL database, set `RESTORE_DATABASE_URL` in `.env` to that target without putting credentials on the command line, then run:

```bash
npm run pilot:restore -- jump-in-the-mix-TIMESTAMP.jitm-backup.enc --confirm=RESTORE
```

The archive and its `.manifest.json` file must both be inside `.backups`. Restore verifies the checksum, decrypts into a temporary directory, refuses an in-place or nonempty target, restores required extensions, and compares the restored database to the manifest. Promoting a restored database is a separate operator-controlled recovery step; test and document that cutover before depending on it.

## Upgrade

1. Review the target release and its migration notes.
2. Pull or check out the reviewed source or image reference.
3. Run `npm run pilot:upgrade`.
4. The command creates an encrypted backup before rebuilding.
5. It runs committed migrations, recreates web and worker, and verifies readiness, worker health, and migration state.
6. Exercise Today, Contacts, Mixes, and one Jump completion.
7. Retain the pre-upgrade backup until validation succeeds.

Do not bypass a failed backup, migration, readiness, or worker check.

## Troubleshooting

- **Compose reports a missing variable:** run `npm run pilot:init` for a new installation or replace the named placeholder in `.env`.
- **Setup exits nonzero:** inspect `npm run pilot:logs`; do not start creating records until migration errors are resolved.
- **Web is unhealthy:** run `npm run pilot:health` and inspect web logs. Confirm `APP_URL` and the three required secrets.
- **Worker is unhealthy:** confirm setup and web are healthy, then inspect worker logs for an unrecognized task or database error.
- **Port 3000 is occupied:** change `APP_PORT` and set `APP_URL` to the matching loopback URL.
- **Password recovery email is unavailable:** no email provider is included in the pilot. Preserve an authenticated session and use the in-account password controls; do not enable a provider casually.
- **Restore refuses the target:** use a different, empty database. In-place restore is deliberately unsupported.

## Complete removal warning

`npm run pilot:down` preserves data. Commands such as `docker compose down -v`, `docker volume rm`, and global Docker prune operations can permanently destroy the pilot database. Do not run them unless the exact volume has been identified, a recent encrypted backup has been restored successfully, and permanent deletion is intended.

## Security responsibilities

- Keep the web service loopback-only unless qualified TLS and authentication boundaries are deployed.
- Patch the host, Docker, browser, and application dependencies.
- Protect `.env`, backups, exports, screenshots, and logs as sensitive personal data.
- Review `SECURITY.md` before reporting a vulnerability.
- Never put real Contact or relationship content in a public issue.
- Verify backups and rehearse restore regularly.
- Use a password manager and a unique owner password.

## Browser support and known limitations

Current Chromium desktop/mobile automation passes in CI, but physical iPhone/Android handoffs, Safari/Firefox coverage, VoiceOver, TalkBack, mobile keyboards, safe areas, touch reordering, and 200%/400% zoom still require the manual matrix in `docs/MANUAL_DEVICE_QUALIFICATION.md`. Do not describe an unperformed row as passed.

This release candidate is intended for a small private pilot, not public internet exposure or general production certification.
