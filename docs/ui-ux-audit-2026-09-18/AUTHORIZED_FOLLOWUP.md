# Authorized qualification follow-up — September 18, 2026

The owner reviewed the presented materials and instructed: “reviewed. go ahead and implement i authorize”. PUBLIC-05 is complete with no wording changes requested. The checklist now records **175 of 184 complete; nine awaiting qualification**. This approval does not supply participant observations, physical-device results or inbox receipts.

## Implemented correction

An authorized test against the actual email provider exposed two failures that synthetic tests had missed:

- Production had a sending-only API key and no receipt-recovery key. Provider record reads returned `401 restricted_api_key`. A separate recovery credential is now configured on the production web service; the existing sending credential remains unchanged. Resend requires its `full_access` permission for these reads because the other available permission is `sending_access`.
- Actual Resend records returned `null` for unused CC/BCC fields. Exact-content validation previously accepted only empty arrays. The validator now accepts `null` only when the corresponding expected list is empty. It still rejects missing fields, extra recipients, altered message content, a missing required reply-to, and adverse/unknown delivery states.

The change is isolated on branch `release/email-receipt-qualification-20260918`, revision `8520b73cc41d72c40ecec1ca06ca752fd95ce5d5`. Schema, migration history, dependency versions and deployment configuration are unchanged. Unrelated working-tree changes were preserved.

## Verification

- 114 focused tests passed with no failures or skips: provider receipt validation, email-review integration and invitation-repeat integration. Integration tests used a disposable local database that was removed afterward.
- Production build and TypeScript checks passed in the isolated release package. Build-time database lookups used the application's unavailable-database fallback; live database checks are recorded separately.
- The corrected candidate verified an actual provider record using the original recorded attempt time and the dedicated recovery credential before deployment.
- The live provider test used only Resend's documented delivered/bounced simulator recipients. For the delivered case, the test deliberately lost one response after provider acceptance, then retried the identical idempotency key and payload. Both requests returned the same provider message ID. A subsequent cached retry made no provider request, and a changed payload was rejected.
- Two provider messages were created: one delivered simulation and one bounced simulation. The first recipient fixture was rejected by the provider for an overlong address and created no provider message. Attempt accounting and send/event records were retained; customer records and suppressions were not reset.

## Published release

| Target | Deployment | Result |
| --- | --- | --- |
| Production web | `dep-damqb3bm8hqs73aei980` | Live on the tested revision; receipt recovery verified with the configured credential. |
| Production worker | `dep-damq9g740ujc738ushig` | Same revision; synthetic no-op job processed and removed. |
| Stable test site | `6aada4f0f08a71f4b359a8be` | Published to https://jump-in-the-mix-test.netlify.app; existing database quota outage remains. |

Production postflight matched 629 source files and 19 served assets, confirmed migration compatibility, and passed liveness, database, worker and recovery-boundary health checks. Public pages returned 200; protected pages redirected signed-out requests to login. Signed delivered/bounced events reached the application. Its status formatter returned the corresponding mail-server-delivery and bounce labels. The deployed receipt validator accepted the delivered record, rejected the adverse record, and local suppression blocked another send attempt to the bounced simulator address. No extra provider message was created by postflight.

Staging matched 16 served assets. Homepage/FAQ passed mobile/light and desktop/dark checks with no axe violations, overflow or page errors. Login, Terms, Privacy and database/worker health remain 503 from the existing quota outage. Those routes are unavailable, not passed.

[Sanitized verification record](authorized-verification.json). Provider simulation supplies real API, signed-event and idempotency evidence; it does not establish receipt by a person's inbox or device.

## Remaining qualification

The nine open items are HOME-02, DEMO-03, PRO-05, NAV-05, SEND-05, REVIEW-05, NOTIFY-05, EMAIL-05 and RECOVER-05. The [remaining qualification register](REMAINING_QUALIFICATION.md) identifies their evidence needs; the [runbook](QUALIFICATION_RUNBOOK.md) provides executable tasks. EMAIL-05 retains the controlled-inbox and eligible staff-UI recovery session requirements. NOTIFY-05 still needs actual scheduled reminder/device receipt observations.

Staging's existing Neon quota outage remains separate from production. No billing upgrade or database substitution was performed. Production implementation and provider evidence cannot substitute for that staging database recovery.

Raw records are retained in `.artifacts/ui-ux-authorized-20260918/`. Provider credentials and private logs are excluded from the release documentation. Provider references: [test recipients](https://resend.com/docs/dashboard/emails/send-test-emails), [API key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
