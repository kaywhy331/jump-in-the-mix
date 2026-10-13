---
id: JITM-12
title: Testing and verification
status: active
version: 2.0.0
owner: Kevin
last_reviewed: 2026-10-12
applies_to: [tests, e2e, checks, ci, screenshots, reports]
supersedes: []
sources:
  - CONTRIBUTING.md
  - docs/LOCAL_TESTING.md
  - docs/BROWSER_E2E.md
  - docs/MANUAL_DEVICE_QUALIFICATION.md
  - .github/workflows/ci.yml
  - playwright.config.ts
  - docs/AUDIT_RELEASE_A2_2026-09-25.md
  - docs/AUDIT_RELEASE_B_2026-09-25.md
  - docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md
  - docs/INVITE_PAGE_RELEASE_2026-09-27.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/FULL_AUDIT_2026-09-24.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
related_skills: [jitm-ui-change, jitm-copy, jitm-feature, jitm-review, jitm-release, jitm-audit]
related_workflows: [WF-02, WF-04, WF-05, WF-06, WF-07]
---

# JITM-12 — Testing and verification

> How work is proven: the evidence labels every report uses, what to run for each kind of change, how to compare with a baseline, how to check visuals, and which data and machines tests may use.

## 1. Purpose and scope

This standard applies to every claim that something works: in plans, pull requests, reviews, audits and release records. It defines the evidence labels that all JITM standards use, the local check tiers, the baseline method, the screenshot protocol, test data and resource limits.

Neighboring topics live elsewhere:
- the viewport list: JITM-07 §5;
- accessibility, performance budgets and physical-device qualification: JITM-10;
- production checks during a release: JITM-14;
- where records and evidence are filed: JITM-15;
- review scoring and severities: JITM-17.

## 2. Rules

### Evidence labels and completion claims

**2.1** Every check or claim in a plan, pull request, review, record or report MUST carry one of these labels:
- **VERIFIED** — observed. Say how: code (`path:line`), runtime (the command and its result, or a screenshot) or document (`path:line`). It may be written VERIFIED-CODE, VERIFIED-RUNTIME or VERIFIED-DOC.
- **INFERRED** — reasoned from evidence but not observed. Say from what.
- **NOT RUN** — not attempted. Say why.
- **BLOCKED** — attempted but prevented. Say by what, such as missing hardware, a permission or a tool.

PASS and FAIL describe a check's result; the label describes the evidence behind it. [OWNER 2026-09-28 O6] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:46-47] [SOURCE docs/MANUAL_DEVICE_QUALIFICATION.md:75-82]

**2.2** Older labels map onto §2.1 and MUST NOT be used in new reports: SUSPECTED becomes INFERRED, and "Not established" becomes NOT RUN. Statuses that describe an earlier finding's state (VERIFIED-FIXED, STILL OPEN, OPEN BY DECISION) are not evidence labels; a report that uses them still labels its evidence per §2.1. [SOURCE docs/FULL_AUDIT_2026-09-24.md:3] [SOURCE docs/UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md:70] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:148-155] [PROPOSED]

**2.3** "Done", "passes" or "fixed" is VERIFIED only by a run in the current task, on the commit being claimed, with the command and its result recorded. Earlier runs, other commits and older reports do not count; rerun them when the change touches their scope. [SOURCE docs/FULL_AUDIT_2026-09-24.md:9] [SOURCE docs/PRODUCT_QUALITY_GATES.md:11]

**2.4** Skipped tests never count as passing. A failed first attempt is recorded, not replaced by a later passing retry. [SOURCE docs/PRODUCT_AUDIT_FOLLOWUP.md:41] [SOURCE docs/RELEASE_QUALIFICATION_2026-09-06.md:17] [SOURCE docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:45-54]

**2.5** Agents MUST NOT loosen a check to make it pass: no longer timeouts to hide a failing selector, no longer health thresholds to hide missed worker ticks, no disabled assertions. Fix the cause or report FAIL. [SOURCE docs/IMPLEMENTATION_REPORT_2026-09-05.md:55] [SOURCE docs/FREE_TESTING.md:11]

