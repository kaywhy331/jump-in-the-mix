# Product readiness hand-off (September 12, 2026)

What still separates the web app from a first real customer wave, split into work that only the owner can do and work already done from the repository. Every step below is quoted from the repo's own runbooks; nothing here is a new policy. Sources are linked so the runbook stays canonical.

## Owner decisions to record

These block launch regardless of code state ([Production launch plan](PRODUCTION_LAUNCH_PLAN.md), roadmap P0.3 and P0.5).

| Decision | Where it lands |
| --- | --- |
| Total account-and-reservation limit and outstanding-invitation limit. Both are **0** today, so no invitations can go out. | Admin → Admission ([Admission controls](ADMISSION_CONTROLS.md)) |
| Launch date for the first wave. The first configured worker pass schedules the wave seven days ahead. | [Waitlist operations](WAITLIST_OPERATIONS.md) |
| Which sign-in providers launch. Google and Apple are optional, but each is all-or-nothing. | Production environment |
| Operating budget and alert thresholds, including the monitor's added cost below. | [Independent monitor deployment](INDEPENDENT_MONITOR_DEPLOYMENT.md) |
| Business, tax and support policies; operator name, support mailbox and backup-retention notice for the public pages. | `PUBLIC_OPERATOR_NAME`, `PUBLIC_SUPPORT_EMAIL`, `PUBLIC_BACKUP_RETENTION_NOTICE` |
| Approval of scenario-to-template mappings, the demo's receipt and draft-reset behaviour (P0.3); phase owners, measurement windows and recruitment criteria (P0.5). | [Homepage experience roadmap](HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md) |

## Steps only the owner can run

### 1. Set admission ceilings and let the worker schedule the first wave

1. Sign in to a named admin account with `settings.manage`; production MFA stays on.
2. Admin → Admission: set the total limit and the outstanding-invitation limit (the second cannot exceed the first). Saving needs an audit reason, the current password and an authenticator verification less than ten minutes old.
3. Admin → Waitlist: check eligible count, available reservations, wave date and worker health.
4. Rehearse confirmation, manual selection, referral and signup against a controlled test inbox before authorising a live wave. A due wave waits unless there is room for its entire batch.

### 2. Activate independent monitoring and alerts

Approve the added cost first: about $7.25 a month on Render plus up to $1 a month on AWS, and name the exact alert recipient, who must click the SNS confirmation.

```bash
node scripts/prepare-operations-stack.mjs --output /private/uptime-stack.json
aws cloudformation validate-template --template-body file:///private/uptime-stack.json
```

Then deploy the stack with `CAPABILITY_IAM` and the `AlertEmail` parameter, install the monitor image with the restricted credentials from `infra/operations/`, set `OPS_ALERT_SNS_TOPIC_ARN` or `OPS_ALERT_WEBHOOK_URL` (never both), verify one complete observation, `/api/health/monitor` freshness and real five-minute recurrence, run the `simulate-unavailable` Lambda qualification, and record the receipts. Local check: `npm run ops:check`.

### 3. Qualify unattended worker scheduling

Confirm the Cloudflare account is on Workers Free with quota (a minute timer is 1,440 invocations a day), approve storing the worker hand-off secret in Cloudflare, then:

```bash
npx --yes wrangler@4.129.0 secret put NETLIFY_WORKER_SECRET --config infra/cloudflare-scheduler/wrangler.jsonc
npx --yes wrangler@4.129.0 deploy --config infra/cloudflare-scheduler/wrangler.jsonc
```

Set `WORKER_HEARTBEAT_STALE_SECONDS=180` on the test deployment and redeploy. Qualification means at least ten consecutive minute slots with the browser closed, correlated across Cloudflare events, Netlify background logs and fresh database heartbeats ([Cloudflare scheduler](CLOUDFLARE_SCHEDULER.md)).

### 4. Complete the production environment

