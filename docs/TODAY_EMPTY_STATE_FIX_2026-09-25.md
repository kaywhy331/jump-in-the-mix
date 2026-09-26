# Today empty-state fix — September 25, 2026

Live at **https://jumpinthemix.com/** as of 2026-09-25 18:47 UTC. A small code-only release after [audit release C-1](AUDIT_RELEASE_C1_2026-09-25.md). C-1's verification found an accessibility problem on the live build: when a person has nothing due and nothing done yet that day, Today's open "Done" group holds only a "View completed follow-ups" link. That link was a 16 px line of text directly under its 44 px summary, below the 24 px minimum target size (WCAG 2.2, 2.5.8).

| Release | Value |
| --- | --- |
| Branch | `fix/today-empty-state-20260925` (based on Release C-1, `34ffdae`, and its record) |
| Previous production commit | `34ffdaed6c2e49342f3e7033f969ada6ec9b33ce` (tag `prod-2026-09-25-34ffdae`) |
| Application commit | `929f779609c6e25f34d16e709dbc7832792cb791` (tag `prod-2026-09-25-929f779`) |
| Worker deploy | `dep-darc0nfavr4c73e2c270`, live 2026-09-25 18:42:51 UTC |
| Web deploy | `dep-darc1fk9v7es73e1u1o0`, live 2026-09-25 18:47:26 UTC, build `QqABQj5iemz2I0Mu9fftV` |
| Final check | 2026-09-25 18:49:32 UTC |

## What changed

| Area | Commit | Changes |
| --- | --- | --- |
| Today | `5420684` | The link gets the summary's 44 px target height. A browser test covers the empty state in its own workspace. The 320 px row check now measures the card's own contents and the page: the "Next up" card bleeds 8 px into the page gutter by design, which the old check counted as overflow. |
| Browser tests | `78ecda3` | The responsive-controls, snooze-presets and desktop-review tests create their own due follow-up instead of using whatever the shared demo workspace has due; they failed once a day of test runs left it with nothing due. |

## Verification

- `npm run typecheck` clean; `npm run build` passed with no warnings.
- Playwright on the candidate, in the state that exposed the problem (the demo workspace with nothing due and nothing done): desktop `a2-css-checks`, `accessibility`, `visual-fitment`, `design-adoption` and `today-navigation` all pass (37 passed, 4 skipped), including `/jumps` in the automated WCAG checks and the new empty-state test; phone `accessibility`, `today-navigation`, `mobile-clarity`, `sheet-interactions` and `visual-fitment` all pass (38 passed, 9 skipped).

## Release

Released on 2026-09-25 between 18:41 and 18:50 UTC with the code-only pipeline (`.artifacts/market-live-20260924/c1b-*.mjs`). Every step passed on the first run: the read-only preflight (both services on `34ffdae`, auto-deploy off, pushed commit, database ready, migrations matching), the worker deploy with its queue probe, the web deploy, the postflight (18 checks; 7 release files and 20 served assets hashed identically on the live instance), the live smoke (11 checks, synthetic data removed) and the final check (counts unchanged, no probe or failed jobs or rate-limit blocks, health 200 three times, both services on `929f779`).

## Rollback

Deploy `34ffdaed6c2e49342f3e7033f969ada6ec9b33ce` (Release C-1) to the web service, then to the worker. Nothing is written.
