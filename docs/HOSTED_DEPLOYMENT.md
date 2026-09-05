# Hosted deployment

The hosted edition runs as three independently supervised resources:

- a public Next.js web service;
- a private background worker using the same release and environment;
- PostgreSQL on a private network with automated backups.

[`render.yaml`](../render.yaml) is the checked-in Render Blueprint for this topology. The contract is provider-neutral: another host is suitable when it can run a persistent Node web process, a persistent Node worker, a pre-release migration command, and managed PostgreSQL.

## Before the first deploy

Create and verify the public domain before accepting customer data. The final origin must use HTTPS and must exactly match `APP_URL`. Add the same origin to `AUTH_ALLOWED_ORIGINS` only when requests pass through another trusted browser origin.

Configure these required values in the hosting secret manager:

| Variable | Requirement |
|---|---|
| `APP_URL` | Canonical public HTTPS origin, with no path |
| `DATABASE_URL` | Private PostgreSQL connection string |
| `AUTH_RATE_LIMIT_SECRET` | Unique random value of at least 32 characters |
| `DATA_ENCRYPTION_KEY` | Unique random value of at least 32 characters; never reuse the backup key |
| `RESEND_API_KEY` | Verified transactional-email credential |
| `EMAIL_FROM` | Sender on a verified domain |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Hosted Google sign-in credentials |
| `AUTH_APPLE_CLIENT_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY` | Hosted Apple sign-in credentials |

Set `NODE_ENV=production`, `PILOT_MODE=false`, `DEMO_MODE=false`, and `AUTH_REQUIRE_EMAIL_VERIFICATION=true`. The readiness endpoint intentionally returns HTTP 503 if hosted production is missing any required recovery or sign-in configuration.

Web Push is enabled only when `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` are all present. Generate one VAPID key pair per environment. Automatic SMS delivery remains off for every account unless Twilio credentials are present and the owner explicitly enables it. Email delivery similarly requires Resend and owner opt-in.

## Deploy order

1. Take or verify a restorable database backup.
2. Build one immutable revision from the intended commit.
3. Run `npm run db:deploy` once as the release/pre-deploy command.
4. Start the web service with `npm run start`.
5. Start exactly one worker with `npm run worker`; scale only after validating lease behavior under load.
6. Require `/api/health/live`, `/api/health/ready`, and `/api/health/worker` to return HTTP 200.

The migration `20260904200000_retire_dormant_features` deliberately removes old billing, contact-sync, AI-draft, community-submission, and signup-reward data. Preserve an encrypted pre-migration backup until the release has been qualified. That backup may contain data the current application no longer reads and must receive the same protection as the production database.

## Provider callbacks

Configure provider dashboards with the canonical origin:

- Google: `${APP_URL}/api/auth/oauth/google/callback`
- Apple: `${APP_URL}/api/auth/oauth/apple/callback`

Verify the Resend sender domain, SPF, DKIM, and DMARC before turning on mandatory email verification. Test delivery to at least two unrelated mailbox providers and confirm password recovery reaches the inbox rather than only receiving a successful API response.

## Release smoke test

After every production deploy:

```bash
curl --fail --silent --show-error "$APP_URL/api/health/live"
curl --fail --silent --show-error "$APP_URL/api/health/ready"
curl --fail --silent --show-error "$APP_URL/api/health/worker"
STAGING_BASE_URL="$APP_URL" \
STAGING_SMOKE_USER_EMAIL="smoke@example.com" \
STAGING_SMOKE_USER_PASSWORD="use-the-secret-manager" \
npm run smoke:staging
```

Use a dedicated synthetic smoke account. Then manually verify account creation, email verification, sign-in, password recovery, onboarding, first prepared message, timezone display, notification opt-in, export, and account deletion. Never run browser tests with a real customer account.

## Rollback

Application rollback means redeploying the previous immutable revision. Do not reverse schema migrations in place after new writes. If the new revision cannot operate safely with the migrated schema, stop web and worker traffic, restore the pre-release backup into a separate database, point the previous revision at that database, run the three health checks, and only then resume traffic.

Keep the old database isolated until record counts and customer-visible behavior are verified. Record the release commit, migration result, health responses, smoke-test result, backup identifier, and rollback decision in the deployment system.

## Operations baseline

- Enable managed database point-in-time recovery and test a restore quarterly.
- Alert on readiness or worker-health failures, repeated job failures, authentication abuse, and transactional-email failure.
- Keep web and worker logs free of message bodies, contact details, tokens, and secrets.
- Rotate provider credentials after suspected exposure; do not rotate `DATA_ENCRYPTION_KEY` without a data re-encryption plan.
- Complete the physical iPhone and Android rows in [`MANUAL_DEVICE_QUALIFICATION.md`](MANUAL_DEVICE_QUALIFICATION.md) before inviting external customers.
