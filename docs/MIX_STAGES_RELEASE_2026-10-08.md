# Stages from the work release — October 8, 2026

Live at https://jumpinthemix.com since 2026-10-08 12:45 UTC (web cutover). The final check passed at 12:47:25 UTC.

This release ships PR #132, the third build slice of D35 (JITM-09 §2.51 and §2.79):
- **A Mix can name a Contact stage.** The Mix editor's "Name and start" offers a Contact stage. People who start that Mix move to it, and only the label changes. The Mix's details and Contact stages say which Mix sets which stage.
- **Every way a Mix starts for a person sets the stage**, in the transaction that starts it, with a stage history entry and an activity line ("Lead → Prospect, set by the Mix “Qualify”."). Someone still waiting for the worker's stage pass joins the arrival stage first.
- **Saves that move people are always reviewed** (D62): turning on a stage-naming Mix with an audience, ticking Everyone or adding a tag. An Everyone Mix moves only people with no stage yet (D66).
- **Mega-Mix stage labels** (P8, D61): adding a ready-made Mega-Mix offers "Add its stage labels", and each of its Mixes names its label.
- **Retiring a stage** unlinks the Mixes that set it.

The release also carries the What happens next release record (#131).

The release has one additive migration and no dependency or service configuration change. Billing variables stay unset (JITM-14 §2.31).

**What existing accounts see:** no Mix names a stage until an owner chooses one, so nobody's stage changes on its own. One account uses Contact stages (4 people in a stage); its stages behave as before.

**Rollback:** redeploy `prod-2026-10-07-501841e`, web first and then the worker. The previous code never reads `Mix.stageId`. Never reverse the migration in place.

| Item | Value |
|---|---|
| Previous production commit / tag | `501841e8946dc655efdf69918600c086b2b33ca6` / `prod-2026-10-07-501841e` |
| Release merge / PRs | `dae3fab7dcf39d30ab864f0a8935e4ed9b3929b4` on `main`: [#132](https://github.com/kaywhy331/jump-in-the-mix/pull/132), with [#131](https://github.com/kaywhy331/jump-in-the-mix/pull/131) (merged as d539060). Its tree is identical to the reviewed head adda659 |
| Production tag | `prod-2026-10-08-dae3fab` |
| Fresh encrypted backup | Stored 2026-10-08T12:37:07Z, 3 objects, before the migration |
| Migration / job | `20261007120000_mix_stage` / `job-db3ot3k9v7es73du0h9g`; 78 migrations installed |
| New dependency | None |
| Worker deploy / live | `dep-db3otpugekts73flf5n0` / 2026-10-08T12:40:30Z |
| Web deploy / live / build | `dep-db3oul8m7kps73fhnf30` / 2026-10-08T12:45:11Z / `v_IAt0iYQ2y3O3JAorLOu`, build cache kept |
| Final check | 2026-10-08T12:47:25Z |

## What changed

The implementation record is [`MIX_STAGES_2026-10-07.md`](MIX_STAGES_2026-10-07.md). It covers every route that starts a Mix and whether it sets the stage, what is not a start, the locks, the review, the Mega-Mix label lists, all eight reviews and what each finding became. In summary:
- **One function sets the stage** (`setStagesFromMixStarts`, `src/lib/mix-stage.ts`), called by every start path: a person's page and Today, bulk Add, the New contacts and lead connection Mixes, imports, saving or turning on a Mix, a tag given later, a saved date, a visit, a Journey Start and a Journey connection.
- **The arrival stage first** (`joinArrivalStage`, `src/lib/journey.ts`): someone added without a stage event joins the arrival stage with the pass's own key, so the worker's pass has nothing left to do.
- **The review** (`stageMovesForAudience`, `/api/contacts/audience?stage=…`): its count covers only the people the save starts, and the server refuses such a save without it.
- **Mega-Mix labels** (`addStageLabels`, `installMegaMix`): existing labels are reused, a retired one comes back, and a business without stages gets only the Mega-Mix's labels.
- **Schema:** `Mix.stageId` (nullable text), the index `Mix_stageId_idx`, and the foreign key `Mix_stageId_fkey` to `JourneyStage` with `ON DELETE SET NULL`. Stage history reuses the `MANUAL` event type, so no enum value was added.

## Decisions

- **D35** (2026-10-05): a Mix can set a person's stage, and a Mega-Mix can create stage labels. **P7's timing** (with D33): the stage is set when the person starts the Mix.
- **D61–D68** (2026-10-07): Kevin answered every open question with the recommended answer. D61 confirms the label lists, D62 makes the stage review an exception to JITM-09 §2.39, and D66 limits what an Everyone Mix moves. D63–D65 come in the follow-up, D67 in slice 4 and D68 in a later slice.
- **Merge and release:** Kevin, 2026-10-08 03:40 UTC ("merge and release"). The agent merged #131 at once. The safety classifier blocked its merge of #132, so the agent wrote a merge script pinned to the reviewed head; on 2026-10-08 Kevin asked for that script to run, and the agent ran it (merged 12:28 UTC).
- All are in [the owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md).

## Verification

**Reviews (WF-05):**
- eight rounds of independent review: `REVIEW.md` to `REVIEW-8.md`, private evidence in `.artifacts/mix-stages-20261007/`;
- rounds 1–3 requested changes (1 HIGH and 4 MEDIUM, then 2 MEDIUM, then 1 MEDIUM), all fixed;
- rounds 4, 5 and 6 approved with LOW notes, fixed or listed;
- round 7, of D66, requested one fix (UX-08, fixed in 875e35d), and round 8 approved at adde73f with 2 LOW: two comments, fixed in adda659, and UX-09, moved to the follow-up.

**VERIFIED locally,** with CI's environment on fresh local databases:
- `db:generate`, typecheck, `validate:static` and the standards check passed at adde73f.
- **Vitest at adde73f:** 312 files, 2,365 passed, 41 skipped. The 24 failures are all `spawn pg_dump ENOENT` in the four backup and recovery suites, which are BLOCKED on TrixBot (the same failures as the previous release); the release touches no backup code.
- **Worker:** `npm run worker:qualify`, 10/10 at ecbc8f6 and at adde73f.
- **Schema:** `db:rehearse-migration` passed and `db:verify-release` was ready at 9a0433e; `prisma/` has not changed since. The release scripts' index, foreign key and column checks were run against a locally migrated database first.
- **Browser**, against the production build:
  - at ecbc8f6, batches S, M, C, I and A: 201 passed on desktop and 157 on the phone project, none failed or flaky;
  - at adde73f, after the one-line UX-08 change, batches S and M: 72 passed on desktop and 64 on the phone, none failed;
  - axe in both themes, 200% text at 320px and the keyboard are checked in `e2e/mix-stages.spec.ts`.
- **Baseline:** no browser test failed, and the only Vitest failures are the environment-blocked suites that also fail for production 501841e, so no failure is unique to the candidate. adda659 changes only comments after adde73f.

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at 501841e, with auto-deploy off;
  - health returned 200 three times;
  - the database was ready behind the `jitm_runtime` boundary, with no recovery hold;
  - all 77 migration checksums matched, and the new column, index and foreign key were absent;
  - no billing variable was set;
  - the diff was 48 files, with the migration matching the reviewed statements exactly.
- **Migration:** a reviewed one-off job, run from the checksummed GitHub archive with the live lockfile verified identical. It checked:
  - the column's type and nullability, with select, insert and update for the runtime role and read for the backup role;
  - the index valid and ready, and its definition;
  - the foreign key `SET NULL` on delete, `CASCADE` on update, validated;
  - no Mix naming a stage;
  - unchanged row counts in 17 tables.
- **Worker:** deployed first. It reached the release commit and passed its scoped queue probe; the synthetic job was removed.
- **Postflight:** 30 public, security and redirect checks passed, including `/settings/journey`. All 48 changed files and 22 served assets hash-match the release on the live instance. The first run, moments after the cutover, found one stylesheet answering 404 while old and new instances overlapped; the stylesheet answered 200 straight after, and the re-run passed (WF-06 step 9).
- **Live smoke:** 12 checks with one synthetic owner whose one person had no phone or email, so nothing could be sent (JITM-14 §2.17). It checked the standard set and the release's own behavior:
  - **Session:** a Lax, Secure, HttpOnly cookie of about 90 days, plus the known-device marker.
  - **Today on a phone:** reflows at 390 and passes axe in both themes.
  - **Client address:** the real one is recorded, also with a forged X-Forwarded-For.
  - **Error banners:** only signed wording shows.
  - **Contact stages:** turns on with Lead, Prospect, Client and Retention, and reflows and passes axe at 390 in both themes.
  - **Mix editor:** offers Contact stage; choosing Prospect saves `Mix.stageId`, and the choice passes axe in both themes.
  - **The Mix's details and Contact stages:** "Moves people to the Prospect stage." and "Set when someone starts {Mix}." with its link.
  - **Starting the Mix** from the person's page moved them to Prospect, with the activity "Lead → Prospect, set by the Mix “{Mix}”."
  - **Mega-Mix library:** shows "Stage: New lead".
  - **Cleanup:** every synthetic row was removed, stages included.
- **Final check:**
  - record counts equal the preflight in all 16 tables;
  - zero synthetic users, workspaces, stages or probe jobs, zero failed jobs since the release, zero rate-limit blocks and zero plan-limit stops;
  - no Mix names a stage;
  - health returns 200;
  - both services are at dae3fab, with auto-deploy off.

**CI:** GitHub Actions is still blocked by billing. The release relied on the local runs above and the Render build.

## Release steps

The steps ran in order through the release scripts in the git-ignored `.artifacts/market-live-20260924/` (`mst-` prefix), each gated on the one before:
1. preflight;
2. backup;
3. migration;
4. worker deploy and probe;
5. web deploy;
6. postflight;
7. live smoke;
8. final check.

The scripts are adapted from the What happens next release. Their changes:
- the preflight checks the one migration's three statements against the reviewed text and also refuses an `UPDATE`;
- the migration job verifies the column, the index and the foreign key to `JourneyStage`, and that no Mix names a stage;
- there is no re-sync step, since nothing is backfilled;
- the smoke test follows `e2e/mix-stages.spec.ts` on a phone.

The postflight ran twice, as described above. No other step failed or was retried.

## Rollback

1. **When:** if a live check fails and no compatible forward fix is obvious (JITM-14 §2.22).
2. **How:** redeploy `prod-2026-10-07-501841e`, web first and then the worker, then run the postflight and final check, and write a record (§2.23).
3. **The schema:** the column, index and foreign key stay. The previous code never reads them. Never reverse the migration (§2.24).
4. **What the previous code finds** (implementation record, "Rollback"): stage history entries of type `MANUAL` from a Mix, activity lines, arrival entries with the pass's key, and stages a Mega-Mix created, all read as ordinary rows.
5. **Before promoting again after a rollback:** the previous code doesn't unlink Mixes when a stage is retired, so clear `stageId` where the stage is retired.
6. **Deploy order:** with the new worker and the old web, only Journey connections set stages; with the old worker and the new web, connections don't set them.

## Owner steps

1. Check the Mix editor's Contact stage, a Mix start from a person's page and the Mega-Mix labels on a physical phone.
2. Drop the local evidence databases on TrixBot, since agents may not: `jitm_design_mst1007_{vitest,schema,e2e,e2e2,r2,r2e2e,r2_vitest,r2_schema,r2e2e2,r3_vitest,r3e2e,r4_vitest,r4e2e,r5_vitest,r5e2e,r6_vitest,r6e2e,r7_vitest,r7e2e,r8_vitest,r8e2e,r9_vitest,r9e2e}`, and the `jitm_design_mns1006*` and `jitm_design_nms1006*` databases from the two releases before.
3. Merge this record, or authorize an agent to merge it (JITM-16 §2.5).
4. The earlier releases' owner steps are still open: the No Mix release's agent defaults 1–8, the visit question in JITM-09 §6, and its follow-up fixes (REOPEN-01, UNDO-06, the UNDO-05 (c) guard).

## NOT RUN

- **Devices:** physical phones and tablets, and the System theme mode.
- **BLOCKED** by the missing `pg_dump` on TrixBot (JITM-12 §2.17): the four backup and recovery suites. The release touches no backup or recovery code.
- **A full browser re-run at adde73f or later.** The C, I and A batches last ran at ecbc8f6; only the one-line UX-08 change and comments followed, and the S and M batches that cover them passed at adde73f.
- **Browser specs outside the batches:** 33 of the 90 spec files ran in the final rounds; the rest cover pages this change doesn't touch (implementation record, "NOT RUN").
- **CI jobs:** GitHub Actions (blocked by billing), gitleaks, Lighthouse, the Docker image builds, and the packaged-server and load suites.

## Follow-ups

- **The follow-up PR to #132:** D63 (a "Keep paused" save of an Everyone Mix places no newcomers, following D58), D64 (Remove on an Everyone Mix writes a stop), D65 (a tag added while a Mix is paused moves its members at resume), and UX-09 (the resume review).
- **Slice 4:** stage presets and milestones in the owner's words (§2.80), and "Mix completed" following Journey runs (D67). **Later:** every way of adding people puts them in the first stage at once (D68).
- **Found, not fixed** (in the implementation record):
  - "Everyone1 active person": the Everyone checkbox's title and count share a line in the Mix editor (live since #128);
  - the editor's sticky buttons are cut off at 320px with 200% text;
  - the library tab reads "Mega-mixes";
  - other paths that lock a person and then rows of the business, and bulk Add's name order against its Undo's id order.
