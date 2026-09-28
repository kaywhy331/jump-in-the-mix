---
id: JITM-14
title: Release and environments
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [production, releases, environments, render, rollback, operations]
supersedes: [AGENTS.md#deployment-destinations, AGENTS.md#production-deployment-render, docs/FREE_TESTING.md, docs/NETLIFY_DEPLOYMENT.md, docs/HOSTED_DEPLOYMENT.md#deploy-order]
sources:
  - AGENTS.md
  - render.yaml
  - docs/HOSTED_DEPLOYMENT.md
  - docs/RUNTIME_DATABASE_CREDENTIALS.md
  - docs/MIGRATION_RUNBOOK.md
  - docs/OPERATIONS_READINESS.md
  - docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md
  - docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md
  - docs/FULL_AUDIT_2026-09-24.md
  - docs/AUDIT_RELEASE_A2_2026-09-25.md
  - docs/AUDIT_RELEASE_B_2026-09-25.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
  - docs/INVITE_PAGE_RELEASE_2026-09-27.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
related_skills: [jitm-release, jitm-review]
related_workflows: [WF-06]
---

# JITM-14 — Release and environments

> Where Jump in the Mix runs, who may release it, the gates every production release passes, tags, rollback, free-plan limits and what agents must never do in production.

## 1. Purpose and scope

This standard holds the rules and gates of a production release. [WF-06](workflows/WF-06-production-release.md) is the step-by-step procedure that follows them. It also covers the environments, rollback, the free-plan limits, secrets during releases, and the deployment facts that used to live in `AGENTS.md`.

Neighboring topics live elsewhere:
- agent authority in general: JITM-16 §2;
- pre-release checks and evidence labels: JITM-12 §2;
- migrations, the runtime role and other code rules: JITM-11 §2;
- release record contents: JITM-15 §2;
- branches and pull requests: JITM-13 §2.

## 2. Rules

### Environments

**2.1** Jump in the Mix has two kinds of environment and no staging:
- **local:** `npm run dev`, local production builds used for verification, disposable `jitm_design_*` databases, and the Docker edition (`start-local.*` launchers, `pilot:*` scripts);
- **production:** https://jumpinthemix.com on Render, with web service `jump-in-the-mix-web` behind Cloudflare, worker `jump-in-the-mix-worker`, private PostgreSQL 16 reached through the `jitm_runtime` role, and a daily encrypted backup cron. `render.yaml` defines the two services; `infra/operations/` defines the database, backup and monitor.

[OWNER 2026-09-28 D5] [SHIPPED 9439fd6 render.yaml:1-3,37-46,71-78] [SOURCE AGENTS.md:17] [SOURCE CONTRIBUTING.md:3-11] [SHIPPED 9439fd6 infra/operations/render-database.yaml:9]

**2.2** The Netlify test site is retired. Pre-release verification replaces staging: a local production build of the candidate, the relevant suites compared with a baseline (JITM-12 §2.11), and the post-deploy checks below. Agents MUST NOT deploy to the Netlify projects or to any other host as "staging". [OWNER 2026-09-28 D5]

**2.3** Before any deploy or production command, agents MUST confirm the target: the service name and id, the domain and the commit it runs. The Netlify project named `jump-in-the-mix` is not the customer site. [SOURCE AGENTS.md:13] [SOURCE docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:25]

**2.4** Production runs with `NODE_ENV=production`, `PILOT_MODE=false`, `DEMO_MODE=false`, required email verification and required staff MFA. It needs HTTPS, a verified transactional-email sender, strong unique secrets and the real operator, support and backup notices; readiness answers 503 when any of these is missing, and no bypass exists. `AUTOMATIC_CUSTOMER_EMAIL` stays unset during the beta (JITM-00 §2). [SHIPPED 9439fd6 render.yaml:8-19] [SOURCE README.md:32] [SOURCE docs/HOSTED_DEPLOYMENT.md:43] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:26]

**2.5** Automatic deploys stay off on every Render service. Production changes only by an explicit deploy of a named commit through WF-06. [SHIPPED 9439fd6 render.yaml:46,78]

### Authority

