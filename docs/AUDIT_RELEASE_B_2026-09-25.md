# Audit release B — September 25, 2026

Release B is live at **https://jumpinthemix.com/** as of 2026-09-25 16:34 UTC. It is the third release of the [2026-09-24 full audit](FULL_AUDIT_2026-09-24.md) plan (§5), after Release A (`7b2fa00`) and Release A2 (`c17cc80`). It carries the items that need a schema change, a new dependency or a platform setting, with the owner's decisions of 2026-09-25:

- phone numbers read for a country the owner chooses, North America (+1) by default
- sign-up with Google or Apple from an invitation, and a way to correct a mistyped email after a text invitation
- limits on account email that cannot lock an owner out of a browser they already use
- another review for a share after staff uphold a report against it
- archiving a shared Mix stops sharing it
- accurate wording about how accounts are opened
- a worker that finishes or pauses its job when Render stops it
- a published security policy, `security.txt` and Prisma relations for the hand-written foreign keys

It is the first audit release with a migration. The migration is additive (one column with a default, eight nullable columns, one CHECK constraint), so the previous release keeps running on the migrated database, and a rollback is a redeploy of `c17cc80` (after reversing the phone-key sweep, see Rollback).

| Release | Value |
| --- | --- |
| Branch | `feat/audit-release-b-20260925` (based on `c17cc80` and its record) |
| Previous production commit | `c17cc8065577fa04644f517a55e303a54943bac5` (tag `prod-2026-09-25-c17cc80`) |
| Application commit | `f3a0a20994d08e9d531a28682a818339c394d34f` (tag `prod-2026-09-25-f3a0a20`) |
| Migration | `20260925150000_release_b_phone_region_invites_review` (additive), job `job-dara1m97lnhs73aj98f0` |
| Dependency | `libphonenumber-js` 1.13.13 (new) |
| Worker settings | start command `node --import tsx src/worker/index.ts` (was `npm run worker`); the 300-second shutdown delay needs the dashboard (see Owner steps) |
| Worker deploy | `dep-dara2cp42hec73di14qg`, live 2026-09-25 16:29:55 UTC |
| Web deploy | `dep-dara3l7f3r2c73bmjs60`, live 2026-09-25 16:34:55 UTC, build `v7gr2swWJb38Dd9XM2rpv` |
| Final check | 2026-09-25 16:37:31 UTC |

## What changed

| Area | Commit | Changes |
| --- | --- | --- |
| Schema and dependency | `09bcae4` | One additive migration, `20260925150000_release_b_phone_region_invites_review`: `WorkspacePreference.phoneRegion` (text, not null, default `'US'`, checked to be two capital letters), `AuthOAuthState.inviteTokenHash` and `inviteId`, and six nullable review columns on `MarketplaceListing`. `libphonenumber-js` pinned at exactly 1.13.13. The schema declares Prisma relations for the 30 foreign keys that earlier migrations created by hand; `prisma migrate diff` from the migrations to the schema shows no foreign-key change. |
| Phone numbers (B1) | `c554177` | A phone number's key is now the number itself, in international form: `+15551234567`, with `;ext=12` for an extension. It applies when the whole value is a possible number at a full national length for the workspace's country; anything else keeps its previous key (its digits). Every place that saves a number stores the new key. Every place that matches one (contact saves, imports, merges, duplicates, search, Quick Add, intake, appointments, invitations, call and text records) looks up both the new and the old key, so rows saved before the sweep still match. Today builds call and text links on the server from the saved key. An automatic text goes only to a number with a full international form. The owner chooses the country in Personal preferences: a preview counts the saved numbers that would be read differently, and saving it records an audit entry and updates the saved keys in the background. `libphonenumber-js` 1.13.13 (exact version, `min` metadata) is loaded only on the server; a test walks every client import graph to keep it there. |
| Invitations, sign-in and account email (B2, B6, B8) | `7ca1965` | An invitation link offers the configured Google and Apple buttons, and the account they create claims the invitation (by its hash, carried through the provider round trip). A failure returns to the invitation. An email invitation names the address the provider account must use. Linking a provider or opening an emailed sign-in link for an unverified password account removes that registration's password, sessions and links, so someone who registered an address first cannot keep a way in. A person invited by text who mistyped their email can correct it on the verification screen with their password (three changes a day). Password sign-in has a hard limit per address and client address, and an email-wide step-up that answers "use a sign-in link" without checking the password. Sign-in, reset and verification links are limited to 3, 3 and 4 a day per address, silently, and the pages say so. A browser that has signed in to the account keeps a signed marker that exempts it from the step-up and the daily limits. Account email at half its reserve raises the email check and a notice on Admin → Operations. The public pages describe access as it is: an invitation from a member, or from the waitlist as space opens, with no promised date. The Apple callback answers 303, so Apple's cross-site POST is no longer re-posted to `/jumps` and refused. |
| Marketplace (B3, B7) | `1928f26` | After staff keep a reported share hidden, its author can change the wording and ask for another review, with a note. The request needs a hidden share, no open report, no request already waiting, something to show, and wording changed since the decision. Staff see requests in their queue with the author's note, and their reply is kept on the share and emailed. Archiving a Mix stops its live share, and its Mega-Mix's when no other Mix of it can be shared; the confirmation and the notice say so. A hidden share stays hidden. |
| Platform and security (B4, B5, B9, B10) | `932a2ac` | The worker checks a stop flag between steps: an import stops between chunks and goes back to the queue at once without using an attempt, and the phone-key sweep stops between contacts. Render starts the worker with `node --import tsx src/worker/index.ts` (so the stop signal reaches Node, not npm) and waits up to 300 seconds; Docker Compose waits as long. The 30 hand-written foreign keys are Prisma relations, and a test compares the schema with the migrations. The job claim index exists already (B5); a test pins it. `SECURITY.md` is rewritten, `/security` publishes the disclosure policy and `/.well-known/security.txt` names `security@` and `support@` and expires in a year. |
| Stale browser tests | `5c0c1c7` | The 28 tests A2's verification found failing on the live build because the interface had moved, brought up to the current product (the same change as `7874620` on the A2 branch). |
| Defects found by the repaired browser tests | `5ae02d5` | Quick Add's "Open saved person", shown after a capture was only partly saved, now waits for the leave confirmation before it navigates. On a phone, the contact's note stays in place when preparation finishes (the profile header is kept out of scroll anchoring, as the box below it already was). `/mixes/<id>/edit?activated=1` keeps its "Mix started" notice. |
| Found during verification | `aee67cd`, `c7a6d9f` | The hero note keeps the homepage's own wording (see Verification). The proxy no longer overrides the Google and Apple sign-in routes' `no-referrer`: those addresses can carry an invitation token or a sign-in code, so they are never passed on as a referrer or cached, like the invitation pages. |

