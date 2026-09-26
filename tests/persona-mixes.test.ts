import { describe, expect, it } from "vitest";
import { PERSONAS, persona } from "../src/lib/persona-mixes";
import { MARKETING_SCENARIOS } from "../src/lib/marketing-scenarios";

describe("persona mixes", () => {
  it("covers every marketing scenario with its own landing page", () => {
    expect(PERSONAS.map(item => item.id).sort()).toEqual([...MARKETING_SCENARIOS.map(item => item.id)].sort());
    for (const item of PERSONAS) expect(persona(item.slug)).toBe(item);
    expect(persona("not-a-profession")).toBeNull();
  });
  it("gives each persona several multi-beat mixes with unique ids", () => {
    for (const item of PERSONAS) {
      expect(item.mixes.length).toBeGreaterThanOrEqual(2);
      expect(new Set(item.mixes.map(mix => mix.id)).size).toBe(item.mixes.length);
      for (const mix of item.mixes) {
        expect(mix.steps.length).toBeGreaterThanOrEqual(2);
        for (const step of mix.steps) {
          expect(["text", "email", "phone"]).toContain(step.channel);
          if (step.channel === "email") expect(step.subject).toBeTruthy();
          expect(step.timing.length).toBeGreaterThan(0);
        }
      }
    }
  });
  it("personalises through placeholders rather than hardcoded fictional names", () => {
    for (const item of PERSONAS) for (const mix of item.mixes) for (const step of mix.steps) {
      if (step.channel !== "phone") expect(step.message).toContain("{{First Name}}");
      expect(step.message).not.toMatch(/\b(Chris|Jordan|Morgan|Avery|Taylor|Alex|Priya|Jamie|Sam)\b/);
    }
  });
});
