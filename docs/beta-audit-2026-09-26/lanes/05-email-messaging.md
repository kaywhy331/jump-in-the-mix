# Lane 5 — Email and messaging

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Lane verdict: GO WITH CONDITIONS.** Nothing in this lane stops a beta user from signing up. The sending domain
authenticates: SPF passes through Resend's `send.jumpinthemix.com`, the DKIM record is `resend._domainkey`, and DMARC
is published. Account emails are short and correct, their links are built from `APP_URL`, and they have a protected
reserve in the daily allowance. Today's text, email and WhatsApp handoff links are built correctly.

**One condition before inviting:** automatic email to an owner's customers is opt-in, but the settings page shows it as
"Available". It sends from Jump in the Mix's own address, and customer replies go to the operator's mailbox instead of
the plumber. The email names no business and has no opt-out (MSG-01). Either turn automatic email off for the beta or
fix the sender, reply address and footer.

**Before inviting, also:**
- Send the verification email and the invitation email to seed inboxes at Gmail, Outlook, iCloud and Yahoo. Nobody has
  done this yet (NOT RUN).
- Pace the invitation waves while Kevin watches Admin → Email.

The other findings are MEDIUM and can be fixed during a small, paced beta.

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| MSG-01 | HIGH | VERIFIED (code) / INFERRED (experience) | Automatic customer emails go out as Jump in the Mix; customer replies reach the operator's mailbox, not the owner; no business identity or opt-out |
| MSG-02 | MEDIUM | VERIFIED | Today mislabels automatic-email failures: a timed-out (possibly delivered) send and the app's own daily cap both read "the provider rejected it. Send it yourself." |
| MSG-03 | MEDIUM | VERIFIED (paths) / INFERRED (capacity) | Invitations, digests and every automatic customer email share one allowance of 90 a day (70 once the account reserve is set aside). When it fills, automatic emails are dropped for good and digests are dropped after 3 minutes. |
| MSG-04 | MEDIUM | VERIFIED (code) / INFERRED (UX) | Once an address is suppressed, it never gets verification, sign-in or reset email again. The page still says "try again", and nothing alerts Kevin. |
| MSG-05 | MEDIUM | VERIFIED (code) / INFERRED (provider effect) | The public waitlist form has no bot guard. Anyone can send 10 confirmations an hour per IP to invented addresses, which spends the shared allowance and causes bounces on the only sending domain. |
| MSG-06 | MEDIUM | VERIFIED | No email carries a List-Unsubscribe header. Digests, weekly reports and automatic customer emails have no stop or manage link. |
| MSG-07 | MEDIUM | VERIFIED (links) / NOT RUN (devices) | "Ask for a review", the contact page, Calendar and the referral share still build links from the number as typed, and the review/referral text links use `?body=` |
| MSG-08 | LOW | VERIFIED | DMARC is `p=none` with no reporting address; the DKIM key is 1024-bit |
| MSG-09 | LOW | VERIFIED (code) / NOT RUN (env) | Push reminders fall back to `EMAIL_FROM` as the VAPID subject, which web-push rejects |
| MSG-10 | LOW | VERIFIED | Email copy gaps: the password-changed email links to a signed-in page, several emails lack "ignore if you didn't ask", the digest says "Good morning" at any hour, invitations don't say why they were sent, and no email has a postal address |
| MSG-11 | LOW | VERIFIED | Still open (prior OPS-F14): the waitlist, report, stop-invitation and test-reminder emails still make up to three 15-second attempts inside the request |

## Evidence: public DNS lookups (verbatim)

These were run on 2026-09-26 from TrixBot. Nothing else was fetched from the network.

```
$ dig +short TXT jumpinthemix.com
"v=spf1 include:spf.improvmx.com ~all"
$ dig +short MX jumpinthemix.com
10 mx1.improvmx.com.
20 mx2.improvmx.com.
$ dig +short TXT _dmarc.jumpinthemix.com
"v=DMARC1; p=none;"
$ dig +short TXT resend._domainkey.jumpinthemix.com
"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCxtKTnYcB67NsGDBNsgBWyzXSwY62lyKKPLm7jEmdWmMVNwsGL5L/d2n9MqWZK1uvGX2cep6propGkOZZgsOc+OQN75fm0VvDjZDZe5n2+GUKMLBC92UvuFRX//Ijugno6Bvuru7+NxNP+CfQSnDEEwtSlEvroMaFK4CdlsXjsOQIDAQAB"
$ dig +short MX send.jumpinthemix.com
10 feedback-smtp.us-east-1.amazonses.com.
$ dig +short TXT send.jumpinthemix.com
"v=spf1 include:amazonses.com ~all"
$ dig +short TXT spf.improvmx.com
"v=spf1 ip4:195.154.155.118 ip6:2001:bc8:1200:1b::/64 ip4:51.158.91.128/28 ip4:131.153.154.96/29 ip4:103.67.202.112/29 ip4:204.74.232.218 ip4:209.205.118.79 ip4:209.205.118.80/30 ip4:209.205.118.84/31 ip4:209.205.118.86 -all"
$ dig +short TXT amazonses.com
"google-site-verification=aOJq8aXEtCO23r176f6iOTGt-RVuPv81XPtBuIzRTx0"
"mailru-verification: 71ab435de908d6ed"
"v=spf1 ip4:199.255.192.0/22 ip4:199.127.232.0/22 ip4:54.240.0.0/18 ip4:69.169.224.0/20 ip4:23.249.208.0/20 ip4:23.251.224.0/19 ip4:76.223.176.0/20 ip4:54.240.64.0/18 ip4:76.223.128.0/19 ip4:216.221.160.0/19 ip4:206.55.144.0/20 ip4:24.110.64.0/18 " "ip4:98.77.0.0/16 -all"
"yahoo-verification-key=OL6T0cZm2ykeymVyCj7mnvnTL3zAtLwrRXGAgBFtvFw="
$ dig +short TXT _dmarc.send.jumpinthemix.com
(empty)
$ dig +short TXT resend._domainkey.send.jumpinthemix.com
(empty)
$ node -e '<decode the DKIM p= value with crypto.createPublicKey>'
rsa 1024 bits
```

**Reading of the DNS**
- **Sending domain.** Release B says `EMAIL_FROM` is an address at `jumpinthemix.com`
  (`docs/AUDIT_RELEASE_B_2026-09-25.md:120`). Production environment values are not visible to this lane, so the exact
  sender is INFERRED.
- **Where the mail leaves from.** Resend sends through Amazon SES with the bounce domain `send.jumpinthemix.com`. That
  domain has both the SPF record and the bounce MX. SPF passes there.
