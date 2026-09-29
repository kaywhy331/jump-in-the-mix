# Copy batch and one-person onboarding — September 29, 2026

Live at **https://jumpinthemix.com/** as of 2026-09-29 21:12 UTC. This is a code-only release, requested by the owner, with no migration and no configuration change:
- PR #96, the copy batch (B-01–B-03);
- PR #97, one-person onboarding (B-17);
- PR #99, which finished the copy batch's capitalization so that release verification passed.

Rollback: redeploy `prod-2026-09-28-9439fd6`, web first and then the worker (JITM-14 §2.23).

| Release | Value |
| --- | --- |
| Previous production commit | `9439fd6a072a7df7bb5ea9d06797889a8f832f75` (tag `prod-2026-09-28-9439fd6`) |
| Application commit | `9f967bc13d5bbf7c2767c8d8cbb29788f1c38ae4`: the merge of PR #99 into `main`, after #96 (`65f2c96`) and #97 (`cb154fd`). Tag `prod-2026-09-29-9f967bc`. |
| Migration and job | None. All 71 migrations were already applied, and their checksums match. |
| New dependencies | None. `package-lock.json` is unchanged. `package.json` only gains the `standards:check` script from PR #94. |
| Fresh encrypted backup | Stored at 2026-09-29 21:06:05 UTC: 3 objects, from a manual run of the daily backup job, taken after the preflight |
| Worker deploy | `dep-dau2gl97lnhs73f64hig`, live at 2026-09-29 21:07:48 UTC |
| Web deploy | `dep-dau2hrtg1s2s73b74oo0`, live at 2026-09-29 21:12:31 UTC, build `d0bWcpzOzm_vHUHcEn9e_` |
| Final check | 2026-09-29 21:16:24 UTC |

## What changed

