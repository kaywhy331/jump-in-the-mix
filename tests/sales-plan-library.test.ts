import { describe, expect, it } from "vitest";
import { SALES_APPROACHES } from "../src/lib/sales-approaches";
import { SALES_PLANS, salesPlanSearchIds } from "../src/lib/sales-plan-library";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES, normalizeSharedMixSteps } from "../src/lib/shared-mix";
import { READY_MADE_PLANS } from "../src/lib/vertical-plan-library";
import { renderJumpSnapshot } from "../src/lib/jump-render";

describe("sales strategy plan library", () => {
  it("provides original plans for all seven approaches and all supported business fields", () => {
    expect(SALES_PLANS).toHaveLength(20);
    expect(new Set(SALES_PLANS.map(plan => plan.approachId))).toEqual(new Set(Object.keys(SALES_APPROACHES)));
    for (const industry of MIX_TEMPLATE_INDUSTRIES.filter(item => item !== "Other")) expect(SALES_PLANS.some(plan => plan.industry === industry)).toBe(true);
    expect(new Set(READY_MADE_PLANS.map(plan => plan.id)).size).toBe(READY_MADE_PLANS.length);
  });

  it("imports every sequence with valid content, useful channel ordering, and its intended timing", () => {
    for (const plan of SALES_PLANS) {
      const steps = normalizeSharedMixSteps(plan.steps);
      expect(steps[0].dayOffset).toBe(0);
      expect(steps.map(step => step.dayOffset)).toEqual([...steps.map(step => step.dayOffset)].sort((a, b) => a - b));
      expect(plan.durationDays).toBe(steps.at(-1)?.dayOffset);
      expect(new Set(steps.map(step => step.channel)).size).toBeGreaterThanOrEqual(2);
      expect(MIX_TEMPLATE_CATEGORIES).toContain(plan.category);
      expect(MIX_TEMPLATE_INDUSTRIES).toContain(plan.industry);
      expect(plan.triggerMode).toBe("MANUAL_START");
    }
  });

  it("renders usable messages without bracketed blanks, unsupported tokens, or fabricated proof", () => {
    const contact = { firstName: "Jordan", lastName: "Lee", company: null, publicNotes: null, privateNotes: "PRIVATE_SENTINEL", emails: [], phones: [], addresses: [] };
    for (const plan of SALES_PLANS) {
      for (const step of plan.steps) {
        const snapshot = renderJumpSnapshot(step, contact, null, { name: "Alex Morgan", email: "alex@example.com" }, step.channel);
        const content = [snapshot.subject, snapshot.body, snapshot.script].filter(Boolean).join("\n");
        expect(content, `${plan.id}/${step.name}`).not.toMatch(/\{\{|\[.*?\]|PRIVATE_SENTINEL|guaranteed results|limited.time offer/i);
        if (step.channel !== "PHONE_CALL") {
          expect(snapshot.body).toContain("Jordan");
          expect(snapshot.body).toContain("Alex Morgan");
        }
        if (step.channel === "SMS") expect(snapshot.body!.length).toBeLessThanOrEqual(160);
      }
    }
  });

  it("finds frameworks by their authors as well as their common names", () => {
    expect(salesPlanSearchIds("Jeremy Miner")).toContain("plan_sales_nepq_inquiry");
    expect(salesPlanSearchIds("NEPQ")).toContain("plan_sales_home_estimate");
    expect(salesPlanSearchIds("Chris Voss")).toContain("plan_sales_empathy_concern");
    expect(salesPlanSearchIds("April Dunford")).toContain("plan_sales_b2b_alternatives");
    expect(salesPlanSearchIds("Marcus Sheridan")).toContain("plan_sales_transparent_evaluation");
    expect(salesPlanSearchIds("unrelated unknown author")).toEqual([]);
  });
});
