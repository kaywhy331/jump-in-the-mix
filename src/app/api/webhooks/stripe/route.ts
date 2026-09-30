import type Stripe from "stripe";
import { billingReady, billingSettings } from "@/lib/billing-config";
import { syncCustomerBilling } from "@/lib/billing-sync";
import { boundedRequestText } from "@/lib/bounded-request";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe-client";

export const runtime = "nodejs";

// Events that can change which plan a customer has. Each one re-reads the customer's subscriptions from Stripe.
const PLAN_EVENTS = /^(checkout\.session\.completed|customer\.subscription\.\w+|invoice\.paid|invoice\.payment_failed)$/;

function eventCustomer(event: Stripe.Event): string | null {
  const customer = (event.data.object as { customer?: string | { id: string } | null }).customer;
  return typeof customer === "string" ? customer : customer?.id ?? null;
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!billingReady()) return Response.json({ error: "Billing is off." }, { status: 503, headers });
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!signature || signature.length > 4096) return Response.json({ error: "Invalid signature." }, { status: 400, headers });
  let body: string;
  try { body = await boundedRequestText(request, 512 * 1024); } catch { return Response.json({ error: "Request exceeds the allowed body size." }, { status: 413, headers }); }
  let event: Stripe.Event;
  try { event = stripeClient().webhooks.constructEvent(body, signature, billingSettings().webhookSecret); }
  catch { return Response.json({ error: "Invalid signature." }, { status: 400, headers }); }
  const customerId = eventCustomer(event);
  try {
    const seen = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id }, select: { processedAt: true } });
    if (seen?.processedAt) return Response.json({ received: true, duplicate: true }, { headers });
    if (!seen) await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type.slice(0, 100), customerId } });
    if (customerId && PLAN_EVENTS.test(event.type)) await syncCustomerBilling(prisma, stripeClient(), customerId);
    await prisma.stripeWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
    return Response.json({ received: true }, { headers });
  } catch {
    // Non-2xx makes Stripe retry the same event; the event id keeps the retry from being processed twice.
    return Response.json({ error: "Event could not be processed. Stripe will retry." }, { status: 503, headers });
  }
}