**2.6** Evidence classes stay separate in every report: local runs, a local production build, the deployed production smoke, emulation and physical devices. Emulation never qualifies a physical-device row, and no one marks a device row passed without performing it on that device (JITM-10 §2). [SOURCE docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md:31,39] [SOURCE docs/MANUAL_DEVICE_QUALIFICATION.md:3]

**2.7** Every report ends with a NOT RUN list, even when it holds only "None". [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:359-373] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:59-61]

### What to run

**2.8** New behavior MUST get tests at the lowest layer that proves it (unit or integration in `tests/` or next to the code), plus browser tests in `e2e/` for a changed workflow. A test that asserts removed copy or a retired screen is fixed in the test, not by changing the product back. [SOURCE docs/MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:50] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:349-357]

**2.9** Every code change runs tier 1 before its pull request: `npm ci` (or `npm install`), then `npm run check`. That script runs `db:generate`, `validate:static`, `typecheck`, the unit and integration tests, and `build`. A change to the full local stack also runs the smoke test in `docs/LOCAL_TESTING.md`. [SOURCE CONTRIBUTING.md:13-26] [SHIPPED 9439fd6 package.json:55]

**2.10** Tier 2 adds the checks for each kind of change the diff touches:

| Change | Add |
|---|---|
| UI, layout, or copy shown in the UI | The affected browser specs on `desktop-chromium` and `mobile-chromium`; `npm run test:a11y`; screenshots (§2.18) |
| Public pages (`/`, `/for/*`) | `npm run test:lighthouse` on a production build; budgets are in JITM-10 §2 |
| Prisma schema or migrations | `npm run db:rehearse-migration`, then `npm run db:deploy` and `npm run db:verify-release` on a `jitm_design_*` database |
| Worker, jobs or imports | The worker and import suites, and `npm run worker:qualify` |
| Backup, restore or recovery | `npm run db:rehearse-restore` and the recovery suites |
| Dependencies | `npm run security:audit` |
| Staff, admin, email, operations or voice | The gated browser suites with their flags and server setup (`docs/BROWSER_E2E.md`) |

[SOURCE docs/LOCAL_TESTING.md:20-37] [SOURCE docs/MIGRATION_RUNBOOK.md:29] [SOURCE docs/OPERATIONS_READINESS.md:66] [SOURCE docs/BROWSER_E2E.md:37-41]

**2.11** Tier 3, for a release candidate, is the pre-release verification that replaced staging: a local production build of the candidate, tier 1 and every tier 2 row the release touches, and the desktop browser suite (phone too when layout changed), all compared with the baseline (§2.14). The post-deploy smoke follows in JITM-14 §2. [OWNER 2026-09-28 D5] [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:61-73]

**2.12** GitHub Actions has been blocked by billing, so CI runs locally, with the environment of the `validate` job in `.github/workflows/ci.yml`. The practiced set is Vitest, `validate:static`, the typecheck, the build, the dependency audit, gitleaks, and the Playwright desktop and phone groups on a freshly seeded database. A record MUST name every CI job that was not run, with NOT RUN and the reason; the usual gaps are the migration and restore rehearsals, load qualification, the packaged-server suites, Lighthouse and the image builds. [OWNER 2026-09-28 D8] [SOURCE docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:31-38] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:30-38]

**2.13** A run limited to the affected suites is acceptable when the record says what was left out and why, for example "phone project not rerun: no layout change". [SOURCE docs/AUDIT_RELEASE_B11_2026-09-25.md:61] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:38]

### Baseline comparison

**2.14** Before calling a failure a regression, compare the candidate with a baseline:
1. Build the baseline and the candidate as production builds. The baseline is `origin/main` for a pull request, and the previous production commit for a release.
2. Serve them on separate ports with the CI environment.
3. Run the specs against the candidate in small batches of five or six files.
4. Rerun each failure alone, on both builds.
5. Classify each failure: new (fails only on the candidate), pre-existing (fails the same way on the baseline), order-dependent (fails in its batch and passes every time alone), intermittent (both fails and passes when rerun alone on the same build) or environmental (host tooling). Run an intermittent failure alone five times on the candidate and five times on the baseline; when it fails more often on the candidate it counts as new. [OWNER 2026-10-12 D101]

