# Production migration and restoration runbook

This runbook covers the committed Prisma migration history and the operational backup/restore path for Jump in the Mix.

## Migration sequence

The independent MVP historically created databases with `prisma db push`. Existing deployments therefore contain the schema represented by `main`, but do not contain Prisma migration history. The repository now commits the complete `main` schema as a portable Prisma baseline followed by independent forward migrations:

1. `20260715000000_existing_mvp_baseline` — complete schema represented by `main`, generated through `prisma migrate diff`.
2. `20260716020000_prd_core_foundation` — guarded additive migration for the PRD core features.
3. `20260716170000_mix_template_library` — Community and platform Mix Template metadata, profiles, votes, and import-version history.
4. `20260716210000_support_center` — threaded Help and support tickets.
5. `20260717010000_referral_rewards` — referral accounts, attribution, and reward lifecycle records.
6. `20260717050000_admin_control_plane` — validated platform settings used by the administrator control plane.
7. `20260717070000_admin_mfa` — encrypted administrator TOTP credentials, recovery-code hashes, replay counters, and per-session step-up records.
8. `20260717120000_contact_group_activation` — preserved active/inactive Contact Group state used by plan-downgrade selection and Jump reconciliation.
9. `20260717140000_worker_heartbeat` — durable worker heartbeat and readiness diagnostics.

A populated MVP database must mark the complete baseline as applied **once** before the first migration-based deployment. Prisma otherwise correctly refuses to deploy into a non-empty database without migration history. After the baseline is resolved, `prisma migrate deploy` applies every remaining forward migration in order.

A clean database does not resolve anything manually: `prisma migrate deploy` executes the complete baseline followed by all forward migrations. CI regenerates the baseline from `main` and byte-compares it with the committed SQL to prevent drift.

## Objects added or changed by forward migrations

### PRD core

- `Contact.privateNotes`.
- `MixStep.isActive` and `MixStep.updatedAt`.
- Active-sequence ordering index replacing the legacy unique sort-position index.
- `AuthRateLimit`.
- `MixStop`.
- `JumpActionType` and `JumpActionEvent`.
- `MixBroadcastSchedule`.
- `AdminImpersonation`.

### Mix Template library

- `SharedMixMetadata`.
- `SharedMixContributorProfile`.
- `SharedMixVote`.
- `SharedMixImportMetadata`.

### Help and support

- `SupportTicket`.
- `SupportTicketMessage`.
- Support category, priority, status, author, and email-state enums.

### Referral rewards

- `ReferralAccount`.
- `Referral`.
- `ReferralReward`.
- Referral attribution, recipient, and reward-state enums.

### Administrator control plane

- `PlatformSetting`.
- Unique setting-key index.
- Category/key and public/key lookup indexes.

### Administrator MFA

- `AdminMfaCredential`.
- `AdminMfaSession`.
- Enabled-credential and session-expiry lookup indexes.

### Contact Group activation

- `ContactGroupState`.
- One durable active/inactive state per Group.
- Workspace/active-state lookup index.
- Missing state is interpreted as active for compatibility with existing Groups; the application writes explicit state when a Group is created, selected, or deactivated by a downgrade.

### Worker health

- `WorkerHeartbeat`.
- One durable row per worker process, including start time, last-seen time, last-job time, and running/stopped state.
- Running-state/last-seen and last-seen lookup indexes.
- `/api/health/worker` readiness derived from the newest running heartbeat.

The forward migrations do not rename or drop existing business tables.

## Mandatory pre-deployment gates

