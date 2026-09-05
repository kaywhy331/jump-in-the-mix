# Security model

## Authentication and sessions

Passwords use bcrypt with work factor 12 and a 12-character minimum. Unknown-account sign-in still performs a comparison before returning the generic error. Hosted accounts may also use one-time email links, Google, or Apple; OAuth state is random, hashed at rest, expiring, and single-use.

Session tokens are random and stored only as SHA-256 hashes. Cookies are HTTP-only, `SameSite=Strict`, and Secure on public production origins. Sessions expire after at most 14 days by default, are capped per user, and can be inspected or revoked. Password changes rotate the current session and close other sessions; password reset closes all sessions. Email verification, password reset, sign-in, registration, and authenticated mutations are database-rate-limited.

Hosted production refuses readiness without HTTPS, mandatory email verification, verified transactional email configuration, and configured Google and Apple sign-in. The loopback Docker edition may omit email and provides an operator-only password reset command.

## Browser boundary

Unsafe browser requests must be same-origin or come from an explicitly allowed origin. Fetch Metadata is a secondary signal. Apple’s signed callback and separately verified provider webhooks are the only scoped exceptions. Next.js Server Actions use the same origin allowlist and a one-megabyte body limit.

Responses set a nonce-based Content Security Policy, HSTS on production, MIME sniffing and framing protections, a strict referrer policy, restrictive Permissions Policy, COOP/CORP, and cross-domain-policy denial. Administrator support views are centrally limited to safe methods until explicitly ended.

## Tenant and administrator isolation

`workspaceId` comes from the authenticated session, never trusted browser input. Routes, actions, imports, exports, worker tasks, notifications, review requests, and support access scope every query to it. Integration tests maintain two independent businesses to catch cross-tenant reads and writes.

Platform administration requires an allowlisted account and, in production, a current TOTP MFA step-up. TOTP secrets are AES-256-GCM encrypted, recovery codes are keyed hashes, and accepted counters prevent replay. Support views keep the real administrator as actor, expire, display a warning, and are read-only.

## Data protection

`DATA_ENCRYPTION_KEY` is unique per environment and stored only in the hosting secret manager. Backup archives use a separate key, AES-256-GCM authentication, manifests, checksums, migration inventories, and critical row counts. Restore into the source database is blocked.

Logs and diagnostics must not contain passwords, raw session or auth tokens, MFA secrets/codes, OAuth codes, provider credentials, encryption keys, contact exports, message bodies, or customer notes. Automatic-delivery and notification records contain bounded provider identifiers and status, not credentials.

Spreadsheet export neutralizes formula-leading values. Account deletion requires reauthentication and an exact confirmation phrase, deletes owned data transactionally, and leaves only a one-way subject hash with aggregate counts in the deletion audit.

## Provider and operational controls

Resend, Web Push, and Twilio are disabled when credentials are absent. Automatic customer-message delivery is additionally disabled per business until the owner opts in and chooses a review window. Durable claims prevent duplicate sending; an uncertain provider response is not retried automatically. Quiet hours use the owner’s timezone.

Review/referral links use random expiring tokens. Public responses are schema-validated, rate-limited, single-use where required, and reveal no private contact record.

Keep PostgreSQL private, enable managed backups and point-in-time recovery, patch dependencies and base images, alert on readiness/worker failure and authentication abuse, and rehearse restoration. Do not rotate the data-encryption key without a re-encryption plan.

See [Hosted deployment](HOSTED_DEPLOYMENT.md), [Operations readiness](OPERATIONS_READINESS.md), and [Admin MFA](ADMIN_MFA.md).
