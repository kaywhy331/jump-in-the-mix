import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { starterPlanForMarketingScenario } from "@/lib/vertical-plan-library";
import { starterPlanForReason } from "@/lib/journey-starts";
import { marketingScenarioId } from "@/lib/marketing-scenarios";
import { onboardingReasons, onboardingUses } from "@/lib/onboarding-options";

export async function GET(request: Request) {
  if (!await getCurrentSession()) return NextResponse.json({ error: "Sign in to preview your starter." }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const uses = onboardingUses(query.getAll("use"));
  const reason = query.get("reason") ?? "";
  const scenario = uses.includes("business") ? marketingScenarioId(query.get("scenario")) : null;
  const businessType = uses.includes("business") ? (query.get("business") ?? "Other").slice(0, 120) : null;
  if (!uses.length || (!scenario && !onboardingReasons(uses, businessType).includes(reason))) return NextResponse.json({ error: "Choose a starting point." }, { status: 400 });
  const plan = scenario ? starterPlanForMarketingScenario(scenario) : starterPlanForReason(businessType, reason);
  return NextResponse.json({ plan }, { headers: { "Cache-Control": "private, no-store" } });
}