Nothing new may fail: no failure only on the candidate, and no intermittent failure that fails more often on the candidate. [OWNER 2026-09-28 D5] [OWNER 2026-10-12 D101] [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:74-77] [SOURCE docs/AUDIT_RELEASE_B_2026-09-25.md:70-77]

**2.15** Pre-existing failures are compared, not blamed. The record lists each by spec with its cause, marks it as not blocking, and schedules a test-only follow-up. [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:79-103]

**2.16** Suites that need an empty catalog, such as the staff-access bootstrap tests, run through `npm run test:isolated`. A failure on a shared seeded database is not a regression. [SOURCE docs/LOCAL_TESTING.md:45-51] [SHIPPED 9439fd6 scripts/test-isolated-database.mjs:5-14]

**2.17** A backup or restore suite that fails because PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) are missing is BLOCKED by the environment, not a product FAIL. Install the client, or report it. [SOURCE docs/OPERATIONS_READINESS.md:41] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:336]

### Visual verification

**2.18** UI changes MUST be verified with screenshots:
- both themes, plus System mode when the change touches theming, at the JITM-07 §5 widths the change touches, including both sides of each breakpoint it touches;
- compared with the matching export screen (JITM-06 §2), or with the page archetype when no screen exists;
- inspected by the agent, with differences written down, because passing scripts do not prove visual fidelity;
- taken from a production build with synthetic data.

[SOURCE AGENTS.md:21] [SOURCE docs/JOURNEY_PRODUCTION_RELEASE_2026-09-21.md:32]

**2.19** Screenshots and other captures hold synthetic data only. Raw captures stay private under `.artifacts/` and enter the repository only through a sanitized evidence folder (JITM-15 §2.16), after each selected file is checked for sensitive URLs, tokens, account details and other incidental information. Suites that show secrets, setup codes or recovery codes run with `PLAYWRIGHT_CAPTURE=off`. [OWNER 2026-09-28 D25] [SOURCE docs/BROWSER_E2E.md:41,47] [SHIPPED 9439fd6 playwright.config.ts:4,23-25]

### Test data and environments

**2.20** Tests use fictional data only: synthetic accounts, reserved example domains (such as `example.com`, `.test` and `.local`) and 555 phone numbers. Real customer data, tokens, passwords, databases and backups MUST NOT appear in fixtures, logs or reports. [SOURCE docs/LOCAL_TESTING.md:65] [SOURCE docs/PUBLIC_REPOSITORY_HYGIENE.md:15-17]

**2.21** Suites that write data run only against a loopback database named `jitm_design_*`. Deterministic test credentials and demo data MUST NOT be created in production, and no test uses a real customer's account; production checks use the temporary synthetic owner in JITM-14 §2.17. [SOURCE docs/BROWSER_E2E.md:31,39] [SOURCE docs/LOCAL_TESTING.md:16] [SHIPPED 9439fd6 scripts/test-isolated-database.mjs:11]

**2.22** Tests MUST NOT depend on the wall clock or the time of day: pin the clock or build times from a fixed instant. [SOURCE docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md:61] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:29]

**2.23** Direct API calls in tests send the same-origin headers production requires, so they exercise the real origin check. [SOURCE docs/MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:52]

### Resource discipline

**2.24** On a host with limited memory, run one heavy job at a time: a build, a typecheck, a Playwright run or a Lighthouse run. Stop servers that are no longer needed before starting the next one. [SOURCE docs/FULL_AUDIT_2026-09-24.md:98] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:469]

**2.25** Give each server its own port and stop it afterwards. When projects share a machine, give Playwright its own browser cache with `PLAYWRIGHT_BROWSERS_PATH`. [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:74] [SOURCE docs/BROWSER_E2E.md:80]

## 3. Canonical implementations

