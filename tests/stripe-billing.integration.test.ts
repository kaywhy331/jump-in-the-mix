import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// Stripe's API is faked; signatures are real, made with the same library the route verifies them with.
const stripeApi = vi.hoisted(() => ({ list: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/stripe-client", async () => {
  const { default: StripeLibrary } = await import("stripe");
  const verifier = new StripeLibrary("sk_test_fixture");
  return { stripeClient: () => ({ webhooks: verifier.webhooks, subscriptions: { list: stripeApi.list }, customers: { del: stripeApi.del } }) };
});

import { POST } from "@/app/api/webhooks/stripe/route";
import { closeBillingForDeletion } from "@/lib/billing-deletion";
import { AccountDeletionBlockedError } from "@/lib/account-deletion";

const SECRET = "whsec_fixture";
const signer = new Stripe("sk_test_fixture");
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const saved = { enabled: process.env.BILLING_ENABLED, key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET };
const subscription = (status: string, lookupKey: string, cancelAt: number | null = null) => ({ id: `sub_${status}`, status, created: 1_800_000_000, cancel_at: cancelAt,
  items: { data: [{ price: { lookup_key: lookupKey }, current_period_end: 1_900_000_000 }] } });

describe.skipIf(!local)("Stripe billing", () => {
  let userId: string, workspaceId: string, customerId: string;
  const events: string[] = [];
  async function deliver(type: string, customer: string, signWith = SECRET) {
    const id = `evt_${randomUUID().replaceAll("-", "")}`; events.push(id);
    const payload = JSON.stringify({ id, object: "event", type, created: 1_800_000_000, livemode: false, data: { object: { id: "sub_fixture", object: "subscription", customer } } });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: signWith });
    const response = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload }));
    return { id, status: response.status, body: await response.json() };
  }

  beforeEach(async () => {
    Object.assign(process.env, { BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: SECRET });
    stripeApi.list.mockReset(); stripeApi.del.mockReset();
    userId = (await prisma.user.create({ data: { name: "Billing fixture", email: `billing-${randomUUID()}@example.test` } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Billing fixture", slug: randomUUID() } })).id;
    customerId = `cus_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    await prisma.workspaceBilling.create({ data: { workspaceId, stripeCustomerId: customerId } });
  });
  afterEach(async () => {
    await prisma.stripeWebhookEvent.deleteMany({ where: { id: { in: events } } }); events.length = 0;
    await prisma.workspace.deleteMany({ where: { id: workspaceId } }); await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => {
    for (const [name, value] of [["BILLING_ENABLED", saved.enabled], ["STRIPE_SECRET_KEY", saved.key], ["STRIPE_WEBHOOK_SECRET", saved.secret]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  it("stores the plan Stripe reports after a signed subscription event", async () => {
    stripeApi.list.mockResolvedValue({ data: [subscription("active", "jitm_plus_month")] });
    const delivered = await deliver("customer.subscription.created", customerId);
    expect(delivered).toMatchObject({ status: 200, body: { received: true } });
    expect(stripeApi.list).toHaveBeenCalledWith({ customer: customerId, status: "all", limit: 100 });
    expect(await prisma.workspaceBilling.findUniqueOrThrow({ where: { workspaceId } })).toMatchObject({ plan: "PLUS", interval: "MONTH", stripeSubscriptionId: "sub_active", subscriptionStatus: "active", currentPeriodEnd: new Date(1_900_000_000_000), cancelAt: null });
    expect((await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: delivered.id } })).processedAt).not.toBeNull();
  });

  it("acknowledges a repeated delivery without processing it again", async () => {
    stripeApi.list.mockResolvedValue({ data: [subscription("active", "jitm_pro_year")] });
    const payload = JSON.stringify({ id: "evt_repeat_fixture", object: "event", type: "invoice.paid", created: 1, data: { object: { customer: customerId } } }); events.push("evt_repeat_fixture");
    const send = () => POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": signer.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload }));
    expect(await (await send()).json()).toEqual({ received: true });
    expect(await (await send()).json()).toEqual({ received: true, duplicate: true });
    expect(stripeApi.list).toHaveBeenCalledTimes(1);
    expect((await prisma.workspaceBilling.findUniqueOrThrow({ where: { workspaceId } })).plan).toBe("PRO");
  });

  it("returns the account to Free when the subscription ends, whatever order the events arrive in", async () => {
    stripeApi.list.mockResolvedValueOnce({ data: [subscription("canceled", "jitm_plus_month")] }).mockResolvedValueOnce({ data: [subscription("canceled", "jitm_plus_month")] });
    await deliver("customer.subscription.deleted", customerId);
    await deliver("customer.subscription.updated", customerId);
    expect(await prisma.workspaceBilling.findUniqueOrThrow({ where: { workspaceId } })).toMatchObject({ plan: "FREE", interval: null, stripeSubscriptionId: null, subscriptionStatus: "canceled" });
  });

  it("refuses a bad signature and a disabled switch, and ignores customers it did not create", async () => {
    expect((await deliver("customer.subscription.updated", customerId, "whsec_someone_else")).status).toBe(400);
    stripeApi.list.mockResolvedValue({ data: [subscription("active", "jitm_plus_month")] });
    const stranger = await deliver("customer.subscription.updated", "cus_not_ours");
    expect(stranger.status).toBe(200);
    process.env.BILLING_ENABLED = "false";
    expect((await deliver("customer.subscription.updated", customerId)).status).toBe(503);
    expect(stripeApi.list).not.toHaveBeenCalled();
    expect((await prisma.workspaceBilling.findUniqueOrThrow({ where: { workspaceId } })).plan).toBe("FREE");
  });

  it("closes the Stripe customer before an account is deleted, and blocks deletion when that fails", async () => {
    stripeApi.del.mockResolvedValueOnce({ id: customerId, deleted: true });
    await closeBillingForDeletion(userId);
    expect(stripeApi.del).toHaveBeenCalledWith(customerId);
    stripeApi.del.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 404, code: "resource_missing" }));
    await expect(closeBillingForDeletion(userId)).resolves.toBeUndefined();
    stripeApi.del.mockRejectedValueOnce(new Error("network"));
    await expect(closeBillingForDeletion(userId)).rejects.toBeInstanceOf(AccountDeletionBlockedError);
    await prisma.workspaceBilling.update({ where: { workspaceId }, data: { stripeCustomerId: null } });
    stripeApi.del.mockClear();
    await closeBillingForDeletion(userId);
    expect(stripeApi.del).not.toHaveBeenCalled();
  });

  it("closes billing for every workspace the person owns, and never for one they only belong to (BIL-01)", async () => {
    const memberId = (await prisma.user.create({ data: { name: "Billing member", email: `billing-member-${randomUUID()}@example.test` } })).id;
    const secondId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Second fixture", slug: randomUUID() } })).id;
    const secondCustomer = `cus_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    try {
      await prisma.workspaceBilling.create({ data: { workspaceId: secondId, stripeCustomerId: secondCustomer } });
      // The member's only workspace is the owner's paid one: the one the session would open.
      await prisma.workspaceMember.create({ data: { workspaceId, userId: memberId } });
      await closeBillingForDeletion(memberId);
      expect(stripeApi.del).not.toHaveBeenCalled();

      stripeApi.del.mockResolvedValue({ deleted: true });
      await closeBillingForDeletion(userId);
      expect(stripeApi.del.mock.calls.map(([id]) => id).sort()).toEqual([customerId, secondCustomer].sort());

      // A retry after a partial failure skips the customer Stripe already deleted and closes the rest.
      stripeApi.del.mockReset();
      stripeApi.del.mockImplementation(async (id: string) => {
        if (id === customerId) throw Object.assign(new Error("gone"), { statusCode: 404, code: "resource_missing" });
        return { deleted: true };
      });
      await expect(closeBillingForDeletion(userId)).resolves.toBeUndefined();
      expect(stripeApi.del).toHaveBeenCalledWith(secondCustomer);
    } finally {
      await prisma.workspace.deleteMany({ where: { id: secondId } });
      await prisma.user.deleteMany({ where: { id: memberId } });
    }
  });
});
