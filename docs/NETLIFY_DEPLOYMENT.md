# Netlify deployment

For the separate password-protected free testing deployment, see [Free private testing](FREE_TESTING.md). Its test configuration and temporary database do not replace the production setup below.

The Netlify project is **jump-in-the-mix**, in the **Kevin** team (`kaywhy331`). Its production URL is `https://jump-in-the-mix.netlify.app` and its project ID is `43280ec7-18ff-46f1-a583-17e2a52f66c5`.

## Runtime

`netlify.toml` builds the app with Node 22 and Netlify's current Next.js adapter. The web app keeps Server Components, Server Actions, and dynamic API routes.

`jump-worker-schedule` is configured to run every minute and invoke `jump-worker-background` with a generated `NETLIFY_WORKER_SECRET`. The background function uses the same job claims, lease renewal, retry behavior, reconciliation, notification receipts, and automatic-delivery claims as the standalone worker. Each pass processes at most 25 queued jobs and stops taking new jobs after eight minutes, leaving headroom within Netlify's 15-minute background-function limit. Set `WORKER_HEARTBEAT_STALE_SECONDS=180` for the scheduled cadence.

The background endpoint performs no application work without a matching secret. Netlify returns an immediate 202 for background requests, so use worker health and function logs to verify actual processing.

Set `WORKER_DISPATCH_MODE=netlify` to wake the processor after authenticated application responses and successfully accepted lead intake. This uses Next.js `after`, so action transactions commit and the response is delivered before the handoff. Requests check only their authenticated workspace's claimable queue; a stale global heartbeat also requests a maintenance pass. View-only support impersonation does not register a wakeup. With the variable unset or `off`, persistent-worker installations keep their existing behavior.

Wakeups use a database-backed ten-second limit across instances. At most one response reserves a trailing wakeup, covering changes committed just after a previous pass finished. Rejected or failed handoffs leave jobs untouched for recovery. After a bounded background pass, remaining claimable jobs request another pass; an empty queue, future retries, and live leases end that continuation. The dispatcher never treats a 202 response as job completion, follows no redirects, and sends the secret only to the configured HTTPS application origin.

These activity-triggered passes improve preparation and imports while the product is being used. They do not replace the recurring timer for an idle installation. Qualify the timer with no application traffic; activity-triggered heartbeats must not be counted as proof of cron execution.

The scheduled tick uses Netlify's buffered handler API. Default-export v2 handlers are bundled in streaming mode by the current CLI; scheduled invocations do not support streaming. Confirm both the minute schedule and buffered invocation mode in the generated function manifest, then verify an actual queued job is processed by the live schedule.

The test deployment did not receive automatic Netlify invocations even after that correction. It uses the separate GitHub Actions timer documented in [Free private testing](FREE_TESTING.md). An [optional Cloudflare timer](CLOUDFLARE_SCHEDULER.md) is prepared but not activated or qualified. Do not infer a working production schedule from the manifest alone.

### Publishing a separately built test package

Runtime variables must cover the context used to create the preview. Promoting a ready preview does not replace its environment with production-only values. On the dedicated test site, both `WORKER_DISPATCH_MODE=netlify` and `WORKER_HEARTBEAT_STALE_SECONDS=180` now apply to all contexts. The September 6 release corrected a production-only dispatch setting; after republishing, authenticated browsing produced a dispatch reservation and a worker heartbeat roughly four seconds later. Worker health returned 200 at about 177 seconds and 503 at about 199 seconds of heartbeat age. These checks qualify activity-triggered processing and the monitoring threshold, not unattended scheduling.

To apply this setting to the dedicated test site, the explicit noninteractive command is `netlify env:set WORKER_DISPATCH_MODE netlify --site 8fd20ccd-5c35-47e5-99ce-98e5670d52fe --force`. With no `--context`, the CLI applies the value to all contexts. Verify the stored contexts after changing an existing variable: an unanswered CLI prompt can exit without applying the change. Redeploy after a runtime environment change.

After a successful Netlify adapter build using the test site's environment, upload the adapter's static directory explicitly:

```bash
netlify deploy --site 8fd20ccd-5c35-47e5-99ce-98e5670d52fe --no-build --dir .netlify/static --skip-functions-cache --json
```

This creates a preview for the dedicated test site. Verify its rendered `/_next/static/` CSS/JavaScript responses and their hashes against the build before promotion. Promote that ready preview through Netlify's `POST /sites/{site_id}/deploys/{deploy_id}/restore` using the same test-site ID and verified deploy ID. Preserve the separate production link in `.netlify/state.json`.

