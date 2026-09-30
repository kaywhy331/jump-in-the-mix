import Stripe from "stripe";
import { billingSettings } from "@/lib/billing-config";

let client: Stripe | null = null;
let clientKey = "";

/** The server's Stripe client. Card details never reach this app: people pay on Stripe's hosted pages. */
export function stripeClient(): Stripe {
  const { secretKey } = billingSettings();
  if (!secretKey) throw new Error("Stripe is not configured.");
  if (!client || clientKey !== secretKey) {
    client = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, telemetry: false, appInfo: { name: "Jump in the Mix" } });
    clientKey = secretKey;
  }
  return client;
}
