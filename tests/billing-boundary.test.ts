import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Stripe billing boundaries", () => {
  it("derives Checkout and portal identity from the authenticated workspace", () => {
    const checkout = read("src/app/api/billing/checkout/route.ts");
    const portal = read("src/app/api/billing/portal/route.ts");
    expect(checkout).toContain("requireWorkspace()");
    expect(portal).toContain("requireWorkspace()");
    expect(checkout).not.toContain('formData.get("priceId")');
    expect(checkout).toContain('formData.get("planTier")');
    expect(checkout).toContain('formData.get("billingPeriod")');
    expect(checkout).toContain('membership.role === "MEMBER"');
    expect(portal).toContain('membership.role === "MEMBER"');
  });

  it("keeps the webhook public while requiring raw-body signature verification", () => {
    const webhook = read("src/app/api/webhooks/stripe/route.ts");
    const proxy = read("src/proxy.ts");
    expect(webhook).toContain("await request.text()");
    expect(webhook).toContain("verifyStripeWebhookSignature");
    expect(webhook).toContain("stripe-signature");
    expect(webhook).toContain("externalId: event.id");
    expect(webhook).toContain('status === "PROCESSED"');
    expect(webhook).not.toContain("requireWorkspace()");
    expect(proxy).toContain('request.nextUrl.pathname.startsWith("/api/webhooks/")');
  });

  it("verifies Checkout against Stripe and the active workspace before granting access", () => {
    const route = read("src/app/api/billing/verify/route.ts");
    const service = read("src/lib/billing-service.ts");
    expect(route).toContain("requireWorkspace()");
    expect(route).toContain("reconcileCheckoutSessionForWorkspace");
    expect(service).toContain("sessionWorkspaceId !== workspaceId");
    expect(service).toContain("retrieveStripeCheckoutSession");
    expect(service).toContain("syncStripeSubscription");
  });

  it("copies workspace identity into the Customer, Session, and Subscription metadata", () => {
    const service = read("src/lib/billing-service.ts");
    expect(service).toContain('"metadata[workspace_id]"');
    expect(service).toContain('"subscription_data[metadata][workspace_id]"');
    expect(service).toContain("client_reference_id: input.workspace.id");
    expect(service).toContain('"metadata[user_id]"');
  });

  it("uses Stripe period dates and reconciles lifecycle events idempotently", () => {
    const service = read("src/lib/billing-service.ts");
    const webhook = read("src/app/api/webhooks/stripe/route.ts");
    expect(service).toContain("current_period_end");
    expect(service).toContain('case "invoice.paid"');
    expect(service).toContain('case "invoice.payment_failed"');
    expect(service).toContain('case "customer.subscription.deleted"');
    expect(webhook).toContain("payloadHash");
    expect(webhook).toContain('status: "PROCESSED"');
  });

  it("provides user and administrator billing surfaces without exposing secrets", () => {
    const account = read("src/app/(app)/account/page.tsx");
    const plans = read("src/app/(app)/plans/page.tsx");
    const admin = read("src/app/(app)/admin/billing/page.tsx");
    expect(account).toContain("Billing and subscription");
    expect(plans).toContain('action="/api/billing/checkout"');
    expect(plans).toContain('action="/api/billing/portal"');
    expect(admin).toContain("Admin · Billing");
    expect(admin).not.toContain("stripeSecretKey");
    expect(admin).not.toContain("stripeWebhookSecret");
  });
});
