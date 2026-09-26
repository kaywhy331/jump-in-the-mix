# Lane 7 — Beta operations

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Lane verdict: GO WITH CONDITIONS.** The admission, invitation, suspension and pause machinery is sound, and it tells Kevin in the admin UI why an invitation cannot be sent. What is missing is the solo operator's side of the loop. Nothing reaches Kevin unless he opens `/admin`: no email for a new support ticket, and no outage alert because the independent monitor is not deployed (inferred). A beta user who turns on automatic email sends from Kevin's sender, uses Kevin's reply address and draws on Kevin's 70-per-day allowance, and their failed sends never show up in the admin UI. The owner's own device-qualification gate ("before inviting external customers") is entirely NOT RUN. None of this is data loss or a security hole. Every item has a zero-cost owner step or a small agent fix (see the checklist at the end). This lane does not block a small, hand-picked beta once the four HIGH items have a documented workaround.

Reviewed at production commit `4b5abd8` (checkout `/tmp/jitm-beta-audit-20260926`). Untracked files read: only the pricing section (§7, allowance table) of `assets/Jump_in_the_Mix_Brand_price_freatures.md` in the owner's checkout. I did not open the two Joanna Wiebe files. I also read non-secret release evidence JSON in the owner's git-ignored `.artifacts/` (no `*.private.*` files).

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| BOPS-01 | HIGH | VERIFIED | A new support ticket or customer reply notifies no one; Kevin learns of it only by opening `/admin` |
| BOPS-02 | HIGH | VERIFIED (code) / INFERRED (deployment) | No push alert for web, worker or backup failure; the Overview shows "Monitoring needs a check" permanently |
| BOPS-03 | HIGH | VERIFIED (code) / INFERRED (UX) | Automatic customer email goes out as Jump in the Mix, with Kevin's reply address and his shared 70/day allowance; failures are permanent and invisible to Kevin |
| BOPS-04 | HIGH | VERIFIED | The owner's own "before inviting external customers" device gate is entirely NOT RUN, and its steps target a retired test site |
| BOPS-05 | MEDIUM | VERIFIED | Raising capacity to invite one named person also releases an overdue weekly wave (up to 10 public waitlisters) within about a minute |
| BOPS-06 | MEDIUM | VERIFIED | Staff cannot invite a named person directly; the person must first join and confirm the public waitlist |
| BOPS-07 | MEDIUM | VERIFIED | Production `4b5abd8` sits outside the tagged, recorded and CI-checked chain, and its rollback steps live only in git-ignored scripts (prior PRO-F2 practice regressed; PRO-F3 still open) |
| BOPS-08 | MEDIUM | VERIFIED | If Kevin loses his authenticator and recovery codes, a solo operator has no recovery path |
| BOPS-09 | MEDIUM | VERIFIED | Beta testers are never told this is a beta, or that pricing and limits may change |
| BOPS-10 | MEDIUM | INFERRED | On a phone, support is More → last row → past a 21-question FAQ; there is no feedback entry on Today |
| BOPS-11 | MEDIUM | VERIFIED | Diagnosing one stuck tester takes three admin pages and still misses the verification-email outcome |
| BOPS-12 | LOW | VERIFIED | No operator path to honor a deletion request (suspended or locked-out users, third-party data) |
| BOPS-13 | LOW | VERIFIED | The canonical, admission and waitlist docs contradict the code on member invitations (five vs three, capacity-counted vs not, emailed vs sent from Today) |

## Flows traced

**Q1. Inviting one named person today: the platform path.** Person joins at `/waitlist` → `joinWaitlistFormAction` (`src/lib/waitlist-actions.ts:62`) → `processWaitlistSubmission` (`:23-54`; fails visibly if email is not configured) → `requestWaitlistEntry` (`src/lib/waitlist.ts:24-42`: `collectionPaused`, existing account or grant, suppression, 24 h token) → synchronous ACCESS_CONFIRMATION email (`waitlist-actions.ts:41-47`) → person presses Confirm (`confirmWaitlistAction` `:72-79` → `confirmWaitlistEntry` `waitlist.ts:44-63`) → Kevin signs in with TOTP → **Admin → Admission** sets limits with password, MFA under 10 min and a reason (`changeAdmissionPolicy` `src/lib/admission-admin.ts:9-37`) → **Admin → Waitlist → Waiting**: select, give a reason, send (`inviteWaitlistSelectionAction` `waitlist-admin-actions.ts:19-31` → `inviteSelectedWaitlistEntries` `waitlist.ts:94-110`: staff and MFA recheck, reconcile, whole-selection capacity check) → `grantWaitlistAccess` (`:75-92`) → encrypted outbox (`access-invitation-mail.ts:8-19`) → the worker pass every 60 s (`src/worker/index.ts:29,343-345`) → `deliverWaitlistInvitations` (`waitlist-delivery.ts:17-88`) → Resend (`transactional-email.ts:76-122`, budget `email-budget.ts:74-103`) → `/register?invite=` → `registerAction` (`auth-actions.ts:129`) → `createBusinessAccount` (`account-provisioning.ts:6-49`) → `claimInvitation` (`referral-access.ts:125-137`: `redemptionPaused`, recipient-email binding) → synchronous verification email (`auth-actions.ts:115-127`). Before the person can use the app, three emails must arrive and be clicked (confirm, invitation, verify).

