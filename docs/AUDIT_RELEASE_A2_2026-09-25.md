# Audit release A2 — September 25, 2026

Release A2 is live at **https://jumpinthemix.com/** as of 2026-09-25 12:49 UTC. It is the second release of the [2026-09-24 full audit](FULL_AUDIT_2026-09-24.md) plan (§5). It follows Release A (`7b2fa00`) and carries the work the deliberation moved out of A:

- the CSS and accessibility batch under one owner
- the computed "not before" send time
- stale-save protection for contacts and Mixes
- the contact form and profile fixes
- import validation parity
- the funnel remainder and public-page hardening
- the settings and admin remainder
- the repair of the 20 stale browser tests

It is code only: nothing in `prisma/`, `package.json`, the lockfile, `render.yaml` or `next.config.ts` changes, so rolling back is a redeploy of `7b2fa00`.

| Release | Value |
| --- | --- |
| Branch | `fix/full-audit-a2-20260925` (based on `7b2fa00` and its record) |
| Previous production commit | `7b2fa0077574ae5351b98e120341a2c1f0c11d58` (tag `prod-2026-09-25-7b2fa00`) |
| Application commit | `c17cc8065577fa04644f517a55e303a54943bac5` (tag `prod-2026-09-25-c17cc80`) |
| Worker deploy | `dep-dar6ovou01pc738e5rp0`, live 2026-09-25 12:45:01 UTC |
| Web deploy | `dep-dar6q6jtqb8s73fokls0`, live 2026-09-25 12:49:52 UTC, build `j4iowKL65CNfiyBcvAEzh` |
| Final check | 2026-09-25 12:51:52 UTC |

## What changed

| Area | Commit | Changes |
| --- | --- | --- |
| Settings, support views, admin | `e40d4b8` | View-only notices on every settings page, `/more` and the calendar during a support view, with saves disabled. `requireWritableWorkspace()` guards the mutating settings, snooze, stop and onboarding actions, and the refusal lands on the page. Impersonation redirects are built from `APP_URL`. Exports are limited to six an hour (429 with `Retry-After`), use compact JSON and emit shared workflow definitions once. The contact import body is read through the bounded reader, with 413 over the cap. The receipt check is shown only with `email.manage`. Removed: the dead Journey modules (map, selection, stage view, person dot, map layout), `SendTimeField`, `shared-mix-actions`, the `request-url` helper and the duplicate `isQuietTime`. |
| CSS and accessibility | `153a083` | 44 px phone targets on calendar week navigation, duration chips, Journey view tabs, Marketplace chips and tabs, the contact filter and profile track links. Today rows use the export's sizes (16 px names, 40 px avatars, sentence-case queue headers). Compact-rail labels are 12 px. The 13 px floor. Unrelated Journey connections draw with the field-border stroke (3:1) instead of 16% opacity. The report badge and the waitlist band use theme tokens. Strips that scroll sideways fade at the edge where more waits. Merge chips wrap. Fixed heights became minimums. Sheets focus their title instead of Close. The profile initial is named "More". The Quick Add "N" shortcut can be turned off in Personal preferences, and it ignores held keys and composition. The calendar form labels its optional fields. The contact's "Next follow-up" box no longer drags an open note down the page when preparation finishes. |
| Today and Calendar | `416a46f` | One sending rule (review window, quiet hours, working hours, appointments) now drives the worker, the review line on Today ("Sends automatically at … unless you send, snooze or skip it first") and the settings preview. The preview also lists the holds the worker applies (paused or archived Mix, Quick Add capture, stopped for the person, paused path, update in progress). A parity sweep proves the worker decides exactly as before. "Discard edits" asks first. Merge chips need a visible name and describe when they are filled in. "Next 7 days". The Done count matches the due view. Disabling the calendar subscription link is confirmed. |
| Contacts | `13881f0` | The edit form carries a fingerprint of everything it overwrites; under a row lock, the save refuses when another device changed any of it. The Add form is idempotent per opening. The failing email, phone or custom field is marked `aria-invalid` and focused. Selecting a contact on desktop moves focus to its profile. An archived contact's page offers Restore instead of a 404. Bulk archive offers Undo (up to 50 people). Back from Add returns to the Journey it came from. Stop and Remove name their Mix. The Journey track is a focusable region. Mutating contact actions refuse support views. |
| Mixes and Marketplace | `2e2472e` | A Mix save from an editor opened before another device's save is refused, and the typed entries stay on screen. Files, copies and Marketplace adds must pass the editor's timing, wording, placeholder and version rules. Authors cannot add or favourite their own share. The own-share pane stays reachable, with Stop sharing, when nothing can be shown, and Community counts match their rows. The Journey wait field keeps what is typed. |
| Funnel and public pages | `dbeb55d` | The emailed magic link no longer spends the token; the person confirms on `/auth/magic`. Public pages show an `?error=` message only when our redirect signed it. Signed-in visitors skip `/login`, and the public header offers "Open Today". Onboarding shows "Setup is complete". The waitlist states its current state and its daily email limit. Installed apps import and sign in on the same screen. OAuth starts are rate limited by address. Push subscriptions are capped at 20 per person. Expired OAuth states are purged. Interactive auth emails make one attempt. |
| Stale browser tests | `b323002`, `d2cfc31` | The 20 tests listed in the audit record now assert the current product (preparation, contact lifecycle, contact search, live search, the quiet-day Journey panel, mobile clarity, Mix list pagination, beat timing). Three more specs were corrected during verification. |

