import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { BillingUserError, createStripePortalSession } from "@/lib/billing-service";

export const runtime = "nodejs";

function accountRedirect(request: Request, key: "billing" | "billingError", value: string): NextResponse {
  const url = new URL("/account", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const { workspace, membership, impersonation } = await requireWorkspace();
  if (impersonation) return accountRedirect(request, "billingError", "Administrator support sessions are view-only.");
  if (membership.role === "MEMBER") return accountRedirect(request, "billingError", "Only a workspace owner or administrator can manage billing.");

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
