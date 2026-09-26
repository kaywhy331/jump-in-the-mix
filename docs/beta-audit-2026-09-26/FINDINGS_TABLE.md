# Findings table — beta-readiness audit, 2026-09-26

Production commit audited: `4b5abd8` (live on https://jumpinthemix.com). The full report and verdict are in [BETA_READINESS_AUDIT_2026-09-26.md](../BETA_READINESS_AUDIT_2026-09-26.md). The raw lane reports are in [lanes/](lanes/). Runtime evidence is in [runtime/](runtime/) and screenshots are in [captures/](captures/).

**How to read this table**
- **Severity** is judged for a small, invitation-only beta of solo owners on phones, as defined in the brief:
  - BLOCKER: data loss or corruption, cross-tenant exposure, a security hole, an owner unable to finish sign-up, onboarding or the core loop, a false claim about sending or pricing, or no way to learn that a beta user is broken.
  - HIGH: the owner will probably get stuck, lose trust or churn in week one; needs a fix or a written workaround before inviting.
  - MEDIUM: fine to fix during the beta.
  - LOW/PARKED: scale, paid-plan or nice-to-have.
- **Label**
  - VERIFIED: I ran it or read it, and the evidence is cited. "Runtime" means reproduced in the running production build.
  - INFERRED: reasoned from code; not observed in a running app.
  - NOT RUN: not checked; the reason is given.
- **Reconciliation.** Where two lanes reported the same defect, one ID carries it and the merged IDs are listed. Lane reviewers' severities were changed only where the brief's definitions required it; each change is stated in a note under the table.
- **Prior IDs** refer to the 2026-09-24 audit ([its findings table](../audit-2026-09-24/FINDINGS_TABLE.md)). The status of its P0/P1 fixes is in [lanes/00-prior-audit-fixes.md](lanes/00-prior-audit-fixes.md) and summarised in the main report; those items are not repeated here as new findings.

## Ranked table

| # | ID | Lane | Severity | Label | Title | Key evidence | Fix direction | Prior |
|---|---|---|---|---|---|---|---|---|
| 1 | LOOP-01 (+ONB-01, LOOP-02) | 2 (1) | BLOCKER | VERIFIED (runtime, 5 entry points) | Scheduling a follow-up often creates nothing, or replays a plan at the plan's own times. The screen confirms it anyway | [w1f](runtime/walkthroughs/w1f.txt) (tray, Journey person), [w1d](runtime/walkthroughs/w1d.txt) (Save & schedule), [e23](runtime/walkthroughs/e23.txt) (Add to a mix), [e3c](runtime/walkthroughs/e3c.txt) (Rescheduled), [w2c](runtime/walkthroughs/w2c.txt) and [e7](runtime/walkthroughs/e7.txt) (starter plan); `src/app/api/jumps/[jumpId]/outcome/route.ts:219-269`; `src/lib/jump-engine.ts:430-437,513-515` | Create exactly one follow-up at the chosen day and time (as Quick Add does), independent of date-triggered plans | none (new) |
| 2 | DATA-01 | 3 | BLOCKER | VERIFIED (runtime + existing test) | Changing a time setting brings completed follow-ups back as new pending ones; automatic email would send them again | [w2f output below](#data-01); `src/lib/jump-schedule.ts:192-203`; `src/lib/jump-engine.ts:626-638`; `tests/draft-continuity.test.ts:98-109` | Never regenerate an occurrence that already has a DONE or SKIPPED row for the same contact, Beat and original date | none |
| 3 | REL-01 (+BOPS-01, BOPS-02) | 6 (7) | BLOCKER | VERIFIED (code; production GET) · NOT RUN (Render notification settings) | Nothing tells Kevin when a beta user is broken: no alert path, no error capture, new support tickets notify no one | `src/lib/support-service.ts` (no notification on create); no `instrumentation.ts`; production `GET /api/health/monitor` → 503 `not-ready` ([runtime](runtime/production-get-checks.txt)) | Free alert path: Render failure emails, an hourly GitHub Actions run of `scripts/production-smoke.mjs`, and an email to support@ on each new ticket | PRO-F6 |
| 4 | MSG-01 (+BOPS-03, UX-01) | 5 (7, 8) | BLOCKER | VERIFIED (code, local UI, production wording) · NOT RUN (production `EMAIL_REPLY_TO` value) | Automatic customer email goes out as Jump in the Mix, with replies to the operator's mailbox, while the FAQ says it "needs a connected provider" | `src/lib/automatic-delivery.ts:81-87`; `src/lib/transactional-email.ts:36-37`; `/settings/sending` shows "Email · Available" ([capture](captures/w2-18-settings-sending-390-dark-full.png)); production `/faq` and `/privacy` text ([runtime](runtime/production-get-checks.txt)) | For the beta, keep automatic email unavailable and correct the FAQ; later, send as "{Business} via Jump in the Mix" with Reply-To the owner | TOD-F1 context |
| 5 | SEC-02 | 4 | HIGH | VERIFIED (code + production page) | `/privacy` promises support views need the customer's permission; nothing asks the customer | production `/privacy` "requires customer permission"; `src/lib/impersonation.ts:19-26`; `prisma/support.prisma:43` | Add a consent choice to the ticket form, or reword the promise (owner/legal decision) | none |
| 6 | DATA-04 | 3 | HIGH | VERIFIED (docs, code; local rehearsal passed) · NOT RUN (production restore) | Recovery unproven for today's schema: the last production restore was 2026-09-10 at 48 of 71 migrations; backups expire after 7 days; a failed backup alerts no one | `docs/PRODUCT_COMPLETION.md:31`; `docs/SCHEDULED_BACKUPS.md:14-15`; [local rehearsal](runtime/db-rehearse-restore.txt) | Run `db:qualify-backup` on a fresh production backup into a scratch database before inviting; alert on backup failure | none |
| 7 | ONB-02 | 1 | HIGH | VERIFIED (runtime walkthrough) | The recommended onboarding is the longest, most jargon-dense route: mega-mix, 13 connected Mixes, Beats, Journey | [w1b](runtime/walkthroughs/w1b.txt)–[w1e](runtime/walkthroughs/w1e.txt); [capture](captures/w1-10-onboarding-review-375-light-full.png), [capture](captures/w1-11-after-install-375-light-full.png) | Recommend "one person, one follow-up" for beta testers, or tell them to pick it (owner decision) | none |
| 8 | DATA-02 | 3 | HIGH | INFERRED (code path VERIFIED) | "Start mix" for someone who already finished that Mix does nothing but says "Follow-ups are being prepared" | `src/lib/contact-mix-actions.ts:32-42`; `src/lib/jump-engine.ts:459` | Restart from today (or ask) and say what will happen | none |
| 9 | DATA-03 | 3 | HIGH | VERIFIED (runtime) | One unreadable date rejects a whole import row; Outlook's `0/0/00` empty date fails every such row. From a 5-row Outlook-style file, 1 row can be queued | [e1](runtime/walkthroughs/e1.txt), [capture](captures/e1-import-review-1440-light.png); `src/lib/contact-import-mapping.ts:130-141,250-255` | Drop the unreadable value with a warning; keep the row | CON-F13 (still open) |
| 10 | BOPS-04 | 7 | HIGH | VERIFIED (docs) · NOT RUN (devices) | The owner's own launch gate (iPhone Safari and Android Chrome handoffs) has never been run; its steps target the retired Netlify test site | `docs/CANONICAL_PRODUCT_DECISIONS.md:123`; `docs/MANUAL_DEVICE_QUALIFICATION.md:9-52` | One recorded pass on each phone against production with a synthetic account | none |
| 11 | ONB-03 (+UX-04) | 1 (8) | MEDIUM | VERIFIED | Jargon on first-run and daily screens (mega-mix, Beat, Journey, pipeline, path) with no glossary where a plumber meets it. The canonical doc says the words should be Plan, Follow-up, Saved date | `src/components/OnboardingForm.tsx:39`; `src/app/(app)/jumps/page.tsx:328,385`; `docs/CANONICAL_PRODUCT_DECISIONS.md:36-58` | Owner picks one vocabulary; update the doc or the screens; put the glossary on onboarding and Today | none |
| 12 | ONB-04 | 1 | MEDIUM | INFERRED | Day-one Today says "You're caught up / Nothing due / Add a person" when the first follow-up is later this week | `src/app/(app)/jumps/page.tsx:248,425,449,459-461` | Say when the next follow-up is due | none |
| 13 | ONB-05 | 1 | MEDIUM | VERIFIED (markup, runtime) | Customer name, phone and email fields use the owner's own autofill tokens, so phones offer the owner's details | [w2a](runtime/walkthroughs/w2a.txt): `contactName ac=name`, `contactPhone ac=tel`; `src/components/ContactForm.tsx:185-192` | Use `autocomplete="off"` or section-scoped tokens for customer fields | none |
| 14 | ONB-06 (+BOPS-06) | 1 (7) | MEDIUM | VERIFIED (code) | Staff cannot invite a named person by email: the person must join and confirm the waitlist first (three emails before the first screen) | `src/lib/referral-access.ts:60-63`; `src/lib/waitlist.ts:79,102`; `src/lib/access-admin-actions.ts:14-50` | Add "invite by email" for staff | none |
| 15 | RUN-01 | 1 (lead) | MEDIUM | VERIFIED (runtime) | The first onboarding screen says "Unsaved changes. Save before leaving this page." before the owner has touched anything | [w1a](runtime/walkthroughs/w1a.txt), [w1b](runtime/walkthroughs/w1b.txt); [capture](captures/w1-10-onboarding-review-375-light-full.png). Cause (code): `src/components/FormGuard.tsx:20-22` snapshots the form at mount; the device-timezone detection (`src/components/MegaMixSetup.tsx:34`, `detectTimezone`) then changes the timezone field, so the page counts as edited (and leaving it would prompt) | Take the snapshot after timezone detection, or exclude the detected zone | none |
| 16 | RUN-02 | 2 (lead) | MEDIUM | VERIFIED (runtime) | Saving a timing edit to a running plan goes through a "Start this mix?" dialog whose button stays disabled until an audience is chosen | [w2e](runtime/walkthroughs/w2e.txt); [capture](captures/w2-15b-review-sheet-1440-light.png) | Offer "Save changes" for an active Mix without re-choosing who gets it | none |
| 17 | RUN-03 | 2 (lead) | MEDIUM | VERIFIED (runtime) | Quick Add's "Save all" is blocked by a native "Please fill out this field." bubble for three required fields (time, method, draft) that sit below the visible part of the sheet; the typed capture "Follow up with Sam Ortiz today about the kitchen quote" cannot be saved until the owner scrolls and finds them | [e3b](runtime/walkthroughs/e3b.txt), [e3c](runtime/walkthroughs/e3c.txt), [capture](captures/e3b-quick-add-after-save-390-light.png) | Scroll to and name the missing fields, or default the method from the contact | none |
| 18 | RUN-04 | 8 (lead) | MEDIUM | VERIFIED (code; runtime automation) · INFERRED (human impact) | Every return to the app (from the SMS/email app, another tab or the browser toolbar) masks the whole workspace with a modal "Checking your account…" until a server round-trip completes. During rapid keyboard use it kept reappearing: visible at 48 of 80 Tab stops, and Review was never reached | `src/components/BrowserAccountBoundary.tsx:37-45,79-88`; [e6c](runtime/walkthroughs/e6c.txt), [capture](captures/e6-keyboard-review-focus-1440-light.png) | Re-check without masking when the last check is recent; mask only when the account marker changed | none |
| 19 | LOOP-03 | 2 | MEDIUM | VERIFIED (code) · INFERRED (impact) | Turning on automatic sending sends the overdue backlog within minutes, oldest first; Reopen/Undo of a hand-sent follow-up can send it again | `src/lib/automatic-delivery.ts:147-156,170-171`; `src/components/AutomaticSendPreview.tsx:13` | Exclude follow-ups already overdue at opt-in and ones reopened after a hand send | TOD-F6 context |
| 20 | LOOP-04 | 2 | MEDIUM | VERIFIED (code) · INFERRED (UX) | After-visit Beats wait for "Visit happened" on the Calendar; nothing on Today asks for it | `src/lib/jump-engine.ts:388-392`; `src/app/(app)/calendar/page.tsx:82` | Ask "How did the visit go?" on Today after the appointment | none |
| 21 | LOOP-05 | 2 | MEDIUM | VERIFIED (code) · INFERRED (text) | Today's in-place actions show raw text ("Load failed", "Authentication required.", Prisma messages) with no next step; the tray's note is kept only in memory | `src/components/JumpWorkflow.tsx:152-159,298-299`; `src/app/api/jumps/[jumpId]/outcome/route.ts:106,337-343` | Map errors to fixed sentences with a retry or sign-in link; persist the tray note | SEC-12 overlap |
| 22 | LOOP-06 | 2 | MEDIUM | INFERRED | After importing a customer list, Today stays empty and nothing leads there | `src/components/ContactImportWizardV2.tsx:466` | Offer "check in with these people" on the import results | none |
| 23 | LOOP-07 | 2 | MEDIUM (lane: LOW) | VERIFIED (code) | Quiet hours covering all working hours can be saved; preparation then fails for that workspace and the automatic-send pass stops for every workspace after it | `src/lib/account-preference-actions.ts:55-78`; `src/lib/automatic-delivery.ts:138-141` | Refuse the combination; isolate each workspace in the pass | none |
| 24 | DATA-05 | 3 | MEDIUM | VERIFIED (computed) · INFERRED (real files) | Import stores wrong values: Outlook/Google address columns mis-mapped; accented names corrupted in Windows-1252 CSV and vCard 2.1 | `src/lib/contact-import-mapping.ts:116,120-123`; `src/lib/contact-file-parser.ts:84-86,101` | Map address columns per exporter; detect encoding | none |
| 25 | DATA-06 | 3 | MEDIUM | VERIFIED (code) | Duplicate saved dates double every date-based follow-up (merge moves all dates; manual + imported birthday both kept; no double-tap guard) | `src/lib/contact-merge-actions.ts:131`; `src/lib/important-date-actions.ts:54-124` | De-duplicate dates by type and value | none |
| 26 | DATA-07 | 3 | MEDIUM | VERIFIED (code) | A phone-only import match defaults to MERGE, folding a spouse or colleague into the existing person; the form refuses shared numbers | `src/lib/contact-import-service.ts:170`; `src/lib/contact-actions.ts:240-250` | Default phone-only matches to "review" and allow shared numbers | CON-F3 residue |
| 27 | DATA-08 | 3 | MEDIUM | VERIFIED (code) | The spreadsheet export drops Do-not-contact and private notes and cannot be re-imported; the "complete JSON backup" has no restore path | `src/lib/contact-export.ts:28-60`; `src/app/(app)/account/page.tsx:65` | Export all fields; call the JSON an export, not a backup | none |
| 28 | SEC-01 | 4 | MEDIUM | VERIFIED (code) · INFERRED (attack time) | Staff MFA codes are limited per account and address, so rotating addresses gives fresh guesses; failures are not logged | `src/lib/admin-mfa-actions.ts:25,111-115` | Account-wide lockout with an email to the owner | none |
| 29 | SEC-03 | 4 | MEDIUM | VERIFIED (code) | Anonymous lead-form posts attach to an existing contact and fire journey events | `src/lib/intake.ts:57-58,78-79`; `src/lib/journey.ts:101` | Hold matches for owner review | SEC-F5 (still open) |
| 30 | MSG-02 | 5 | MEDIUM | VERIFIED (code, `node -e`) | Today reads "Email acceptance could not be confirmed" and the app's own daily cap as "the provider rejected it. Send it yourself." — a duplicate-send invitation | `src/lib/today-view.ts:27-38`; `src/lib/transactional-email.ts:119`; `src/lib/email-budget.ts:98` | Separate "may have been sent" and "not sent (limit)" wording | TOD-F1 residue |
| 31 | MSG-03 | 5 | MEDIUM | VERIFIED (code) · INFERRED (capacity) | One 90-a-day allowance (70 after the account reserve) carries invitations, digests and every automatic email; when full, automatic emails fail permanently and waitlist sign-ups fail | `src/lib/notification-delivery.ts:96-141`; `src/lib/automatic-delivery.ts:194-196`; `render.yaml:25-32` | Defer instead of failing; pace invitation waves | none |
| 32 | MSG-04 | 5 | MEDIUM | VERIFIED (code) · INFERRED (UX) | A suppressed address (bounce/complaint) never gets verification or sign-in mail, while the page says "You can try again" | `src/lib/email-budget.ts:85-86`; `src/app/verify-email/pending/page.tsx:39` | Tell the person and alert staff | none |
| 33 | MSG-05 | 5 | MEDIUM | VERIFIED (code) | The public waitlist form has no bot guard; invented addresses spend the allowance and bounce on the only sending domain | `src/components/WaitlistForm.tsx:33-38`; `src/lib/waitlist-actions.ts:28-31` | Honeypot field (free) | none |
| 34 | MSG-06 | 5 | MEDIUM | VERIFIED (code) | No List-Unsubscribe header; digests, weekly reports and automatic emails have no stop link | `src/lib/transactional-email.ts:37`; `src/lib/notification-delivery.ts:166-181` | Add headers and a manage link | none |
| 35 | MSG-07 | 5 | MEDIUM | VERIFIED (runtime links) · NOT RUN (devices) | Contact-page Text/Call links use the typed number (`sms:(303) 555-0199`); review and referral links use `?body=` | [w2c](runtime/walkthroughs/w2c.txt) contact page links; `src/components/ContactProfile.tsx:193,195,222`; `src/app/api/reviews/[token]/refer/route.ts:15` | Reuse the Today link builder (`phone-dial.ts`) everywhere | TOD-F4 residue |
| 36 | REL-02 | 6 | MEDIUM | VERIFIED (code) · INFERRED (duration) | One owner's large import stalls background work for every workspace (one queue; group-audience Mix cost grows with the square of the import) | `src/lib/contact-import-jobs.ts:225`; `src/lib/jump-engine.ts:210-226,405` | Batch per-row preparation; cap import size during the beta | none |
| 37 | REL-03 | 6 | MEDIUM | VERIFIED (code) · INFERRED (UX) | While the worker is down, imports stay "running" at 0% and follow-ups say "Sends automatically any minute now" | `src/components/ContactImportWizardV2.tsx:228-250,457`; `src/components/EditableFollowUpAction.tsx:74` | Show the worker's last heartbeat when work is overdue | none |
| 38 | REL-04 | 6 | MEDIUM | VERIFIED (code) · NOT RUN (Render supervision) | `/api/health/worker` reports the heartbeat timer, not job progress; a hung worker stays "ready" | `src/worker/index.ts:373-376`; `src/app/api/health/worker/route.ts:11-19` | Heartbeat from the loop, plus a job-progress age | none |
| 39 | REL-05 | 6 | MEDIUM | VERIFIED (code; runtime under load) | A database hiccup or CPU starvation shows signed-in users a bare plain-text 503 with no retry or link (a dead end in the installed iPhone app). It happened to 2 of 119 requests on a Render-sized instance with 5 concurrent readers | [free-plan-sizing](runtime/free-plan-sizing.txt); `src/proxy.ts:132-141`; `src/lib/recovery-hold.ts:19,23-28` | Branded retry page | none |
| 40 | REL-06 | 6 | MEDIUM | VERIFIED (code) · INFERRED (UX) | After each release, Save in an already-open form fails with "Check your connection" on every retry | `src/components/ActionForm.tsx:11-13`; `next.config.ts` (no `deploymentId`) | Set a deployment id; tell the person to reload; release in quiet hours | none |
| 41 | BOPS-05 | 7 | MEDIUM | VERIFIED (code) | Raising capacity to invite one person also releases an overdue weekly wave (up to 10 waitlisters) within about a minute | `src/lib/waitlist.ts:121,126`; `src/worker/index.ts:343` | Warn in the Admission preview; pause waves first (checklist) | none |
| 42 | BOPS-07 | 7 | MEDIUM | VERIFIED (gh, git) | `4b5abd8` has no tag, record or CI run; rollback scripts live only in git-ignored `.artifacts/` | [runtime](runtime/github-ci-state.txt) | Tag and record it; commit the release scripts without secrets | PRO-F2/F3/F4 (still open) |
| 43 | BOPS-08 | 7 | MEDIUM | VERIFIED (docs, code) | If Kevin loses his authenticator and recovery codes, there is no solo recovery path | `docs/ADMIN_MFA.md:37`; `src/lib/staff-bootstrap.ts:11` | A reviewed break-glass script | ACC-F3 context |
| 44 | BOPS-09 | 7 | MEDIUM | VERIFIED (production pages) | Testers are never told this is a beta; "free, no payment card" everywhere while payments are undecided | production `/terms`, `/faq` ([runtime](runtime/production-get-checks.txt)); `docs/CANONICAL_PRODUCT_DECISIONS.md:85` | One sentence of beta and pricing wording (owner) | none |
| 45 | BOPS-10 | 7 | MEDIUM | INFERRED | On a phone, support is More → last row → past a 21-item FAQ; no feedback entry on Today | `src/app/(app)/more/page.tsx:19`; `src/app/(app)/help/page.tsx:70-79` | "Message support" at the top of Help; a feedback link | none |
| 46 | BOPS-11 | 7 | MEDIUM | VERIFIED (code) | The per-user admin page lacks setup state; the verification-email outcome can't be looked up by address | `src/app/(staff)/admin/users/[userId]/page.tsx:24,27` | Add both | none |
| 47 | UX-02 | 8 | MEDIUM | VERIFIED | Template and feature pages describe demo behaviour and a weekly email that don't exist ("open a planned Beat", 4-step/3-step sample plans, "week ahead" summary) | `src/app/features/follow-up-reminders/page.tsx:44`; `src/app/follow-up-templates/estimate-follow-up/page.tsx:31-37`; `src/lib/notification-delivery.ts:292` | Rewrite the descriptions to match | none |
| 48 | UX-03 | 8 | MEDIUM | VERIFIED (CSS; runtime capture) | Inline links look like plain text (no colour, no underline): "Sign in" on /waitlist, support links, "reminders" on the homepage | `src/styles/base.css:63`; [capture](captures/m-waitlist-375-light.png) | Underline links inside sentences | none |
| 49 | TEST-01 | 9 | MEDIUM | VERIFIED | Critical beta flows have no test: next-promise creates a follow-up; completed follow-ups stay completed after settings changes; invite → email → verify → first follow-up; automatic-email headers | main report §5 | Add the four tests with the blocker fixes | PRO-F5 context |
| 50 | TEST-02 | 9 | MEDIUM | VERIFIED (gh) · NOT RUN (finding identity) | The `secret-history` (gitleaks) check fails on PR #83; the log is no longer available. A local scan of the 267 unmerged commits found no provider key, private key or token pattern | [runtime](runtime/github-ci-state.txt) | Identify the hit; allowlist the fixture or rotate | none |
| 51 | TEST-03 | 9 | LOW | VERIFIED (reruns) | Four browser tests are flaky or mis-configured: `journey-connections:310` (order), `admin-workflow-regressions:92` (timing, 4/5), `onboarding-invitations:60` on the phone (taps before the page is interactive, 0/4; the product works by hand), `staff-permissions:64` (fails 3/3 under CI's MFA-off staff group, passes 6/6 with MFA on) | [runtime/e2e/](runtime/e2e/) | Wait for hydration in the phone test; run the staff group with MFA or fix the expectation | PRO-F5 context |
| 52 | ONB-07 | 1 | LOW | VERIFIED | "Setup is complete — Your follow-ups are on Today" shows with nobody enrolled | `src/app/onboarding/page.tsx:21-30` | Say what to do next | none |
| 53 | ONB-08 | 1 | LOW | INFERRED | Using an emailed sign-in link before verifying removes the password chosen at registration | `src/lib/magic-link.ts:63`; `src/lib/unverified-account.ts:17` | Tell the person | none |
| 54 | ONB-09 | 1 | LOW | VERIFIED (code) | One-person setup has no duplicate guard on a retried submit | `src/lib/onboarding-actions.ts:83-96` | Idempotency key | FUN-F8 residue |
| 55 | ONB-10 | 1 | LOW (lead: seen at runtime) | VERIFIED (runtime) | A realtor's first prepared text says "…received the estimate from my business"; business type and reason default to home-services wording | [w2c](runtime/walkthroughs/w2c.txt) sms body; `src/lib/jump-render.ts:103`; `src/components/StarterPreview.tsx:27` | Ask for the business name or omit the clause; pick reasons per business type | none |
| 56 | LOOP-08 | 2 | LOW | VERIFIED | Calendar actions say "Calendar updated." when nothing changed | `src/lib/calendar-actions.ts:52-62,69-76` | Say what changed | none |
| 57 | LOOP-09 | 2 | LOW | VERIFIED | "Mark sent"/"Skip" don't check for an automatic send in flight | `src/app/api/jumps/[jumpId]/outcome/route.ts:233-238` | Check the delivery lease | TOD-F13 (still open) |
| 58 | DATA-09 | 3 | LOW | VERIFIED (code) | No idempotency key for bulk one-time messages, calendar entries, finishing onboarding | `src/lib/bulk-contact-actions.ts:162,220`; `src/lib/calendar-actions.ts:20-24` | Add keys | CON-F14 family |
| 59 | DATA-10 | 3 | LOW | VERIFIED (code) | Time edge cases: a 21:00 Beat goes out at 08:00 the same day; saved dates keep their original zone; DST "choose UTC" | `src/lib/personal-scheduling.ts:41-45`; `src/lib/calendar-time.ts:23` | Move forward, not back; re-zone on change | TOD-F15 (still open) |
| 60 | DATA-11 | 3 | LOW/PARKED | VERIFIED (code) | No permanent delete of one person; import batches keep uploaded rows for the account's life | `ContactImportBatch.payload` | Retention for import payloads | none |
| 61 | SEC-04 | 4 | LOW | VERIFIED | Account existence can be learned from sign-in timing (bcrypt cost 10 vs 12), registration and invitation messages | `src/lib/auth-actions.ts:25,159-160`; `src/lib/referral-access.ts:44-56` | Same cost dummy hash; uniform messages | none |
| 62 | SEC-05 | 4 | LOW | VERIFIED (code) | Per-address rate limits are easy to sidestep (IPv6 per /128; Cloudflare ranges trusted) | `src/lib/client-ip.ts:45,97-101,132-137` | Key IPv6 by /64 | SEC-F1 residue |
| 63 | SEC-06 | 4 | LOW (dormant) | VERIFIED | OAuth state not bound to the browser (login CSRF) once Google/Apple is configured | `src/lib/social-auth.ts:98-116,137-148` | Bind state to a cookie before enabling providers | none |
| 64 | SEC-07 | 4 | LOW | VERIFIED | The verification link is spent by a GET and signs in whoever opens it | `src/app/api/auth/verify-email/route.ts:68-78` | Confirm on a page, like magic links | SEC-F8 residue |
| 65 | SEC-08 | 4 | LOW | VERIFIED | Admin → Audit shows customers' contact names to `audit.read` staff without a support case | `src/lib/contact-merge-actions.ts:263`; `src/lib/audit-redaction.ts:1` | Redact `displayName` | none |
| 66 | SEC-09 | 4 | LOW | VERIFIED | The personal-data export gives a Marketplace author the reporter's text while the report is open | `src/lib/account-export-stream.ts:298` | Withhold until decided | none |
| 67 | SEC-10 | 4 | LOW | VERIFIED (code) | A shared Mix republishes later edits without re-running the privacy check | `src/lib/mix-editor-actions.ts:386` | Re-check on save | none |
| 68 | SEC-11 | 4 | LOW | VERIFIED | Staff-only accounts have no security page; a lost authenticator can only be reset in the database | `src/lib/auth.ts:249` | See BOPS-08 | ACC-F3 (open by decision) |
| 69 | SEC-12 | 4 | LOW | VERIFIED | Hardening leftovers: raw error text in six JSON routes; a dead action with an off-site redirect; stale session docs | lane 4 §SEC-12 | Clean up with the next release | none |
| 70 | MSG-08 | 5 | LOW | VERIFIED (DNS) | DMARC `p=none` with no `rua`; DKIM key 1024-bit | [lane 5 DNS](lanes/05-email-messaging.md) | Add `rua`; move to 2048-bit later | none |
| 71 | MSG-09 | 5 | LOW | VERIFIED (code) · NOT RUN (env) | Push falls back to `EMAIL_FROM` as the VAPID subject, which web-push rejects | `src/lib/env.ts:94`; `src/lib/follow-up-push.ts:16-17,53` | Require `WEB_PUSH_VAPID_SUBJECT` | none |
| 72 | MSG-10 | 5 | LOW | VERIFIED | Email copy gaps (no "ignore if not you", "Good morning" at any hour, no postal address) | `src/lib/auth-email.ts:47-57` | Copy pass | none |
| 73 | MSG-11 | 5 | LOW | VERIFIED | Some interactive emails still make three 15-second attempts inside the request | `src/lib/marketplace-service.ts:336`; `src/lib/waitlist-actions.ts:41` | One attempt in-request | OPS-F14 (still open) |
| 74 | REL-07 | 6 | LOW | VERIFIED | Readiness is expensive, public and uncached, and is Render's health check | `render.yaml:45`; `src/lib/database-release.ts:18-51` | Cheap liveness for Render | OPS-F10 (still open) |
| 75 | REL-08 | 6 | LOW | VERIFIED (code) · INFERRED (latency) | Both database pools drop idle connections after 10 s, so sparse traffic reconnects on most views | `src/lib/prisma.ts:11` | Longer idle timeout | none |
| 76 | BOPS-12 | 7 | LOW | VERIFIED | No operator path to honor a deletion request for a suspended or locked-out user | `src/lib/user-admin.ts:14`; `src/lib/account-deletion-actions.ts:43` | Staff deletion action | none |
| 77 | BOPS-13 | 7 | LOW | VERIFIED | Docs say five member invitations, counted and emailed; the code gives three, uncounted, sent from Today | `docs/CANONICAL_PRODUCT_DECISIONS.md:12,135`; `src/lib/system-mix.ts:1` | Fix the docs | none |
| 78 | UX-05 | 8 | LOW | VERIFIED | Internal words shown ("no longer pending: reconciled", "The worker rechecks…", "Mix occurrence") | `src/app/(app)/jumps/page.tsx:458`; `src/components/AutomaticSendPreview.tsx:13` | Plain wording | none |
| 79 | UX-06 | 8 | LOW | VERIFIED | Prior design P2s still open (DES-F4, F7, F8, F15, F16, F20; 11 px "Recommended") | lane 8 §UX-06 | Design pass | DES-F* (P2) |
| 80 | UX-07 | 8 | LOW | INFERRED | Focus can be hidden by sticky bars at 768–900 px and by the import action bar | `src/styles/auth.css:68`; `src/styles/contact-import.css:17` | `scroll-padding` | none |
| 81 | UX-08 | 8 | LOW | NOT RUN | `/security` gives `security@jumpinthemix.com`, an alias still pending; `security.txt` also lists support@ | production `/.well-known/security.txt` ([runtime](runtime/production-get-checks.txt)) | Create the alias (owner) | none |
| 82 | UX-09 | 8 | LOW | VERIFIED | Lighthouse budgets cover only 6 public URLs | `.lighthouserc.cjs:10-17` | Add the funnel pages | none |

**Severity changes made in reconciliation**
- **REL-01 stays BLOCKER; the overlapping BOPS-01 and BOPS-02 (HIGH) are merged into it.** The brief names "no way to learn that a beta user is broken" as a BLOCKER. As deployed:
  - no alert reaches Kevin;
  - new tickets notify no one;
  - server errors reach only Render's log stream.

  A daily manual check of `/admin` would be a workaround, not an alert.
- **MSG-01 is raised from HIGH to BLOCKER, with BOPS-03 and UX-01 merged into it.**
  - The production FAQ says automatic sending "needs a connected provider". In production the owner connects nothing: one consent tick sends from the platform address.
  - The brief classes a false claim about sending as a BLOCKER.
  - The cheapest way to clear it is to keep automatic email unavailable for the beta and correct the FAQ sentence.
- **ONB-01 and LOOP-02 are merged into LOOP-01.** The root cause is the same: a "Follow-up" saved date is read only by date-triggered plans.
  - Both ONB-01 and LOOP-02's contact "Add to a mix" case were reproduced at runtime.
- **LOOP-07 is raised from LOW to MEDIUM.** One owner's setting stops the automatic-send pass for every workspace after it.
- **ONB-10 is kept LOW.** It was seen at runtime: a realtor's first message talks about "the estimate from my business".

## Details for BLOCKER and HIGH findings

The MEDIUM and LOW findings have full details (what the owner experiences, reproduction, evidence, root cause, fix) in their lane reports, under the same ID.

### LOOP-01 — Scheduling a next follow-up often creates nothing, or replays a plan (BLOCKER, VERIFIED at runtime)
- **What the owner experiences.** After a call, the plumber records "Completed" and ticks "Schedule the next follow-up: tomorrow, 10:00 AM".
  - The app says "Follow-up completed · Next scheduled: Sep 28", which is the plan's own next step.
  - Nothing appears at 10:00 the next day. The promise made to the customer is silently lost.
  - The same thing happens after "Save & schedule follow-up" when adding the first customer on the recommended onboarding path: the date is saved, and no follow-up is created.
  - It also happens after "Add to a mix" on a contact with the starter plan. The notice says "Start saved. Follow-ups are being prepared." and none is created.
  - Recording "Rescheduled" to a new date marks the follow-up done and creates nothing: the promise disappears.
  - For a person on the one-person starter plan, a follow-up appears on the chosen day but at the plan Beat's own time. The owner asked for 14:00 and got 10:00. The plan's later call is replayed as well, so every promise adds another call. After two promises Chris had 4 pending follow-ups.
- **Reproduction** (local production build of `4b5abd8`, phone 375 px):
  1. Take the recommended onboarding path. Choose Add your first customer, tick "Schedule a follow-up now" (tomorrow), then Save & schedule follow-up. The result is 0 follow-ups for the person: [w1d](runtime/walkthroughs/w1d.txt).
  2. Start the Journey plan for that person. Today shows its first step.
  3. Review → Open text. In the tray choose "Add a note or next follow-up", tick "Schedule the next follow-up" (default tomorrow 10:00), then Save outcome.
  4. The worker ran the resulting `generate-jumps` job successfully. No follow-up exists at the chosen time; only the plan's step on Sep 28 does ([w1f](runtime/walkthroughs/w1f.txt)).
  5. One-person starter path: the same tray steps create Sep 27 10:00, plus a second copy of the plan's day-5 call on Oct 2 next to the original Oct 1 call ([w2c](runtime/walkthroughs/w2c.txt), [capture](captures/w2-09-all-pending-390-dark-full.png)).
     - The 10:00 only matched because the plan Beat's own time is also 10:00.
     - With the tray's exact request for 2026-09-30 14:00, the follow-up landed at 10:00, and another call was added on Oct 5 ([e7](runtime/walkthroughs/e7.txt)).
  6. Contact page → "Add to a mix" → the starter plan (the person has no saved date) → "Start saved. Follow-ups are being prepared." → 0 follow-ups after 15 s with the worker running ([e23](runtime/walkthroughs/e23.txt), [capture](captures/e2-add-to-mix-390-light.png)).
  7. Quick Add a person with a follow-up (today 14:00, call), then record "Rescheduled" to 2026-09-29 09:00. The response is `{"status":"DONE",…}`, the follow-up is DONE (`outcome:rescheduled`), and nothing exists on Sep 29 ([e3c](runtime/walkthroughs/e3c.txt)).
- **Evidence.**
  - `src/app/api/jumps/[jumpId]/outcome/route.ts:246-269`: the next promise becomes a `JumpDate` of the system "follow-up" type, plus a `generate-jumps` job.
  - `src/lib/jump-engine.ts:430-437`: generation reads that date only for DATE_TRIGGERED Mixes assigned to the person on that date type, and replays every Beat of such a Mix from it.
  - `e2e/jump-outcome-timeline.spec.ts:98` checks only that the `JumpDate` row exists.
- **Root cause.** The next promise is modelled as a saved date that only date-triggered plans consume.
- **Fix direction.** Create one follow-up at the chosen day and time directly, as Quick Add does. Make the confirmation name that date. Apply the same rule to "Rescheduled" and "Save & schedule follow-up". Add a browser test that asserts a follow-up exists at the chosen time.

### DATA-01 — Completed follow-ups come back after a time setting changes (BLOCKER, VERIFIED at runtime)
<a id="data-01"></a>
- **What the owner experiences.** Maya texted Chris on Saturday and marked it done. That evening she sets Personal preferences → Weekend scheduling → "Move to next Monday".
  - Monday's Today now shows "Follow up about an estimate" for Chris again: the message she already sent.
  - With automatic email on, the worker would send it to the customer a second time without her.
- **Reproduction.**
  1. One-person onboarding on a Saturday, then complete the first follow-up.
  2. `/account/preferences` → Weekend scheduling "Move to next Monday" → Save scheduling defaults.
  3. After the background update, a new PENDING row appears for the completed Beat on Monday 10:00 ([w2d/w2f output](runtime/walkthroughs/w2d.txt); before and after rows in the main report §3).
  4. The existing integration test `tests/draft-continuity.test.ts:98-109` asserts the same regeneration (`created: 1`) after a completed row and a broadcast time change.
- **Evidence.**
  - `src/lib/jump-schedule.ts:192-203`: the uniqueness key includes the scheduled local date-time and zone.
  - `src/lib/jump-engine.ts:596-640`: a desired row whose key has no existing row is created as PENDING. Nothing checks for a DONE or SKIPPED row of the same occurrence.
- **What triggers it.** A change to the weekend rule, time zone, quiet hours or working hours (where Journey preferences apply), or to a Beat's day or time. The default follow-up time does NOT trigger it for the shipped plans: every shipped Beat has its own time. This was checked at runtime.
- **Fix direction.** Treat an occurrence as settled when a DONE or SKIPPED row exists for the same contact, Beat, occurrence source and original local date. Add a test that changes each setting after completion.

### REL-01 (+BOPS-01, BOPS-02) — Nothing tells Kevin when a beta user is broken (BLOCKER)
- **What Kevin experiences.** A tester hits an error, files an in-app ticket, or the worker stops. No email, push or chat message reaches Kevin. He finds out only by opening `/admin` or Render's logs.
- **Evidence.**
  - Production `GET /api/health/monitor` answers 503 `{"status":"not-ready"}`: no independent monitor reports ([runtime](runtime/production-get-checks.txt)).
  - `src/lib/support-service.ts` sends no notification when a ticket is created.
  - `src/lib/operations-notifications.ts` is used only by the undeployed monitor.
  - There is no `instrumentation.ts` or error-reporting hook, so server exceptions go to stdout only.
  - Whether Render's own failure emails are enabled is NOT RUN (a dashboard setting).
- **Fix direction (all free).**
  - Turn on Render failure notifications (owner).
  - Add an hourly GitHub Actions run of `scripts/production-smoke.mjs`; GitHub emails on failure.
  - Email support@ when a ticket or reply arrives.
  - Show the worker heartbeat age on the admin Overview.
  - Until all that exists, a written daily `/admin` check is the minimum workaround.

### MSG-01 (+BOPS-03, UX-01) — Automatic customer email sends as the platform, and the FAQ describes it wrongly (BLOCKER)
- **What the owner experiences.** Settings → Sending shows "Email · Available". One consent tick turns it on ([capture](captures/w2-18-settings-sending-390-dark-full.png)).
  - Customers then get "From: Jump in the Mix" email with the platform Reply-To.
  - Their replies go to the operator's mailbox. `/privacy` says the support address forwards to the operator's Gmail. The plumber never sees them.
  - The public FAQ says automatic sending "needs a connected provider", but nothing has to be connected.
- **Evidence.**
  - `src/lib/automatic-delivery.ts:81-87`: the call to `sendTransactionalEmail` passes no `from` or `replyTo`.
  - `src/lib/transactional-email.ts:36-37`: the defaults are `EMAIL_FROM` and `EMAIL_REPLY_TO`.
  - `docs/HOSTED_DEPLOYMENT.md:34`: `EMAIL_REPLY_TO` is the "Monitored reply mailbox".
  - Production `/faq` and `/privacy` text ([runtime](runtime/production-get-checks.txt)).
  - The production value of `EMAIL_REPLY_TO` is NOT RUN: it is an environment value.
- **Fix direction.**
  - For the beta: make automatic email unavailable in production (a small code or config change) and correct the FAQ sentence.
  - Afterwards: send as "{Business} via Jump in the Mix", with Reply-To set to the owner and a footer naming the business.

### SEC-02 — `/privacy` promises consent for support views that the product never asks for (HIGH)
- **Evidence.** Production `/privacy`: "The private support-view workflow requires customer permission and records staff access." The code requires only an open ticket assigned to the staff member, and self-assignment is allowed (`src/lib/impersonation.ts:19-26`). There is no consent field (`prisma/support.prisma:43`).
- **Fix direction.** Add an "allow support to view my account" choice on the ticket form, or reword the sentence. The wording is an owner or legal decision.

### DATA-04 — Recovery is unproven for today's schema (HIGH)
- **Evidence.**
  - The last recorded production restore was on 2026-09-10, at migration 48 of today's 71 (`docs/PRODUCT_COMPLETION.md:31`).
  - Backups expire after 7 days (`docs/SCHEDULED_BACKUPS.md:14-15`; production `/privacy`).
  - A failed backup run alerts no one (see REL-01).
  - Locally, `npm run db:rehearse-restore` on the audit database passed ([runtime](runtime/db-rehearse-restore.txt)). That is synthetic data on PostgreSQL 17; production runs 16.
- **Fix direction.** Before inviting: restore today's production backup into a scratch database with `db:qualify-backup`, using the SSM-escrowed keys (owner, or the agent with the owner's keys). Add failure alerting.

### ONB-02 — The recommended onboarding is the longest, most jargon-dense route (HIGH)
- **Walked at runtime** at 375 px ([w1b](runtime/walkthroughs/w1b.txt)–[w1e](runtime/walkthroughs/w1e.txt)):
  1. "A complete mega-mix · Recommended" is preselected.
  2. The review screen lists 5 preference groups.
  3. "Your pipeline is ready — All 13 Mixes… every Beat already written" shows 13 Start buttons.
  4. Add your first customer (a form whose "Save & schedule follow-up" schedules nothing; LOOP-01).
  5. Journey "Start this Mix".

  That is 7–8 taps after email verification, plus a form, before Today shows a follow-up.
- **By comparison**, the "one person, one follow-up" route took one form and one tap and showed "Your first follow-up for Chris Parker is ready" ([w2b](runtime/walkthroughs/w2b.txt)).
- **Fix direction.** Owner decision: recommend the one-person route to beta testers, or say in the welcome note which option to pick.

### DATA-02 — Re-starting a finished Mix silently does nothing (HIGH, INFERRED)
- **Evidence.** `src/lib/contact-mix-actions.ts:32-42` keeps the old assignment start date for a finished manual Mix. `src/lib/jump-engine.ts:459` then lays the Beats out in the past, and the notice still says "Follow-ups are being prepared". The Journey path resets the start date (`src/lib/journey.ts:52`).
- **Fix direction.** Restart from today, or ask for the start date, and state the result.

### DATA-03 — One unreadable date rejects a whole import row (HIGH)
- **Evidence.** Runtime ([e1](runtime/walkthroughs/e1.txt), [capture](captures/e1-import-review-1440-light.png)) with a 5-row Outlook-style CSV:
  - The wizard offered "Queue 1 valid row".
  - Ana (`0/0/00` birthday and anniversary), Bob (valid birthday, `0/0/00` anniversary), Cara (`31/12/1985`) and Dan (anniversary "TBD") all show "Will be reported as failed". Only Eve, with empty date cells, is clean.
  - Code: `src/lib/contact-import-mapping.ts:130-141,250-255`.
  - That Outlook writes `0/0/00` for empty dates is INFERRED from the format; no real Outlook file was used.
- **Fix direction.** Keep the row, drop the unreadable value, and list it as a warning.

### BOPS-04 — The owner's own device gate has never been run (HIGH, NOT RUN)
- **Evidence.**
  - `docs/CANONICAL_PRODUCT_DECISIONS.md:123`: "Release qualification includes iPhone Safari and Android Chrome handoffs before external launch."
  - `docs/MANUAL_DEVICE_QUALIFICATION.md:9-52`: every row is NOT RUN, and the steps point at the retired Netlify test site.
- **Fix direction.** One recorded pass per phone against production with a synthetic account: open text, email and call from Today; return to the app; record the outcome (owner).


## Details for the lead's runtime findings (no lane report)

### RUN-01 — The first onboarding screen says "Unsaved changes" before any input (MEDIUM, VERIFIED at runtime)
- **What the owner experiences.** Right after verifying their email, the first screen shows "Unsaved changes. Save before leaving this page." The owner has typed nothing. Leaving the page would ask for confirmation.
- **Reproduction.** Register from an invitation, open the verification link, and look at `/onboarding?verified=1` at 375 px ([w1a](runtime/walkthroughs/w1a.txt), [w1b](runtime/walkthroughs/w1b.txt)).
- **Evidence.**
  - `src/components/FormGuard.tsx:20-22`: the form is snapshotted at mount.
  - `src/components/MegaMixSetup.tsx:34`: `detectTimezone` then changes the timezone field, and the guard counts that as an owner edit.
- **Fix direction.** Snapshot after timezone detection, or leave the detected zone out of the comparison.

### RUN-02 — Saving a timing edit to a running plan goes through "Start this mix?" and is blocked (MEDIUM, VERIFIED at runtime)
- **What the owner experiences.** They change a Beat's time in a plan that is already running for a customer. The only save path is "Review and start", which opens "Start this mix?". "Start the mix" stays disabled with "Choose who gets this mix."
- **Reproduction.** Open `/mixes?mix=<starter>&view=edit` at 1440 px, then Beat options → More timing options → change the time → Review and start ([w2e](runtime/walkthroughs/w2e.txt), [capture](captures/w2-15b-review-sheet-1440-light.png)).
- **Evidence.** The dialog's buttons were "Keep editing" and a disabled "Start the mix", with the notice "Choose who gets this mix." The person on this plan was assigned from the contact page, not through an audience.
- **Fix direction.** For an active Mix, offer "Save changes" that keeps the current people, as the design guidelines' "explicit save" describes.

### RUN-03 — Quick Add cannot save a typical capture until the owner finds three hidden required fields (MEDIUM, VERIFIED at runtime)
- **What the owner experiences.** They type "Follow up with Sam Ortiz today about the kitchen quote", tap Continue, then "Save all 3". A native "Please fill out this field." bubble floats over the Save button, and nothing is saved. The missing fields are Follow-up time, "How to follow up" and Draft message, all below the visible part of the sheet.
- **Reproduction.** 390 px, Today → Quick Add → the text above → Continue → Save all 3 ([e3b](runtime/walkthroughs/e3b.txt), [capture](captures/e3b-quick-add-after-save-390-light.png)).
- **Evidence.**
  - `:invalid` fields at `top` 977, 1073 and 1165 px in an 844 px viewport ([e3c](runtime/walkthroughs/e3c.txt)).
  - Choosing "Call" removes the draft requirement.
  - The design guidelines' own rule is "Reveal invalid fields inside collapsed disclosures before browser validation focuses them."
- **Fix direction.** Scroll to and name the first missing field with an inline message. Default the method from the contact's saved phone or email.

### RUN-04 — Returning to the app masks the whole workspace with "Checking your account…" (MEDIUM, VERIFIED code and automation; human impact INFERRED)
- **What the owner experiences.** Every time the window regains focus or becomes visible, the workspace is hidden behind a modal "Checking your account…" until `/api/auth/browser-context` answers. This includes coming back from the phone's SMS or email app: the core loop's handoff, just before recording the outcome. On cellular, or during a slow production database connection, the wait is longer. If the check fails, the owner sees "Reconnect to continue".
- **Reproduction.** Keyboard only at 1440 px:
  - The overlay was visible at 48 of 80 Tab stops, and the Review button was never reached ([e6c](runtime/walkthroughs/e6c.txt)).
  - An earlier run captured it covering the page ([capture](captures/e6-keyboard-review-focus-1440-light.png)).
  - After a normal sign-in it clears in about 1 s ([e6b](runtime/walkthroughs/e6b.txt)).
- **Evidence.** `src/components/BrowserAccountBoundary.tsx`: `onFocus` calls `check()` on window `focus` and on `visibilitychange`, and `check()` masks by default (`hide()` → `showModal()`) before fetching.
- **Fix direction.** Skip the mask when the previous check is recent and the cross-tab change marker is unchanged. Keep the mask for a real account change, which is the privacy case the boundary exists for.

### TEST-03 — Four browser tests fail for test reasons (LOW, VERIFIED by reruns)
- **`journey-connections.spec.ts:310`** failed in the full desktop run. It passes alone and in its own file ([rerun-jc-alone](runtime/e2e/rerun-jc-alone.txt), [rerun-jc-file](runtime/e2e/rerun-jc-file.txt)). The C-1 record already notes it.
- **`admin-workflow-regressions.spec.ts:92`** passed 4 of 5 repeats and once more with capture on: a timing race ([rerun-awr-repeat5](runtime/e2e/rerun-awr-repeat5.txt)). The A2 record lists it as order-only.
- **`onboarding-invitations.spec.ts:60` (phone)** failed 4 of 4 ([rerun-oi-repeat4](runtime/e2e/rerun-oi-repeat4.txt)).
  - The failure screenshot shows the tapped card selected and no review sheet, so the test taps "Review" immediately after navigation, before the page is interactive.
  - By hand, the same tap opens the sheet at 412 px and with the exact Pixel 7 profile ([e8](runtime/walkthroughs/e8.txt), [e8b](runtime/walkthroughs/e8b.txt)).
  - The D release notes record it at 1 of 6 on the live build.
- **`staff-permissions.spec.ts:64`** failed 3 of 3 against CI's own staff-group configuration (`AUTH_REQUIRE_ADMIN_MFA=false`) and passed 6 of 6 for the whole file with MFA required, which is production's setting ([rerun-sp](runtime/e2e/rerun-sp.txt), [rerun-sp-mfa-on](runtime/e2e/rerun-sp-mfa-on.txt)). CI would fail here if its browser step ever reached this group.
- **Fix direction.** Wait for hydration in the phone test. Run the staff group with MFA, or make that one test's expectation depend on the flag.
