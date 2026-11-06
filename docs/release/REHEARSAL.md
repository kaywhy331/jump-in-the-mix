# Release rehearsal h

**Planned operator runbook — rehearsal, not go-live.** This is S1 of
INFRA-DELIB-11, binding Hub note `note_222a81aa8e77d994` on
`job_42c927eb957b` (Kevin, November 6, 2026). It prepares code only: no account,
environment, secret, tag, workflow run or provider resource was created by S1.
A1 and settings f remain go-live gates. Production stays secretless.
JITM-00 §2.9 governs spend; JITM-12 §2.1–2.7 governs evidence;
JITM-15 §2.16 keeps raw provider evidence private; JITM-16 §2.5–2.6 governs
merges and production releases. This runbook grants neither.

## Kevin's steps, in order

| Step | Needs and action | Verification before proceeding |
|---|---|---|
| K1 | S3's decision packet: record the D5 and JITM-00 §2.9 exceptions, USD 15 ceiling, start/day-3/day-7 UTC dates, and the irreversible public-package decision. | Recorded owner approval and S2 CHECK result exist before any billable action. A failed CHECK permits only the probe, never full runs. No assumed provider spend cap. |
| K2 | Merge #183 (env-prefix), S1 (this kit) and S2 (operator-image workflow), each after its independent QA PASS. | Record merge SHAs, exact reviewed workflows and QA evidence. S1 lands from `infra/release-env-prefix` at `5b98970c`; its PR should contain only the kit after #183. S1 preparation itself opens no PR. |
| K3 | Create a separate Render user with new email, 2FA and card, a one-seat Hobby workspace in Oregon, and its classic API key. | User/workspace identity is separate from production; its key cannot see production. Kevin handles credentials; never put their values in JSON, logs or evidence. |
| K4 | Run S3's reviewed `wR.py`, then Kevin sets `RENDER_API_KEY` on the `rehearsal` GitHub environment. | Run `wR.py --verify-only`: protected rehearsal environment exists, reviewer/ref protections verified, only its Render key is present, production has no secrets. No environment-level variables. Referencing a missing environment can create it unprotected, so stop if absent. |
| K5 | Dispatch S2 (tiny placeholder push first), make its GHCR package public, create the image-backed cron operator at 1c-2g with auto-deploy off, share the IDs and immutable image digest. | Image includes the reviewed S1 scripts at its recorded SHA; idle CMD exits. Owner/service IDs match the separate account. Record public digest and CHECK evidence. Fill the probe fields below; no app/database credentials are needed yet. |
| K6 | Cut `rehearsal-releaser-probe-1` at reviewed workflow source; dispatch `rehearsal-ops.yml` in `probe` mode and approve the protected environment. | Save safe summary and private job evidence; all probe criteria below pass on the real image. Record shell/argv mode, first-read receipt availability and latency, and three egress observations. |
| K7 | Only after probe and CHECK PASS: create Postgres 16 at 0.1c-256mb with `ipAllowList: []`, web and worker at the previous commit, a custom domain outside `jumpinthemix.com`, backup bucket in a separate AWS account, and reviewed operator env; then dispatch `seed`. | Web/worker names equal `render.yaml`, plans 0.5c-512mb, auto-deploy off, both live at the full previous SHA. Verify restricted runtime/backup roles, Resend placeholders and automatic customer sending off. Set operator `JITM_REHEARSAL=true`, private `DATABASE_URL`, and reviewed backup/app/smoke settings from the catalog. Seed PASS proves previous-schema compatibility and unmarked non-trivial rows. |
| K8 | With no active/pending run, S3's `wR.py` sets both repository variables using agent-prepared JSON; S2 builds each candidate. Set exact `ledger_bootstrap_run` for the first approved run, then cut, dispatch and approve R1, N1, R2 in that order. | Candidate/main/hash/job bindings and owner exception match each run; immutable operator image and actual web assets match CHECK. Bootstrap is the only setting safe to clear during a run; clear after ledger creation. R1/R2 publish and N1 refuses as specified below. Snapshot protected production refs before and after. |
| K9 | By day 7, or sooner at a stop condition: retain private evidence and tear down every rehearsal resource, revoke the key, and record billing proof. | Teardown inventory is empty, credentials revoked/removed and final charge recorded; S4 records evidence and removes the temporary rehearsal workflow after QA. |

