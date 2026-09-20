import { describe, expect, it } from "vitest";
import { DEMO_BEATS, demoContact, demoDrafts, demoSituations } from "../src/lib/demo-workspace";
import { MARKETING_SCENARIOS, marketingScenario } from "../src/lib/marketing-scenarios";

describe("public demo contract", () => {
  it("always schedules three distinct channels at day zero, one and seven", () => {
    expect(DEMO_BEATS.map(({ channel, day }) => [channel, day])).toEqual([["text", 0], ["email", 1], ["phone", 7]]);
  });
  it("every situation has fictional contact details and usable content for all three channels", () => {
    for (const persona of [undefined, ...MARKETING_SCENARIOS]) {
      for (const situation of demoSituations(persona?.id)) {
        const drafts = demoDrafts(situation);
        expect(drafts).toHaveLength(3);
        for (const draft of drafts) expect(draft.message).toContain(situation.person.split(" ")[0]);
        expect(drafts[1].subject.length).toBeGreaterThan(0);
        expect(demoContact(situation).email).toMatch(/@example\.invalid$/);
        if (persona) expect(marketingScenario(`${persona.id}~${situation.id}`)).not.toBeNull();
      }
    }
  });
  it("unknown persona falls back to the home situations", () => {
    expect(demoSituations("unknown")).toEqual(demoSituations());
  });
});
