# Optional Cloudflare scheduler for the test site

**Prepared, not activated.** The Worker in `infra/cloudflare-scheduler/` requests one Netlify background-worker pass each minute. The application, database, queue, and job leases stay on their existing services. This package does not establish that unattended scheduling works; that requires the live qualification below.

The current Netlify minute schedule has not shown recurring invocations. The GitHub fallback has shown gaps exceeding 90 minutes. This optional timer addresses that gap while preserving the existing worker implementation.

## Handoff contract

- The only handler is `scheduled`. There are no routes, `workers.dev` endpoint, or public preview URLs.
- `APP_URL` is the HTTPS origin of the dedicated test site. Paths, query strings, fragments, and embedded credentials are rejected.
- `NETLIFY_WORKER_SECRET` must match the existing Netlify secret. It is a secret binding, never a source-code variable. The timer has no database, customer-provider, or private-site sign-in credentials.
- Each invocation makes one authenticated POST to `/.netlify/functions/jump-worker-background`, with a ten-second deadline covering the request and response cleanup. `redirect: "manual"` returns redirects for rejection instead of following them; the locally qualified workerd runtime rejects Node's `"error"` mode. Response content and upstream errors are never logged.
- HTTP **202 means the platform accepted the request**, not that application authentication or job processing succeeded. Netlify accepts background invocations before their handler runs. A wrong secret can therefore still produce a 202.
- Existing durable job claims, leases, and delivery receipts handle overlapping timers. Do not add direct delivery or duplicate retry logic to the timer. An unknown request outcome leaves processing to the existing worker and a subsequent tick.
- Cloudflare logs contain only the handoff event, scheduled time, outcome, and HTTP status when available. Invalid configuration raises a generic error without echoing its values.

Bindings are generated with pinned Wrangler. `nodejs_compat_do_not_populate_process_env` keeps bindings on the explicit `env` argument and prevents generated declarations from making those variables required in the Next.js application's Node environment.

## Local qualification

Run from the repository root:

```bash
npm run scheduler:types
npm run scheduler:check
npm run typecheck
npx vitest run tests/external-worker-scheduler.test.ts tests/netlify-worker.test.ts tests/worker-dispatch.test.ts
```

`scheduler:check` checks generated-type drift and bundles with `wrangler deploy --dry-run`. It does not upload code, secrets, or a cron trigger. Output is stored in ignored `.artifacts/cloudflare-scheduler/`. CI runs the same dry check without Cloudflare credentials. Unit tests replace outbound fetch and cover authentication, rejected responses, redirects, redaction, and timeout/cleanup behavior.

After config changes, regenerate types deliberately. The check itself must fail on stale declarations instead of silently regenerating them.

## Activation prerequisites

The existing authorization covers publication to the Netlify test site. Activating this added service also stores its worker handoff secret in Cloudflare, so obtain the owner's approval for that specific scope before proceeding. This is a deployment-scope decision, not a skill requirement.

Confirm the chosen Cloudflare account is on **Workers Free**, has available quota, and can support this timer without an upgrade. The available OAuth session could read account settings but received HTTP 403 for subscriptions; `default_usage_model: standard` does not establish Free-plan status. Do not enable a paid plan.

Cloudflare's September 6, 2026 documentation lists 100,000 requests per day and 10 ms of CPU per invocation on Free. A minute timer generates 1,440 scheduled invocations per day before any retries, plus the corresponding Netlify background executions and Neon activity. Check remaining usage on all three services; this arithmetic is not a guarantee of zero cost or service availability. Network wait time is separate from CPU time.

Before activation, verify the target is `jump-in-the-mix-test.netlify.app`, preserve the existing contact/plan fingerprint, and confirm customer delivery, push, and ops-alert providers remain disabled for this qualification. Do not create or modify hosted test contacts, plans, rules, or jobs.

## Activate after approval

1. Select the confirmed Free account using `CLOUDFLARE_ACCOUNT_ID` and inspect `npx --yes wrangler@4.129.0 whoami`. The config intentionally contains no account ID.
2. Read the existing test site's handoff secret through its secret manager and supply it only through Wrangler's hidden interactive input or protected stdin. Do not put the value in an argument, shell history, source, or logs:

   ```bash
   npx --yes wrangler@4.129.0 secret put NETLIFY_WORKER_SECRET --config infra/cloudflare-scheduler/wrangler.jsonc
   ```

3. Run the local qualification, then activate the reviewed package:

   ```bash
   npx --yes wrangler@4.129.0 deploy --config infra/cloudflare-scheduler/wrangler.jsonc
   ```

4. Set `WORKER_HEARTBEAT_STALE_SECONDS=180` for the test Netlify deployment and rebuild/redeploy if needed to apply runtime environment changes. Follow [Netlify deployment](NETLIFY_DEPLOYMENT.md), including preview asset verification. A tighter threshold exposes missed ticks; it does not repair them.

If using an optional test-expiry date, remove this cron when it expires as well as stopping the GitHub fallback. This Worker does not read `JITM_TEST_EXPIRES_AT` or the app's private-test expiry setting.

## Qualify unattended execution

Allow up to 15 minutes for cron changes to propagate. Cloudflare's Past Cron Events display can take up to 30 minutes to appear, so use execution logs and database observations as well.

Observe at least ten consecutive minute slots with the browser closed and no app requests or manual wakeups. Correlate Cloudflare scheduled-event timestamps, Netlify background execution/completion logs, and fresh database heartbeats. Record actual gaps; do not infer recurrence from configuration, a 202, or a health check after browsing. Keep the existing GitHub/Netlify fallback logs in the receipt to distinguish their invocations.

Verify due-work completion and recovery after interruption separately. Only observe naturally existing hosted work within the current data-preservation constraint. If no work is due, record that job-completion qualification remains open; use isolated local fixtures for lease, retry, and duplicate tests. Never invent hosted jobs to fill the evidence gap.

Before relying on timed customer follow-ups, establish acceptable timing over a longer observation window, healthy backlog age, and recovery after a controlled interruption. An idle heartbeat alone does not demonstrate these. Keep [Product quality gates](PRODUCT_QUALITY_GATES.md) open until the corresponding evidence exists.

## Stop or roll back

To stop only this timer, set `triggers.crons` to `[]` in its config and deploy it. Omitting `triggers` or `crons` preserves an existing deployed schedule. Allow for propagation and an already-started Netlify pass; removing the trigger does not cancel durable work already running.

For complete removal, delete only the named scheduler:

```bash
npx --yes wrangler@4.129.0 delete --config infra/cloudflare-scheduler/wrangler.jsonc
```

This removes the added service and its secret without touching the app or database. Verify the cron is gone. Existing Netlify/GitHub timers remain available with their documented limitations. Restore the previous Worker version only for code rollback; manage cron settings explicitly. If a secret is rotated, update both services and the existing GitHub fallback securely, then requalify authenticated processing.

## References

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cron triggers, propagation, local testing, and removal](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
