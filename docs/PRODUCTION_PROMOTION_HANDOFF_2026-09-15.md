# Production promotion hand-off: 472356d to jumpinthemix.com (Render)

> Historical promotion record. The [September 16 qualification receipt](PR78_QUALIFICATION_2026-09-16.md) supersedes the pending-authorization and qualification statements below. The [production-promotion decision packet](PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md) supplies the current gates, worker-first deployment order, and conditional rollback safeguards. No production promotion is authorized; the earlier commands are historical, not instructions to execute.

Written 2026-09-16 02:25 UTC (evening of 2026-09-15 Pacific) by the Trix session that ran the migration step with Kevin. Uncommitted working note; the next agent decides whether it becomes part of a release record.

## Status in one line

The production database is migrated to the 472356d schema and verified with the runtime role. **472356d was deployed to both services at 02:30–02:35 UTC on 2026-09-16 and rolled back to 8402618 by 02:39 UTC** because the new proxy answered 503 on every non-public route, including sign-in. Both services are live on 8402618 again and healthy on the migrated schema. Root cause is established below; a code fix is required before any re-promotion.

## Authorization

- Earlier on 2026-09-15 Kevin set a standing hold: #77 is the complete documentation closeout; no more closeout PRs, no re-checks, no redeploy of the test site merely to align SHAs.
- Later on 2026-09-15 Kevin instructed: "deploy it to the main domain jumpinthemix.com". That authorizes this production promotion only. It does not reopen the test-site hold, the hosted recovery hold check, the device matrix, or #75.
- Kevin ran the owner migration job himself in a Render ephemeral shell; the agent prepared the job and verified it, and has not held the owner database credential or the GitHub token.

## Topology facts (verified 2026-09-16)

