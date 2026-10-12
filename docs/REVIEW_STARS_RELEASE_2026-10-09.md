# Review stars hotfix release — October 9, 2026

Live at https://jumpinthemix.com since 2026-10-09 04:57 UTC (web cutover). The final check passed at 05:06:24 UTC.

This release ships PR #137, the hotfix for **TRU-01**, the BLOCKER of the 2026-10-08 UX, design and layout audit (#135):
- **The problem:** the private review page (`/review/[token]`) drew its five stars right to left. A customer who tapped the rightmost star, which reads as five stars, sent "1 out of 5" while all five stars lit.
- **How long it was live:** since 793b091 (2026-09-04).
- **The fix:**
  - The stars read 1 to 5 from left to right, matching the "1 — Poor · 5 — Excellent" hint.
  - They fill from the left up to the tapped star.
  - In browsers without `:has()`, at least the chosen star lights.

The release changes one stylesheet rule set and adds one browser test. It has no migration and no dependency or service configuration change. Billing variables stay unset (JITM-14 §2.31).

**Stored ratings:** none were affected.
- Kevin approved one read-only check of the ratings stored since 2026-09-04 (D69). It found **one review request in total and no ratings**.
- No customer submitted a rating while the stars were reversed, so nothing needs correcting or flagging.

**Rollback:** do not roll back to `prod-2026-10-08-dae3fab` except for an outage. It brings the reversed stars back. A rollback would redeploy that tag, web first and then the worker. There is no schema change to reverse.