## Inputs and templates

[Settings template](rehearsal/RELEASE_SETTINGS.template.json) becomes the
`settings_json` dispatch input for probe/seed, then repository
`RELEASE_SETTINGS_JSON` at K8. Replace every needed `{{PLACEHOLDER}}` with
reviewed values, never secrets. Probe uses only namespace, API, owner/operator,
timeouts, and `rehearsal.egress_url`/expected addresses/hold settings; full-run
and seed placeholders can remain during K6. The egress endpoint must be an
owner-reviewed HTTPS service returning one plain IP without credentials.
Expected egress addresses come from Kevin's private operator inventory. For the
initial observation, replace the address placeholder with an empty array rather
than invent an IP; the summary then records `expected_configured: false`. The
probe requires three equal actual addresses and, when an expectation is supplied,
requires all three to match it. Kevin privately records the observed address for
the later smoke setting; shared ranges alone cannot satisfy smoke's single-IP check.

The probe's two held jobs must overlap by their Render `startedAt`/`finishedAt`
timestamps. `overlap_hold_ms` controls the hold (default 20 seconds); lack of
proven overlap is a failed probe, not permission to waive isolation. Its env
payload exceeds 1.5 KB. The third success appends a lone `;`: a shell consumes
the separator, while an argument vector passes it to Node. Both paths are
accepted only with exactly one true mode indicator. The fourth job exits 17
and must be reported `failed` by Render. No job-creation POST is retried.

Seed also needs full previous/operator SHAs, private database hostname, web/
worker IDs and the separate site URL. Both app services must already be live at
the previous SHA. The operator contains the reviewed kit and previous Git
objects; seed checks that image SHA, ancestry and the previous schema/migrations
without running a migration. It requires a fresh database with no users, writes
one suspended owner with no password, one workspace, three contacts without
recipient addresses, a manual Mix/Beat and PENDING/DONE/SKIPPED manual follow-ups
in one transaction, then checks them. IDs are generated UUIDs, never the catalog's
reserved `jitm-release-` marker. These baseline rows survive R1/R2 for count
comparison; only temporary smoke rows must disappear. Do not reseed a used DB.

[Approval template](rehearsal/RELEASE_APPROVAL.template.json) becomes repository
`RELEASE_APPROVAL_JSON`. Generate the candidate binding with the existing
[candidate tool](../../scripts/release/candidate.mjs); hash
`JSON.stringify(settings.jobs)` for `reviewed_jobs_sha256`. Replace the
`REHEARSAL_EXCEPTION_APPROVED_BOOLEAN` placeholder with JSON boolean `true`
only after K1's recorded rehearsal exception; the legacy `tier3.passed` gate
requires it, but the reference and every resulting record must say
**REHEARSAL, not tier-3**. This is not production tier-3 evidence. Leave the
template invalid until actual approval, PR IDs and bindings are available.
`migration_job` stays `none`; no migrate job is configured.

The release workflow is unchanged. One repository settings value selects its
environment, both conditions, concurrency and step settings. Never set
environment-level variables or alter variables while a run is active/pending.
The rehearsal namespace is `rehearsal-releaser-`, `rehearsal-published-`,
`rehearsal/record-`, `rehearsal/ledger`; concurrency is
`rehearsal-release-and-recovery`. Receipt prefix stays `JITM_RELEASE_RECEIPT:`.

## Pass criteria and evidence

- **CHECK:** S2 builds R1 twice from clean checkouts with `render.yaml`'s build
  command and Node 22.23.2, one through S2's static path; `.next/static` paths
  and SHA-256 values match. If not, use a commit-derived build ID and recheck;
  a second mismatch is BLOCKED. A failed CHECK blocks full runs, not the probe.
- **Probe:** IDs match `^job-[0-9a-z]{20}$`; statuses are `pending`, `running`,
  `succeeded`, `failed` or `canceled`; nonzero exit yields `failed`; each
  `logs?resource=<job>` has one exact-prefix receipt with its own identity,
  never the other concurrent job. Receipt is present on the first read after
  terminal observation. The probe measures late delivery for diagnosis but
  fails it, since `workflow.mjs` reads once. The 1.5 KB env payload, execution
  mode and three equal egress observations are proven (matching any supplied
  expectation). Record the actual address privately before configuring smoke.
