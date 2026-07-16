import { NextResponse } from "next/server";
import { processStripeEvent, type StripeEvent } from "@/lib/billing-service";
import { enforceCurrentWorkspacePlanLimits } from "@/lib/plan-downgrade";
import { prisma } from "@/lib/prisma";
import {
  StripeConfigurationError,
  StripeWebhookSignatureError,
  stripePayloadHash,
  verifyStripeWebhookSignature
} from "@/lib/stripe-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function parseStripeEvent(payload: string): StripeEvent {
  const value = JSON.parse(payload) as Partial<StripeEvent>;
  if (!value.id || !value.type || !value.data || typeof value.data !== "object" || !("object" in value.data)) {
    throw new Error("The Stripe event payload is incomplete.");
  }
  return value as StripeEvent;
}

export async function POST(request: Request) {
  const payload = await request.text();
  try {
    verifyStripeWebhookSignature(payload, request.headers.get("stripe-signature"));
  } catch (error) {
    const configurationError = error instanceof StripeConfigurationError;
    const message = error instanceof StripeWebhookSignatureError || configurationError
      ? error.message
      : "The Stripe webhook signature could not be verified.";
    return NextResponse.json({ error: message }, { status: configurationError ? 503 : 400 });
  }

  let event: StripeEvent;
  try {
    event = parseStripeEvent(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Stripe event." }, { status: 400 });
  }

  const payloadHash = stripePayloadHash(payload);
  let stored = await prisma.webhookEvent.findFirst({
    where: { provider: "STRIPE", externalId: event.id }
  });
  if (stored?.status === "PROCESSED") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!stored) {
    try {
      stored = await prisma.webhookEvent.create({
        data: {
          provider: "STRIPE",
          externalId: event.id,
          payloadHash,
          status: "PROCESSING"
        }
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      stored = await prisma.webhookEvent.findFirstOrThrow({
        where: { provider: "STRIPE", externalId: event.id }
      });
      if (stored.status === "PROCESSED") {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }
  } else {
    stored = await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { status: "PROCESSING", error: null, payloadHash }
    });
  }

  try {
    const result = await processStripeEvent(event);
    const workspace = result.workspaceId
      ? await prisma.workspace.findUnique({ where: { id: result.workspaceId }, select: { planTier: true } })
      : null;
    const safeguards = result.workspaceId && workspace
      ? await enforceCurrentWorkspacePlanLimits(result.workspaceId, workspace.planTier)
      : null;
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: {
        workspaceId: result.workspaceId,
        status: "PROCESSED",
        error: null,
        processedAt: new Date()
      }
    });
    return NextResponse.json({ received: true, safeguards });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Stripe event processing failed.";
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { status: "FAILED", error: message, processedAt: null }
    }).catch(() => null);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
