# UX audit batch release — October 13, 2026

Live at https://jumpinthemix.com since 2026-10-13 00:33 UTC (web cutover). The final check passed at 00:36:26 UTC.

This release ships the product batches of the 2026-10-08 UX, design and layout audit (#135). They are built from Kevin's answers to its 18 questions (D69–D86, logged in #136), and each was approved in WF-05 review:

| PR | What the owner sees |
|---|---|
| [#139](https://github.com/kaywhy331/jump-in-the-mix/pull/139) Truth pass | Confirmations and states say what happened. A save that starts no one saves without a review. Turning a paused Mix back on, and changing when a Mix starts, get reviews of their own (TRU-02, MIX-03). Stopped follow-ups and other states use plain words. |
| [#140](https://github.com/kaywhy331/jump-in-the-mix/pull/140) Formatter | Dates, times, zones, statuses and channels read one way: 12-hour times in every locale, zones named by city ("New York time"), Text / Email / Call, and no internal words (FMT-01–FMT-05, D79). |
| [#141](https://github.com/kaywhy331/jump-in-the-mix/pull/141) Today keeps momentum | After an outcome, the next due follow-up's review opens by itself, the Undo stays on screen, and the counts change at once (D70). |
| [#142](https://github.com/kaywhy331/jump-in-the-mix/pull/142) One card per person | One person's follow-ups due the same day share one card, with "Also due" and a skip for the earlier one. Rows read reason, then Mix, and the first card isn't clipped on phones (D71, TDY-02, ACC-06). |
| [#144](https://github.com/kaywhy331/jump-in-the-mix/pull/144) Invitation prompt | One compact "Invite people · N invitations left" line below Today's due work. It shows after the first completed outcome, and the owner can dismiss it. The More badge and the tablet gift are gone (D72). |
| [#143](https://github.com/kaywhy331/jump-in-the-mix/pull/143) Journey opens readable | From 768px the map opens at 100%, scrolled to the first Mix. On phones Journey opens as a list (D75). |
| [#145](https://github.com/kaywhy331/jump-in-the-mix/pull/145) Onboarding on two screens | The person comes first, then the follow-up with a preview of its real dates. The page is about 2.4 phone screens instead of 5.3, and Enter can't start a follow-up early (D73, D85's part). |
| [#146](https://github.com/kaywhy331/jump-in-the-mix/pull/146) Contacts bulk placement | A "Select" control, a No Mix strip with "Add these people to a Mix" and "Mark No Mix needed", and Mix as the main bulk action (D76). |
| [#147](https://github.com/kaywhy331/jump-in-the-mix/pull/147) Contact profile | One Mixes section with a row and a menu per Mix, a profile ••• menu, and the next meeting and Notes to remember near the top (D77). Resume now brings back what a Stop removed, and leaves overdue follow-ups for the owner (TRU-02, D87). |

The docs PRs #135 (the audit), #136 (the standards for D69–D86) and #138 (the review stars record) merged with them. The release has no migration and no dependency, script or configuration change. Billing variables stay unset (JITM-14 §2.31).

**Rollback:** redeploy `prod-2026-10-09-db8f2d1`, web first and then the worker. There is no schema change to reverse. A rollback brings back every behavior above, including a Resume that brings nothing back.

| Item | Value |
|---|---|
| Previous production commit / tag | `db8f2d183cde10c6dde53625c1bbdd1261b0ccd2` / `prod-2026-10-09-db8f2d1` |
| Release commit | `4e785453485c5b71b0edb0669a2ff0b4d5dbf02f` on `main`, the merge of #147. The twelve merges are its only first-parent commits after production |
| Production tag | `prod-2026-10-13-4e78545` |
| Fresh encrypted backup | Stored 2026-10-13T00:24:40Z, 3 objects, before the deploys |
| Migration | None |
| New dependency | None |
| Worker deploy / live | `dep-db6nkqad0e5s73b0m8og` / 2026-10-13T00:26:39Z |
| Web deploy / live / build | `dep-db6nm3rrjlhs73aneb6g` / 2026-10-13T00:33:06Z / `qilxnIyjIptLqTOvP3sCs` |
| Final check | 2026-10-13T00:36:26Z |

## Decisions

- **D69–D86 (2026-10-08):** Kevin: "I will go off you recommendations. please go ahead and implement." Each batch cites its decision.
- **The PRs' open points (2026-10-12):** Kevin: "I will go off of what you recommend" and "please proceed with your recommendations for each." The decision record PR (#148) logs them as D87–D103, with the readings confirmed as built. Of those, only D87 (#147's Resume fix) and D92 (12px labels in the phone bulk bar, #146) are in this release.
- **Merge and release (2026-10-12):** Kevin chose "Yes, merge them (Recommended)" for #136, #135, #138, #139, #140, #141, #142, #144, #143, #145, #146 and #147, in that order, and "Release after the checks (Recommended)".
  - The agent merged them with merge commits pinned to the reviewed heads.
  - #147 first merged main into its branch (ccbc4fb). That resolved one minified line of `WorkflowJourney.module.css`: main's line from #143, without the `.contactProgress` rules #147 removes. The result is the tree the local trial merge produced.

## Verification

**Reviews (WF-05):** each pull request was approved before the merges:
- #139 (round 3), #140 (round 4, then one test-only commit) and #141 (round 11);
- #142 (round 3), #143 (round 2) and #144 (round 3);
- #145 (round 3, then a short round 4), #146 (round 2, then a short round 3) and #147 (round 4).

The reviews are in each PR's evidence folder under `.artifacts/`.

**VERIFIED locally** at the release commit 4e78545. The checks ran against a production build served with CI's environment, on a fresh database seeded as CI seeds it. Playwright retries were 0, so every first attempt counts. Logs and reports are in `.artifacts/ux-release-20261012/verification/` (`ledger.tsv`, `logs/`, `playwright/`).
- **Static:** `db:generate`, `typecheck`, `validate:static` and `standards:check` exited 0. The one standards warning predates the release (JITM-09 is over 300 lines).
- **Vitest** (`npm run test:isolated`, two shards on fresh migrated databases):
  - 313 files passed and 9 skipped;
  - 2,420 tests passed, 74 skipped and 0 failed.
- **Worker:** `worker:qualify` passed 10 of 10.
- **Build:** `next build` (standalone) passed.
- **Browser:** every spec, in CI's steps. No test failed and none was flaky.
  - **The main step:** 19 groups on desktop-chromium and mobile-chromium (Pixel 7), 786 tests passed.
  - **Group 16** (`today-momentum.spec.ts`) first ran at 23:58 UTC. Its tests skip themselves within 10 minutes of midnight UTC, because their fixture's "today" is the UTC day it was made on. It ran again after midnight: 9 passed on desktop and 24 on the phone, the rest being the other project's tests.
  - **CI's separate steps,** each against a server restarted with that step's environment: staff (two steps), waitlist, registration and public trust on desktop and phone. 93 tests passed.
  - The 311 skips are each spec's own project or flag gates, plus group 16's first runs.
- **The release's live smoke, run first against this local build** (`UXR_SMOKE_LOCAL=1`): all 7 of its local checks passed, and its synthetic data was removed. The first local runs found three things:
  - **A pre-existing accessibility finding.** On Contacts, a row's "Add phone or email" link (`.contact-missing-method`) for a person with no phone or email is 119×18px. axe's target-size check (WCAG 2.2 AA) fails it in both themes. The same check on production's commit db8f2d1, served beside the candidate on the same database, fails the same element (`logs/B5-target-size-probe.log`). So it is pre-existing (JITM-12 §2.14), not caused by this release. The smoke excludes that one element, and the fix is listed under Follow-ups, for D82's batch.
  - **Two defects in the smoke itself:** axe failures now name their elements, and the last database check no longer uses follow-up statuses that don't exist.
- **GitHub Actions:** not run. GitHub refuses to start the jobs because of the account's billing, so the local runs above stand in for CI.

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at db8f2d1, with auto-deploy off;
  - the database was ready behind the `jitm_runtime` boundary, with no recovery hold;
  - all 78 migration checksums matched, and no migration was needed;
  - no billing variable was set;
  - `main` was the twelve authorized merges after production, with no change under `prisma/`, `scripts/` or the Dockerfile.
- **Backup:** a fresh encrypted backup was stored before any deploy.
- **Worker:** deployed and live at 4e78545. The scoped queue probe passed: the production worker claimed and completed one job aimed at nonexistent records, and that job was removed.
- **Web:** deployed and live at 4e78545.
- **Postflight:**
  - 30 public checks passed;
  - all 243 release files and 23 assets matched;
  - no deleted file was served;
  - health returned 200.
- **Live smoke:** a synthetic owner in UTC, with one Mix of three call Beats and two people with no phone or email, all removed afterwards. All 11 checks passed:
  - sign-in cookies;
  - real client addresses, also with a forged `X-Forwarded-For`;
  - signed error banners;
  - **Today:** one person's two calls share one card under Today, led by the overdue one ("1 day overdue"), with "Also due: Call at 12:02 AM". The row reads its reason, then its Mix. Today on a phone reflows at 390px and passes axe in both themes;
  - **Contact profile:** one Mixes row ("Next Beat · 1 day late") with its own menu, and the profile menu's five items in order. The page and menus reflow and pass axe in both themes;
  - **Contacts:** the Select control, and the No Mix strip "1 person has No Mix." with "Add this person to a Mix" and "Mark No Mix needed";
  - **Journey on a phone** opens in its list view ("Mix A1" and the Mix), reflows at 390px and passes axe in both themes;
  - **Nothing was recorded, sent or skipped:** the synthetic workspace still held exactly its two people and two pending calls.
- **Final check:**
  - row counts in 18 tables are unchanged since the preflight;
  - no synthetic users, workspaces, share keys, review requests or probe jobs remain;
  - no job failed since the release;
  - health returned 200, and both services are at 4e78545 with auto-deploy off.

**NOT RUN:**
- physical iPhone Safari and Android Chrome, VoiceOver and TalkBack;
- WebKit and Firefox: each PR ran Chromium on desktop and a Pixel 7 profile;
- operating-system 200% text and forced colors, beyond what the specs check;
- a production account with real data: the smoke's synthetic people have no phone or email, so nothing could be sent.

## Follow-ups

- **The decisions on the PRs' open points:** PR #148 records D87–D103 and the standards they change, in review.
- **Built, waiting for review and Kevin's merge authorization:**
  - a follow-up PR for D88–D98, D100 and D103 (Contacts, Journey, onboarding and Today);
  - D99, stacked on it: Today's confirmations outside the list, with no Undo hold;
  - #134 (D63–D65), now merged with main and carrying #147's Resume. Kevin authorized merging it once reviewed; its release needs a migration and D102's backfill.
- **For D82's batch (the accessibility floors):** Contacts' "Add phone or email" link, on the row of a person with no phone or email, is 119×18px. That is under JITM-10 §2.1's 44px floor, and axe's target-size check fails it. It is pre-existing (above). The link sits in the row's one-line summary, so a 44px target there either reaches into the name's line, makes those rows taller, or turns the link into plain text. D82's batch should choose one treatment for every such row link.
- **Left for later in each PR:** each PR's own "Left for later" or follow-up list stays open:
  - #141: TST-09;
  - #142's list;
  - #143: SCR-02 (b), A11Y-01, FIT-02 and TST-02;
  - #144: SPC-01, REN-01, TST-02 and DOC-02;
  - #145's list;
  - #146: LAY-02, LAY-04, LAY-05, A11Y-04 and the rest;
  - #147: SEND-02, NIT-02, LAY-01, HIST-01, B-15 and the rest of the Contacts lane.
- **Next in the audit's order:** D85's import stage, then Calendar (D74), then D78, D80, D81, D82, D83 and D84.

## Owner steps

- **TRU-09:** publish the invitation wording with "three" as the system Mix's next version in the staff console, so the render-time replacement can go. It belongs with the staff batch (D83).
- **GitHub Actions** stays blocked until the account's billing is fixed in GitHub's Billing settings.
- **Local test databases:** `jitm_design_uxa1008`, `jitm_design_uxa1008_hf`, `jitm_design_uxa1008_tp`, `jitm_design_uxr1012_e2e` and `jitm_design_uxr1012_worker` can be dropped. The agent is not allowed to drop databases.
