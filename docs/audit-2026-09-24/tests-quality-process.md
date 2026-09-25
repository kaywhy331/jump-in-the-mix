# Tests, quality and process audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only audit of the repository at `d70ec54` (= live `e26fdd4` + one docs commit) for the **tests-quality-process** dimension: what could let a broken release reach https://jumpinthemix.com unnoticed. Nothing was built, run or edited. Tools: `git log/blame/diff/branch`, `grep`, `find`, `sed`, and two small `node` scripts in the scratchpad that only read files (`scan2.cjs`: e2e literal-string presence in `src/`, `prisma/`, `scripts/`, `public/`; `dead.cjs`: never-imported modules and duplicate exports). Evidence from the previous session was read from `(local run logs, 2026-09-24)/*.txt`. GitHub itself (Actions runs, branch protection, open PRs) was **not** reachable; everything about GitHub state is inferred from the repository and its docs and marked accordingly.

Severity scale: P0 = a release could ship broken without anyone noticing; P1 = meaningful blind spot or process hazard; P2 = hygiene. Status: VERIFIED = seen in the cited file/line or git object; SUSPECTED = inferred, not executed.

---

## Findings (ranked by threat to safe releases)

### F1. Nothing on the last 65 commits and 5 production releases has been through CI
- Severity: **P0**
- Status: **VERIFIED** (repo side); GitHub side not reachable
- Evidence:
  - `.github/workflows/ci.yml:3-6` — `on: push: branches: [main]` and `pull_request:` only. Same in `docker-build.yml:3-6` and `security.yml:3-9`. The workflow files were last changed 2026-09-16 (`04a4af4`).
  - `git log --first-parent e1ec120..d70ec54` — 65 commits since PR #81 (`e1ec120`, 2026-09-17), all by one author, **no merge commit and no `(#nn)` reference**; `git branch -r --contains d70ec54` → only `origin/fix/test-failures-20260924`.
  - Last CI run cited anywhere in the repo: `docs/ADMIN_DENSITY_2026-09-17.md:57` (`actions/runs/35246447860`). The five later release records (`docs/JOURNEY_PRODUCTION_RELEASE_2026-09-21.md`, `UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md`, `UX_GAP_FIXES_PRODUCTION_RELEASE_2026-09-23.md`, `UX_GAP_FIXES_2_PRODUCTION_RELEASE_2026-09-23.md`, `MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md`) contain **zero** mentions of CI, GitHub Actions, or any spec/vitest file; four say "isolated production build" and rely on local runs.
  - What only CI runs and no local record covers since 09-17: `ci.yml:108-123` migration/rollback/reapply rehearsal + `db:verify-release`; `:182-186` encrypted backup/restore rehearsal; `:206-225` recovery-hold and hosted-load integration suites; `:226-246` restricted-runtime-role browser flows; `:276-318` the 18 admin/staff/MFA/email/retention specs; `:331-335` Lighthouse budgets; `:350-355` production images.
- Failure scenario: a migration that does not roll back, a backup that no longer restores, an admin MFA regression, or an accessibility/performance budget breach ships to the customer site; the release record still says "verified" because the local run covered a different slice (see F4/F5).
- Fix (minimal): open **one** pull request `fix/test-failures-20260924 → main` today; `pull_request:` already triggers all three workflows on the exact live tree. Then add to `ci.yml:3-6`: `workflow_dispatch:` and `push: branches: [main, 'release/**']`, and make "CI run URL for the deployed SHA" a mandatory row in every release record table (the 09-15/09-16/09-17 records already had one).
- Effort: S; Risk: none to production (CI is read-only); Needs owner decision: **yes** (branch/merge policy).

