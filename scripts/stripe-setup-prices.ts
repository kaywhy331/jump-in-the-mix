// Creates the Stripe products, prices and billing-portal settings for Kevin's plans (docs/PRICING_DECISION_2026-09-29.md),
// reading the same catalogue as the app. Test mode by default; pass --live with a live key. An existing price is checked,
// never edited: a price that no longer matches the catalogue stops the script, and a changed price needs a new lookup key.
// Usage: STRIPE_SECRET_KEY=sk_test_… npm run stripe:setup [-- --live]
import Stripe from "stripe";
import { planAmountCents, priceLookupKey, priceMatchesPlan, type BillingIntervalId, type PaidPlanId } from "../src/lib/billing-plans";
import { planById } from "../src/lib/plans";

const APP = "jump-in-the-mix";
const live = process.argv.includes("--live");
const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
const site = (process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "https://jumpinthemix.com").replace(/\/$/, "");

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!/^(sk|rk)_(test|live)_\w+$/.test(key)) stop("Set STRIPE_SECRET_KEY to a Stripe secret key first.");
if (/_live_/.test(key) !== live) stop(live ? "--live needs a live key." : "This is a live key. Pass --live to set up live prices.");

const stripe = new Stripe(key, { telemetry: false, appInfo: { name: "Jump in the Mix setup" } });
const products = (await stripe.products.list({ active: true, limit: 100 })).data;
const portalProducts: Array<{ product: string; prices: string[] }> = [];

for (const plan of ["PLUS", "PRO"] as const satisfies readonly PaidPlanId[]) {
  const name = `Jump in the Mix ${planById(plan).name}`;
  const product = products.find(item => item.metadata.app === APP && item.metadata.plan === plan)
    ?? await stripe.products.create({ name, metadata: { app: APP, plan } });
  const prices: string[] = [];
  for (const interval of ["MONTH", "YEAR"] as const satisfies readonly BillingIntervalId[]) {
    const lookupKey = priceLookupKey(plan, interval);
    const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
    if (existing) {
      if (!priceMatchesPlan(existing, plan, interval)) stop(`${lookupKey} exists in Stripe but no longer matches the plan (${existing.id}). Nothing was changed.`);
      console.log(`${lookupKey}: already set up (${existing.id})`);
      prices.push(existing.id);
      continue;
    }
    const created = await stripe.prices.create({
      product: product.id, currency: "usd", unit_amount: planAmountCents(plan, interval), lookup_key: lookupKey,
      recurring: { interval: interval === "MONTH" ? "month" : "year" }, nickname: `${name}, ${interval === "MONTH" ? "monthly" : "yearly"}`, metadata: { app: APP }
    });
    console.log(`${lookupKey}: created (${created.id})`);
    prices.push(created.id);
  }
  portalProducts.push({ product: product.id, prices });
}

// The billing portal: update the card, see invoices, switch between the paid plans, or cancel at the end of the period.
const portal = {
  business_profile: { privacy_policy_url: `${site}/privacy`, terms_of_service_url: `${site}/terms` },
  default_return_url: `${site}/account/billing`,
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "name"] as Stripe.BillingPortal.ConfigurationCreateParams.Features.CustomerUpdate.AllowedUpdate[] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" as const },
    subscription_update: { enabled: true, default_allowed_updates: ["price"] as Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.DefaultAllowedUpdate[], proration_behavior: "create_prorations" as const, products: portalProducts }
  },
  metadata: { app: APP }
};
const existingPortal = (await stripe.billingPortal.configurations.list({ active: true, limit: 20 })).data.find(item => item.metadata?.app === APP);
const configured = existingPortal ? await stripe.billingPortal.configurations.update(existingPortal.id, portal) : await stripe.billingPortal.configurations.create(portal);
console.log(`Billing portal: ${existingPortal ? "updated" : "created"} (${configured.id})`);
console.log(`\nNext: add a webhook endpoint for ${site}/api/webhooks/stripe with the events in docs/BILLING.md, then set STRIPE_WEBHOOK_SECRET.`);
