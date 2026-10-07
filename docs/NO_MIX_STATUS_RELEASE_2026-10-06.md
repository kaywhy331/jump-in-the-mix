# No Mix status release — October 6, 2026

Live at https://jumpinthemix.com since 2026-10-06 21:57 UTC (web cutover). The final check passed at 22:00:10 UTC.

This release ships PR #125, the first build slice of D33:
- every contact shows "No Mix" or "No Mix needed";
- a Mix filter and a "with No Mix" link on Contacts, scoped to the current filters (D47);
- bulk "Mark No Mix needed" and "Add to the Mix", both with Undo (D46);
- the profile's "What's next" sheet;
- a No Mix line on Today, worded per D44;
- a No Mix status in Journey People.

A paused Mix still counts as being in a Mix (D45). Undo and the single "Remove from Mix" now end the run's Journey record.

The release has one additive migration, a nullable column, and no dependency or service configuration change. Billing variables stay unset (JITM-14 §2.31).

**Rollback:** redeploy `prod-2026-10-06-fd14b9a`, web first and then the worker. The previous code never reads the new column. Never reverse the migration in place.

| Item | Value |
|---|---|
| Previous production commit / tag | `fd14b9afb3f28952307b22dae1a1ff418a16c9cd` / `prod-2026-10-06-fd14b9a` |
| Release merge / PR | `4a77761ffdfe2f6e5048469642ffbdf6a2f7aa05` / [#125](https://github.com/kaywhy331/jump-in-the-mix/pull/125). Its tree `a3ab31d` equals the reviewed head `f2540f6`, whose code under test was 397da2d |
| Production tag | `prod-2026-10-06-4a77761` |
| Fresh encrypted backup | Stored 2026-10-06T21:47:57Z, 3 objects, before the migration |
| Migration / job | `20261005200000_contact_no_mix_needed` / `job-db2mpa0m7kps7397qepg`, 75 migrations installed |
| New dependency | None |
| Worker deploy / live | `dep-db2mq67avr4c73elincg` / 2026-10-06T21:51:47Z |
| Web deploy / live / build | `dep-db2mrfvlk1mc73cqrv1g` / 2026-10-06T21:57:18Z / `IVXVnvnfg2Q4WIG2PVbR6`, build cache kept |
| Final check | 2026-10-06T22:00:10Z |

## What changed

The implementation record is [`NO_MIX_STATUS_2026-10-05.md`](NO_MIX_STATUS_2026-10-05.md). It covers the full change by area, the three rounds of review fixes with their commits, agent defaults 1–8 and the deferrals. In summary:
- **Status:** one definition, `src/lib/contact-mix-status.ts`. Its rules:
  - a person is in a Mix while a Mix has work to come for them, a paused Mix included;
  - Journey work counts only while it has a follow-up to come or a real wait;
  - the "just started" grace keys on an unfinished preparation job.
- **Contacts:**
  - the row label, the Mix filter ("Any") and the "with No Mix" link, both scoped to the filters;
  - bulk "Mark No Mix needed" with Undo;
  - bulk "Add to the Mix". It names the Mix and reports each start's outcome. Its Undo ends only the starts it made and puts back what they replaced.
- **Profile:** the No Mix chip and its "What's next" sheet.
- **Today:** "{n} people have No Mix, so no Mix will remind you about them." **Journey People:** a No Mix status.
- **Remove from Mix and Undo:** both end the run's Journey record, so no false "Needs your input" appears (UNDO-04).
- **Schema:** `ContactRelationshipState.noMixNeededAt`, a nullable `TIMESTAMP(3)` column.

## Decisions

- **D33**, with its confirmed defaults.
- **D44–D47** (2026-10-06), Kevin's answers to the first review's questions: the wording, a paused Mix counting as in a Mix, bulk Undo, and counts that follow the filters.
- **Agent defaults 1–8** in the implementation record are reversible readings that wait for Kevin's confirmation (JITM-15 §2.12).
- All are in [the owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md).

## Verification

**Reviews (WF-05):**
- three rounds returned Changes requested: `REVIEW.md` at a05b189, `REVIEW-2.md` at 1e69668, `REVIEW-3.md` at 378d4fd;
- the fourth, `REVIEW-4.md` at f2540f6, returned **Approve with notes**: no HIGH or MEDIUM finding, and 7 LOW findings tracked below;
- the reports are private evidence in `.artifacts/no-mix-release-20261006/`.

**VERIFIED locally on the candidate's tree**, with CI's environment on fresh local databases:
- typecheck, `validate:static` and `standards:check` passed on 397da2d and f2540f6.
- **Vitest:** 296 files, 2,232 passed, 2 skipped, 0 failed. Every new test fails against the code before its fix.
- **The suites that create and drop their own databases, run on f2540f6:**
  - eight suites: 6 passed, 2 skipped by environment (54 tests);
  - `worker-runtime`: 10/10;
  - `npm run worker:qualify`, with its unattended tests: 10/10.
- **Schema:** `db:rehearse-migration` and `db:deploy` passed, and `db:verify-release` returned `{"status":"ready","required":75,"missing":0,"mismatched":0}` on 378d4fd. `prisma/` is identical at f2540f6.
- `next build` passed.
- **Browser:** 18 specs plus the new cases, run against the standalone build with no retries. Desktop: 128 passed, 9 skipped. Mobile: 97 passed, 40 skipped. None failed. axe passed in both themes, at 200% text and with the keyboard.
- **Baseline:** on `origin/main` 262892e, the Journey batch and `journey-connections.spec.ts:312` passed. No failure was unique to the candidate.

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at fd14b9a, with auto-deploy off;
  - health returned 200 three times;
  - the database was ready behind the `jitm_runtime` boundary, with no recovery hold;
  - all 74 migration checksums matched the release tree, and the new column was absent;
  - no billing variable was set;
  - the release diff was 47 files, with the one reviewed migration statement.
- **Migration:** a reviewed one-off job, run from the checksummed GitHub archive with the live lockfile verified identical.
  - It added `noMixNeededAt` as a nullable timestamp with no default and no filled rows.
  - The runtime role can select, insert and update the column; the backup role can read it.
  - Row counts were unchanged.
- **Worker:** deployed first. It reached the release commit and passed its scoped queue probe, and the synthetic job was removed.
- **Postflight:** passed on the first attempt.
  - 27 public, security and redirect checks passed.
  - All 47 changed files and 22 served assets hash-match the release on the live instance.
  - The database was ready.
- **Live smoke:** 11 checks with one synthetic owner. Its two people had no phone or email and no Mix, so nothing could be prepared or sent (JITM-14 §2.17).
  - **Session:** sign-in sets a Lax, Secure, HttpOnly session cookie of about 90 days and the known-device marker.
  - **Today on a phone:** shows D44's line, reflows at 390 and passes axe in both themes.
  - **Client address:** sign-in records the real client address, also with a forged X-Forwarded-For.
  - **Error banners:** public and signed-in banners show only signed wording.
  - **Profile:** the iPhone profile's chip and "What's next" sheet reflow, pass axe in both themes and store, then Undo, the confirmation.
  - **Contacts:** the row label and the Mix filter work. Bulk Mark No Mix needed and its Undo work, checked against the database.
  - **Today's Review link** opens the No Mix list.
  - **Cleanup:** every synthetic row was removed.
- **Final check:**
  - record counts equal the preflight (User 2, Workspace 1, Contact 5);
  - zero synthetic users, workspaces or probe jobs, zero failed jobs since the release, zero rate-limit blocks and zero plan-limit stops;
  - health returns 200;
  - both services are at 4a77761, with auto-deploy off.

**CI:** GitHub Actions is still blocked by billing. The release relied on the local runs above and the Render build.

## Release steps

The steps ran in order through the release scripts in the git-ignored `.artifacts/market-live-20260924/` (`nms-` prefix), each gated on the one before:
1. preflight;
2. backup;
3. migration;
4. worker deploy and probe;
5. web deploy;
6. postflight;
7. live smoke;
8. final check.

The scripts are adapted from the phone-contacts release. The preflight and the migration check were changed to accept exactly one added nullable column on an existing table. No step failed or was retried. Before its only run, the smoke script was corrected to give its people no phone or email, and to use D44's wording.

## Rollback

1. **When:** if a live check fails and no compatible forward fix is obvious (JITM-14 §2.22).
2. **How:** redeploy `prod-2026-10-06-fd14b9a`, web first and then the worker, then run the postflight and final check, and write a record (§2.23).
3. **The schema:** the column stays. The previous code never reads it, and stored "No Mix needed" confirmations do nothing under it and apply again on re-promotion. Never reverse the migration (§2.24).
4. **Ended Journey records (REL-01):** Undo and Remove record ended runs in the record's state (`enrollmentEnded`). After a rollback, the previous code does not reopen them. Restarting the same Mix for the same person on the same day, or for the same date or broadcast, would therefore prepare nothing until its next occurrence. Re-promotion restores the reopen.

## Owner steps

1. Confirm or change the agent defaults 1–8 in the implementation record. Default 7 covers waits on a paused connection; default 8 covers Undo and Remove ending a waiting decision, and Remove for every occurrence of a date-based Mix.
2. Answer the open question in JITM-09 §6: should people whose Beats wait for a visit count as in a Mix?
3. Decide whether to take the recommended follow-up fixes now or track them: REOPEN-01, UNDO-06 and the UNDO-05 (c) guard (see Follow-ups).
4. Drop the local evidence databases on TrixBot, since agents may not:
   - `jitm_design_nms1006b_{dev,e2e,perf,vitest}`, `jitm_design_nms1006c_{base,dev,e2e,e2eb,perf,vitest}` and `jitm_design_nms1006d_{dev,e2e,perf,vitest}`;
   - the verification databases `jitm_design_nms1006_*`.
5. Check No Mix on a physical phone.

## NOT RUN

- **Devices:** physical phones and tablets, and the System theme mode.
- **BLOCKED** by the missing `pg_dump` on TrixBot (JITM-12 §2.17): the four backup and recovery suites, `backup-database`, `recovery-bundle`, `recovery-cutoff` and `recovery-state`. The release touches no backup or recovery code.
- **Skipped by environment:** two of the database-creating suites. `npm run test:isolated` did not run on the final head.
- **Today after Undo in a browser:** not run in a Journey-connected account, because the browser suites run no worker. The integration tests cover it through the real worker passes.
- **CI jobs:** GitHub Actions (blocked by billing), gitleaks, Lighthouse, the Docker image builds, and the packaged-server and load suites.

## Follow-ups

- **REVIEW-4's LOW findings:**
  - UNDO-06: in a date-based Mix, Undo also ends older runs of the same Mix.
  - REOPEN-01: a Remove or Undo within about 10 s of completing a Beat lets the delayed Journey job rewrite the ended Beats. The fix is one line in the engine.
  - RACE-01: a preparation pass during the Undo commit can reopen what it ended.
  - PLAN-01: a started path back into the same Mix keeps an ended record holding a plan place.
  - REL-01: covered under Rollback above.
  - DOC-04: wording gaps in the implementation record and one code comment.
  - TST-03: the same-day restart tests depend on the clock.
- **Deferrals:**
  - PAUSE-01 (b): needs the owner's time zone in SQL or a new scheduler reason.
  - COPY-02 (b).
  - UNDO-05 (c)–(e): (c) is a preparation pass racing the Undo, a window of about a second.
- **Scale:** at 5,000 people with three Journey records each, the whole-account count takes 413 ms, or 568 ms while preparation is pending. That is acceptable at pilot scale; a status column or cache should come before larger accounts.
- **Found, not fixed** (in the implementation record):
  - the "Add phone or email" link's target size;
  - the tab bar's labels breaking at 200% text on a 320px phone;
  - the `design-correction.spec.ts:111` race, where "Mark sent" before the Journey choices load opens an empty outcome group.
- **Next slice:** PR #128 (the end-of-Mix question and the new-contact setting, D48–D53) now targets `main`. It contains rounds 1 and 2 of #125's fixes, but not round 3, so it needs `main` merged in, its own review and its own release. The session that built it has ended.