## Decisions taken while building

These are recorded here because each differs from, or makes precise, a line of the plan:

1. **Sheets focus their title; the review does not focus the message.** On a phone, focusing the message field from a tap raises the keyboard over the message and the send buttons, and most follow-ups go out unedited. The unused focus-selector prop was removed.
2. **The contact forms keep their own rule.** Contacts need "at least a name, company, email or phone", so no single field is required. The general "Everything is required unless marked optional" note would have been false there. It appears on the Mix editor, the calendar form and onboarding instead, and the contact forms mark their optional fields.
3. **Forms opened before this update still save.** A contact edit form without a fingerprint, or a Mix editor without an `updatedAt`, behaves as before. Only forms rendered by this release are checked.
4. **The contact create id is minted on the first submit** and kept for that opened form. A `useMemo` id differs between server and browser (hydration mismatch), and a hidden input filled in after load would trip the unsaved-changes guard.
5. **Signed-in visitors skip `/login`** only when the session is valid, verified (when verification is required), has a workspace and is not a support view, so the destination can never send them back. `/login?reauth=1` still shows the form. Switching accounts in one browser now means signing out first.
6. **Magic links:** the GET puts the token into a 15-minute HttpOnly cookie scoped to `/auth/magic` (SameSite=Lax, Secure like the session), and the page's button posts to a server action that claims it. The claim now rolls back for a suspended account, so the message is ours. The page uses the `same-origin` referrer policy rather than `no-referrer`: a form posted from a no-referrer page carries `Origin: null`, which the proxy's origin check refuses.
7. **Signed error messages** cover every producer that redirects a public page with fixed server wording:
   - the magic-link route
   - OAuth start and callback routes (unexpected errors get a fixed sentence)
   - email verification
   - waitlist
   - invitation preferences
   - staff invitations
   - the suspended-account redirect

   `auth-actions` `fail()` stays unsigned: only demo sign-in and `/account` reach it, and one message carries an inviter-supplied address.
8. **The edge fade uses scroll-driven animations** (Chrome 115+, Safari 26+). Other browsers show the strip as before. The test that waited for every animation to finish now waits only for time-based ones.
9. **The waitlist's daily limit is counted in the browser.** The server deliberately answers every request with the same receipt so addresses cannot be probed.
10. **The calendar during a support view** shows the view-only notice. Its forms remain enabled and are refused by the proxy (403), as before.

## Verification