**2.6** Agents run release steps only as JITM-16 §2.6 allows. When their own operator or host instructions forbid releases, JITM-16 §2.24 applies. [OWNER 2026-09-24 O3] [PROPOSED]

**2.7** When a permission prompt or safety classifier refuses a release step, the agent stops and records the refusal in the release record. Kevin MAY run that step himself from a one-line script the agent writes into the release directory; the script stays in the release directory with its receipt. [SOURCE docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md:19,55,65]

### Release gates

**2.8** Only a commit on `main` that Kevin merged is deployed: the pull request's merge commit, to both services. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:3] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:8] [PROPOSED]

**2.9** No production step starts until the candidate passes pre-release verification with no failure unique to it. [OWNER 2026-09-28 D5] [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:74]

**2.10** Each release gets a new directory under the git-ignored `.artifacts/`. It holds the release scripts, adapted from the previous release's set, with every receipt and log. It is never committed or published. [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:42] [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:107] [SOURCE docs/RELEASE_QUALIFICATION_2026-09-06.md:39]

**2.11** A read-only preflight MUST pass before any write:
- both services run the previous commit, with auto-deploy off;
- health answers 200 three times;
- the database is ready, the runtime-role boundary holds, and there is no recovery hold;
- every applied migration checksum matches the release tree;
- the diff touches only reviewed schema, dependency and configuration changes.

It records the record-count baseline and hashes the changed files that exist at the release commit. Any mismatch stops the release. [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:109-110] [SOURCE docs/MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:16] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:43]

**2.12** A fresh encrypted backup MUST be taken before any production change, in every release. [SOURCE AGENTS.md:17]

**2.13** Migrations run before the code that needs them, in the isolated one-off job with the owner credential (JITM-11 §2.33).
- Afterwards, re-verify the runtime role, the new objects and backup grants, and unchanged record counts.
- The old code keeps serving meanwhile.
- A migration that requires old workers to stop first follows its own stop-and-drain steps.

[SOURCE AGENTS.md:17] [SOURCE docs/RUNTIME_DATABASE_CREDENTIALS.md:19-21] [SOURCE docs/AUDIT_RELEASE_B_2026-09-25.md:85] [SOURCE docs/WORKER_RECOVERY_QUALIFICATION.md:19-27]

**2.14** The worker deploys first, then the web service, at the same commit, so new web behavior never creates work an older worker misreads. Gate: the new worker reports the release commit after the old instance drains, and a scoped queue probe completes, creates nothing and is removed. [SOURCE AGENTS.md:17] [SOURCE docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:162] [SOURCE docs/AUDIT_RELEASE_C1_2026-09-25.md:38]

**2.15** The web deploy keeps the build cache. Gate: the pre-deploy checks pass and Render reports the service ready. [PROPOSED] [SHIPPED 9439fd6 render.yaml:43,45]

**2.16** The postflight runs after the cutover completes, and confirms:
- both services run the release commit;
- the public, security and redirect checks pass (`scripts/production-smoke.mjs` covers the public part);
- the health endpoints answer 200, and signed-in pages redirect to sign-in;
- the release files and served assets hash identically on the live instance, and deleted files are gone.

A check that fails while instances roll over is rerun once before it counts as a failure. [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:110,113] [SOURCE docs/FULL_AUDIT_2026-09-24.md:125] [SHIPPED 9439fd6 scripts/production-smoke.mjs:10-17]

**2.17** The live smoke uses one temporary synthetic owner whose contacts have no recipient addresses and whose Beats are manual. It checks:
- the session cookie's flags and lifetime;
- Today on a phone;
- the real client address, including with a forged `X-Forwarded-For`;
- signed error messages;
- reflow and axe at 390 px in both themes;
- the release's own changes.

Every synthetic row is removed. A smoke that fails on its own script is fixed and rerun, and each attempt is recorded. [SOURCE docs/JOURNEY_PRODUCTION_RELEASE_2026-09-21.md:34] [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:114-120] [SOURCE docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:45-54]

**2.18** The final check confirms record counts equal the baseline; no synthetic rows, probe jobs, failed jobs since the release or rate-limit blocks remain; health answers 200 three times; and both services run the release commit with auto-deploy off. [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:121]