- **DMARC alignment.** Alignment is relaxed by default, so the SPF result aligns with a `@jumpinthemix.com` From. DKIM is
  signed as `d=jumpinthemix.com` with selector `resend`. That the signature aligns is INFERRED from Resend's standard
  setup, because no received message headers were available.
- **SPF lookups.** The root domain's SPF uses 1 DNS lookup (ImprovMX's record is plain addresses) and the send
  subdomain's uses 1. Both are far under the 10-lookup limit. The root domain's `~all` covers ImprovMX only, which is
  fine because Resend's mail passes SPF on the subdomain.
- **Inbound mail.** The MX records point at ImprovMX, which forwards `support@` and `hello@` to the operator's Gmail
  (`docs/PRODUCTION_LAUNCH_PLAN.md:24`). DNS cannot show whether ImprovMX aliases exist; the `security@` alias was an
  open owner step in Release B (`docs/AUDIT_RELEASE_B_2026-09-25.md:111`).
- **Gmail and Yahoo sender rules (2024 onward).** For all senders, the requirements are SPF or DKIM, correct reverse
  DNS, TLS and a low spam rate. The DNS side is met. The spam rate is unknown (NOT RUN).
  - The stricter bulk-sender rules (SPF and DKIM, DMARC of at least `p=none`, alignment) are also met on DNS.
  - One-click unsubscribe is missing (MSG-06). Gmail requires it only above about 5,000 messages a day, which this
    product is nowhere near (INFERRED).
  - Nothing in DNS alone would push verification or invitation mail to spam. The live risks are elsewhere: a new
    domain with no history, complaints about customer-facing automatic mail (MSG-01, MSG-06), and bounces from form
    spam (MSG-05).

## Every email the product sends (inventory)

Every email goes out as `From: EMAIL_FROM` and `Reply-To: EMAIL_REPLY_TO` (or no Reply-To when that is blank), through
`sendTransactionalEmail` (`src/lib/transactional-email.ts:34-38,76-122`). No email carries custom headers.

| Email (category) | Trigger | Subject | Parts | Link target | Expiry stated | Footer / stop |
|---|---|---|---|---|---|---|
| Verify email (AUTH) | register, resend, email correction (`auth-actions.ts:115-126`) | "Verify your Jump in the Mix email" | text + branded HTML (`auth-email.ts:10-21,23-33`) | `APP_URL/api/auth/verify-email?token=` | "expires in 24 hours and can be used once" | fallback link only; no "ignore if not you" |
| Password reset (AUTH) | `/forgot-password` (`auth-actions.ts:413-440`) | "Reset your Jump in the Mix password" | same frame (`auth-email.ts:35-45`) | `APP_URL/reset-password?token=` (form, POST) | 60 minutes | same |
| Password changed (AUTH) | reset or change (`auth-actions.ts:475,503`, fire-and-forget) | "Your Jump in the Mix password changed" | same frame (`auth-email.ts:47-57`) | `APP_URL/account` | n/a | see MSG-10 |
| Sign-in link (AUTH) | `/login` "Email me…" (`auth-actions.ts:245-270`) | "Sign in to Jump in the Mix" | same frame (`auth-email.ts:59-71`) | `APP_URL/api/auth/magic?token=&next=`, then a confirm page | 15 minutes | same |
| Waitlist confirmation (ACCESS_CONFIRMATION) | `/waitlist` form (`waitlist-actions.ts:36-48`) | "Confirm your Jump in the Mix waitlist request" | text + bare `<p>` HTML | `APP_URL/waitlist/confirm?token=` (POST) | 24 hours | "ignore if you didn't request"; untokenized `/waitlist/leave` link |
| Waitlist invitation (INVITATION) | weekly wave or staff manual (`waitlist.ts:75-92,116-140`) | "Your invitation to Jump in the Mix" | text + bare HTML (`waitlist.ts:86-87`) | `APP_URL/register?invite=` | "can be used once" (no expiry, which is accurate) | tokenized stop link (`access-invitation-mail.ts:13-14`) |
| Staff invitation (INVITATION) | Admin → Team (`staff-invitations.ts:35-68`) | "Your Jump in the Mix staff invitation" | text + bare HTML | `APP_URL/staff/accept?token=` | exact UTC expiry | tokenized stop link |
| Stop-invitations confirm (AUTH) | `/waitlist/leave` (`invitation-preference-actions.ts:16-36`) | "Manage your Jump in the Mix invitation emails" | text + HTML | `APP_URL/waitlist/leave?token=` (POST) | 90 days | "ignore if you didn't request" |
| Daily digest (PRODUCT) | worker, at the owner's chosen hour, opt-in (`notification-delivery.ts:149-183,198-240`) | e.g. "3 people to reach today" | text + bare HTML | `APP_URL/jumps` | n/a | none (MSG-06) |
| Weekly report (PRODUCT) | worker, Mondays, opt-in (`:267-306`) | "Your week at {company}" | text + bare HTML | `APP_URL/jumps` | n/a | none |
| Test reminder (PRODUCT) | Settings → Notifications (`notification-actions.ts:97-113`) | "Test reminder: …" | digest body | `APP_URL/jumps` | n/a | none |
| Support reply (PRODUCT) | staff reply, sent from the outbox (`support-email-delivery.ts:33-55,128-144`) | "Jump in the Mix Response · {ref} · {title}" | text + branded HTML (`support-email.ts:23-86`) | `APP_URL/account/tickets/{id}` | n/a | "Jump in the Mix Support / concerns ticket X" |
| Marketplace: to the author, a share was reported or staff replied (PRODUCT) | report or staff decision (`marketplace-service.ts:359-371,476-488`) | "Your shared Mix was reported" / "…is back on the Marketplace" | text + bare HTML | `APP_URL/marketplace?section=mine&item=…` | n/a | none |
| Marketplace: to staff owners, a report or review request (PRODUCT) | same (`:345-357,462-474`) | "Community share reported: …" / "Another review requested: …" | text + bare HTML | `APP_URL/admin/marketplace` | n/a | none |
| **Automatic follow-up to the owner's customer (PRODUCT)** | worker after the review window, opt-in (`automatic-delivery.ts:72-89`) | the Mix step's subject, or "A note from {company}" | the owner's text as `text`, plus a pre-wrapped `<div>` | whatever the owner's text contains | n/a | **none; sender and Reply-To are the platform's (MSG-01)** |
| Member-to-friend invitation | **not emailed by the platform.** It is prepared as a Today reminder for the member to send from their own app (`referral-access.ts:60-86`, `manualDelivery: true`) | — | — | `APP_URL/register?invite=` | "can create one account" | none (sent by the member personally) |

**How these read to a plumber:**
- The account emails are short, plain and correct.
- The invitation is plain but clear.
- The weekly report uses light jargon ("conversations connected", "review-link visits").
- The automatic customer email is the problem (MSG-01).

