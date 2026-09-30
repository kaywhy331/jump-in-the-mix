// Kevin's plans of 2026-09-29 (docs/PRICING_DECISION_2026-09-29.md). The public pages show them now; nothing is
// charged until billing starts on a date Kevin chooses, and the limits apply only from then.
export type PlanId = "FREE" | "PLUS" | "PRO";
export type Plan = { id: PlanId; name: string; summary: string; monthlyCents: number; yearlyCents: number | null; people: number; activeMixes: number };

export const PLANS: readonly Plan[] = [
  { id: "FREE", name: "Free", summary: "Start with a small group of people.", monthlyCents: 0, yearlyCents: null, people: 100, activeMixes: 3 },
  { id: "PLUS", name: "Plus", summary: "For a growing list of clients.", monthlyCents: 1500, yearlyCents: 14400, people: 1000, activeMixes: 25 },
  { id: "PRO", name: "Pro", summary: "For a large book of clients and many Mixes.", monthlyCents: 2900, yearlyCents: 28800, people: 5000, activeMixes: 100 }
];

export function planById(id: PlanId): Plan {
  return PLANS.find(plan => plan.id === id)!;
}

/** Whole US dollars, as the plans are priced: "$15". */
export function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