### Tags, records and follow-ups

**2.19** Every production deploy gets an annotated tag `prod-<YYYY-MM-DD>-<sha7>` on the deployed commit, dated with the UTC day of the deploy, and the tag is pushed. Its message names the release, the pull request, both deploy ids and the previous production commit. [SOURCE AGENTS.md:17] [SOURCE docs/FULL_AUDIT_2026-09-24.md:116] [PROPOSED]

**2.20** Every tagged deploy, and every rollback, gets a release record (contents: JITM-15 §2.6) in its own `docs/<topic>-record` pull request (JITM-13 §2.4), opened in the same task. [SOURCE AGENTS.md:17] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:1-11]

**2.21** A release ends by listing the owner follow-ups: the steps only Kevin can take, such as dashboard settings, inbox checks and device passes. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:56-66] [SOURCE docs/AUDIT_RELEASE_B_2026-09-25.md:108-122]

### Rollback

**2.22** Roll back when a live check fails after the deploy and no compatible forward correction is obvious. Triggers include failing sign-in or authenticated workflows, a recovery state that admits requests or jobs, exceeded deadlines, a worker regression and a failing release check. [SOURCE docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md:46] [SOURCE docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:164]

**2.23** When the schema is unchanged, or changed only additively in ways the previous release ignores, rollback redeploys the previous tag to the web service first and then the worker, followed by the postflight, the final check and a record. [SOURCE AGENTS.md:17] [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:125] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:70]

**2.24** When a migration or data transform shipped:
- prefer a forward correction;
- never reverse a migration in place;
- undo release-specific data transforms with their rehearsed reverse script before older code runs;
- before an older worker resumes after new-semantic records exist, run the read-only affected-record audit, and never restart it blindly;
- a data rollback restores into a separate, empty database, following the recovery runbooks.

[SOURCE docs/MIGRATION_RUNBOOK.md:51] [SOURCE docs/JOURNEY_PRODUCTION_RELEASE_2026-09-21.md:40] [SOURCE docs/AUDIT_RELEASE_B_2026-09-25.md:104] [SOURCE docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md:48-50]

### Free plan, secrets and settings

**2.25** Production stays on Render's free plan for the MVP. Services, instance plans and resources stay as `render.yaml` and `infra/operations/` define them. Adding a service (including the prepared independent monitor), upgrading a plan or turning on a paid add-on needs Kevin's approval (JITM-16 §2). [OWNER 2026-09-25 O4] [PROPOSED] [SOURCE docs/INDEPENDENT_MONITOR_DEPLOYMENT.md:3,11]

**2.26** Releases SHOULD be batched and run in quiet hours, with testers told to reload afterwards. Beta imports stay near 1,000 rows per owner, and invitation waves are paced. [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:447-448] [PROPOSED]

**2.27** Production secrets live only in Render's environment, provider secret stores and git-ignored local env files. Agents MUST NOT print them or put them in command arguments, shell history, logs, records, pull requests or chat. Plan files that hold them are mode 600. [SOURCE docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md:37] [SOURCE docs/OPERATIONAL_ALERTS.md:43] [SOURCE docs/HOSTED_LOAD_QUALIFICATION.md:53]

**2.28** Service settings (start commands, shutdown delay, environment variables) change only as part of a reviewed release plan, and the record lists the old and new values. [SOURCE docs/HOSTED_DEPLOYMENT.md:72] [SOURCE docs/AUDIT_RELEASE_B_2026-09-25.md:86]

### Production prohibitions and monitoring

**2.29** In production, agents MUST NOT:
- clear or override a recovery hold by hand, or restore a backup into the live database;
- edit data by hand, including deleting or resetting the email send ledger or bypassing suppression with direct database edits (use the audited admin controls and reviewed scripts);
- run demo seeding or data resets;
- retry destructive SQL blindly after a partial failure;
- point a load probe or test suite at production, beyond the release smoke and read-only GET checks.

