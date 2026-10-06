# iPhone tips for sharing contacts: release, 2026-10-06

Live at https://jumpinthemix.com since 2026-10-06 00:07 UTC (web cutover); the final check passed at 00:11:44 UTC. This release ships PR #123: "Tips for adding on iPhone" with a (!) icon on Add from your phone. It opens a sheet with short steps for one person and for several people; the second set uses the hidden two-finger drag in iPhone Contacts.
- Code only: no migration, dependency or configuration change.
- Requested by Kevin on 2026-10-05, after he found that sharing several contacts on an iPhone isn't obvious.

| Item | Value |
|---|---|
| Previous production commit / tag | `e6b4c6a858a64f75cbfbff5b3068ba7254517d11` / `prod-2026-10-05-e6b4c6a` |
| Release merge / PR | `fd14b9afb3f28952307b22dae1a1ff418a16c9cd` / [#123](https://github.com/kaywhy331/jump-in-the-mix/pull/123) (tree = reviewed head `1bbf6e0`) |
| Production tag | `prod-2026-10-06-fd14b9a` |
| Fresh encrypted backup | Stored 2026-10-06T00:02:28Z (3 objects) |
| Worker deploy / live | `dep-db23l9rtqb8s73buc94g` / 2026-10-06T00:04:12Z |
| Web deploy / live / build | `dep-db23m30m7kps73dbvq90` / 2026-10-06T00:07:49Z / `1j9ch7cir2GoNlPa9VCoh`, build cache kept |
| Final check | 2026-10-06T00:11:44Z |

## Verification

**VERIFIED locally on `1bbf6e0` (= `fd14b9a`):**
- Typecheck, `validate:static`, 14 unit tests and the production build.
- `e2e/phone-contacts.spec.ts` on `mobile-chromium` and `desktop-chromium`, 2 + 2 passed. It covers:
  - the tips on iPhone, with and without the shortcut;
  - Escape closes the sheet;
  - no tips on Android;
  - the tips on desktop;
  - axe in both themes.
- Screenshots at 390 wide in light and dark.

**VERIFIED in production:**
- **Preflight:** read-only checks passed: both services at `e6b4c6a`, the database ready with 74 migrations matching, no billing variables, 6 changed files and no schema change.
- **Deploys:** the worker went first and passed its queue probe, then the web service.
- **Postflight:** 26 checks passed, and the 6 changed files and 22 page assets hash-match on the live instance.
- **Live smoke:** 9 checks passed with a synthetic owner. They cover the tips sheet with and without the shortcut, the key and shared-card flow, Android without tips, and a computer with tips. Every synthetic row was removed.
- **Final check:** counts are unchanged, there are zero synthetic rows, failed jobs or rate-limit blocks, and health returns 200.
  - One real phone key exists: Kevin's, made for building the shortcut.

**The first live smoke attempt stopped** on an axe color-contrast finding in the open sheet in dark mode. Reproduced locally:
- The finding appears only when axe runs the same instant the script switches `data-theme`. The sheet's background has changed while its text is still mid-transition: 1.12:1 against #25223d.
- The same check 0.8 s later is clean, and so is a page loaded in dark mode.
- The smoke now waits 800 ms after each theme switch. The rerun passed all 9 checks.
- No product change was needed.

## Recovery

Redeploy `prod-2026-10-05-e6b4c6a`, web first and then the worker. The schema is unchanged.

## NOT RUN

- A real iPhone, including the two-finger selection. The steps follow Apple's help pages.
- The rest of the browser suites, per JITM-12 §2.13: only `/contacts/from-phone` and its step text changed.
