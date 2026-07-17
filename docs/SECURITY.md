# Security Model

## Authentication

- Passwords use bcrypt with a work factor of 12. New and changed passwords require at least 12 characters and remain within bcrypt's supported input length.
- Unknown-account login attempts still perform a bcrypt comparison before returning the same generic error used for invalid passwords.
- Session tokens are cryptographically random, stored only as SHA-256 hashes, and delivered through HTTP-only cookies.
- Production cookies use `Secure`, `SameSite=Lax`, and a root path.
- Sessions record a bounded user-agent string, the best available client IP, last-seen time, creation time, and expiration.
- A configurable per-user cap removes the oldest sessions after a successful new sign-in.
- Users can inspect and revoke remote sessions, sign out other devices, or sign out everywhere.
- Password changes close other sessions. Password resets close every session.
- Optional email verification and password recovery use one-time, expiring tokens stored only as hashes.
- Verification, recovery, login, registration, and authenticated action-event requests use database-backed rate limits.
- Public reset and verification responses avoid disclosing whether an email is registered.

Before enabling mandatory verification in production, configure and validate the transactional-email provider. Optional MFA for normal workspace users remains a future hardening item; platform-administrator MFA is implemented and enforced by default in production.

## Browser request boundary

- State-changing browser requests are rejected when their `Origin` is not same-origin or explicitly trusted.
- `Sec-Fetch-Site` is used as a secondary signal when an Origin header is unavailable.
- Signed provider webhook routes are explicitly separated from the browser-origin rule.
- Next.js Server Actions keep their built-in origin comparison, accept only configured additional origins, and use a one-megabyte body limit.
- Responses apply `nosniff`, clickjacking protection, a strict referrer policy, restrictive browser permissions, COOP/CORP, and production HSTS.
- While an administrator support-view cookie is present, all unsafe browser methods are rejected with HTTP 403 except the dedicated endpoint that ends the view-only session.
- Desktop browser coverage proves administrator enrollment and recovery-code step-up; desktop and mobile coverage prove normal authenticated workflows; and an impersonated browser POST proves the central view-only mutation boundary.

## Tenant isolation

Every business entity is associated with a `workspaceId`. API and server actions locate records through the authenticated workspace rather than trusting browser-supplied ownership fields.

PostgreSQL integration tests create two independent workspaces and verify that one cannot retrieve or mutate the other's Contacts, Groups, Mixes, reusable Jumps, generated Jumps, custom fields, broadcasts, imports, or provider links. Static regression tests require tenant mutation modules to derive the workspace from the authenticated session.

The complete authenticated application subtree resolves its workspace through the server layout. Administrator pages add an explicit platform-administrator guard and a current MFA step-up. Support impersonation changes only the read context after confirming that the target user belongs to the selected workspace; the authenticated actor remains the administrator for auditing and authorization.

For defense in depth, production PostgreSQL may add row-level policies after deciding how application and migration roles are separated.

## Integration credentials

OAuth refresh tokens and provider secrets are encrypted with AES-256-GCM before database storage. `DATA_ENCRYPTION_KEY` must be unique per environment, stored in the hosting secret manager, and excluded from logs and backups that are not independently encrypted.

Google Contacts controls:

- The OAuth redirect URI is explicit and must exactly match the configured Google OAuth web client.
- OAuth `state` is random, expires after ten minutes, can be used once, and is stored only as a SHA-256 hash.
- The integration requests read-only Google Contacts access and does not write to Google.
- Access and refresh tokens are encrypted before storage and never returned by the account status API.
- Access-token refresh happens server-side.
- Revoked credentials change the connection state and require reconnecting.
- Connecting a different Google account retires old provider links and cancels active provider jobs while preserving local Contacts.
- Disconnect removes locally stored credentials, stops future syncs, attempts provider revocation, and preserves local Contacts.
- Provider reads and user-initiated sync actions are authenticated, workspace-scoped, plan-gated, rate-limited, and blocked during view-only administrator support sessions.
- Google deletions do not delete local Contacts.

Do not rotate `DATA_ENCRYPTION_KEY` without a credential re-encryption plan. A destructive rotation requires every connected provider account and every administrator authenticator to be re-enrolled.

Provider integrations are not considered production-ready until credential rotation, OAuth consent, revocation, inbox/provider behavior, and recovery paths pass production-like staging tests.

## Webhooks

Provider webhooks must meet all of the following requirements before launch:

- Stripe verifies the raw body with the Stripe signing secret.
- WhatsApp validates Meta's HMAC signature.
- Website webhooks use a constant-time secret comparison.
- Provider event IDs are stored to prevent duplicate processing.
- Expensive work is queued rather than performed inline.
- Public webhook routes do not rely on a browser session and remain outside the browser Origin gate only after provider signature verification is implemented.

Google Contacts in this release uses OAuth plus scheduled/delta pulls rather than an inbound webhook.

## AI

- AI receives only the data required for the requested draft.
- Responses are parsed through strict schemas.
- AI cannot execute arbitrary database queries.
- Multi-entity actions require user confirmation.
- Built-in generation rejects unknown placeholders and Public Notes assumptions.

## Data minimization

Operational logs must not contain:

- Passwords.
- Raw session tokens.
- Raw administrator impersonation tokens.
- Raw administrator TOTP secrets, TOTP codes, recovery codes, or QR payloads.
- Raw email-verification or password-reset tokens.
- OAuth authorization codes.
- OAuth access or refresh tokens.
- Provider client secrets.
- Stripe secrets.
- Full webhook secrets.
- Unredacted contact exports or Google People responses.

Authentication rate-limit keys are derived with a keyed SHA-256 digest rather than storing raw email/IP combinations as the bucket key. Session and administrator-support tables contain only token hashes. Administrator TOTP secrets are AES-256-GCM encrypted, recovery codes are keyed hashes, and only the last accepted TOTP counter is retained for replay prevention. Google account status responses contain connection state, labels, counts, and errors but never encrypted or decrypted credentials.

## Administrative access

Platform administration is controlled by `isPlatformAdmin` plus a fresh administrator MFA step-up when `AUTH_REQUIRE_ADMIN_MFA` is enabled. Enforcement defaults to enabled in production.

Implemented administrator MFA controls:

- Standards-based six-digit TOTP enrollment with QR and manual-secret options.
- Current-password confirmation before enrollment.
- Encrypted TOTP secret storage.
- Ten one-time recovery codes stored only as keyed hashes.
- TOTP replay prevention through the last accepted counter.
- Database-backed rate limits for enrollment and verification.
- Step-up state scoped to one authenticated application session and bounded by `AUTH_ADMIN_MFA_MAX_AGE_MINUTES`.
- Step-up invalidation on sign-out, remote session revocation, password change, password reset, expiration, and session-cap eviction.
- Audited enrollment and verification events.

Implemented support-view controls:

- A fresh administrator MFA step-up is required before the view can begin.
- The target user and workspace membership are revalidated server-side before a session begins.
- A support reason of 10–500 characters is mandatory.
- Tokens are random, HTTP-only, stored only as SHA-256 hashes, and expire after 30 minutes by default.
- Only one active support-view grant is retained per administrator.
- The application displays a persistent banner identifying the target, reason, expiry, and view-only mode.
- Password, device-session, and other target-account security controls are not exposed.
- All impersonated browser writes are blocked centrally.
- Start and end events are written to the target workspace audit log with the real administrator actor.

Before operationally enabling administrator support views in production:

- Confirm `AUTH_REQUIRE_ADMIN_MFA=true`, validate enrollment on the deployed origin, and rehearse the lost-device procedure.
- Review all administrator actions for comprehensive audit coverage.
- Mask sensitive Contact and integration fields according to support role.
- Use separate operational accounts rather than shared credentials.
- Complete browser-driven route and mutation tests in production-like staging.
- Alert on repeated administrator verification failures and unusual support-view activity.

Follow `docs/ADMIN_MFA.md` for enrollment, recovery, deployment, and incident procedures.

## Infrastructure and migrations

- Place the database on a private network when possible.
- Restrict database access to application and migration roles.
- Apply operating-system and image security updates.
- Use encrypted offsite backups.
- Test restoration.
- Rotate integration, authentication, and webhook secrets after suspected exposure.
- The committed legacy baseline is generated directly from `main` and CI byte-compares it with a fresh Prisma diff to prevent drift.
- Existing populated `db push` databases resolve that complete baseline as applied once before the first `migrate deploy`.
- Clean databases execute the complete baseline and guarded forward migration directly through `migrate deploy`.
- CI rehearses clean and populated deployments, validates preservation, executes pre-traffic reverse SQL, reapplies the forward migration, and independently proves administrator-control-plane and administrator-MFA tables accept durable writes.
- Production rollback uses a validated backup restore; reverse SQL is not a substitute after new-schema data exists.
