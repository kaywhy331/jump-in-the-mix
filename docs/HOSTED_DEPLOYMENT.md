# Hosted deployment

For the Netlify web and scheduled-worker deployment, see [Netlify deployment](NETLIFY_DEPLOYMENT.md). The persistent web/worker topology below remains available through Render or another Node host.

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

Each phone opts in under **Settings → Notifications → Push reminders → Turn on**. On iPhone or iPad 16.4+, first use Safari's **Share → Add to Home Screen**, then open that installed app. Android users can enable reminders in a supported browser such as Chrome. Use **Send test notification** to check that the current device receives a server-sent notification; an accepted push request alone does not prove the OS displayed it.

Reminders are bound to the browser's signed-in session. Sign-out, session revocation and expiry stop that device's delivery. Renewing the same account's current session preserves its opt-in; replacing it with another account requires that account to choose **Turn on**. The session-ownership migration leaves existing subscriptions unbound because their original browser session cannot be inferred safely; those devices need a fresh opt-in. The browser's push permission may remain granted while application reminders are off.

Queued pushes verify the current account and active subscription before showing application notification text. If the account or connection cannot be confirmed, the application suppresses that text. Browser-generated fallback notifications and OS behavior after delivery still require physical-device qualification. Notification tests in automation use simulated browser APIs and mocked providers; they do not qualify receipt on an actual phone.

The worker groups newly due follow-ups into a notification for each subscribed device. Delivery receipts track the follow-up's scheduled occurrence, so later follow-ups can notify on the same day without repeating earlier reminders. Quiet hours defer alerts until the next allowed worker pass. Expired subscriptions are removed, and temporary failures have bounded retries. The free test deployment checks in the background; delivery is not an exact-minute alarm and can be delayed by the scheduler or device.

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
