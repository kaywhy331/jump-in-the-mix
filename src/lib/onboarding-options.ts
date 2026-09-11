export const ONBOARDING_USES = [
  { id: "business", label: "Business", description: "Stay close to customers and keep business opportunities moving.", reasons: ["Follow up about an estimate", "Follow up on a quote", "Follow up on an inquiry", "Reconnect with a lead", "Reconnect with someone", "Check in after the job", "Ask for a review", "Reconnect", "General follow-up"] },
  { id: "personal", label: "Personal connections", description: "Keep in touch with friends and the people who matter to you.", reasons: ["Check in with a friend", "Reconnect personally"] },
  { id: "networking", label: "Networking and business development", description: "Build professional relationships, continue introductions, and explore partnerships.", reasons: ["Follow up after an introduction", "Explore a partnership"] }
] as const;

export type OnboardingUse = typeof ONBOARDING_USES[number]["id"];

export function onboardingUse(value: string) {
  return ONBOARDING_USES.find(use => use.id === value);
}
