import { describe, expect, it } from "vitest";
import { PLANS, formatDollars, planById } from "@/lib/plans";

describe("the plans Kevin set on 2026-09-29", () => {
  it("prices Free, Plus and Pro as decided, with yearly prices for the paid plans", () => {
    expect(PLANS.map(plan => [plan.id, plan.monthlyCents, plan.yearlyCents])).toEqual([["FREE", 0, null], ["PLUS", 1500, 14400], ["PRO", 2900, 28800]]);
  });

  it("limits people with follow-ups and active Mixes, and nothing else", () => {
    expect(PLANS.map(plan => [plan.id, plan.people, plan.activeMixes])).toEqual([["FREE", 100, 3], ["PLUS", 1000, 25], ["PRO", 5000, 100]]);
  });

  it("formats whole dollars", () => {
    expect([0, 1500, 14400, 28800].map(formatDollars)).toEqual(["$0", "$15", "$144", "$288"]);
    expect(planById("PRO").name).toBe("Pro");
  });
});