- Commands (`package.json`): `check`, `validate:static`, `typecheck`, `test`, `test:isolated`, `build`, `test:e2e`, `test:a11y`, `test:lighthouse`, `db:rehearse-migration`, `db:verify-release`, `db:rehearse-restore`, `worker:qualify`, `security:audit`.
- `playwright.config.ts`: projects `desktop-chromium` and `mobile-chromium` (Pixel 7), one worker, `PLAYWRIGHT_CAPTURE`, `PLAYWRIGHT_WEB_SERVER_COMMAND`.
- `vitest.config.ts`: serial test files and `.env` loading.
- `.lighthouserc.cjs`: the public URLs, runs and throttling; the budgets belong to JITM-10.
- `.github/workflows/ci.yml`: the `validate` job's order and environment, which the local run copies.
- `scripts/test-isolated-database.mjs` and `scripts/production-smoke.mjs`.
- `docs/BROWSER_E2E.md` (gated suites and flags), `docs/LOCAL_TESTING.md`, `docs/MANUAL_DEVICE_QUALIFICATION.md`.
- Model records: the verification sections of `docs/AUDIT_RELEASE_A2_2026-09-25.md` and `docs/INVITE_PAGE_RELEASE_2026-09-27.md`.

## 4. Do / Don't

- **Do** write "VERIFIED-RUNTIME: `npm run typecheck` PASS on 1da264f", not "types are fine".
- **Do** rerun a failing spec alone on the baseline build before blaming the change.
- **Do** say "NOT RUN: Lighthouse; no public page changed" when a check is skipped on purpose.
- **Do** capture `/jumps` at the JITM-07 §5 widths in light and dark, next to the export's Today screen.
- **Don't** raise a Playwright timeout until a flaky selector passes.
- **Don't** count a spec that skipped on the phone project as covered.
- **Don't** reuse a screenshot from before the last commit as evidence.
- **Don't** run a build, a browser suite and Lighthouse at the same time on a small machine.

## 5. Verification

- The report or pull request labels every check with §2.1 and ends with a NOT RUN list.
- The commands run match the tiers in §2.9–§2.11 for the files the diff touches.
- Every failure named in the report is classified as in §2.14, with the baseline commit named.
- UI work includes the screenshots §2.18 requires, with the differences noted.
- `git diff` shows no real personal data in fixtures.

## 6. Open decisions and known deviations

- **CI is not a working gate.** The `validate` job hits its 60-minute cap (`.github/workflows/ci.yml:18-21`) and Actions is billing-blocked (`docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:31`). Kevin will restore Actions for CI and the broader smoke checks (D13); until then, local runs (§2.12) are the gate.
- **Screenshot policy.** Kevin confirmed §2.19 (D25). `docs/MANUAL_DEVICE_QUALIFICATION.md:5` still carries an older no-image instruction and needs a banner.
- **Release baseline.** D5 names an `origin/main` baseline. A release candidate is `origin/main` itself, so §2.14 compares a release with the previous production commit instead; pull requests still compare with `origin/main`.
- **Pre-release lists differ.** `npm run check`, `CONTRIBUTING.md:17-24`, `docs/LOCAL_TESTING.md:22-37` and `ci.yml` each list different checks. §2.9–§2.12 now govern.
- **No tracked authenticated production smoke.** `npm run smoke:staging` can target only the retired test site (`docs/FREE_TESTING.md:27`). The release smoke lives in untracked scripts (JITM-14 §6).
- **Known pre-existing failures, as last recorded:**
  - `journey-connections.spec.ts:310`, order-dependent (`docs/BETA_READINESS_AUDIT_2026-09-26.md:339`);
  - `admin-workflow-regressions.spec.ts:92`, timing-dependent (`:340`);
  - `staff-permissions.spec.ts:64` under CI's MFA-off group (`:341`);
  - the `staff-access` bootstrap tests on a shared database (§2.16);
  - `mega-mix-pipelines` phone screenshot timeout (`docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:38`).
- The hosted load-fixture suite exits at start on the local build host, for environmental reasons (`docs/BETA_READINESS_AUDIT_2026-09-26.md:347`).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 1.0.1 — 2026-09-28 — Base 61d4df4. §2.19 confirmed, with the check before committing evidence (D25); §6 updated for D13.
- 2.0.0 — 2026-10-12 — Base 4e78545. §2.14 changes meaning: a fifth class, intermittent (both fails and passes when rerun alone on the same build), is run alone five times on each build, and one that fails more often on the candidate counts as new; the gate now reads "Nothing new may fail", so such a failure blocks like one only on the candidate (D101). Order-dependent now reads "passes every time alone".