## Decisions taken while building

1. **What counts as a number.** A key changes only when the whole value is a possible number at a full national length for the country: a 7-digit local number keeps its old key, and so does a North American number whose area code starts with 0 or 1 ("0412 345 678" in a US workspace is not read as +1 041…). A number typed with `+`, or with the country's international prefix (011 in North America, 00 in most others), keeps its own country whatever the workspace's country.
2. **Before the sweep, both keys match.** A row saved before this release keeps its old key until the sweep rewrites it. Until then it is found by its old spelling and read in full wherever a key is compared in memory. A different spelling of the same number (with `+1`, say) finds it only after the sweep.
3. **Forms opened before the deploy are refused once.** The contact edit form's fingerprint now covers each phone's display, label and primary flag, not its key, so the sweep never makes open forms stale. A form rendered by the previous release is refused once with "changed on another device" and keeps the typed entries.
4. **An automatic text needs the full number.** A saved number with no international form is not sent as typed any more. The follow-up fails with "the saved phone number couldn’t be read with a country code", and Today asks the owner to send it.
5. **Intake keeps its event hash.** An intake payload is still normalised and hashed the old way, so a retry of an old event still matches it.
6. **The country is a Personal preferences setting**, not an onboarding question, because the owner set North America as the default.
7. **Releasing an unverified account also applies to emailed sign-in links**, not only to Google and Apple. Someone who registered with a password, never verified, and later signs in with an emailed link loses that password and can set a new one.
8. **Correcting an email is only for accounts from a text invitation**, whose invitation named no address. It needs the password, shares the sign-in limits, answers every refusal the same way, and ends every link sent to the old address.
9. **The known-device marker is tied to the account**, not the email, so a reused address never inherits it. It holds up to three accounts per browser and lasts as long as a session. It exempts only from the step-up and the daily limits; the hourly limits apply to everyone.
10. **Daily limits are silent.** The same "check your email" screen appears either way, so the limit cannot be used to learn whether an account exists. Spent links are kept for a day, unusable, so each can be matched to its email record. A request for a sign-in link for an address with no account, or a suspended one, now answers exactly like a real one.
11. **Archiving leaves a hidden share hidden**, so archiving and unarchiving cannot undo a staff decision.
12. **`security.txt` lists `support@` as well as `security@`**, so a report reaches us even before the `security@` alias exists.

## Verification