All checks ran on TrixBot (3.8 GB), one heavy job at a time, against the `jitm_design_market` database.

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run validate:static` | clean |
| `vitest run` (unit and DB-backed integration) | 1,811 passed, 68 skipped by environment (the same 8 files as before). The only failures in the shared design database are the three `staff-access` bootstrap tests. They need an empty staff table (the browser-test administrator is seeded there) and pass 9/9 in an isolated database (`npm run test:isolated`). |
| `npm run build` | passed (1 m 48 s), no warnings; the scroll-fade rules compile with `animation-timeline` intact |
| CI-only recovery boundary suite on the packaged server | 2 passed (it now signs in through the magic-link page) |
| Playwright, desktop project, every spec file | every A2 spec and every changed spec passes; see the method below |
| Playwright, phone project (24 specs) | 123 passed; the failures are the same pre-existing ones as on the live build |

**Method.** The live commit's production build (`7b2fa00`) served on port 3100 and the A2 candidate on port 3101, both with CI's synthetic environment. Every spec ran against the candidate in batches of up to six. Each failure was then run against the live build, and alone. Nothing failed only on A2:

- **Found by the new tests:** one A2 test used the wrong locator and was corrected. One real product defect was found by the repaired preparation test: the note moved when preparation finished. It is fixed on desktop by keeping scroll anchoring out of the growing box.
- **Test order only:** three tests failed on the candidate only because of test order. They pass alone and inside their own file: `browser-privacy` "blocked storage", `admin-workflow-regressions` "different staff session", and on the phone `design-refresh` "collapsed contact details".

**Pre-existing failures on the live build, unchanged by A2.** Found in specs that Release A's verification did not run. Each fails identically on `7b2fa00`:

- `appointment-visit` ×2: the details field now sits in a closed disclosure.
- `browser-privacy` ×2: the note composer now opens from a Note link.
- `core-ux-friction` ×3: Quick Add and contact-selection wording.
- `correctness-route-continuity` ×1.
- `customer-journey` ×1.
- `data-retention` ×1: the provider-events summary.
- `design-adoption` ×1: the retired Journey map.
- `design-refresh` ×2, one of them phone only.
- `email-operations` ×1: the daily email budget depends on the shared database.
- `library-administration` ×1 and `quick-capture-config` ×2: the old `/mixes/<id>/edit` address.
- `mix-authoring-convergence` ×1.
- `profession-pages` ×1.
- `public-pages` ×1: homepage copy.
- `ready-made-panes` ×2: one waits for network idle while prefetches continue.
- `relationship-vocabulary` ×1.
- `save-recovery` ×1.
- `sheet-interactions` ×1: enlarged text on the calendar.
- `ui-ux-public-auth` ×1.
- `ui-ux-workflows` ×2.
- `waitlist` ×1.
- On the phone, `preparation` ×2: the note still moves about 20 px, and "Return to draft" is not reachable.

They are listed for a test-only follow-up. None blocks this release.

## Release

Released on 2026-09-25 between 12:43 and 12:52 UTC, under the owner's standing release authority. It ran the resumable pipeline in `.artifacts/market-live-20260924/a2-*.mjs`: preflight, worker, web, postflight, live smoke, final check. No migration was run.

- **Preflight (read-only).** Both services were live on `7b2fa00` with auto-deploy off. The pushed branch matched the release commit. The database was ready and the runtime boundary was intact, with no recovery hold. All 70 migrations matched the release tree. The release changes 173 files: 163 were hashed for the postflight, and 10 are deletions (the dead modules and their tests).
  - The first run stopped before any write or deploy. Release A's manifest step assumed every changed file exists, and this release deletes files. The preflight now hashes only files present at the release commit, and the postflight also confirms the deleted files are absent on the live instance.
- **Worker.** `dep-dar6ovou01pc738e5rp0` went live at 12:45:01 UTC. Its scoped queue probe passed, and the synthetic job was removed.
- **Web.** `dep-dar6q6jtqb8s73fokls0` went live at 12:49:52 UTC with build `j4iowKL65CNfiyBcvAEzh`.
- **Postflight.** 16 public and sign-in redirect checks passed. On the live instance, 163 release files and 20 served assets hashed identically to the candidate, and the 10 deleted files were absent. The database was ready.
- **Live smoke.** One synthetic owner was used, and every row was removed. The checks:
  - Sign-in sets a Lax, Secure, HttpOnly cookie expiring in about 90 days.
  - Today renders the pending follow-up on a phone.
  - A plain sign-in and a sign-in with a forged `X-Forwarded-For` both recorded the real client address.
  - An emailed magic-link address only opens the confirmation page; an unknown token returns to sign-in with our signed message, which also proves the signing secret is configured.
  - A crafted `?error=` shows the fixed sentence.
  - Today, Contacts, Mixes, Marketplace and Account reflow at 390 px and pass axe in light and dark.
- **Final check.** Record counts were unchanged from the preflight. There were no probe jobs, synthetic users or workspaces, failed jobs since the release, or active rate-limit blocks. Health returned 200 three times, and both services are on `c17cc80` with auto-deploy off.

## Rollback

Deploy `7b2fa0077574ae5351b98e120341a2c1f0c11d58` to the web service first, then to the worker. Nothing in A2 writes data the previous code cannot read:

- Idempotency receipts, push-subscription deletions and OAuth-state purges are ordinary rows or ordinary deletes.
- A magic-link cookie left in a browser expires within 15 minutes and is ignored by the previous code.
- Links sent before the rollback go through the old GET again.

## Follow-ups

- Repair the pre-existing stale tests listed above (test only).
- On the phone, the contact note still moves when preparation finishes. The growing element differs from desktop's; investigate with the phone layout.
- The staff library editor allows timing the Mix editor refuses (offsets up to ±3,650 days, negative offsets on manual-start templates). Imports, copies and Marketplace adds now refuse such content. Align the staff editor with the Mix editor's rules and check production library content before changing it.
- Remove the CSS left without markup by the dead Journey modules (`.journey-map*`, `.journey-selection-*`, `.journey-person-*`, `.touch-node-*` and related rules).
- Disable the calendar's forms during a support view, as the settings pages do.
- Still open from Release A: the phone-number region, invitations through Google and Apple, the security disclosure address, the Netlify staging rule in `AGENTS.md` (the site no longer answers), and catching `main` up to the live commit.
