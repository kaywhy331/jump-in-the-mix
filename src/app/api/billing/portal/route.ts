import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { BillingUserError, createStripePortalSession } from "@/lib/billing-service";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

export const runtime = "nodejs";

function accountRedirect(request: Request, key: "billing" | "billingError", value: string): NextResponse {
  const url = new URL("/account", request.url);
  url.searchParams.set("section", "billing");
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  if (impersonation) return accountRedirect(request, "billingError", "Administrator support sessions are view-only.");
  if (membership.role === "MEMBER") return accountRedirect(request, "billingError", "Only a workspace owner or administrator can manage billing.");

  const requestMetadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.billing.portal",
    identifiers: [workspace.id, user.id, requestMetadata.ipAddress],
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return accountRedirect(request, "billingError", `Too many billing-portal requests. Try again in ${rateLimit.retryAfterSeconds} seconds.`);
  }

  try {
    const session = await createStripePortalSession({
      workspaceId: workspace.id,
      stripeCustomerId: workspace.stripeCustomerId
    });
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    const message = error instanceof BillingUserError
      ? error.message
      : "The Stripe billing portal could not be opened. Check the billing configuration and try again.";
    return accountRedirect(request, "billingError", message);
  }
}
