# Appearance switch and invitation prompts — September 27, 2026

Live at **https://jumpinthemix.com/** as of 2026-09-27 01:29 UTC. This is a code-only release of PR #86, requested by the owner: no migration and no configuration change.

| Release | Value |
| --- | --- |
| Previous production commit | `b6b9575b9daea525046a0a7097206cd35bc5d23b` (tag `prod-2026-09-26-b6b9575`) |
| Application commit | `a70e60c540e09a68737afcc31c0fd7d21579453f` (merge of PR #86 into `main`; tag `prod-2026-09-27-a70e60c`) |
| Worker deploy | `dep-das702gjo6nc73afphlg`, live 2026-09-27 01:24:42 UTC |
| Web deploy | `dep-das718h7lnhs73fsibp0`, live 2026-09-27 01:29:12 UTC, build `xeHyYCWf46ne3qItWl0pd` |
| Final check | 2026-09-27 01:32:27 UTC |

## What changed

- **Appearance.**
  - A sliding sun and moon switch replaces the System/Light/Dark dropdown. The knob slides to the chosen side, and the other icon greys out.
  - The slide does not animate under reduced motion. Screen readers get a "Dark mode" switch.
  - Until a choice is made, it follows the device. Personal preferences offers "Match my device" to return to that.
  - Public pages carry it in the header: beside Sign in, or in the header menu at 760 px and below.
- **Invitations.** While the owner has personal invitations left and they are not paused, "N invitations left" shows in:
  - the desktop sidebar (a callout, or a gift icon with a count on the compact rail);
  - the phone More tab (a count badge);
  - a strip on Today;
  - the More page;
  - the Profile sheet.

  Each links to `/mixes/system`. They disappear once every invitation is used.

## Verification

GitHub Actions did not start any job for PR #86: *"recent account payments have failed or your spending limit needs to be increased"*. Every CI job was run on TrixBot instead, with CI's environment:
- **Vitest:** 2,112 passed, 0 failed.
- **Static checks:** `validate:static` and the typecheck are clean; the build passed.
- **Dependency audit:** passed, with 1 moderate finding that was already there. No dependencies changed.
- **gitleaks:** full history, no leaks.
- **Playwright** (main desktop + phone groups on a fresh seeded database): 571 passed, 2 failed.
  - `onboarding-invitations:60` (phone): a known flaky test.
  - `mega-mix-pipelines:34` (phone): a screenshot timeout; it passed on rerun.

## Release

Released between 01:23 and 01:33 UTC with `.artifacts/market-live-20260924/afix-*.mjs`. Steps:
1. **Preflight, worker deploy and queue probe, web deploy:** passed.
2. **Postflight:** 18 public checks; 23 release files and 20 served assets hashed identically on the live instance.
3. **Live smoke:** failed twice, on the smoke script's own waits (see below), and passed on the third run. It made 15 checks and removed its synthetic data. New checks:
   - the homepage header switch turns on dark mode and greys the sun;
   - Today and the More tab show "3 invitations left".
4. **Final check:** counts unchanged; no probe jobs, failed jobs or rate-limit blocks; health 200; both services on `a70e60c` with auto-deploy off.

About the two failed smoke runs:
- The first counted the invitation strip before Today had rendered.
- The second used a locator that matched two elements, and it confirmed the strip was present in production.

Both deploys were already live during these runs, so production served the new code throughout.

## Rollback

Deploy `b6b9575b9daea525046a0a7097206cd35bc5d23b` to the web service, then to the worker. Nothing needs reversing: appearance choices stay in each browser under the same key and values.
