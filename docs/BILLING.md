# Billing with Stripe

Kevin's plans are Free ($0), Plus ($15 a month or $144 a year) and Pro ($29 a month or $288 a year) ([decision](PRICING_DECISION_2026-09-29.md)). The app sells them through Stripe's hosted checkout and billing portal. **Billing is off** until Kevin chooses a start date. While it is off, nothing can be bought, no plan limits apply, the Stripe webhook refuses events, and Plan and billing explains the free beta.

## How it works

- **Buying a plan.** Plan and billing (`/account/billing`) shows the two paid plans to the account owner. Choosing one opens Stripe's checkout page. Card details never reach the app.
- **Which plan an account has.** The plan changes only from Stripe's own record.
  - Each verified webhook event, and each return from checkout, re-reads the customer's subscriptions from Stripe (`src/lib/billing-sync.ts`).
  - The result is stored in `WorkspaceBilling`.
  - Late, repeated or out-of-order events therefore leave the right plan.
  - A subscription grants its plan while Stripe reports it as `active`, `trialing` or `past_due`. `past_due` continues while Stripe retries a failed renewal.
  - If a duplicate checkout leaves two subscriptions, the higher plan applies. Refund the duplicate in Stripe.
- **Managing a plan.** Manage billing opens Stripe's billing portal. There the owner updates the card, sees invoices, switches between Plus and Pro (prorated) or cancels at the end of the paid period.
- **Prices.** The app finds Stripe prices by lookup key (`jitm_plus_month`, `jitm_plus_year`, `jitm_pro_month`, `jitm_pro_year`). It sells one only when its amount, currency and interval match `src/lib/plans.ts` exactly. A price edited in Stripe can't be charged: checkout reports that payments aren't available.
- **Deleting an account.** Before any account data is removed, the app deletes the Stripe customer. That ends every subscription at once and removes saved cards; Stripe keeps its own records of past payments. If Stripe can't be reached, nothing is deleted and the owner is asked to try again.
- **Records.** `WorkspaceBilling` holds the account's plan and Stripe identifiers. `StripeWebhookEvent` holds each event id for 90 days, so a retried delivery is recognized. Stripe retries for up to three days.

## Settings

| Variable | Where | Value |
| --- | --- | --- |
| `BILLING_ENABLED` | Web service | `true` turns billing on. Absent or anything else keeps it off. |
| `STRIPE_SECRET_KEY` | Web service | A secret key (`sk_…`) or a restricted key (`rk_…`). A restricted key needs: Customers write, Checkout Sessions write, Customer portal write, Subscriptions read, Prices read. |
| `STRIPE_WEBHOOK_SECRET` | Web service | The signing secret (`whsec_…`) of the webhook endpoint. |

- With `BILLING_ENABLED=true`, readiness fails in either of these cases:
  - either Stripe secret is missing or malformed;
  - hosted production has a test key.
- The worker needs none of these.
- Secrets live only in Render's environment and git-ignored local files (JITM-14 §2.27).

## Setting up Stripe

1. **Products, prices and portal settings.** Run with the key in the environment, never on the command line:

   ```
   set -a; . ~/.config/jitm/stripe-test.env; set +a
   npm run stripe:setup
   ```

   The script creates or checks:
   - the Plus and Pro products;
   - the four prices;
   - a billing-portal configuration.

   It refuses a live key unless run with `-- --live`. It never edits an existing price. A changed price needs a new lookup key and a code change.
2. **Webhook endpoint.** Point it at `https://jumpinthemix.com/api/webhooks/stripe` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`
   - `invoice.paid`, `invoice.payment_failed`

   Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. **Local testing in test mode.** Forward events with the Stripe CLI:

   ```
   stripe listen --forward-to http://127.0.0.1:3300/api/webhooks/stripe
   ```

   It prints a `whsec_…` for the local server. Pay with Stripe's test card `4242 4242 4242 4242`, any future date and any CVC.

## Turning billing on (Kevin's go-live)

Decide the open items first ([decision record](PRICING_DECISION_2026-09-29.md), "Still open before charging starts"):
- the start date;
- beta accounts;
- sales tax;
- refunds and cancellation timing;
- the failed-payment grace period;
- account deletion with a paid plan.

Then:
1. Merge and release the plan limits. Without them, Free would still have no limits.
2. Activate the Stripe account for live payments: business details, payouts, receipts and support details.
3. Run `npm run stripe:setup -- --live` with the live key, and add the live webhook endpoint.
4. In one reviewed release plan (JITM-14 §2.28), set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `BILLING_ENABLED=true` on the web service.
5. Buy a plan with a real card, check Plan and billing and the portal, then refund it in Stripe.

## Turning billing off

Set `BILLING_ENABLED=false`. Checkout and the portal stop, plan limits stop, and the webhook refuses events, which Stripe retries for up to three days. **Existing subscriptions keep charging in Stripe.** Cancel or pause them there before turning billing off for good.

## Costs

Stripe charges 2.9% + 30¢ per successful domestic card payment, plus 0.7% of Billing volume. There are no setup or monthly fees. Stripe Tax, if chosen, costs 0.5% per transaction or $90 a month. Source: https://stripe.com/pricing, checked 2026-09-29.