## Flows traced

1. **Registration and verification.** Trace: `/register` → `registerAction` (`auth-actions.ts:128-200`) →
   `deliverVerification` (`:115-126`) → the per-address daily cap `authEmailLimitReached` (`email-budget.ts:56`) →
   `withEmailAttempts(1, sendVerificationEmail)` (`auth-email.ts:23-33`) → `sendTransactionalEmail`
   (`transactional-email.ts:76-122`) → `reserveEmailAttempt` (advisory lock, then the suppression check, then the
   budget check; `email-budget.ts:74-102`) → `POST api.resend.com/emails` with an `Idempotency-Key` →
   `recordEmailAcceptance` (`email-events.ts:32-41`) → `/verify-email/pending?registered=1[&delivery=failed]`
   (`verify-email/pending/page.tsx:37-39`). The link opens `GET /api/auth/verify-email` (`route.ts:28-90`), which
   creates the session and lands on `/onboarding?verified=1`.
2. **Resending the link and correcting the email.** Resend: `resendVerificationAction` (`auth-actions.ts:310-329`).
   Email correction for text invitees: `changeUnverifiedEmailAction` (`:344-410`).
3. **Sign-in link.** `requestMagicLinkAction` (`auth-actions.ts:245-270`) → `sendMagicLoginEmail` →
   `/api/auth/magic` → a confirm page (Release A2).
4. **Password reset.** `requestPasswordResetAction` (`auth-actions.ts:413-440`) → the `/reset-password` form (POST) →
   the password-changed email, sent without waiting (`:475`).
5. **Waitlist.** `joinWaitlistFormAction` (`waitlist-actions.ts:59-67`) → `processWaitlistSubmission` (`:23-53`) →
   `requestWaitlistEntry` (`waitlist.ts:24-41`) → the confirmation email → `/waitlist/confirm` (POST).
6. **Invitations (waves and staff-selected).**
   - Grants: `runDueWaitlistWave` or `inviteSelectedWaitlistEntries` (`waitlist.ts:94-140`) → `grantWaitlistAccess`
     (`:75-92`) → `queueAccessInvitation` writes to the encrypted outbox (`access-invitation-mail.ts:8-19`).
   - Delivery: the worker runs `deliverWaitlistInvitations` every 60 s (`worker/index.ts:29,342-347`;
     `waitlist-delivery.ts:17-88`).
   - On failure (`:68-75`): BUDGET puts the invitation back in the queue until `retryAt`; SUPPRESSED cancels it;
     REVIEW and MISMATCH send it to staff review; other failures back off and retry.
7. **Member invitation.** `referral-access.ts:60-86` creates a `manualDelivery` follow-up on Today, and the member
   sends it from their own app. The platform sends no email.
8. **Stopping invitations.** `/waitlist/leave` → `requestStopInvitationsAction` (`invitation-preference-actions.ts:16-36`)
   → the POST `stopInvitationsAction` → `stopInvitationEmails` (`invitation-preferences.ts:35-53`), which records an
   `INVITATION_OPTOUT`, cancels open grants and cancels pending outbox items.
9. **Digest and weekly report.** `runScheduledNotifications` (`notification-delivery.ts:313-358`) → `sendDigest` or
   `sendWeeklyReport` → `claimDelivery` (at most 3 claims per local date: `:18-19,96-114`) → `failDelivery` sets
   FAILED (`:136-141`).
10. **Support reply.** A staff reply goes to `queueSupportReplyEmail` (`support-email-delivery.ts:33-55`, encrypted
    outbox) and is sent by the worker's `deliverSupportEmails` (`:128-144`). When the allowance is full it waits until
    `retryAt` (`:117-123`).
11. **Marketplace.**
    - A report: `reportListing` → `await Promise.all([notifyAuthor, notifyStaff])`, synchronous in the reporter's
      request (`marketplace-service.ts:336`).
    - A review request: `requestListingReview` → `notifyStaffOfRequest` (`:462-474`).
    - A staff decision: `reviewListing` → `notifyAuthorOfReply` (`:476-488`).
12. **Automatic follow-up.** The worker runs `runAutomaticDeliveries` every 60 s (`automatic-delivery.ts:99-286`):
    - It picks candidates, respecting quiet hours, the review window, drafts, appointment holds and do-not-contact
      (`:138-177`).
    - It claims the follow-up, then rechecks it (`:187-232`).
    - `deliver()` (`:72-89`) calls either `sendTransactionalEmail` (PRODUCT) or `sendTwilioSms` (`:50-67`).
    - On any error the row is marked FAILED and never re-claimed (`:194-196,274-280`).
    - Today reads the FAILED rows (`jumps/page.tsx:177-190,293-330`) and turns the stored error into words
      (`today-view.ts:25-50`).
13. **Webhook.** Resend → `POST /api/webhooks/resend`. The proxy exempts webhooks from its origin check
    (`proxy.ts:45`). The route verifies the svix signature against the raw body (limit 64 KiB) (`route.ts:9-27`), then
    `receiveEmailProviderEvent` (`email-events.ts:43-78`) records suppressions, cancels grants, invitations and waitlist
    tokens, and reconciles the event with the sent message.
14. **Today handoff.** `jumps/page.tsx:255` calls `followUpPhone`, which computes `storedPhoneDialTarget`
    (`today-list.ts:78-82`, `phone-number.ts:141-162`). `EditableFollowUpAction.tsx:369` builds the link with
    `followUpHandoffUrl` (`:52-60`), and `JumpActionLink` renders it as a native anchor. The attempt is recorded
    without awaiting, so the phone app opens straight away (`JumpActionControls.tsx:71-88`).
15. **Review request.** The contact page's `ReviewRequestButton` (`ContactProfile.tsx:240`) calls
    `POST /api/contacts/[id]/review-request` (`route.ts:10-55`), which returns `smsUrl` and `emailUrl`. The customer's
    referral share is `GET /api/reviews/[token]/refer`, which redirects to `sms:?body=` (`refer/route.ts:15`).

**One message traced from prepared text to link.** Computed with the same encoding as
`EditableFollowUpAction.tsx:52-60`, importing nothing from the app. The text contains an emoji, newlines, `&`, `%`,
`?` and `’`:

```
content = "Hi Sam 👋\nThanks for choosing Joe’s Plumbing & Heating — how is the new water heater? 100% happy?\n— Joe"
SMS   : sms:+15555550123?&body=Hi%20Sam%20%F0%9F%91%8B%0AThanks%20for%20choosing%20Joe%E2%80%99s%20Plumbing%20%26%20Heating%20%E2%80%94%20how%20is%20the%20new%20water%20heater%3F%20100%25%20happy%3F%0A%E2%80%94%20Joe
WA    : https://wa.me/15555550123?text=Hi%20Sam%20%F0%9F%91%8B%0AThanks…(same encoding)
MAIL  : mailto:sam+jobs@example.com?subject=Checking%20in%20%232%20%26%20thanks&body=Hi%20Sam%20%F0%9F%91%8B%0A…
TEL   : tel:+15555550123
TODAY parsed pathname: +15555550123 | searchParams body round-trip ok: true
REVIEW: sms:(555) 555-0123?body=Hi%20Sam%2C%20thanks      <- review-request route, typed display number, ?body=
REVIEW parsed href: sms:(555) 555-0123?body=x | pathname: "(555) 555-0123"
```

## Findings

### MSG-01 — Automatic customer emails go out as Jump in the Mix; customer replies reach the operator's mailbox, not the owner
- Severity: HIGH · Label: VERIFIED for the code; INFERRED for what customers and owners experience. The production
  `EMAIL_FROM` and `EMAIL_REPLY_TO` values are not visible to this lane. · Prior: none
- What the user experiences:
  - A plumber opens Settings → Sending to customers, which shows **Email · Available** in hosted production, and turns
    on automatic sending.
  - Every automatic follow-up reaches his customer from the platform sender. The subject is the Mix step's subject or
    "A note from {company}". The body is his text with no footer, no business identification and no way to stop.
  - When the customer replies ("Tuesday works"), the reply goes to `EMAIL_REPLY_TO`. The docs say that is the
    operator's monitored mailbox, forwarded by ImprovMX to Kevin's Gmail. If it is blank, the reply goes to the
    `@jumpinthemix.com` From address.
  - The plumber never sees the reply, so he loses the job, and the operator receives another business's customer
    correspondence.
  - A customer who wants the emails to stop can only reply, which also goes to Kevin, or press "Report spam". A spam
    report creates a platform-wide `COMPLAINT` suppression for that address. It also counts against the one sender
    reputation that verification email depends on, and does not set do-not-contact on the contact.
- Reproduction:
  1. On a test or beta account, open `/settings/sending`.
  2. Tick "Send prepared messages automatically", "Email" and the consent box, choose 15 minutes, and save.
  3. Add a contact with an inbox you control and start a Mix whose first step is an Email due now.
  4. Wait at least 15 minutes. The worker checks every 60 s.
  5. Open the received message and read its From and Reply-To. Reply to it and see where the reply lands.
- Evidence:
  - `src/lib/automatic-delivery.ts:81-87`: ``sendTransactionalEmail({ to: recipient, subject: prepared.subject || `A note from ${company}`, text: prepared.body, html: `<div style="white-space:pre-wrap;…">${escapeHtml(prepared.body)}</div>`, idempotencyKey: `automatic-follow-up:${jumpId}` })``.
    It passes no `from` and no `replyTo`, and adds no footer.
  - `src/lib/transactional-email.ts:36-37`: `const replyTo = message.replyTo === undefined ? env.emailReplyTo : message.replyTo;`.
    The payload is only `{ from: message.from ?? env.emailFrom, to, subject, text, html, reply_to }`, with no `headers`.
  - `render.yaml:58-61`: `EMAIL_FROM` and `EMAIL_REPLY_TO` are single values for the whole service.
    `docs/HOSTED_DEPLOYMENT.md:34`: "`EMAIL_REPLY_TO` | Monitored reply mailbox".
    `docs/PRODUCTION_LAUNCH_PLAN.md:24`: "ImprovMX forwards `support@jumpinthemix.com` and `hello@jumpinthemix.com` to the Owner's designated Gmail inbox."
  - `src/app/(app)/settings/sending/page.tsx:35`: `{automaticEmailAvailable ? "Available" : "Not available yet"}`. Hosted
    production always has Resend configured (`src/lib/env.ts:140-142`). Neither the page (`:28-39`) nor
    `AutomaticSendPreview.tsx:13` says who the sender is or where replies go.
  - `src/lib/onboarding-actions.ts:123` sets `emailSignature: user.name`, so by default the customer gets a name with no
    reply address.
  - `src/app/faq/page.tsx:25`: "Automatic sending is optional and needs a connected provider." Owners connect no
    provider; the platform's own is used.
  - A complaint suppresses the address platform-wide and blocks every category except invitation opt-out:
    `src/lib/email-events.ts:55-71` and `src/lib/email-budget.ts:85-86`.
  - `src/app/privacy/page.tsx:12` describes support-address forwarding. It does not say that owners' customers' replies
    reach the operator.
- Root cause: automatic delivery reuses the platform's transactional sender. There is no sender identity per workspace.
- Fix direction:
  - For the beta: hide the automatic **Email** option. Manual handoff already sends from the owner's own mail app, with
    the right identity.
  - Before re-enabling it: send as "{Company} via Jump in the Mix <notify@…>" with `reply_to` set to the owner's
    verified email, add a footer naming the business with a working stop link, and set do-not-contact on a complaint.
- Runtime check for the lead:
  - Signed in as a beta test account in production, GET `/settings/sending` and confirm it shows "Email · Available".
  - If a controlled inbox is available, send one automatic email from a test workspace and record its From, Reply-To
    and footer.

### MSG-02 — Today mislabels automatic-email failures ("the provider rejected it. Send it yourself.")
- Severity: MEDIUM · Label: VERIFIED · Prior: TOD-F1. Release A fixed the notice for SMS and lease errors, but the
  error messages the email path actually stores were never mapped.
- What the user experiences:
  - **Timeouts.** Resend can be slow for 3 × 15 s. The same `Idempotency-Key` is reused on each try, so Resend may have
    accepted the first one. The follow-up is marked FAILED with "Email acceptance could not be confirmed.", and Today
    tells the owner "Couldn’t send automatically: the provider rejected it. Send it yourself." He sends it himself, and
    the customer gets it twice. That is the double message the uncertain wording exists to prevent.
  - **Full allowance.** When the daily allowance is full, the owner gets the same "provider rejected it" message, which
    is false: the app's own cap stopped the send.
  - **Suppressed address.** It is also shown as "the provider rejected it".
- Reproduction: in an isolated database, set a pending follow-up's `AutomatedDelivery` to `FAILED` with
  `error: "Email acceptance could not be confirmed."` and open `/jumps?jump=<id>`.
