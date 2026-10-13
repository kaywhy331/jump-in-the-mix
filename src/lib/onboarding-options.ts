import { journeyStartReasons } from "@/lib/journey-starts";

export const ONBOARDING_USES = [
  { id: "business", label: "Business", description: "Stay close to customers and keep business opportunities moving.", reasons: ["An estimate or quote", "Someone who went quiet", "After the job", "Ask for a review"] },
  { id: "personal", label: "Personal connections", description: "Keep in touch with friends and the people who matter to you.", reasons: ["Check in with a friend", "Reconnect personally"] },
  { id: "networking", label: "Networking and business development", description: "Build professional relationships, continue introductions, and explore partnerships.", reasons: ["Follow up after an introduction", "Explore a partnership"] }
] as const;

export type OnboardingUse = typeof ONBOARDING_USES[number]["id"];

export function onboardingUse(value: string) {
  return ONBOARDING_USES.find(use => use.id === value);
}

export function onboardingUses(values: string[]): OnboardingUse[] {
  return ONBOARDING_USES.filter(use => values.includes(use.id)).map(use => use.id);
}

/** Business uses a business type's own journey starts when it has them (see journey-starts.ts), else the general list. */
export function onboardingReasons(uses: OnboardingUse[], businessType?: string | null, suggestedScenario?: string | null): string[] {
  const journey = journeyStartReasons(businessType, suggestedScenario);
  return [...new Set(ONBOARDING_USES.filter(use => uses.includes(use.id)).flatMap(use => use.id === "business" && journey ? journey : [...use.reasons]))];
}

/** Setup's hint under the person's phone and email: what the first follow-up's first Beat needs (D103). */
export function contactMethodsHint(firstChannel: string | null): string {
  if (firstChannel === "EMAIL") return "An email needs an email address. You can add it later.";
  if (firstChannel === "PHONE_CALL") return "A call needs a phone number. You can add it later.";
  return "A text needs a mobile number. You can add it later.";
}

/** The general reasons' names before D93, which a setup form opened before the change can still send. */
const EARLIER_REASONS: Record<string, string> = {
  "Follow up about an estimate or quote": "An estimate or quote",
  "Reconnect with someone who went quiet": "Someone who went quiet",
  "Check in after the job": "After the job"
};

/** A reason as setup offers it now: an earlier name becomes its short label, so an older form still starts (D93). */
export function currentReason(reason: string): string {
  return EARLIER_REASONS[reason] ?? reason;
}