- **Copy batch (PR #96; B-01, B-02, B-03; approved by Kevin as O8):**
  - Public pages, Settings and the shared public box say automatic sending is off during the beta, and describe the current three-Beat demo.
  - The FAQ price answer follows D28.
  - The waitlist confirmation no longer promises "the moment it's your turn".
  - The ready-made Mix guides use seven descriptive approach labels instead of third-party method names. `approachLabel()` maps the old names still stored in production at display time.
  - Messages that assert a fact carry "(only if it's true)".
  - "Contact stages" is used for stage settings, and the glossary sheet and Help use the glossary meanings.
  - Mix, Beat and Mega-Mix are capitalized in visible text, and the account page is "My account".
- **One-person onboarding (PR #97; B-17; approved by Kevin as O9):**
  - `/onboarding` opens on "One person and one follow-up · Recommended". A complete Mega-Mix and individual Mixes stay available.
  - Once the first follow-up is ready, Today's welcome offers the Mega-Mix that fits the marketing example or the business type as an optional next step. When no single Mega-Mix fits, it opens the list.
  - Radio buttons and checkboxes are no longer squeezed, and the page fits 320 px at 200% text. These fixes are scoped to onboarding.
- **Capitalization fix (PR #99):**
  - "Beats each" and "Beat waits / Beats wait for a visit" in the Mix start and review summaries are now capitalized.
  - Two browser specs that still asserted lowercase "mix" were updated.
- **Standards (PRs #94 and #95):** documents, the agent router and a development-only check script; no runtime effect.

## Decisions taken

1. **Approvals.** On 2026-09-29, Kevin approved #96 and #97, including the approach labels, the public claims, the onboarding wording and B-17's two defaults ("I approve."). He gave the merge commands for both, which the agent ran, then authorized #99 ("merge 99"). The approvals are logged as O8 and O9 in PR #98.
2. **The release was blocked, then fixed.** Verification of `cb154fd` found three failures unique to the candidate, all from #96's incomplete capitalization pass. JITM-14 §2.9 blocked the release until PR #99 fixed them, and `9f967bc` then became the candidate.
3. **Release scripts.** The previous release's scripts (`nav-*`) were adapted as `cob-*` in `.artifacts/market-live-20260924/`, with these changes:
   - **Verification gate:** the preflight refuses to run without a passed local verification receipt.
   - **`package.json` guard:** it allows only a script change; the dependency fields must be identical.
   - **Symlinks:** the two symlinks added by PR #94 (`.claude/skills`, `CLAUDE.md`) are recorded and checked by their targets, not read through.
   - **Backup:** a fresh backup step (JITM-14 §2.12) runs before the worker deploy, and the deploy refuses without it.
   - **Release checks:** the live smoke gained this release's own checks.

   These improvements belong in the committed release script (backlog B-11).
4. **Smoke check.** More hides destination descriptions on phones by design (`.more-page .settings-hub-card small`). The smoke checks that the new Journey description is present on the page, not that it is visible.
5. **Timing.** The release ran at the owner's request at about 21:00 UTC, not in quiet hours (JITM-14 §2.26 is a SHOULD).

## Verification

**Where it ran.** On TrixBot, against production builds served with CI's `validate` environment, on a freshly migrated and seeded `jitm_design_rel0929` database. The unit tests ran on a migrated, empty database. GitHub Actions is still blocked by billing: GitHub reports the jobs "not started because recent account payments have failed".

**Baseline method (JITM-12 §2.14).**
- Each failure was rerun alone on the candidate `cb154fd` and on the previous production build `9439fd6`, which ran its own specs.
- Failures are classified as unique to the candidate, pre-existing or environmental, or order-dependent.

**Tier 1.** VERIFIED-RUNTIME on `cb154fd` and again on `1ec9e4e` (PR #99's head, whose tree the release commit equals):
- `validate:static`, the typecheck and the build passed;
- on `cb154fd`, `standards:check` passed;
- the unit tests passed on both: 282 files and 2,115 tests; 8 files (74 tests) skipped by their environment gates; none failed.

**Browser suites on `cb154fd`.** VERIFIED-RUNTIME.
- **Desktop, all 79 specs** (the two retired staging specs excluded): every test passed except five.
  - `a2-contacts:162`: unique to the candidate, a stale spec.
  - `beat-timing:94`: unique to the candidate, an uncapitalized label.
  - `registration` (3 tests): environmental.
- **Phone, all 79 specs:** every test passed except `beat-timing:94` (unique) and the same three environmental `registration` tests.
- **CI staff group** (14 specs with required MFA, plus `registration` with CI's email placeholders): 60 passed.
  - `library-administration:122`: unique to the candidate, a stale spec.
  - `admin-workflow-regressions:92`: order-dependent; it passed alone on both builds.
  - `registration` passed once the email sender was configured.
- **CI staff and waitlist group** (MFA off): 12 of 12 passed.
- **The three `registration` failures:** without a configured email sender, registration shows "Account verification is temporarily unavailable". They fail identically on the `9439fd6` baseline and pass when CI's email placeholders are set, so they are environmental and not caused by this release.

**PR #99 on `1ec9e4e`.** VERIFIED-RUNTIME:
- The nine specs that exercise the changed summaries passed on desktop (54 of 54) and on the phone (47 passed; 7 skipped by the specs' own conditions).
- `library-administration` passed 2 of 2 under the staff environment.
- After the fix, no failure is unique to the candidate.

**Review.** An independent WF-05 review of `9439fd6..cb154fd` returned "Approve with non-blocking follow-ups".
- It confirmed both new queries are scoped to the session's workspace, and that the public sending and demo claims match the code.
- Its test finding (TST-01) was fixed by PR #99. The other findings are listed under follow-ups.

**Secrets.** VERIFIED-RUNTIME: `gitleaks` 8.21.2 found no leaks in the branches' commits.

## Release steps and results

All times are UTC. Scripts and receipts are in `.artifacts/market-live-20260924/cob-*`.
1. **Read-only preflight.**
   - Attempt 1 stopped on the script itself, after every production check had passed: it tried to read the `.claude/skills` symlink as a file. Nothing was written. The script was fixed.
   - Attempt 2, at 21:05:19, passed. The services were confirmed as web `srv-dagt93lbedkc738552o0` and worker `srv-dagta4uq1p3s738rnlr0`, both live on `9439fd6` with auto-deploy off.
   - The health endpoints answered 200, the database was ready, the runtime-role boundary held and there was no recovery hold.
   - All 71 migration checksums matched. The diff guard passed: 201 changed files; a manifest of 199 files and 2 links; nothing deleted.
   - Record-count baseline: User 2, Workspace 1, Contact 4, ContactPhone 2, ReferralAccessInvite 2, Jump 9, WaitlistDelivery 1, MarketplaceListing 0.
2. **Fresh encrypted backup.** Triggered at 21:05:42 and stored at 21:06:05 for this database: 3 objects.
3. **Worker deploy.** Live at 21:07:48. The new instance reported `9f967bc` once the old one drained, and the scoped queue probe passed with its synthetic job removed.
4. **Web deploy.** The build cache was kept, and the deploy was live at 21:12:31.
5. **Postflight.** Passed:
   - 20 public, health, security and sign-in-redirect checks, including `/features/follow-up-reminders` and `/follow-up-templates`;
   - on the live instance, 199 release files and 21 served assets hashed identically, both links pointed at their targets, and the database was ready.
6. **Live smoke** with one synthetic owner, whose person had no contact method and whose follow-up was review-only.
   - Attempt 1 (21:12:59–21:14:15) passed 19 checks, then failed on its own script. The script required the More Journey description to be visible on a phone, where it is hidden by design. The synthetic data was removed, and the script was fixed.
   - Attempt 2 (21:15:25–21:16:19) passed all 22 checks, and the synthetic data was removed. The checks covered:
     - the session cookie;
     - Today on a phone;
     - the real client address, including with a forged `X-Forwarded-For`;
     - signed error messages and the export;
     - a one-time next follow-up;
     - sending wording, the theme switch and invitations;
     - phone reflow and axe in both themes;
     - Journey numbering;
     - onboarding opening on the one-person choice;
     - "Off during the beta", "Contact stages", the More Journey description and "My account";
     - the nine approach options: the seven descriptive labels plus "Everyday follow-up" and "Relationships", with no retired names;
     - the public reminders, FAQ and template wording.
7. **Final check** (21:16:24). Passed:
   - record counts equal the baseline;
   - no probe jobs, synthetic users or workspaces, failed jobs since the release, or rate-limit blocks;
   - health answered 200 on live, ready and worker;
   - both services run `9f967bc` with auto-deploy off.
8. **Tag.** Pushed `prod-2026-09-29-9f967bc`, annotated with the release, the PRs, both deploy ids and the previous commit.

## Rollback

- **Trigger:** a live check fails and no compatible forward correction is obvious (JITM-14 §2.22).
- **Steps:** redeploy `prod-2026-09-28-9439fd6` to the web service first, then the worker. Then run the postflight and the final check, and write a record.
- **Data:** the schema and data are unchanged, so no data reversal is needed.
- **Old stored labels:** the previous release shows the old approach names still stored in production. The copy batch never changed that stored data.

## Owner steps and NOT RUN

**Owner steps:**
- Tell any active testers to reload (JITM-14 §2.26).
- The outage signal is still incomplete (JITM-14 §2.30). The free external uptime monitor (B-08) is not set up, and GitHub Actions, including the hourly production smoke, is blocked by billing.

**NOT RUN:**
- Physical iPhone and Android devices.
- A real invitation → registration → verification → onboarding chain with a real inbox.
- Lighthouse on the public pages, whose changes are wording only.
- The full browser suite on `9f967bc` itself: it ran in full on `cb154fd`, and the affected specs were rerun on the fix (JITM-12 §2.13).
- Migration and restore rehearsals: no schema change.

## Follow-ups

**From the WF-05 review:**
- COPY-01: Mixes copied from ready-made ones keep the old stored approach name in "Internal approach". Map it when a copy is made, or migrate the stored values.
- VOC-01: remaining retired words and casing:
  - "cue day" and "with the cue";
  - "Loop · repeat this date";
  - "touchpoint" in a profession page's meta description;
  - "customer journey" link labels;
  - "Mega-mixes" and "connected mixes" in the Mega-Mix library.
- TRU-01: the Calendar entry promises a per-visit automatic-sending control that does not exist.
- Q-01: check the FAQ's "Prices after the beta haven't been set." against JITM-02 §2.18.

**First run, before inviting testers:**
- ONB-10: a realtor's default first message mentions an estimate. The default first follow-up for each business type needs Kevin's decision.
- The untouched onboarding form shows "Unsaved changes"; the fix is to the shared `FormGuard`.
- ONB-04, ONB-05, ONB-07 and ONB-09.
- Today breaks words at 320 px with 200% text.

**Operations:**
- B-11: commit the reusable release script with this release's improvements.
- B-08: the external uptime monitor.

**Records:**
- PR #98 (O8, O9 and the standards' deviation lists) needs merging after its update for these findings.
