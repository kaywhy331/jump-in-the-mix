# Production migration and restoration runbook

This runbook covers the first committed Prisma migration history for Jump in the Mix.

## Why the first migration contains a no-op baseline

The independent MVP historically created databases with `prisma db push`. Existing deployments therefore contain the schema represented by `main`, but do not contain Prisma migration history. The migration sequence is intentionally:

1. `20260715000000_existing_mvp_baseline` — no-op marker for the existing MVP schema.
2. `20260716020000_prd_core_foundation` — guarded additive migration for the PRD core features.

A populated MVP database must mark the no-op baseline as applied **once** before the first migration-based deployment. Prisma otherwise correctly refuses to deploy into a non-empty database without migration history. After the baseline is resolved, `prisma migrate deploy` applies the guarded forward migration. The forward migration uses idempotent additions so a preview database that already received selected fields through `db push` can still enter migration history safely.

Greenfield/local installations continue to use `npm run db:setup` until a future release replaces the historical bootstrap with a complete empty-database baseline.

## Objects added or changed

- `Contact.privateNotes`.
- `MixStep.isActive` and `MixStep.updatedAt`.
- Active-sequence ordering index replacing the legacy unique sort-position index.
- `AuthRateLimit`.
- `MixStop`.
- `JumpActionType` and `JumpActionEvent`.
- `MixBroadcastSchedule`.
- `AdminImpersonation`.

The migration does not rename or drop existing business tables.

## Mandatory pre-deployment gates

1. Run the complete CI pipeline successfully.
2. Run `npm run db:rehearse-migration` against an isolated PostgreSQL database.
3. Take an encrypted logical backup with `pg_dump`.
4. Restore that backup into a separate database and complete an application smoke test against the restored copy.
5. Record row counts for `User`, `Workspace`, `Contact`, `Mix`, `MixStep`, and `Jump`.
6. Pause the background worker and prevent application writes during the deployment window.
7. Confirm the deployment uses the same PostgreSQL major version rehearsed in CI.

## Staging rehearsal

```bash
npm install --no-audit --no-fund
npm run db:generate
npm run db:rehearse-migration
```

The rehearsal creates an isolated schema, provisions the legacy `main` schema, inserts representative populated records, resolves the historical baseline, applies the forward migration, validates data preservation and new objects, executes the pre-traffic reverse SQL, and reapplies the forward migration. It drops the isolated schema when complete.

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

After deployment, restart the web application first and the worker second.

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
SELECT COUNT(*) FROM "Mix";
SELECT COUNT(*) FROM "MixStep";
SELECT COUNT(*) FROM "Jump";
```

Application smoke tests:

- Sign in with an existing user.
- Open Contacts, one Contact, Jumps, Mixes, Settings, and My Account.
- Update a non-production test Contact and confirm reconciliation completes.
- Create and end an administrator view-only session.
- Confirm an impersonated POST request is rejected with HTTP 403.
- Confirm the worker can claim and complete one reconciliation job.

Compare the recorded row counts with the pre-deployment values. Expected changes should be limited to deliberate smoke-test writes and normal job/audit records.

## Rollback and restoration policy

Prisma Migrate does not provide automatic down migrations. Production rollback is therefore **backup restoration**, not an attempt to edit a successfully applied migration record in place.

### Automated rehearsal and isolated staging

The reviewed reverse SQL is stored at:

```text
prisma/migrations/20260716020000_prd_core_foundation/rollback.sql
```

It is exercised automatically in an isolated schema to prove that the additive changes can be removed while legacy records remain readable. It refuses to restore the legacy MixStep uniqueness rule when duplicate sort positions exist.

### Production

If a launch-blocking problem is discovered before or after traffic reaches the new schema:

1. Stop application and worker writes.
2. Restore the validated pre-deployment backup into a clean database or schema.
3. Point the application and worker at the restored database.
4. Run the pre-migration application version.
5. Verify row counts and critical workflows before reopening traffic.

Do not run the reverse SQL on an active production database after users have created new-schema data. The new tables may contain security events, action history, stops, broadcast schedules, or support-view audit information that cannot be represented in the legacy schema.

Document:

- Backup identifier.
- Restore target and completion time.
- Last accepted application write.
- Any reconciliation jobs that require replay.
- User-facing incident communication.

## Completion criteria

The migration work package is complete only when:

- Both migration records finish without `rolled_back_at`.
- Existing Contact, Mix, MixStep, and Jump rows remain readable.
- Existing MixStep rows have `isActive = true` and a non-null `updatedAt`.
- The legacy `MixStep_mixId_sortOrder_key` index is absent after forward migration.
- `MixStep_mixId_isActive_sortOrder_idx` exists.
- Every newly added table is writable through its application service.
- The rollback rehearsal and forward reapplication pass automatically.
- A real backup has been restored successfully in staging.
- Production smoke tests and row-count comparisons pass.
