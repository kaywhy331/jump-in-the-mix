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

Local tests: `node --test scripts/release/jobs/__tests__/*.node.mjs`.
The integration test requires `RELEASE_TEST_ADMIN_URL` pointing to a local
PostgreSQL fixture; it creates and drops only its own `jitm_design_release_*`
database and dedicated temporary role, and uses synthetic rows only.

NOT RUN: Docker-edition end-to-end qualification (S5), operator image/settings
installation (S4), Render and production calls, and rehearsal h. In particular,
whether Render interprets the `JITM_RELEASE_CONTEXT=<base64> <command>` prefix
through a shell remains unverified; the orchestrator format is unchanged.
