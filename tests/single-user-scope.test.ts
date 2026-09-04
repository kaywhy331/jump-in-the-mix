import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy as productBoundary } from "../src/proxy";

const read = (path: string) => readFileSync(path, "utf8");
const activeProductFiles = [
  "src/app/page.tsx",
  "src/app/register/page.tsx",
  "src/app/onboarding/page.tsx",
  "src/app/(app)/layout.tsx",
  "src/app/(app)/jumps/page.tsx",
  "src/app/(app)/contacts/page.tsx",
  "src/app/(app)/contacts/[contactId]/page.tsx",
  "src/app/(app)/contacts/archived/page.tsx",
  "src/app/(app)/contacts/custom-fields/page.tsx",
  "src/app/(app)/contacts/duplicates/page.tsx",
  "src/app/(app)/contacts/import/page.tsx",
  "src/app/(app)/contacts/new/page.tsx",
  "src/app/(app)/mixes/page.tsx",
  "src/app/(app)/mixes/new/page.tsx",
  "src/app/(app)/mixes/[mixId]/edit/page.tsx",
  "src/app/(app)/templates/page.tsx",
  "src/app/(app)/templates/[sharedMixId]/use/page.tsx",
  "src/app/(app)/settings/page.tsx",
  "src/app/(app)/settings/business/page.tsx",
  "src/app/(app)/more/page.tsx",
  "src/app/(app)/account/page.tsx",
  "src/app/(app)/account/preferences/page.tsx",
  "src/components/AppShell.tsx",
  "src/components/Nav.tsx",
  "src/components/ContactImportWizardV2.tsx",
  "src/components/MixEditor.tsx",
  "src/components/QuickAdd.tsx",
  "src/components/TemplateUseForm.tsx",
  "src/lib/support-content.ts"
];

const prohibited = [
  "stripe", "billing", "subscription", "checkout", "payment", "invoice", "free plan",
  "plus", "pro plan", "upgrade", "downgrade", "plan usage", "pricing", "invite member",
  "workspace switcher", "transfer ownership", "member role", "admin role",
  "google contacts", "ai provider", "referral rewards"
];

describe("single-user product boundary", () => {
  it("keeps prohibited product terminology out of active user surfaces", () => {
    const source = activeProductFiles.map((path) => `${path}\n${read(path)}`).join("\n").toLowerCase();
    for (const term of prohibited) expect(source, `active product source contains ${term}`).not.toContain(term);
  });

  it("exposes the required navigation and global Quick Add", () => {
    const nav = read("src/components/Nav.tsx");
    for (const label of ["Today", "Contacts", "Plans", "More"]) expect(nav).toContain(`label: "${label}"`);
    expect(nav).not.toContain('label: "Templates"');
    expect(nav).toContain("QuickAddButton mobile");
    expect(read("src/components/AppShell.tsx")).toContain("<QuickAddButton />");
    expect(read("src/components/AppShell.tsx")).toContain("<QuickAddDialog />");
  });

  it("denies retired routes and normalizes retired account sections", () => {
    const proxy = read("src/proxy.ts");
    for (const route of ["/plans", "/billing", "/account/team", "/join", "/api/billing", "/api/integrations/google", "/api/webhooks/stripe", "/mixes/wizard", "/r/"]) expect(proxy).toContain(`"${route}"`);
    expect(proxy).toContain("/mixes\\/[^/]+\\/share");
    expect(proxy).toContain('["billing", "connections", "referrals", "team"]');
    expect(proxy).toContain('new NextResponse("Not found", { status: 404 })');
  });

  it.each([
    "/plans", "/billing/success", "/account/team", "/join", "/api/billing/checkout",
    "/api/integrations/google/status", "/api/webhooks/stripe", "/mixes/wizard", "/mixes/example/share", "/r/example"
  ])("returns 404 for retired route %s", (path) => {
    expect(productBoundary(new NextRequest(`http://localhost${path}`)).status).toBe(404);
  });

  it.each(["billing", "connections", "referrals", "team"])("redirects retired account section %s", (section) => {
    const response = productBoundary(new NextRequest(`http://localhost/account?section=${section}`));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe("http://localhost/account");
  });

  it("runs only structure-first background tasks", () => {
    const worker = read("src/worker/index.ts");
    expect(worker).toContain('job.task === "generate-jumps"');
    expect(worker).toContain("job.task === CONTACT_IMPORT_JOB_TASK");
    expect(worker).toContain("cleanupOperationalData");
    expect(worker).not.toMatch(/google|stripe|referral/i);
  });

  it("does not enforce tier limits in core personal workflows", () => {
    for (const path of ["src/lib/contact-lifecycle-actions.ts", "src/lib/group-actions.ts", "src/lib/date-type-actions.ts", "src/lib/mix-editor-actions.ts", "src/lib/reusable-jump-update.ts", "src/lib/bulk-contact-actions.ts"]) {
      expect(read(path), path).not.toMatch(/PLAN_LIMITS|upgrade|paid plan|plan allows/i);
    }
    expect(read("src/components/TemplateUseForm.tsx")).not.toMatch(/activationAvailable|active Mix allowance/i);
    expect(read("src/lib/mix-editor-actions.ts")).toContain('triggerMode === "MANUAL_START" && parsedOffsets.some((offset) => offset < 0)');
  });
});
