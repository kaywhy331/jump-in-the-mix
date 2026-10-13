import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { starterPlanForMarketingScenario } from "@/lib/vertical-plan-library";
import { starterPlanForReason } from "@/lib/journey-starts";
import { marketingScenarioId } from "@/lib/marketing-scenarios";
import { onboardingReasons, onboardingUses, currentReason } from "@/lib/onboarding-options";
import { onboardingPreview } from "@/lib/onboarding-preview-schedule";

export async function GET(request: Request) {
  const membership = (await getCurrentSession())?.user.memberships[0];
  if (!membership) return NextResponse.json({ error: "Sign in to preview your starter." }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const uses = onboardingUses(query.getAll("use"));
  const reason = currentReason(query.get("reason") ?? "");
  const scenario = uses.includes("business") ? marketingScenarioId(query.get("scenario")) : null;
  const businessType = uses.includes("business") ? (query.get("business") ?? "Other").slice(0, 120) : null;
  if (!uses.length || (!scenario && !onboardingReasons(uses, businessType).includes(reason))) return NextResponse.json({ error: "Choose a starting point." }, { status: 400 });
  const plan = scenario ? starterPlanForMarketingScenario(scenario) : starterPlanForReason(businessType, reason);
  // The chosen date and timezone date each Beat as the scheduler will (D73).
  const preview = plan ? await onboardingPreview(membership.workspaceId, plan, query.get("date") ?? "", query.get("timezone") ?? "") : null;
  return NextResponse.json({ preview }, { headers: { "Cache-Control": "private, no-store" } });
}
