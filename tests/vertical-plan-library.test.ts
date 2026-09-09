import { describe, expect, it } from "vitest";
import { renderJumpSnapshot } from "../src/lib/jump-render";
import { READY_MADE_PLANS, starterPlanForBusinessType, starterPlanForOnboarding } from "../src/lib/vertical-plan-library";
import { validateLibraryContent } from "../src/lib/library-content";
import { normalizeSharedMixSteps } from "../src/lib/shared-mix";

const contact = {
  firstName: "Jordan",
  lastName: "Lee",
  company: null,
  publicNotes: null,
  privateNotes: null,
  emails: [{ email: "jordan@example.com", isPrimary: true }],
  phones: [{ phone: "+15550101010", isPrimary: true }],
  addresses: []
};

const onboardingProfile = {
  workspaceId: "workspace",
  industry: "Home services",
  primaryGoal: null,
  company: "Lee Plumbing",
  website: null,
  phone: null,
  street: null,
  city: null,
  state: null,
  postalCode: null,
  mailingAddress: null,
  product1: null,
  product2: null,
  product3: null,
  product4: null,
  product5: null,
  myCustom1: null,
  myCustom2: null,
  myCustom3: null,
  products: [],
  senderDetails: [],
  smsSignature: "Alex",
  emailSignature: "Alex Morgan",
  reviewUrl: null,
  onboardingStep: 5,
  onboardingDone: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("ready-made vertical plans", () => {
  it("accepts every shipped catalog entry for immutable publication", () => {
    for (const plan of READY_MADE_PLANS) {
      expect(() => validateLibraryContent({ title: plan.title, description: plan.description, category: plan.category,
        industry: plan.industry, framework: plan.framework, triggerMode: plan.triggerMode, dateTypeName: plan.dateTypeName,
        dateTypeSlug: plan.dateTypeSlug, featured: plan.featured, steps: normalizeSharedMixSteps(plan.steps) }), plan.id).not.toThrow();
    }
  });

  it("provides a starter for every onboarding business type", () => {
    for (const type of ["Home services", "Real estate", "Insurance & finance", "Other"]) {
      expect(starterPlanForBusinessType(type).industry).toBe(type);
    }
  });

  it("prepares an estimate follow-up on the chosen date without implying the job is done", () => {
    const plan = starterPlanForOnboarding("Home services", "Follow up about an estimate");
    const first = plan.steps[0];
    const rendered = renderJumpSnapshot(first, contact, onboardingProfile, { name: "Alex Morgan", email: "alex@example.com" }, first.channel);
    expect(rendered.body).toContain("received the estimate from Lee Plumbing");
    expect(rendered.body).not.toMatch(/thanks for trusting|working the way you expected/i);
    expect(plan.steps.map((step) => step.dayOffset)).toEqual([0, 5]);
    expect(plan.durationDays).toBe(5);
    // Library plans still anchor their offsets to the original event date.
    expect(READY_MADE_PLANS.find((item) => item.id === "plan_home_estimate")?.steps.map((step) => step.dayOffset)).toEqual([2, 7]);
  });

  it.each([
    ["Check in after the job", "Is everything working"],
    ["Ask for a review", "leave a quick review"],
    ["Reconnect", "just checking in"],
    ["General follow-up", "just checking in"]
  ])("honors the selected reason: %s", (reason, expectedMessage) => {
    const plan = starterPlanForOnboarding("Home services", reason);
    expect(plan.steps[0].body).toContain(expectedMessage);
    expect(plan.steps[0].dayOffset).toBe(0);
  });

  it("keeps the business type while honoring a reconnect request", () => {
    const plan = starterPlanForOnboarding("Real estate", "Reconnect");
    expect(plan.industry).toBe("Real estate");
    expect(plan.steps[0].body).toContain("has the timing changed");
    expect(plan.steps[0].body).not.toContain("thanks for reaching out");
  });

  it.each([
    ["Check in with a friend", "How have you been?"],
    ["Reconnect personally", "I’d love to catch up"],
    ["Follow up after an introduction", "I’m glad we connected"],
    ["Explore a partnership", "explore ways we could work together"]
  ])("prepares %s without requiring a business identity", (reason, expectedMessage) => {
    const plan = starterPlanForOnboarding(null, reason);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].dayOffset).toBe(0);
    const step = plan.steps[0];
    const rendered = renderJumpSnapshot(step, contact, { ...onboardingProfile, company: null, industry: null }, { name: "Alex Morgan", email: "alex@example.com" }, step.channel);
    expect(rendered.body).toContain(expectedMessage);
    expect(rendered.body).toMatch(/Alex$/);
    expect(rendered.body).not.toMatch(/\{\{|my business|estimate|customer|review|last note/i);
    expect(rendered.body!.length).toBeLessThanOrEqual(160);
  });

  it("renders every seeded message using fields collected during onboarding", () => {
    for (const plan of READY_MADE_PLANS) {
      for (const step of plan.steps) {
        const rendered = renderJumpSnapshot(step, contact, onboardingProfile, { name: "Alex Morgan", email: "alex@example.com" }, step.channel);
        for (const content of [rendered.subject, rendered.body, rendered.script].filter(Boolean)) {
          expect(content, `${plan.id}/${step.name}`).not.toContain("{{");
          expect(content, `${plan.id}/${step.name}`).not.toContain("  ");
        }
      }
    }
  });

  it("keeps text messages within the SMS-friendly 160 character limit", () => {
    for (const plan of READY_MADE_PLANS) {
      for (const step of plan.steps.filter((item) => item.channel === "SMS")) {
        const rendered = renderJumpSnapshot(step, contact, onboardingProfile, { name: "Alex Morgan", email: "alex@example.com" }, step.channel);
        expect(rendered.body?.length, `${plan.id}/${step.name}`).toBeLessThanOrEqual(160);
      }
    }
  });
});
