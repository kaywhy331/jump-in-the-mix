# UX follow-ups release — October 13, 2026

Live at https://jumpinthemix.com since 2026-10-13 22:21 UTC (web cutover). The final check passed at 22:23:30 UTC.

This release ships the stages follow-up (#134), the follow-ups to the UX batch's open points (#150) and Today's refresh change (#151), with the decision record #148 and the UX batch's release record #149. It has one additive migration, `MixAssignment.addedWhilePaused`. Rollback: redeploy `prod-2026-10-13-4e78545`, web first and then the worker; the migration stays.

| Item | Value |
|---|---|
| Previous production commit / tag | `4e785453485c5b71b0edb0669a2ff0b4d5dbf02f` / `prod-2026-10-13-4e78545` |
| Release commit | `4d5c3072300863b14ed6b9bb0c4264920e12e245` on `main`, the merge of #149. The five merges below are its only first-parent commits after production |
| Production tag | `prod-2026-10-13-4d5c307` |
| Fresh encrypted backup | Stored 2026-10-13T22:11:47Z, 3 objects, before the migration |
| Migration / job | `20261008120000_mix_assignment_added_while_paused` / `job-db7apiks728c73fqeorg`, qualified before any deploy |
| New dependency | None |
| Worker deploy / live | `dep-db7aqqu7bikc73a66jg0` / 2026-10-13T22:16:44Z |
| Web deploy / live / build | `dep-db7arocs728c73fqm2a0` / 2026-10-13T22:21:25Z / `Ht_FMEGyWzVgTXcCFDYaM`, build cache kept |
| Final check | 2026-10-13T22:23:30Z |

## What changed

| PR (merge) | What the owner sees |
|---|---|
| [#148](https://github.com/kaywhy331/jump-in-the-mix/pull/148) (56c89c2) Decision record | Docs only: Kevin's answers to the UX batch's open points (D87–D111) and the standards that follow from them. |
| [#134](https://github.com/kaywhy331/jump-in-the-mix/pull/134) (da282e3) Stages follow-up | A paused Mix for Everyone takes in no newcomers when saved, until it's on again (D63). Remove on someone's Everyone place stops that Mix for them, so no later save or start puts them back; the row says so and offers Resume, which gives the place back (D64, SEND-03, COPY-02). A tag added while a Mix is paused moves its members to the Mix's stage when it resumes (D65; the new column). The resume review counts Everyone's newcomers (UX-09, UX-11). |
| [#150](https://github.com/kaywhy331/jump-in-the-mix/pull/150) (34042f9) Follow-ups to the UX batch | **Contacts:** Archive acts at once, with Undo (D88); the No Mix strip names how many it adds (D89); while selecting, a tap anywhere on a row ticks it, "Add phone or email" is plain text and the row's checkbox shows keyboard focus (D90); Mark No Mix needed opens on its heading (D91). **Journey:** the tabs read People / Mixes / Details and the middle pane is headed Mixes (D95); with a person chosen, the map goes to their first Mix and the phone list marks theirs (D96). **Onboarding:** the four reasons read short and show whole in the closed drop-down at 320px (D93); "Run setup again" reuses only a starter that is on and dated from the follow-up, and names a new one apart (D94); the contact hint names what the first Beat needs (D103). **Today:** "Also due" names a person's follow-up on another page (D97); a person contacted today says so, with the time, and keeps the skip, counting only outcomes that reached them (D98); a notice that appears in a phone review comes into view above the stuck bar (D100). |
| [#151](https://github.com/kaywhy331/jump-in-the-mix/pull/151) (1f60ee4) Today's refresh (D99) | Confirmations and their Undo sit outside the list, so the list re-reads at once after an outcome instead of waiting out the Undo; reads apply without hiding an open review. A person contacted today keeps their follow-ups still due under Today, so recording someone's later follow-up first doesn't pull the earlier card from under its review; "Review overdue" keeps them under Overdue. An Undo that finds the follow-up already reopened elsewhere just leaves. On desktop, the docked Next up review no longer closes a review the owner opened right after the page loaded. "Updating your follow-up list…" shows only for a read that takes over a second. |
| [#149](https://github.com/kaywhy331/jump-in-the-mix/pull/149) (4d5c307) Release record | Docs only: the UX batch release record. |

The release changes no dependency, script or configuration, and deletes no file; under `prisma/` it changes only #134's migration and its schema line. Billing variables stay unset (JITM-14 §2.31).

## Decisions

1. **Merge and release (Kevin, 2026-10-13, AskUserQuestion):** "Merge all three (Recommended)": merge main into the stack and re-verify, then merge #150, retarget #151 to main and merge it, then merge #149; and "Release after the checks (Recommended)".
   - #150 and #151 first merged main (#148, #134) without conflicts (9a8bcb1, 41c4c3f). Those merge commits are the heads that were merged, pinned by SHA.
2. **The PRs' open points (Kevin, 2026-10-13):** "Accept all (Recommended)": the agent's recommended answers to #150's six and #151's four "For Kevin" points become his decisions, and the `[PROPOSED]` items D101, D99's first fix, D94's naming, D96's phone scroll and D103's call hint are confirmed. They are logged in decision record #153 (Follow-ups).
3. **D102 (Kevin, 2026-10-12):** an Everyone place removed before #134 and not put back gets a stop, after a count. The count was 0 places in 0 accounts in the preflight, and again 0 after both services ran the release, so no backfill was written and there is nothing to reverse.
4. **Timing:** the release ran from 22:11 to 22:23 UTC, afternoon in the US, not in quiet hours (JITM-14 §2.26 says it SHOULD). Kevin asked to release after the checks; the testers' reload is an owner step.
5. No permission prompt or safety classifier refused a merge or release step.

## Verification

**Reviews (WF-05):**
- #134: approved after four rounds, merged on 2026-10-13 (da282e3).
- #150: round 2 approved at 1d85e75 (`.artifacts/pr-point-followups-20261012/REVIEW-fa-r2.md`).
- #151: round 3 approved at 273a4e4 (`REVIEW-fb-r2.md`, `REVIEW-fb-r3.md`).
- #148 and #149 were reviewed as documents (#149's round 2 approved e3bc473).

**VERIFIED locally** at 41c4c3f, #151's head after the merges of main, which is main after #150 and #151. The release commit 4d5c307 adds only #149's `docs/UX_BATCH_RELEASE_2026-10-13.md` (`git diff 41c4c3f 4d5c307`). The checks ran against a production build served with CI's environment, on a fresh database migrated first and seeded as CI seeds it, with Playwright retries at 0. Evidence: `.artifacts/pr-point-followups-20261012/verification/` (`ledger.tsv`, rows tagged `mrg`; `groups-summary-mrg.log`; `playwright/pw-mrg-*`).
- **Static:** `db:generate`, `typecheck`, `validate:static` and `standards:check` exited 0, and also at #150's merge 9a8bcb1. The first typecheck at each of the two heads exited 2 (ledger rows `mrgA-01b-typecheck` and `mrg-01b-typecheck`, 20:12 and 20:13 UTC). It ran before `db:generate` on the merged schema, so the generated client, which isn't committed, probably still lacked #134's column (INFERRED from the step order and the client's file times). After `db:generate`, both exited 0. The reruns kept the step names and overwrote those logs, so only the ledger shows the failures. The one standards warning predates the release (JITM-09 is over 300 lines).
- **Vitest** (`npm run test:isolated`, two shards): 314 files and 2,443 tests passed, 74 skipped, 0 failed.
- **Worker:** `worker:qualify` passed 10 of 10.
- **Build:** migrate (the fresh database took #134's migration: a boolean, not null, default false), then `next build` (standalone), then seed.
- **Browser:** every group of CI's main step, on desktop-chromium and mobile-chromium (Pixel 7): 804 passed (422 desktop, 382 phone), 0 failed, 0 flaky. The skips are each spec's own project or flag gates.
- **The live smoke against this local build** (`UFR_SMOKE_LOCAL=1`): 7 checks passed, synthetic data removed. Its first run already passed with the profile menu now reading "Archive contact" (D88).
- **Baseline:** no browser, unit or worker failure at all, so nothing is unique to the candidate. During each PR's own rounds, the failures found were fixed in the PRs and are recorded there, including the docking race that #151's round 2 measured at 2 failures in 11 batch runs before its fix and 0 in 14 after.

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at 4e78545 with auto-deploy off, and health returned 200 in three rounds;
  - `main` was the five authorized merges, each at its merged head;
  - the migration file held exactly the reviewed statement, and nothing else under `prisma/`, `scripts/` or the Dockerfile changed;
  - the database was ready behind the `jitm_runtime` boundary with no recovery hold, all 78 migration checksums matched, and the new column was absent;
  - no billing variable was set; record counts were taken; D102's count was 0.
- **Backup:** fresh, encrypted, stored before the migration.
- **Migration:** the one-off job on the web service, still at 4e78545, applied the migration with the owner credential. It qualified: 79 migrations, the column is a boolean, not null, default false, usable by the runtime role and readable by the backup role, holds no true value, and no row count changed.
- **Worker:** live at 4d5c307. The scoped queue probe passed and its job was removed.
- **Web:** live at 4d5c307, with the build cache kept; Render's pre-deploy `db:verify-release` passed.
- **D102:** 0 places in 0 accounts on the release.
- **Postflight:** 30 public checks passed; all 80 release files and 23 assets matched.
- **Live smoke:** one synthetic owner in UTC, with one Mix of three call Beats and two people with no phone or email, all removed afterwards. All 11 checks passed: sign-in cookies; the real client address, also with a forged `X-Forwarded-For`; signed error banners; Today's shared card; the contact profile's menus (now "Archive contact", D88); Contacts' Select control and No Mix strip; Journey's phone list; and nothing recorded, sent or skipped.
- **Final check:** record counts unchanged since the preflight; no synthetic users, workspaces, share keys, review requests or probe jobs; no job failed since the release and no rate limit was blocking; both services at 4d5c307 with auto-deploy off. Health returned 200 once per endpoint in the check, and in three more rounds polled by hand at 22:24:43–46 UTC (below).

## Release steps

The release ran step by step from `.artifacts/market-live-20260924/ufr-*.mjs`, with receipts in that folder's `ufr-*.json` files, in this order: local verification (`ufr-verification.json`), the read-only preflight, the backup, the migration job, the worker deploy and its queue probe, the web deploy, D102's count, the postflight, the live smoke and the final check.

**What changed from the previous release's scripts:**
- The migration step and its qualification come from the stages release (`mst-*`), adapted to this column.
- The preflight checks the five merges, and allows exactly #134's migration and schema line under `prisma/`.
- A D102 step counts the places after the web deploy. Had the count been above 0, it would have stopped the release there, after the deploys and before any backfill write, so a backfill and its reverse could be rehearsed first. The preflight only reported the count.
- The live smoke expects "Archive contact" without an ellipsis (D88).

**Failed or retried steps:** none in production. Locally, the first typecheck at 9a8bcb1 and at 41c4c3f exited 2 before `db:generate` and passed after it (Verification, Static).

**A deviation, repeated:** the final check polled each health endpoint once, as in the previous release; JITM-14 §2.18 and WF-06 step 11 say three times. The previous record asked for this fix and it wasn't carried into this release's copy. Three rounds were then polled by hand at 22:24:43–46 UTC, and all nine requests answered 200. The command and its output are copied verbatim from the session transcript into `.artifacts/market-live-20260924/ufr-final-health-manual.json`, saved after the release. `ufr-finalize.mjs` now polls three rounds for the next release.

## Rollback

Redeploy `prod-2026-10-13-4e78545`, web first and then the worker. Don't reverse the migration (JITM-14 §2.24); no release-specific data transform ran, so there is nothing to undo. A rollback brings back the previous behaviors above, including Today's Undo hold.

**What the previous code finds:**
- `MixAssignment.addedWhilePaused`: 4e78545 never reads it, and the rows it creates get the default (VERIFIED-CODE: no reference at 4e78545).
- Stops the new Remove writes, with the reason `mix.everyone.removed`: 4e78545 flags only plan-limit and stage-exit reasons (`src/lib/contact-mix-rows.ts:53` at 4e78545), so it shows them as ordinary stops with Resume (INFERRED from the code).
- Runs ended as `mix_stopped_for_contact`: 4e78545 already uses that method.

## Owner steps

1. **Tell testers to reload** (JITM-14 §2.26), then a **device pass** on a real iPhone and an Android phone: Today after an outcome (the Undo beside the next review, the list refilling at once, "Contacted today at …"), a person's contact profile and Archive's Undo, Contacts' selection mode, Journey's tabs and list, and onboarding's reason drop-down.
2. **Outage signal (JITM-14 §2.30):** there is still no external uptime monitor (backlog B-08). GitHub Actions runs again since Kevin made the repository public on 2026-10-13, after this release; a manual run of the hourly production smoke passed at 23:16 UTC.
3. **TRU-09:** publish the invitation wording with "three" as the system Mix's next version in the staff console (D83's batch).
4. **Merge this record,** or authorize an agent to merge it (JITM-16 §2.5).
5. **Drop the local evidence databases on TrixBot,** since agents may not: `jitm_design_uxr1012_mrg_e2e`, `_fa5_e2e`, `_fa6_e2e`, `_fb4_e2e`, `_fb5_e2e`, `_fa_e2e`, `_fa_static`, `_fa_vitest`, `_fb_e2e`, `_fb_static`, `_fb_vitest`, `_f134e2e`, `_f134e2e2`, `_f134static`, `_f134vitest`, `_f134worker`, `_e2e` and `_worker`; and still from earlier records, `jitm_design_uxa1008`, `_uxa1008_hf`, `_uxa1008_tp`, and the `jitm_design_msf1008_*` (#134's own evidence), `jitm_design_mst1007_*`, `jitm_design_mns1006*` and `jitm_design_nms1006*` databases. The names come from the ledgers; a few, such as the `_static` ones, may never have been created.
6. **Still open from earlier releases:** the No Mix release's agent defaults 1–8, the visit question in JITM-09 §6, and its follow-up fixes (REOPEN-01, UNDO-06, the UNDO-05 (c) guard).

**NOT RUN:**
- **CI's other steps:** the dependency audit (no dependency changed; hosted CI, running again after the release, fails it on advisories that 4e78545 carries too: Follow-ups); the Security workflow's secret scan (the diff adds no keys, tokens or credentials; hosted CI flags one older test fixture: Follow-ups); CI's committed baseline SQL check (the baseline migration is unchanged since 4e78545); CI's populated migration rehearsal (the migration is one column with a constant default, and the production job qualified it); the local `db:verify-release` (Render's pre-deploy ran it on production's database: Web, above); `scheduler:check` (`infra/cloudflare-scheduler/` is unchanged); the encrypted backup and restore rehearsal (production took a real backup); the packaged-server recovery suite, `load:qualify` and the hosted-fixture rehearsal; the browser flows under a restricted runtime role (the local runs used the owner role); CI's separate staff, waitlist and registration steps, and the public-trust tests with their flag (this release changes no staff, registration or public-trust page); Lighthouse (no public page's markup changed: the only change in `marketing-scenarios.ts` is the contractors' stored reason, which `ProductDemo.tsx` and `ProfessionExamples.tsx` don't show; the global stylesheet, which `/` and `/for/*` load too, gained 18 lines of rules for app screens only: onboarding, contact selection, the contact menu and Today's rows); the image builds (Render builds with its Node runtime).
- **D102's backfill rehearsal:** not needed, since nothing was to be written.
- **What the live smoke can't exercise,** because it records nothing: #151's confirmations and refresh, #150's Archive Undo and contacted-today lines, and #134's Remove and Resume. These were verified locally and in each PR's screenshots.
- **Devices and browsers:** physical phones, VoiceOver and TalkBack; WebKit and Firefox.
- **Real data:** a production account with real data.

## Follow-ups

- **Decision record #153** for Kevin's 2026-10-13 answers: #151's four points (keep LIV-01's fix and build next a rule that a card keeps its section while its review is open; "Review overdue" keeps contacted people under Overdue; the one-second rule for "Updating…"; "Already reopened."), #150's six (a new starter named "(2)"; the phone list scrolls to the person's Mix; the call hint asks for a phone number; "contacted today" counts only outcomes that reached the person; the short reason labels are stored as the reason; JRN-03: Journey also marks Mixes from the person's Mix starts, in a later PR), the confirmed `[PROPOSED]` items, and STD-01 (JITM-08 §6: D99 built, PLC-01's cases beside B-20; JITM-09 §2.82: PLC-02).
- **Left for later in #151:** CLN-02, UND-01's in-flight half, UND-02, TRN-01, B-20 with PLC-01's cases, the optional HLD-01 test, and the older screenshot problems (two MEDIUM) for the audit backlog.
- **Left for later in #150:** JRN-02 (seen in a screenshot), TDY-02, TDY-03, TST-03's rest, the onboarding example option that is still cut on phones (2026-09-17), and the round-2 LOWs (INT-01, A11Y-01, LAY-01).
- **For D82's batch:** Contacts' "Add phone or email" link outside selection (119×18px, carried from the previous record); the smoke still excludes that element.
- **Older problems from #150's and #151's screenshots, for D82's batch:** #150's list ("Toda/y" at 320px with 200% text, avatar initials at 200% text, the email-first hint cutting the real-estate reason, "Add phone or e…" and "Archive 1…", the rail's "Profil/e" at 1199px, and the full-width "Contact archived." banner) and #151's six LOW ones (`.artifacts/pr-point-followups-20261012/shots/r2/INSPECTION-fb2.md`). #151's two MEDIUM ones are backlog B-22 (#153).
- **Still open from the UX batch's pull requests,** as `docs/UX_BATCH_RELEASE_2026-10-13.md` lists them (Follow-ups, "Left for later in each PR"): #141's TST-09; #142's list; #143's SCR-02 (b), A11Y-01, FIT-02 and TST-02; #144's SPC-01, REN-01, TST-02 and DOC-02; #145's list; #146's LAY-02, LAY-04, LAY-05, A11Y-04 and the rest; #147's SEND-02, NIT-02, LAY-01, HIST-01, B-15 and the rest of the Contacts lane.
- **Still open from #134** (`docs/MIX_STAGES_FOLLOWUP_2026-10-08.md`, "Found, not fixed"): a draft saved with "Keep paused" and then started counts as a resume; two Resumes at once; Remove checks the support view itself rather than with `requireWritableWorkspace()` (JITM-11 §2.11); and four items from #132 (an editor save drops hidden tags, "Everyone" runs into its count in the editor, the editor's sticky buttons at 320px with 200% text, and the "Mega-mixes" tab label). #134's round-4 REL-01, the backfill relabel's limit, is moot: D102 counted 0, so no backfill ran.
- **Hosted CI on 4d5c307** (found after the release, once Actions ran again): the dependency audit fails on `next` 16.3.6, `sharp` 0.35.4 and `source-map-js` 1.2.1 (advisories published 2026-09-18 to 2026-10-07), and the secret scan flags one test fixture from 537a62d. #154 patches the three packages and adds the fixture's fingerprint to `.gitleaksignore`. None of the advisories' conditions holds in production as configured (INFERRED from the code; #154 gives the reasons).
- **Carried forward:** the review page's three pre-existing defects for D84 (`docs/REVIEW_STARS_RELEASE_2026-10-09.md`), and the audit's next items: D85's import stage, then Calendar (D74), then D78, D80, D81, D82, D83 and D84.