| Item | Value |
|---|---|
| Customer site | https://jumpinthemix.com, served by Render (`x-render-origin-server: Render`), Cloudflare in front |
| Web service | `jump-in-the-mix-web`, `srv-dagt93lbedkc738552o0`, Oregon, plan 0.5c-512mb, tracks `main`, auto-deploy off |
| Worker service | `jump-in-the-mix-worker`, `srv-dagta4uq1p3s738rnlr0`, Oregon, plan 0.5c-512mb, tracks `main`, auto-deploy off |
| Live deploy on both | commit `840261884697ed60d9df658d8c648a63ab1d5549` (8402618, merge of PR #50), deployed 2026-09-10 09:13 UTC |
| Netlify project `jump-in-the-mix` (43280ec7…) | NOT the customer site: no custom domain, no published deploy, no `DATABASE_URL`. The Netlify test site (8fd20ccd…) is separate and unchanged. |
| Backup cron | `jump-in-the-mix-backup` daily at 10:17 UTC (infra/operations/render-backup.yaml). Freshness was NOT independently verified by the agent before the migration; Kevin proceeded. Render reports point-in-time recovery available (docs/PRODUCT_COMPLETION.md). |

## Target revision

- Commit `472356df3779e06f1a2bf3e3e1b7959c456e5fc0` (472356d), head of `codex/production-release-checkpoint`, merge of PR #77.
- Runtime inputs (`src`, `prisma`, `scripts`, `package.json`, `package-lock.json`, `next.config.ts`, `render.yaml`, `netlify.toml`, `netlify/`, `public/`) are byte-identical to b2a9e73, the revision qualified on the Netlify test site as deploy 6aa99626d303505e51d13d2d. The diff is docs, one staging spec and the staging Playwright config.
- `package-lock.json` is unchanged since the live commit 8402618; `package.json` only gained two script entries.
- GitHub archive of the commit: gzip sha256 `2a6c6a182249723d25fce4394ff5535302263b7b904424b71afb6941bdfa9789`; decompressed tar sha256 `c313969fa294368e7b547f17f1f5549d50587b99cf78629fe70b16a5e0d90d97`, which equals a local `git archive --format=tar --prefix=kaywhy331-jump-in-the-mix-472356df3779e06f1a2bf3e3e1b7959c456e5fc0/ 472356d`.
- 8402618 is an ancestor of 472356d. `origin/main` (4615ade) is NOT an ancestor of 472356d (main carries its own earlier merge commit), so main cannot fast-forward; deploy by commit id instead of touching main.
- CI evidence on the same trees: validate runs 35020143588 (c5fdea5) and 35005610615 (18274de) passed the populated migration/rollback/reapply rehearsal, the test-database migration deploy, and the backup/restore rehearsal.

## Migration step: DONE

Ran by Kevin on 2026-09-16 at about 02:20 UTC in `render ssh srv-dagt93lbedkc738552o0 --ephemeral --plan 1c-2g --confirm` (prompt `render@jump-in-the-mix-web-shell:~/project/src$`). The job script (sha256 `8a263f5e1842f5db8f6dd2bb01272ff3daed4626f0a2c0369cc5423b346de92d`) downloaded the commit tarball with a read-only GitHub token, verified the tar checksum above, ran `npm ci --include=dev` (564 packages) and `npm run db:generate` ("Schema release prepared: 60 migrations, 103 models"), then `node scripts/migrate-with-owner.mjs` with `MIGRATION_DATABASE_URL` supplied transiently at a no-echo prompt.

Receipt, verbatim:

```
{"status":"migrated-and-runtime-verified","role":"jitm_runtime","tables":103,"historyReadOnly":true}
job directory removed
```

Migrations applied by this job (the 12 present in 472356d and absent from 8402618; all additive, no DROP, no DELETE, no NOT NULL column without DEFAULT):

```
20260910120000_marketing_scenario_continuity
20260911090000_appointment_buffer
20260911160000_mix_step_planned_at
20260913090000_jump_snoozed_until
20260913120000_jump_base_scheduled_at
20260914090000_jump_drafts
20260914150000_jump_draft_detached
20260914160000_jump_attempts
20260915090000_appointment_bindings
20260915120000_appointment_outcomes
20260916090000_step_timing_anchor
20260917090000_preparation_variants
```

Live site right after the migration (2026-09-16 02:24 UTC): `/api/health/live` 200, `/api/health/ready` 200 (`database: ready`, `configuration: valid`), `/api/health/worker` 200, homepage 200. The old code tolerates the newer migrations because the release check only requires its own packaged migrations to be complete.

## Deploy step: RUN, FAILED IN SERVICE, ROLLED BACK (2026-09-16)

Timeline (UTC), from Render's deploy records and probes from TrixBot:

| Time | Event |
|---|---|
| 02:30:07 | Web deploy `dep-dakvubuk1f9s73d76jbg` at 472356d created; pre-deploy passed (runtime-role receipt `boundary:true, ready:true, tables 103`, verify-release, catalog seed) |
| 02:33:33 | Web 472356d live. `/api/health/live` 200, `/api/health/ready` 200, homepage 200 with the new headline; `/faq`, `/for/contractors`, `/follow-up-templates`, `/features/follow-up-reminders` 200; `/for/not-a-profession` 404; all 13 referenced `/_next/static/` assets 200 |
| 02:33:51 onward | Every non-public route answered 503 in about 150 ms from the proxy's recovery check: `/login`, `/today`, `/contacts`, `/settings`, `/app`, `/api/health/worker` → `{"error":"Jump in the Mix is temporarily unavailable. Please try again later."}`, `Retry-After: 60`. `/api/health/recovery-boundary` itself answered `{"status":"clear"}` in 170 ms from outside |
| 02:34:13 | Worker deploy `dep-dal009ad0e5s7382ggv0` at 472356d created; live 02:35:30 (the cancel attempt came after it finished). It ran about three minutes on the migrated schema |
| 02:35:57 | Web rollback `dep-dal0138ae00c73f2q1ng` to 8402618 created; live 02:39:08 |
| 02:37:33 | Worker rollback `dep-dal01r8ae00c73f2snmg` to 8402618 created; live 02:38:49 |
| 02:40 | `/login` 200, `/api/health/ready` 200, `/api/health/worker` 200 |

Customer impact: sign-in and all signed-in routes were unavailable for about five and a half minutes (02:33:33 to 02:39:08 UTC). Public pages stayed up throughout. Logs of the four CLI runs are in the ignored `.artifacts/render-promotion-2026-09-15/`.

## Root cause (from code; not yet reproduced locally)

PR #70 (in b2a9e73 and 472356d) changed `src/proxy.ts` from calling `databaseRecoveryStatus()` (a direct database read of the recovery hold) to `recoveryBoundaryStatus(request)` in `src/lib/recovery-boundary-client.ts`, which fetches `new URL(recoveryBoundaryPath(), request.nextUrl.origin)` and returns "unavailable" on any error or non-OK response; the proxy then fails closed with 503.

In the Next.js 16.3.4 standalone server, the request URL the proxy sees is built as `${protocol}://${fetchHostname}:${port}${req.url}` (`node_modules/next/dist/server/next-server.js`, the `initURL` assignment near line 1280), where `fetchHostname` is the configured `HOSTNAME` (`0.0.0.0` on Render, from render.yaml) and `protocol` is `https` whenever the incoming `x-forwarded-proto` contains `https`, which Render's proxy sets. So on Render the proxy fetched `https://0.0.0.0:10000/api/health/recovery-boundary`: a TLS handshake against the plaintext listener, which fails immediately. That matches the 150 ms 503 and the absence of any probe request in Render's request logs during the window. On Netlify the request origin is the public HTTPS origin, so the same code works there (#64 evidence); local tests and the dev server run plain HTTP, so they pass. The Render topology was never exercised by the test-site qualification.

Reproduce before fixing: run the standalone build locally with `HOSTNAME=0.0.0.0 PORT=10000` and send a request to `/login` with `x-forwarded-proto: https`; expect the same 503.

## Fix direction (needs Kevin's go-ahead; no code has been changed)

- In `recoveryBoundaryStatus`, use the direct database read (`databaseRecoveryStatus()`) whenever `RECOVERY_BOUNDARY_PATH` is not configured, keeping the Netlify dedicated-probe path unchanged; or, if a self-fetch is kept, target `http://127.0.0.1:${PORT}` explicitly instead of `request.nextUrl.origin`. Add a test covering `HOSTNAME=0.0.0.0` with `x-forwarded-proto: https`.
- PR against `codex/production-release-checkpoint`, CI, test-site publication and smoke as usual, then re-promote by commit id: web first, then worker.
- The database stays at the 472356d schema. Do not run the owner migration job again for the re-promotion; nothing is pending and 8402618 runs on this schema. New migrations in the fix branch, if any, would need the job again.

## Deploy commands (for the re-promotion after the fix; replace the SHA)

Run from TrixBot with the signed-in Render CLI (see access below). Web first; its pre-deploy command runs the runtime-role check, `db:verify-release` and `db:seed:catalog`, and Render waits for `/api/health/ready`. Then the worker at the same commit.

```
render deploys create srv-dagt93lbedkc738552o0 --commit 472356df3779e06f1a2bf3e3e1b7959c456e5fc0 --wait --confirm
render deploys create srv-dagta4uq1p3s738rnlr0 --commit 472356df3779e06f1a2bf3e3e1b7959c456e5fc0 --wait --confirm
```

Then verify:

1. `/api/health/live`, `/api/health/ready`, `/api/health/worker` on https://jumpinthemix.com answer 200; allow a minute for the worker heartbeat.
2. Homepage headline is "You meant to follow up."; `/faq`, `/for/contractors`, `/follow-up-templates`, `/features/follow-up-reminders` answer 200 (they were 404 on 8402618); every `/_next/static/` asset referenced by the homepage answers 200.
3. `npm run smoke:staging` with `STAGING_BASE_URL=https://jumpinthemix.com`, `STAGING_SMOKE_USER_EMAIL`, `STAGING_SMOKE_USER_PASSWORD` for a synthetic production account. No such account is known on TrixBot; Kevin must supply one. Never a customer account.
4. Record the release: commit, archive checksums, migration receipt, deploy ids, health and smoke results, backup identifier, rollback target. The production release history lives in docs/PRODUCT_COMPLETION.md and docs/PRODUCTION_LAUNCH_PLAN.md; the Netlify test-site records live in docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md. Open the PR against `codex/production-release-checkpoint` like #52–#77.

## Rollback

Application rollback is redeploying the previous revision to both services; the schema stays as migrated because every applied migration is additive and 8402618 is running on it now:

```
render deploys create srv-dagt93lbedkc738552o0 --commit 840261884697ed60d9df658d8c648a63ab1d5549 --wait --confirm
render deploys create srv-dagta4uq1p3s738rnlr0 --commit 840261884697ed60d9df658d8c648a63ab1d5549 --wait --confirm
```

Never reverse a migration in place (docs/MIGRATION_RUNBOOK.md, docs/HOSTED_DEPLOYMENT.md).

## Access state on TrixBot (clean up when done)

- Render CLI v2.28.0 installed at `~/.local/bin/render` (release checksum verified). Signed in as Kevin (`render login`, 2026-09-16); the token lives in `~/.render/cli.yaml`. Kevin can revoke it in the Render dashboard or run `render logout`.
- TrixBot's existing key `~/.ssh/id_ed25519.pub` (`trix@trixbot`) was added to Render Account settings → SSH Public Keys on 2026-09-16. Render's Oregon host key (fingerprint `SHA256:KkZPgnApmttFYSkdJsCi7B01sgZPMI6kY53MDbbanGM`, matches Render's docs) was appended to `~/.ssh/known_hosts`. The first connection printed `client_global_hostkeys_prove_confirm: server gave bad signature for ED25519 key 0`, an optional host-key-update extension failing at Render's gateway after authentication; harmless.
- The ephemeral shell may still be open in Kevin's terminal; it bills while connected and is deleted on `exit`.
- The read-only GitHub token Kevin created for the download should be deleted at https://github.com/settings/personal-access-tokens.
- `~/render-ssh.log` on TrixBot holds one failed text-mode attempt; delete it.
- The permission classifier refused, from the agent: `netlify env:get` on the customer site (Production Reads), an ephemeral `render ssh` diagnostic (Sensitive Remote Exec), and a heredoc that contained deploy commands (Production Deploy). `render deploys list`, `render services`, `render workspaces`, `render whoami` were allowed. Expect a possible refusal on `render deploys create`; if so, hand Kevin the two commands above to run in his own terminal, one per line.

## Still open after this promotion

- Hosted recovery hold check: BLOCKED / NOT RUN (documented in #77).
- Physical device matrix (iPhone Safari, Android Chrome): NOT RUN.
- #75 upload-only Netlify publication: unqualified; not relevant to Render.
- Test-site deploy stays 6aa99626… at b2a9e73; do not redeploy it to align SHAs.
- Kevin's earlier note in this session still applies: never present the local deploy-script guard as repository protection.

## Where to look

- docs/RUNTIME_DATABASE_CREDENTIALS.md ("Later releases with migrations"), docs/HOSTED_DEPLOYMENT.md (deploy order, smoke, rollback), docs/MIGRATION_RUNBOOK.md, docs/PRODUCT_READINESS_HANDOFF_2026-09-12.md §5.
- Memory: `jitm-production-render.md`, `kevin-command-paste-path.md` (how to hand Kevin commands: he pastes from the wrapped terminal rendering; use short lines or base64-in-quotes and name the target machine).

## Recovery regression fix qualification (2026-09-16; supersedes promotion advice above)

The earlier sections are the original incident record, not current authorization. This task authorizes a focused fix PR, isolated tests and read-only production audit only; no production promotion, shared database changes, paid infrastructure or permission bypass.

### Baseline and migration audit

Read-only Render deploy listings and SSH process revision reads independently confirmed web and worker at `840261884697ed60d9df658d8c648a63ab1d5549`. Live deploys remain `dep-dal0138ae00c73f2q1ng` (web) and `dep-dal01r8ae00c73f2snmg` (worker).

At 2026-09-16 05:07:24 UTC a bounded `BEGIN READ ONLY` transaction on the runtime connection found all 60 repository migrations completed, no pending migrations, and no checksum mismatches. No migration was applied or repeated. The fix contains no migration.

The same snapshot found **zero affected rows** in the following conservative rollback risk query: pending Jumps whose MixStep anchor is not CALENDAR_DAY, whose selectedFamily is non-null, or which have JumpDraft rows; also canceled drafted Jumps, including merged-contact carryover. There were **zero non-calendar MixSteps**, including inactive steps. No customer text or credentials were exported. These are snapshot results, not a durable guarantee; newly created work requires a fresh audit before deployment or rollback.

### Behavioral rollback risks and order

The old worker generates calendar-day/time-of-day schedules, keys and primary-channel template snapshots. It does not read elapsed-minute anchors, selectedFamily or JumpDraft. Its reconciliation can cancel a newly generated occurrence and produce a legacy replacement; it does not carry draft/snooze state to the replacement. A retained additive column therefore does not establish behavioral safety. Selected channel and draft wording can remain stored while the old web/worker ignore them. Canceled drafted rows also require review because newer reconciliation can carry their drafts onto a surviving contact's occurrence.

For a later approved promotion, qualify the exact worker and web revision on the migrated schema first. Refresh the read-only affected-record audit. Prefer **worker first, then web**, verifying readiness and real worker processing before allowing the new web to create elapsed/variant/draft work. This supersedes the earlier web-first suggestion: web-first exposes new semantics to an older worker. Avoid a prolonged mixed-version window; old web behavior also lacks the new features.

Rollback triggers: recovery-clear sign-in returns 503, authenticated workflow fails, held/unavailable/timed-out recovery admits a request or worker job, deadlines are exceeded, private/worker authentication fails, worker heartbeat/job processing regresses, or the schema release check is not ready. Do not blindly restart an old worker once new-semantic records exist. Obtain an approved containment/record-handling plan first; leave migrated schema intact. No worker pause, queue mutation or record rewrite has been performed in this task.

### Fix and evidence in progress

The fix uses the existing bounded database reader when no dedicated probe path is configured. Netlify retains its dedicated probe, with a validated configured HTTPS APP_URL, no caller-derived host/protocol, and no redirects. Recovery deadlines, fail-closed behavior and private/authentication protections remain intact.

The packaged baseline built from 472356d returned 503 for a recovery-clear authenticated contacts request through a trusted HTTPS terminator forwarding to the internal HTTP standalone listener (`HOSTNAME=0.0.0.0`). Reproduction log: `.artifacts/render-recovery-fix/baseline-reproduction.log`. The regression test now exercises this topology and actual password sign-in plus a protected contact import using only a newly created disposable local database. The certificate is explicitly trusted by the test client; TLS validation is not disabled.

Existing Netlify test deploy `6aa99626d303505e51d13d2d` passed desktop smoke at 05:12:34 UTC (actual sign-in and ten protected routes). A read-only audit at 05:11:47 UTC found 60 migration rows but a checksum mismatch for `20260906010000_customer_journey_intake_calendar`. The prior local deploy script worked around this by temporarily changing a migration file before generating the release manifest. **That is not qualification of the same production release artifact.** This fix task will not repeat that workaround, change shared migration history or disable release checks. Publication of the exact artifact to that database remains blocked pending an approved resolution. The existing-deploy smoke must not be presented as fixed-commit qualification.

The tested commit, CI receipt, artifact identity and remaining approval requirements are recorded below.

### Local validation receipts

- Runtime source tested: `d2d1d4c` (PR #78). Subsequent test/evidence-only changes do not change the packaged runtime.
- Standalone release archive: `.artifacts/render-recovery-fix/standalone-d2d1d4c.tar.gz`, SHA-256 `d7b9c1f553a0a8aee7219defb7ee60acd32013950b3923a1d71fc8a9495ae855`. The archive is retained locally and was produced before Netlify adaptation. It contains the exact standalone output used for the HTTPS tests; no customer/production credentials were injected.
- Focused boundary/function/proxy checks: **41 passed**. Database fallback covers clear/held/unavailable and exceptions; dedicated HTTP rejects hostile request addressing, invalid configured origins, redirects, failures and malformed responses. The dedicated function's existing tests exercise its timeout and discard late answers.
- Packaged HTTPS matrix: **2 passed**, 63.08 seconds, with private mode off/on. Both used actual password-form submission, a resulting session cookie, authenticated contacts and a committed contact import. Missing authentication and cross-origin mutation were rejected. Login, protected routes, worker-health access and mutation were denied under hold, connection refusal and blackholed connections. Checks remained bounded below nine seconds each; no timeout constants changed. The test's worker-health success fixture is a heartbeat row, not proof of worker processing.
- Separate real worker-process suite: **7 passed, 1 skipped**, 66.67 seconds, including held/unavailable/timed-out startup, unchanged queued-job attempts, clear-state recovery and exactly one generated follow-up. The skipped five-minute unattended test remains enabled in CI. Persistent workers still use their existing 30-second release recheck interval; this fix does not introduce an instantaneous in-flight worker cutoff.
- Full isolated local suite before the additional three worker cases: **1,157 passed, 67 skipped**, 303.12 seconds. Production Next.js build passed. Netlify build and application/function/edge packaging passed with compile-only database configuration; nothing was published.
- Existing test-site desktop smoke: **passed**, 05:12:34 UTC. Existing test-site mobile smoke: **passed**, 05:16:24 UTC. These use the already published deploy, not PR #78.

The local tests reproduce the Render topology, but formal approval to use this local isolated environment for release qualification is still pending. The exact archived artifact can be rerun after approval without rebuilding. No paid environment was created. The checksum mismatch in the existing test database independently prevents claiming same-artifact test-site qualification. CI passed on the final code-and-test commit `750b51e77941cca5702d0c9cdd320112dbd60538`; the later handoff-receipt commit changes documentation only. Runtime inputs are byte-identical to the archived artifact. Any subsequent runtime or test change requires fresh validation.

### Final CI receipt and qualification disposition

[CI run 35058949394](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/35058949394) passed on `750b51e77941cca5702d0c9cdd320112dbd60538` in 40 minutes 53 seconds. It includes migration/rollback/reapply and backup/restore rehearsals on isolated CI databases, unit/integration tests, the packaged HTTPS recovery matrix, authenticated load, browser workflows with restricted database credentials, required-MFA staff workflows, Lighthouse and production web/worker image builds. [Security](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/35058949390) and [Docker builds](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/35058949392) also passed. The receipt-only documentation commit after this tested revision does not change the release artifact; its automatic checks are separate from the completed code/test run.

Additional real-connection evidence: the actual recovery client fetched the actual dedicated Netlify handler over trusted HTTPS against an isolated PostgreSQL database. The private gate rejected missing credentials, and caller-controlled origin/protocol/authentication headers did not control the probe. Clear, held, unavailable, timed-out and recovered-clear cases passed in 28, 25, 6, 5,014 and 54 ms respectively. This validates the HTTP code path, not a new hosted Netlify deploy. Local evidence: `.artifacts/render-recovery-fix/dedicated-probe.log` and `dedicated-probe.mjs`.

A refreshed read-only audit at **05:46:43 UTC** again verified both running production processes at `8402618`, 60 applied migrations with matching checksums, no pending migrations, no affected pending/canceled-drafted records in the risk query, and no elapsed-anchor MixSteps. No production deploy, migration, database repair, worker pause or queue edit was performed.

**Disposition: PR #78 remains draft; release qualification is incomplete.** Approval to use the isolated local environment for formal Render-equivalent qualification is pending. A second decision is pending on a free isolated copy of the test database and temporary test-site binding, which could resolve exact-artifact staging qualification without modifying the original database. No copy, binding change or infrastructure creation has occurred. If that route is declined or cannot be free, leave hosted qualification blocked. Do not repair shared migration history, alter the release manifest for the existing database, bypass release checks, or promote production under this task.