- **R1:** previous `dcdd9697` (expand/verify full live-production commit as
  historical input, never target production); candidate main including #183.
  **R2:** a later main, with its own bound approval/image and R1 as previous.
  Both reach publish. Every external operation records requested → unresolved
  → succeeded with real IDs; local gates record requested → succeeded. None
  remains unresolved. Every successful job has one complete receipt; count
  digests are equal; no smoke rows remain. `prod-*`, `releaser-*` and
  `release-ledger` refs are unchanged. Publication uses only rehearsal refs.
- **N1:** a deliberately wrong expected client address makes smoke refuse;
  cleanup empties the temporary smoke fixture and nothing publishes. Keep all
  failed evidence. Any hold is resolved by recorded E1 observation before the
  next full run, never deletion. If the negative changes live services, use
  their actual commit as R2's previous commit and rebind; don't pretend the
  former preflight still applies.
- **Migrate: NOT RUN.** No migration since 2026-10-08; verify identical
  migration-set digests. The workflow's local unchanged-set gate is evidence
  of skipping migration, not evidence of executing a migration job.

Retain: owner exceptions/cap/dates; QA results and merge SHAs; two CHECK
manifests; separate-account/service/database/image inventory; domain and backup
isolation proof; before/after refs; each tag and run URL, dispatch inputs and
approval digest; safe probe summary; private returned job IDs, statuses,
timestamps, scoped receipts and egress observations; seed receipt; R1/N1/R2
ledger histories, count digests, cleanup assertions, published refs or refusal;
all attempts, failures and E1 resolutions; cost log and teardown proof.
Label every record **rehearsal, not go-live**. GitHub probe/seed logs contain
only shapes, booleans and timings; inspect raw Render evidence privately, never
paste response bodies, addresses or credentials into public workflow logs.

## Failure handling, cost and teardown

A failed probe gets a format repair and re-probe. A correct candidate that
fails an assertion gets one catalog repair and a new full run. Resolve holds
through E1 as [ENVIRONMENT_SPEC.md](ENVIRONMENT_SPEC.md) describes; never erase
the ledger or retry an ambiguous creation request. A setup error goes to Kevin.
A second failure, USD 15 spent, or day 7 means teardown and an owner question.
Do not weaken assertions, infer success from elapsed time, or proceed to full
runs with an unverified public-URL deploy, egress address or bootstrap timing.

The plan's estimate is about USD 6 for seven days, plus about USD 12 if a domain
is bought; this is an unverified estimate, not a provider quote. A domain can
consume the cap: Kevin records the actual total before purchasing anything.
Check provider billing on day 3 and record every resource/run charge; stop at
USD 15, including domain and storage, and tear down by day 7 regardless.

| UTC date / day | Render accrued USD | AWS/storage USD | Domain/other USD | Total USD | Billing evidence / decision |
|---|---|---|---|---|---|
| K1 / day 0 | pending | pending | pending | pending | Cap approval; exact start and deadline |
| Day 3 (required) | pending | pending | pending | pending | Billing check; continue only below 15 |
| Stop or day 7 | pending | pending | pending | pending | Final billing and teardown proof |

At teardown Kevin stops active rehearsal work, retains sanitized summaries and
private evidence, deletes rehearsal cron/web/worker/database resources, backup
objects and bucket in the separate AWS account, and rehearsal-only DNS/domain
resources (disable renewal if purchased). Remove the rehearsal GitHub key and
revoke the Render classic key; retire the separate workspace/account as agreed.
Remove rehearsal configuration or restore previously recorded repository
variables through reviewed S3 tooling while no run is active; production stays
secretless. Inventory public image/tag/package storage and remove what K1
authorized for teardown, acknowledging that public copies cannot be recalled.
Retain append-only evidence/refs per S4; do not delete a ledger to clear holds.
Confirm no billable resources or renewals remain and attach day-7 billing proof.

NOT RUN by this kit: live probe/seed, CHECK, R1/N1/R2, migrate, provider calls,
environment/variable/secret setup, tags, deployment, production tier-3, go-live,
spend and teardown. S2/S3, independent Claude QA and Kevin's K1–K9 supply those
separate prerequisites; S4 records the result and removes the temporary workflow.
