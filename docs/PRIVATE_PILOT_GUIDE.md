# Private pilot guide

This guide controls the first small, single-user pilot of Jump in the Mix. The immutable software candidate is `v0.1.0-rc.2`, resolving to commit `e08e1d35a197f9c13d12e44f492c30637457c098`.

This is a release candidate, not a general-production certification. As of July 23, 2026, enrollment is blocked because the owner has not selected a license, supplied the required physical-device inventory, identified the pilot cohort, or configured the private product-feedback destination. Do not invite participants until every enrollment gate below is signed off.

## Supported pilot scope

The pilot supports one owner using Today, Contacts, Important Dates, Quick Add, Mixes, Templates, CSV/VCF imports, personal settings, and personal data controls. The runtime consists only of PostgreSQL, setup/migrations, web, and worker.

The pilot does not include billing, paid tiers, subscriptions, teams, invitations, workspace switching, organizations, Stripe, Google provider integration, external AI providers, or referral rewards.

## Enrollment gate

The pilot coordinator must record all of the following before issuing an invitation:

- [ ] The owner-selected license is committed, reviewed, and merged.
- [ ] The participant has received the applicable pilot terms.
- [ ] Physical iPhone Safari qualification is complete.
- [ ] Physical Android Chrome qualification is complete.
- [ ] No P0 or P1 issue remains unresolved.
- [ ] Every P2 issue is fixed or has written owner acceptance and a workaround.
- [ ] A basic screen-reader pass and the manual accessibility checks are recorded.
- [ ] The private product-feedback destination is operating and has been tested.
- [ ] A two-to-five-person cohort is identified by pseudonym.
- [ ] A fresh encrypted pre-onboarding backup exists.
- [ ] A restore rehearsal from a retained backup has passed.
- [ ] `v0.1.0-rc.2` still resolves to the approved commit.

An unchecked item blocks enrollment. Emulation and automated browser coverage do not replace the two physical-device gates.

## System requirements

- Docker with Compose v2
- Node.js 22 or newer
- A current browser on a supported physical device
- Local storage for PostgreSQL and at least seven encrypted backups
- A host account and filesystem controlled by the pilot owner
- A separately protected backup-encryption key

Keep the web service loopback-only unless a separately qualified TLS and access-control boundary is provided. PostgreSQL must not be published to the host.

## Install the immutable candidate

Clone the repository, fetch tags, and verify the immutable release before installing:

```bash
git fetch --tags
git switch --detach v0.1.0-rc.2
git rev-parse HEAD
npm ci --no-audit --no-fund
npm run pilot:init
npm run pilot:up
```

The resolved commit must be `e08e1d35a197f9c13d12e44f492c30637457c098`. `pilot:init` creates an ignored `.env` with unique secrets, does not create an account, and does not print credentials.

## First-run owner setup

Open `http://127.0.0.1:3000/register`, create a unique owner password of at least 12 characters, and select the personal timezone. Registration is available only while no user exists and closes after the first owner is created. No predictable demo credentials are created.

Run the following before entering relationship data:

```bash
npm run pilot:status
npm run pilot:health
```

PostgreSQL, web, and worker must be healthy; setup must have exited successfully; readiness and worker health must report ready; and no migration may be pending.

## Routine operation

```bash
npm run pilot:up
npm run pilot:status
npm run pilot:logs
npm run pilot:health
npm run pilot:down
```

`pilot:down` stops the pilot containers but preserves the PostgreSQL volume. It is not a data-removal command.

## Backup and restore

Create an encrypted backup before onboarding, before every upgrade, and daily while the pilot contains active data:

```bash
npm run pilot:backup
```

Retain at least seven recent successful backups and one known-good pre-upgrade backup. Validate each manifest and checksum. Keep the encryption key separately from backup files. Backups must never be attached to GitHub issues or committed to Git.

Restore only into a separate empty database configured through `RESTORE_DATABASE_URL`:

```bash
npm run pilot:restore -- jump-in-the-mix-TIMESTAMP.jitm-backup.enc --confirm=RESTORE
```

The operator must verify the manifest, checksum, migration count, required extensions, and representative records before relying on the backup. Local backups are not disaster recovery. Until durable external storage is qualified, maintain a manually controlled encrypted copy on a second storage location.

The pre-enrollment workstation checkpoint on July 23, 2026 created `.backups/jump-in-the-mix-20260723T174441143Z.jitm-backup.enc` and retained its adjacent manifest. A fresh, separate restoration database passed checksum, manifest, extension, representative-record, and 16-migration validation the same day. The encrypted file and restoration database are retained; this local rehearsal does not certify offsite recovery.

## Upgrade policy

Every distributed update must use a new immutable RC tag. Never move an existing tag.

1. Review the focused change and release notes.
2. Create and verify an encrypted backup.
3. Check out the new immutable tag.
4. Run `npm ci --no-audit --no-fund`.
5. Run `npm run pilot:upgrade`.
6. Verify setup, migrations, readiness, and worker health.
7. Exercise Today, Contacts, Mixes, and one Jump completion.
8. Retain the previous backup and release checkout until validation succeeds.

## Privacy and feedback

Never send Contact names, phone numbers, email addresses, Customer Notes, Private Relationship Updates, prepared messages, import files, exports, databases, backups, credentials, or unredacted screenshots through a public GitHub issue.

The private product-feedback destination is **NOT CONFIGURED**. The owner must place a tested private email address, private form, private repository, or private issue tracker in `docs/PILOT_FEEDBACK_WORKFLOW.md` before enrollment. GitHub private vulnerability reporting remains the correct route for security issues; it is not a substitute for a private product-support channel.

## Data removal

1. Create and verify a final encrypted backup when retention is desired.
2. Export any owner data that must be retained.
3. Run `npm run pilot:down`.
4. Identify the exact pilot Compose project and PostgreSQL volume.
5. Obtain explicit owner confirmation that permanent deletion is intended.
6. Remove only the identified pilot containers and volume using documented Docker commands.
7. Delete local `.env`, exports, and backups only when their retention period has ended and deletion is intentional.

Do not use a global Docker prune. Removing the PostgreSQL volume is irreversible without a valid backup.

## Known limitations

- Physical iPhone, physical Android, screen-reader, keyboard-only, high-zoom, safe-area, mobile-keyboard, native-composer, and touch-reordering qualification remains manual.
- The installation is local/self-hosted and loopback-bound by default.
- No email provider is included for password recovery.
- Backups are local until the owner configures a controlled second storage location; offsite disaster recovery is not certified.
- The owner-selected license and private feedback channel remain enrollment blockers.

Confirmed issues and gate status are maintained in `docs/PILOT_KNOWN_ISSUES.md`. Detailed operating commands are in `docs/PILOT_RUNBOOK.md`.
