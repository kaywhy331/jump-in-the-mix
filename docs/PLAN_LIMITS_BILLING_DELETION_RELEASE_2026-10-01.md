# Plan limits and account-deletion billing fix — October 1, 2026

Live at **https://jumpinthemix.com/** as of 2026-10-01 17:28 UTC. The owner asked for this release ("release", 2026-10-01). It carries:
- PR #108, the BIL-01 fix: account deletion closes Stripe billing for every workspace the person owns and never for one they only belong to. A last-active-owner refusal now comes before any billing is closed.
- PR #109, the plan limits. They are **inactive while billing is off**, which it is.

The release includes one additive migration, which adds the `PlanPerson` table. No billing or Stripe variable is set in production. Nothing can be bought and no limit applies.

Rollback: redeploy `prod-2026-09-30-6999166`, web first and then the worker (JITM-14 §2.23). The new table stays; `6999166` never reads it.

| Release | Value |
| --- | --- |
| Previous production commit | `69991660a13c2ad2c8713991e2142ff823050989` (tag `prod-2026-09-30-6999166`) |
| Application commit | `6cf9ad6356226a99667d7aac980f969408660283`: the merge of PR #109 into `main`, after PR #108 (`f1ac84d`). Tag `prod-2026-10-01-6cf9ad6`. |
| Migration and job | `20261001120000_plan_people` (the `PlanPerson` table, two cascading foreign keys, one index), applied by one-off job `job-dav9dc49v7es73fm29d0` with the owner role. The history now holds 73 migrations. The backup role can read the new table and cannot write it. |
| Dependencies and configuration | None changed. The preflight refused any change to `package.json`, `package-lock.json`, `next.config.ts` or `render.yaml`. |
| Billing configuration | None. No `BILLING_*` or `STRIPE_*` variable is set in the environment group or on either service. The preflight and the migration job both checked this. |
| Fresh encrypted backup | Stored at 2026-10-01 17:21:14 UTC: 3 objects, taken after the preflight and before the migration |
| Worker deploy | `dep-dav9e13bc2fs738i2j10`, live at 2026-10-01 17:24:38 UTC. The queue probe passed and was removed. |
| Web deploy | `dep-dav9epmk1f9s73dbfphg`, live at 2026-10-01 17:28:53 UTC, build `89PHI3JZh5-iqtFmeXia2` |
| Final check | 2026-10-01 17:31:58 UTC |

## What changed

- **BIL-01 (PR #108):**
  - `closeBillingForDeletion` takes the user and closes the Stripe customer of each workspace that user owns.
  - The deletion action no longer uses the session's workspace.
  - JITM-11 §2.57 says so.
  - It has no effect in production yet, because no billing row exists.
- **Plan limits (PR #109; wording approved by Kevin, O15):**
  - **People.** The worker counts the people with follow-ups on in `PlanPerson` before each follow-up pass. When billing is on:
    - someone added automatically beyond the limit is skipped in that Mix (`MixStop` reason `plan.limit`) and counted in a Today notice;
    - direct starts reserve a place or are refused.
  - **Active Mixes.** Every path that turns a Mix on checks the active-Mix limit. A Mega-Mix counts as one, and the first follow-up Mix doesn't count.
  - **While billing is off,** everyone is counted and no one is skipped. Production already holds 3 counted people and 0 plan-limit stops.
  - **Records.** JITM-09 §2.75, JITM-11 §2.58, JITM-14 §2.31 and O14 cover it, and the [implementation record](PLAN_LIMITS_IMPLEMENTATION_2026-10-01.md) describes it.

The JITM-01 §2.22 feature map already lists the limits as "built but off", which is still accurate.

## Decisions taken

1. **Merges and release.** Kevin authorized each merge ("merge 108", "merge 109") and then the release ("release"). He merged #109 without changing its wording, which approves the four plan-limit strings (O15).
2. **Review.** The independent WF-05 review of `5c02e8d..6cf9ad6` returned **Approve**, with five LOW notes (below). None of them can skip or stop follow-ups while billing is off. L4 and L5 are gates for enabling billing.
3. **Release scripts.** The `bil-*` scripts were adapted as `lim-*` in `.artifacts/market-live-20260924/`:
   - the added-package guard became a no-dependency-change guard;
   - the migration job checks that the release lockfile equals the live one;
   - the live smoke settles the people count for its synthetic account and checks that no one was skipped, that no plan-limit stop exists and that Today shows no limit notice;
   - the final check also asserts that there are zero `plan.limit` stops.

## Verification

**Before the release (tier 3, JITM-12 §2.11).** The candidate `6cf9ad6` was compared with a build of `6999166`.
- **Build and database.** The production build passed. `db:deploy` and `db:verify-release` returned 73/73 on `jitm_design_rel1001`, seeded with the demo and the end-to-end admin.
- **Desktop browser suite (80 specs)** against the candidate passed except for:
  - `design-correction.spec.ts`. It is flaky on both builds. The candidate failed once, then passed 14/14 twice. The baseline passed 14/14 once and failed once with the same missing-element error.
  - `registration.spec.ts` ×3. These are environmental: no email sender is set up, the same as in the previous release.
- **No failure was unique to the candidate.**
- **On the pull-request branches:**
  - typecheck, `validate:static` and `standards:check` passed;
  - `db:rehearse-migration` passed;
  - Vitest passed 2,154 on #108 and 2,159 on #109. #108 had one 5-second timeout that passes alone. #109 had one real bug, a foreign-key error when a reservation named another account's contact; it was fixed before merging and the affected suites were re-run.

**Production.**
- **Preflight:** read-only, passed:
  - services, health and the runtime-role boundary;
  - no recovery hold;
  - migration checksums;
  - exactly the reviewed migration;
  - no billing variables.
- **Postflight:** passed:
  - 22 public, security and redirect checks;
  - the 33 changed files and 21 served assets hash identically on the live instance;
  - the database is ready.
- **Live smoke:** 25/25 with one synthetic owner, including the new plan-limits check. Every synthetic row was removed.
- **Final check:** record counts are unchanged from the preflight. There are no synthetic rows, probe jobs, failed jobs, rate-limit blocks or plan-limit stops. Health returned 200 three times. Both services run `6cf9ad6` with auto-deploy off.

## Review notes (WF-05, all LOW)

- **L1.** If the people-count transaction fails, that follow-up generation pass is skipped. The worker retries on its next pass. Hardening: when billing is off, log and continue.
- **L2.** Each generation pass now reads the whole workspace's enrollments once. That is fine at current sizes; watch worker duration.
- **L3.** `scheduleVisit` can lock the contact before the plan lock, contrary to the comment in `plan-limits.ts`. It is safe today because the worker only takes key-share locks. Fix the comment or the order.
- **L4 (gate for billing).** Someone admitted beyond the limit only through a workflow start gets no stop.
- **L5 (gate for billing).** If two last owners delete their accounts at the same time, one can have Stripe closed and then be refused. Downgrade the billing row when Stripe is closed.

## NOT RUN

- The phone browser project. There was no layout change: the Today notice and the contact label only appear while billing is on.
- The CI staff groups. The diff touches no staff or admin surface.
- Physical devices, Lighthouse, the restore rehearsal, load qualification and image builds.
- Any run with billing on, and a Stripe test-mode purchase. Both need Kevin's test keys.

## Owner follow-ups

- Before billing is switched on:
  - fix L4 and L5;
  - decide the open items in `docs/BILLING.md` ("Turning billing on").
- When billing is switched on, set the billing variables on **the worker as well as the web service** (JITM-14 §2.31).
