# Release job catalog

S1 provides `node scripts/release/jobs/preflight.mjs` and
`node scripts/release/jobs/final.mjs`. These are operator-image commands, not
application startup commands. No job is installed or qualified on Render yet.
The receipt format remains the contract in [ENVIRONMENT_SPEC.md](ENVIRONMENT_SPEC.md).

The image must contain the clean candidate checkout, its Git objects and the
previous and approved-main commits, dependencies, and the existing scripts.
`JITM_RELEASE_CONTEXT` comes from the orchestrator. Each command validates the
step, identities, exact required checks, binding, timestamp and count baseline.
Only a completed successful command prints one allowlisted receipt; failures
exit nonzero with fixed diagnostics and no receipt. Subprocess output stays
private. `DATABASE_URL` must select the runtime role in the public schema.

Preflight verifies the candidate binding and tracked source, reads the previous
schema directly from Git, checks its database columns/enums and applied migration
checksums, and allows only candidate migrations as additions. It runs the existing
runtime qualification without `--apply` and reads the persistent recovery hold.
Final additionally requires every candidate migration and schema object.

The count digest is SHA-256 of sorted `[table, decimal-count]` pairs for the
previous schema's model tables. The operational exclusions and all catalog
defaults live in `scripts/release/jobs/settings.mjs`. New tables, if present,
must be empty. Reads use a repeatable-read, read-only transaction. Legitimate
concurrent changes to counted customer records refuse the release too; investigate
and obtain a new baseline, never adjust a digest to hide drift.

S3 must assign every synthetic row an ID beginning with the shared
`syntheticPrefix`, including rows without cascading ownership. Final scans every
public text column for that reserved prefix, refuses the shared `probeTaskPrefix`
in Job tasks, active AuthRateLimit blocks, and Job failures since release start.
These marker contracts are deliberately shared with the future smoke/cleanup
commands; they do not claim discovery of arbitrary unmarked test data.

S2 adds `node scripts/release/jobs/backup.mjs` and
`node scripts/release/jobs/migrate.mjs`. Backup calls the existing encrypted
backup-to-S3 command and accepts its stored result only for this database, a
capture made during this invocation, and the complete three-object bundle.
That existing command verifies S3 head-object SHA-256, length and AES256 before
returning; only the encrypted archive digest enters the catalog receipt.
The existing S3 settings and backup encryption key remain in the operator
environment. `BACKUP_DATABASE_URL` optionally selects the backup connection;
it must name the same database as `DATABASE_URL`.
Before capture, the command reads `pg_dump --version` and the database's
`server_version_num`, and refuses if the client major is older than the server.
`JITM_RELEASE_JOB_EVIDENCE_DIR` is required: the operator mounts a private evidence
directory there. Numeric versions and the comparison result are written as
`<operation_id>.backup-versions.json` with private file permissions, including
on a mismatch; the public receipt format is unchanged. S5 must provide a client
at least as new as its PostgreSQL server. The current backup Dockerfile's client
16 cannot qualify this host's PostgreSQL 17 fixture. Per the coordinator's
S2 correction, full backup capture is NOT RUN here; no client is installed or
downloaded. The wrapper unit tests and existing local S3 proof suite cover S2.

Migration requires `MIGRATION_DATABASE_URL` for the existing owner wrapper and
`BACKUP_DATABASE_URL` for a real read-only grant check with the backup credential.
The catalog grants no additional backup permissions: missing new-table SELECT
or sequence SELECT fails the job. Configure the reviewed backup principal's
default privileges before the release. Runtime permissions are rechecked after
the existing owner wrapper applies migrations and runtime grants.

The initial forward-only gate accepts appended migrations containing CREATE
TABLE, CREATE [UNIQUE] INDEX over named columns, or ALTER TABLE ADD COLUMN for
nullable columns. No defaults, function expressions, foreign keys, CHECKs,
procedural blocks, copies, destructive operations or unknown SQL are accepted.
This conservative language needs an explicit reviewed extension for other
additive DDL; it never guesses from `forward_only: true`. Existing migration
hashes must be unchanged. Objects must be absent before execution and present
afterwards, the full candidate schema/history must pass, and baseline counts
must remain equal. A partial or already applied attempt refuses; resolve the
operation through the release ledger before any further migration attempt.

Local tests: `node --test scripts/release/jobs/__tests__/*.node.mjs`.
The integration test requires `RELEASE_TEST_ADMIN_URL` pointing to a local
PostgreSQL fixture; it creates and drops only its own `jitm_design_release_*`
database and dedicated temporary role, and uses synthetic rows only.
The migration fixture makes a private temporary Git repository with a synthetic
additive candidate; it exercises the real owner wrapper and checks backup grants,
new objects, count drift, repeated execution and destructive SQL refusal.

NOT RUN: Docker-edition end-to-end qualification (S5), operator image/settings
installation (S4), Render and production calls, and rehearsal h. In particular,
whether Render interprets the `JITM_RELEASE_CONTEXT=<base64> <command>` prefix
through a shell remains unverified; the orchestrator format is unchanged.
