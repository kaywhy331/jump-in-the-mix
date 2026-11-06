# Catalog Docker qualification

S5 runs the unchanged `scripts/release/workflow.mjs` against the Docker pilot
edition (`docker-compose.yml` plus `compose.pilot.yml`) and synthetic provider
transports. It neither dispatches the release workflow nor contacts Render,
production databases, S3 or GitHub APIs. Synthetic publication changes only the
in-memory GitHub ref stub; no real tags, branches or release records are pushed.

From a clean, committed checkout with Docker/Compose and locked dependencies:

```sh
npm ci --no-audit --no-fund
node scripts/release/qualification/stubs.node.mjs
node scripts/release/qualification/run.mjs code
node scripts/release/qualification/run.mjs migration
node scripts/release/qualification/run.mjs reversible
```

The host driver creates isolated local Git candidates, fresh PostgreSQL volumes,
random synthetic credentials and an internal Compose network. It builds web,
worker and the reviewed operator image, supplying the operator with the actual
web image's static assets. Catalog jobs execute as the image's unprivileged user.
The normal database helpers configure the restricted runtime and backup roles;
only the fixture and migration process use the synthetic owner credential.
Provider transport rejects every unrecognized origin and API route. The local
reverse proxy supplies a documented synthetic client address and preserves
forwarded-header history; it does not manufacture application security headers.

The AWS command stub substitutes the storage boundary only. PostgreSQL capture,
recovery-state export, authenticated encryption and manifest verification are
real. The stub persists each object without overwrite and computes `head-object`
checksums by rereading stored bytes. This qualifies the catalog's storage contract,
not real offsite durability or AWS access. For the stale-backup case, a preload
changes only the capture subprocess's clock; the parent uses the real freshness
check and must reject the old authenticated manifest.

| Case | Required result |
|---|---|
| Code-only, additive migration | Reach synthetic publish, zero unresolved operations, clean synthetic rows |
| Count drift | Final refuses changed customer-table counts |
| Stale backup | Backup refuses an old authenticated capture |
| Reversible migration | Migrate refuses destructive SQL before applying it |
| Recovery hold | Preflight refuses the held database |
| Leftover synthetic row | Final refuses a reserved marker in a volatile table despite unchanged counts |
| Lost provider response | One job executes, its ID is lost, ledger remains unresolved, no second job or publication |
| Failed browser smoke | Smoke fails, its finally cleanup and standalone workflow cleanup remove all synthetic rows |

Reports bind results to the real checked-out SHA and each synthetic candidate.
Private diagnostics, ledger fixtures and browser captures stay under `.artifacts/`.
The branch-only qualification workflow retains only synthetic reports and phone
screenshots, with seven-day artifact retention. It has `contents: read`, no
environment or configured secrets, and actions pinned to full commit SHAs.
The binding venue decision is Hub note `note_8c3fa4587f3c05b4`; this temporary
workflow must be excluded from later landing unless a separate decision keeps it.

The synthetic approval and provider responses are test inputs, not owner approval,
tier-3 evidence, or deployed-provider facts (JITM-12 §2.1–2.6). The catalog keeps
its real assertions, including browser checks in both themes, the known client
address, signed errors, cookie lifetime, schema/grant checks and row digests.
Whole-catalog independent QA remains a separate coordinator-owned step.

NOT RUN by this harness: production/Render calls, real offsite durability,
production installation, release and rehearsal h. In particular, whether Render
runs `JITM_RELEASE_CONTEXT=<base64> <command>` through a shell remains unverified;
the Docker stub explicitly uses `sh -c` and does not prove that provider behavior.
