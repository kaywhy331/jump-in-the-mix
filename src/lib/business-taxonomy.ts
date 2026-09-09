export const BUSINESS_TYPES = [
  "Home services", "Real estate", "Insurance & finance", "Professional services",
  "B2B & technology", "Retail & ecommerce", "Automotive", "Health & wellness", "Other"
] as const;

const GOAL_ALIASES: Record<string, string> = {
  "New clients": "New customers",
  "Current clients": "Current customers",
  "Active clients": "Current customers",
  "Past clients": "Past customers"
};

export function planGoalLabel(value: string): string {
  return GOAL_ALIASES[value] ?? value;
}

// Match old library records and bookmarked filters without rewriting customers' plans.
export function planGoalValues(value: string): string[] {
  const canonical = planGoalLabel(value);
  return [canonical, ...Object.keys(GOAL_ALIASES).filter(alias => GOAL_ALIASES[alias] === canonical)];
}