**Q1b. The weekly wave.** Every worker pass calls `runDueWaitlistWave` (`waitlist.ts:116-141`). A due wave that does not fit capacity keeps its due date and retries every minute (`:126`).

**Q1c. Member referral (Kevin's own customer account, if he has one).** `sendSystemInviteAction` (`system-mix-actions.ts:20`) → `allocateAccessInvite` (`referral-access.ts:27-86`): only the pauses apply (`:59`), with a lifetime quota of **3** (`system-mix.ts:1`). `manualDelivery: true` (`:65`), so the link is sent from the member's own phone via Today and it is **not counted** by the ceilings (`admission.ts:30`).

**Q1. Gates that can stop the invitation, and whether Kevin sees them.**

| Gate | Effect | Visible to Kevin? |
|---|---|---|
| Limits 0/0, at capacity, or new invitations paused | Manual form disabled; wave deferred | Yes: Overview "New customer invitations are blocked" (`admin/page.tsx:64`), Admission readiness line (`admission/page.tsx:23`), Waitlist status line (`waitlist/page.tsx:47,65`) |
| New waitlist requests paused | The person cannot join ("New waitlist requests are paused") | Admission page only; not flagged on Overview |
| Email allowance used up | The person's join fails ("We couldn't submit that"); the invitation stays QUEUED until capacity frees | Only Waitlist → Delivery (status plus error text) and Admin → Email meter; no Overview flag |
| Sender rejected by the provider | Backoff retries, then REVIEW after 8 attempts (about 3 h) (`waitlist-delivery.ts:79-83`) | Yes, late: Overview "Invitation email needs review" (`admin/page.tsx:61`) |
| MFA not enrolled | `/admin` redirects to enrollment | Self-evident |
| Worker down | Invitation stays QUEUED indefinitely | Only "Last worker check-in" inside the collapsed "Wave schedule" disclosure (`waitlist/page.tsx:73-77`) and Operations; no Overview flag or push (BOPS-02) |
| Person unconfirmed, suppressed, or already granted | Cannot be selected, or skipped with a count | Yes (row context, skipped count) |

**Q2. Support.** Today → More (`more/page.tsx:19`, 8th row) → `/help`: 21-item FAQ (`help/page.tsx:77`), then the "Message support" form (`:79-89`) → `createSupportTicketAction` (`support-actions.ts:32-72`) → `createSupportTicketRecord` (`support-service.ts:43-85`: ticket, message and a workspace AuditLog row; **no notification of any kind**). Kevin sees it in Overview "Support is waiting on a reply" (`admin/page.tsx:27,67`) or `/admin/support`. His reply → `queueSupportReplyEmail` (`support-email-delivery.ts:33-55`) → the worker's `deliverSupportEmails` (`:128`) emails the requester. The public `/contact` page lists `PUBLIC_SUPPORT_EMAIL` (support@ → ImprovMX → Kevin's Gmail, per `privacy/page.tsx:12`). That is the only push channel to Kevin, and the in-app Help page does not show that address.

**Q3. What Kevin can see.** `/admin/users` shows setup complete or incomplete and "Last active" (`users/page.tsx:99`). `/admin/users/[id]` shows verified or unverified, sessions, and contact/Mix/follow-up counts (`users/[userId]/page.tsx:24,27`). Admin Reports give aggregate funnel counts only: created, verified, setup, contact, Mix, activated, D7/D30 (`admin-report-data.ts:9`). `/admin/audit` reads both `auditLog` and `platformAuditEvent`. `/admin/email` searches provider events by id, type or provider id only, not by recipient (`email/page.tsx:19`). Suppressions are searchable by email (`email/suppressions/page.tsx:15`). Conversion events are never collected: `PublicConversionEvents.tsx:22` only dispatches a browser `CustomEvent` and nothing listens (`docs/HOMEPAGE_CONVERSION_EVENTS.md:3`).

