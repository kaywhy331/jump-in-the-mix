# Support email operations

Support replies appear in the customer's ticket when saved. The existing worker processes their email notifications; this adds no service or subscription. Email acceptance means the provider accepted a request, not that the message reached an inbox.

## Normal delivery

- A reply submission has an actor-and-ticket-bound request key. Repeating the same submission returns the saved response; changing its text with the same key is rejected.
- The reply and encrypted email queue entry commit in one transaction. Recipient, sender, reply-to, title, body and ticket URL are frozen. No web action sends a support email directly.
- The worker processes up to ten notifications per pass. A five-minute random lease separates concurrent workers; an expired worker cannot finish another lease. A durable approval survives the original browser session, but the worker checks the approving staff member's current permission and membership revision before dispatch.
- The requester must still have a confirmed, active account and membership of the ticket's workspace. A changed address holds the original notification for review. A removed account removes its case and queued content through the existing deletion flow.
- Each actual HTTP attempt consumes the shared PRODUCT allowance, preserving account-email reserves. A capacity deferral before any HTTP attempt does not start the safe retry clock or spend a worker attempt. Provider blocks apply; opting out of invitations does not block requested support mail.
- Retries keep exactly the same provider key and payload. Five worker attempts are allowed, each with the transactional sender's maximum of three HTTP attempts, all counted against the shared allowance. The safe retry window is 23 hours from the first reserved HTTP attempt. A crash recovers that clock from the send ledger. Recorded acceptance repairs the outbox without another HTTP request.
- Failures contain fixed diagnostic text, not provider response bodies or customer content. When configuration, eligibility, the retry window or attempt limit prevents delivery, the notification goes to review. A missing sender can leave an unprepared notification with no frozen payload; the reply still exists in the ticket. An encryption failure rolls back the whole submission.

## Administrator recovery

Open **Admin → Support → Review notifications**, then the ticket. The email-capacity monitor also reports counts of support notifications in review or overdue; reapply the restricted monitor grants after migration 44. Existing saved monitor notices remain deliverable during the upgrade.

**Check acceptance receipt** reads the original matching local ledger. Staff with both `support.manage` and `email.manage` can also supply a provider email record ID for a bounded read-only lookup. The provider must return the exact frozen recipient, content and original attempt window. Current staff session/MFA and the exact record version are checked before and after the HTTP call. This imports only verified acceptance; signed webhooks remain the source of delivery/bounce timestamps. No send allowance is consumed.

**Queue same email again** requires current `support.manage`, a reason, the current notification version, the original frozen payload, an eligible recipient and remaining original retry allowance. It does not create a new key or reset the clock or attempts. A matching local receipt instead completes the existing notification.

**Approve replacement email** requires both permissions, a current password, MFA verified within ten minutes when enabled, provider and customer-request references, explicit duplicate-risk acknowledgment, and at least 24 hours since the previous notification began. It creates a new generation with the same recipient and complete content but a new key. It preserves the original generation, attempts and receipts. It cannot bypass a provider block, changed recipient, adverse receipt, stale review or newer generation. No extra support reply is created. This is a deliberate second email; provider idempotency does not prevent a duplicate across generations.

**Close without another email** resolves a review without deleting the reply or retracting a message that the provider may already have accepted. Every recovery action records a content-free platform audit receipt with the administrator and reason.

Legacy pending, failed and development-previewed emails did not save an original delivery key or frozen payload. Migration 44 holds them for review and preserves conversation/provider facts. They never replay automatically. Review provider history and close the notification; add a new, explicit response if the customer still needs an email. An address change follows the same new-response path rather than silently forwarding private saved content elsewhere.

## Retention and limits

Encrypted notifications and their generation history follow their support conversation's retention: resolved/closed conversations inactive for 180 days are removed with all their messages and notifications. Recent notification activity and queued/sending notifications protect the case from cleanup. A held review does not keep an otherwise inactive closed case forever. Active/review notification ledgers are protected from early receipt retirement while the case exists. Account deletion cascades queue content; minimized email/provider ledgers retain their existing replay and accounting rules.

No database lease can retract a provider request already in flight. The final eligibility check occurs before the request; an account or permission change immediately afterwards may race with that request. Stable keys and the bounded window reduce duplicate risk but do not prove physical inbox delivery or exactly-once delivery after provider failure. Keep provider/DNS/inbox qualification and independent worker/monitor hosting in the launch checklist.

Local qualification is recorded in [Product completion](PRODUCT_COMPLETION.md). The isolated browser suite is `e2e/support-email.spec.ts` with `SUPPORT_EMAIL_E2E=1`, administrator MFA and the same encryption key/sender in runner and server. It performs DOM/axe checks without screenshots, video or tracing and does not run a worker or send real email.