- Evidence:
  - `src/lib/today-view.ts:27`: `const UNCERTAIN = /uncertain|lease was lost|timed? ?out|abort|fetch failed|network|socket/i;`.
    `:29-38`: anything unmatched becomes "the provider rejected it".
  - `src/lib/transactional-email.ts:115,119`: timeouts are swallowed and retried, then
    ``new EmailDeliveryError("PROVIDER", `Email acceptance could not be confirmed${…}.`)``.
    `src/lib/email-budget.ts:98`: "Email capacity is temporarily reserved. Please try again later." `:86`: "Email cannot
    be sent to this address."
  - Computed with the same regex:
    `"Email acceptance could not be confirmed." => failed`,
    `"Email capacity is temporarily reserved. Please try again later." => failed`,
    `"The operation was aborted due to timeout" => uncertain`.
  - The tests use invented strings. `src/lib/today-view.test.ts:63` uses `"Resend returned 422"`, and
    `e2e/automatic-delivery-states.spec.ts:45-46` seeds `"Email provider rejected the request (status 400)."`. Neither
    uses the real strings above.
  - A FAILED row is never retried (`automatic-delivery.ts:194-196`), so the budget case is a permanent drop (MSG-03).
- Fix direction: add `could not be confirmed` to the uncertain pattern. Map "capacity" to "today's email limit was
  reached", and "cannot be sent to this address" to "this address bounced or reported spam before". Add the real
  strings to the tests.
- Runtime check for the lead: none needed; this is a pure function. Optionally, run the isolated-database reproduction
  above.

### MSG-03 — One 90-a-day allowance (70 after the account reserve) carries invitations, digests and every automatic customer email; when it fills, mail is dropped
- Severity: MEDIUM · Label: VERIFIED for the code paths; INFERRED for the capacity model and the provider's terms ·
  Prior: none
- What the user experiences when the non-account allowance (70 in the last 24 h) or the total (90) is used up:
  - **Automatic customer emails** fail permanently. The owner sees "the provider rejected it" (MSG-02). Before the
    attempt, Today still shows "Sends automatically at …", because the page doesn't consider the allowance
    (`jumps/page.tsx:299`).
  - **Digests and weekly reports** are claimed 3 times, one minute apart. Their `retryAt` is ignored, so the day's
    digest is gone within about three minutes.
  - **Waitlist sign-ups** fail with "We couldn’t submit that. Your email is still here—please try again." They keep
    failing until the window frees up.
  - **Account email** can only fail once the total reaches 90; the 20 reserve protects it from everything else.
    Verification then shows "The email provider could not deliver the message. You can try again below."
  - **Only invitations and support replies wait** and are retried at `retryAt`.
  - **What Kevin sees:** meters on Admin → Email, and an Operations "email" check that turns WARNING at 80 % and
    CRITICAL at 100 %. That check is pushed to him only if `OPS_ALERT_WEBHOOK_URL` or SNS is configured, and
    `render.yaml` sets neither.
- Evidence:
  - The configured limits: `render.yaml:26-33` (90, 2700, 20, 300) and `env.ts:52-53,82-83`. Production had 90 and
    2,700 on 09-16 (`docs/INVITATION_FLOW_AUDIT_2026-09-16.md:60`).
  - How the limit is enforced: `email-budget.ts:17-24,87-98`; every retry counts too (`:100`).
  - Automatic emails: `automatic-delivery.ts:274-280` marks the row FAILED, and `:194-196` never re-claims a FAILED row.
  - Digests: `notification-delivery.ts:19,96-114,136-141`, run every 60 s (`worker/index.ts:29`).
  - Waitlist sign-ups: `waitlist-actions.ts:49-52`.
  - Verification: `auth-actions.ts:115-126` and `verify-email/pending/page.tsx:39`.
  - Invitations and support replies wait: `waitlist-delivery.ts:68-75` and `support-email-delivery.ts:117-123`.
  - The Operations check: `operations-signals.ts:26-38`.
  - Why 90 and 2,700: `docs/EMAIL_OPERATIONS.md:20` says "Resend lists 3,000 emails/month and 100/day on Free". That
    is the plausible reason for the numbers; the provider's current terms are INFERRED and were not re-checked.
- Capacity model (INFERRED; the assumptions are stated in each row):

| Scenario | Non-account mail in 24 h | Account mail in 24 h | Result |
|---|---|---|---|
| Manual-only beta: 20 owners, 10 digests, invitations paced at 10 a week, support 2 a day | about 12 | about 3 | fine |
| The same, plus 5 owners on automatic email at 6 follow-ups a day each | about 42 | about 3 | fine |
| A single-day manual wave of 30 invitees who all register that day, with 10 digests and 30 automatic emails | 70 (full) | 30 or more needed, 20 reserved | the 21st and later verifications fail that day, and automatic emails fail for good |
| Steady state near the daily cap | 70 | 20 | the 31-day cap (2,700, about 87 a day) binds first |

- Fix direction:
  - For the beta: keep automatic email off (MSG-01), or cap it per workspace, and pace manual waves at 10 or fewer a
    day.
  - Let digests honour `retryAt`.
  - Give the waitlist a "try again later" answer on BUDGET, and show "today's email limit" wording (MSG-02).
- Runtime check for the lead: as staff, GET production `/admin/email` and record "Last 24 hours: N of 90" and "Product
  and invitation emails: N of 70". Also GET `/admin/operations` and record the email check's state.

### MSG-04 — A suppressed address never gets verification, sign-in or reset email, and the page says "try again"
- Severity: MEDIUM · Label: VERIFIED for the code; INFERRED for the experience · Prior: none
- What the user experiences:
  - **Who gets stuck.** The invitee's address has an active HARD_BOUNCE, COMPLAINT or PROVIDER_SUPPRESSION record. For
    example, a strict company filter bounced one message, the person once reported a Jump in the Mix email as spam, or
    they are a customer who complained about an owner's automatic email (MSG-01).
  - **What they see.** Every verification attempt answers "The email provider could not deliver the message. You can
    try again below." Trying again can never succeed. The only way out is the small "Contact support" line.
  - **Who can escape.** A text invitee can switch to another address. An email invitee cannot, because registration
    requires the invited address.
  - **What Kevin sees.** No check fires. Admin → Email shows suppression totals by reason only. Clearing a suppression
    takes a provider review, two references, his password and MFA.
- Reproduction (isolated database only): register an unverified user, insert an `EmailSuppression` with reason
  HARD_BOUNCE for that address, then press "Send another verification link" on `/verify-email/pending`.
- Evidence:
  - `email-budget.ts:85-86`: suppression applies to AUTH mail (only `INVITATION_OPTOUT` is excluded outside
    invitations).
  - `tests/email-controls.integration.test.ts:144`: "blocks every future email category". The block is by design.
  - `auth-actions.ts:115-126`: every failure becomes `deliveryFailed`. `verify-email/pending/page.tsx:39,57` shows the
    "try again" copy.
  - `auth-actions.ts:155` pins the invited address. The email correction (`:364`) is for text invitations only.
  - `operations-signals.ts:38` has no bounce or suppression signal. `admin/email/page.tsx` shows totals by reason.
    `docs/EMAIL_OPERATIONS.md:83-88` describes the clearance steps.