**Q4. Pause or remove a user.** `/admin/users/[id]` → `manageUserAccess` (`user-admin.ts:16-70`): suspend, restore or end sessions. It requires a password and MFA under 10 min. Suspension ends sessions, sign-in links and support views, turns automation and reminders off, revokes unused referrals and cancels their email, and writes an audit record. The emergency pauses are the four Admission switches plus the weekly-wave pause. Deletion is **self-service only**: the only caller of `deleteAccountData` is `account-deletion-actions.ts:43` (BOPS-12).

**Q5. Rollback.** `prod-*` tags on origin: 24, from `prod-2026-09-21-2d84258` to `prod-2026-09-25-929f779` (the 09-21 to 09-24 tags were created retroactively on 09-24). None exists for `4b5abd8`. Rollback chain from the records: `4b5abd8` → `929f779` (code-only; D release evidence `dfix-release.json`: `"migrationRequired":false`) → `34ffdae` → `f511984` → `f3a0a20` → `c17cc80`. Going below `f3a0a20` first needs `node .artifacts/market-live-20260924/b-reverse-phone-keys.mjs --confirm` (`AUDIT_RELEASE_B_2026-09-25.md:104`), which is git-ignored and exists only on TrixBot. `origin/main` = `4615ade`. PR #83 (to `a1f64aa`) is OPEN with mergeState UNSTABLE: `secret-history` failed at "Scan all fetched Git history", and `validate` was cancelled at "Browser-driven end-to-end tests" after 60 min. `gh run list --commit 4b5abd8…` returns `[]`.

**Q6. What testers are told.** Terms: "The current invitation release is free and requires no payment card… may pause"; "We may change features or temporarily limit access…"; "Keep an export" (`terms/page.tsx:10,14`). FAQ: "Joining the waitlist and creating your account are free" (`faq/page.tsx:29`). Help: "Support is best effort; there is no guaranteed reply time" (`help/page.tsx:83`). The backup notice comes from the `PUBLIC_BACKUP_RETENTION_NOTICE` env var (`privacy/page.tsx:16`). `git grep -i '\bbeta\b' -- src` returns nothing (BOPS-09).

**Q7. Owner steps from the release records.** See the "Owner steps" table under Questions for Kevin.

**Q8. Kevin's MFA.** Enrollment gives 10 one-time recovery codes (`docs/ADMIN_MFA.md:23,35`). Lost-device recovery requires "another authorized operator… reviewed administrative database operation" (`:37`). `bootstrapFirstOwner` refuses while an active owner exists (`src/lib/staff-bootstrap.ts:11`) (BOPS-08).

## Findings

### BOPS-01 — A new support ticket or customer reply notifies no one; Kevin learns of it only by opening `/admin`
- Severity: HIGH · Label: VERIFIED · Prior: none
- What the user experiences: a tester sends "Import lost my phone numbers" from Help and is told to "Check this conversation for responses" with no reply time. Kevin gets no email, no push and no alert. The ticket waits until he next opens Admin. For this ICP, a silent day ends the beta for that tester (INFERRED).
- Reproduction: 1. As a tester, open `/help` → Message support → submit. 2. Check Kevin's inbox (support@ → Gmail): nothing arrives. 3. Only `/admin` shows "Support is waiting on a reply".
- Evidence: `src/lib/support-service.ts:43-85` creates the ticket, message and `auditLog` row and returns, with no outbox or email. `support-email-delivery.ts:33` queues email only for staff replies. `operations-signals.ts:6-45` has no open-ticket signal. `admin/page.tsx:27,67` is pull-only.
- Root cause: support notifications were built for customers (staff reply → requester), not for staff.
- Fix direction: queue one email to `PUBLIC_SUPPORT_EMAIL` per new ticket or customer reply through the existing outbox and worker (no new service). Until then, Kevin checks `/admin` daily and testers are told to use support@ for urgent issues.
- Runtime check for the lead: on a local build with a synthetic account, create a ticket and confirm no `SupportEmailDelivery` or `EmailMessage` row is created.

