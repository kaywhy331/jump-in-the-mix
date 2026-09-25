# Audit release B11 — September 25, 2026

Release B11 finishes the audit's signed-error work (security-privacy F3; [2026-09-24 full audit](FULL_AUDIT_2026-09-24.md) §5). Release A2 made public pages show a `?error=` message only when our own redirect signed it. Signed-in pages still printed whatever text the address carried, so a crafted link could put any sentence into the trusted red banner of a page the person was signed in to. B11 closes that on every signed-in page (45 in all: 23 customer pages, onboarding, 19 admin pages, the contact profile and the Mix workspace).

It is code only: nothing in `prisma/`, `package.json`, the lockfile, `render.yaml` or `next.config.ts` changes, so rolling back is a redeploy of Release B (`f3a0a20`).

| Release | Value |
| --- | --- |
| Branch | `feat/audit-release-b11-20260925` (based on Release B, `f3a0a20`, and its record) |
| Previous production commit | `f3a0a20994d08e9d531a28682a818339c394d34f` (tag `prod-2026-09-25-f3a0a20`) |
| Application commit | the commit that adds this record |

## How it works

- A signed-in page's error is signed for the person who caused it. The signature covers that person's account (`session.authUser`, which is the staff member during a support view) and the time it was issued, under its own namespace (`jitm-viewer-error:v1`), separate from the public signature.
- A page shows the message only to that account, and for an hour. Anyone else, a crafted link, a link signed for someone else, or an old link shows the page's fixed sentence ("Something went wrong. Please try again." unless the page has a sentence of its own).
- Because a signature works only for the person whose action produced it, messages keep their details, including names such as a contact's, which a signature valid for anyone could not safely carry.
- Unknown errors never reach an address: every producer shows its own known refusals, or `UserFacingError` wording from the services it calls, and a fixed sentence for anything else (database, network or provider errors).
- A source test fails if code outside the signing helpers builds an error address, if a page renders `?error=` without verifying it, or if a signed-in page uses the public signature.

## What changed

| Area | Commit | Changes |
| --- | --- | --- |
| Core | `c25a52e` | `withViewerError`, `viewerErrorMessage` and `UrlErrorNotice`; `requireWritableWorkspace` hands its support-view refusal the viewer; `UserFacingError` for fixed wording thrown by the Mix start, active-tag, snooze and calendar services; the account page's password and session errors; the demo sign-in's fixed refusals (public signature); the staff team page. |
| Contacts, calendar, settings, account, Today | `4e602f4` | 18 pages and the contact profile; 19 producers. |
| Mixes, templates, onboarding | `fe7001a` | 5 Mix and template pages, onboarding and the Mix workspace; the old `/mixes/<id>/edit` address forwards `error`, `at` and `sig` together; 7 producers. |
| Admin | `8641ebd` | 19 admin pages; `adminActionDestination` drops stale `error`, `at` and `sig` and refuses them as updates; 14 producers and the impersonation start route. |
| Guard | `afd939f` | The source test above. |
| Found during verification | `06d1881` | The admission replay test accepted only `%20` for spaces; signed addresses encode them as `+`. |

## Messages whose wording changed

Only text that was not ours now becomes a fixed sentence:

- Database, network and provider error text that some actions used to put into the address: the Journey settings, the Mix editor, ready-made setup, the starter Mix, and calendar imports and refreshes. Each now shows that action's existing fixed sentence.
- "System Follow-up date type is missing. Run the seed command again." (operator text) now shows "The starter mix could not be created."
- In the Mix editor, a Journey validation problem other than the two known ones, or several joined together, shows "The mix could not be saved."
- In ready-made setup, "Action #N could not be created." shows "The ready-made mix could not be used."
- An administrator MFA failure that is not one of its known refusals (storage or decryption) shows "Administrator MFA could not be enabled." or "Administrator verification failed."
- An invalid calendar subscription address shows the existing advice "Use an HTTPS calendar URL without a username, password, or custom port."

## Verification

All checks ran on TrixBot (3.8 GB), one heavy job at a time, against the `jitm_design_market` database.

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run validate:static` | clean |
| `vitest run` (unit and DB-backed integration) | 2,065 passed, 69 skipped by environment; the only failures are the three `staff-access` bootstrap tests, which need an empty staff table and pass 9/9 in an isolated database |
| `npm run build` | passed, no warnings |
| Playwright, desktop project, all 79 spec files | everything passes except one test, listed below |

**Method.** Release B's production build (`f3a0a20`) served on port 3101 and the B11 candidate on port 3102, both with CI's synthetic environment. Every spec file ran against the candidate in batches of five; each failure was run again alone, on both builds.

- **Found by the tests:** the admission replay test expected `%20` in the refused address (fixed in the test).
- **Failing identically on the live build:** `design-adoption` "desktop review has usable space…" signs in as the demo owner and expects the first due follow-up to open with a message field. After a day of test runs, the demo workspace's first due follow-up no longer has one; the test depends on that data. It passed in Release B's own verification earlier the same day.
- The phone project was not run again: B11 changes no layout (the banner is the same notice component).

## Release

Pending. The code-only pipeline (`.artifacts/market-live-20260924/b11-*.mjs`) runs after this record is committed and pushed: preflight, worker deploy with a queue probe, web deploy, postflight, live smoke (now also: a crafted `?error=` on a signed-in page shows only the fixed sentence), final check.

## Rollback

Deploy `f3a0a20994d08e9d531a28682a818339c394d34f` to the web service, then to the worker. B11 writes nothing: a link it signed simply shows its text, unverified, on Release B's pages again.

## Follow-ups

- Services that still throw user-facing plain `Error`s, which the Mix editor and ready-made setup match by exact wording (a test fails if the wording drifts): `journey.ts`, `shared-mix-use-service.ts`, `mix-broadcast.ts`, `mix-workflow.ts`. Throwing `UserFacingError` there would let those lists go.
- Error text that reaches a form or JSON rather than an address, unchanged by B11: `mega-mix-actions.ts` and `mega-mix-pipeline-actions.ts` (form state), `saveCalendarAction` (form state), `api/mix-workflow` (JSON). None is a crafted-link risk; they can show database text when something unexpected fails.
- `workspace-profile-actions` sends its errors to `/settings`, which renders no error banner (unchanged).