- Fix direction:
  - On SUPPRESSED, say "We can't email this address right now. Contact support@…" instead of "try again".
  - Count unverified accounts with an active suppression in the Operations email check.
- Runtime check for the lead: none in production. Use the isolated reproduction above.

### MSG-05 — The public waitlist form has no bot guard; confirmations to invented addresses spend the allowance and bounce
- Severity: MEDIUM · Label: VERIFIED for the code; INFERRED for the provider and reputation effect · Prior: related to
  SEC-F4. Release B's per-recipient caps cover account email only.
- What the user experiences: nothing, until form spam arrives. Then:
  - Each new address costs one confirmation email (ACCESS_CONFIRMATION, which uses the non-account allowance). The
    limits are 10 an hour per IP and 3 a day per address, so a few IPs can use up the 70 a day.
  - Invented addresses hard-bounce, creating suppression rows and raising the Resend account's bounce rate.
  - Resend documents account-level bounce and complaint thresholds (INFERRED; not re-checked). A paused Resend account
    stops verification email for everyone.
- Reproduction: do not run this against production. Read the code below.
- Evidence:
  - `src/components/WaitlistForm.tsx:33-38` has the email field and an optional scenario only.
  - `git grep -i "turnstile|captcha|hcaptcha|honeypot"` over `src` finds nothing.
  - `src/lib/waitlist-actions.ts:28-31` sets 10 an hour per IP and 3 a day per address; `:41-45` sends the email as
    ACCESS_CONFIRMATION.
  - `src/lib/waitlist.ts:24-41` gives every new address a token.
- Fix direction: add a free hidden honeypot field and a minimum fill time, or Cloudflare Turnstile (free). Optionally
  add a global daily cap on confirmations.
- Runtime check for the lead: none. Kevin should check the bounce and complaint rates in the Resend dashboard.

### MSG-06 — No List-Unsubscribe header; digests, weekly reports and automatic customer emails have no stop or manage link
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- What the user experiences:
  - An owner who wants the daily digest to stop must sign in and find Settings → Notifications. The easy alternative is
    "Report spam".
  - A customer who gets an automatic email has no link at all (MSG-01).
  - Spam reports suppress the address and feed the reputation of the only sending domain.
  - Invitations and staff invitations do carry a tokenized, POST-confirmed stop link. The waitlist confirmation's link
    is not tokenized: the person must type their email again and wait for another email.
- Evidence:
  - `git grep -n -i "list-unsubscribe\|unsubscribe" -- src` finds no email use.
  - `transactional-email.ts:37`: the payload has no `headers`.
  - The digest and report bodies end at "Open Today" (`notification-delivery.ts:166-181,292-293`). The automatic email
    is the body only (`automatic-delivery.ts:85`).
  - The invitation stop links are at `access-invitation-mail.ts:13-14` and `staff-invitations.ts:62-63`.
  - The waitlist confirmation links to `/waitlist/leave` without a token (`waitlist-actions.ts:40-44`), which leads to
    another email (`invitation-preference-actions.ts:16-35`).
  - Gmail's and Yahoo's one-click requirement applies to bulk senders (about 5,000 a day or more), so it is not
    triggered at 90 a day or fewer (INFERRED).
