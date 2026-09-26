import { describe, expect, it } from "vitest";
import { customerReturnPath } from "../src/lib/customer-return-path";
import { dateInputInTimezone } from "../src/lib/date-input";
import { MARKETING_DEMO_MIXES, MARKETING_SCENARIO_VERSION, marketingScenarioId, storedMarketingScenario } from "../src/lib/marketing-scenarios";
import { starterPlanForMarketingScenario } from "../src/lib/vertical-plan-library";
import { PERSONAS } from "../src/lib/persona-mixes";

describe("readiness date and destination boundaries", () => {
  it("uses the selected timezone across UTC midnight and daylight saving", () => {
    expect(dateInputInTimezone(new Date("2026-09-18T01:00:00Z"), "America/Los_Angeles")).toBe("2026-09-17");
    expect(dateInputInTimezone(new Date("2026-09-18T01:00:00Z"), "Asia/Tokyo")).toBe("2026-09-18");
    expect(dateInputInTimezone(new Date("2026-03-08T07:30:00Z"), "America/Los_Angeles")).toBe("2026-03-07");
  });
  it("retains protected destinations without permitting external redirects", () => {
    expect(customerReturnPath("/contacts/example/edit?tab=notes")).toBe("/contacts/example/edit?tab=notes");
    for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/login", "/api/auth/logout", "javascript:alert(1)", "/contacts\n", "/contacts/../../api/auth/logout", "/contacts/%2e%2e/api/auth/logout", null]) expect(customerReturnPath(value)).toBeNull();
  });
});

describe("selected public example survives invitation onboarding", () => {
  it("maps each allowlisted profession example to its own first follow-up", () => {
    for (const persona of PERSONAS) for (const mix of persona.mixes) {
      expect(MARKETING_DEMO_MIXES[persona.id][mix.id]).toBeTruthy();
      const choice = `${persona.id}~${mix.id}`;
      expect(marketingScenarioId(choice)).toBe(choice);
      const stored = storedMarketingScenario(choice, MARKETING_SCENARIO_VERSION);
      expect(stored?.starterTitle).toContain(mix.label.replaceAll("'", "’"));
      const plan = starterPlanForMarketingScenario(choice)!;
      expect(plan.title).toContain(mix.label);
      expect(plan.steps[0].name).toBe(mix.steps[0].title);
    }
  });
  it("rejects unknown and prototype-property choices", () => {
    for (const value of ["painting~unknown", "painting~constructor", "painting~estimate-sent~anything", "unknown~quote"]) expect(marketingScenarioId(value)).toBeNull();
  });
});