### F2. The customer site runs code that only one unmerged branch references; `main` is 14 days and 1,098 files behind
- Severity: **P0** (rollback/recovery hazard) 
- Status: **VERIFIED**
- Evidence:
  - `git rev-parse origin/main` = `4615ade` (PR #51, 2026-09-10); `git merge-base --is-ancestor origin/main d70ec54` → **no**; merge-base is `bb9bf39`. `git diff --stat origin/main d70ec54` → 1,098 files, +103,332 / −4,135.
  - `4615ade` is an empty merge: its tree (`ba99890e…`) equals its second parent `bb9bf39`'s tree, so `main` carries **no content** that live lacks — only the merge commit object.
  - Tags: `v0.1.0-rc.1` (`99a5afd`, 2026-07-22) and `v0.1.0-rc.2` (`e08e1d3`, 2026-07-23) only. No production release has ever been tagged; every rollback target in the release records is a raw SHA on an unmerged branch (`MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:7-8,39,43,61`).
  - 97 remote branches (`git branch -r | wc -l`), including 27 `agent/*`, 9 `backup/*`, 13 `release/*`; the live SHA `e26fdd4` is reachable only from `origin/fix/test-failures-20260924`.
- Failure scenario: a routine "delete merged/stale branches" pass (or GitHub's own stale-branch prompt) makes the live commit unreachable; a rollback instruction like "deploy `3d06312`" cannot be fetched; a new engineer cloning `main` builds a two-week-old app and files bugs that are already fixed; PR previews and dependency bots target the wrong tree.
- Fix (minimal): (1) push annotated tags for the deployed SHAs now — at least `prod-2026-09-24-e26fdd4`, `prod-2026-09-24-3d06312`, `prod-2026-09-23-fad339d`, `prod-2026-09-23-0b175a5`, `prod-2026-09-23-5b264a6`, `prod-2026-09-23-3f85c77`, `prod-2026-09-21-*` — tags are the only ref type that survives branch cleanup; (2) catch `main` up (options in "CI and branch state"); (3) protect `main`.
- Effort: S; Risk: low (tags/merges do not touch production); Needs owner decision: **yes**.

### F3. The production release procedure is not in version control
- Severity: **P1**
- Status: **VERIFIED**
- Evidence:
  - `docs/MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:3` — "using `.artifacts/market-live-20260924/release.mjs`"; `:43` — "The scripts are `.artifacts/market-live-20260924/fixes-*.mjs`". `docs/JOURNEY_PRODUCTION_RELEASE_2026-09-21.md:36` — evidence "retained under ignored `.artifacts/workflow-live-20260921/`".
  - `.gitignore:26` ignores `.artifacts/`; `git ls-files | grep -E 'release\.mjs|fixes-'` → nothing tracked. The scripts exist only under `/home/trix/home/trix/project/jump-in-the-mix/.artifacts/{live-onboarding-20260918,contractor-ux-live-20260922,channels-live-20260923,design-live-20260923,market-live-20260924}/` (files such as `deploy.mjs`, `finalize.mjs`, `fixes-deploy.mjs`, `backup.mjs`).
  - The only tracked Render deploy instructions are inside a one-off hand-off, `docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:97-123`; `docs/HOSTED_DEPLOYMENT.md:3` still says "this runbook is not evidence of an active production deployment".
- Failure scenario: the TrixBot disk, worktree or agent memory is lost, or a different operator has to roll back at night: there is no reproducible deploy/rollback/smoke procedure and the "evidence" cited by every release record cannot be reviewed.
- Fix: commit a `scripts/release/` set (preflight, backup trigger, migrate, deploy-by-SHA for worker then web, postflight hash check, smoke) that reads all secrets from the environment, plus a short `docs/RELEASE_RUNBOOK.md`; keep per-release outputs in a tracked `docs/releases/<date>/` (JSON/log without secrets) instead of `.artifacts/`.
- Effort: M; Risk: low; Needs owner decision: yes (what evidence may be tracked).

### F4. The 09-24 release record claims a pass that no saved run shows; root cause of the `journey-connections` seeding failure
- Severity: **P1**
- Status: cause **VERIFIED**; "now passes" **UNVERIFIED**
- Evidence:
  - Root cause: `src/proxy.ts:43-63` `mutationAllowed()` — for a non-safe method with **no `Origin` header**, the request is allowed only if `sec-fetch-site` is `same-origin|same-site|none`, otherwise `return !isProduction && !fetchSite` (`:60`), with `isProduction = process.env.NODE_ENV === "production"` (`:11`). Rejection is `403 "The request origin is not allowed."` (`:143-146`). Playwright's `page.request.post()` is issued by Node, not the browser, so it carries neither `Origin` nor `Sec-Fetch-Site`. Under `npm run dev` the branch at `:60` lets it through; under the production build it is refused. The route itself does not check origin (`src/app/api/mix-workflow/route.ts:48-86`).
  - `expectedRule: null` is **not** the cause: `src/lib/mix-workflow-config.ts:20` (`expectedRule: workflowRuleSchema.nullable()`) and the seeded rule matches every `.strict()` shape in `mix-workflow-config.ts:6-15` (`outcome: ""` passes `max(160)`, `maxVisits: null`, `join: null` allowed).
  - `git blame e2e/journey-connections.spec.ts` lines 288, 336, 340 → `e26fdd4` (2026-09-24 13:40:23 −0700) added `headers: { Origin: process.env.APP_URL! }`; line 148 already had it since `a3ddb50` (09-21).
  - The failing evidence `final-prod2.txt` (mtime 13:38:16 −0700) shows line 288 **without** the header and `5 failed / 38 passed`, desktop project only. There is no later saved run: no `test-results/` or `playwright-report/` in `/tmp/jitm-market-20260924`, and the last `.txt` is 13:38. Yet `docs/MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:51` (committed 13:50) states "On a production build, these all pass on desktop **and phone**: … journey-connections …".
- Failure scenario: release notes are trusted as evidence; the next "all pass" statement hides a real failure because the habit of writing the claim before saving the run is established.
- Fix: re-run `npx playwright test e2e/journey-connections.spec.ts` (both projects) against a production build with the test database, save the log next to the record, and amend `:51`. Process rule: a release record may only cite runs whose log file is referenced by path.
- Effort: S; Risk: none; Needs owner decision: no.

### F5. Browser specs assert UI copy that the redesigns removed; 63 of 73 specs have no run evidence since 09-17
- Severity: **P1**
- Status: string absence **VERIFIED**; failure **SUSPECTED** (not executed)
- Evidence (spec line → current source):
  - `e2e/channel-variants.spec.ts:70` `getByText("Also offer as…")` → no such text in `src/`; the Beat editor now renders "Text version / Email version / Call version · talking points for you" (`src/components/MixEditor.tsx:256-258`, changed by `be4698a` 09-23).
  - `e2e/voice-capture.spec.ts:64` button "Add person & follow-up" → no "Add person" label anywhere in `src/`; the dialog is now "Quick Add" (`src/components/QuickAdd.tsx:135`). The same string was removed from `visual-fitment.spec.ts` in `4f66065`, but `voice-capture` was not updated (it is `VOICE_E2E`-gated and runs only in CI step `ci.yml:301`).
  - `e2e/beat-timing.spec.ts:66` label "Minutes after it is marked completed" → now "Minutes after completion" (`MixEditor.tsx:231`); `:130` expects "3 beats · 3 timed from a visit" → now "… timed from an appointment …" (`MixEditor.tsx:271`).
  - `e2e/quiet-days.spec.ts:126` button "Find someone in the journey" → now `aria-label="Find someone to start"` (`src/components/WorkflowJourney.tsx:248`); `:128` searchbox "Search this journey" → absent.
  - `e2e/mix-list-pagination.spec.ts:52` `getByLabel("Filter mixes by status")` → only `aria-label="Filter mixes"` exists (`src/app/(app)/mixes/page.tsx:58`).
  - Vacuous assertions: `e2e/mobile-clarity.spec.ts:66` asserts "Check the details" is **not** visible and `e2e/mix-list-pagination.spec.ts:49` asserts "Create a basic starter mix" has count 0 — both strings no longer exist, so the checks pass without testing anything.
  - Session coverage: the 23 saved run logs cover exactly 10 specs (accessibility, design-correction, journey-analytics, journey-connections, journey-rule-editing, marketplace, mega-mix-pipelines, mega-mixes, mix-library-workspace, ready-made-panes, visual-fitment). The other 63 — including ungated core suites `core-flows`, `today-navigation`, `sheet-interactions`, `contractor-user-journey`, `customer-journey` — have no evidence since CI run 35246447860 (09-17), while 65 UI-heavy commits landed.
  - Method note: the scan (`scratchpad/audit/stale-strings.txt`) flags 341 of 1,735 literals, but most are fixture names or JSX-composed strings (e.g. `MarketplaceControls.tsx:54,72`, `TimezonePicker.tsx:64`); only the items above survived manual checking.
- Failure scenario: the suite is assumed green because the last look was at a subset; when CI finally runs it fails in a dozen places and the failures are "aligned" in bulk (as in `4f66065`, `83561d6`, `39d661d`: 150 lines rewritten in `design-correction.spec.ts` alone) rather than investigated one by one.
- Fix: one full run on the production build (F1's PR does this), then fix or retire each stale assertion in its own commit with the product change it follows.
- Effort: M; Risk: none; Needs owner decision: no.

### F6. No repo-tracked smoke can target production; the documented staging gate no longer matches practice
- Severity: **P1**
- Status: **VERIFIED**
- Evidence:
  - `src/lib/staging-smoke-account.ts:9` `APPROVED_STAGING_TARGETS = ["https://jump-in-the-mix-test.netlify.app"]`; `:20-21` refuses any other target; `playwright.staging.config.ts:3-4` requires `STAGING_BASE_URL`; `e2e/staging-*.spec.ts` are the only remote suites. Nothing tracked can run against `https://jumpinthemix.com`; the production smokes were the untracked `.artifacts` scripts (F3).
  - `AGENTS.md:13` still mandates the Netlify test site as the staging hand-off, but `docs/JOURNEY_PRODUCTION_RELEASE_2026-09-21.md:3,36` records that the Netlify test database (Neon quota) refused connections and the release went straight to live; no later record mentions staging.
  - `.github/workflows/private-test-worker.yml:4-6` still fires every 5 minutes at the Netlify test site (`:21`), gated only by `vars.JITM_TEST_EXPIRES_AT`.
- Failure scenario: a deploy that passes health but breaks sign-in (exactly the 2026-09-16 incident, `docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:67-91`) is detected by customers, not by a check.
- Fix: add `https://jumpinthemix.com` as an approved **read-only** smoke target (public pages, `/api/health/ready`, login page render, no writes) in `scripts/staging-smoke.mjs`, run it from the tracked release script after every deploy; decide whether the Netlify test site is retired (then stop the cron) or restored as the gate.
- Effort: S–M; Risk: low; Needs owner decision: **yes**.

### F7. Open audit items 3, 4, 6, 11, 12 and the P2 list have neither implementation nor automated check
- Severity: **P1** (item 6 is a data-loss path)
- Status: **VERIFIED** (by grep; see table)
- Evidence: item 6 — `src/lib/mix-editor-actions.ts:255` `tx.mix.update({ where: { id: mixId } })` and `src/lib/contact-actions.ts:25` update by id with no revision/`updatedAt` guard (no match for `revision|updatedAt|stale` in either file); no test mentions a two-tab or stale-save conflict for Mix/contact. Item 11 — `aria-invalid` appears only in `PublicLeadForm.tsx`, `LibraryDraftForm.tsx`, `WaitlistForm.tsx` (public forms), never in `e2e/` or `tests/`. Item 12 — `src/components/ContactsBulkWorkspace.tsx` has no `.focus(`/`autoFocus`; no e2e asserts focus after selecting a contact (`design-correction.spec.ts:205-226` covers the rail Profile button, not the profile heading). Items 3/4 — no test mentions invite + Google/Apple; "already used" appears only in `tests/admin-mfa.test.ts:52-54`. P2 — no `onboardingDone` check under `src/app/onboarding/`; `ContactProfile.tsx:213` archive uses a plain submit button (double-submit item); no idempotency key in `contact-actions.ts` for creation.
- Failure scenario: item 6 silently drops Beats or phone numbers when two devices edit (the audit's own wording); items 11/12 fail the next accessibility review; none of it would be caught by CI.
- Fix: when item 6 is built, add `tests/…integration.test.ts` (stale revision → 409/friendly error) and a two-context e2e; add `aria-invalid`/`aria-describedby` assertions to the existing contact and Mix form specs; add a focus assertion to `live-search-contact-layout.spec.ts:71`.
- Effort: M (with the fixes); Risk: low; Needs owner decision: yes (item 6 UX).

### F8. Quality gates are thinner than they look: no linter/formatter, `.mjs` never type-checked, `check` omits e2e
- Severity: **P2**
- Status: **VERIFIED**
- Evidence: no `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `.editorconfig` at the root; `package.json:63-64` `check` = `db:generate && validate:static && typecheck && test && build` (no `test:e2e`, no `security:audit`); `tsconfig.json:9` `allowJs: false` so `src/lib/recovery-hold-*.mjs`, `scripts/**/*.mjs`, `netlify/` JS are only parsed by `scripts/validate-syntax.mjs:3` (esbuild transform) and import-resolved by `scripts/validate-imports.mjs:24-37`; `tsconfig.json` lacks `noUnusedLocals`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; 128 `eslint-disable` comments in `src/` (126 in `src/generated/`, 2 elsewhere) are inert; `playwright.config.ts:17` `retries: process.env.CI ? 1 : 0` masks flakes in CI; `ci.yml:350-355` builds the same images `docker-build.yml` builds (duplicate ~5–10 min); `ci.yml:130` `scheduler:check` downloads `wrangler@4.129.0` via `npx --yes` on every run for an unactivated Cloudflare timer.
- Failure scenario: unused imports, shadowed variables and inconsistent formatting accumulate unnoticed; a broken `.mjs` operational script (backup/restore) fails only at run time.
- Fix: add `eslint.config.mjs` with `typescript-eslint` recommended + `react-hooks`, run it in `validate:static`; set `checkJs`-lite by adding `// @ts-check` to `scripts/*.mjs` or enabling `allowJs`+`checkJs` for `scripts/` only; drop the image build from `ci.yml` (keep `docker-build.yml`).
- Effort: M; Risk: low; Needs owner decision: no.

### F9. Dead code, duplicates and repository hygiene
- Severity: **P2**
- Status: **VERIFIED**
- Evidence: never imported anywhere (`dead.cjs` + basename grep): `src/components/JourneyMap.tsx` (57 lines, last 09-20), `JourneySelection.tsx` (33, 09-19), `JourneyStageView.tsx` (26, 09-19), `SendTimeField.tsx` (16, 09-09), `src/lib/shared-mix-actions.ts` (32, 09-09). Duplicate export: `isQuietTime` in `src/lib/notification-delivery.ts:47` and `src/lib/snooze-schedule.ts:72` (same semantics, two bodies). Scripts referenced nowhere: `scripts/audit-industry-mixes.mjs`, `scripts/render-ui-ux-checklist.mjs` (hard-codes `docs/ui-ux-audit-2026-09-18`), `scripts/generate-brand-assets.mjs` (imports `sharp`, which is not a declared dependency — only an `overrides` entry), `scripts/prepare-operations-stack.mjs`. Three local-start systems (`scripts/pilot.mjs`, `quickstart.mjs`, `native-quickstart.mjs`) plus 20 platform launcher files (`start-local.*`, `stop-local.*`, `reset-local.*`, `rebuild-local.*`, `doctor.*`) and a `Makefile`. `package.json:2-3` `"jump-in-the-mix-mvp"` `0.1.0` while tags are July RCs; `package.json:100` `web-push: "^3.6.7"` is the only unpinned range. TODO/FIXME/HACK/XXX in code: **0**. `.only(`: **0**.
- Failure scenario: contributors edit `JourneyStageView.tsx` believing it is live; `generate-brand-assets.mjs` breaks when `next` stops pulling `sharp`.
- Fix: delete the five modules and two one-off scripts; import `isQuietTime` from one place; either declare `sharp` as a devDependency or remove the script; bump `version` to match the next tag.
- Effort: S; Risk: none; Needs owner decision: no.

### F10. Environment and documentation tell the July/Netlify story to a September/Render product
- Severity: **P2** (P1 for `SECURITY.md`, which is public-facing)
- Status: **VERIFIED**
- Evidence: see "Env and docs drift" below. Headline items: `SECURITY.md:3` "early single-user, self-hosted release candidate … the current `main` branch receive[s] security fixes … No hosted service"; `README.md:26-28` leads hosted deployment with Netlify; `docs/HOSTED_DEPLOYMENT.md:3` "not evidence of an active production deployment"; `AGENTS.md:13` names only Netlify; `.env.example:43` `POSTGRES_PORT` read by nothing; seven runtime keys absent from `.env.example`.
- Fix: one docs pass: rewrite `SECURITY.md` for the hosted service, move Netlify to a "test environment" section, add a "Production (Render)" section to `README.md` and `AGENTS.md`, mark `00_START_HERE.txt`/`EASY_START_RELEASE_NOTES.md`/`WINDOWS_DOCKER_FIX.md` as the secondary Docker edition or archive them under `docs/archive/`.
- Effort: S; Risk: none; Needs owner decision: yes (Docker edition status).

---

## Test inventory

**Vitest (unit + DB-gated integration).** 201 files: 185 `*.test.ts(x)` (175 in `tests/`, 10 in `src/lib/`) and 16 `tests/*.test.mjs`; 1,147 static `it`/`test` calls plus 84 `.each(` tables (so the run count is higher: CI on 09-17 recorded 1,259 passed / 9 skipped, `docs/ADMIN_DENSITY_2026-09-17.md:57`; a local run on 09-23 recorded 1,413 passed, `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:134`). `vitest.config.ts:14-21` excludes `e2e/**`, runs files serially. Gating: 50 suites use `describe.skipIf(!local)` where `local` = loopback `DATABASE_URL` with a `jitm_design_` database name (pattern at e.g. `tests/mix-workflow.integration.test.ts:8`); `tests/follow-up-push.integration.test.ts:14` (`RUN_PUSH_DATABASE_TESTS`), `tests/plan-library-publishing.integration.test.ts:15` (`RUN_PLAN_DATABASE_TESTS`), `tests/worker-runtime.integration.test.ts:149` (`RUN_WORKER_UNATTENDED_TESTS`); `tests/recovery-hold-runtime.integration.test.mjs` and `tests/hosted-load-fixture.integration.test.mjs` run only as separate CI steps (`ci.yml:206-225`, `RUN_RECOVERY_WEB_TESTS`/`RUN_HOSTED_LOAD_WEB_TESTS`). No unconditional `skip`/`todo`, no `.only`. `tests/uptime_test.py` runs in `docker-build.yml:70` only. `npm run test:isolated` (`scripts/test-isolated-database.mjs`) creates and drops a per-run database for catalog-sensitive suites.

**Playwright.** 73 spec files, 431 static `test(` calls, projects `desktop-chromium` + `mobile-chromium` (`playwright.config.ts:27-36`), `workers: 1`, `retries: 1` in CI. File-level gates: 27 specs skip without the loopback `jitm_design_` database (e.g. `e2e/journey-connections.spec.ts:8`); 18 admin/staff specs need `*_E2E=1` flags (most also `AUTH_REQUIRE_ADMIN_MFA=true`), listed at `ci.yml:276-318`; `public-trust.spec.ts:4` needs `PUBLIC_TRUST_E2E=1`; `push-ownership.spec.ts:7-8` needs VAPID keys (CI generates them, `ci.yml:156-164`); `staging-*.spec.ts` need `STAGING_BASE_URL`; ~40 further `test.skip(project !== …)` lines run a case in one project only. 20 specs have no file-level gate.

**Not run by CI at all (VERIFIED against `ci.yml`):** `e2e/ui-ux-public-auth.spec.ts:11` (skips unless `PLAYWRIGHT_BASE_URL` contains `127.0.0.1`; CI never sets it — 0 occurrences in `ci.yml`); `e2e/browser-privacy.spec.ts:58,197` (need `PRIVACY_UPGRADE_FIXTURE=1`); `e2e/staging-smoke.spec.ts` and `e2e/staging-channel-variants.spec.ts` (4 tests); everything under `playwright.compat.config.ts` (Firefox/WebKit; CI installs Chromium only, `ci.yml:198`). The 18 flag-gated admin specs run **desktop only** (`ci.yml:301,318 --project desktop-chromium`).

**Likely-stale specs (strings gone from `src/`, spec not run since the change; see F5):** `channel-variants.spec.ts:70` ("Also offer as…"), `voice-capture.spec.ts:64` ("Add person & follow-up"), `beat-timing.spec.ts:66,130` ("Minutes after it is marked completed", "… timed from a visit"), `quiet-days.spec.ts:126,128` ("Find someone in the journey", "Search this journey"), `mix-list-pagination.spec.ts:52` ("Filter mixes by status"); vacuous: `mobile-clarity.spec.ts:66`, `mix-list-pagination.spec.ts:49`. **Fixed at d70ec54:** `tests/shared-mix-boundary.test.ts` — all eleven expected substrings are present in the three files it reads (`4f66065` updated it); the "stale string" named in the task refers to the state before that commit (`docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:103`).

**Last session's evidence:** 23 logs, 10 specs, desktop-heavy; `final-prod.txt` 43 passed (design-correction, visual-fitment, desktop), `final-prod2.txt` 38 passed / 5 failed (journey-connections, pre-fix), `mobile-fix.txt` 25 passed / 7 skipped (mobile).

---

## Coverage gap table

| Feature / item | Existing automated check | Gap |
|---|---|---|
| Beat numbering (4a/4b, nested) | `tests/journey-numbering.test.ts` (12 unit cases incl. every built-in Mega-Mix); `e2e/mega-mix-pipelines.spec.ts:45` (one outline string "3a–4a") | No browser check that the numbers shown on the Journey map/connection editor match; no test for renumbering after a path is deleted or a branch re-joined (`journey-connections.spec.ts` deletes paths but asserts no numbers) |
| Named Mega-Mixes, export/import | `tests/mega-mix-pipelines.integration.test.ts` (7: naming, export→import identity, channel versions + timing survive, cross-Mega-Mix connections dropped, duplicate/rename/move, removal, foreign-file refusal); `e2e/mega-mix-pipelines.spec.ts` (3) | No size/limit test for a hostile file (deep nesting, 10k Mixes); no forward/backward format-version test; import runs as the signed-in owner only — staff/impersonation path not covered |
| Marketplace moderation | `tests/marketplace.integration.test.ts` (7: live listing follows edits, favorites sort, serious-report auto-hide + author notice + staff restore, one report per person, stop sharing keeps copies, privacy refusal, official section); `tests/marketplace.test.ts` (7 privacy-check rules); `e2e/marketplace.spec.ts` (2) | No rate limit/abuse test for reports or shares; no test for permanent removal or repeated reports after restore; no pagination test with many listings; staff moderation UI covered only inside one desktop e2e |
| Channel versions (text/email/call + Recommended) | `src/lib/variant-generation.test.ts` (8), `src/lib/preparation-variants.test.ts` (5), `tests/preparation-variants.test.ts` (10 DB), `e2e/channel-variants.spec.ts` (3) | The 09-23 editor redesign (`be4698a`) has no passing browser run on record and `channel-variants.spec.ts:70` targets the old control (F5); `staging-channel-variants.spec.ts` only runs against the Netlify site |
| Phone text sizes (13/12/14px) | `e2e/visual-fitment.spec.ts:175-197` floor check (11px nav, 12px buttons, 13px text) on 13 routes, mobile project | Exact design sizes are not asserted (a 13px→16px regression passes); `/journey`, `/marketplace`, `/mixes/mega`, contact detail and Today sheets are not in the route list |
| Audit item 3 (social sign-in for invitees) | none | No test; `tests/social-auth.test.ts` does not exercise an invite |
| Audit item 4 (invite used with a different email / typo recovery) | none for the email path | `tests/referral-access*.test.ts` cover token validity, not email correction |
| Audit item 6 (two-tab last-write-wins on Mix/contact) | none | Not implemented (`mix-editor-actions.ts:255`, `contact-actions.ts:25`); `journey-rule-editing.spec.ts` covers stale saves for Journey rules only |
| Audit item 11 (`aria-invalid`/`aria-describedby` on signed-in forms) | none | Only public forms set `aria-invalid`; `accessibility.spec.ts` (axe) does not flag missing error association |
| Audit item 12 (focus after choosing a contact on desktop) | none | No focus management in `ContactsBulkWorkspace.tsx`; `live-search-contact-layout.spec.ts:71` checks layout only |
| P2: `/onboarding` re-run redirect, contact-create idempotency, archive double-submit, Skip-beat confirmation, URL-driven error banners | none | No source handling found for the first three (see F7); no tests for any |

---

## CI and branch state

**Facts (VERIFIED).**
- Workflows: `CI` (single `validate` job, `timeout-minutes: 60`, `ci.yml:21`; Postgres 16 service; steps: npm audit → baseline SQL check → generate → validate:schema/syntax/imports → migration rehearsal (4 scripts) → `db:deploy` → `db:verify-release` → typecheck → scheduler dry-run → vitest with 3 `RUN_*` flags → build → seed → backup/restore rehearsal → Chromium → recovery-hold and hosted-load integration suites → load qualification → switch to a restricted DB role → full Playwright (both projects) → two flag-gated desktop Playwright passes → Lighthouse (6 URLs × 3 runs, `.lighthouserc.cjs`) → two Docker builds). `Docker build` (3 image jobs). `Security` (gitleaks on full history, `npm audit --omit=dev --audit-level=high`, weekly cron). `Private test worker` (5-minute cron to the Netlify test site).
- Triggers: `push` on `main` only and `pull_request` (any base) for CI/Docker/Security. No `workflow_dispatch` on CI/Docker.
- Secrets/vars used: only `secrets.JITM_TEST_WORKER_SECRET` and `vars.JITM_TEST_EXPIRES_AT` (`private-test-worker.yml:22-23`). CI uses synthetic keys (`ci.yml:25-40`); no production secret is present in workflows.
- Required checks: documented, not verifiable from here — `docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md:33` names `validate`, `secret-history`, `dependency-audit`, `production-image`, `backup-image`, `monitor-image` as required on the final PR head. Whether `main` is currently protected is unknown.
- History: last PR merge `e1ec120` (#81, 09-17); 65 commits since, no PR references; `origin/main` = `4615ade` (09-10), not an ancestor of live; last CI run cited in docs 09-17; workflows unchanged since 09-16; 97 remote branches; 2 tags (July).

**Risk statement.** The default branch is a stale, empty-merge ancestor of nothing recent; CI is wired to it; every production deploy since 09-17 was cut from a feature branch by SHA with local, partial verification; rollback instructions point at SHAs that survive only while their branches do; a new contributor, a dependency bot, GitHub code search and any "compare with main" review all see the wrong code.

**Options.**
1. **Reset `main` to live** (`git push --force-with-lease origin e26fdd4:main` or `d70ec54`). Pros: one command, `main` = production immediately, no merge commit, CI then runs on every future push to `main`. Cons: rewrites the default branch (loses only the empty merge `4615ade`; anyone with a clone of `main` must reset); a force-push is exactly what branch protection should forbid, so do it once before enabling protection. No PR → no CI run for the catch-up itself.
2. **One catch-up PR** `fix/test-failures-20260924 → main`, merged with a merge commit (not squash). Pros: triggers all three workflows on the exact live tree (closes F1 for the current release), leaves an auditable merge, no history rewrite, and the diff is trivially conflict-free because `main` adds nothing. Cons: a 1,098-file PR is unreviewable as a diff (review the CI result, not the lines); the merge commit's tree equals live but its SHA is new — deploy stays at `e26fdd4`, so tag both.
3. **Protect `main` + tag releases only**, leave history as is. Pros: cheapest guard against orphaning. Cons: does not fix the stale default branch or CI coverage.
4. **Merge the whole branch chain via PRs one by one** (13 `release/*` + `fix/*` branches). Pros: per-feature CI runs and records. Cons: days of work, most branches are already superseded; no extra safety for code that is already live.

**Recommendation.** Do 2 now (it is also the fastest route to a CI run on the live code), then immediately 3 (protect `main`, require the six documented checks, forbid force-push and squash-merge for release PRs, tag `prod-<date>-<sha>` on every deploy), and delete nothing until the tags exist. Going forward: branch → PR → CI green → deploy the PR's merge SHA from `main` → tag → release record cites the run URL. Do not execute any of this from the audit worktree; it is a `main`/GitHub decision for the owner.

---

## Env and docs drift

| Item | Where | What it says / does | Reality at d70ec54 | Status |
|---|---|---|---|---|
| `POSTGRES_PORT` | `.env.example:43` | documented local variable | read by nothing (`src`, `scripts`, `docker-compose.yml`, `compose.pilot.yml`, workflows: 0 hits) | VERIFIED |
| `AUTH_OAUTH_STATE_MINUTES`, `JITM_BUILD_DIR`, `NETLIFY_DB_URL`, `NETLIFY_WORKER_SECRET`, `PRIVATE_TEST_USERNAME/PASSWORD`, `RECOVERY_BOUNDARY_PATH` | `src/lib/env.ts:68`, `next.config.ts:22`, `src/lib/prisma.ts:5`, `src/proxy.ts:117`, `src/lib/recovery-boundary-client.ts:22-33` | read at runtime | absent from `.env.example` (Netlify/private-test only, but undocumented for local runs) | VERIFIED |
| `render.yaml` env group | `render.yaml:5-34` | sets 12 keys | omits `WORKER_HEARTBEAT_STALE_SECONDS`, `WEB_PUSH_*`, `AUTH_ALLOWED_ORIGINS`, `RESEND_RECOVERY_API_KEY`, `REPORT_EXCLUDED_*`, Twilio/OAuth (all default or optional — informational, but nothing documents which production values are set outside the Blueprint) | VERIFIED |
| `.env.example` defaults | `.env.example:36,119` | `DEMO_MODE=true`; `WEB_PUSH_VAPID_SUBJECT=mailto:hello@jumpinthemix.app` | production domain is `.com`; demo-on is a local convenience but the file is also the reference operators copy | VERIFIED |
| `SECURITY.md` | `:3,15` | "early single-user, self-hosted release candidate", fixes for "latest tagged RC and current `main`", "No hosted service" | hosted multi-workspace SaaS on Render; `main` is 14 days stale; tags are July RCs | VERIFIED |
| `README.md` | `:5,26-28,84-88` | "hosted free beta"; "For Netlify, use docs/NETLIFY_DEPLOYMENT.md" first; "Production deployment is the active objective"; "CI validates …" | production is Render (`docs/HOSTED_DEPLOYMENT.md:3`, release records); Netlify is the (possibly dead) test site; CI has not validated a release since 09-17 | VERIFIED |
| `docs/HOSTED_DEPLOYMENT.md` | `:3` | "this runbook is not evidence of an active production deployment" | production has been live on Render since 09-16 (`docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:1`) | VERIFIED |
| `docs/NETLIFY_DEPLOYMENT.md` | `:5` | "Its production URL is `https://jump-in-the-mix.netlify.app`" | not the customer site; two different things are called "production" | VERIFIED |
| `AGENTS.md` | `:13` | staging must publish to the Netlify test site; jumpinthemix.com "is a separate deployment target" (no platform named) | releases since 09-21 skipped Netlify (`JOURNEY_PRODUCTION_RELEASE_2026-09-21.md:3`); Render not mentioned anywhere in `AGENTS.md` | VERIFIED |
| `00_START_HERE.txt`, `START_HERE.md`, `EASY_START_RELEASE_NOTES.md`, `WINDOWS_DOCKER_FIX.md`, 20 launcher files, `Makefile` | root | Docker-only "easiest local start" for a nontechnical reviewer, July wording | secondary Docker edition; production is native Node on Render; whether the Docker path still works is not verified (CI still builds the images) | SUSPECTED (drift), images VERIFIED built |
| `docs/SINGLE_USER_PRODUCT_SCOPE.md`, `SINGLE_USER_PORT_MATRIX.md` | `:1-5` | already marked "Archived" | fine — but `SECURITY.md` and `EASY_START_RELEASE_NOTES.md` still carry the single-user framing | VERIFIED |
| `CONTRIBUTING.md` | `:13-51` | "Before opening a pull request … include migration and rollback notes in the pull request" | no PR since 09-17 | VERIFIED |
| `package.json` | `:2-3` | `jump-in-the-mix-mvp` `0.1.0` | seven production releases in September, none versioned | VERIFIED |

**Top contradictions a new engineer would trip over:** (1) `SECURITY.md` says self-hosted single-user RC; the README says hosted SaaS; (2) `README`/`AGENTS.md` say Netlify; the release records say Render; (3) `docs/HOSTED_DEPLOYMENT.md` says production is not active; (4) `main` does not contain the product they are asked to work on; (5) `CONTRIBUTING.md` describes a PR flow that the last 65 commits did not use.

---

## Checked and fine

- No focused tests (`.only(`: 0) and no unconditional skips in vitest or Playwright; no `TODO/FIXME/HACK/XXX` in code; no `@ts-ignore`/`@ts-expect-error`/`as any` in `src/`, `tests/`, `e2e/`, `scripts/`.
- `tsconfig.json:11` `strict: true`; `include` covers `tests/`, `e2e/` and `scripts/*.ts`, so the TypeScript suites are type-checked with the app.
- Every declared dependency is used (`@lhci/cli`, `tsx`, `typescript` via CLI; `fflate`, `node-ical`, `qrcode`, `web-push`, `svix`, `jose`, `esbuild`, `@prisma/prisma-schema-wasm`, `@cloudflare/workers-types` each imported at least once). All but `web-push` are pinned.
- Database-safety guards are consistent: the loopback `jitm_design_` regex gates every DB suite, `scripts/test-isolated-database.mjs:10-13`, and the CI role switch (`ci.yml:235`); CI runs browser flows under a restricted runtime role (`ci.yml:226-246`).
- `scripts/validate-imports.mjs:39-51` enforces the `src/lib/actions.ts` re-export-only Server Action boundary; `validate-schema.mjs` and `validate-syntax.mjs` give cheap fail-fast checks before the 40-minute job.
- Security workflow: gitleaks pinned (`v8.30.1`) over full history; production-only `npm audit` at high severity; both run on PRs and weekly.
- `playwright.config.ts` serial execution and per-test time-outs are deliberate and documented (`:13-16`); `vitest.config.ts:19-21` explains serial files.
- `tests/shared-mix-boundary.test.ts` expectations all match current source at d70ec54 (fixed in `4f66065`).
- `src/app/api/mix-workflow/route.ts` validates every command with strict zod schemas and returns 409 with the current rule on conflicts (`:83`); the seeding payload in `journey-connections.spec.ts:286-288` is schema-valid.
- The 09-24 release record's rollback section (`MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md:37-39,61`) correctly notes additive-only migrations, so the code rollback is safe without a data rollback.

---

## Open questions for the owner

1. Is `main` branch-protected today, and are the six checks from `docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md:33` still required? (Not verifiable offline.)
2. Does a PR already exist for `fix/test-failures-20260924` or any `release/*` branch, and has any GitHub Actions run touched code after 09-17?
3. Which branch should be canonical going forward — `main` reset/merged to live, or a `production` branch? (F2 options.)
4. Is the Netlify test site (`jump-in-the-mix-test.netlify.app`) still alive and intended as the staging gate, or retired after the Neon quota exhaustion on 09-21? If retired, should `private-test-worker.yml` stop and `AGENTS.md:13` change?
5. May the release scripts under `.artifacts/*live*/` be committed (with secrets stripped) so the procedure and its evidence are reviewable?
6. Was `journey-connections.spec.ts` re-run after `e26fdd4`? If a log exists outside `.artifacts/market-20260924/`, it should be referenced from the release record; otherwise the "all pass on desktop and phone" line needs amending.
7. Is the Docker/self-hosted edition still a supported product (keep `docker-build.yml`, launchers and `SECURITY.md` wording) or should it be archived?
8. For audit item 6 (two-tab saves): refuse stale saves with a reload prompt, or merge field-by-field? The test strategy depends on the choice.
