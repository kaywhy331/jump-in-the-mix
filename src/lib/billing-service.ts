import { randomUUID } from "node:crypto";
import type { PlanTier, Prisma, SubscriptionStatus } from "@/generated/prisma/client";
import {
  billingPriceId,
  billingSelectionForPriceId,
  effectivePlanTier,
  isBillingPeriod,
  isPaidPlanTier,
  mapStripeSubscriptionStatus,
  type BillingPeriod,
  type PaidPlanTier
} from "@/lib/billing";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { StripeApiError, stripeObjectId, stripeRequest, stripeUnixDate } from "@/lib/stripe-client";

type StripeMetadata = Record<string, string | undefined>;

type StripeOrderingState = {
  eventId: string;
  eventCreated: number;
  subscriptionId: string;
};

const STRIPE_ORDERING_KEY = "stripe:subscription-order";
const STRIPE_ORDERING_RETENTION_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export type StripeCustomer = {
  id: string;
  deleted?: boolean;
  email?: string | null;
  metadata?: StripeMetadata;
};

export type StripeCheckoutSession = {
  id: string;
  object: "checkout.session";
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  url?: string | null;
  customer?: string | StripeCustomer | null;
  subscription?: string | StripeSubscription | null;
  client_reference_id?: string | null;
  metadata?: StripeMetadata;
};

type StripeSubscriptionItem = {
  id?: string;
  current_period_start?: number;
  current_period_end?: number;
  price?: { id?: string; recurring?: { interval?: string | null } | null } | null;
};

export type StripeSubscription = {
  id: string;
  object: "subscription";
  customer?: string | StripeCustomer | null;
  status?: string | null;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: StripeMetadata;
  items?: { data?: StripeSubscriptionItem[] };
};

type StripeInvoice = {
  id: string;
  customer?: string | StripeCustomer | null;
  subscription?: string | StripeSubscription | null;
  parent?: { subscription_details?: { subscription?: string | StripeSubscription | null } | null } | null;
  lines?: {
    data?: Array<{
      subscription?: string | null;
      parent?: { subscription_item_details?: { subscription?: string | null } | null };
    }>;
  };
};

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: unknown };
};

export class BillingUserError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "BillingUserError";
    this.code = code;
  }
}

function cleanMetadataValue(value: string | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

function metadataWorkspaceId(metadata: StripeMetadata | undefined): string | null {
  return cleanMetadataValue(metadata?.workspace_id) ?? cleanMetadataValue(metadata?.workspaceId);
}

function metadataPlanTier(metadata: StripeMetadata | undefined): PaidPlanTier | null {
  const value = cleanMetadataValue(metadata?.plan_tier) ?? cleanMetadataValue(metadata?.plan);
  return isPaidPlanTier(value) ? value : null;
}

function metadataBillingPeriod(metadata: StripeMetadata | undefined): BillingPeriod | null {
  const value = cleanMetadataValue(metadata?.billing_period)?.toUpperCase();
  return isBillingPeriod(value) ? value : null;
}

function firstSubscriptionItem(subscription: StripeSubscription): StripeSubscriptionItem | null {
  return subscription.items?.data?.[0] ?? null;
}

function subscriptionPriceId(subscription: StripeSubscription): string | null {
  return firstSubscriptionItem(subscription)?.price?.id ?? null;
}

function subscriptionPeriod(subscription: StripeSubscription): { start: Date | null; end: Date | null } {
  const item = firstSubscriptionItem(subscription);
  return {
    start: stripeUnixDate(subscription.current_period_start ?? item?.current_period_start),
    end: stripeUnixDate(subscription.current_period_end ?? item?.current_period_end)
  };
}

function invoiceSubscriptionId(invoice: StripeInvoice): string | null {
  return stripeObjectId(invoice.subscription)
    ?? stripeObjectId(invoice.parent?.subscription_details?.subscription)
    ?? invoice.lines?.data?.map((line) => line.subscription ?? line.parent?.subscription_item_details?.subscription ?? null).find(Boolean)
    ?? null;
}

function parseOrdering(value: Prisma.JsonValue | null | undefined): StripeOrderingState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.eventId !== "string" || typeof candidate.eventCreated !== "number" || typeof candidate.subscriptionId !== "string") {
    return null;
  }
  return {
    eventId: candidate.eventId,
    eventCreated: candidate.eventCreated,
    subscriptionId: candidate.subscriptionId
  };
}

function retryableTransactionError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!retryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Stripe state could not be serialized.");
}

async function retrieveStripeCustomer(customerId: string): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>(`/v1/customers/${encodeURIComponent(customerId)}`, { method: "GET" });
}

export async function retrieveStripeSubscription(subscriptionId: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    params: { "expand[0]": "items.data.price" }
  });
}

