import { describe, expect, it } from "vitest";
import { MARKETING_SCENARIOS, MARKETING_SCENARIO_VERSION, marketingScenario, marketingScenarioId, storedMarketingScenario } from "../src/lib/marketing-scenarios";
import { starterPlanForMarketingScenario } from "../src/lib/vertical-plan-library";

describe("marketing scenarios", () => {
  it("defines five unique, shareable and fictional examples", () => {
    expect(MARKETING_SCENARIO_VERSION).toBe(1);
    expect(MARKETING_SCENARIOS).toHaveLength(5);
    expect(new Set(MARKETING_SCENARIOS.map(item => item.id)).size).toBe(5);
    expect(new Set(MARKETING_SCENARIOS.map(item => item.slug)).size).toBe(5);
    for (const scenario of MARKETING_SCENARIOS) {
      expect(marketingScenario(scenario.id)).toBe(scenario);
      expect(marketingScenario(scenario.slug)).toBe(scenario);
      expect(scenario.context.length).toBeGreaterThan(20);
      expect(scenario.draft).toMatch(/\?/);
    }
  });

  it("rejects unrecognized context instead of forwarding it", () => {
    expect(marketingScenarioId("unknown")).toBeNull();
    expect(marketingScenarioId("real-estate?draft=private")).toBeNull();
    expect(marketingScenarioId(null)).toBeNull();
  });

  it("maps every scenario to one reviewed starter action", () => {
    for (const scenario of MARKETING_SCENARIOS) {
      const plan = starterPlanForMarketingScenario(scenario.id);
      expect(plan?.title).toBe(scenario.starterTitle);
      expect(plan?.steps).toHaveLength(1);
      expect(plan?.steps[0].dayOffset).toBe(0);
      expect(plan?.steps[0].body).not.toContain(scenario.person);
      expect(plan?.steps[0].body).toContain("{{First Name}}");
    }
    expect(starterPlanForMarketingScenario("retired")).toBeNull();
  });

  it("restores only a canonical scenario from the supported stored version", () => {
    for (const scenario of MARKETING_SCENARIOS) {
      expect(storedMarketingScenario(scenario.id, MARKETING_SCENARIO_VERSION)).toBe(scenario);
      for (const version of [undefined, null, 0, -1, 2, "1", 1.5]) {
        expect(storedMarketingScenario(scenario.id, version)).toBeNull();
      }
      expect(storedMarketingScenario(scenario.slug, MARKETING_SCENARIO_VERSION)).toBeNull();
    }
    for (const value of [undefined, null, "retired", "painting?draft=private", {}, 1]) {
      expect(storedMarketingScenario(value, MARKETING_SCENARIO_VERSION)).toBeNull();
    }
  });
});
