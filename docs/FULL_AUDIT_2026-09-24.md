# Full application audit and release decision — 2026-09-24

This document records a full audit of Jump in the Mix as deployed on https://jumpinthemix.com (commit `e26fdd4`, record `d70ec54`), the two-model deliberation that turned the findings into a plan, and what was then built, verified and released. The nine underlying reports live in [docs/audit-2026-09-24/](audit-2026-09-24/README.md); every finding there carries `file:line` evidence and a VERIFIED or SUSPECTED mark.

## 1. Where the product stood

- **Live code.** Render web `srv-dagt93lbedkc738552o0` and worker `srv-dagta4uq1p3s738rnlr0` both served `e26fdd4` (deploys `dep-daqoneou01pc73ffj1gg` and `dep-daqom4bktnus73bl288g`); `/api/health/ready` answered 200 in about 0.6 s; the response headers carried a nonce CSP with `strict-dynamic`, HSTS, `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- **Scale.** The release preflight at 20:41 UTC counted 2 users, 1 workspace, 3 contacts, 6 follow-ups, 15 Mixes, 1 pending invitation and 1 waitlist delivery; there were no Marketplace listings. The product is a pilot about to receive invitees, so correctness, data safety, the sign-up funnel and trust outrank scale.
- **Baselines measured on the live commit before any change.** Typecheck clean. Unit and integration suite: 1,455 passed, 68 environment-skipped, 0 failed (368 s). `e2e/journey-connections.spec.ts`: 17 of 17 on a production build (the previous release record claimed this without a saved run).
- **Repository state.** `origin/main` was at `4615ade` (2026-09-10) and not an ancestor of the live commit; no release since 2026-09-17 had a pull request or a CI run; the only tags were July release candidates; the private repository cannot carry branch protection; the scheduled "Private test worker" workflow failed on every run because the Netlify test site no longer answers.

## 2. Method

Nine parallel read-only reviews, one per area (funnel and auth, Today and calendar, Contacts, Mixes/Journey/Marketplace, security and privacy, design and accessibility, ops and performance, account/settings/admin, tests and process). Each reviewer read the code paths end to end, cited `file:line`, wrote a concrete failure scenario, a minimal fix, effort, risk, migration need and the tests to add, and separated VERIFIED from SUSPECTED. The lead then spot-checked claims in the source and reproduced the most consequential suspected one in a browser:

- **Reproduced.** A verify-email link clicked from a page on another site ends on `/login` with no session, while the same link opened directly keeps the session. The cause is the `SameSite=Strict` session cookie set inside a cross-site GET redirect chain (`src/lib/auth.ts:82`). Both probe accounts had a session row in the database; only the direct navigation carried it. This affects anyone who clicks a verification, magic-link or OAuth return from webmail in a browser.
- **Confirmed in source.** Merging duplicates never copies `MixStop` rows; `slugify` always appends a random suffix so imported date-based Mixes bind to a new duplicate date type; `ContactImportBatch`, `ReviewRequest` and `PushSubscription` have no Prisma relation to `Workspace` or `User` (the migrations do cascade them, see §3); the staff "Restore share" action sets a listing LIVE regardless of its current state; each outcome click mints a new request id; a FAILED automatic delivery is never re-claimed by the worker; the automatic-status pill on Today is `display: none` at every width.

## 3. Findings

125 findings: 3 P0, 37 P1, 85 P2. The full ranked list is [FINDINGS_TABLE.md](audit-2026-09-24/FINDINGS_TABLE.md). The ones that shaped the plan:

**Data safety and correctness**
- Account deletion was reported to leave imported contact rows, customer review feedback, push endpoints and keys, and delivery/preference rows behind (`src/lib/account-deletion.ts:34-85`), rated P0. **Corrected during implementation:** all seven tables carry `ON DELETE CASCADE` foreign keys written by hand in the migrations (`20260722013000`, `20260904170000`, `20260904190000`), which the auditor's one-line grep missed; production and every migration-built database never orphaned them. Only the Prisma schema lacks the relations, so a database built with `prisma db push` would. The fix stays as defence in depth with a schema-guard test; the genuine gaps were the leaver's Marketplace reports (reporter columns with no relation) and the other deletion items below.
- Merging duplicates drops the merged person's Mix stops, so a Mix the customer asked to stop resumes (`src/lib/contact-merge-actions.ts:158-167`). Appointment bindings, review requests and invites stay on the archived record.
- Imported, duplicated and Marketplace-added date-based Mixes never start (`src/lib/mega-mix-pipeline-service.ts:121-127` looks up a slug that `src/lib/slug.ts` never produces).
- Two devices editing the same contact or Mix: the last save silently wins and can delete a phone number or a Beat added elsewhere (`src/lib/contact-actions.ts:240-342`, `src/lib/mix-editor-actions.ts:238-306`).
- Bulk archive ends Mix assignments while single archive does not, has no Undo, and Restore cannot bring the plans back (`src/lib/bulk-contact-actions.ts:80-92`).
- Import silently drops phone and email columns from Google Contacts, Outlook and common spreadsheets and reports "No issues need review" (`src/lib/contact-import-mapping.ts:73-74`, `ContactImportWizardV2.tsx:415`).
- Phone numbers are keyed by the typed format, so `(555) 123-4567`, `5551234567` and `+15551234567` are three different people to duplicate detection (`src/lib/contact-input.ts:38-44`), and phone search matches only the raw string.
- A retry after a lost outcome response reports "This follow-up is no longer pending" because every click sends a new request id (`src/components/JumpWorkflow.tsx:45-67`).
- A failed automatic delivery is silent and never retried, and the automatic-sending state and send time are invisible on Today (`src/lib/automatic-delivery.ts:185-189`, `src/styles/design-workspaces.css:314`).

**Funnel and trust**
- New accounts are provisioned in UTC and onboarding never detects the device timezone, so Today's day window and the first Beat's time are wrong for every North American user who keeps the defaults (`src/lib/account-provisioning.ts:42`, `OnboardingForm.tsx:77`).
- The `SameSite=Strict` session cookie bounces email-link and OAuth sign-ins to `/login` (reproduced above).
- Invitees cannot use Google or Apple, the invited email is neither shown nor prefilled, a mismatch says "unavailable or already used", and a typo strands the account (`src/lib/social-auth.ts:161-164`, `register/page.tsx:26-45`, `src/lib/referral-access.ts:87-88`).
- Registration rate limits count invalid attempts and the lock message says "about 1440 minutes"; re-running onboarding creates duplicates; `?verified=1` is ignored; signed-in visitors are offered "Sign in".

**Security and abuse**
- Rate limits and audit IPs trust the first `X-Forwarded-For` hop, which the client controls, so every per-IP limit is bypassable and nine known addresses can exhaust the daily auth-email budget (`src/lib/request-context.ts:16-21`). No cross-tenant read or write, auth bypass or privilege escalation was found.
- One report with reason SPAM, OFFENSIVE or PRIVATE_INFO from any account hides a competitor's Marketplace share instantly, the reporter's free text is shown to the author, and only staff can restore (`src/lib/marketplace-service.ts:220-233`). Staff restore also republishes withdrawn shares; removing a Mega-Mix deletes its share and every report on it.
- 51 pages render URL text inside the trusted error banner; support view-only sessions can download Mix files; verification and magic tokens are consumed by a GET.

**Design and accessibility**
- The single-key "N" shortcut cannot be turned off (WCAG 2.1.4 Level A); several phone controls are still under 44 px; Today rows use 14 px names, 32 px avatars and uppercase group headers where the export uses 16 px, 40 px and sentence case; text under the 13 px floor remains on Today, Calendar, the Mix editor and Journey; Journey's dimmed connections fall to about 1.2:1 contrast; the dark-mode report badge is 2.29:1.

**Operations and scale (not yet biting at one workspace)**
- Every workflow instance stores the whole workspace Mix content as JSON and Today loads all of it per view; Marketplace listing reads re-export every author's content and write on GET; the five-minute reconciliation can cancel follow-ups created concurrently; every active workflow instance is re-evaluated every minute.

**Process**
- Five production releases without CI or a pull request; the live commit reachable from a single unmerged branch with no tags; the release procedure only in git-ignored scripts on one machine; no tracked smoke that may target production; five browser specs assert copy the redesigns removed.

## 4. Deliberation

The findings and a first plan were reviewed adversarially by a second model (Claude Opus 5.5) in two rounds; the full texts are the lead's proposal and the two review rounds in the session record. What changed because of it:

**Round 1 verdict: ship with changes.** The first plan (about 85 items in one release) was judged about twice too large for one release on a 3.8 GB build host, and five of its fixes would not have worked as written:
- Sliding session renewal cannot be done from Server Components (they cannot set cookies) and the cookie's expiry is fixed at creation; the mechanism became "cookie expires at the absolute cap, the server row slides on the existing five-minute touch, never earlier".
- Building handoff links from an E.164 number would have broken the handoff evidence check, which requires the recorded recipient to match a stored value; only the link changes, and the same helper fixes the Twilio recipient, which was being sent the display string.
- "Send it yourself" after a failed automatic delivery would cause a duplicate text when the worker had marked an uncertain lease as failed after the message may already have gone out; two wordings are needed.
- A single-report auto-hide gated on the privacy scan misses real leaks (the scan has no address detector and finds names only after greetings), and a three-reporter threshold is unreachable at pilot scale; staff were also never told about reports.
- Reading the client address as "cf-connecting-ip when the right-most hop is Cloudflare" collapses every visitor onto one address if the platform appends any other hop; the rule became a right-to-left walk over trusted ranges that never throws, with a configured override and a post-deploy check.

The reviewer also corrected one auditor claim (the Today report's "timezone is captured from the browser at onboarding" is wrong: detection only runs when a prop no caller passes is set), rejected the "10 digits means +1" phone rule (it mangles Australian mobiles; a North American shape check is needed and the default country is an unmade owner decision), moved phone canonicalization to a later owner-decided release, moved two hot-path rewrites (workflow-attention projection, session and recovery caching) to a later scale release, moved all CSS and accessibility work to a separate release so a visual regression can never force a rollback of the auth and data fixes, and re-ranked severities for a one-workspace pilot (scale findings to P3; Marketplace moderation and staff-tooling findings to P2; process findings to P1).

**Round 2: consensus on Release A**, with these refinements agreed: the second release is built in the same session once the first is live and checked; the client-address helper gets a `TRUSTED_PROXY_CIDRS` override validated at readiness, returns `cf-connecting-ip` only behind a Cloudflare hop and otherwise null when every hop is a proxy, and uses one code path for every environment; the post-deploy gate includes a second sign-in with a forged `X-Forwarded-For` that must still record the real address; link targets fall back to the stored digits without adding a plus, and extensions are stripped; the automatic-sending line omits "during your working hours" because the worker applies working hours only when Journey preferences exist; the session cap is measured from the session's creation and rejected above 400 days; the failing test-worker schedule is disabled rather than gated by a variable.

## 5. Consensus plan

**Release A (this record): about forty small, migration-free fixes in nine groups with no shared files, so a rollback is a redeploy of the previous commit.**

| Group | Fixes |
| --- | --- |
| Shared helpers | `src/lib/client-ip.ts` (trusted-proxy walk, Cloudflare ranges, override validation); `src/lib/phone-dial.ts` (E.164 for North American and plus-prefixed numbers, link fallback to stored digits, match keys, search digits, extension stripping) |
| G1 Auth and funnel | Session cookie SameSite=Lax; sliding sessions with a 90-day cap; device timezone detected during onboarding only; invited email shown read-only with a specific mismatch message and a confirm-email field for text invitations; registration rate limit consumed after validation with human durations; a used verification link for an already verified address goes to sign-in with a notice; "email verified" notice on onboarding; honest first verification screen |
| G2 Client address | Rate limits and session records use the walk instead of the first forwarded hop; `TRUSTED_PROXY_CIDRS` validated at readiness; stale rate-limit rows purged |
| G3a Today outcome | One request id per logical attempt; 409 carries the status; a retry on an already-done follow-up advances the card without claiming the note was saved |
| G3b Today page | Failed automatic deliveries visible on the card and in the review with "not sent" and "unknown" wordings; automatic-sending line; held note only after the draft exists; Done list "Reopen" with names and no control for automatic sends; handoff links from the dialable number and `?&body=`; Twilio recipient in E.164; "Contact saved" and "email verified" notices; DST-safe overdue days; reconcile pass cannot cancel rows created after it started |
| G4a Contacts lifecycle | Merge copies Mix stops and re-points bindings, review requests and invites; bulk archive keeps assignments like single archive; idempotent restore with double-submit-safe buttons; tag deletion says how many Mixes stop; phone search by digits |
| G4b Import and duplicates | Google, Outlook and spreadsheet phone and email headers mapped; ` ::: ` values split; missing-method warning shown before queueing with confirmation; archived-owner conflict message with a Restore link; recipient search by digits; duplicates grouped across formats with a cap for shared numbers; `contactSaved` flag |
| G5 Mixes and Marketplace | Imported date-based Mixes bind to the existing date type; staff restore respects withdrawn shares; Mega-Mix removal refused while its share is hidden or reported; one report hides only for verified private-information reports (two per reporter per day), other reasons queue, staff are emailed, reporter details withheld; privacy scan covers path labels; unknown import errors get a plain message; exports refused during support views |
| G6 Account | Deletion removes import batches, review responses, push subscriptions, delivery and preference rows, anonymises open reports and deletes closed ones; staff replies survive; locale validated with a fallback; last-owner guard returns a friendly error; the false revocation sentence removed; a schema-guard test |
| G7 Tests and process | Eight stale or vacuous browser assertions fixed; a read-only production smoke script; production tags; draft PR to main for CI; the failing test-site schedule disabled; this record |

**Release A2 (next, same day if possible, own tag and record):** the CSS and accessibility batch under one owner (44 px targets, Today row sizes, rail labels, 13 px floor, Journey edge stroke, badge contrast, waitlist band tokens, sheet focus, accessible names, scroll affordance, required-fields note, the shortcut off switch); the computed "not before" send time shared with the settings preview; discard-edits confirmation; merge-chip regex; stale-save protection for contacts (fingerprint under a row lock) and Mixes (`updatedAt` re-read under the existing lock); field-level errors and desktop focus in Contacts; contact-create idempotency; archived contact page; bulk-archive Undo; Back link with `returnTo`; import validation parity with the editor; own-listing add and favourite refusal; own-share pane; Journey wait field; onboarding completed state on `onboardingStep >= 5` and the "Open Today" header link; magic-link interstitial; signed URL error messages on the public pages; import body bound; single-attempt interactive email; support receipt button gating; view-only notices on settings; export rate limit; dead modules removed.

**Release B (needs a migration or an owner decision):** phone canonicalization with a per-workspace region and backfill; invitations through Google and Apple sign-in; author re-review after an upheld report; foreign keys for the orphaned tables; the partial job index; per-recipient auth-email caps and a bot challenge; automatic unsharing on archive; the public access wording; worker shutdown grace and start command; SECURITY.md with a disclosure address; the remaining error-code registry.

**Release C (scale):** workflow definitions stored once per revision; Marketplace facts refreshed on write; batched admission lookups; due-time-driven workflow checks; streamed exports; bounded push passes; cached public pages.

## 6. Implementation and verification

Release A was built on branch `fix/full-audit-20260924` from the live commit: two shared helpers first (`src/lib/client-ip.ts`, `src/lib/phone-dial.ts`, 25 unit tests), then nine groups implemented in parallel on disjoint files, each with its own unit or integration tests, integrated as fifteen commits. Nothing in `prisma/`, `package.json`, `render.yaml` or `next.config.ts` changed, so the release is code only and rolls back by redeploying the previous commit.

**Corrections found while building.** The account-deletion finding was downgraded (see §3). The `journey-connections` seeding the process audit questioned passes 17 of 17 on the live build. The CI-only recovery suite had been failing on the live tree since the login form became a client action (it scraped a server-action id from the page); it now signs in through a magic link it mints itself.

**Checks on the release candidate** (production build, `jitm_design_market` database, one heavy job at a time on the 3.8 GB host):

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `vitest run` (unit + DB-backed integration) | 1,607 passed, 0 failed, 68 environment-skipped (the same 8 files as the baseline); one existing test file needed its mocks updated for the verify-email route's new result shape |
| `npm run build` | passes (1 m 47 s) |
| Playwright, desktop project | funnel 9 passed; Today and follow-ups 30 passed; Contacts 5 passed; Marketplace and Mega-Mixes 10 passed; realigned specs 15 passed; accessibility and visual fitment 10 passed; automatic-delivery states 1 passed |
| Playwright, mobile project | 41 passed, 21 skipped by design, 0 failed |
| CI-only recovery boundary suite on the packaged server | 2 passed (it failed on the live tree in CI run 36079462968) |
| Pre-existing browser failures, reproduced on the live build and unchanged by this release | 20 tests in 9 specs: `preparation` (3: "Add a note" textbox and "Copy or reset" no longer exist), `contact-lifecycle-management`, `contact-search-import-jobs`, `live-search-contact-layout` (5: "Relationship" heading, duplicated status role, URL parameters, `.mix-filter-bar`, `.contact-detail-primary` Notes), `quiet-days` (8: the Journey matrix targets the retired stage map), `mobile-clarity` (2), `mix-list-pagination` (1), `beat-timing` (1: Calendar "Visit happened") |

The eight merge-blocking checks agreed in the deliberation all pass on the production build: invitee registration and onboarding in the device timezone with a reused verification link going to sign-in; a Lax session cookie with a 90-day expiry and the client address from the trusted chain (browser and unit tests; the forged-header sign-in is the live gate); an outcome recorded after a lost response; the failed, unconfirmed and automatic sending states on Today; handoff links dialing E.164 with the recorded recipient unchanged; a merge that keeps a stopped Mix stopped and duplicates paired across formats; Google and Outlook imports with the missing-method warning and digit search; and account deletion leaving no owned rows with open reports anonymised.

Browser specs fixed on the way: eight stale assertions in six specs (G7), three in `core-flows`, two new registration tests made honest about mail delivery on a production server without a provider, the cross-site cookie lookup, an exact "Email" label in 12 sign-in helpers (a configured mail transport shows the magic-link form too), the shared theme fixture's text colours, and one doubled alert.

## 7. Release

_(pending)_

## 8. Owner decisions and open questions

Taken by default in Release A, all reversible and all recorded here:
1. Session cookie `SameSite=Lax`; sessions renew while in use, capped at 90 days from sign-in (`AUTH_SESSION_MAX_DAYS`).
2. The device timezone is adopted during onboarding when the stored zone is UTC and the browser reports a real zone.
3. A failed automatic delivery is shown on the Today card and in the review; the send is never retried automatically.
4. Skip keeps its ten-second Undo; the Done list offers "Reopen" and no control for automatic sends.
5. Marketplace moderation: a verified private-information report hides a share at once (at most two automatic hides per reporting workspace per day); spam, offensive and other reasons stay visible until staff decide; staff are emailed on every report; the reporter's free text is withheld until a decision.
6. A Mega-Mix cannot be removed while its share is hidden or reported.
7. Tag deletion warns how many Mixes stop for that tag's people rather than blocking.
8. Bulk archive keeps Mix assignments, matching single archive.
9. Handoff links dial E.164 for North American and plus-prefixed numbers and otherwise the stored digits; stored data is unchanged.
10. The trusted proxy set is private networks plus Cloudflare, extendable with `TRUSTED_PROXY_CIDRS`.

Still open for the owner:
- The default country or per-workspace region for phone numbers (Release B).
- Whether invitees should be able to sign up with Google or Apple (Release B).
- Whether public pages may be cached at the edge given the nonce CSP (Release B).
- The security disclosure address for SECURITY.md.
- The stale staging rule in AGENTS.md still names the Netlify test site, which no longer answers; the scheduled test worker was disabled (re-enable with `gh workflow enable private-test-worker.yml`).
- Catching `main` up to the live commit (recommended: merge the release PR with a merge commit, then require CI on every release PR and tag every deploy).

