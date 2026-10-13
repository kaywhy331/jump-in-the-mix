import { describe, expect, it } from "vitest";
import { renderJumpSnapshot } from "../src/lib/jump-render";
import { journeyStartReasons, starterPlanForJourneyStart, starterPlanForReason } from "../src/lib/journey-starts";
import { megaMixById } from "../src/lib/mega-mixes";
import { contactMethodsHint, currentReason, onboardingReasons } from "../src/lib/onboarding-options";
import { validateLibraryContent } from "../src/lib/library-content";
import { normalizeSharedMixSteps } from "../src/lib/shared-mix";

const REALTOR_STARTS = [
  "Reply to a new buyer lead",
  "Reply to a new seller lead",
  "Follow up after a showing or open house",
  "Check back when they asked you to",
  "Update a client who is under contract",
  "Check in after closing",
  "Keep in touch with a past client"
];
const contact = { firstName: "Jordan", lastName: "Lee", company: null, publicNotes: null, privateNotes: null, emails: [{ email: "jordan@example.com", isPrimary: true }], phones: [{ phone: "+15550101010", isPrimary: true }], addresses: [] };
// A realtor who skipped the optional business name, the case that produced "the estimate from my business" (ONB-10).
const profile = { workspaceId: "workspace", industry: "Real estate", primaryGoal: null, company: null, website: null, phone: null, street: null, city: null, state: null, postalCode: null, mailingAddress: null,
  product1: null, product2: null, product3: null, product4: null, product5: null, myCustom1: null, myCustom2: null, myCustom3: null, products: [], senderDetails: [],
  smsSignature: "Alex", emailSignature: "Alex Morgan", reviewUrl: null, onboardingStep: 5, useCases: [], onboardingDone: true, createdAt: new Date(), updatedAt: new Date() };