Required for readiness to pass: `APP_URL` (https), `DATABASE_URL` (the runtime role, never the owner), `AUTH_RATE_LIMIT_SECRET` and `DATA_ENCRYPTION_KEY` (32+ characters each), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, the public-trust trio above, `NODE_ENV=production`, `PILOT_MODE=false`, `DEMO_MODE=false`, `AUTH_REQUIRE_EMAIL_VERIFICATION=true`, `AUTH_REQUIRE_ADMIN_MFA=true`. Web push needs all three `WEB_PUSH_VAPID_*` values, one pair per environment. No document records the webhook secret, the public-trust trio or the VAPID keys as set on production; confirm each in the Render dashboard ([Hosted deployment](HOSTED_DEPLOYMENT.md)).

### 5. Promote a release to jumpinthemix.com

The public site is a separate target from the Netlify test site. Order: verify a restorable backup, build one immutable revision, apply migrations in the isolated owner job (`DATABASE_URL` runtime plus transient `MIGRATION_DATABASE_URL`, then `node scripts/migrate-with-owner.mjs`), start the web revision, exactly one worker, then require `/api/health/live`, `/ready` and `/worker` to answer 200 and run `npm run smoke:staging`. Roll back by redeploying a prior compatible revision; never reverse a migration in place ([Hosted deployment](HOSTED_DEPLOYMENT.md), [Migration runbook](MIGRATION_RUNBOOK.md)).

### 6. Apply the planned-date migration to the test site

The planned-date engine ships in this checkpoint with one additive migration, `20260911160000_mix_step_planned_at`. The test site's release check refuses a build until its database has applied it. On the test topology the site's own `DATABASE_URL` is the Neon owner role, so from this checkout:

```bash
DATABASE_URL="$(npx netlify env:get DATABASE_URL --site 8fd20ccd-5c35-47e5-99ce-98e5670d52fe --context production)" npx prisma migrate deploy
```

Then run `node .artifacts/checkpoint-2026-09-11/deploy.mjs deploy` and `verify`. The migration adds one nullable column and is safe to apply before the code lands.

### 7. Manual device qualification

All 30 rows in [Manual device qualification](MANUAL_DEVICE_QUALIFICATION.md) are NOT RUN: navigation, native text, email, call and WhatsApp hand-offs on a physical iPhone and Android, VoiceOver, TalkBack, keyboard-only, 200 and 400 percent zoom, safe areas, installed-app account changes, offline drafts and push ownership. Record date, tester, result, OS and browser versions per row. Required before inviting external customers.

### 8. Manual screen-reader session

One VoiceOver, NVDA or TalkBack session over selection, editor, preview, dates, form errors and recovery, recorded in the [implementation acceptance record](HOMEPAGE_IMPLEMENTATION_ACCEPTANCE_2026-09-10.md). Automated checks do not close this gate.

### 9. Participant research

Five real estate agents and five consultants first, using the [research protocol](HOMEPAGE_RESEARCH_PROTOCOL_2026-09-10.md) and the [session template](HOMEPAGE_RESEARCH_SESSION_TEMPLATE_2026-09-10.md). A group passes when at least four of five identify follow-up software, finish the sandbox within two minutes uncoached, understand nothing was sent, and name a real situation. Recruitment, consent and live contact need a coordinator; none is named yet.

## Done from the repository in this checkpoint

- **Public pages and search:** see [the search strategy record](SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md).
- **Mobile audit defects:** tablet contact rows, the import stepper's dark-mode contrast and scroll strip, and the undersized disclosures and reorder controls are fixed and measured ([mobile audit follow-up](MOBILE_EXPERIENCE_AUDIT_2026-09-06.md#september-12-follow-up)).
- **UI audit items:** F01 to F04, F08 and F14 verified resolved, F07 improved, and the remaining F15 hydration mismatch on the calendar fixed ([UI audit verification](UI_UX_AUDIT_2026-09-05.md#september-12-verification)).
- **Completed-history latency:** the cursor query now starts its index scan at the cursor; local p95 fell from 443 ms to 152 ms at five concurrent workers on the documented fixture. Hosted re-qualification is still required ([load qualification follow-up](HOSTED_LOAD_QUALIFICATION.md#september-12-follow-up-the-completed-history-cursor)).
- **Positioning:** the README now matches the public site.
- **Planned-date engine:** landed with its migration; see step 6 above for the test-site migration command.
- **Gates run locally:** unit suite, desktop and mobile browser suites for the changed surfaces, an axe sweep of ten signed-in pages in both themes, a production build and the Lighthouse budgets; results are in the release record.