Rules for building databases and migration history are in JITM-11 §2. [SOURCE docs/OPERATIONS_READINESS.md:31,78] [SOURCE CONTRIBUTING.md:50] [SOURCE docs/EMAIL_OPERATIONS.md:62,125] [SOURCE docs/NETLIFY_DEPLOYMENT.md:69] [SOURCE docs/MIGRATION_RUNBOOK.md:56]

**2.30** Production MUST have a working outage signal: the hourly read-only `production-smoke` workflow and Render's failure emails. While either is off, every release record lists it under owner follow-ups. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:27,58] [SHIPPED 9439fd6 .github/workflows/production-smoke.yml:3-8]

### Deployment facts carried from AGENTS.md

These are the two deployment sections of `AGENTS.md` at 9439fd6, quoted word for word so nothing is lost when the router is rewritten. Only the relative link target is adjusted to this file's location. Where they differ, the rules above govern.

**Deployment destinations** — retired by D5 on 2026-09-28 (§2.2):

> All testing and staging deployments must publish to https://jump-in-the-mix-test.netlify.app/ (Netlify site ID `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`). Use the explicit test site ID and publish to its stable URL; an unpublished deploy URL is not the staging handoff. https://jumpinthemix.com/ is the published customer site and is a separate deployment target. Verify site identity before deploying; the local Netlify link may point to the customer site.

**Production deployment (Render)** — current, except as noted after the quote:

> The customer site https://jumpinthemix.com runs on Render, not on the Netlify project: web service `jump-in-the-mix-web` (`srv-dagt93lbedkc738552o0`), background worker `jump-in-the-mix-worker` (`srv-dagta4uq1p3s738rnlr0`), a private PostgreSQL database with the restricted `jitm_runtime` role, and a daily backup cron, all defined in `render.yaml` with auto-deploy off. Releases deploy a specific commit id to the worker and then the web service, after a read-only preflight and a fresh backup, with migrations applied by a reviewed one-off job before the code that needs them. Every deployed commit carries an annotated tag `prod-<date>-<sha7>`; rollback is a redeploy of the previous tag (web first, then the worker) when the schema is unchanged. Each release has a record under `docs/` (for example [the 2026-09-24 audit release](../FULL_AUDIT_2026-09-24.md)) naming the commit, deploy ids, checks and rollback target. Production traffic reaches the app through Cloudflare (Render's edge), so client addresses come from the trusted-proxy walk in `src/lib/client-ip.ts`, extendable with `TRUSTED_PROXY_CIDRS`. The Netlify test site named in the deployment section above no longer answers; that staging rule is flagged for the owner's decision and is not changed here.

Differences from the quote:
- The database and backup cron are defined in `infra/operations/`, not in `render.yaml` (`render.yaml:1-3`).
- The flagged staging rule was retired by D5 (§2.2).
- The tag date is the UTC deploy date (§2.19).

## 3. Canonical implementations

- [WF-06](workflows/WF-06-production-release.md): the release procedure, including rollback.
- `render.yaml` and `infra/operations/render-database.yaml`, `render-backup.yaml`, `render-monitor.yaml`.
- `scripts/production-smoke.mjs`: read-only public checks, usable in the postflight.
- `.github/workflows/production-smoke.yml`: the hourly outage alert.
- `docs/RUNTIME_DATABASE_CREDENTIALS.md` (the migration job), `docs/HOSTED_DEPLOYMENT.md` (topology and worker shutdown), and `docs/RESTORE_RECOVERY.md` with the other recovery runbooks.
- Model records: `docs/AUDIT_RELEASE_A2_2026-09-25.md` (code-only), `docs/AUDIT_RELEASE_B_2026-09-25.md` (migration and data reversal) and `docs/INVITE_PAGE_RELEASE_2026-09-27.md` (a release from `main`).
- Model tag message: `prod-2026-09-27-1da264f`.

## 4. Do / Don't

- **Do** treat "the worker deploys first, as always" as the default and say so in the record.
- **Do** rerun a postflight asset check once when an instance is still rolling over, as on 2026-09-25.
- **Do** list what the previous release does with any new column before deploying a migration.
- **Don't** deploy a branch head, a commit Kevin has not merged, or a commit to only one service.
- **Don't** publish to the retired Netlify test site or use `npm run smoke:staging` as release evidence.
- **Don't** run the owner migration job again for a redeploy when no migration is pending.
- **Don't** clear the recovery hold, or edit a checksum, to turn health green.
- **Don't** activate the prepared monitor or change an instance plan without Kevin.