- Fix direction: add `List-Unsubscribe` (mailto and https) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` to
  digests, reports and invitations, plus a "Turn off in Settings → Notifications" footer.
- Runtime check for the lead: in a received digest, Gmail's "Show original" shows no List-Unsubscribe header. This
  needs an inbox (owner).

### MSG-07 — "Ask for a review", the contact page, Calendar and the referral share still build links from the typed number, and the review/referral text links use `?body=`
- Severity: MEDIUM · Label: VERIFIED for how the links are built; NOT RUN for device behaviour · Prior: TOD-F4.
  Release A fixed Today; these places were outside its scope.
- What the user experiences:
  - "Ask for a review" → "Text request" opens `sms:(555) 555-0123?body=…`. The typed spaces, parentheses and any
    "x12" extension stay in the link.
  - The link uses `?body=`, while the codebase itself says `?&body=` is the form both iOS and Android accept.
  - On iPhones where `?body=` is ignored, Messages opens with an empty body and the review link is lost (NOT RUN).
  - The customer-facing "Share with a friend" redirects to `sms:?body=`.
  - The contact page's Text and Call buttons and Calendar's phone link also use the typed number.
- Reproduction:
  1. Save a contact's phone as "(555) 555-0123 x12".
  2. Open the contact, choose "Ask for a review", then "Text request", on an iPhone and on an Android phone.
  3. Check that the number and the message are prefilled.
- Evidence:
  - The review request: `api/contacts/[contactId]/review-request/route.ts:46`
    (`const phone = contact.phones[0]?.phone ?? null;`) and `:51` (`` smsUrl: phone ? `sms:${phone}?body=${encodeURIComponent(message)}` : null ``).
  - The contact page: `ContactProfile.tsx:107,193,195,222` (`` href={`sms:${primaryPhone}`} ``,
    `` href={`tel:${primaryPhone}`} ``, `` href={`tel:${item.phone}`} ``).
  - Calendar: `calendar/page.tsx:91` (`` tel:${context.phones[0].phone} ``).
  - The referral share: `api/reviews/[token]/refer/route.ts:15` (`` sms:?body=${…} ``).
  - The codebase's own rule: `EditableFollowUpAction.tsx:44-51` ("The `?&body=` spelling is the one both iOS Messages
    and Android accept") and `src/lib/product-demo.ts:102` (`appleMobile ? "&" : "?"`).
  - The trace above shows the path `"(555) 555-0123"` surviving URL parsing.
- Fix direction: reuse `followUpHandoffUrl` and `phoneHandoffTarget` with the dial target computed on the server, and
  use `?&body=` for review and referral links.
- Runtime check for the lead: a device pass on iPhone Messages and Android Messages (NOT RUN in the project records).

### MSG-08 — DMARC is `p=none` with no reporting address; the DKIM key is 1024-bit
- Severity: LOW · Label: VERIFIED (DNS above) · Prior: none
- What the user experiences: nothing directly.
  - The setup meets Gmail's and Yahoo's minimum.
  - With no `rua=` address, Kevin receives no aggregate reports. A spoofed "Reset your password" email, or a broken
    DKIM or SPF record after a DNS change, would go unseen.
  - A 1024-bit key is Gmail's minimum; 2048 is recommended.
- Reproduction: `dig +short TXT _dmarc.jumpinthemix.com` returns `"v=DMARC1; p=none;"`.
- Evidence: the dig output and the key-size computation above (`rsa 1024 bits`).
- Fix direction: add `rua=mailto:dmarc@jumpinthemix.com` (a free ImprovMX alias). Move to `p=quarantine` after a clean
  week of reports. Use a 2048-bit key if Resend offers it.
- Runtime check for the lead: none needed.

### MSG-09 — Push reminders fall back to `EMAIL_FROM` as the VAPID subject, which web-push rejects
- Severity: LOW · Label: VERIFIED for the code; NOT RUN because the production environment is unknown · Prior: related
  to the tests-quality note about the `.env.example` VAPID domain
- What the user experiences: suppose production has the two VAPID keys but no `WEB_PUSH_VAPID_SUBJECT`. Push counts as
  configured, but every send throws, including "Send test notification", and the reminders never arrive.
- Evidence:
  - `src/lib/env.ts:94`:
    `vapidSubject: process.env.WEB_PUSH_VAPID_SUBJECT ?? process.env.EMAIL_FROM ?? "mailto:hello@jumpinthemix.app"`.
  - `src/lib/follow-up-push.ts:16-17` checks only the two keys; `:53` calls `setVapidDetails(env.vapidSubject, …)`.
  - `node_modules/web-push/src/vapid-helper.js:68-86` throws "Vapid subject is not a valid URL".
  - Computed: `"Jump in the Mix <hello@jumpinthemix.com>" => INVALID URL`.
  - The doc and the code disagree: `docs/HOSTED_DEPLOYMENT.md:45` says push needs all three values.
- Fix direction: require the subject in `pushConfigured()` and in the readiness check, and drop the `EMAIL_FROM`
  fallback.
- Runtime check for the lead: on a beta account on a supported device, run Settings → Notifications → "Send test
  notification", or ask Kevin whether `WEB_PUSH_VAPID_SUBJECT` is set.

### MSG-10 — Email copy gaps
- Severity: LOW · Label: VERIFIED · Prior: none
- What the user experiences, and the evidence:
  - **Password changed.** The email says "If this was not you, reset it immediately", but its only button goes to
    `/account`. If an attacker changed the password, that page needs a sign-in the owner can't do. It should point to
    `/forgot-password` (`auth-email.ts:47-57`).
  - **Missing "ignore" line.** The verification, sign-in and reset emails have no "If you didn't request this, ignore
    this email" line (`auth-email.ts:23-71`); the waitlist emails do (`waitlist-actions.ts:43`).
  - **Digest greeting.** The digest opens "Good morning" whatever hour the owner picks
    (`notification-delivery.ts:167,181`; 0–23 allowed at `notification-actions.ts:14`).
  - **Invitation.** The waitlist invitation doesn't say why the person is getting it (that they joined the waitlist),
    and it is bare HTML without the branded frame the account emails use (`waitlist.ts:86-87`).
  - **No legal sender details.** No email carries a postal address or legal entity. The public footer reads "Jump in
    the Mix is operated by Jump in the Mix." (`PublicDocument.tsx:24`, as served on 09-18:
    `docs/ui-ux-audit-2026-09-18/browser-evidence.json:10716`). Whether one is needed is a legal question.
- Fix direction: one copy pass over `auth-email.ts`, `waitlist.ts:86-87` and `notification-delivery.ts:167`.
- Runtime check for the lead: none needed.

### MSG-11 — Still open (prior OPS-F14): several interactive emails still make up to three 15-second attempts inside the request
- Severity: LOW · Label: VERIFIED · Prior: OPS-F14. Release A2 fixed sign-in, verification and reset only.
- What the user experiences: while Resend is slow, several actions can spin for about 50 s on a 0.5-CPU instance:
  - "Join the waitlist"
  - "Email me a confirmation link"
  - "Send test reminder"
  - Marketplace "Report", which waits on the author email and on one email per staff owner
- Evidence:
  - Only `auth-actions.ts:121,264,428` use `withEmailAttempts(1, …)`.
  - The default is 3 attempts with a 15 s timeout each (`transactional-email.ts:51,64-67,103`).
  - The uncapped callers: `waitlist-actions.ts:41`, `invitation-preference-actions.ts:28`,
    `notification-actions.ts:109`, and `marketplace-service.ts:336,353-355`.
- Fix direction: wrap these calls in `withEmailAttempts(1, …)`, or queue the Marketplace notices in the outbox.
- Runtime check for the lead: none needed.

## What holds up

- **Idempotent, budgeted and suppression-aware sending.**
  - One advisory-locked transaction reserves the attempt, checks suppression and checks the budget
    (`email-budget.ts:74-102`).
  - Each key is frozen to its payload hash, so a repeated key with changed content is rejected (`:79`).
  - The retry window stops at 23 h, inside Resend's 24 h idempotency window (`:8,82-84`).
  - A cached receipt never sends again (`:81`).
- **Account email.**
  - One attempt per interactive request (`auth-actions.ts:121,264,428`).
  - Silent per-address daily caps, with the numbers stated on the pages (`email-budget.ts:33-58`).
  - A protected 20-a-day and 300-a-month reserve (`:87-97`).
  - The verification, reset and sign-in expiries in the emails match the code (`auth-email.ts:30,42,68`;
    `auth-actions.ts:262`).
- **Links survive mail scanners.**
  - Sign-in links go to a confirm page (Release A2). Reset, waitlist confirmation and stop links need a POST.
  - An already-used verification link says "already verified" instead of an error (`verify-email/route.ts:55-61,76`).
  - Every link is built from `APP_URL`, never from the request host (`auth-email.ts:6-8`,
    `notification-delivery.ts:175`, `support-email.ts:7-9`, `waitlist.ts:80`).
  - User values are HTML-escaped in every template (`escapeHtml`, `transactional-email.ts:124-126`).
- **Webhook.**
  - The svix signature is checked against the raw body, limited to 64 KiB (`webhooks/resend/route.ts:13-20`).
  - Events are deduplicated by svix-id; the status codes are 401, 400 and 503.
  - An adverse event cannot be erased by an older success.
  - A bounce, complaint or provider suppression cancels open grants, outbox items and waitlist tokens
    (`email-events.ts:43-78`). The proxy exempts the route from its origin check (`proxy.ts:45`).
  - Production has recorded delivered events (`docs/INVITATION_FLOW_AUDIT_2026-09-16.md:59`).
- **Invitations and support replies** use an encrypted outbox. They wait for capacity without using up retries, and
  they go to staff review when the result is uncertain (`waitlist-delivery.ts:36-85`;
  `support-email-delivery.ts:102-126`).
- **Member-to-friend invitations are sent by the member**, from their own app (`referral-access.ts:65`,
  `manualDelivery: true`). The platform never emails a friend. Invitation opt-out is honoured before one is prepared
  (`:45`).
- **Automatic sending is conservative.**
  - It is off by default, needs a consent box and a review of the next 24 hours (`settings/sending/page.tsx:33-39`).
  - It respects quiet hours, working hours, appointment gaps and do-not-contact, both on the first pass and on the
    recheck (`automatic-delivery.ts:138-177,227`).
  - A saved draft holds the follow-up (`:159,227`).
  - Marking a contact do-not-contact cancels their pending follow-ups (`contact-state-actions.ts:88`).
  - SMS cannot be switched on without all three Twilio values (`notification-actions.ts:64-66`;
    `settings/sending/page.tsx:36`), so a beta user cannot believe texts are going out when Twilio is unset.
  - Caveat: Today's automatic line checks the saved preference, not the configuration (`jumps/page.tsx:192`). If
    credentials were removed after SMS was enabled, Today would still say it will send until the worker fails the
    follow-up.
- **Today's handoff links.**
  - The E.164 number comes from the stored key, and the extension is stripped (`phone-number.ts:141-162`).
  - Text links use `?&body=`. WhatsApp is offered only when a full international number exists.
  - `encodeURIComponent` handles emoji, newlines, `&`, `%` and `#` (see the trace above).
  - The link is a native anchor, so iOS treats the tap as a user gesture (`JumpActionControls.tsx:71-88`).
  - Two small caveats, both NOT RUN:
    - A number with an extension dials the main number only, and the owner types the extension.
    - A very long email body in a `mailto:` link may be cut off by some desktop clients. The body limit is 20,000
      characters (`preparation-family.ts:17`), and there is a Copy button.
