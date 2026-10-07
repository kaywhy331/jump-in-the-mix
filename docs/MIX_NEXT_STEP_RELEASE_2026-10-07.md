# What happens next release — October 7, 2026

Live at https://jumpinthemix.com since 2026-10-07 12:59 UTC (web cutover). The final check passed at 13:00:30 UTC.

This release ships PR #128, the second build slice of D33 and D34:
- **The end-of-Mix question.** When the owner finishes the last Beat of a Mix with nothing after it, and the person is left with no Mix, Today asks "What's next for {name}?". The answers are start another Mix, schedule a one-time follow-up, or mark No Mix needed (D33, D48).
- **"Everyone" includes people added later** (P6, D52).
- **The New contacts setting.** Settings → New contacts offers three choices: leave them out (the default), add them to a chosen Mix, or ask each time. It applies to Add a contact, Quick Add, phone contacts and lead connections, each lead connection can choose its own Mix, and imports ask in their review step (D34, D49–D53).
- **The readings that five rounds of review settled,** confirmed by Kevin as D54–D60. A Contact stage's Mix comes first. A Mix starts once for a person. Mixes that start after another Mix are never offered for new people.

The release also carries the No Mix release record (#129) and two test-only fixes (#130).

The release has two additive migrations and no dependency or service configuration change. Billing variables stay unset (JITM-14 §2.31).

**D52, reported to Kevin:** no account had a Mix with Everyone places. The backfill marked no Mix, and the re-sync after the web deploy changed none, so no owner's existing Mixes behave differently.

**Rollback:** redeploy `prod-2026-10-06-4a77761`, web first and then the worker. The previous code never reads the new columns. Never reverse the migrations in place.

| Item | Value |
|---|---|
| Previous production commit / tag | `4a77761ffdfe2f6e5048469642ffbdf6a2f7aa05` / `prod-2026-10-06-4a77761` |
| Release merge / PRs | `501841e8946dc655efdf69918600c086b2b33ca6` on `main`: [#128](https://github.com/kaywhy331/jump-in-the-mix/pull/128) (merged as d29a1a0), with [#129](https://github.com/kaywhy331/jump-in-the-mix/pull/129) and [#130](https://github.com/kaywhy331/jump-in-the-mix/pull/130). Its application code, schema, scripts and configuration are identical to the reviewed 1285681 |
| Production tag | `prod-2026-10-07-501841e` |
| Fresh encrypted backup | Stored 2026-10-07T12:49:58Z, 3 objects, before the migrations |
| Migrations / job | `20261006120000_mix_audience_everyone` and `20261006130000_new_contact_placement` / `job-db3408gm7kps73cuv080`; 77 migrations installed |
| New dependency | None |
| Worker deploy / live | `dep-db3411ad0e5s73f23dr0` / 2026-10-07T12:53:42Z |
| Web deploy / live / build | `dep-db342749v7es73ast4vg` / 2026-10-07T12:59:07Z / `z3SvFZzhGBkv78NwK-fLY`, build cache kept |
| Final check | 2026-10-07T13:00:30Z |

## What changed

The implementation record is [`MIX_NEXT_STEP_2026-10-06.md`](MIX_NEXT_STEP_2026-10-06.md). It covers the change by area, every review finding and what it became, and the seven readings now confirmed as D54–D60. In summary:
- **The end-of-Mix question** (`src/lib/mix-end-question.ts`, `src/components/MixEndPrompt.tsx`). It asks only when the run of the Mix is over. An earlier visit's Beats don't finish a repeat visit's, and follow-ups from before run keys existed count every run. It waits in Today's confirmations after the timed Undo and stays on screen with 200% text.
- **Placement** (`src/lib/new-contact-placement.ts`). One routine runs on every create path. It starts the chosen or default Mix once, never on top of a stage's Mix unless the owner picked it, and then takes the person into the Everyone Mixes they aren't already in.
- **The setting** (`/settings/new-contacts`), the per-connection choice, Add a contact's opening state, Quick Add's "Add to a Mix", and the import's review question.
- **Everyone:** the editor keeps the audience, and a Mix turned back on takes in people added meanwhile.
- **Schema:**
  - `Mix.audienceEveryone`, a boolean defaulting to false, set for Mixes that still had Everyone places;
  - the `NewContactPlacement` enum;
  - `WorkspacePreference.newContactPlacement`, defaulting to NONE, and `newContactMixId`;
  - nullable `IntakeConnection.newContactPlacement` and `newContactMixId`;
  - both Mix references `ON DELETE SET NULL`.

## Decisions

- **D33 and D34**, with P5 and P6, as confirmed on 2026-10-05.
- **D44**: the wording "No Mix will remind you about them".
- **D48–D53** (2026-10-06): the six choices the build needed.
- **D54–D60** (2026-10-07): Kevin chose "Accept all 7" for the readings the reviews needed. D57 clarifies D49.
- All are in [the owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md).

## Verification

**Reviews (WF-05):**
- five rounds of independent review: `REVIEW.md` to `REVIEW-5.md`, private evidence in `.artifacts/mix-next-step-release-20261006/`;
- round 1 found 1 HIGH and 7 MEDIUM, and round 2 found 1 MEDIUM; all were fixed;
- round 3 approved, and round 4 found one MEDIUM in a round-3 fix (the question card's surface), which was fixed;
- round 5 approved, with one LOW note, fixed in 1285681.

**VERIFIED locally,** with CI's environment on fresh local databases:
- typecheck, `validate:static` and `standards:check` passed at the final PR head.
- **Vitest at aa987a3:** 311 files, 2,328 passed, 41 skipped. The 24 failures are all `spawn pg_dump ENOENT` in the four backup and recovery suites, which are BLOCKED on TrixBot; the release touches no backup code. The related suites passed again at 9d59127 (66/66).
- **Worker suites:** `worker-runtime` and `npm run worker:qualify`, 10/10 each.
- **Schema:** `db:rehearse-migration` passed and `db:verify-release` was ready (77/0/0). The release scripts' migration checks were run against a locally migrated database first.
- **Browser:**
  - against the standalone build at aa987a3, 36 specs on desktop (222 passed) and 29 on the phone project (158 passed);
  - at 1285681, the end-of-Mix and Today specs (24 and 20 passed);
  - axe in both themes, 200% text and 320px reflow are checked in the specs.
- **Baseline:** production 4a77761 was built and served beside the candidate. Two tests failed only inside a batch on the candidate and passed alone on both builds; #130 fixed both test-only, and the batch then passed 4 of 4 runs. No failure is unique to the candidate.

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at 4a77761, with auto-deploy off;
  - health returned 200 three times;
  - the database was ready behind the `jitm_runtime` boundary, with no recovery hold;
  - all 75 migration checksums matched, and the new objects were absent;
  - no billing variable was set;
  - the diff was 61 files, with the two migrations matching the reviewed statements exactly;
  - D52 count: 0 accounts.
- **Migrations:** a reviewed one-off job, run from the checksummed GitHub archive with the live lockfile verified identical. It checked:
  - the enum's labels, and the runtime role's use of the type;
  - each new column's type, nullability and default, with select, insert and update for the runtime role and read for the backup role;
  - both foreign keys `SET NULL`;
  - the flag marking exactly the Mixes with Everyone places (none), and no setting or connection holding a Mix;
  - unchanged row counts.
- **Worker:** deployed first. It reached the release commit and passed its scoped queue probe; the synthetic job was removed.
- **Everyone re-sync:** after the web deploy, no Mix needed its flag set, and none carries it without places.
- **Postflight:** 29 public, security and redirect checks passed, including `/settings/new-contacts`. All 61 changed files and 22 served assets hash-match the release on the live instance.
- **Live smoke:** 11 checks with one synthetic owner whose people had no phone or email, so nothing could be sent (JITM-14 §2.17). It checked the standard set and the release's own behavior:
  - **Session:** a Lax, Secure, HttpOnly cookie of about 90 days, plus the known-device marker.
  - **Today on a phone:** reflows at 390 and passes axe in both themes.
  - **Client address:** the real one is recorded, also with a forged X-Forwarded-For.
  - **Error banners:** only signed wording shows.
  - **Settings → New contacts:** reflows and passes axe in both themes. Choosing a Mix picks "Add them to a Mix", and saving stores it.
  - **Quick Add:** its review reads the setting.
  - **Add a contact:** opens ticked with the setting's Mix. A person with no phone or email starts it once, and the Everyone Mix takes them in once.
  - **End-of-Mix question:** the production worker prepared a real follow-up; finishing it returned the question for that person.
  - **Cleanup:** every synthetic row was removed.
- **Final check:**
  - record counts equal the preflight in all 13 tables;
  - zero synthetic users, workspaces or probe jobs, zero failed jobs since the release, zero rate-limit blocks and zero plan-limit stops;
  - health returns 200;
  - both services are at 501841e, with auto-deploy off.

**CI:** GitHub Actions is still blocked by billing. The release relied on the local runs above and the Render build.

## Release steps

The steps ran in order through the release scripts in the git-ignored `.artifacts/market-live-20260924/` (`mns-` prefix), each gated on the one before:
1. preflight;
2. backup;
3. migrations;
4. worker deploy and probe;
5. web deploy;
6. Everyone re-sync;
7. postflight;
8. live smoke;
9. final check.

The scripts are adapted from the No Mix release. Their changes:
- the preflight checks each migration statement against the reviewed text, since this release legitimately sets a default and backfills the new flag;
- the migration job verifies the enum, the columns and their contents, the foreign keys and the D52 counts;
- a re-sync step follows the web deploy (REL-01);
- the smoke test seeds three Mixes and lets the real worker prepare the follow-up it finishes.

No step failed or was retried.

## Rollback

1. **When:** if a live check fails and no compatible forward fix is obvious (JITM-14 §2.22).
2. **How:** redeploy `prod-2026-10-06-4a77761`, web first and then the worker, then run the postflight and final check, and write a record (§2.23).
3. **The schema:** the columns and the enum stay. The previous code never reads them, and stored settings do nothing under it and apply again on re-promotion. Never reverse the migrations (§2.24).
4. **Everyone flags under the old code (REL-01):** a Mix whose Everyone audience changes while the old code runs keeps a stale flag. After a re-promotion, run the re-sync step again, and check for Mixes flagged Everyone with no Everyone places.
5. **Imports:** batches queued with a Mix start none under the old worker. A page loaded from this release sends a `mixId` that the old import route refuses until the page is reloaded.

## Owner steps

1. Check the end-of-Mix question, Settings → New contacts and Add a contact on a physical phone.
2. Drop the local evidence databases on TrixBot, since agents may not:
   - `jitm_design_mns1006_{vitest,schema,e2e,r2_vitest,r3_vitest,base,e2e2}`;
   - and, from the No Mix release, the `jitm_design_nms1006*` databases listed in its record.
3. The No Mix release's own owner steps are still open:
   - confirm its agent defaults 1–8;
   - answer the visit question in JITM-09 §6;
   - decide its follow-up fixes (REOPEN-01, UNDO-06, the UNDO-05 (c) guard).

## NOT RUN

- **Devices:** physical phones and tablets, and the System theme mode.
- **BLOCKED** by the missing `pg_dump` on TrixBot (JITM-12 §2.17): the four backup and recovery suites. The release touches no backup or recovery code.
- **A full Vitest and browser re-run at 1285681.** The changes after aa987a3 were CSS, one argument and tests, covered by the targeted runs above.
- **CI jobs:** GitHub Actions (blocked by billing), gitleaks, Lighthouse, the Docker image builds, and the packaged-server and load suites.

## Follow-ups

- **Found, not fixed** (in the implementation record):
  - an import opened from a Journey Start still gives new people an Everyone place in the Start's Mix;
  - phone shares and the device picker don't name a Mix they started (COPY-01 d);
  - the "Add phone or email" link's target size;
  - the import review's sticky bar covering the Mix hint on wide screens;
  - the `design-correction.spec.ts:111` race.
- **A timed confirmation arriving while the question shows** comes after it. At 320px with 200% text, its Undo may need the stack scrolled.
- **Next slices** in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md): stages set by Mixes and Mega-Mixes, then stage wording (§2.79–§2.80).
