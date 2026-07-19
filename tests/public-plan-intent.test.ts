import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public plan intent", () => {
  it("preserves paid plan and billing period through registration and onboarding", () => {
    const registration = read("src/lib/register-action.ts");
    const onboarding = read("src/app/onboarding/page.tsx");
    const actions = read("src/lib/actions.ts");
    expect(registration).toContain("jitm_plan_intent");
    expect(onboarding).toContain('name="planIntent"');
    expect(actions).toContain("/plans?plan=${plan}&period=${period}");
  });

  it("uses only real local product-proof assets", () => {
    const home = read("src/app/page.tsx");
    for (const asset of ["today.png", "contacts.png", "mixes.png", "quick-add.png", "mobile-jump.png"]) expect(home).toContain(asset);
    expect(home).toContain("synthetic demo data");
  });
});