export async function retrieveStripeCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    params: { "expand[0]": "subscription", "expand[1]": "customer" }
  });
}

async function createStripeCustomer(input: {
  workspaceId: string;
  userId: string;
  email: string;
  name: string;
  workspaceName: string;
}): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>("/v1/customers", {
    params: {
      email: input.email,
      name: input.name,
      description: `Jump in the Mix workspace: ${input.workspaceName}`,
      "metadata[workspace_id]": input.workspaceId,
      "metadata[user_id]": input.userId
    },
    idempotencyKey: `customer:${input.workspaceId}`
  });
}

async function ensureStripeCustomer(input: {
  workspaceId: string;
  userId: string;
  email: string;
  name: string;
  workspaceName: string;
  currentCustomerId: string | null;
}): Promise<string> {
  if (input.currentCustomerId) {
    try {
      const customer = await stripeRequest<StripeCustomer>(`/v1/customers/${encodeURIComponent(input.currentCustomerId)}`, {
        params: {
          email: input.email,
          name: input.name,
          "metadata[workspace_id]": input.workspaceId,
          "metadata[user_id]": input.userId
        },
        idempotencyKey: `customer-update:${input.workspaceId}`
      });
      if (!customer.deleted) return customer.id;
    } catch (error) {
      if (!(error instanceof StripeApiError) || error.status !== 404) throw error;
    }
  }

  const customer = await createStripeCustomer(input);
  await prisma.workspace.update({ where: { id: input.workspaceId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export async function createStripeCheckoutSession(input: {
  workspace: {
    id: string;
    name: string;
    planTier: PlanTier;
    subscriptionStatus: SubscriptionStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  };
  user: { id: string; email: string; name: string };
  planTier: PaidPlanTier;
  billingPeriod: BillingPeriod;
}): Promise<StripeCheckoutSession> {
  if (
    input.workspace.stripeSubscriptionId
    && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(input.workspace.subscriptionStatus)
  ) {
    throw new BillingUserError("Manage your existing subscription in the Stripe billing portal.", "EXISTING_SUBSCRIPTION");
  }

  const priceId = billingPriceId(input.planTier, input.billingPeriod);
  if (!priceId) {
    throw new BillingUserError(`The ${input.planTier.toLowerCase()} ${input.billingPeriod.toLowerCase()} price is not configured.`, "PRICE_NOT_CONFIGURED");
  }

  const customerId = await ensureStripeCustomer({
    workspaceId: input.workspace.id,
    userId: input.user.id,
    email: input.user.email,
    name: input.user.name,
    workspaceName: input.workspace.name,
    currentCustomerId: input.workspace.stripeCustomerId
  });
  const metadata = {
    workspace_id: input.workspace.id,
    user_id: input.user.id,
    plan_tier: input.planTier,
    billing_period: input.billingPeriod
  };
  const appUrl = env.appUrl.replace(/\/$/, "");
  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", {
    params: {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      client_reference_id: input.workspace.id,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      "metadata[workspace_id]": metadata.workspace_id,
      "metadata[user_id]": metadata.user_id,
      "metadata[plan_tier]": metadata.plan_tier,
      "metadata[billing_period]": metadata.billing_period,
      "subscription_data[metadata][workspace_id]": metadata.workspace_id,
      "subscription_data[metadata][user_id]": metadata.user_id,
      "subscription_data[metadata][plan_tier]": metadata.plan_tier,
      "subscription_data[metadata][billing_period]": metadata.billing_period
    },
    idempotencyKey: `checkout:${input.workspace.id}:${input.planTier}:${input.billingPeriod}:${Math.floor(Date.now() / (30 * 60_000))}`
  });
}

export async function createStripePortalSession(input: {
  workspaceId: string;
  stripeCustomerId: string | null;
}): Promise<{ id: string; url: string }> {
  if (!input.stripeCustomerId) {
    throw new BillingUserError("No Stripe billing account is connected to this workspace yet.", "NO_CUSTOMER");
  }
  const appUrl = env.appUrl.replace(/\/$/, "");
  return stripeRequest<{ id: string; url: string }>("/v1/billing_portal/sessions", {
    params: {
      customer: input.stripeCustomerId,
      return_url: `${appUrl}/account?section=billing&billing=portal-return`
    },
    idempotencyKey: `portal:${input.workspaceId}:${randomUUID()}`
  });
}

async function workspaceForStripeSubscription(
  subscription: StripeSubscription,
  hintedWorkspaceId: string | null = null
) {
  const customerId = stripeObjectId(subscription.customer);
  const workspaceId = metadataWorkspaceId(subscription.metadata) ?? hintedWorkspaceId;
  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (workspace && (!workspace.stripeCustomerId || !customerId || workspace.stripeCustomerId === customerId)) return workspace;
  }
  const bySubscription = await prisma.workspace.findFirst({ where: { stripeSubscriptionId: subscription.id } });
  if (bySubscription) return bySubscription;
  if (customerId) {
    const byCustomer = await prisma.workspace.findFirst({ where: { stripeCustomerId: customerId } });
    if (byCustomer) return byCustomer;
    const customer = await retrieveStripeCustomer(customerId);
    const customerWorkspaceId = metadataWorkspaceId(customer.metadata);
    if (customerWorkspaceId) return prisma.workspace.findUnique({ where: { id: customerWorkspaceId } });
  }
  return null;
}

function replacementAllowed(eventType: string, explicit: boolean): boolean {
  return explicit
    || eventType === "checkout.session.completed"
    || eventType === "checkout.session.async_payment_succeeded"
    || eventType === "checkout.session.verify";
}

export async function syncStripeSubscription(input: {
  subscription: StripeSubscription;
  eventType: string;
  hintedWorkspaceId?: string | null;
  statusOverride?: SubscriptionStatus | null;
  eventId?: string | null;
  eventCreated?: number | null;
  allowSubscriptionReplacement?: boolean;
}): Promise<{ workspaceId: string; planTier: PlanTier; status: SubscriptionStatus; ignored: boolean }> {
  const workspace = await workspaceForStripeSubscription(input.subscription, input.hintedWorkspaceId ?? null);
  if (!workspace) throw new Error(`No workspace could be resolved for Stripe subscription ${input.subscription.id}.`);

  const priceId = subscriptionPriceId(input.subscription);
  const selection = billingSelectionForPriceId(priceId);
  const planTier = selection?.planTier ?? metadataPlanTier(input.subscription.metadata);
  const billingPeriod = selection?.billingPeriod ?? metadataBillingPeriod(input.subscription.metadata);
  if (!priceId || !planTier || !billingPeriod) {
    throw new Error(`Stripe subscription ${input.subscription.id} uses an unrecognized price or missing plan metadata.`);
  }

  const status = input.statusOverride ?? mapStripeSubscriptionStatus(input.subscription.status);
  const effectiveTier = effectivePlanTier(planTier, status);
  const period = subscriptionPeriod(input.subscription);
  const customerId = stripeObjectId(input.subscription.customer) ?? workspace.stripeCustomerId;
  const cancelAtPeriodEnd = Boolean(input.subscription.cancel_at_period_end);
  const eventCreated = Number.isFinite(input.eventCreated) && Number(input.eventCreated) > 0
    ? Number(input.eventCreated)
    : Math.floor(Date.now() / 1000);
  const eventId = input.eventId?.trim() || `${input.eventType}:${input.subscription.id}:${eventCreated}`;

  return serializable(async (tx) => {
    const currentWorkspace = await tx.workspace.findUnique({ where: { id: workspace.id } });
    if (!currentWorkspace) throw new Error("The Stripe workspace no longer exists.");
    const orderingRecord = await tx.idempotencyKey.findUnique({
      where: { workspaceId_key: { workspaceId: workspace.id, key: STRIPE_ORDERING_KEY } },
      select: { response: true }
    });
    const previousOrder = parseOrdering(orderingRecord?.response ?? null);
    if (previousOrder?.eventId === eventId || (previousOrder && eventCreated < previousOrder.eventCreated)) {
      return {
        workspaceId: currentWorkspace.id,
        planTier: currentWorkspace.planTier,
        status: currentWorkspace.subscriptionStatus,
        ignored: true
      };
    }

    const replacingSubscription = Boolean(
      currentWorkspace.stripeSubscriptionId
      && currentWorkspace.stripeSubscriptionId !== input.subscription.id
    );
    if (replacingSubscription && !replacementAllowed(input.eventType, input.allowSubscriptionReplacement === true)) {
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorType: "WEBHOOK",
          action: "billing.subscription.ignored",
          entityType: "Subscription",
          entityId: input.subscription.id,
          source: "stripe",
          metadata: {
            eventType: input.eventType,
            eventId,
            eventCreated,
            reason: "non-canonical-subscription",
            canonicalSubscriptionId: currentWorkspace.stripeSubscriptionId
          }
        }
      });
      return {
        workspaceId: currentWorkspace.id,
        planTier: currentWorkspace.planTier,
        status: currentWorkspace.subscriptionStatus,
        ignored: true
      };
    }

    await tx.subscription.upsert({
      where: { stripeSubscriptionId: input.subscription.id },
      create: {
        workspaceId: workspace.id,
        stripeSubscriptionId: input.subscription.id,
        stripePriceId: priceId,
        planTier,
        billingPeriod,
        status,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd
      },
      update: {
        workspaceId: workspace.id,
        stripePriceId: priceId,
        planTier,
        billingPeriod,
        status,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd
      }
    });
    await tx.workspace.update({
      where: { id: workspace.id },
      data: {
        planTier: effectiveTier,
        subscriptionStatus: status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: input.subscription.id,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd
      }
    });
    await tx.idempotencyKey.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: STRIPE_ORDERING_KEY } },
      create: {
        workspaceId: workspace.id,
        key: STRIPE_ORDERING_KEY,
        response: { eventId, eventCreated, subscriptionId: input.subscription.id },
        expiresAt: new Date(Date.now() + STRIPE_ORDERING_RETENTION_MS)
      },
      update: {
        response: { eventId, eventCreated, subscriptionId: input.subscription.id },
        expiresAt: new Date(Date.now() + STRIPE_ORDERING_RETENTION_MS)
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "WEBHOOK",
        action: "billing.subscription.sync",
        entityType: "Subscription",
        entityId: input.subscription.id,
        source: "stripe",
        metadata: {
          eventType: input.eventType,
          eventId,
          eventCreated,
          priceId,
          planTier,
          effectiveTier,
          billingPeriod,
          status,
          cancelAtPeriodEnd,
          currentPeriodEnd: period.end?.toISOString() ?? null,
          replacedSubscriptionId: replacingSubscription ? currentWorkspace.stripeSubscriptionId : null
        }
      }
    });
    return { workspaceId: workspace.id, planTier: effectiveTier, status, ignored: false };
  });
}

