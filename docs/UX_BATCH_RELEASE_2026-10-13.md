# UX audit batch release — October 13, 2026

Live at https://jumpinthemix.com since 2026-10-13 00:33 UTC (web cutover). The final check passed at 00:36:26 UTC.

| Item | Value |
|---|---|
| Previous production commit / tag | `db8f2d183cde10c6dde53625c1bbdd1261b0ccd2` / `prod-2026-10-09-db8f2d1` |
| Release commit | `4e785453485c5b71b0edb0669a2ff0b4d5dbf02f` on `main`, the merge of #147. The twelve merges below are its only first-parent commits after production |
| Production tag | `prod-2026-10-13-4e78545` |
| Fresh encrypted backup | Stored 2026-10-13T00:24:40Z, 3 objects, before the deploys |
| Migration | None |
| New dependency | None |
| Worker deploy / live | `dep-db6nkqad0e5s73b0m8og` / 2026-10-13T00:26:39Z |
| Web deploy / live / build | `dep-db6nm3rrjlhs73aneb6g` / 2026-10-13T00:33:06Z / `qilxnIyjIptLqTOvP3sCs`, build cache kept |
| Final check | 2026-10-13T00:36:26Z |

## What changed

This release ships the product batches of the 2026-10-08 UX, design and layout audit (#135). They are built from Kevin's answers to its 18 questions (D69–D86, logged in #136):

| PR (merge) | What the owner sees |
|---|---|
| [#139](https://github.com/kaywhy331/jump-in-the-mix/pull/139) (ce40e4d) Truth pass | Confirmations and states say what happened. A save that starts no one saves without a review. Turning a paused Mix back on, and changing when a Mix starts, get reviews of their own (TRU-02, MIX-02, MIX-03). Stopped follow-ups and other states use plain words. |
| [#140](https://github.com/kaywhy331/jump-in-the-mix/pull/140) (330e9cd) Formatter | Dates, times, zones, statuses and channels read one way: 12-hour times in every locale, zones named by city ("New York time"), Text / Email / Call, and no internal words (FMT-01–FMT-05, D79). |
| [#141](https://github.com/kaywhy331/jump-in-the-mix/pull/141) (2817031) Today keeps momentum | After an outcome, the next due follow-up's review opens by itself, the Undo stays on screen, and the counts change at once (D70). |
| [#142](https://github.com/kaywhy331/jump-in-the-mix/pull/142) (9469f72) One card per person | One person's follow-ups due the same day share one card, with "Also due" and a skip for the earlier one. Rows read reason, then Mix, and the first card isn't clipped on phones (D71, TDY-02, ACC-06). |
| [#144](https://github.com/kaywhy331/jump-in-the-mix/pull/144) (2596f72) Invitation prompt | One compact "Invite people · N invitations left" line below Today's due work. It shows after the first completed outcome, and the owner can dismiss it. The More badge and the tablet gift are gone (D72). |
| [#143](https://github.com/kaywhy331/jump-in-the-mix/pull/143) (ef7b0cb) Journey opens readable | From 768px the map opens at 100%, scrolled to the first Mix. On phones Journey opens as a list (D75). |
| [#145](https://github.com/kaywhy331/jump-in-the-mix/pull/145) (501be2d) Onboarding on two screens | The person comes first, then the follow-up with a preview of its real dates. The page is about 2.4 phone screens instead of 5.3, and Enter can't start a follow-up early (D73, D85's part). |
| [#146](https://github.com/kaywhy331/jump-in-the-mix/pull/146) (d87dfc7) Contacts bulk placement | A "Select" control, a No Mix strip with "Add these people to a Mix" and "Mark No Mix needed", and Mix as the main bulk action (D76). |
| [#147](https://github.com/kaywhy331/jump-in-the-mix/pull/147) (4e78545) Contact profile | One Mixes section with a row and a menu per Mix, and a profile ••• menu. The next meeting shows under the Next card, and Notes to remember sit open under the details (D77). Resume now brings back what a Stop removed, and leaves overdue follow-ups for the owner (TRU-02, D87). |

The docs PRs #136 (031c15d, the standards for D69–D86), #135 (5130984, the audit) and #138 (98f2e8f, the review stars record) merged first. The release has no migration and no dependency, script or configuration change, and it deletes no file. Billing variables stay unset (JITM-14 §2.31).

## Rollback

Redeploy `prod-2026-10-09-db8f2d1`, web first and then the worker. There is no schema change to reverse. A rollback brings back every behavior above, including a Resume that brings nothing back.

**What the previous code finds:**
- Follow-ups that a Resume brought back stay pending. The overdue ones carry `manualOnly` (`src/lib/mix-stop-actions.ts:92`), and db8f2d1's automatic delivery skips `manualOnly` too (`src/lib/automatic-delivery.ts:162,236` at db8f2d1). So a rollback sends none of them.
- db8f2d1 has no invitation prompt, so it ignores the prompt's dismissal cookie (INFERRED).

## Decisions

1. **D69–D86 (2026-10-08):** Kevin: "I will go off you recommendations. please go ahead and implement." Each batch cites its decision.
2. **The PRs' open points (2026-10-12):** Kevin said "I will go off of what you recommend", then asked the agent to proceed with its recommendation for each point. #148 logs them as D87–D111, and it merged as 56c89c2.
   - D87, D92, D104–D109 and D111 describe what this release shipped.
   - D88–D91, D93–D100 and D103 are follow-ups.
   - D101 is a proposed testing rule.
   - D102 and D110 belong to #134.
3. **Merge and release (2026-10-12):** Kevin chose "Yes, merge them (Recommended)" for #136, #135, #138, #139, #140, #141, #142, #144, #143, #145, #146 and #147, in that order, and "Release after the checks (Recommended)".
   - The agent merged them with merge commits pinned to the approved heads. There were two exceptions: #140's merge took two test-only commits made after its approval, and #147's took a merge of main (below).
   - #147 first merged main into its branch (ccbc4fb). That resolved one minified line of `WorkflowJourney.module.css`: main's line from #143, without the `.contactProgress` rules #147 removes. The result is the tree the local trial merge produced.
   - No permission prompt or safety classifier refused a merge or release step.

## Release steps

The release ran from `.artifacts/market-live-20260924/uxr-release.mjs`, with receipts in that folder's `uxr-*.json` files. They are the production evidence below. The steps ran in this order:
1. local verification (`uxr-verification.json`);
2. the read-only preflight (`uxr-preflight.mjs`);
3. the backup;
4. the worker deploy and its queue probe;
5. the web deploy;
6. the postflight;
7. the live smoke (`uxr-live-smoke.mjs`);
8. the final check (`uxr-finalize.mjs`).

**What changed from the previous release's scripts:**
- The preflight checks that `main` is exactly the twelve authorized merges, each a merge commit whose second parent is the PR's head. It refuses any change under `prisma/`, `scripts/` or the Dockerfile. There is no ratings query.
- The live smoke checks this batch: Today's shared card, the profile's menus, Contacts' Select control and No Mix strip, and Journey's phone list.
- The live smoke can also run against a local build (`UXR_SMOKE_LOCAL=1`).

**Failed or retried steps:**
- **In production, none failed.** During the cutover, the postflight's wait for the new web instance lost its SSH connection to the old one (status 255). It retried by itself until the live instance answered with 4e78545.
- **Locally, the live smoke ran four times against the candidate:**
  - **L1 and L2** failed on axe's target-size rule on Contacts. L2 ran after the smoke was changed to name the failing element. This is the pre-existing finding below.
  - **L3** failed in the smoke's own last database check, which asked for follow-up statuses that don't exist.
  - **L4** passed, after the smoke excluded that one element and the check was fixed.
- **The baseline probe ran three times against both builds:**
  - **B3 and B4** found no violation on either build. Their fixture had one person with no phone or email.
  - **B5** used two such people on adjacent rows, as the smoke does. It found the same two violations on both builds.

**A deviation:** the final check polled each health endpoint once. JITM-14 §2.18 and WF-06 step 11 say three times. The preflight polled three rounds, and all answered 200. The next release's final check should poll three times.

## Verification

**Reviews (WF-05):** each product pull request was approved before the merges:
- #139 (round 3);
- #140 (round 4 at 924e94d, then two test-only commits, f8c6efb and 035af4a);
- #141 (round 11), #142 (round 3), #143 (round 2) and #144 (round 3);
- #145 (round 3, then a short round 4);
- #146 (round 2, then a short round 3);
- #147 (round 4).

The docs PRs #135, #136 and #138 merged on Kevin's authorization without a review round. The reviews are in each PR's evidence folder under `.artifacts/`.

**VERIFIED locally** at the release commit 4e78545. The checks ran against a production build served with CI's environment, on a fresh database seeded as CI seeds it. Playwright retries were 0, so every first attempt counts. Logs and reports are in `.artifacts/ux-release-20261012/verification/` (`ledger.tsv`, `logs/`, `playwright/`).
- **Static:** `db:generate`, `typecheck`, `validate:static` and `standards:check` exited 0. The one standards warning predates the release (JITM-09 is over 300 lines).
- **Vitest** (`npm run test:isolated`, two shards on fresh migrated databases):
  - 313 files passed and 9 skipped;
  - 2,420 tests passed, 74 skipped and 0 failed.
- **Worker:** `worker:qualify` passed 10 of 10.
- **Build:** `next build` (standalone) passed.
- **Browser:** 94 of the 96 spec files, in CI's steps. The two staging specs were left out: they target the retired staging site and skip without its environment. No test failed and none was flaky.
  - **The main step:** 19 groups on desktop-chromium and mobile-chromium (Pixel 7). 786 tests passed.
  - **Group 16** (`today-momentum.spec.ts`) first ran at 23:58 UTC. Its tests skip themselves within 10 minutes of midnight UTC, because their fixture's "today" is the UTC day it was made on. It ran again after midnight: 9 passed on desktop and 24 on the phone, the rest being the other project's tests.
  - **Public trust:** CI runs it in its main step with its flag. Locally the grouped runs didn't pass that flag to the tests, so its tests skipped in group 13. They then ran with the flag on desktop and phone: 5 and 5 passed.
  - **CI's separate steps,** each against a server restarted with that step's environment: 83 tests passed. Staff ran in two steps and waitlist in one, on desktop as in CI; registration ran on both projects.
  - The 311 skips are each spec's own project or flag gates, plus group 16's first runs and group 13's public trust tests.
- **The live smoke, run first against this local build** (`UXR_SMOKE_LOCAL=1`): its fourth run passed all 7 of its local checks and removed its synthetic data (attempts above).
  - **A pre-existing accessibility finding:** on Contacts, the "Add phone or email" link (`.contact-missing-method`) on the row of a person with no phone or email is 119×18px. With two such rows next to each other, axe's target-size check (WCAG 2.2 AA) fails both links in both themes. They are too small and too close together.
  - **The same failure on production:** the check on production's commit db8f2d1, served beside the candidate on the same database, fails the same elements (`logs/B5-target-size-probe.log`). So it is pre-existing (JITM-12 §2.14), not caused by this release.
  - **How the smoke handles it:** it excludes that element from its axe checks, which takes it out of every axe rule, not only target-size. The fix is under Follow-ups.
- **GitHub Actions:** not run. GitHub refuses to start the jobs because of the account's billing. The local runs above stand in for CI's static, unit, worker, build and browser steps, but not for its other jobs (NOT RUN).

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at db8f2d1, with auto-deploy off;
  - health returned 200 in three rounds;
  - the database was ready behind the `jitm_runtime` boundary, with no recovery hold;
  - all 78 migration checksums matched, and no migration was needed;
  - no billing variable was set;
  - the record-count baseline was taken and the changed files were hashed;
  - `main` was the twelve authorized merges after production.
- **Backup:** a fresh encrypted backup was stored before any deploy.
- **Worker:** deployed and live at 4e78545. The scoped queue probe passed: the production worker claimed and completed one job aimed at nonexistent records, and that job was removed.
- **Web:** deployed and live at 4e78545, with the build cache kept. Render's pre-deploy command, `db:verify-release`, passed.
- **Postflight:**
  - 30 public checks passed;
  - all 243 release files and 23 assets matched;
  - health returned 200.
- **Live smoke:** a synthetic owner in UTC, with one Mix of three call Beats and two people with no phone or email, all removed afterwards. All 11 checks passed:
  - sign-in cookies;
  - real client addresses, also with a forged `X-Forwarded-For`;
  - signed error banners;
  - **Today:** one person's two calls share one card under Today, led by the overdue one ("1 day overdue"), with "Also due: Call at 12:02 AM". The row reads its reason, then its Mix. Today on a phone reflows at 390px and passes axe in both themes;
  - **Contact profile:** one Mixes row ("Next Beat · 1 day late") with its own menu, and the profile menu's five items in order. The page and menus reflow and pass axe in both themes;
  - **Contacts:** the Select control, and the No Mix strip "1 person has No Mix." with "Add this person to a Mix" and "Mark No Mix needed". It passes axe in both themes apart from the excluded link (above);
  - **Journey on a phone** opens in its list view ("Mix A1" and the Mix), reflows at 390px and passes axe in both themes;
  - **Nothing was recorded, sent or skipped:** the synthetic workspace still held exactly its two people and two pending calls.
- **Final check:**
  - row counts in 18 tables are unchanged since the preflight;
  - no synthetic users, workspaces, share keys, review requests or probe jobs remain;
  - no job failed since the release, and no rate limit was blocking;
  - health returned 200 (once per endpoint, above), and both services are at 4e78545 with auto-deploy off.

**NOT RUN:**
- **CI jobs the local runs didn't reproduce:**
  - the dependency audit: the release changes no dependency;
  - gitleaks: no secret scan ran;
  - the migration rehearsal: there is no migration;
  - `scheduler:check`;
  - the encrypted backup and restore rehearsal: production took a real backup;
  - the packaged-server recovery suite, `load:qualify` and the hosted-fixture rehearsal;
  - the browser flows under a restricted runtime role: the local runs used the owner role;
  - Lighthouse, although #139 changed the copy of three public pages (the follow-up reminders feature page, the follow-up templates page and its estimate page);
  - the image builds: Render builds with its Node runtime, not the Dockerfile.
- **Release changes the live smoke couldn't exercise,** because it records nothing. These were verified locally only:
  - #139's confirmations;
  - #141's next review after an outcome;
  - #144's prompt, which shows only after a completed outcome;
  - #145's onboarding;
  - #147's Resume (D87).
- **Devices and browsers:**
  - physical iPhone Safari and Android Chrome, VoiceOver and TalkBack;
  - WebKit and Firefox: each PR ran Chromium on desktop and a Pixel 7 profile;
  - operating-system 200% text and forced colors, beyond what the specs check.
- **Real data:** a production account with real data. The smoke's synthetic people have no phone or email, so nothing could be sent.
- **Testers:** whether testers were told to reload after the release (JITM-14 §2.26).

## Follow-ups

- **The decisions on the PRs' open points:** #148, merged as 56c89c2.
- **Built, not yet open as pull requests:** local branches, in verification and review.
  - **`fix/pr-point-followups-20261012`:** D88–D91, D93–D98, D100 and D103 (Contacts, Journey, onboarding and Today).
  - **`fix/today-confirmations-20261012`,** stacked on it: D99, Today's confirmations outside the list with no Undo hold.
  - Kevin hasn't yet authorized merging either.
- **#134 (D63–D65):** now merged with main and carrying #147's Resume, in its third review. Kevin authorized merging it once reviewed; its release needs a migration and D102's backfill.
- **For D82's batch (the accessibility floors):** Contacts' "Add phone or email" link, above. It is 119×18px, under JITM-10 §2.1's 44px floor. The link sits in the row's one-line summary. So a 44px target there either reaches into the name's line, makes those rows taller, or turns the link into plain text. D82's batch should choose one treatment for every such row link. The next live smoke should then drop only target-size results on that link, not exclude the element.
- **Left for later in each PR:** each PR's own "Left for later" or follow-up list stays open:
  - #141: TST-09;
  - #142's list;
  - #143: SCR-02 (b), A11Y-01, FIT-02 and TST-02;
  - #144: SPC-01, REN-01, TST-02 and DOC-02;
  - #145's list;
  - #146: LAY-02, LAY-04, LAY-05, A11Y-04 and the rest;
  - #147: SEND-02, NIT-02, LAY-01, HIST-01, B-15 and the rest of the Contacts lane.
- **Carried forward from the 2026-10-09 record:** the review page's three pre-existing defects, for D84's change: 200% text, 320px padding and star spacing (`docs/REVIEW_STARS_RELEASE_2026-10-09.md`, Follow-ups).
- **Next in the audit's order:** D85's import stage, then Calendar (D74), then D78, D80, D81, D82, D83 and D84.

## Owner steps

1. **Device pass:** on a real iPhone and an Android phone, check Today's shared card and its "Also due" line, the contact profile's menus, Contacts' Select bar and No Mix strip, and Journey's list view.
2. **Outage signal (JITM-14 §2.30):** two pieces are still off.
   - There is no external uptime monitor on the public site and the health endpoint (backlog B-08).
   - GitHub Actions, including the hourly production smoke, stays blocked until the account's billing is fixed in GitHub's Billing settings.
3. **TRU-09:** publish the invitation wording with "three" as the system Mix's next version in the staff console, so the render-time replacement can go. It belongs with the staff batch (D83).
4. **Merge this record,** or authorize an agent to merge it (JITM-16 §2.5).
5. **Drop the local evidence databases on TrixBot,** since agents may not:
   - this release's `jitm_design_uxr1012_e2e` and `jitm_design_uxr1012_worker`;
   - the audit batches' `jitm_design_uxa1008`, `jitm_design_uxa1008_hf` and `jitm_design_uxa1008_tp`;
   - still present from the 2026-10-08 record's list: the `jitm_design_mst1007_*`, `jitm_design_mns1006*` and `jitm_design_nms1006*` databases.
6. **Still open from earlier releases:** the No Mix release's agent defaults 1–8, the visit question in JITM-09 §6, and its follow-up fixes (REOPEN-01, UNDO-06, the UNDO-05 (c) guard), as the 2026-10-08 record lists them.
