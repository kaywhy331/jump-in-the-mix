# Profession landing pages and homepage trim — September 11, 2026

Working record. The baseline for this pass is the design **live on jumpinthemix.com** (git `HEAD`
of `src/app/page.tsx`): purple brand, the speech-bubble panels from `conversation.css`, and the
"Try a demo mix" panel that steps through multi-beat mixes. The September 10 redesign (ivory
palette, serif display type, single-message sandbox) and the examples-split built on top of it
were reverted from the working tree; the styling is unchanged from the customer site.

## What changed

**Homepage — fewer sections, same styling.** Cut: the "For the relationships you're building"
cards, the three-step workflow with the Today preview, and the closing "Keep good connections in
the mix" bubble. The FAQ drops "Is this for business or personal relationships?" and "Can I bring
my existing contacts?". The header's two section anchors now point at Questions. The hero's
Business · Personal · Your network row becomes five links to the profession pages.
Result: hero + demo mix → questions → waitlist.

**Profession landing pages — `/for/<profession>`.** Five pages, one per ICP, each its own landing
experience in the homepage's composition and styling. The hero carries that persona's headline
and supporting line from its ICP profile, and the demo panel plays **that persona's mixes**:
three multi-beat mixes each (two for the vendor thank-you), 2–4 beats per mix, with the message
wording lifted from the ICP profiles' own example messages (`src/lib/persona-mixes.ts`). Each page
carries its scenario into the waitlist form so an invited account gets the matching starter.
`ProductDemo` gained `scenarios`, `heading` and `legend` props; the homepage keeps the generic
Lead / Quote / Completion mixes.

**Copy.** Only one factual correction beyond the trims: "5 in signup order" / "the 5 earliest
confirmed signups" → "the 5 who have been waiting longest", on the homepage, the profession pages,
`/waitlist` and the confirmation email. `waitlist.ts` orders the wave by `createdAt` among
confirmed entries and resets it on rejoin, so the old wording was not what the query does.

**Kept from the earlier audit (backend, not visible copy):** the waitlist receipt no longer asserts
an email was sent on the rate-limited and suppressed branches (nothing is sent there); the
per-email limit is a shared constant; and a returning visitor's carried scenario can be corrected
while the entry is still pre-invitation (`waitlist.ts` previously had `update: {}`).

## Not changed

Styling, palette, typography, the demo's own copy, the FAQ answers that remain, the waitlist form
and its labels, onboarding, and every authenticated screen. The redesign's documents from
September 10 remain in `docs/` as history; their route tables describe a structure that is no
longer in the tree.

## Deployment note

The test database recorded `20260906010000_customer_journey_intake_calendar` with a second
trailing newline the repo file does not have (identical SQL). A checksum mismatch makes
`/api/health/ready` return 503, so the deploy script restores that byte **for the build only** and
puts the file back with a hash check. The repo file is not changed and should not be; the customer
database was applied from the committed bytes.

## Verification

`npm run validate:static`, `npm run typecheck` and `npm run build` pass. Unit: persona mixes,
product demo, marketing scenarios, recovery-hold proxy and waitlist actions — 47/47. Browser,
against a local server on desktop and Pixel 7: the restored homepage journeys, the demo mix
suite and the new `e2e/profession-pages.spec.ts` pass, except two homepage checks whose tail
navigates to `/waitlist`, which returns 503 locally without a database; the deploy verification
covers that path on the live site.

## Second pass, September 11

- **Rhythm.** The demo's beats are now one numbered list under a "Rhythm" heading, directly after the
  mix buttons. Beat 1 opens by default; opening another beat closes the rest. The channel and timing
  sit on each beat's header. "Preview the rhythm", the beat selector and Previous/Next are gone.
- **Edit in place.** The message bubble is the editor — no "Fine-tune this message" toggle. Call
  beats edit their reminders the same way. "Use prepared message" appears once something is edited.
- **Mark completed.** A check button next to Copy message. It turns green and a short stamp
  (`Sep 11, 2:14 PM`) appears before the beat number and title. Completion is remembered per beat of
  each mix while the page is open. The same shape is in the app: the Done control on a follow-up
  card carries a check that turns green, and a completed card shows its stamp before the mix name.
- **Help text → info tip.** The two help lines are replaced by one "i" that shows on hover, focus
  or tap: "Opens your messaging with the contact ready. Review, edit, send."
- **No backend process on the frontend.** The homepage, profession pages, `/waitlist`,
  `/waitlist/confirm`, the form's small print and the confirmation email no longer describe waves,
  cadence, selection or capacity, and "Free · By invitation" is gone. The waitlist now says it is
  glad you are here and will let you know the moment it is your turn to start mixing.
- **"Mixes for:"** replaces "Made for" — All · Real Estate Agents · Consultants · Contractors ·
  Photographers · Recruiters — the same row on every public page, with the current page highlighted.
  Painters became Contractors: the route is now `/for/contractors` (the stored scenario id
  `painting` is unchanged because the database allowlist constrains it), and the contractor mixes
  drop the painting-only wording for the scope language the shipped starter already uses.
- **Trust section.** "Built for the people who follow up for a living." with twelve profession
  marks (line icons, not customer logos). It deliberately does not say "trusted and used by": the
  product is pre-launch and has no customers to cite.
- **Footer** carries Privacy, Terms and Contact & support unconditionally on the public pages.
  Those three pages still need `PUBLIC_OPERATOR_NAME`, `PUBLIC_SUPPORT_EMAIL` and
  `PUBLIC_BACKUP_RETENTION_NOTICE` set on the test site, or they return 404 there.
- **Bubbles and logo.** Every corner of a speech bubble now has the same radius (the tail is
  unchanged). `assets/logo.png` was already a transparent PNG; the white square behind it was a CSS
  tile, now removed. No newer logo file reached this machine.
- **"Try the demo"** lost its arrow.

## Third pass, September 11

- **Channel actions.** The handoff button now reads Text Message / E-Mail / Phone Call with its
  icon, and the whole action row — action, Copy, ✓, Skip, ⓘ — sits on one line (icon-only
  secondaries below 600px).
- **Skip** sits beside the check, in the demo and on the app's follow-up card. A skipped beat
  shows a grey stamp and a struck title.
- **Editable stamps.** Clicking a recorded time opens a picker. In the demo it changes the beat's
  time in place; in the app it saves through `PATCH /api/jumps/<id>/completed-at`, which changes
  only the recorded time of a completed or skipped follow-up.
- **Message windows** for text and email use the same note-style box as the call reminders — no
  chat bubble, no tail — and the visible "Make it sound like you" label is gone (the field keeps a
  screen-reader label, "Message").
- **Profession grid** no longer breaks words: whole-word wrapping, wider cells, one column below
  480px.
- **Planned dates.** Beats that reconnect on an agreed or seasonal date carry a "Planned date"
  picker in the demo and show "Planned <date>" on their header. The scheduling rule for the real
  engine — go out at the planned instant to every contact who has reached that beat or passed it —
  is implemented and unit-tested in `src/lib/planned-step.ts`, but the engine wiring needs one
  additive column and the test database's migration owner credential is not available from here.
  It is parked, ready to apply, in `.artifacts/planned-dates-2026-09-11/`.
- **Wider canvas.** The public pages' container grew from 1180px to 1340px, the hero gives the demo the larger column (`.86fr 1.14fr`), and the panel's cap rose from 620px to 760px. At 1440px the demo panel measures 705×750 instead of ~544×814 — broader and shorter. The signed-in app keeps its 1180px page width.
