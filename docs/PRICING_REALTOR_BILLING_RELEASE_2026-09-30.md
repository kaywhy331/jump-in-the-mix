# Pricing, realtor journey and billing (off) — September 30, 2026

Live at **https://jumpinthemix.com/** as of 2026-09-30 19:44 UTC. The owner asked for this release ("Release now", 2026-09-30). It carries:
- PR #101, the FormGuard "Unsaved changes" fix;
- PR #102, realtor onboarding and the rebuilt Real estate Mega-Mix;
- PR #103, the pricing page, the FAQ answer and the footer link;
- PR #104, Stripe checkout and billing, **switched off**;
- PR #105, the owner-decision records (docs only);
- PR #106, a test fix that release verification required.

It includes one additive migration, which adds two empty billing tables. No billing or Stripe variable is set in production, so nothing can be bought and no plan limit applies.

Rollback: redeploy `prod-2026-09-29-9f967bc`, web first and then the worker (JITM-14 §2.23). The new tables stay, empty; `9f967bc` never reads them.

| Release | Value |
| --- | --- |
| Previous production commit | `9f967bc13d5bbf7c2767c8d8cbb29788f1c38ae4` (tag `prod-2026-09-29-9f967bc`) |
| Application commit | `69991660a13c2ad2c8713991e2142ff823050989`: the merge of PR #106 into `main`. It equals the verified `94b9539` (#101–#104) plus #105 (docs and standards) and #106 (one browser spec). Tag `prod-2026-09-30-6999166`. |
| Migration and job | `20260929180000_workspace_billing` (the `BillingPlan` and `BillingInterval` enums, and the `WorkspaceBilling` and `StripeWebhookEvent` tables), applied by one-off job `job-daum9g3tqb8s73bu4l20` with the owner role. The history now holds 72 migrations. |
| New dependencies | `stripe` 22.6.2, pinned. The preflight allowed only that lockfile record and the `stripe:setup` script. |
| Billing configuration | None. No `BILLING_*` or `STRIPE_*` variable is set in the environment group or on either service; the preflight and the migration job both checked this. |
| Fresh encrypted backup | Stored at 2026-09-30 19:36:07 UTC: 3 objects, taken after the preflight and before the migration |
| Worker deploy | `dep-daumaavlk1mc73denhug`, live at 2026-09-30 19:39:42 UTC |
| Web deploy | `dep-daumb3gjo6nc73dob1qg`, live at 2026-09-30 19:44:10 UTC, build `Nn5o8F250sgAR28WIuL4f` |
| Final check | 2026-09-30 19:46:48 UTC |

## What changed

