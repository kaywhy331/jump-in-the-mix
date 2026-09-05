# Administration and operations

The hosted administrator surface is deliberately narrow. Every route requires a platform administrator and, in production, a fresh MFA step-up for the current application session.

## Navigation

- **Overview** — user, business, follow-up, support, library, job, and audit totals.
- **Users** — account search and time-limited view-only support sessions.
- **Support** — private customer conversations and replies.
- **Ready-made plans** — curate the plan library shipped to customers.
- **Operations** — worker heartbeat, background jobs, failures, and safe retry.
- **Audit** — read-only security and product-event search.
- **System settings** — reviewed plan-library categories and industries.

Retired billing, provider-sync, community-submission, reward, and AI-draft surfaces are not hidden routes; they no longer compile into the application.

## MFA and support views

An administrator without MFA is redirected to enrollment. Enrollment requires the current password and a valid TOTP code and returns one-time recovery codes. A new application session requires a new MFA step-up.

A support view revalidates the selected user and business, requires a written reason, keeps the administrator as the audited actor, displays a persistent warning, expires automatically, and is read-only. The centralized request boundary rejects unsafe methods until the administrator ends the support view. Password, session, and destructive account controls are never exposed for the customer being viewed.

## Operations

Workers write a durable heartbeat every 15 seconds. `/api/health/worker` reports unhealthy after `WORKER_HEARTBEAT_STALE_SECONDS` without a current heartbeat. Failed jobs may be retried only from a recorded terminal failure; retry clears the old lease and error on that same job and writes an audit event.

Never render contact details, message bodies, provider credentials, access tokens, encryption material, MFA secrets, recovery codes, or raw session tokens in administrator diagnostics.

## Release qualification

Before enabling the control plane on a public origin:

1. Set `AUTH_REQUIRE_ADMIN_MFA=true` and rehearse enrollment plus lost-device recovery.
2. Use named operator accounts rather than shared credentials.
3. Verify the support-view mutation boundary in the browser suite.
4. Alert on repeated MFA failures, unusual support access, stale workers, and failed jobs.
5. Confirm audit retention and support-data handling match the published privacy policy.

See [Admin MFA](ADMIN_MFA.md), [Browser E2E](BROWSER_E2E.md), and [Hosted deployment](HOSTED_DEPLOYMENT.md).
