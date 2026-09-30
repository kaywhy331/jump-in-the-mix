# Stripe checkout and billing, switched off — implementation record, September 29, 2026

The app can now sell Kevin's paid plans through Stripe's hosted checkout and billing portal, and keeps each account's plan in step with Stripe. Everything stays off until `BILLING_ENABLED=true`. Kevin sets that on the date he chooses charging to start. The runbook is [Billing with Stripe](BILLING.md).

**Status:** merged on 2026-09-30 as `94b9539`; not released. Charging is off; a release adds only the new tables and the Plan and billing page in its free-beta state.

| Item | Value |
| --- | --- |
| Branch | `feat/stripe-billing-20260929`, pull request #104 |
| Base | `copy/show-prices-20260929` (PR #103, itself on #98). Merge #98, then #103, then this one, retargeting each to `main` |
| Decision | Kevin, 2026-09-29: "we can identify the prices up front right now and incorporate it with the payment terminal"; "Build now, charge later": checkout is built and tested in Stripe's test mode and stays off until he picks a date ([decision record](PRICING_DECISION_2026-09-29.md)). |
| Workflow | WF-01, then WF-04 with WF-02, WF-03 and WF-08; skills `jitm-feature`, `jitm-ui-change`, `jitm-copy`, `jitm-standards-update` |

## What changed

**Schema (migration `20260929180000_workspace_billing`, additive).**
- `WorkspaceBilling`: one row per account that has started a checkout. It holds the plan, interval, subscription status, renewal and end dates, and the Stripe customer and subscription ids. It is deleted with the workspace.
- `StripeWebhookEvent`: each processed event id, kept 90 days by the operational cleanup.

**Buying and managing a plan (`/account/billing`, linked from My account).**
- While billing is off, the page says: "Paid plans haven't started yet, so nothing is charged and no plan limits apply". It lists the plans and links to `/pricing`.
- While billing is on, the owner sees the current plan, its price, the renewal or end date, and a notice after a failed payment.
  - On Free, the owner can choose Plus or Pro, monthly or yearly. Stripe's checkout opens; card details never reach the app.
  - On a paid plan, Manage billing opens Stripe's billing portal. There the owner updates the card, sees invoices, switches between Plus and Pro or cancels at the end of the period.
- Only the account owner can open checkout or the portal, and never during a view-only support session.
- A second paid plan is refused: if another tab already finished a checkout, the page shows that plan instead.

**Keeping the plan right (`src/lib/billing-sync.ts`, `src/app/api/webhooks/stripe/route.ts`).**
- The webhook verifies each event against the raw body and the endpoint's signing secret. It records the event id once, and re-reads the customer's subscriptions from Stripe.
  - A repeated delivery is acknowledged without being processed again.
  - A late or out-of-order event can't leave the wrong plan, because the state always comes from Stripe.
  - Events for customers the app did not create are ignored.
- Returning from checkout confirms the checkout with Stripe before showing the new plan. The return address alone never grants one.
- A subscription grants its plan while Stripe reports it `active`, `trialing` or `past_due`. If a duplicate checkout leaves two, the higher plan applies.

**Prices.**
- Prices are found by lookup key and sold only when they match `src/lib/plans.ts` exactly. A price edited in Stripe can't be charged.
- `npm run stripe:setup` creates or checks the products, the four prices and the billing-portal settings from the same catalogue. It never edits an existing price.

**Account deletion.**
- Deleting an account first deletes its Stripe customer. That ends every subscription and removes saved cards.
- If Stripe can't be reached, nothing is deleted and the owner is asked to try again.

**Configuration.**
- `BILLING_ENABLED`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` go on the web service only.
- Readiness fails when billing is on without both secrets, or with a test key in hosted production.
- `.env.example` lists the three variables. `render.yaml` is unchanged, so the production configuration can't change before go-live.

**Dependency.** `stripe` 22.6.2, pinned: Stripe's official library, with no dependencies of its own (JITM-11 §2.50).
- `src/lib/stripe-client.ts` is its only importer.
- `tests/stripe-client-bundle-guard.test.ts` keeps it out of every browser bundle.
- `npm run security:audit` passes; its one moderate finding (`baseline-browser-mapping`) is on the base branch too.

**Standards.**
- JITM-01: §2.20, the feature map (Payments: built but off), §3 and §6.
- JITM-11: §2.53–§2.57, billing.
- JITM-14: §2.31, billing variables at go-live.
- The product-boundary test now allows billing words in the app. "Paid tier", "upgrade" and "downgrade" stay out.

## Verification

At the final code, `a4cfbf0`. Labels follow JITM-12 §2.1.
- VERIFIED: schema. `db:deploy` and `db:verify-release` pass (72 migrations, none missing or mismatched), and all four `db:rehearse-migration` rehearsals pass.
- VERIFIED: Vitest 2,137 passed, 17 of them new. The 24 failures are the four backup and recovery files that also fail on `main` (`spawn pg_dump ENOENT`).
- VERIFIED: browser specs with billing off: 50 passed, 4 skipped by their own conditions. Billing on with fake Stripe keys on a second local server: 9 checks pass, including a purchase that fails safely with "Nothing was charged" and the webhook through the real server (200, 400 and 503). No browser chunk contains `api.stripe.com`.
- VERIFIED: unit tests for prices, plans from subscriptions and configuration (`tests/billing-plans.test.ts`).
- VERIFIED: database integration tests (`tests/stripe-billing.integration.test.ts`). Stripe's API is faked; the signatures are real:
  - a signed event stores Stripe's plan;
  - a repeated delivery is processed once;
  - a cancellation returns the account to Free, in any event order;
  - a bad signature, billing switched off, and a stranger's customer change nothing;
  - deletion closes the Stripe customer, and deletion is blocked when that fails.
- VERIFIED: the browser test `e2e/plan-and-billing.spec.ts`, with billing off:
  - My account → See your plan shows the free beta and nothing to buy;
  - axe finds no WCAG 2.2 AA violation;
  - the webhook answers 503.
- NOT RUN: a real test-mode purchase through Stripe's checkout and portal. It needs Kevin's Stripe test keys; `docs/BILLING.md` lists the steps.

## Follow-ups

- **The plan limits**, next: 100/1,000/5,000 people with follow-ups on and 3/25/100 active Mixes, with a Mega-Mix counting as one, enforced only while billing is on. Billing must not be turned on before they ship.
- **JITM-09 §2.65** doesn't yet name Plan and billing. Update it once #102, which also changes JITM-09, merges.
- **The data export** doesn't include the plan yet.
- **Kevin's go-live decisions** (decision record): the start date, beta accounts, sales tax, refunds and cancellation timing, and the failed-payment grace period.
  - The code's defaults, to confirm: a past-due plan continues while Stripe retries; cancelling keeps the plan to the end of the paid period; switching plans is prorated; deleting an account ends billing at once without a refund.