- **FormGuard (PR #101):** a form counts as changed only after the person's first action, so an untouched form no longer shows "Unsaved changes". Fields that only show status are ignored.
- **Realtor journey (PR #102; wording approved by Kevin):**
  - The Real estate Mega-Mix is now version 2, with separate buyer and seller paths from lead to past client.
  - Realtor onboarding offers seven first follow-ups from that journey. It starts with "Reply to a new buyer lead", and its preview no longer mentions an estimate. This closes ONB-10.
  - Workspaces that installed version 1 keep their installation.
- **Pricing (PR #103; wording approved by Kevin):**
  - `/pricing` shows Free ($0), Plus ($15 a month or $144 a year) and Pro ($29 a month or $288 a year), with their limits, and says paid plans haven't started.
  - The FAQ cost answer names the plans and links to the page. The public footer links to Pricing.
- **Billing, off (PR #104):**
  - My account links to **Plan and billing** (`/account/billing`). While billing is off, it says "Free during the beta" and offers nothing to buy.
  - The Stripe webhook `/api/webhooks/stripe` answers 503.
  - The worker's retention job also clears webhook event ids older than 90 days. The table is empty.
- **Records (PR #105):** O10–O13 in the owner-decision log, and Plan and billing in JITM-09 §2.65.
- **Test fix (PR #106):** `correctness-route-continuity.spec.ts` allows the approved Plan and billing card and expects the webhook to refuse GET with 405.

The JITM-01 §2.22 feature map needed no change. It already lists payments as "Built but off" and plans and prices as "Planned (prices decided)".

## Decisions taken

1. **Release and limits.** On 2026-09-30, Kevin chose "Release now". In the same answer he settled the two open plan-limit questions:
   - an automatic enrollment that would go past a limit is **skipped, with a notice on Today**;
   - the onboarding starter Mix **does not count** toward the 3 active Mixes.

   Both wait for the limits PR. Limits apply only while billing is on.
2. **Test fix and merges.** Verification found one failure unique to the candidate, a stale test (below). Kevin authorized merging #105 and #106 ("Merge 105 + 106, release"), and `6999166` became the release commit.
3. **Review finding accepted as a gate.** The independent WF-05 review (below) returned "Changes requested" for one MEDIUM finding, BIL-01. Kevin chose "Release now, fix before billing". **Billing MUST NOT be switched on until BIL-01 is fixed.**
4. **Release scripts.** The previous scripts were adapted as `bil-*` in `.artifacts/market-live-20260924/`:
   - `cob-*` provided the verification gate, the backup and the symlink handling;
   - Release B's `b-*` provided the migration job and the added-package guard.

   New in this set:
   - the preflight refuses any billing variable, and refuses if the billing tables or enums already exist;
   - the migration job checks the new tables and enums, that the tables are empty, and the runtime role's privileges on them. It would have granted the backup role read access if needed; the default privileges already covered it.
   - the live smoke gained this release's checks.

   These belong in the committed release script (backlog B-11).
5. **Timing.** The release ran at about 19:35 UTC at the owner's request, not in quiet hours (JITM-14 §2.26 is a SHOULD).

## Verification

**Where it ran.** On TrixBot, against production builds served with CI's `validate` environment, on a freshly migrated and seeded `jitm_design_rel0930` database. GitHub Actions is still blocked by billing.

**Baseline method (JITM-12 §2.14).** Each failure was rerun alone on the candidate `94b9539` and on the production build `9f967bc`.

**Tier 1.** VERIFIED-RUNTIME:
- On `94b9539` (2026-09-30):
  - `validate:static`, the typecheck and the build passed;
  - no browser chunk contains the Stripe library;
  - Vitest: 2,155 passed. 24 failed, all in the four backup and recovery files: `spawn pg_dump ENOENT`, because TrixBot has no PostgreSQL client tools. They fail identically on `9f967bc`.
- On `6999166`: `standards:check` passed.

**Browser suites on `94b9539`.** VERIFIED-RUNTIME.
- **Desktop, all 80 specs** (the two retired staging specs excluded): every test passed except five.
  - `correctness-route-continuity:17`: unique to the candidate, a stale test. It passes alone on the baseline. Fixed by PR #106, which passed 3 of 3 against the candidate build.
  - `sheet-interactions:50`: pre-existing. It fails alone on both builds.
  - `registration` (3 tests): environmental. They fail without an email sender and pass with CI's email placeholders.
- **Phone, all 80 specs:** every test passed except these:
  - `onboarding-journey-preferences:114` (a screenshot timeout) and `sheet-interactions:50`: pre-existing. Both fail alone on both builds.
  - The same three environmental `registration` tests.
- **CI staff group** (14 specs with required MFA, plus `registration` with CI's email placeholders): 62 passed, 3 skipped by their own conditions.
- **CI staff and waitlist group** (MFA off): 12 of 12 passed.
- After #106, no failure is unique to the candidate.

**Review.** An independent WF-05 review of `9f967bc..6999166` checked the release against production with the billing variables unset:
- readiness is unchanged;
- no Stripe client is built at load, and every Stripe call is guarded;
- the webhook refuses events;
- the proxy change only adds `/pricing` to the recovery-public paths;
- the migration is additive and compatible with `9f967bc`;
- the public copy is true;
- version 1 Real estate installations keep working;
- the FormGuard change is sound.

Verdict: **Changes requested**, for one finding:
- **BIL-01 (MEDIUM):** account deletion closes Stripe billing for the person's first membership's workspace (`src/lib/account-deletion-actions.ts`, via `requireWorkspace()`), while the deletion removes the workspaces they *own*. With billing on, a member deleting their account could close the owner's billing, and an owner of several workspaces could keep being charged. It has no effect while billing is off: no billing row can exist. Kevin accepted it as a gate (Decisions, item 3).
- REL-01 (LOW): no real Stripe test-mode purchase yet.

## Release steps and results

All times are UTC. Scripts and receipts are in `.artifacts/market-live-20260924/bil-*`.
1. **Read-only preflight** (19:35:41). Passed:
   - both services (web `srv-dagt93lbedkc738552o0`, worker `srv-dagta4uq1p3s738rnlr0`) were live on `9f967bc` with auto-deploy off;
   - health answered 200 three times;
   - the database was ready, the runtime-role boundary held and there was no recovery hold;
   - all 71 applied migrations matched their checksums, and the billing tables and enums did not exist yet;
   - no billing variables were set;
   - the diff guard passed: 71 changed files, nothing deleted, one additive migration, one added package.

   Record-count baseline: User 2, Workspace 1, Contact 4, ContactPhone 2, ReferralAccessInvite 2, Jump 9, WaitlistDelivery 1, MarketplaceListing 0.
2. **Fresh encrypted backup.** Triggered at 19:35:42 and stored at 19:36:07: 3 objects.
3. **Migration.** The job ran inside Render's network with the owner role, while `9f967bc` kept serving. It qualified:
   - 72 migrations, both tables and both enums present, both tables empty;
   - runtime role: `migrated-and-runtime-verified`, full row privileges on the new tables and none elevated, migration history read-only;
   - backup role: can read both tables, cannot write;
   - record counts unchanged.
4. **Worker deploy.** Live at 19:39:42. The new instance reported `6999166`, and the scoped queue probe passed with its synthetic job removed.
5. **Web deploy.** The build cache was kept, the pre-deploy checks passed, and the deploy was live at 19:44:10.
6. **Postflight** (19:44:17–19:45:35). Passed:
   - 22 public, health, security and sign-in-redirect checks, including `/pricing`, and `/account/billing` redirecting to sign-in;
   - on the live instance, 71 release files and 21 served assets hashed identically, and the database was ready.
7. **Live smoke** (19:45:37–19:46:44). All 24 checks passed with one synthetic owner, and the synthetic data was removed. Beyond the earlier releases' checks, it covered:
   - Real estate onboarding starting with "Reply to a new buyer lead" and previewing the New buyer lead Beat, with no estimate wording (nothing was submitted);
   - Plan and billing showing "Free during the beta" with nothing to buy, the webhook answering 503, and no billing row created;
   - phone reflow and axe in both themes on Plan and billing;
   - the FAQ plan answer;
   - `/pricing` showing the three plans with no checkout, passing axe in both themes, and the footer's Pricing link.
8. **Final check** (19:46:48). Passed:
   - record counts equal the baseline;
   - no probe jobs, synthetic users or workspaces, failed jobs since the release, or rate-limit blocks;
   - health answered 200 on live, ready and worker;
   - both services run `6999166` with auto-deploy off.
9. **Tag.** Pushed `prod-2026-09-30-6999166`, annotated with the release, the PRs, both deploy ids, the migration job and the previous commit.

## Rollback

- **Trigger:** a live check fails and no compatible forward correction is obvious (JITM-14 §2.22).
- **Steps:** redeploy `prod-2026-09-29-9f967bc` to the web service first, then the worker. Then run the postflight and the final check, and write a record.
- **Data:** never reverse the migration (WF-06). The tables are empty and `9f967bc` ignores them.

## Owner steps and NOT RUN

**Owner steps:**
- Tell any active testers to reload (JITM-14 §2.26).
- Before choosing a billing start date:
  - BIL-01 must be fixed;
  - a real Stripe test-mode purchase must pass. It needs your test key, saved privately on TrixBot;
  - the go-live decisions remain: beta accounts, sales tax, refunds and cancellation timing, and the failed-payment grace period.
- The outage signal is still incomplete (JITM-14 §2.30): there is no external uptime monitor (B-08), and GitHub Actions is billing-blocked.

**NOT RUN:**
- Physical iPhone and Android devices.
- A real inbox registration chain.
- Lighthouse.
- Migration and restore rehearsals on this run. `db:rehearse-migration` passed on PR #104's branch.
- Stripe test mode.
- A screenshot comparison with the design export for `/pricing` and `/account/billing`. The PRs carried screenshots; the release captured phone screenshots of both.

## Follow-ups

- **BIL-01:** close billing for every workspace the person owns, and never for a workspace they only belong to. Test it with a member and with an owner of several workspaces. This blocks enabling billing.
- **Plan limits PR:** enforce 100/1,000/5,000 people and 3/25/100 active Mixes, only while billing is on, using Kevin's two decisions (Decisions, item 1).
- Pre-existing browser failures on both builds: `sheet-interactions:50` (desktop and phone) and `onboarding-journey-preferences:114` (phone screenshot timeout).
- B-11: commit the reusable release script with the `bil-*` improvements.
- Earlier review follow-ups remain open: COPY-01, VOC-01 and TRU-01. Q-01 is answered by PR #103's FAQ.