Do not omit `--dir .netlify/static` when publishing this separately built adapter package. The September 6 attempt that uploaded raw `.next` put JavaScript at `/static/chunks`, causing 404s for the app's `/_next/static/chunks` requests; it was rolled back. An accepted deployment is not proof that the rendered assets load correctly.

The September 5 release verification also recreated the Netlify trigger under `jump-worker-schedule`; the published deployment registered the schedule but still showed no minute invocations. The GitHub fallback's scheduled run at September 6, 01:03 UTC produced a matching database heartbeat. Observed gaps between GitHub scheduled runs exceeded 90 minutes despite its five-minute cron. Event-driven journey transitions execute in the request that records the event; elapsed-time transitions, completed-plan maintenance, calendar refresh, and scheduled deliveries can run late on this test infrastructure. Resolve the hosted timer or operate the documented standalone worker before relying on delivery times. Keep the health threshold meaningful; do not lengthen it to hide missed invocations.

## Database and configuration

The existing Prisma PostgreSQL schema is retained. Set `DATABASE_URL` for external PostgreSQL, or enable Netlify Database, which supplies `NETLIFY_DB_URL`. Both Prisma runtime and migration configuration accept the managed variable. Migrations remain under `prisma/migrations`; Netlify's automatic SQL migration mechanism is not used.

During initial setup, Netlify rejected database provisioning for this account with HTTP 403: **“database feature not available for this account.”** Enable the feature or configure an external PostgreSQL database before publishing a working CRM.

Configure the production environment in [Netlify project settings](https://app.netlify.com/projects/jump-in-the-mix/configuration/env). Required hosted sign-in/email values are listed in [Hosted deployment](HOSTED_DEPLOYMENT.md). Production verification and readiness checks remain enabled; the application must not use CI bypasses or demo credentials in production.

The app URL, production mode flags, strong random authentication/encryption/worker secrets, and Web Push key pair were provisioned during setup. Provider credentials and a database connection still require configuration. Never copy production secrets into `netlify.toml` or Git.

The account uses standard environment variables across all scopes/contexts; Netlify rejected narrow scope configuration as an upgrade-only feature. Use separate projects for isolated staging data and credentials on this plan.

## Verified implementation

The Netlify production build completed successfully with the Next.js adapter, Node proxy, background function, and minute schedule all present in the generated manifests. The full suite passes 248 unit/integration tests. Focused tests cover worker authentication, lease ownership, invocation failures, and bounded processing. Local PostgreSQL smoke checks verify the standalone worker still starts and a bounded pass completes a queued job and reports healthy.

The build used an isolated local PostgreSQL configuration for validation. No production database was substituted with test data, and no working production deployment has been published yet. The remaining publishing requirements are the database and hosted provider configuration above. Local logs are retained under the ignored `.artifacts/netlify-deploy/` directory.

## Publish a revision

1. Link this checkout explicitly with `netlify link --id 43280ec7-18ff-46f1-a583-17e2a52f66c5`. Local `.netlify` state is ignored by Git.
2. Configure the database and hosted provider values in the production context, available to Functions and builds as appropriate.
3. Take a database snapshot or encrypted backup before upgrading an existing installation. Apply `npm run db:deploy` against the intended database, then seed system date types and ready-made plans with `DEMO_MODE=false npm run db:seed`. Never use `db:push` or demo seeding on production data.
4. Run the repository checks and commit/push the revision.
5. Run `netlify deploy --prod --context production --message <commit-sha>`. The Netlify build generates Prisma before Next.js and bundles the background functions.
6. Require `/api/health/live`, `/api/health/ready`, and `/api/health/worker` to return HTTP 200. Allow a scheduled tick to execute before checking worker health. Verify sign-in, onboarding, email recovery, and follow-up preparation with a dedicated synthetic account.

Application rollback uses Netlify's previous published deploy. Database rollback follows the separate-database restore procedure in [Hosted deployment](HOSTED_DEPLOYMENT.md); do not reverse destructive migrations in place.

If build and publish are separate commands, publish the adapter's `.netlify/static` directory explicitly: `netlify deploy --site <intended-site-id> --prod --no-build --dir .netlify/static --skip-functions-cache --message <revision>`. A completed `netlify build` restores `.next` to the raw Next.js build directory; using that as the directory for a later `--no-build` deployment leaves browser assets at the wrong URLs. Do not combine `--context` with `--no-build`. Keep the static files and bundled functions from the same build, and check that the deployed page loads its CSS and JavaScript as well as returning HTTP 200. The staging smoke checks the rendered theme token to detect missing styles.
