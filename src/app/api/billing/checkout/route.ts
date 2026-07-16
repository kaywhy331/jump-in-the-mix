import { NextResponse } from "next/server";
import { isBillingPeriod, isPaidPlanTier } from "@/lib/billing";
import { BillingUserError, createStripeCheckoutSession } from "@/lib/billing-service";
import { requireWorkspace } from "@/lib/auth";

export const runtime = "nodejs";

function redirectWithError(request: Request, message: string): NextResponse {
  const url = new URL("/plans", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  if (impersonation) return redirectWithError(request, "Administrator support sessions are view-only.");
  if (membership.role === "MEMBER") return redirectWithError(request, "Only a workspace owner or administrator can change billing.");

  const formData = await request.formData();
  const planTierValue = String(formData.get("planTier") ?? "").toUpperCase();
  const billingPeriodValue = String(formData.get("billingPeriod") ?? "").toUpperCase();
  if (!isPaidPlanTier(planTierValue) || !isBillingPeriod(billingPeriodValue)) {
    return redirectWithError(request, "Choose a valid Plus or Pro billing option.");
  }

  try {
    const session = await createStripeCheckoutSession({
      workspace,
      user,
      planTier: planTierValue,
      billingPeriod: billingPeriodValue
    });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    const message = error instanceof BillingUserError
      ? error.message
      : "Stripe Checkout could not be started. Review the server billing configuration and try again.";
    return redirectWithError(request, message);
  }
}
