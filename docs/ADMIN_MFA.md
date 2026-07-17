# Administrator multi-factor authentication

Jump in the Mix requires a fresh second factor before a platform administrator can open `/admin`, use administrator actions, or begin an audited view-only support session.

## Policy

`AUTH_REQUIRE_ADMIN_MFA` controls enforcement:

- In production, enforcement defaults to `true` when the variable is omitted.
- In development, enforcement defaults to `false` so normal local workflows remain easy to run.
- Set the variable explicitly in every deployed environment so the intended policy is visible in configuration review.

`AUTH_ADMIN_MFA_MAX_AGE_MINUTES` controls how long one successful step-up remains valid for the current signed-in session. The default is 720 minutes. A new browser session never inherits an old session's step-up.

Administrator MFA requires `DATA_ENCRYPTION_KEY`. Deployment must fail closed at enrollment if that key is not configured.

## Enrollment

1. A platform administrator signs in with the normal password.
2. Opening Admin redirects to `/account/admin-mfa` when no enabled credential exists.
3. The page displays a QR code and a manual Base32 secret for any standards-based TOTP authenticator.
4. Enrollment requires the current account password and the current six-digit authenticator code.
5. Successful enrollment marks the current application session as verified and displays ten one-time recovery codes.
6. Recovery codes must be copied into a password manager or another approved secure system before leaving the page.

The pending enrollment secret is encrypted immediately. An unfinished setup may be resumed briefly; an older pending setup is rotated before it is shown again.

## Verification and recovery

After enrollment, an unverified or expired application session is redirected to the administrator verification page. The administrator may enter:

- The current six-digit TOTP code; or
- One unused recovery code.

TOTP verification accepts a narrow clock-skew window and stores the last accepted counter. The same TOTP interval cannot be replayed. Recovery codes are stored only as keyed SHA-256 hashes and are removed atomically after one successful use.

When an administrator loses the authenticator and every recovery code, another authorized operator must follow the incident-response process. Do not expose or decrypt the existing secret. Verify the administrator's identity through an approved out-of-band process, revoke active sessions, remove the old MFA credential directly through a reviewed administrative database operation, and require fresh enrollment.

## Session and credential events

Administrator step-up records are removed when:

- The application session expires or is signed out.
- A remote session is revoked.
- The user signs out everywhere.
- The password is reset.
- The password is changed; the current session remains signed in but must step up again before returning to Admin.
- The session is removed because the per-user session cap is exceeded.

Support impersonation never replaces the authenticated administrator identity. Starting a support view requires a currently verified administrator session, and the central request boundary continues to reject every unsafe browser mutation until the support view ends.

## Storage and audit

- `AdminMfaCredential.secretCiphertext` contains an AES-256-GCM encrypted TOTP secret.
- `AdminMfaCredential.recoveryCodeHashes` contains only keyed hashes.
- `AdminMfaCredential.lastUsedCounter` prevents TOTP replay.
- `AdminMfaSession` records step-up state by application session ID and administrator user ID.
- Enrollment and verification events are written to the workspace audit log with the real administrator actor.
- Raw TOTP secrets, authenticator codes, recovery codes, QR payloads, and decrypted credential material must never be written to logs, tickets, analytics, or email.

## Deployment

Apply the migration:

```text
20260717070000_admin_mfa
```

Then configure:

```text
AUTH_REQUIRE_ADMIN_MFA=true
AUTH_ADMIN_MFA_MAX_AGE_MINUTES=720
DATA_ENCRYPTION_KEY=<unique high-entropy production secret>
AUTH_RATE_LIMIT_SECRET=<unique high-entropy production secret>
```

Do not rotate `DATA_ENCRYPTION_KEY` without a reviewed re-encryption or forced-reenrollment plan.

## Validation

Automated coverage includes:

- The RFC 6238 SHA-1 test vector.
- Encrypted enrollment and ten recovery codes.
- Rejection of a replayed TOTP interval.
- One-time recovery-code consumption.
- Step-up creation and cleanup.
- Static administrator-boundary checks.
- An isolated production migration rehearsal with durable credential and session writes.
- Desktop browser enrollment, QR/manual-secret setup, recovery-code capture, a new sign-in, recovery-code verification, Admin access, and view-only mutation rejection.

Production qualification must still include an authenticator-app enrollment on the deployed origin, clock-skew behavior, the lost-device operator procedure, alerting for repeated verification failures, and review of administrator audit retention.
