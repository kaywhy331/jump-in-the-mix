# Netlify deployment

For the separate password-protected free testing deployment, see [Free private testing](FREE_TESTING.md). Its test configuration and temporary database do not replace the production setup below.

The Netlify project is **jump-in-the-mix**, in the **Kevin** team (`kaywhy331`). Its production URL is `https://jump-in-the-mix.netlify.app` and its project ID is `43280ec7-18ff-46f1-a583-17e2a52f66c5`.

## Runtime

`netlify.toml` builds the app with Node 22 and Netlify's current Next.js adapter. The web app keeps Server Components, Server Actions, and dynamic API routes.

`jump-worker-tick` runs every minute and invokes `jump-worker-background` with a generated `NETLIFY_WORKER_SECRET`. The background function uses the same job claims, lease renewal, retry behavior, reconciliation, notification receipts, and automatic-delivery claims as the standalone worker. Each pass processes at most 25 queued jobs and stops taking new jobs after eight minutes, leaving headroom within Netlify's 15-minute background-function limit. Set `WORKER_HEARTBEAT_STALE_SECONDS=180` for the scheduled cadence.

The background endpoint performs no application work without a matching secret. Netlify returns an immediate 202 for background requests, so use worker health and function logs to verify actual processing.

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