All checks ran on TrixBot (3.8 GB), one heavy job at a time, against the `jitm_design_market` database with the Release B migration applied (the state production is in between the migration and the deploys).

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run validate:static` | clean |
| `vitest run` (unit and DB-backed integration) | 1,991 passed, 69 skipped by environment. The only failures in the shared design database are the three `staff-access` bootstrap tests, which need an empty staff table; they pass 9/9 in an isolated database (`npm run test:isolated`). |
| `npm run build` | passed, no warnings (built again after the homepage wording fix below) |
| Phone-key sweep and its reverse, rehearsed | In a synthetic workspace: the sweep rewrote 4 keys and merged 2 duplicate spellings. After edits made "after the release" (a number changed, one deleted, a merged survivor replaced, a contact added), the reverse gave every row the previous release's key, re-created the merged row with its own id, left deleted numbers deleted, and changed nothing on a second run. |
| Playwright, desktop project, all 79 spec files | everything passes except the failures listed below |
| Playwright, phone project (24 spec files) | all pass. In the batch run, the Marketplace share test's full-width screenshot at the phone's pixel density timed out under load; it passes alone on both builds. |
| Google and Apple, with placeholder credentials on the server | The invitation page offers both buttons for the invited address. Starting keeps the invitation with the sign-in request and is neither cached nor passed on as a referrer. `/login` says the buttons are for existing accounts. The sign-in and public page specs pass on desktop and phone with the buttons shown. |

**Method.** The live commit's production build (`c17cc80`) served on port 3101 and the Release B candidate on port 3102, both with CI's synthetic environment. Every spec file ran against the candidate in batches of five. Each failure was then run against the live build, and alone.

- **Found by the tests, fixed in `aee67cd` and `c7a6d9f`:**
  - Release B's new hero note said "By invitation from a member…", a phrase the homepage program had removed (the profession-pages test guards it). The note keeps the homepage's own wording and gains the member route: "access is by invitation from a member, or from the waitlist as space opens".
  - Two specs asserted behaviour Release B changes on purpose: the waitlist page's copy (it no longer promises when access is available) and the ready-made setup's address (it now keeps `?activated=1`, so the editor says "Mix started.").
  - The new invitation test found that the proxy's site-wide `Referrer-Policy` replaced the Google and Apple start routes' own `no-referrer` (`c7a6d9f`). Nothing leaked in practice: the invitation page itself is `no-referrer`, so the browser sent no referrer onward.
- **Failing identically on the live build:** `outcome-retry` ×2 (the retry after a lost answer, and the return tray). Not caused by Release B.
- **Test order only:** `save-recovery` "Calendar warns before filters replace a draft" fails only after other spec files; it passes alone and inside its own file, on both builds.

## Release

Released on 2026-09-25 between 16:25 and 16:38 UTC, under the owner's standing release authority, with the resumable pipeline in `.artifacts/market-live-20260924/b-*.mjs`. Every step passed on the first run.

- **Preflight (read-only).** Both services were live on `c17cc80` with auto-deploy off, the pushed branch matched the release commit, the database was ready with the runtime boundary intact, and every applied migration matched the release tree. The package, lockfile and `render.yaml` differences were exactly the reviewed ones. No Google or Apple sign-in is configured.
- **Backup.** An encrypted backup was stored at 16:26:27 UTC through the backup cron (three objects: the dump, its recovery state and its manifest).
- **Migration.** A one-off job on the live web instance, still at `c17cc80`, verified the reviewed release archive, applied the one migration with the owner role (71 migrations now), and checked the nine new columns, the `phoneRegion` default and CHECK constraint, the backup role's read-only grants on the three altered tables, and unchanged record counts (2 people, 1 workspace, 3 contacts, 2 saved numbers, 6 follow-ups).
- **Worker settings.** The start command became `node --import tsx src/worker/index.ts`. The Render API does not expose the shutdown delay, so it was left unchanged (see Owner steps).
- **Worker.** `dep-dara2cp42hec73di14qg` went live at 16:29:55 UTC. Its scoped queue probe passed, and the synthetic job was removed.
- **Web.** `dep-dara3l7f3r2c73bmjs60` went live at 16:34:55 UTC with build `v7gr2swWJb38Dd9XM2rpv`.
- **Postflight.** 18 public, security and sign-in redirect checks passed, including `/security` and `security.txt` (the disclosure contact first, not close to expiry). On the live instance, 171 release files and 20 served assets hashed identically to the candidate. The database was ready.
- **Live smoke.** One synthetic owner was used, and every row was removed. The checks:
  - Sign-in sets a Lax, Secure, HttpOnly session cookie expiring in about 90 days, and the Lax, Secure, HttpOnly known-device marker.
  - Today renders the pending follow-up on a phone.
  - Personal preferences show the phone-number country (United States, +1) and preview a change to the United Kingdom without saving it.
  - A plain sign-in and a sign-in with a forged `X-Forwarded-For` both recorded the real client address.
  - Magic links confirm on a page, and public error banners show only our signed wording.
  - Today, Contacts, Mixes, Marketplace and Account reflow at 390 px and pass axe in light and dark.
- **Phone-key sweep.** The private manifest recorded both saved numbers; the worker ran the sweep job at 16:37:14 UTC; both keys are now canonical for North America, none were merged, and no contact has two primary numbers or lost its primary.
- **Final check.** Record counts were unchanged from the preflight. There were no probe jobs, synthetic users or workspaces, failed jobs since the release, or active rate-limit blocks. Health returned 200 three times, and both services are on `f3a0a20` with auto-deploy off.

## Rollback

The migration stays: the previous release never reads the new columns. To go back to `c17cc80`:

1. **If the phone-key sweep has run**, reverse it first: `node .artifacts/market-live-20260924/b-reverse-phone-keys.mjs --confirm`. The previous release looks numbers up by their old keys only, so without this it would stop matching saved numbers (duplicates, imports, intake, call records). Using the private manifest taken just before the sweep and the release's own functions, it gives every phone row the key the previous release would have written: the recorded key when the number is unchanged, otherwise the old key of the current number (rows added since included). It re-creates the rows the sweep merged, but only while the row they were merged into still holds the same number, so nothing deleted or changed since comes back. Primary flags and labels stay as they are. A key another row already holds is not forced; that row is reported. Running it twice changes nothing.
2. Deploy `c17cc8065577fa04644f517a55e303a54943bac5` to the web service, then to the worker. The worker's new start command runs the previous release's worker unchanged, so it stays.
3. What the previous release leaves alone: the phone-number country (it reads numbers the North American way, as before), requests for another review (a hidden share stays hidden until staff restore it from the Hidden tab), the known-device marker (ignored) and invitation data on a provider sign-in state (ignored; no provider is configured in production).

## Owner steps

1. **Worker shutdown delay.** In the Render dashboard, open the worker service (`jump-in-the-mix-worker`) → Settings and set the shutdown delay to 300 seconds, as `render.yaml` states. The API used by the release does not expose it. Until then Render stops the worker after its default delay; an import still stops cleanly between chunks and resumes, but a long chunk may be cut off and retried.
2. **`security@jumpinthemix.com`.** Add it as an alias in ImprovMX (the domain's mail already goes through ImprovMX), forwarding to the inbox that receives `support@`. Until then, mail to `security@` may bounce; `security.txt` also lists `support@`.
3. **Google sign-in** (optional; the invitation sign-up stays hidden until both values are set):
   1. Google Cloud console → Google Auth Platform: set the branding, add the authorized domain `jumpinthemix.com`, the privacy policy `https://jumpinthemix.com/privacy` and the terms `https://jumpinthemix.com/terms`. Audience: External, published to production. Scopes: `openid`, `email`, `profile`.
   2. Clients → Create client → Web application. Authorized JavaScript origin `https://jumpinthemix.com`; redirect URI `https://jumpinthemix.com/api/auth/oauth/google/callback`.
   3. On Render, set `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` on the web service (both or neither), then deploy the web service.
