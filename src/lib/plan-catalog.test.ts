import { describe, expect, it } from "vitest";
import { BILLING_PLANS } from "@/lib/billing";
import { PLAN_CATALOG } from "@/lib/plan-catalog";
import { PLAN_LIMITS } from "@/lib/plans";

describe("canonical plan catalog", () => {
  it("keeps enforced limits identical to the catalog", () => {
    expect(PLAN_LIMITS.FREE).toEqual(PLAN_CATALOG.FREE.limits);
    expect(PLAN_LIMITS.PLUS).toEqual(PLAN_CATALOG.PLUS.limits);
    expect(PLAN_LIMITS.PRO).toEqual(PLAN_CATALOG.PRO.limits);
  });

  it("keeps paid billing descriptions and prices identical to the catalog", () => {
    for (const tier of ["PLUS", "PRO"] as const) {
      expect(BILLING_PLANS[tier]).toMatchObject({
        name: PLAN_CATALOG[tier].name,
        description: PLAN_CATALOG[tier].description,
        monthlyAmountCents: PLAN_CATALOG[tier].monthlyAmountCents,
        annualAmountCents: PLAN_CATALOG[tier].annualAmountCents,
        features: PLAN_CATALOG[tier].features
      });
    }
  });
});
