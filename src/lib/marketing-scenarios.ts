export const MARKETING_SCENARIO_VERSION = 1;

export const MARKETING_SCENARIOS = [
  { id: "real-estate", slug: "real-estate-agents", label: "Real estate", person: "Chris Parker", initials: "CP", channel: "Text", eyebrow: "Follow-up for independent real estate agents", headline: "Good conversations deserve a next step.", scene: "They said, “Maybe after summer.”", context: "Asked for a September text about a possible move after summer.", draft: "Hi Chris—you asked me to check back after summer about a possible move. Is that still on your mind, or has the timing changed?", payoff: "The next appointment can start without this conversation disappearing.", starterTitle: "Reconnect at the agreed time", businessType: "Real estate", reason: "Reconnect with a lead" },
  { id: "consulting", slug: "consultants", label: "Consulting", person: "Jordan Lee", initials: "JL", channel: "Email", eyebrow: "Follow-up for independent consultants", headline: "Keep future conversations moving while you do today’s work.", scene: "The project could wait. Client work couldn’t.", context: "Wanted to revisit onboarding after the new managers were hired.", draft: "Hi Jordan—when we spoke, you wanted to revisit onboarding once the new managers were in place. Has that timing changed, or would it be useful to pick up the conversation?", payoff: "Client work stays in focus while the future conversation keeps its place.", starterTitle: "Revisit a business milestone", businessType: "Professional services", reason: "Reconnect with a lead" },
  { id: "photography", slug: "photographers", label: "Photography", person: "Morgan Ellis", initials: "ME", channel: "Email", eyebrow: "Follow-up for independent photographers", headline: "You sent the pricing. Give the conversation a next step.", scene: "Pricing sent. Back to editing.", context: "Was comparing shorter coverage with the full-day package.", draft: "Hi Morgan—when we spoke, you were deciding between shorter coverage and the full-day package. Is there anything I can clarify to help you compare them?", payoff: "The work can stay creative without leaving an inquiry unfinished.", starterTitle: "Clarify an open inquiry", businessType: "Professional services", reason: "Follow up on an inquiry" },
  { id: "painting", slug: "contractors", label: "Contractors", person: "Jordan Rivera", initials: "JR", channel: "Text", eyebrow: "Follow-up for independent contractors", headline: "You sent the estimate. Don’t lose track of the conversation.", scene: "Estimate sent. Next job started.", context: "Was comparing the bedrooms with painting the full interior.", draft: "Hi Jordan—you mentioned wanting to compare painting the bedrooms with doing the full interior. Is there anything I can clarify about the two options?", payoff: "A clear commitment is handled before it becomes evening paperwork.", starterTitle: "Follow up on an estimate", businessType: "Home services", reason: "An estimate or quote" },
  { id: "recruiting", slug: "independent-recruiters", label: "Recruiting", person: "Alex Morgan", initials: "AM", channel: "Email", eyebrow: "Follow-up for independent recruiters", headline: "Stay connected—even when there isn’t an open role.", scene: "No open role. Still worth staying in touch.", context: "Asked to reconnect after annual planning, using personal email.", draft: "Hi Alex—you asked me to reconnect after your planning cycle wrapped up. Is this still a useful time for a conversation, or would you prefer to leave it for later?", payoff: "The relationship has a place between active searches.", starterTitle: "Reconnect at the candidate’s timing", businessType: "Professional services", reason: "Reconnect with someone" }
] as const;

export type MarketingScenarioId = typeof MARKETING_SCENARIOS[number]["id"];
export const MARKETING_DEMO_MIXES: Record<MarketingScenarioId, Record<string, string>> = {
  "real-estate": { "not-ready": "Not ready yet", "open-house": "After the open house", "after-closing": "After closing" },
  consulting: { "proposal-sent": "Proposal sent", milestone: "Revisit a milestone", handover: "After the handover", "went-quiet": "Went quiet" },
  photography: { "pricing-sent": "Pricing sent", "after-gallery": "After the gallery", "vendor-thanks": "Vendor thank-you" },
  painting: { "estimate-sent": "Estimate sent", deferred: "Waiting on the flooring", "job-done": "Job done" },
  recruiting: { "candidate-timing": "Candidate’s timing", "client-plans": "Client’s hiring plans", "honest-update": "Honest update" }
};
export type MarketingScenario = Omit<typeof MARKETING_SCENARIOS[number], "id" | "starterTitle"> & { id: string; starterTitle: string };
export function marketingScenario(value: string | null | undefined): MarketingScenario | null {
  if (!value) return null;
  const [base, mix, extra] = value.split("~");
  const scenario = MARKETING_SCENARIOS.find(item => item.id === base || item.slug === base);
  if (!scenario || extra !== undefined) return null;
  if (mix === undefined) return scenario;
  const title = Object.hasOwn(MARKETING_DEMO_MIXES[scenario.id], mix) ? MARKETING_DEMO_MIXES[scenario.id][mix] : null;
  return title ? { ...scenario, id: `${scenario.id}~${mix}`, starterTitle: `${title} — first follow-up` } : null;
}
export function marketingScenarioId(value: FormDataEntryValue | string | null | undefined): string | null { return typeof value === "string" ? marketingScenario(value)?.id ?? null : null; }

// Existing version-1 identifiers retain their meaning; new choices are explicitly allowlisted.
export function storedMarketingScenario(value: unknown, version: unknown): MarketingScenario | null {
  if (version !== MARKETING_SCENARIO_VERSION || typeof value !== "string") return null;
  const scenario = marketingScenario(value);
  return scenario?.id === value ? scenario : null;
}