### BOPS-02 — No push alert for web, worker or backup failure; the Overview shows "Monitoring needs a check" permanently
- Severity: HIGH · Label: VERIFIED (code) / INFERRED (not deployed) · Prior: none (ops lane may overlap)
- What the user experiences: if the worker stops, invitations stay queued, support replies, reminders and automatic sends stop, and follow-up preparation stalls. Testers see stale Today lists and nobody tells Kevin. His Overview carries the same "Monitoring needs a check · Current health is unconfirmed" item whether everything is fine or broken, which trains him to ignore it.
- Reproduction: 1. With the independent monitor absent, open `/admin`: the item is always present. 2. Stop the worker: `/api/health/worker` turns 503, the Overview does not change, and no email is sent.
- Evidence: alert delivery exists only through the independent monitor (`operations-alerts.ts:82-113`, `operations-notifications.ts:4-20`: `OPS_ALERT_WEBHOOK_URL`/SNS). `render.yaml:38-125` deploys web and worker only. The monitor is a separate paid Blueprint (`infra/operations/render-monitor.yaml`, "$7.25/month" in `docs/INDEPENDENT_MONITOR_DEPLOYMENT.md`), and the owner's Render resource list of 2026-09-25 has four resources (web, worker, backup cron, Postgres), so INFERRED not deployed. `admin/page.tsx:34-35,65`: `monitorStale` is true whenever no observation exists. `docs/OPERATIONS_READINESS.md`: "Alert independently on these endpoints."
- Root cause: alerting was designed around a monitor the lean hosting plan does not run.
- Fix direction (zero cost): point a free external uptime check, or an hourly GitHub Actions run of `scripts/production-smoke.mjs` (it already checks live, ready and worker), at Kevin's email, and turn on Render's own failure notifications. In code, show worker heartbeat age on the Overview and hide the monitor item when no monitor is configured.
- Runtime check for the lead: `GET https://jumpinthemix.com/api/health/monitor` (503 confirms no recent monitor observation), and `GET /api/health/worker` (200 expected).