export async function reconcileCheckoutSessionForWorkspace(sessionId: string, workspaceId: string): Promise<{
  complete: boolean;
  paymentStatus: string;
  subscriptionStatus: SubscriptionStatus | null;
  planTier: PlanTier | null;
}> {
  const session = await retrieveStripeCheckoutSession(sessionId);
  const sessionWorkspaceId = metadataWorkspaceId(session.metadata) ?? session.client_reference_id ?? null;
  if (sessionWorkspaceId !== workspaceId) {
    throw new BillingUserError("This Checkout Session does not belong to the current workspace.", "SESSION_WORKSPACE_MISMATCH");
  }
  if (session.mode !== "subscription") {
    throw new BillingUserError("This Checkout Session is not a subscription purchase.", "SESSION_MODE_MISMATCH");
  }

  const complete = session.status === "complete";
  if (!complete) {
    return {
      complete: false,
      paymentStatus: session.payment_status ?? "unpaid",
      subscriptionStatus: null,
      planTier: null
    };
  }

  const subscription = typeof session.subscription === "object" && session.subscription
    ? session.subscription
    : stripeObjectId(session.subscription)
      ? await retrieveStripeSubscription(stripeObjectId(session.subscription)!)
      : null;
  if (!subscription) throw new Error("Stripe completed Checkout without a subscription reference.");
  const synced = await syncStripeSubscription({
    subscription,
    eventType: "checkout.session.verify",
    hintedWorkspaceId: workspaceId,
    eventId: `checkout-verify:${session.id}`,
    eventCreated: Math.floor(Date.now() / 1000),
    allowSubscriptionReplacement: true
  });
  return {
    complete: true,
    paymentStatus: session.payment_status ?? "paid",
    subscriptionStatus: synced.status,
    planTier: synced.planTier
  };
}