- **Digests and weekly reports are opt-in** (`prisma/product-platform.prisma:34-36`). There is a test email capped at
  2 an hour (`notification-actions.ts:103`).

## Test coverage for this lane

| Flow | Tests |
|---|---|
| Budget, reserve, idempotency, webhook signature, suppression, event ordering | `tests/email-controls.integration.test.ts`, `tests/email-review.integration.test.ts`, `e2e/email-operations.spec.ts`, `e2e/email-recovery.spec.ts` |
| Account emails and attempts | `tests/transactional-email-attempts.test.ts`, `tests/auth-email-reserve.test.tsx`, `tests/verify-email-route.test.ts`, `tests/verify-email-redirect.test.ts`, `e2e/registration.spec.ts` |
| Waitlist and invitations | `tests/waitlist-mail.test.ts`, `tests/waitlist.integration.test.ts`, `tests/waitlist-actions.test.ts`, `tests/waitlist-authorization.integration.test.ts`, `tests/staff-invitations.integration.test.ts`, `tests/invitation-repeat.integration.test.ts`, `e2e/waitlist.spec.ts`, `e2e/waitlist-admin.spec.ts`, `e2e/onboarding-invitations.spec.ts` |
| Support email | `tests/support-email.test.ts`, `tests/support-email-delivery.integration.test.ts`, `e2e/support-email.spec.ts` |
| Digest clock | `tests/notification-delivery.test.ts` (clock, quiet hours only) |
| Automatic delivery | `tests/automatic-delivery.test.ts` (configuration and payload shape), `tests/automatic-delivery-recipient.test.ts` (SMS E.164), `src/lib/automatic-delivery-window.test.ts`, `src/lib/today-view.test.ts`, `e2e/automatic-delivery-states.spec.ts` (seeded errors) |
| Handoff links | `src/lib/phone-dial.test.ts`, `e2e/follow-up-drafts.spec.ts` |

**Critical flows with no test:**
- The automatic **email** payload: From, Reply-To, footer (MSG-01).
- The automatic email's real failure strings on Today: timeout, budget, suppressed (MSG-02).
- A digest or report under a full budget (MSG-03).
- The verification page for a suppressed address (MSG-04).
- The review-request and referral link format (MSG-07).
- The push VAPID subject (MSG-09).

## NOT RUN

- **Inbox placement** at Gmail, Outlook, iCloud and Yahoo for the verification, sign-in, invitation and digest emails,
  and the SPF, DKIM and DMARC results in a received message's headers. This needs seed inboxes and an owner send. The
  project records also mark it as unqualified (`docs/BROWSER_E2E.md:35`, `docs/PRODUCT_QUALITY_GATES.md:29`).
- **Production environment values**: `EMAIL_FROM`, `EMAIL_REPLY_TO`, the Twilio values, `WEB_PUSH_VAPID_SUBJECT` and
  the `OPS_ALERT_*` settings. They are not visible to this lane.
- **Resend account state**: the plan, the actual daily and monthly limits, the bounce and complaint rates, whether the
  test site shares the account, and whether the webhook endpoint and events are registered. This needs the Resend
  dashboard.
- **Whether the ImprovMX aliases exist** for `security@`, `support@` and `hello@`. DNS cannot show aliases.
- **Device behaviour** of `sms:`, `tel:`, `mailto:` and `wa.me` links on iOS and Android (MSG-07 and Today). This
  needs a physical device pass.
- **What happens to a customer's reply** to an automatic email (MSG-01). This needs a controlled send.

## Questions for Kevin

1. Should automatic customer **email** stay available in the beta?
   - If yes: should it send as "{Company} via Jump in the Mix" with replies to the owner's own address?
   - What footer should it carry: business name, stop link, postal address?
   - Is it acceptable that customers' replies currently land in your support Gmail (privacy notice and legal review)?
2. What are the production `EMAIL_FROM` and `EMAIL_REPLY_TO` values? Is Twilio configured? (The page says "Not
   available yet" when it isn't.) If SMS is ever enabled: a shared platform number, US A2P 10DLC registration, and
   handling of STOP and replies all need a decision first.
3. Is the Resend account on the free plan (100 a day, 3,000 a month)? Does the Netlify test site send through the same
   account or domain? What wave size do you plan per day, given the 90 a day and 70 non-account allowance (MSG-03)?
4. For CAN-SPAM, CASL and similar rules, do you want a legal entity and postal address in the invitation, digest and
   automatic emails? (`PUBLIC_OPERATOR_NAME` currently renders "Jump in the Mix".)
5. May we add a free bot guard (a honeypot or Turnstile) to the public waitlist form (MSG-05)?
6. Is `security@jumpinthemix.com` configured in ImprovMX (the open Release B owner step)? Should a `dmarc@` alias be
   added for DMARC reports (MSG-08)?
7. Is `WEB_PUSH_VAPID_SUBJECT` set in production (MSG-09)? Is Sign in with Apple enabled, and if so, is the sending
   domain registered for Apple's private relay (`docs/AUDIT_RELEASE_B_2026-09-25.md:120`)?
