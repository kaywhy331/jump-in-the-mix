# Database release checks

The web service and worker must use a database that supports their packaged code. A successful `SELECT 1` does not establish that. Each build now carries a generated manifest of its required migration checksums, model columns, PostgreSQL types, arrays and enum labels.

## Release steps

1. Build web and worker from the same reviewed revision. `npm run db:generate` generates both Prisma and the release manifest. `npm run build` regenerates the manifest before bundling it into the standalone web package. The manifest is derived output, not a file to edit or commit.
2. Follow any migration-specific pause requirements first. The import recovery migration requires [stopping and draining older workers](WORKER_RECOVERY_QUALIFICATION.md#upgrade-from-older-import-code). Take the qualified backup, then run `npm run db:deploy` once from the release environment. The Render web service already uses this pre-deploy command. The worker does not run migrations.
3. Run `npm run db:verify-release` against the target database. It prints a bounded status and counts and exits unsuccessfully unless migration history and schema match. It makes no data changes and always requires migration history, including when run locally.
4. Check `/api/health/ready` and `/api/health/worker`. An unready database prevents web readiness. A new persistent worker waits for up to five minutes, checks every two seconds, and reports no heartbeat or claims until ready. It then rechecks every 30 seconds between work. A background invocation checks before its first heartbeat or maintenance work.
5. Verify a real synthetic customer journey and the intended release on both services. Schema readiness complements the runtime, permission, provider and rollback checks; it does not replace them.

The continuous worker exits after an unsuccessful startup wait or a failed later release check so its supervisor can restart it. SIGTERM/SIGINT during startup exits cleanly without recording a healthy heartbeat. After startup, normal in-flight work still follows its existing lease and shutdown rules. Readiness does not retract a request already in flight.

Migration `20260909130000_workspace_history_erasure` deletes only existing orphan rows from `ContactGroupState`, `JumpActionEvent`, `MixBroadcastSchedule` and `MixStop`, then adds workspace foreign keys with cascading deletion/update. Back up first and allow a maintenance window for table locks and validation. Workspace deletion now erases these historical records and rejects later writes to the deleted workspace. Its local populated rehearsal verifies preserved owned rows, orphan removal, cascades and late-write rejection. Recovery correction additionally verifies the actual validated cascade constraints before it can erase accounts; migration history alone is insufficient for that operation. See [Recovery restrictions](RECOVERY_RESTRICTIONS.md).

## What is checked

- A persistent application recovery hold is checked before migration metadata. Any database-wide hold value prevents readiness and worker startup, even if a session or role overrides its effective setting. See [Restore recovery](RESTORE_RECOVERY.md); a successful archive restore deliberately remains held.
- Every required migration has a completed, non-rolled-back record with the exact SQL checksum. Conflicting successful duplicates are rejected. An unfinished migration holds readiness, including a newer migration.
- Required model columns exist with the expected scalar/enum PostgreSQL type and array shape. Required enum labels exist in the application schema. These are bounded catalog reads, not customer-row scans.
- Extra completed additive migrations and extra fields are allowed when the older release's requirements remain valid. This permits compatible rolling deployment; it does not establish that an arbitrary old application can safely roll back after a destructive migration.
- Metadata queries have database and transaction time limits. Unavailable or unreadable metadata fails closed. A migration history reaching the 2,000-row bound requires investigation instead of a partial success claim.
- The current application check targets its `public` schema, matching the intended Render database. The inspection helper accepts an explicit validated schema for controlled checks. This does not add general multi-schema application support.

In development/test, a database created with `db:push` may run without migration history if its full required shape exists. Production always requires history; the worker container explicitly runs with `NODE_ENV=production`. If history exists in development, incomplete or conflicting records still fail. No production bypass flag exists.

The check does not compare every constraint/index, inspect customer rows, establish write privileges for every operation, or prove that web and worker contain the same application commit. Use migration/rollback rehearsals, real account operations, the deployment revision records and backup foreign-key/content verification for those gates. Never repair a checksum by editing the history table just to turn health green.

## Investigating a failure

| Status from the private CLI | Next action |
| --- | --- |
| `recovery-held` | Keep the recovery target isolated. Archive verification alone does not permit reopening; follow the recovery runbook. Do not clear the setting or apply migrations merely to turn health green. |
| `missing-history` | Verify the target database. Use the documented baseline/migration process for an existing database; do not run a destructive reset. |
| `pending-migrations` | Apply this release's reviewed migrations, then verify again. |
| `migration-in-progress` | Check the migration runner and private migration logs. Resolve a failed migration through Prisma's documented process after investigating its actual database state. |
| `migration-mismatch` | Compare the deployed artifact with the original migration SQL. Restore immutable migration files or prepare a corrective migration; do not rewrite successful history. |
| `schema-mismatch` | Investigate missing/changed database objects and the actual migration outcome. Keep new code out of service until the required schema is restored. |
| `unavailable` | Check connectivity, metadata-read permissions, timeouts and the history bound. No raw database error or connection string is returned by the public health endpoint. |

The public readiness response reports only configuration/database categories. Full schema names, migration names/checksums and private database errors stay out of it. `CI=true` does not disable production configuration validation. A local production-build rehearsal may use the explicitly validated loopback pilot configuration; that does not qualify a public host or its sender setup.

Local PostgreSQL tests exercise interrupted/rolled-back/mismatched migration records, duplicate checksums, schema drift, development compatibility, read permissions, a real worker held behind a migration and shutdown while waiting. CI generates and verifies the manifest after its migration step. The intended Render deployment and container execution still need actual environment qualification.
