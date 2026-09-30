import { megaMixById } from "@/lib/mega-mixes";
import type { ReadyMadePlan } from "@/lib/plan-library-types";
import { starterPlanForMarketingScenario, starterPlanForOnboarding } from "@/lib/vertical-plan-library";

// A business type with its own curated Mega-Mix starts onboarding from that journey instead of the general business
// list (Kevin, 2026-09-29: "Realtor should follow a journey that is tailored and curated for that particular field of work").
// Each start is one stage of the Mega-Mix, or the check-back text from the matching marketing example.
type JourneyStart = { reason: string; category: string } & ({ node: string } | { scenario: string });
const JOURNEY_STARTS: Record<string, { megaMix: string; starts: JourneyStart[] }> = {
  "Real estate": { megaMix: "real-estate", starts: [
    { reason: "Reply to a new buyer lead", node: "buyer", category: "New clients" },
    { reason: "Reply to a new seller lead", node: "seller", category: "New clients" },
    { reason: "Follow up after a showing or open house", node: "showings", category: "New clients" },
    { reason: "Check back when they asked you to", scenario: "real-estate", category: "New clients" },
    { reason: "Update a client who is under contract", node: "contract", category: "Active clients" },
    { reason: "Check in after closing", node: "closing", category: "Past clients" },
    { reason: "Keep in touch with a past client", node: "past-client", category: "Past clients" }
  ] }
};

function journeyFor(businessType: string | null | undefined) {
  return businessType && Object.hasOwn(JOURNEY_STARTS, businessType) ? JOURNEY_STARTS[businessType] : null;
}

/**
 * The first follow-ups a business type's own journey offers, or null when it uses the general list. A start that repeats
 * the marketing example the person tried is left out, because onboarding already offers that example.
 */
export function journeyStartReasons(businessType: string | null | undefined, suggestedScenario?: string | null): string[] | null {
  const journey = journeyFor(businessType);
  return journey ? journey.starts.filter(start => !("scenario" in start) || start.scenario !== suggestedScenario).map(start => start.reason) : null;
}

export function starterPlanForJourneyStart(businessType: string | null | undefined, reason: string): ReadyMadePlan | null {
  const journey = journeyFor(businessType), start = journey?.starts.find(item => item.reason === reason);
  if (!journey || !start) return null;
  if ("scenario" in start) return starterPlanForMarketingScenario(start.scenario);
  const blueprint = megaMixById(journey.megaMix), stage = blueprint?.nodes.find(item => item.key === start.node);
  if (!blueprint || !stage) return null;
  // Onboarding asks when to follow up, so the stage's first Beat falls on the chosen day.
  const first = stage.steps[0].dayOffset;
  return {
    id: `journey_${blueprint.id}_${stage.key}`, title: stage.name, description: stage.purpose, category: start.category,
    industry: blueprint.industry as ReadyMadePlan["industry"], framework: "Ready-made", triggerMode: "DATE_TRIGGERED",
    dateTypeName: "Follow-up", dateTypeSlug: "follow-up", durationDays: stage.steps.at(-1)!.dayOffset - first, featured: false,
    steps: stage.steps.map(step => ({ ...step, dayOffset: step.dayOffset - first }))
  };
}

/** The starter for an onboarding choice: the business type's own journey first, then the general library. */
export function starterPlanForReason(businessType: string | null | undefined, reason: string): ReadyMadePlan {
  return starterPlanForJourneyStart(businessType, reason) ?? starterPlanForOnboarding(businessType, reason);
}
