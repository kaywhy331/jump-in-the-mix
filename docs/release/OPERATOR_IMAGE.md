# Release operator image and settings

Build-only S4 contract. Nothing here creates a service or changes production.
Use [release.Dockerfile](../../infra/operations/release.Dockerfile) for the
reviewed private-network operator service. Keep its image immutable for the
approved candidate; a one-off command cannot fetch or switch candidates.

The build requires two named BuildKit contexts, prepared privately from the
reviewed candidate and its **actual web build**, without credentials:

- `release_source`: `smoke-plan.json` (the reviewed plan below) and
  `catalog.bundle`, a Git bundle containing the candidate,
  previous release and approved-main objects and the candidate checkout's HEAD.
  For an ancestor-based candidate, `git bundle create catalog.bundle HEAD`
  includes the previous history; include the existing approved-main ref too if
  it is not reachable. Do not create or move tags to prepare it.
- `release_web`: `candidate-sha` containing the full candidate SHA and `static/`
  containing that web image's complete `.next/static/`. Export this from the
  same build artifact destined for web. An independently rebuilt asset set is
  insufficient: postflight compares every byte and refuses differences.

Build arguments are `RELEASE_CANDIDATE_SHA`, `RELEASE_PREVIOUS_SHA`,
`RELEASE_APPROVED_MAIN_SHA` and `POSTGRES_CLIENT_MAJOR` (default 17).
The PostgreSQL client major must be at least the target server major; backup
records both versions privately and refuses an older client. Docker, client
installation and image execution are NOT RUN on the S3/S4 host; S5 qualifies
this image, including browser launch as the unprivileged `node` user.

The image includes full candidate source and Git objects, Prisma generation,
tsx, Playwright Chromium, axe, Git, PostgreSQL tools, OpenSSL and the AWS CLI.
The public directory comes from candidate Git; static assets come from the web
artifact. The web standalone image and backup-only image do not provide this
complete command environment. Do not install the catalog on a live service as
part of this build-only task.

Configure the reviewed service using its existing protected configuration:

- `DATABASE_URL`: restricted runtime role; operator checks do not alter grants.
- Backup settings from [the catalog](JOB_CATALOG.md), including the separate
  backup credential and encryption settings; migration alone needs the existing
  isolated owner credential. Keep owner credentials out of web and worker.
- `APP_URL` and `JITM_RELEASE_SITE_URL`: the exact reviewed web origin, with no
  path or credentials. Preserve the web application's session, proxy and
  signing settings for authenticated smoke. Do not substitute local defaults
  for production settings.
- `JITM_RELEASE_EXPECTED_CLIENT_IP`: the known operator egress address seen by
  the trusted proxy chain. Smoke verifies both ordinary and forwarded-header
  sign-ins against saved session addresses. A private route that yields no
  verifiable client address must refuse this assertion.
- `JITM_RELEASE_SMOKE_PLAN`: the private, reviewed JSON file copied into the
  immutable operator image at `/var/lib/jitm-release/smoke-plan.json`; format
  below. Review this input with the image and command, which are selected by
  the release approval's jobs digest. Do not replace the plan during a release.
- `JITM_RELEASE_JOB_EVIDENCE_DIR`: a private writable directory (image default
  `/var/lib/jitm-release`); retain evidence before one-off storage disappears.
  Logs contain only the allowlisted receipt or a fixed failure message.

The worker heartbeat reads `RENDER_GIT_COMMIT`, falling back to `JITM_BUILD_SHA`
for a local build. The latter must be populated from the built commit, not the
release request. A missing or invalid value cannot pass `candidate_heartbeat`.

## Example `settings.jobs`

These are placeholders, not real provider IDs or review evidence. Replace them
only during the separately authorized environment setup, and bind the exact
JSON with the approval digest described in [ENVIRONMENT_SPEC.md](ENVIRONMENT_SPEC.md).

```json
{
  "preflight": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node scripts/release/jobs/preflight.mjs","review_ref":"REVIEW_RECORD"},
  "backup": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node scripts/release/jobs/backup.mjs","review_ref":"REVIEW_RECORD"},
  "migrate": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node scripts/release/jobs/migrate.mjs","review_ref":"REVIEW_RECORD","forward_only":true},
  "worker_gate": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node scripts/release/jobs/worker_gate.mjs","review_ref":"REVIEW_RECORD"},
  "postflight": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node scripts/release/jobs/postflight.mjs","review_ref":"REVIEW_RECORD"},
  "smoke": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node --import tsx scripts/release/jobs/smoke.mjs","review_ref":"REVIEW_RECORD"},
  "cleanup": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node scripts/release/jobs/cleanup.mjs","review_ref":"REVIEW_RECORD"},
  "final": {"service_id":"REVIEWED_OPERATOR_SERVICE","command":"node scripts/release/jobs/final.mjs","review_ref":"REVIEW_RECORD"}
}
```

Smoke-plan example (full SHAs and complete paths are supplied for each actual
candidate). `changed_paths` must exactly equal the Git diff; every changed path
must be covered by at least one reviewed browser scenario. Scenarios are
same-origin GET navigation and visible text assertions, never arbitrary code.

```json
{
  "candidate_sha": "CANDIDATE_FULL_SHA",
  "previous_sha": "PREVIOUS_FULL_SHA",
  "review_ref": "REVIEW_RECORD",
  "changed_paths": ["src/app/(app)/jumps/page.tsx"],
  "scenarios": [{"path":"/jumps","selector":"h1","text":"Today","covers":["src/app/(app)/jumps/page.tsx"]}]
}
```

The image/source and scenario review must establish that each scenario actually
exercises its listed change. A text assertion alone is not independent QA.
Do not include real addresses, account identifiers, tokens or secrets in this
file. Both themes' phone screenshots remain in private evidence.

NOT RUN: image build, Render private-network execution, provider calls,
installation on production, and rehearsal h. In particular, whether Render
executes `startCommand` through a shell remains UNVERIFIED until h. The
orchestrator uses `env JITM_RELEASE_CONTEXT=<base64 JSON> <command>` so the image
entrypoint can run it as either a shell command or an argument vector.