| Item | Value |
|---|---|
| Previous production commit / tag | `dae3fab7dcf39d30ab864f0a8935e4ed9b3929b4` / `prod-2026-10-08-dae3fab` |
| Release merge / PR | `db8f2d183cde10c6dde53625c1bbdd1261b0ccd2` on `main`: [#137](https://github.com/kaywhy331/jump-in-the-mix/pull/137). Its tree (`94f0122`) is identical to the reviewed head 9d73196 |
| Production tag | `prod-2026-10-09-db8f2d1` |
| Fresh encrypted backup | Stored 2026-10-09T04:51:24Z, 3 objects, before the deploys |
| Migration | None |
| New dependency | None |
| Worker deploy / live | `dep-db475onlk1mc73f2vhmg` / 2026-10-09T04:53:09Z |
| Web deploy / live / build | `dep-db476i942hec73abhpo0` / 2026-10-09T04:57:25Z / `Kya6Heo4540Gh9pGb2izd`, build cache kept |
| Final check | 2026-10-09T05:06:24Z |

## What changed

- **`src/styles/product.css`:**
  - The rating row no longer uses `flex-direction: row-reverse`, so the stars sit in their markup order, 1 to 5.
  - The fill lights the chosen star, plus every star before it: `label:has(input:checked)` and `label:has(~ label input:checked)`.
  - A plain `input:checked + span` rule lights the chosen star in browsers without `:has()`.
  - Keyboard order now matches the visual order.
- **`e2e/ui-ux-workflows.spec.ts`:** a test of what a customer sees. Picking a star by its accessible name passed even with the stars reversed, so this test checks the screen instead:
  - one row in 1-to-5 order, with no star lit at the start;
  - Tab enters the group at star 1, and ArrowRight selects star 2 with the focus ring showing;
  - a tap by position records that position, and the fill matches;
  - the stored rating is the tapped one.

## Decisions

- **D69 (Q1 = A), 2026-10-08:** "Hotfix release now, plus a read-only check of ratings stored since 2026-09-04". Kevin chose every recommended answer to the audit's 18 questions: "I will go off you recommendations. please go ahead and implement." The decisions are logged in PR #136.
- **Merge:** the safety classifier refused the agent's merge ("Merge Without Review"). Kevin merged #137 himself on 2026-10-09 at 04:49 UTC, pinned to the reviewed head 9d73196.

## Verification

**Reviews (WF-05):** two rounds. The private evidence is in `.artifacts/review-stars-20261008/`.
- Round 1 asked for changes on evidence only:
  - EVD-01 (MEDIUM): the keyboard, 320px and 200%-text checks and Vitest were missing;
  - BRW-01, TST-01, DATA-01 and GIT-01 (all LOW).
- Round 2 approved at 9d73196, with LOW notes only:
  - EVD-02: two evidence lines flattened, now corrected in the PR;
  - AUTH-01: run only the recorded aggregate query (below);
  - PRE-01: three pre-existing defects on the review page, listed under Follow-ups.

**VERIFIED locally**, against a production build and a loopback database with synthetic data:
- **Old build:** the new test failed on f23db11 (production dae3fab plus docs), at the star positions ("Expected > 701.5, Received 647.5").
- **Browser test:** it passed at 9d73196 on desktop-chromium, mobile-chromium (Pixel 7) and desktop-firefox.
- **WebKit:** desktop, and iPhone 13 emulation using Option+Tab, by script. The order, keyboard, taps, fill and stored rating all passed.
  - The repo's `desktop-webkit` project can't run against a plain-http local server: the production CSP's `upgrade-insecure-requests` makes WebKit fetch scripts over https from 127.0.0.1.
  - The script served those upgraded requests from the same http build.
- **Widths and themes:** Chromium at 320px, plain and with 200% text, and at 767px and 768px, in both themes. In every case:
  - the stars sit on one row;
  - targets are at least 44px;
  - nothing scrolls sideways;
  - axe (WCAG 2.2 AA tags) found 0 violations.
- **200%-text tap:** the first run failed because the probe tapped below the viewport. The rerun, with the row scrolled into view, passed.
- **Vitest** (`npm run test:isolated`, fresh migrated database): 304 files passed and 9 skipped; 2,366 tests passed, 74 skipped, 0 failed.
- **Static checks:** `npm run typecheck` and `npm run validate:static` passed at 9d73196. `next build` passed with the same CSS.
- **GitHub Actions:** did not run. GitHub refused to start the jobs because of the account's billing, so the local runs above stand in for CI.

**VERIFIED in production:**
- **Preflight (read-only):**
  - both services were at dae3fab, with auto-deploy off;
  - health returned 200 three times;
  - the database was ready behind the `jitm_runtime` boundary, with no recovery hold;
  - every migration checksum matched;
  - no billing variable was set;
  - the diff was 6 files: the stylesheet, the browser test and the docs from #133.
- **The approved ratings check**, run once inside the preflight. It reads aggregate counts only, with no identities and no feedback text:

  ```sql
  SELECT (SELECT count(*)::int FROM "ReviewRequest") AS "requests",
    (SELECT count(*)::int FROM "ReviewRequest" WHERE rating IS NOT NULL) AS "rated",
    (SELECT count(DISTINCT "workspaceId")::int FROM "ReviewRequest" WHERE rating IS NOT NULL) AS "ratedWorkspaces",
    (SELECT coalesce(json_object_agg(rating, n), '{}'::json) FROM (SELECT rating, count(*)::int AS n FROM "ReviewRequest" WHERE rating IS NOT NULL GROUP BY rating) t) AS "byRating",
    (SELECT count(*)::int FROM "ReviewRequest" WHERE rating IS NOT NULL AND length(coalesce(feedback, '')) > 0) AS "ratedWithFeedback",
    (SELECT to_char(min("respondedAt"), 'YYYY-MM-DD') FROM "ReviewRequest" WHERE rating IS NOT NULL) AS "firstRatedOn",
    (SELECT to_char(max("respondedAt"), 'YYYY-MM-DD') FROM "ReviewRequest" WHERE rating IS NOT NULL) AS "lastRatedOn",
    (SELECT count(*)::int FROM "ReviewRequest" WHERE rating IS NOT NULL AND "respondedAt" < '2026-09-04') AS "ratedBeforeTheBug"
  ```

  Result: `requests` 1, `rated` 0, `ratedWorkspaces` 0, `byRating` {}, `ratedWithFeedback` 0, no first or last rating date, `ratedBeforeTheBug` 0.
- **Backup:** a fresh encrypted backup was stored before any deploy.
- **Worker:** deployed and live at db8f2d1. The scoped queue probe passed, and its synthetic job was removed.
- **Web:** deployed and live at db8f2d1.
- **Postflight:**
  - 30 public checks passed;
  - all 6 release files and 22 assets matched;
  - no deleted file was served.
- **Live smoke**, with a synthetic owner, person and review request, all removed afterwards. All 11 checks passed:
  - sign-in cookies;
  - Today on a phone, which reflows and passes axe in both themes;
  - real client addresses, also with a forged `X-Forwarded-For`;
  - signed error banners;
  - on the phone review page:
    - the stars on one row from 1 to 5;
    - the rightmost tap gives "5 out of 5" with all five lit;
    - the third tap gives "3 out of 5" with three lit;
    - reflow and axe pass in both themes;
    - sending stored rating 3.
- **Final check:**
  - row counts in 17 tables are unchanged since the preflight;
  - no synthetic users, workspaces, review requests or probe jobs remain;
  - no job failed since the release;
  - health returned 200, and both services are at db8f2d1 with auto-deploy off.

**The first live smoke run failed: a fault in the check, not the product.**
- **What happened:** the check read the stars' colors in the same frame as the tap. The smoke runs with reduced motion, and the site's reduced-motion rule (`src/styles/base.css:69-71`) gives every element a 0.01ms transition. So a color read in the tap's own frame still shows the previous fill.
- **Reproduced locally** on the identical build:
  - with reduced motion, 8 of 8 immediate reads were stale and 0 of 8 were wrong after 1.5 s;
  - without reduced motion, 0 of 6 immediate reads were stale;
  - in the page, the fill is correct after one animation frame (17–20 ms), so a person never sees the stale fill.
- **The fix:** the check now waits for the fill to settle, as the browser test does. The rerun passed.
- **Evidence:** the failed run is kept as `rsf-live-smoke-run1-failed.json`, and the probes are in `.artifacts/review-stars-20261008/probes/`.

**NOT RUN:**
- physical iPhone Safari and Android Chrome;
- VoiceOver and TalkBack;
- operating-system 200% text and forced colors;
- an engine without `:has()`: the fallback rule is verified in the built CSS only.

## Follow-ups

These are pre-existing defects on the review page, from review PRE-01. They belong with the change that gives customer-facing pages the business name (VOI-01, D84), which edits this page. D82's floors cover owner screens only.
- **200% text:** the star symbol (1.55rem, so 49.6px) spills about 24px below its 44px box and over the "1 — Poor · 5 — Excellent" line (JITM-10 §2.3).
- **320px:** the row runs about 19px into the card's 22px right padding. Nothing is clipped, and the page doesn't scroll sideways.
- **Spacing:** the star targets are 6px apart, under the 8px spacing in JITM-10 §2.1.
- **Observation for the design-system batch:** the reduced-motion rule turns every style change into a one-frame transition, because the default `transition-property` is `all`. That's harmless to see, but checks that read computed styles must wait a frame.

## Owner steps

- None for the ratings: there are none to correct.
- GitHub Actions stays blocked until the account's billing is fixed in GitHub's Billing settings.
- The local test databases `jitm_design_uxa1008` and `jitm_design_uxa1008_hf` can be dropped. The agent is not allowed to drop databases.
