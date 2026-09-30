// Charging stays off until BILLING_ENABLED=true, on a date Kevin chooses (docs/PRICING_DECISION_2026-09-29.md).
// While it is off, nothing can be bought, no plan limits apply and the Stripe webhook refuses events.
export type BillingSettings = { enabled: boolean; secretKey: string; webhookSecret: string };

export function billingSettings(source: NodeJS.ProcessEnv = process.env): BillingSettings {
  return {
    enabled: (source.BILLING_ENABLED ?? "false").trim().toLowerCase() === "true",
    secretKey: source.STRIPE_SECRET_KEY?.trim() ?? "",
    webhookSecret: source.STRIPE_WEBHOOK_SECRET?.trim() ?? ""
  };
}

/** Billing is usable only when it is switched on and both Stripe secrets are present and well formed. */
export function billingReady(source: NodeJS.ProcessEnv = process.env): boolean {
  return billingSettings(source).enabled && !billingConfigurationIssues(source).length;
}

export function billingConfigurationIssues(source: NodeJS.ProcessEnv = process.env): string[] {
  const settings = billingSettings(source);
  if (!settings.enabled) return [];
  const issues: string[] = [];
  if (!/^(sk|rk)_(test|live)_\w+$/.test(settings.secretKey)) issues.push("STRIPE_SECRET_KEY must be a Stripe secret or restricted key when BILLING_ENABLED is true");
  if (!/^whsec_\w+$/.test(settings.webhookSecret)) issues.push("STRIPE_WEBHOOK_SECRET must be the webhook endpoint's signing secret when BILLING_ENABLED is true");
  if (hostedProduction(source) && /^(sk|rk)_test_/.test(settings.secretKey)) issues.push("STRIPE_SECRET_KEY must be a live key when billing is on in hosted production");
  return issues;
}

/** Hosted production serves a public https origin; a local production build on a loopback address may use test keys. */
function hostedProduction(source: NodeJS.ProcessEnv): boolean {
  if ((source.NODE_ENV ?? "development") !== "production" || (source.PILOT_MODE ?? "false").toLowerCase() === "true") return false;
  try {
    const url = new URL(source.APP_URL ?? "");
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return true;
  }
}