1. Run the complete CI pipeline successfully.
2. Run `npm run db:rehearse-migration` against an isolated PostgreSQL database.
3. Run `npm run db:rehearse-restore` with PostgreSQL client tools installed.
4. Take an encrypted logical backup with `npm run db:backup` during a write freeze.
5. Restore that exact archive into a separate empty database and run `npm run db:smoke-restored`.
6. Record row counts for `User`, `Workspace`, `Contact`, `Group`, `ContactGroupState`, `Mix`, `MixStep`, `Jump`, `SupportTicket`, `Referral`, `PlatformSetting`, `AdminMfaCredential`, `AdminMfaSession`, and `WorkerHeartbeat`.
7. Pause the background worker and prevent application writes during the deployment window.
8. Confirm the deployment uses the same PostgreSQL major version rehearsed in CI.
9. Confirm `DATA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `AUTH_RATE_LIMIT_SECRET`, `AUTH_REQUIRE_ADMIN_MFA`, and the administrator step-up age are configured in the deployment secret manager.
10. Follow `docs/OPERATIONS_READINESS.md` for worker readiness, staging smoke, alerting, and bounded load checks.

## Automated rehearsals

```bash
npm install --no-audit --no-fund
npm run db:generate
npm run db:rehearse-migration
npm run db:rehearse-restore
```

`db:rehearse-migration` runs the populated/clean migration rehearsal followed by independent administrator-control-plane, administrator-MFA, and worker-heartbeat rehearsals.

`db:rehearse-restore` creates a temporary database, captures an encrypted custom-format dump, restores it, compares migration history and critical row counts, verifies core relationships, proves transaction read/write/rollback behavior, and removes the temporary database.

### Populated MVP upgrade

1. Creates an isolated schema from the legacy `main` Prisma model through `db push`.
2. Inserts representative User, Workspace, Contact, Contact Group, reusable Jump, Mix, and MixStep data.
3. Resolves the committed complete baseline as already applied.
4. Applies every forward migration.
5. Verifies legacy data, new columns, new tables, indexes, and migration history.
6. Writes representative security, support-thread, qualified-referral, and inactive Contact Group state records.
7. Executes the reviewed pre-traffic reverse SQL for the PRD-core migration.
8. Validates legacy readability and reapplies the PRD-core migration while later independent migrations remain present.

### Clean database deployment

1. Creates a second empty schema.
2. Runs `prisma migrate deploy` with no manual baseline resolution.
3. Verifies the complete MVP schema and all forward-migration objects exist.
4. Verifies every required migration record completed successfully.

### Administrator control-plane rehearsal

1. Creates an isolated empty schema.
2. Runs every committed migration.
3. Verifies `20260717050000_admin_control_plane` completed without rollback.
4. Verifies `PlatformSetting` exists.
5. Writes and reads a durable JSON feature flag.
6. Removes the isolated schema.

### Administrator MFA rehearsal

1. Creates another isolated empty schema.
2. Runs every committed migration.
3. Verifies `20260717070000_admin_mfa` completed without rollback.
4. Verifies `AdminMfaCredential` and `AdminMfaSession` exist.
5. Writes an enabled credential with a replay counter and recovery-code hash.
6. Writes a bounded session step-up and reads both records back.
7. Removes the isolated schema.

### Worker-heartbeat rehearsal

1. Creates an isolated empty schema.
2. Runs every committed migration.
3. Verifies `20260717140000_worker_heartbeat` completed without rollback.
4. Verifies `WorkerHeartbeat` exists.
5. Writes and reads a running heartbeat with JSON metadata.
6. Removes the isolated schema.

All isolated schemas and temporary rehearsal databases are removed when the rehearsals finish.

## First production deployment for an existing MVP database

During the write-frozen deployment window:

```bash
export DATABASE_URL='postgresql://...'
npm install --no-audit --no-fund
npm run db:generate
npx prisma migrate resolve --applied 20260715000000_existing_mvp_baseline
npm run db:deploy
```

Run the `migrate resolve` command only for a populated database that has never entered Prisma migration history. If the baseline is already present in `_prisma_migrations`, run only `npm run db:deploy`.

Do not run `prisma db push` against a populated production database during this release.

After deployment, restart the web application first, verify `/api/health/ready`, then start the worker and verify `/api/health/worker`.

## Clean installation

For a new empty production database:

```bash
export DATABASE_URL='postgresql://...'
npm install --no-audit --no-fund
npm run db:generate
npm run db:deploy
npm run db:seed
```

The baseline creates the complete MVP schema and the forward migrations add the approved PRD functionality.

## Post-deployment verification

Run the following checks before reopening writes:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;

SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('Contact', 'MixStep')
  AND column_name IN ('privateNotes', 'isActive', 'updatedAt');

SELECT COUNT(*) FROM "Contact";
SELECT COUNT(*) FROM "Group";
SELECT COUNT(*) FROM "ContactGroupState";
SELECT COUNT(*) FROM "Mix";
SELECT COUNT(*) FROM "MixStep";
SELECT COUNT(*) FROM "Jump";
SELECT COUNT(*) FROM "SupportTicket";
SELECT COUNT(*) FROM "Referral";
SELECT COUNT(*) FROM "PlatformSetting";
SELECT COUNT(*) FROM "AdminMfaCredential";
SELECT COUNT(*) FROM "AdminMfaSession";
SELECT COUNT(*) FROM "WorkerHeartbeat";

SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND table_name IN (
    'SharedMixMetadata',
    'SupportTicket',
    'SupportTicketMessage',
    'ReferralAccount',
    'Referral',
    'ReferralReward',
    'PlatformSetting',
    'AdminMfaCredential',
    'AdminMfaSession',
    'ContactGroupState',
    'WorkerHeartbeat'
  )
ORDER BY table_name;
```

