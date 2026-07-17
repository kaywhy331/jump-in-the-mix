# Stripe Billing

Jump in the Mix uses Stripe-hosted Checkout for new Plus and Pro subscriptions and Stripe's hosted Customer Portal for payment methods, invoices, plan changes, and cancellation. The browser never receives the Stripe secret key and never grants plan access by navigating to a success URL.

## Product and Price setup

Create four recurring Stripe Prices and store their IDs in the server environment:

| Plan | Billing period | Application display |
|---|---|---:|
| Plus | Monthly | $15/month |
| Plus | Annual | $144/year ($12/month equivalent) |
| Pro | Monthly | $18/month |
| Pro | Annual | $180/year ($15/month equivalent) |

```text
STRIPE_PLUS_MONTHLY_PRICE_ID=price_...
STRIPE_PLUS_ANNUAL_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
```

Price IDs are selected from this server-side allowlist. `/api/billing/checkout` accepts only a plan and billing period; it never trusts an arbitrary Price ID submitted by the browser. Subscription metadata helps resolve identity but cannot grant a tier when the recurring Price is not one of these four IDs.

## Required server configuration

```text
APP_URL=https://YOUR_HOST
STRIPE_SECRET_KEY=sk_live_...        # use sk_test_... in staging
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-02-25.clover
STRIPE_WEBHOOK_TOLERANCE_SECONDS=300
```

Hosted Checkout does not require Stripe.js or a publishable key in the browser.

## Webhook registration

Register this public endpoint in Stripe Workbench:

```text
https://YOUR_HOST/api/webhooks/stripe
```

Use the same API version configured by `STRIPE_API_VERSION`. Enable at least:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
```

After the endpoint is created, copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

The route is intentionally under `/api/webhooks/`, which is exempt from the browser Origin/CSRF boundary. It does not require a login. Instead, it reads the raw request body and verifies the `Stripe-Signature` HMAC with a bounded timestamp tolerance before parsing JSON.

## Identity mapping

Checkout creates or reuses one Stripe Customer per workspace. The Customer, Checkout Session, and Subscription carry:

```text
workspace_id
user_id
plan_tier
billing_period
```

The Checkout Session also sets `client_reference_id` to the workspace ID. Renewal and lifecycle events resolve the workspace from Subscription metadata first, then the stored Stripe Subscription/Customer IDs, then Customer metadata.

## Checkout and verification flow

1. A workspace owner or administrator chooses a server-approved Plus/Pro option on `/plans`.
2. `POST /api/billing/checkout` creates a hosted Checkout Session.
3. Stripe returns to `/billing/success?session_id={CHECKOUT_SESSION_ID}`.
4. The success view polls `GET /api/billing/verify`.
5. The server retrieves the Checkout Session directly from Stripe, confirms it belongs to the active workspace, retrieves the Subscription, and reconciles the database.
6. The signed webhook performs the same reconciliation asynchronously and remains the long-term source of lifecycle updates.

A copied success URL cannot grant access because the server verifies both the Stripe object and workspace metadata.

## Subscription lifecycle

The database stores both a current workspace summary and historical `Subscription` records.

- `active` and `trialing` provide the purchased tier.
- `past_due` keeps the tier during Stripe's recovery period and displays an account warning.
- `invoice.payment_failed` records `PAST_DUE` immediately.
- A fully `paused` subscription revokes paid access until Stripe reports it resumed.
- `canceled`, `incomplete_expired`, `unpaid`, and `incomplete` fall back to Free access.
- `currentPeriodStart`, `currentPeriodEnd`, and `cancelAtPeriodEnd` come from Stripe's Subscription data rather than local date arithmetic.
- Customer Portal changes reconcile through subscription webhooks.

The webhook event ID is unique in `WebhookEvent`. A successfully processed duplicate returns HTTP 200 without applying the event again. Failed events remain retryable and visible in **Admin · Billing**.

## Downgrade preservation

A lower plan never deletes workspace records. After Checkout verification or a subscription webhook, the application reconciles the new plan limits:

- The most recently maintained active Mixes remain active up to the plan allowance.
- Excess active Mixes become Paused.
- Future Pending or Copied Jumps from those paused Mixes become Canceled with `plan_downgrade` as the reason.
- Excess active custom Jump Date Types become inactive and can later be selected again after an upgrade or another type is deactivated.
- Excess active Contact Groups become inactive while their Contacts, memberships, and Mix assignments remain stored.
- Inactive Contact Groups cannot receive new Contact assignments, cannot be newly added to a Mix, and do not generate group-derived Jumps.
- Choosing a different active Contact Group set from Contacts queues reconciliation; future incomplete work from a deactivated group is canceled and eligible work from a reactivated group is restored.
- Excess pending, approved, or flagged Community Mix contributions become Unpublished.
- Contacts remain stored. Creating new Contacts is blocked while the active Contact count exceeds the current allowance.
- Completed and Skipped Jump history remains unchanged.

My Account shows current active usage, limits, and direct links to the corresponding management pages. Automatic downgrade selection preserves the most recently maintained Mixes, custom Jump Date Types, and Contact Groups; users can change the active Date Type and Group selections without deleting their work.

## Customer Portal

`POST /api/billing/portal` creates a short-lived portal session on demand. Only the active workspace owner or administrator can open it. Configure the portal in Stripe to support the policies you intend to offer, including payment-method updates, invoice history, cancellations, and supported plan switches. Limit plan-switch products to the four approved recurring Prices.

## Staging smoke test

1. Configure `sk_test_...`, four test Price IDs, and a staging webhook endpoint.
2. Register a new Free workspace.
3. Purchase Plus Monthly with a Stripe test card.
4. Confirm the success screen verifies the Checkout Session and My Account shows Plus, Active, and Stripe's period end.
5. Confirm Admin · Billing shows the Subscription and processed webhook events.
6. Deliver the same event twice and confirm the second delivery is reported as a duplicate without a second database effect.
7. Switch plans in Customer Portal and confirm `customer.subscription.updated` changes the workspace.
8. Set cancellation at period end and confirm My Account shows the access-end date.
9. Trigger `invoice.payment_failed` with a real test subscription flow and confirm the Past Due warning.
10. Pause and resume a test subscription and confirm paid access is removed and restored.
11. Create more than three active Mixes, custom Jump Date Types, and Contact Groups on Pro, cancel the subscription, and confirm every record remains while only three of each stay active.
12. From Contacts, choose a different set of three active Groups and confirm memberships and Mix assignments remain intact, old future group-derived Jumps are canceled, and newly eligible Jumps are restored.
13. Cancel the subscription and confirm the workspace returns to Free while its Contacts, Jumps, Mixes, Groups, and completed history remain stored.
14. Attempt to verify another workspace's Checkout Session and confirm HTTP 403.
15. Start a view-only administrator support session and confirm Checkout and portal mutations are blocked.

Dashboard-generated webhook fixtures are useful for signature and routing checks, but a real Stripe test subscription is the reliable qualification path because generic fixtures might not correspond to retrievable Customer or Subscription objects.

## Operational checks

- Alert on `WebhookEvent.status = FAILED`.
- Alert when paid workspaces remain `PAST_DUE` beyond the chosen grace policy.
- Keep the webhook endpoint public but never bypass signature verification.
- Rotate secret keys and webhook signing secrets through the deployment secret manager.
- Do not log card details, raw secret keys, or complete webhook payloads.
- Restore-test the PostgreSQL backup before the first live billing deployment.
