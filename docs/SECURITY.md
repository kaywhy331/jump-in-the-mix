# Security Model

## Authentication

- Passwords use Node's `scrypt` with a per-password random salt.
- Session tokens are random, stored as hashes, and delivered through HTTP-only cookies.
- Production cookies use `Secure` and `SameSite=Lax`.
- State-changing browser APIs validate the expected request origin.

Before a broad public launch, add:

- Email verification
- Password-reset email flow
- Login attempt rate limiting
- Optional user MFA
- Session/device management UI

## Tenant isolation

Every business entity is associated with a `workspaceId`. API and server actions locate records through the authenticated workspace rather than trusting browser-supplied ownership fields.

For defense in depth, production PostgreSQL may add row-level policies after deciding how application and migration roles are separated.

## Integration credentials

OAuth refresh tokens and provider secrets are encrypted using AES-256-GCM before database storage. `DATA_ENCRYPTION_KEY` must be unique per environment, stored in the hosting secret manager, and excluded from logs and backups that are not independently encrypted.

## Webhooks

- Stripe verifies the raw body with the Stripe signing secret.
- WhatsApp validates Meta's HMAC signature.
- Website webhooks use a constant-time secret comparison.
- Provider event IDs are stored to prevent duplicate processing.
- Expensive work should be queued rather than performed inline.

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
- OAuth refresh tokens
- Stripe secrets
- Full webhook secrets
- Unredacted contact exports

## Administrative access

Platform administration is controlled by `isPlatformAdmin`. Before production:

- Require MFA
- Audit every admin change
- Avoid unrestricted impersonation
- Mask sensitive Contact and integration fields
- Use separate operational accounts rather than shared credentials

## Infrastructure

- Place the database on a private network when possible.
- Restrict database access to application and migration roles.
- Apply operating-system and image security updates.
- Use encrypted offsite backups.
- Test restoration.
- Rotate integration and webhook secrets after suspected exposure.