4. **Apple sign-in** (optional; needs a paid Apple Developer Program membership):
   1. Identifiers: an App ID with Sign in with Apple, then a Services ID (for example `com.jumpinthemix.web`) with Sign in with Apple configured: the App ID as primary, the domain `jumpinthemix.com`, the return URL `https://jumpinthemix.com/api/auth/oauth/apple/callback`. If Apple asks for a domain-association file, stop: serving it needs a code change.
   2. Keys: create a key with Sign in with Apple and download the `.p8` file (it can be downloaded only once). Note the Key ID and the Team ID.
   3. On Render, set all four on the web service: `AUTH_APPLE_CLIENT_ID` (the Services ID), `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY` (the whole `.p8` text; line breaks may be written as `\n`). Then deploy the web service.
   4. Services → Sign in with Apple for Email Communication: register `jumpinthemix.com` and the exact `EMAIL_FROM` address, which must pass SPF. Otherwise mail to Hide My Email addresses bounces.
   5. Check: `/login` shows the buttons. Sign up from a real invitation and confirm it lands on onboarding and that the invitation shows the new account as the one that accepted it.
5. **Other providers.** Microsoft or Facebook sign-in needs an app registration with each, a migration of the `AuthProvider` list and new code: Microsoft personal accounts send no verified-email claim, and Facebook's standard login has no ID token. It is a separate piece of work.

## Follow-ups

- B11: sign `?error=` messages on signed-in pages for the person who caused them (in progress; the next release).
- Release C, as reviewed: C-1 (request path) next; C-2 and C-3 are optional at one workspace; C-4 (edge cache) needs the owner's decision.
- Test only: the two `outcome-retry` failures that also fail on `c17cc80`; the calendar save-recovery test that fails only after other spec files; the phone Marketplace screenshot at full width.
- Services that throw user-facing plain `Error`s (Journey, ready-made setup, Mix start, snooze, calendar) would be clearer with typed error classes; B11 depends on this to keep their wording.
- Catch `main` up to production: Releases A, A2 and B run from their branches (draft PR #82 holds A).
