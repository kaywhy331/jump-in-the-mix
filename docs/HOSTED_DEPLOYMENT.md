# Hosted deployment

The production destination is Render with Route 53 DNS, a continuous worker, separate production PostgreSQL and Resend. The current user instruction authorizes completing deployment; the earlier preparation-only deferral no longer describes the active task. Render account access, production email/support configuration and external qualification are still required. Payments remain deferred. See [Production structure and launch preparation](PRODUCTION_LAUNCH_PLAN.md); this runbook is not evidence of an active production deployment.

For the Netlify web and scheduled-worker deployment, see [Netlify deployment](NETLIFY_DEPLOYMENT.md). The persistent web/worker topology below remains available through Render or another Node host.

The hosted edition runs as three independently supervised resources:

- a public Next.js web service;
- a private background worker using the same release and environment;
- PostgreSQL on a private network with automated backups.

[`render.yaml`](../render.yaml) is the checked-in Render Blueprint for this topology. The contract is provider-neutral: another host is suitable when it can run a persistent Node web process, a persistent Node worker, a pre-release migration command, and managed PostgreSQL.

The Blueprint uses current compute identifiers, explicitly selects PostgreSQL 16 and 5 GB of database storage, and pins Node 22.23.2, the latest Node 22 security release in the [official release index](https://nodejs.org/dist/index.json) checked September 9. GitHub CI and container builds use the maintained Node 22 line; final local qualification also uses 22.23.2. It prompts for origin, sender and public operator configuration on the web service and references those exact values from the worker. Render ignores `sync: false` entries in environment groups, so only fixed values and generated shared application keys live in that group. Optional SMS/push/OAuth credentials are configured there only when enabled. Automatic deploys are off: deploy both services at the same reviewed commit and coordinate migrations with the old worker. The file passed the current [Render Blueprint schema](https://render.com/schema/render.yaml.json) on September 9; account/API validation and hosted execution remain pending. See [Render's specification](https://render.com/docs/blueprint-spec) for secret prompts and current plan identifiers.

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
| `RESEND_WEBHOOK_SECRET` | Signing secret for the Resend endpoint at `/api/webhooks/resend` |
| `EMAIL_FROM` | Sender on a verified domain |
| `EMAIL_REPLY_TO` | Monitored reply mailbox |
| `PUBLIC_OPERATOR_NAME` | Actual service operator, displayed in the public notices |
| `PUBLIC_SUPPORT_EMAIL` | Monitored public account/privacy support mailbox |
| `PUBLIC_BACKUP_RETENTION_NOTICE` | Actual backup expiry and deletion handling; see [Public notices](PUBLIC_POLICY_DRAFT.md) |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Optional: complete Google sign-in credentials if enabled |
| `AUTH_APPLE_CLIENT_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY` | Optional: complete Apple sign-in credentials if enabled |

The planned launch combines a public waitlist released in administrator waves with five personal referrals per member. Shared grants, automatic waves, recipient withdrawal, the shared invitation outbox, and granular staff permissions are now implemented locally. Complete the remaining launch qualification before activating them; see [the full infrastructure plan](ADMIN_OPERATIONS_INFRASTRUCTURE_PLAN.md). Configure Resend and `DATA_ENCRYPTION_KEY`, apply reviewed migrations, and use an existing verified owner for the release rehearsal. Google and Apple may remain unset. The [launch plan](PRODUCTION_LAUNCH_PLAN.md) retains the approximately $22/month core starter setup and free-tier limitations.

Set `NODE_ENV=production`, `PILOT_MODE=false`, `DEMO_MODE=false`, `AUTH_REQUIRE_EMAIL_VERIFICATION=true`, and `AUTH_REQUIRE_ADMIN_MFA=true`. The readiness endpoint intentionally returns HTTP 503 if hosted production is missing any required recovery, sign-in or public operator configuration.

Web Push is enabled only when `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` are all present. Generate one VAPID key pair per environment. Automatic SMS delivery remains off for every account unless Twilio credentials are present and the owner explicitly enables it. Automatic follow-up email similarly requires Resend and owner opt-in. Daily digests and weekly reports start off for new preferences; existing members keep their saved settings. Transactional access/verification messages follow their specific user requests. All outgoing application email shares the limits and account reserve described in [Email operations](EMAIL_OPERATIONS.md).

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
- Resend: `${APP_URL}/api/webhooks/resend`; select the exact events and configure the signing secret in [Email operations](EMAIL_OPERATIONS.md).

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

Application rollback means redeploying a previous immutable revision that is compatible with the current database. Do not reverse schema migrations in place after new writes. If no reviewed revision can operate safely with the current schema, stop web and worker traffic and follow [Restore recovery](RESTORE_RECOVERY.md) for a separate isolated target. Keep its recovery hold and use code that enforces that hold. Restoring an older backup and passing health checks cannot authorize traffic: newer content/access/send decisions, fresh access and guarded reopening must be resolved first. The [full bundle/cutoff path](RECOVERY_BUNDLES.md) now covers captured contents and finalization of an available source; [guarded reopening](RECOVERY_REOPENING.md) now restores access and safe background work while preserving admission and messaging pauses.

Keep the old database isolated until record counts and customer-visible behavior are verified. Record the release commit, migration result, health responses, smoke-test result, backup identifier, and rollback decision in the deployment system.

## Operations baseline

- Enable managed database point-in-time recovery and test a restore quarterly.
- Alert on readiness or worker-health failures, repeated job failures, authentication abuse, and transactional-email failure.
- Keep web and worker logs free of message bodies, contact details, tokens, and secrets.
- Rotate provider credentials after suspected exposure; do not rotate `DATA_ENCRYPTION_KEY` without a data re-encryption plan.
- Complete the physical iPhone and Android rows in [`MANUAL_DEVICE_QUALIFICATION.md`](MANUAL_DEVICE_QUALIFICATION.md) before inviting external customers.

## Staff onboarding migration

Deploy `20260909010000_staff_invitations` with matching web and worker builds. It adds staff invitation records and allows the existing encrypted invitation outbox to reference exactly one customer grant or staff invitation. It needs no new paid service. Keep administrator MFA enabled and use the shared sender, webhook and scheduler configuration. Owners issue, revoke and safely retry staff invitations in Admin → Team. See [Staff access](STAFF_ACCESS.md) for the new-account flow and its separation from customer admission.

Before serving a new release, run `npm run db:verify-release` after its reviewed migration step. The web readiness route and worker startup now validate the packaged schema manifest; see [Database release checks](DATABASE_RELEASE_CHECKS.md) for status meanings, the five-minute startup wait, and rollback limits.