describe("a realtor's first follow-up comes from the Real estate journey", () => {
  it("offers the journey's starts, with a new buyer lead first", () => {
    expect(onboardingReasons(["business"], "Real estate")).toEqual(REALTOR_STARTS);
    expect(journeyStartReasons("Real estate")).toEqual(REALTOR_STARTS);
  });

  it("keeps the general list for business types without their own journey", () => {
    for (const type of ["Home services", "Insurance & finance", "Professional services", "Other", null]) {
      expect(journeyStartReasons(type)).toBeNull();
      expect(onboardingReasons(["business"], type)[0]).toBe("An estimate or quote");
    }
  });

  it("adds personal and networking reasons after the realtor starts", () => {
    expect(onboardingReasons(["business", "personal"], "Real estate")).toEqual([...REALTOR_STARTS, "Check in with a friend", "Reconnect personally"]);
    expect(onboardingReasons(["personal"], "Real estate")).toEqual(["Check in with a friend", "Reconnect personally"]);
  });

  it("drops the check-back start only when the real estate example already offers it", () => {
    expect(onboardingReasons(["business"], "Real estate", "real-estate")).toEqual(REALTOR_STARTS.filter(reason => reason !== "Check back when they asked you to"));
    expect(onboardingReasons(["business"], "Real estate", "real-estate~not-ready")).toEqual(REALTOR_STARTS);
  });

  it.each(REALTOR_STARTS)("prepares %s on the chosen day, without estimate wording or a missing business name", reason => {
    const plan = starterPlanForReason("Real estate", reason);
    expect(plan.industry).toBe("Real estate");
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].dayOffset).toBe(0);
    expect(plan.durationDays).toBe(plan.steps.at(-1)!.dayOffset);
    expect(() => validateLibraryContent({ title: plan.title, description: plan.description, category: plan.category, industry: plan.industry, framework: plan.framework,
      triggerMode: plan.triggerMode, dateTypeName: plan.dateTypeName, dateTypeSlug: plan.dateTypeSlug, featured: plan.featured, steps: normalizeSharedMixSteps(plan.steps) })).not.toThrow();
    for (const step of plan.steps) {
      const rendered = renderJumpSnapshot(step, contact, profile, { name: "Alex Morgan", email: "alex@example.com" }, step.channel);
      expect(`${rendered.subject ?? ""} ${rendered.body ?? ""} ${rendered.script ?? ""}`).not.toMatch(/\{\{|estimate|quote|my business/i);
    }
  });

  it("uses each journey stage's own Beats, so the Mega-Mix continues where the first follow-up started", () => {
    const blueprint = megaMixById("real-estate")!;
    for (const [reason, key] of [["Reply to a new buyer lead", "buyer"], ["Reply to a new seller lead", "seller"], ["Follow up after a showing or open house", "showings"],
      ["Update a client who is under contract", "contract"], ["Check in after closing", "closing"], ["Keep in touch with a past client", "past-client"]]) {
      const stage = blueprint.nodes.find(node => node.key === key)!, plan = starterPlanForJourneyStart("Real estate", reason)!;
      expect(plan.title).toBe(stage.name);
      expect(plan.steps.map(step => [step.channel, step.subject, step.body, step.script])).toEqual(stage.steps.map(step => [step.channel, step.subject, step.body, step.script]));
    }
    // After closing, the move-in text is on the chosen day and the email follows eleven days later.
    expect(starterPlanForJourneyStart("Real estate", "Check in after closing")!.steps.map(step => step.dayOffset)).toEqual([0, 11]);
  });

  it("opens with the buyer reply a new realtor sees by default", () => {
    const plan = starterPlanForReason("Real estate", REALTOR_STARTS[0]);
    const rendered = renderJumpSnapshot(plan.steps[0], contact, profile, { name: "Alex Morgan", email: "alex@example.com" }, plan.steps[0].channel);
    expect(rendered.body).toBe("Hi Jordan, thanks for reaching out about buying a home. What are you hoping to find, and what timing do you have in mind? Alex");
  });

  it("checks back with the real estate example's wording", () => {
    expect(starterPlanForReason("Real estate", "Check back when they asked you to").steps[0].body).toContain("you asked me to check back about a possible move");
  });

  it("falls back to the general library for a reason outside the journey", () => {
    expect(starterPlanForJourneyStart("Real estate", "Follow up about an estimate")).toBeNull();
    expect(starterPlanForReason("Home services", "Follow up about an estimate").id).toBe("plan_home_estimate");
  });
});

describe("setup's contact hint (D103)", () => {
  it("names what the first Beat needs: a mobile number for a text, an email address for an email, a phone number for a call", () => {
    expect(contactMethodsHint("SMS")).toBe("A text needs a mobile number. You can add it later.");
    expect(contactMethodsHint(null)).toBe("A text needs a mobile number. You can add it later.");
    expect(contactMethodsHint("EMAIL")).toBe("An email needs an email address. You can add it later.");
    expect(contactMethodsHint("PHONE_CALL")).toBe("A call needs a phone number. You can add it later.");
    // Real estate's contract update begins with an email, the case #145's COPY-01 (b) found.
    expect(starterPlanForReason("Real estate", "Update a client who is under contract").steps[0].channel).toBe("EMAIL");
  });
});

describe("setup's earlier reason names (D93)", () => {
  it("still start: each becomes its short label, which setup offers and which prepares the same starter", () => {
    const offered = onboardingReasons(["business"], "Home services");
    for (const [earlier, short] of [["Follow up about an estimate or quote", "An estimate or quote"], ["Reconnect with someone who went quiet", "Someone who went quiet"], ["Check in after the job", "After the job"]]) {
      expect(currentReason(earlier)).toBe(short);
      expect(offered).toContain(currentReason(earlier));
      expect(starterPlanForReason("Home services", earlier).title).toBe(starterPlanForReason("Home services", short).title);
    }
    expect(currentReason("Ask for a review")).toBe("Ask for a review");
  });
});
