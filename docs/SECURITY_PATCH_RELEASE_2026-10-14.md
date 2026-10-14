# Security patch release — October 14, 2026

Live at https://jumpinthemix.com since 2026-10-14 03:08 UTC (web cutover). The final check passed at 03:09:57 UTC.

This release patches three dependencies with high-severity advisories (#154): Next.js 16.3.8, sharp 0.35.5 and `source-map-js` 1.2.2. It also brings the UX follow-ups release record (#152) and the decision record D112–D121 (#153). It has no migration and changes no data. Rollback: redeploy `prod-2026-10-13-4d5c307`, web first and then the worker.

| Item | Value |
|---|---|
| Previous production commit / tag | `4d5c3072300863b14ed6b9bb0c4264920e12e245` / `prod-2026-10-13-4d5c307` |
| Release commit | `c942ebf2d81b8bd6577072caa1e0a369f9e3cf2c` on `main`, the merge of #154. The three merges below are its only first-parent commits after production |
| Production tag | `prod-2026-10-14-c942ebf` |
| Fresh encrypted backup | Stored 2026-10-14T02:59:45Z, 3 objects |
| Migration | None |
| Dependencies | `next` 16.3.6 → 16.3.8; `sharp` override 0.35.4 → 0.35.5; `source-map-js` 1.2.1 → 1.2.2, pinned in `overrides`. No package added or removed |
| Worker deploy / live | `dep-db7f0etg1s2s73a9lljg` / 2026-10-14T03:01:48Z |
| Web deploy / live / build | `dep-db7f1tivcj2c73ddmh1g` / 2026-10-14T03:08:08Z / `H_HpHWpPJqVEUWcGHH200`, build cache kept |
| Final check | 2026-10-14T03:09:57Z |

## What changed

| PR (merge) | What the owner sees |
|---|---|
| [#152](https://github.com/kaywhy331/jump-in-the-mix/pull/152) (8bc8eb8) Release record | Docs only: the UX follow-ups release record. |
| [#153](https://github.com/kaywhy331/jump-in-the-mix/pull/153) (6630e49) Decision record | Docs only: Kevin's answers D112–D121, D101 and the confirmed `[PROPOSED]` items, and the standards that follow (JITM-07 2.0.0, JITM-08 2.1.0, JITM-09 10.0.0, JITM-12 2.0.1). |
| [#154](https://github.com/kaywhy331/jump-in-the-mix/pull/154) (c942ebf) Dependency patch | Nothing visible. The three patched packages fix the advisories below. One `.gitleaksignore` fingerprint covers a made-up rate-limit value in a test's mocked settings. |

**The advisories:**
- `next` 16.3.6 had six, fixed in 16.3.8 (published 2026-10-07):
  - GHSA-cjq9-62q9-8jv4 (high);
  - GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p, GHSA-f87g-xv8r-7p7x and GHSA-3w37-wq28-93x7 (medium);
  - GHSA-39w2-rjm5-chcv (low).
- `sharp` 0.35.4 had GHSA-wq5f-xc86-pv6w (librsvg).
- `source-map-js` 1.2.1 had GHSA-68fv-2mgg-jv7q.

None was reachable in production as configured (INFERRED from the code at 4d5c307; #154 gives the reasons). So this was a patch on the usual release path, not an emergency.

## Decisions

1. **Kevin, 2026-10-14 (AskUserQuestion):**
   - "Merge + release after review (Recommended)" for #154;
   - "Merge #152 and #153 (Recommended)";
   - "Yes, hosted CI is the gate (Recommended)" (D122);
   - "Block if worse on the change (Recommended)" (D123).

   Then, before the release: "Compare only the reruns (Recommended)" (D124), for how D123 counts the batch run that found a failure. D122–D124 are written into the standards by #155, which is still in review at the time of this record.
2. **The one local failure, `contact-search-import-jobs.spec.ts:118`, is not new (D123, D124).**
   - It failed once in the candidate's full desktop round.
   - It then passed in 5 batch reruns on the candidate and in 5 batch runs on production's code, and twice alone on each.
   - The same failure appeared on three earlier 16.3.6 builds (2026-10-09, 10-10 and 10-12).
3. **Timing:** the release ran from 02:59 to 03:10 UTC, evening in the US. JITM-14 §2.26 says it SHOULD run in quiet hours.
4. No permission prompt or safety classifier refused a merge or release step. Claude Code's built-in safety check did refuse two local verification commands (Verification).

## Verification

**Reviews (WF-05):**
- #154: round 2 approved at 726fbc8 (`.artifacts/pr-point-followups-20261012/REVIEW-sec154-r1.md`, `REVIEW-sec154-r2.md`).
- #152 and #153: round 2 approved before their merges (`REVIEW-rec152-r2.md`, `REVIEW-dec153-r2.md`).

**VERIFIED on hosted CI at 726fbc8**, #154's head; the release commit adds only #152's and #153's docs (`git diff 726fbc8 c942ebf`):
- CI's `validate` job passed every step (run 38482673863). CI's Playwright retries once, and the log shows no flaky or failed test. It ran:
  - the dependency audit and the baseline SQL check;
  - the migration rehearsal, `db:deploy` and `db:verify-release`;
  - the typecheck and `scheduler:check`;
  - Vitest: 2,506 passed and 11 skipped;
  - the production build and the restore rehearsal;
  - `load:qualify`;
  - the main browser step: 791 passed and 283 skipped, on desktop and phone;
  - the staff steps: 58 and 12 passed;
  - registration: 13 passed;
  - Lighthouse and the image build.
- Security passed: the dependency audit and gitleaks 8.30.1's history scan (run 38482673880). The Docker build passed (run 38482673877).

**VERIFIED locally**, with CI's environment, retries at 0 and a fresh `jitm_design_uxr1012_sec_e2e` (`.artifacts/pr-point-followups-20261012/verification/ledger.tsv`, rows `sec-*` and `secbase-*`; `.artifacts/market-live-20260924/sec-verification.json`):
- `npm run security:audit`: 0 vulnerabilities, against 3 high on main.
- gitleaks 8.30.1: no leaks.
- The typecheck, `validate:static` and `standards:check` exited 0. Vitest: 2,443 passed, 74 skipped, 0 failed. `worker:qualify`: 10 of 10.
- The standalone build exited 0, and its server reported `next-server (v16.3.8)`.
- Every group of CI's main step on desktop: 421 passed and 1 failed (Decision 2).
- The live smoke, run against this local build: 7 checks passed.
- **The batch comparison for Decision 2:** group 4, the same four spec files in the same order.
  - Candidate: 0 of 5 reruns failed, and 0 of 2 runs alone.
  - Baseline: the release round's build of 41c4c3f, the same code as 4d5c307, on `next-server (v16.3.6)`. 0 of 5 batch runs failed, and 0 of 2 runs alone.
  - Claude Code's safety check refused the first attempts at the baseline's last two batches and its runs alone, because it could not inspect the runner's `bash -c` step. They then ran through `sec-pw-direct.sh`, the same Playwright command with no nested shell.

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at 4d5c307 with auto-deploy off, and health returned 200 in three rounds;
  - `main` held the three authorized merges, each at its reviewed head;
  - `package.json`, the lockfile and `.gitleaksignore` matched #154's reviewed head byte for byte, and nothing changed under `prisma/`, `scripts/` or the Dockerfile;
  - the database was ready behind the `jitm_runtime` boundary with no recovery hold, and all 79 migration checksums matched;
  - no billing variable was set, and record counts were taken.
- **Backup:** fresh, encrypted, stored before any deploy.
- **Worker:** live at c942ebf. The scoped queue probe passed, and its job was removed.
- **Web:** live at c942ebf, with the build cache kept. Render's pre-deploy `db:verify-release` passed: INFERRED from the deploy reaching live.
- **Postflight:** 30 public checks passed, and all 10 release files and 23 assets matched.
- **Live smoke:** one synthetic owner, with one Mix and two people with no phone or email, all removed afterwards. All 11 checks passed:
  - sign-in cookies;
  - the real client address, also with a forged `X-Forwarded-For`;
  - signed error banners;
  - Today's shared card;
  - the contact profile's menus;
  - Contacts' Select control and No Mix strip;
  - Journey's phone list;
  - nothing recorded, sent or skipped.
- **Final check:**
  - record counts are unchanged since the preflight;
  - there are no synthetic users, workspaces, share keys, review requests or probe jobs;
  - no job failed since the release, and no rate limit was blocking;
  - both services are at c942ebf with auto-deploy off;
  - health returned 200 in three rounds, as JITM-14 §2.18 asks. That's the first release to do so since the deviation was noted.

## Release steps

The release ran step by step from `.artifacts/market-live-20260924/sec-*.mjs`, with receipts in that folder's `sec-*.json` files. The order was:
1. local verification (`sec-verification.json`);
2. the read-only preflight;
3. the backup;
4. the worker deploy and its queue probe;
5. the web deploy;
6. the postflight;
7. the live smoke;
8. the final check.

**What changed from the previous release's scripts:** the `sec-*` scripts are the `ufr-*` scripts, generated by `scratchpad/patches/make-sec-scripts.py`, with these differences:
- no migration and no D102 step;
- the preflight pins the dependency files to #154's reviewed head;
- the deploy step checks that no migration is required.

**Failed or retried steps:** none in production. The worker's revision check saw the old instance four times before the new one answered, as in earlier releases.

## Rollback

Redeploy `prod-2026-10-13-4d5c307`, web first and then the worker. No migration ran and no data changed, so nothing needs undoing. The rollback brings back the advisories' versions, which are not reachable as configured.

## Owner steps

1. **Outage signal (JITM-14 §2.30):** GitHub Actions runs again, since the repository is public.
   - A scheduled production smoke ran at 01:57 UTC and passed.
   - The schedule fires only every few hours, and there is still no external uptime monitor (backlog B-08).
2. **Merge this record,** or authorize an agent to merge it (JITM-16 §2.5).
3. **Drop the local evidence databases on TrixBot,** since agents may not:
   - `jitm_design_uxr1012_sec_e2e`, new in this release;
   - the list in `docs/UX_FOLLOWUPS_RELEASE_2026-10-13.md` (Owner steps).
4. **Open questions for Kevin** (#155):
   - branch protection on `main`;
   - D123's five runs;
   - D122's details: merging when only `main` is red, docs-only pull requests, and tier 1 before a pull request.
5. **With the repository public:**
   - Choose a license, or keep none, which means all rights reserved (`docs/PUBLIC_REPOSITORY_HYGIENE.md`).
   - Decide whether commits keep a personal author address (JITM-13 §6).

**NOT RUN:**
- **Locally:** the phone browser project (no layout change; hosted CI ran both projects), Lighthouse and the image builds (hosted CI ran both).
- **What the live smoke can't exercise:** there's no product change for it to check.
- **Devices and browsers:** physical phones, VoiceOver and TalkBack; WebKit and Firefox.
- **Real data:** a production account with real data.

## Follow-ups

- **A test-only fix for `contact-search-import-jobs.spec.ts:118`:** it has now failed in four rounds (three earlier 16.3.6 builds and this one) with the heading "Review issues" not shown within 10 s (JITM-12 §2.15).
- **#154's review found three gaps outside its diff:**
  - nothing reads `allowScripts`, so JITM-11 §2.50's install-script control isn't in effect under npm 10;
  - dev-only packages carry 26 advisories, one critical in Lighthouse CI's `express`;
  - tests keep adding made-up rate-limit secrets that trip the secret scan, so a fixture convention would stop it.
- **#154's round-2 LOW EVD-03:** a server restarted under the same step name overwrites its log. Future runs should give each restart its own log name.
- **Carried forward:** the follow-ups of `docs/UX_FOLLOWUPS_RELEASE_2026-10-13.md`, unchanged by this release.