export async function processStripeEvent(event: StripeEvent): Promise<{ workspaceId: string | null; ignored?: boolean }> {
  const ordering = { eventId: event.id, eventCreated: event.created };
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as StripeCheckoutSession;
      const workspaceId = metadataWorkspaceId(session.metadata) ?? session.client_reference_id ?? null;
      const subscriptionId = stripeObjectId(session.subscription);
      if (!subscriptionId) return { workspaceId };
      const subscription = typeof session.subscription === "object" && session.subscription
        ? session.subscription
        : await retrieveStripeSubscription(subscriptionId);
      const synced = await syncStripeSubscription({
        subscription,
        eventType: event.type,
        hintedWorkspaceId: workspaceId,
        ...ordering,
        allowSubscriptionReplacement: true
      });
      return { workspaceId: synced.workspaceId, ignored: synced.ignored };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const subscription = event.data.object as StripeSubscription;
      const synced = await syncStripeSubscription({ subscription, eventType: event.type, ...ordering });
      return { workspaceId: synced.workspaceId, ignored: synced.ignored };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as StripeInvoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return { workspaceId: null };
      const subscription = await retrieveStripeSubscription(subscriptionId);
      const synced = await syncStripeSubscription({
        subscription,
        eventType: event.type,
        statusOverride: event.type === "invoice.payment_failed" ? "PAST_DUE" : null,
        ...ordering
      });
      return { workspaceId: synced.workspaceId, ignored: synced.ignored };
    }
    default:
      return { workspaceId: null };
  }
}
