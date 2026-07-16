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

Before enabling mandatory verification in production, configure and validate the transactional-email provider. Optional user MFA remains a future hardening item.

## Browser request boundary

- State-changing browser requests are rejected when their `Origin` is not same-origin or explicitly trusted.
- `Sec-Fetch-Site` is used as a secondary signal when an Origin header is unavailable.
- Signed provider webhook routes are explicitly separated from the browser-origin rule.
- Next.js Server Actions keep their built-in origin comparison, accept only configured additional origins, and use a one-megabyte body limit.
- Responses apply `nosniff`, clickjacking protection, a strict referrer policy, restrictive browser permissions, COOP/CORP, and production HSTS.

## Tenant isolation

Every business entity is associated with a `workspaceId`. API and server actions locate records through the authenticated workspace rather than trusting browser-supplied ownership fields.

PostgreSQL integration tests create two independent workspaces and verify that one cannot retrieve or mutate the other's Contacts, Groups, Mixes, reusable Jumps, generated Jumps, custom fields, or broadcast schedules. Static regression tests require tenant mutation modules to derive the workspace from the authenticated session.

For defense in depth, production PostgreSQL may add row-level policies after deciding how application and migration roles are separated.

## Integration credentials

OAuth refresh tokens and provider secrets are designed to be encrypted using AES-256-GCM before database storage. `DATA_ENCRYPTION_KEY` must be unique per environment, stored in the hosting secret manager, and excluded from logs and backups that are not independently encrypted.

Provider integrations are not considered complete until their encryption, rotation, revocation, and recovery paths have passed production-like staging tests.

## Webhooks

Planned provider webhooks must meet all of the following requirements before launch:

- Stripe verifies the raw body with the Stripe signing secret.
- WhatsApp validates Meta's HMAC signature.
- Website webhooks use a constant-time secret comparison.
- Provider event IDs are stored to prevent duplicate processing.
- Expensive work is queued rather than performed inline.
- Public webhook routes do not rely on a browser session and remain outside the browser Origin gate only after provider signature verification is implemented.

## AI

- AI receives only the data required for the requested draft.
- Responses are parsed through strict schemas.
- AI cannot execute arbitrary database queries.
- Multi-entity actions require user confirmation.
- Built-in generation rejects unknown placeholders and Public Notes assumptions.

## Data minimization

Operational logs must not contain:

- Passwords
- Raw session tokens
- Raw email-verification or password-reset tokens
- OAuth refresh tokens
- Stripe secrets
- Full webhook secrets
- Unredacted contact exports

Authentication rate-limit keys are derived with a keyed SHA-256 digest rather than storing raw email/IP combinations as the bucket key. Session tables contain only the session-token hash.

## Administrative access

Platform administration is controlled by `isPlatformAdmin`. Before production:

- Require MFA for platform administrators.
- Audit every admin change.
- Implement clearly indicated, time-limited, view-only impersonation.
- Mask sensitive Contact and integration fields.
- Use separate operational accounts rather than shared credentials.

## Infrastructure

- Place the database on a private network when possible.
- Restrict database access to application and migration roles.
- Apply operating-system and image security updates.
- Use encrypted offsite backups.
- Test restoration.
- Rotate integration, authentication, and webhook secrets after suspected exposure.
- Rehearse the production Prisma migration against a populated database and validate rollback/restoration before deployment.
