# Email delivery and operating limits

Implemented locally September 8, 2026. These instructions prepare a deployment; no production sender or webhook has been activated by this work.

Staff onboarding invitations use the same encrypted outbox, sending allowance, recipient opt-out, permanent suppression and safe retry window as customer invitations. Owners manage them in **Admin → Team**; customer invitation controls cannot grant staff access. Apply `20260909010000_staff_invitations` with matching web/worker code. See [Staff access](STAFF_ACCESS.md) for acceptance and cancellation behavior.

## Setup

1. Apply the reviewed migrations with `npm run db:deploy`, generate the client, and deploy matching web/worker builds. The email tables are in `20260908230000_email_delivery_controls`; `20260908233000_optional_email_preferences` makes summaries opt-in for new preferences while preserving existing choices.
2. Configure `RESEND_API_KEY`, a verified `EMAIL_FROM`, the monitored `EMAIL_REPLY_TO`, and the same `DATA_ENCRYPTION_KEY` on web and worker. Keys belong in the host secret manager.
3. In Resend, create a webhook for `https://YOUR_APP_DOMAIN/api/webhooks/resend`. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`, and `suppression.added`.
4. Store that endpoint's signing secret as `RESEND_WEBHOOK_SECRET` on the web service. Public hosted readiness requires it. A private test site's access gate still applies; use an appropriate controlled endpoint when rehearsing provider delivery.
5. Confirm the allowances below against the actual provider account. Open **Admin → Email** with `operations.read` to inspect usage, configuration, suppression totals, review counts, and verified event receipts.
6. Before inviting real users, deliver to controlled inboxes at different providers and rehearse a provider-supported bounce/event test. Confirm the provider dashboard and application receipt agree. A configured secret or successful HTTP send alone does not qualify inbox delivery.

The route verifies the signature and timestamp against the original request bytes, bounds bodies to 64 KiB, and deduplicates verified event IDs in PostgreSQL. Invalid signatures return 401, malformed supported events return 400, and unavailable configuration/database processing returns 503. Unknown events, including open/click tracking and suppression removal, are ignored. See [Resend signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests) and [supported event types](https://resend.com/docs/webhooks/event-types).

## Free-tier headroom

Resend lists 3,000 emails/month and 100/day on Free. Defaults leave room below those allowances and reserve capacity for account access. This is an application policy, not an exact provider billing counter. Verify current plan limits before activation. [Resend pricing](https://resend.com/pricing)

| Setting | Default | Meaning |
| --- | --- | --- |
| `EMAIL_DAILY_LIMIT` | 90 | Maximum outgoing API attempts in the last 24 hours |
| `EMAIL_MONTHLY_LIMIT` | 2700 | Maximum outgoing API attempts in the last 31 days |
| `EMAIL_DAILY_AUTH_RESERVE` | 20 | Of the daily total, protected from non-account email |
| `EMAIL_MONTHLY_AUTH_RESERVE` | 300 | Of the monthly total, protected from non-account email |

Every actual attempt, including retries, reserves capacity atomically before sending. A previously recorded acceptance can be returned without sending or consuming capacity again. Account verification, sign-in, password recovery, and invitation-preference confirmation use the account reserve. Waitlist confirmations, access invitations, digests, reports, and other product email use the remaining capacity; both categories remain subject to the overall ceiling.

Queued invitations wait when capacity is exhausted. Waiting for the first available slot does not start the provider retry clock or consume a worker retry. Messages already attempted retain their original retry deadline. Other synchronous sends report a temporary failure when capacity is unavailable; they are not silently placed in the invitation queue. New accounts start with daily digests and weekly reports off; members choose these under **Settings → Notifications**.

The counters cover this application's database and sender calls only. Mail sent elsewhere using the same Resend account still affects its allowance. Keep production and test sender usage isolated or leave additional headroom. Increasing application limits does not purchase a provider plan, guarantee delivery, or increase hosting capacity. There is no new paid queue dependency.

## Delivery facts and suppression

An API acceptance is stored separately from delivered, delayed, bounced, complained, suppressed, and failed event timestamps. Verified events that arrive before the API response are reconciled when acceptance is recorded. Replays are harmless, and older success events cannot erase adverse delivery facts. A delivered event means acceptance by the recipient's mail server; it does not establish inbox placement or a read. [Resend delivery events](https://resend.com/docs/webhooks/emails/delivered)

Permanent bounces, complaints, and provider suppression records block subsequent email to the recipient, remove them from active Waiting as **SUPPRESSED**, invalidate pending confirmation links, revoke unused access URLs, and cancel queued invitation deliveries. Existing accounts remain intact. If a provider response races cancellation, its receipt is retained without changing the canceled invitation back to sent. Temporary delivery failures do not permanently suppress an address. [Bounce event details](https://resend.com/docs/webhooks/emails/bounced), [provider suppression events](https://resend.com/docs/webhooks/suppressions/added)

Recipient-requested invitation opt-out is distinct: it blocks invitations but allows essential account mail and a new waitlist confirmation. Confirmed rejoining can clear only that voluntary invitation opt-out. It cannot clear provider suppression. Provider-side removal events do not automatically clear local records. Audited operator clearance is now available in **Admin → Email recovery → Recipient suppression**. Do not bypass it through direct database edits.

## Investigation and recovery

**Admin → Invitations** connects a grant's delivery record to its provider facts. **Admin → Email** shows recent verified events without recipient addresses, message bodies, subjects, raw provider error messages, or access links. Stored receipts use keyed recipient hashes and minimal event fields. Access pages still require their separate recipient-data permission.

Retries reuse the original frozen invitation content and key. The application stops uncertain retries after 23 hours, inside Resend's documented 24-hour idempotency window. A reused key with changed content is rejected; terminal provider errors are not retried immediately. A successful response must include a usable provider record ID. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) and [invitation recovery](WAITLIST_OPERATIONS.md).

Review expired or uncertain sends against the provider record before any replacement. The new local-receipt recovery described below works beyond the safe retry window without sending. Provider-record verification and deliberately reviewed repeat delivery are implemented below. Automated private-detail retention with permanent delivery-key and provider-event replay records is implemented locally; see [Data retention](DATA_RETENTION.md). Real provider qualification remains unfinished. Admission ceilings are implemented separately in the admission controls. Do not delete the send ledger to reset limits or force retries: it also prevents unsafe key reuse.

## Local verification

`tests/email-controls.integration.test.ts` exercises real PostgreSQL transactions with mocked HTTP delivery: concurrent budget reservations and account reserve, retry/acceptance caching, permanent rejection, malformed provider success, no-budget deferral, signature/timestamp checks, duplicates, out-of-order events, suppression, and send/cancellation races. It sends no real email.

`e2e/email-operations.spec.ts` uses a synthetic signing secret and isolated local fixtures to exercise the deployed route, diagnostics, permission revocation, and phone/desktop accessibility. Run it with the separate staff browser configuration described in [Browser E2E](BROWSER_E2E.md). These tests do not replace provider/DNS/inbox qualification.


## Recipient suppression review

Apply `20260909070000_email_suppression_review` with matching web and worker code. Existing suppression records remain active. The `email.manage` permission exposes the recipient queue, review details and receipt-recovery page; it is granted by the Owner template and can be assigned explicitly to another staff member. It does not itself grant access to customer or staff invitation records.

1. Find the recipient under **Admin → Email recovery → Recipient suppression**. Review all recorded reasons, including any invitation opt-out.
2. Investigate the cause, confirm the recipient explicitly wants email to resume, and review/remove the provider-side block in the provider dashboard when appropriate. The application records the operator's references and confirmations; it does not query or change provider suppression settings. See [Resend suppression lookup](https://resend.com/docs/api-reference/suppressions/get-suppression) and [provider removal](https://resend.com/docs/api-reference/suppressions/remove-suppression).
3. Add short provider-review and recipient-request references, a reason, both confirmations and the current administrator password. Keep private message bodies and credentials in their original systems. Clearance requires MFA verified within ten minutes when hosted MFA is required.
4. Clear the provider blocks locally. Every active provider reason for that address is cleared in one transaction, with its original record, revision and audit history preserved. Any intervening event or operator change invalidates the displayed review.

Clearance does not restore revoked URLs, reactivate canceled deliveries, grant access, refund referral slots, or put a person in a wave. Essential account mail may resume subject to the sending allowance and the provider's own rules. An entry left in **SUPPRESSED** must submit and confirm a new waitlist request; confirmation starts a new queue position. An invitation opt-out stays active until the recipient confirms rejoining, and a database constraint prevents administrative clearance of that reason.

Signed adverse events that occurred after clearance reactivate the block and advance its revision. A delayed event for the same cleared reason, with an occurrence time at or before that clearance, remains in the event ledger but does not undo the newer review. An adverse reason with no prior clearance still applies conservatively. No success event erases the historical delivery facts. Web and worker must both use the updated active-record filter; mixed versions could treat cleared records as still blocked.

## Recover a local acceptance receipt

On **Admin → Email recovery**, staff with `email.manage` can view customer review records only with `access.read`, and staff onboarding records only with `staff.manage`. Select **Recover recorded acceptance** and provide a reason. The service rechecks current verified staff, session, MFA and the invitation-type permission, then compares the frozen key, recipient, category and full payload with the existing local send ledger. A stale form, active lease, canceled record or mismatch is rejected.

A match restores the outbox's provider acceptance, ledger link and original first-attempt time, and fills a missing last-sent timestamp from the original receipt. It creates an audit event, makes no provider request, consumes no sending allowance and uses no new invitation slot. The encrypted message and access grant are preserved. This is useful after a worker stops between saving provider acceptance and recording delivery status, including beyond the 23-hour retry window.

If no matching local acceptance exists, the record stays in review. An operator note or a typed provider ID is not treated as proof that the original email was accepted. Use the provider verification flow below when the send ledger exists but its acceptance receipt is missing. The existing generation’s retry window is never reset.

`tests/email-review.integration.test.ts` covers clearance races and authority, opt-out protection, event ordering, fresh waitlist proof, and no-send receipt recovery. `e2e/email-recovery.spec.ts` checks the real forms, privacy, stale/permission/MFA boundaries and phone/desktop DOM accessibility with capture disabled. Use `EMAIL_RECOVERY_E2E=1` and required MFA against the isolated browser database. No production provider operation is performed by these tests.


## Verify a missing provider receipt

Apply `20260909080000_invitation_delivery_generations` before starting matching web and worker releases. Stop old workers during this upgrade: every claim and completion must carry the current delivery generation to prevent a late old completion from changing a newer outbox record. Existing deliveries become generation 1; frozen content, grant, original timestamps, status and attempts are preserved.

On a **Needs review** record, open **Check provider record** and enter the provider email ID and a reason. The application makes only `GET /emails/:email_id` to the fixed Resend origin, with redirects disabled, a ten-second timeout and a 256 KiB response ceiling. Only an opaque UUID is accepted. Authorization, session, enabled MFA credential, source permission and current outbox state are checked before the request and again transactionally afterwards; network I/O holds no database locks. [Resend retrieve sent email](https://resend.com/docs/api-reference/emails/retrieve-email)

The existing send ledger must match the frozen idempotency key, category, recipient and full payload. The provider record must exactly match sender, sole recipient, subject, text, HTML and reply-to, have no cc/bcc or scheduled send, fall inside the original attempt window with five minutes of clock margin, and not belong to another ledger record. Only supported sent/delivered/delayed states qualify. An adverse status needs recipient investigation; this GET does not fabricate a bounce webhook or clear a block. Provider normalization, omitted content, an unavailable record or unknown status fails closed. No provider response content or secret access URL is stored in the audit or rendered in the console.

Successful verification imports provider acceptance at its original creation time and reconciles previously signed event receipts. The provider’s `last_event` alone does not invent an inbox-delivery occurrence timestamp. Recovery never revives a canceled or revoked grant, consumes an invite slot, or makes a sending request. The pre-request audit records the authorized lookup; the recovery audit records successful import.

Provider retrieval needs broader API permission than a sending-only key. Keep `RESEND_API_KEY` restricted for ordinary sending where possible; optionally put a separate key with retrieval permission in server-only `RESEND_RECOVERY_API_KEY`. If blank, lookup uses the main key and fails safely if retrieval is forbidden. Resend currently documents `full_access` and `sending_access`; the former also grants other operations, although this recovery code uses GET only. Do not expose either key to browsers or paste it into a review reference. This optional capability creates no new application service or automatic polling job. [Resend API-key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key)

## Send the same invitation again after review

Use the recipient search and **Needs review** or **Accepted by provider** filter, then open **Review sending this invitation again**. Record a reason, the provider-investigation reference and recipient-request reference. Confirm all three acknowledgments, including duplicate-email risk, and enter your current administrator password. Hosted MFA must have been verified within ten minutes. `email.manage` plus `access.read` and `jobs.retry` is required for customer invitations; staff invitations require `email.manage` plus `staff.manage` and still undergo issuer revision and expiry checks.

At least 24 hours must have passed since this generation began or was first attempted, whichever is later. Inside the safe 23-hour retry window, use the existing retry action and key. Deliberate repeat delivery creates a new generation and a fresh delivery key **for the identical encrypted message content, recipient and access URL**. It archives the old generation’s metadata and retains all prior email ledger records, API attempts, acceptance receipts and audit events. The normal worker rechecks eligibility, reserves normal sending capacity and uses the same new key for any retries. Old receipts remain discoverable from the archived ledger ID, including late arrivals. The console shows the latest five prior generations; complete generation identities and original retry clocks remain stored, while private provider identifiers follow [Data retention](DATA_RETENTION.md).

No new grant is allocated and no sixth referral slot is created. Recipient opt-out, active suppression, known adverse receipt, accepted/revoked grant, suspended inviting account, expired staff offer or invalid staff issuer prevents the repeat. A current worker lease and a stale form also prevent it. Repeat approval cannot renew or restore access. The provider investigation and recipient request are human attestations; the form does not claim the old email was never delivered. A recipient can receive multiple copies, all with the same single-use link.

Existing customer invitation and waitlist retry actions now also recheck session, enabled MFA credential and permissions under the staff/access locks. Their original retry deadline and suppression checks remain in force. Do not delete or reset a ledger record to force another attempt.

`tests/invitation-repeat.integration.test.ts` exercises provider mismatches and failure bounds, authority changes during lookup, signed-event reconciliation, concurrent repeat approval, retained budgets, staff eligibility and old-worker completion isolation with PostgreSQL and mocked HTTP. Browser recovery tests exercise the real repeat form, renewed MFA, source visibility, archive display and server-side rejection of arbitrary provider URLs. No real email is sent by these tests. Controlled provider/DNS/inbox qualification remains a launch requirement.

Support reply notifications now use the existing worker with an encrypted outbox, stable retry keys, receipt recovery, and explicit reviewed replacements. See [Support email operations](SUPPORT_EMAIL_OPERATIONS.md). The capture-free packaged browser suite is `SUPPORT_EMAIL_E2E=1` with `e2e/support-email.spec.ts`; run it with administrator MFA and matching sender/encryption configuration in runner and server.