## 5. Verification

- The record shows the preflight, backup, migration (when present), worker, web, postflight, smoke and final-check results, each labeled per JITM-12 §2.1.
- `git tag -l --format='%(contents)' prod-<date>-<sha7>` names the release, the pull request, both deploy ids and the previous commit.
- `git merge-base --is-ancestor <sha> origin/main` succeeds for the deployed commit.
- The final check shows counts equal to the preflight baseline and no synthetic rows.
- The record lists owner follow-ups and NOT RUN items.

## 6. Open decisions and known deviations

- **Backups before code-only releases.** §2.12 requires a fresh backup in every release, but only migration releases took one (`docs/AUDIT_RELEASE_B_2026-09-25.md:84`; `docs/INVITE_PAGE_RELEASE_2026-09-27.md:42-53`). Kevin: (A) always back up, as the rule says, or (B) back up only for migration releases, with the preflight confirming the nightly backup?
- **Rollback order.** §2.23 keeps web first, as `AGENTS.md:17` and most records say. Two records roll back worker first (`docs/MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:39`; `docs/INVITE_PAGE_RELEASE_2026-09-27.md:57`).
- **Stale runbooks.** `docs/HOSTED_DEPLOYMENT.md:55-62`, `docs/MIGRATION_RUNBOOK.md:45` and `docs/OPERATIONS_READINESS.md:58` still say web first, and their sequence includes a restore proof and a write freeze that practice does not run; §2.14 governs. `docs/WORKER_RECOVERY_QUALIFICATION.md:21` says the blueprint enables auto-deploy, which is off (`render.yaml:46,78`). `docs/MIGRATION_RUNBOOK.md:5-14` lists the migration chain only up to 2026-09-04.
- **Untracked pipeline.** The release scripts exist only in the ignored `.artifacts/` directory (`docs/FULL_AUDIT_2026-09-24.md:116`). Kevin: commit a parameterized release script and runbook under `scripts/release/`, or keep the scripts local?
- **Missing tags and records.** The seven tagged deploys `5a0c07b`, `def2e96`, `040fc25`, `84eda7a`, `ef87c3c`, `288fc26` and `9439fd6` have no record. `4b5abd8` has neither tag nor record. 22 of 31 tag messages lack deploy ids. Two production release records exist only in the owner's local checkout (`docs/standards-audit-2026-09-28/SOURCE_REGISTER.md`). Kevin: back-fill short records, or list them as a known gap?
- **Outage signal.** INFERRED: §2.30 is not met. Render failure notifications for the workspace, web, worker and backup cron were set by Kevin on 2026-09-26 (owner confirmation, recorded as TST-02 in the 2026-09-28 audit), but the hourly application smoke on GitHub Actions has probably not run since Actions was billing-blocked (`docs/INVITE_PAGE_RELEASE_2026-09-27.md:30`). Kevin: restore Actions billing, add a free external uptime check, or rely on Render notifications for now (audit question 1)?
- **Free-plan scope.** The blueprints name `0.5c-512mb` instances (`render.yaml:41,74`), while `docs/AUDIT_RELEASE_B_2026-09-25.md:110` calls the workspace Render's free Hobby plan. Billing is not visible to agents, so §2.25 reads O4 as "no additions or upgrades beyond what runs today".
- **Shutdown delay.** Whether the worker's 300-second shutdown delay is applied on the live service is unverified (`docs/AUDIT_RELEASE_B_2026-09-25.md:110`).
- **Staging leftovers.** `playwright.staging.config.ts`, `scripts/staging-smoke.mjs` and `.github/workflows/private-test-worker.yml` still target the retired site. `README.md:28-30` and `docs/HOSTED_DEPLOYMENT.md:3-5` still point to Netlify or call the runbook inactive.
- The independent monitor is prepared but not activated (`docs/INDEPENDENT_MONITOR_DEPLOYMENT.md:3`).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