### BOPS-03 — Automatic customer email goes out as Jump in the Mix, with Kevin's reply address and his shared 70/day allowance; failures are permanent and invisible to Kevin
- Severity: HIGH · Label: VERIFIED (code) / INFERRED (UX; production env values NOT RUN) · Prior: related to TOD-F1 (silent failure to the owner); the sender, reply-to and budget aspects are new
- What the user experiences: a plumber enables Settings → Sending → Email ("Available" in production because Resend is configured). The customer gets an email from the platform sender. When they reply "Tuesday works", the reply goes to `EMAIL_REPLY_TO`, a "monitored reply mailbox" (Kevin's), not to the plumber. The plumber misses the job, and Kevin receives third-party messages. A busy automatic Mix can use the 70 non-account emails per day. After that, the remaining automatic sends fail permanently, waitlist sign-ups fail ("We couldn't submit that"), and invitations and support replies wait up to 24 h. Kevin has no admin page for any of this. The public FAQ says automatic sending "needs a connected provider" (`faq/page.tsx:25`), but in production it needs nothing from the owner.
- Reproduction: 1. Synthetic account → `/settings/sending` → enable automatic Email → a Mix with a due email step to an inbox you control. 2. After the review window, inspect From and Reply-To. 3. Reply and see where it lands.
- Evidence: `automatic-delivery.ts:81-87` calls `sendTransactionalEmail` without `from` or `replyTo`, so `transactional-email.ts:36-38` falls back to `env.emailFrom`, `env.emailReplyTo` and category `PRODUCT`. `render.yaml:26-33` sets 90/day with a 20 reserve for account email. `email-budget.ts:91` gives every non-AUTH category, including ACCESS_CONFIRMATION (`waitlist-actions.ts:42`), the same 70. `automatic-delivery.ts:275-279` marks any error, including BUDGET, `FAILED` with no retry. `git grep -i automatedDelivery -- "src/app/(staff)"` returns 0 hits (no admin view). `docs/HOSTED_DEPLOYMENT.md:34`: `EMAIL_REPLY_TO` = "Monitored reply mailbox".
- Root cause: automatic delivery reuses the platform's transactional-email path unchanged.
- Fix direction: for the beta, decide to keep automatic email off, or set Reply-To to the owner's verified email and the From display name to the business before allowing it. Make BUDGET defer instead of fail, and list failed automatic sends per user in admin.
- Runtime check for the lead: step 1-3 above on production with a synthetic account (it sends one real email; lead's call), or read `EMAIL_FROM`/`EMAIL_REPLY_TO` with Kevin.

### BOPS-04 — The owner's own "before inviting external customers" device gate is entirely NOT RUN, and its steps target a retired test site
- Severity: HIGH · Label: VERIFIED · Prior: none (memory notes "devices NOT RUN" on every release)
- What the user experiences: the core loop ends in the phone's own composer (text, email, call) and a return tray. None of that has been checked on a physical iPhone or Android phone. The first beta testers become the device testers.
- Reproduction: open `docs/MANUAL_DEVICE_QUALIFICATION.md`: every row is `NOT RUN`.
- Evidence: `docs/CANONICAL_PRODUCT_DECISIONS.md:123`: "Release qualification includes iPhone Safari and Android Chrome handoffs before external launch". `docs/HOSTED_DEPLOYMENT.md` (Operations baseline): "Complete the physical iPhone and Android rows… before inviting external customers". `MANUAL_DEVICE_QUALIFICATION.md:9-48` are all NOT RUN, and `:52` says to run them "against the private test site", which no longer answers (`AUDIT_RELEASE_A2_2026-09-25.md:138`).
- Root cause: owner-only step, never scheduled.
- Fix direction: Kevin runs the core rows (navigation; SMS, email and call handoff plus return tray; keyboard overlap) on his own iPhone and an Android phone against production with a synthetic account. About 45 minutes; record the results. The agent updates the doc target.
- Runtime check for the lead: none (document state); the lead's Chromium phone runs are separate evidence.

### BOPS-05 — Raising capacity to invite one named person also releases an overdue weekly wave (up to 10 public waitlisters) within about a minute
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- What the user experiences (Kevin): he raises the limits to invite a friend. Before he reaches the Waitlist page, the worker has invited the 5 oldest plus 5 random confirmed strangers from the public waitlist. The schedule is not paused by default, and a wave deferred for lack of capacity stays due.
- Reproduction: 1. Admin → Waitlist → "Wave schedule" (collapsed) shows a past "Next wave". 2. Admin → Admission: raise the limits and save. 3. Within about 60 s, Waitlist → Waves shows a new wave.
- Evidence: `prisma/schema.prisma:821-826` has `paused @default(false)`. `waitlist.ts:121,126`: a due wave returns early while capacity is short and keeps `nextRunAt`. `worker/index.ts:29,343`: 60 s pass. The Admission page mentions waves only inside the collapsed "Capacity and wave rules" disclosure (`admission/page.tsx:42`). The impact preview lists no wave effect (`AdmissionImpactPreview.tsx:18-25`). The owner's 09-16 notes (`.artifacts/admission-owner-save-2026-09-16/OBSERVED_RESULT.md`) already warned that saving 1/1 could let the wave invite the one confirmed person. Production now holds 1 grant and 1 invitation delivery; whether a wave or a manual send created it was not observed.
- Root cause: the design treats waves as the default admission path; the UI does not show the interaction at the moment of saving.
- Fix direction: add "An overdue wave of N will be sent within a minute" to the impact preview. Operationally: pause weekly waves before raising limits if hand-picking.
- Runtime check for the lead: none (Kevin reads the "Next wave" date before saving).

### BOPS-06 — Staff cannot invite a named person directly; the person must first join and confirm the public waitlist
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- What the user experiences: to onboard a known plumber, Kevin must get them to join the waitlist and click a 24-hour confirmation email before he can select them, and then two more emails follow. Kevin's alternative is his own member account's 3 lifetime personal invitations (manual send from Today), which requires him to have a customer workspace.
- Evidence: grants are created only in `referral-access.ts:63` (member) and `waitlist.ts:79` (from a confirmed waitlist entry). `access-admin-actions.ts:14-48` does revoke or retry only. `ACCESS_SOURCES` has no staff-direct source (`admin-access-presentation.ts:1`).
- Fix direction: an "Invite by email" admin action that creates a confirmed entry and a manual grant in one locked transaction (same capacity rules, audited).
- Runtime check for the lead: none needed.

### BOPS-07 — Production `4b5abd8` sits outside the tagged, recorded and CI-checked chain, and its rollback steps live only in git-ignored scripts
- Severity: MEDIUM · Label: VERIFIED · Prior: PRO-F2 (tag-every-deploy practice regressed), PRO-F3 and PRO-F1 still open
- What the user experiences (Kevin, at night, TrixBot unavailable): the live commit has no tag or record, and the record the release evidence points to (`docs/AUDIT_LEFTOVERS_2026-09-25.md`) exists nowhere. It is reachable only through branch `fix/audit-leftovers-20260925`. The fastest rollback (Render: redeploy `929f779` to web, then worker) is written down nowhere for him in the repository.
- Evidence: `git ls-remote --tags origin 'prod-*'` stops at `prod-2026-09-25-929f779`. `git ls-remote origin` shows `4b5abd8` only on `refs/heads/fix/audit-leftovers-20260925`. `gh run list --commit 4b5abd8…` returns `[]`. PR #83 checks: `secret-history` failure, `validate` cancelled. `.gitignore:26` has `.artifacts/`. The D pipeline is `.artifacts/market-live-20260924/dfix-*.mjs`, and `b-reverse-phone-keys.mjs` is local only.
- Fix direction: tag `4b5abd8`, write its record, point PR #83 at production and resolve its checks. Commit the pipeline without secrets, plus a one-page phone-friendly "Roll back from the Render dashboard" note.
- Runtime check for the lead: none needed.

### BOPS-08 — If Kevin loses his authenticator and recovery codes, a solo operator has no recovery path
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- What the user experiences (Kevin): locked out of all of `/admin` (support, waitlist, suspension). The documented fix needs a second operator. The bootstrap script refuses, and no reset script exists. Recovery would be a hand-written database write through a Render shell.
- Evidence: `docs/ADMIN_MFA.md:37`. `staff-bootstrap.ts:11`: "An active owner already exists". `git grep adminMfaCredential.delete -- src scripts` finds only account deletion and the e2e seeder.
- Fix direction: Kevin confirms the 10 codes are in his password manager. The agent adds an audited break-glass CLI that clears one staff member's MFA credential (owner DB role, Render shell), plus a runbook.
- Runtime check for the lead: none needed.

### BOPS-09 — Beta testers are never told this is a beta, or that pricing and limits may change
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- What the user experiences: every surface says "free, no card" (`PublicLanding.tsx:25`, `faq/page.tsx:29`, `register/page.tsx:58`, invitation email `waitlist.ts:86`). Nothing says beta, early, or that paid plans may come. The canonical doc says "free beta… Stripe is planned… pricing… undecided" (`CANONICAL_PRODUCT_DECISIONS.md:85`), and the owner's proposed catalog caps Free at 3 active Mixes and 100 people with follow-up enabled. None of the copy is false today, but a later limit would contradict what testers were told at sign-up.
- Evidence: `git grep -n -i "\bbeta\b" -- src` returns no output. `terms/page.tsx:10`: "The current invitation release is free".
- Fix direction: an owner decision on one sentence in the Terms, FAQ and invitation email, for example "free during the beta; we'll give notice before any paid plan or limit". Also decide the legal operator name (the Terms render `PUBLIC_OPERATOR_NAME`).
- Runtime check for the lead: GET `/`, `/faq`, `/terms`; confirm there is no beta or early-access wording.

### BOPS-10 — On a phone, support is More → last row → past a 21-question FAQ; there is no feedback entry on Today
- Severity: MEDIUM · Label: INFERRED · Prior: none
- What the user experiences: from Today, tap More, scroll to Help (8th destination), then scroll past the search, the filter and 21 collapsed questions to reach "Message support". There is no "Send feedback" or "Report a problem" affordance on Today or at the top of Help.
- Evidence: `Nav.tsx:8-15` (no Help on the phone bar). `more/page.tsx:11-20` (Help is last). `help/page.tsx:70,76-79` (top actions are My conversations, Getting started and Journey; `SupportFaq` precedes `#contact-support`). `support-content.ts` has 21 `question:` entries.
- Fix direction: a "Message support" link at the top of Help, and a small "Feedback" entry on More or in the Today overflow.
- Runtime check for the lead: 390×844, signed in: from `/jumps` tap More and note whether Help is above the fold; on `/help` measure the y-offset of the "Message support" heading.

### BOPS-11 — Diagnosing one stuck tester takes three admin pages and still misses the verification-email outcome
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- What the user experiences (Kevin): a tester says "I never got the email". The user page shows "Email unverified" but not whether the email was sent, accepted or bounced. Setup state is only on the list page, not the detail page. There is no staff resend. Provider events cannot be searched by address.
- Evidence: `users/[userId]/page.tsx:24,27` (verified flag and counts only). `users/page.tsx:99` (setup and last active appear only in the list). `email/page.tsx:19` (search by id, type or providerId). `transactional-email.ts:47` and the `EmailMessage` ledger store only a keyed recipient hash. Only suppressions are searchable by email (`email/suppressions/page.tsx:15`).
- Fix direction: on the user detail page, show setup state, the last AUTH email status for that address (look up by the HMAC the ledger already uses), and failed automatic sends.
- Runtime check for the lead: none needed.

### BOPS-12 — No operator path to honor a deletion request (suspended or locked-out users, third-party data)
- Severity: LOW · Label: VERIFIED · Prior: related to ACC-F1 (fixed in Release A)
- What the user experiences: a suspended user cannot sign in (`auth.ts:52-53`) and so cannot self-delete. A plumber's customer who asks to be removed can only be referred to that plumber. The Privacy page invites such requests at `privacy/page.tsx:15`.
- Evidence: `user-admin.ts:14` (operations are suspend, restore and revoke sessions only). The only caller of `deleteAccountData` is `account-deletion-actions.ts:43`, and no script calls it.
- Fix direction: an operator CLI wrapping `deleteAccountData` for verified requests (run in a Render shell), plus a written procedure.
- Runtime check for the lead: none needed.

### BOPS-13 — The canonical, admission and waitlist docs contradict the code on member invitations
- Severity: LOW · Label: VERIFIED · Prior: none
- What the user experiences (Kevin): the doc that says "this file wins" promises five lifetime invitations and capacity-bound grants. The product gives three (owner-reviewed 09-18, `docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md:10`), prepared in Today and not counted by ceilings. The Admission page states this correctly. Anyone planning from the docs will over- or under-estimate growth: each tester can add 3 accounts regardless of the ceiling unless member referrals are paused.
- Evidence: `CANONICAL_PRODUCT_DECISIONS.md:12,135,149`, `ADMISSION_CONTROLS.md:21`, `WAITLIST_OPERATIONS.md:18-19,52` vs `system-mix.ts:1`, `referral-access.ts:57,65`, `admission.ts:30` and `admission/page.tsx:40`.
- Fix direction: update the three docs to the code.
- Runtime check for the lead: none needed.

## What holds up

- The admission service fails closed at 0/0 and gives a specific reason for each blocked state (`admission.ts:9-12,36-49`). Every allocation and redemption shares `lockAccess`. Changes require a password, MFA under 10 minutes, a reason and a revision check, and are audited (`admission-admin.ts:22-35`).
- Manual invitations recheck staff session and MFA inside the lock, check capacity for the whole selection, skip ineligible entries, and report queued and skipped counts (`waitlist.ts:94-110`, `waitlist/page.tsx:61`).
- The invitation outbox is frozen and encrypted, uses leases and backoff, sends to REVIEW after 8 attempts with a 23 h safe retry, cancels on revoke, suppression or acceptance, and defers on budget without burning attempts (`waitlist-delivery.ts:17-88`).
- Five independent pauses with explicit effects (`referral-access.ts:59,132`, `waitlist.ts:29`, `waitlist-admin-actions.ts:33-53`). Suspension is thorough and audited (`user-admin.ts:48-68`).
- Support replies go to the requester through the outbox, with recovery tools (`support-email-delivery.ts`). Tickets are rate-limited, and the retention notice is shown (`support-actions.ts:46-55`, `help/page.tsx:83`).
- The Users list separates first-use setup from last activity (`users/page.tsx:99`). Reports define activation strictly: setup plus an owner-recorded completion (`docs/ADMIN_REPORTS.md:13`).
- Every release from 09-21 to 929f779 is tagged on origin. The records name the rollback target and the one special step (Release B's phone-key reversal). A tracked, read-only `scripts/production-smoke.mjs` exists (partly addresses prior PRO-F6).
- `/api/health/worker` returns 503 on a stale heartbeat, ready for a free external checker.
- The invitation count "three" is consistent across the app, Terms, FAQ and register page (`system-mix.ts:1`, `terms/page.tsx:10`, `faq/page.tsx:30`, `register/page.tsx:41`). `security.txt` lists support@ as a fallback to the pending security@ alias.

## Test coverage for this lane

- Admission: `tests/admission.integration.test.ts`, `tests/admission-draft.test.ts`, `e2e/admission-controls.spec.ts`, `e2e/admission-mfa.spec.ts` (includes the "one wave after delay" cadence).
- Waitlist and manual: `tests/waitlist.integration.test.ts`, `waitlist-actions.test.ts`, `waitlist-authorization.integration.test.ts`, `waitlist-mail.test.ts`, `e2e/waitlist.spec.ts`, `e2e/waitlist-admin.spec.ts`.
- Referral: `tests/referral-access(.integration).test.ts`, `system-mix-*.test.ts`, `e2e/system-mix-administration.spec.ts`, `e2e/onboarding-invitations.spec.ts`. Registration: `e2e/registration.spec.ts`, `tests/social-auth-invitation.integration.test.ts`.
- Support: `tests/support-service.integration.test.ts`, `support-email*.test.ts`, `e2e/support-cases.spec.ts`, `e2e/support-email.spec.ts`. Users: `tests/user-admin.integration.test.ts`, `e2e/user-administration.spec.ts`. Reports: `tests/admin-reports.integration.test.ts`, `report-storage.integration.test.ts`, `e2e/admin-reports.spec.ts`. Alerts: `tests/operational-alerts.integration.test.ts`, `operations-monitor*.test.ts`. MFA: `tests/admin-mfa*.test.ts`.
- **No test**: staff notification on a new ticket (the feature does not exist); automatic-email From, Reply-To and budget-exhaustion behaviour (`tests/automatic-delivery.test.ts` covers eligibility only); a real-inbox invite of a named person; the rollback procedure; MFA lost-device recovery; the "raise capacity releases an overdue wave" interaction as seen in the UI.

## NOT RUN

- Production admission values, wave schedule (paused or next date), confirmed-waitlist count, and whether Kevin has a customer workspace. These need Kevin's admin session. The owner's 09-26 release evidence shows 2 users, 1 workspace, 1 grant and 1 invitation delivery. The 09-16 evidence showed 0/0 with waves unpaused.
- `EMAIL_FROM`/`EMAIL_REPLY_TO` values, and whether a monitor or AWS uptime stack exists: env and infrastructure reads, owner only.
- ImprovMX MX and the security@ alias: DNS lookups are not in this lane's permission; the lead can `dig MX jumpinthemix.com`.
- The live `PUBLIC_BACKUP_RETENTION_NOTICE` text: the lead can GET `/privacy`.
- Whether Render's Rollback button is offered for these instance types, and Render notification settings: dashboard only.
- All device rows (BOPS-04): physical phones.

## Questions for Kevin

1. Beta intake: hand-picked only (pause weekly waves and member referrals first), or keep weekly waves on? What total and outstanding limits?
2. Do you want an "Invite by email" admin action for named testers (BOPS-06), or will you use the waitlist path or your own 3 personal invitations?
3. Automatic customer email during the beta: keep it off and tell testers, or first make replies go to the owner (BOPS-03)?
4. Beta and pricing wording (BOPS-09), and the legal operator name the Terms show.
5. Are your 10 MFA recovery codes stored? Do you want a break-glass reset script (BOPS-08)?
6. Is a free uptime check or an hourly GitHub Actions smoke acceptable for alerts (BOPS-02)? Do you want an email to support@ per new ticket (BOPS-01)?
7. For the beta, is handling deletion requests for suspended users or third-party data manually acceptable (BOPS-12)?

**Owner steps from the release records:**

| Step | Blocks inviting outside users? |
|---|---|
| Device qualification (`MANUAL_DEVICE_QUALIFICATION.md`) | **Yes**, per the canonical doc and HOSTED_DEPLOYMENT (BOPS-04) |
| security@ alias in ImprovMX | No: support@ is the fallback in `security.txt` and on the Security page (2-minute fix; LOW) |
| Google/Apple provider apps | No: optional; buttons stay hidden until configured; email and password work |
| Worker 300 s shutdown delay | No: parked |

## Beta-launch checklist (draft)

**OWNER (only Kevin):**
1. Run the core iPhone Safari and Android Chrome rows against production with a synthetic account, and record them (BOPS-04; `CANONICAL…:123`).
2. Decide the intake policy. If hand-picking: Admin → Waitlist → Wave schedule → **Pause weekly waves** *before* raising limits (BOPS-05; `waitlist.ts:121-126`). Then Admin → Admission: set the limits, and decide whether to pause member referrals (BOPS-13; `admission.ts:30`).
3. Confirm the MFA recovery codes (and Render and GitHub 2FA recovery) are stored (BOPS-08; `ADMIN_MFA.md:37`).
4. Admin → Team: grant yourself `support.view_customer` so you can open case-scoped views of a stuck tester (Owner default excludes it, `admin-permissions.ts:32`).
5. Turn on a zero-cost alert: Render failure notifications and a free uptime check on `/api/health/ready` and `/api/health/worker` (BOPS-02).
6. Set the automatic-email policy for the beta and tell testers (BOPS-03). Approve the beta and pricing sentence and the operator name (BOPS-09).
7. Commit to a daily `/admin` check. Send each tester a personal welcome that includes support@ and the expectations (BOPS-01, BOPS-10).
8. Know the rollback: Render → web, then worker → redeploy `929f779` (BOPS-07). Add the security@ alias in ImprovMX (release B, owner step 2).

**AGENT (after Kevin's go):**
1. Record and tag `4b5abd8`. Retarget PR #83 to production and fix its `secret-history` and `validate` failures. Commit the release and rollback scripts without secrets, plus a phone-friendly rollback note (BOPS-07; PRO-F2/F3).
2. Email support@ on each new ticket or customer reply through the existing outbox (BOPS-01).
3. Overview: show worker heartbeat age and drop the permanent monitor item when no monitor is configured. Optionally add an hourly GitHub Actions `production-smoke` (BOPS-02).
4. Automatic email: Reply-To set to the owner, From name set to the business, BUDGET deferred instead of failed, failed automatic sends listed per user in admin (BOPS-03, with TOD-F1).
5. Admission impact preview: warn about an overdue wave (BOPS-05). Optional "Invite by email" action (BOPS-06).
6. User detail page: setup state, last account-email status, failed automatic sends (BOPS-11).
7. Break-glass MFA reset CLI and an operator deletion CLI, both audited (BOPS-08, BOPS-12).
8. Help: "Message support" link at the top; a feedback entry on More (BOPS-10).
9. Docs: bring the canonical, admission and waitlist invitation rules in line with the code; point the device doc at production with a synthetic account (BOPS-13, BOPS-04).