Application smoke tests:

- Confirm `/api/health/ready` reports the database as connected.
- Confirm `/api/health/worker` reports a current running worker heartbeat.
- Sign in with an existing non-production user.
- Open Contacts, Quick Add fallback, one Contact, Jumps, Mixes, Settings, Templates, Help, and My Account.
- Update a non-production test Contact and confirm reconciliation completes.
- Create more Contact Groups than the current plan allows, choose the active set, and confirm inactive memberships remain visible but unavailable for new assignments.
- Deactivate a Group used by an active Mix and confirm future incomplete group-derived Jumps are canceled while the Group membership and Mix assignment remain stored.
- Reactivate that Group and confirm eligible future Jumps return without duplicate history.
- Enroll one non-production platform administrator in TOTP MFA and securely record the recovery codes.
- Sign in again and verify that Admin requires a fresh code or one-time recovery code.
- Open Admin · Overview, Operations, Audit, and System Settings.
- Confirm Admin · Operations displays the running worker heartbeat.
- Save and reset one non-production platform setting and confirm an audit record appears.
- Retry one deliberately failed test job and confirm it is reclaimed by the worker.
- Create an administrator view-only session and confirm a real browser POST is rejected with HTTP 403.
- End the view-only session and confirm normal administrator context returns.
- Open a referral link in a separate browser profile, register and qualify a test account, and confirm both reward records.
- Open Admin · Referrals and confirm the qualified attribution is visible.

Compare the recorded row counts with the pre-deployment values. Expected changes should be limited to deliberate smoke-test writes, worker heartbeats, and normal job/audit records.

## Rollback and restoration policy

Prisma Migrate does not provide automatic down migrations. Production rollback is therefore **backup restoration**, not an attempt to edit a successfully applied migration record in place.

### Automated rehearsal and isolated staging

The reviewed PRD-core reverse SQL is stored at:

```text
prisma/migrations/20260716020000_prd_core_foundation/rollback.sql
```

It is exercised automatically in an isolated schema to prove that the additive PRD-core changes can be removed while legacy records remain readable. It refuses to restore the legacy MixStep uniqueness rule when duplicate sort positions exist. Later independent migrations remain applied during this isolated exercise so their data-preservation behavior is also tested.

Encrypted backup and restore commands are documented in `docs/OPERATIONS_READINESS.md`. Restore commands refuse to target `DATABASE_URL` directly and refuse non-empty target databases.

### Production

If a launch-blocking problem is discovered before or after traffic reaches the new schema:

1. Stop application and worker writes.
2. Restore the validated pre-deployment encrypted archive into a clean database.
3. Point the application and worker at the restored database.
4. Run the pre-migration application version.
5. Verify row counts, web readiness, worker readiness, and critical workflows before reopening traffic.

Do not run reverse SQL on an active production database after users have created new-schema data. New tables may contain security events, action history, stops, schedules, support conversations, template contributions, referral rewards, platform settings, MFA credentials, MFA session state, Contact Group activation choices, or worker diagnostics that cannot be represented in the legacy schema.

Document:

- Backup archive and manifest identifiers.
- Restore target and completion time.
- Last accepted application write.
- Any reconciliation jobs that require replay.
- MFA credentials enrolled after the backup and administrators who must re-enroll.
- User-facing incident communication.

## Completion criteria

The migration and restoration work package is complete only when:

- The committed baseline exactly matches the schema represented by `main`.
- Both clean and populated deployment rehearsals pass.
- Independent administrator-control-plane, administrator-MFA, and worker-heartbeat rehearsals pass.
- Every required migration record finishes without `rolled_back_at`.
- Existing Contact, Group, Mix, MixStep, and Jump rows remain readable.
- Existing MixStep rows have `isActive = true` and a non-null `updatedAt`.
- The legacy `MixStep_mixId_sortOrder_key` index is absent after forward migration.
- `MixStep_mixId_isActive_sortOrder_idx` exists.
- Every newly added table is writable through its application service or rehearsal write.
- The support thread, referral reward, platform-setting, MFA, Contact Group activation, and worker-heartbeat writes pass automatically.
- The PRD-core rollback rehearsal and forward reapplication pass automatically.
- Encrypted backup creation, authenticated decryption, restore, row-count comparison, relational smoke, and cleanup pass automatically.
- A real encrypted backup has been restored successfully in production-like staging.
- Administrator MFA and view-only mutation smoke tests pass on the deployed origin.
- Web and worker readiness endpoints remain healthy through the deployment smoke window.
- Production smoke tests and row-count comparisons pass.
