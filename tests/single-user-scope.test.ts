import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { proxy as productBoundary } from "../src/proxy";
vi.mock("@/lib/recovery-hold", () => ({ databaseRecoveryStatus: async () => "clear" }));

const read = (path: string) => readFileSync(path, "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const activeProductFiles = [...sourceFiles("src/app"), ...sourceFiles("src/components")].sort();
const activeProductSource = activeProductFiles.map((path) => `${path}\n${read(path)}`).join("\n");

const retiredCommercialTerms = [
  "billing", "stripe", "pricing", "checkout", "invoice", "paid plan", "paid tier",
  "upgrade", "downgrade", "google contacts", "ai mix", "referral rewards",
  "invite member", "workspace switcher", "transfer ownership"
];

const inventedVocabulary = [
  /\bmix templates?\b/i,
  /\baction templates?\b/i,
  /\bday offsets?\b/i,
  /\breconcil\w*\b/i,
  /\bimportant date(?: types?)?\b/i,
  /\bjump date(?: types?)?\b/i,
  /\bcustomer notes?\b/i,
  /\bprivate relationship updates?\b/i,
  /\bcontact groups?\b/i,
  /\bactivation impact\b/i,
  /\bsnapshot audience\b/i
];

describe("phone-first small-business product boundary", () => {
  it("scans every active app and component source file", () => {
    expect(activeProductFiles.length).toBeGreaterThan(50);
    expect(activeProductFiles).toContain("src/app/(app)/jumps/page.tsx");
    expect(activeProductFiles).toContain("src/components/QuickAdd.tsx");
  });

  it("keeps retired commercial features out of active user surfaces", () => {
    const source = activeProductSource.toLowerCase();
    for (const term of retiredCommercialTerms) expect(source, `active product source contains ${term}`).not.toContain(term);
  });

  it("keeps internal product vocabulary out of active user surfaces", () => {
    for (const expression of inventedVocabulary) expect(activeProductSource, `active product source matches ${expression}`).not.toMatch(expression);
  });

  it("exposes the required navigation and global Quick Add", () => {
    const nav = read("src/components/Nav.tsx");
    for (const label of ["Today", "Contacts", "Mixes", "More"]) expect(nav).toContain(`label: "${label}"`);
    expect(nav).not.toContain('label: "Templates"');
    expect(nav).toContain("QuickAddButton mobile");
    expect(read("src/components/AppShell.tsx")).toContain("<QuickAddButton />");
    expect(read("src/components/AppShell.tsx")).toMatch(/<QuickAddDialog\b/);
  });

  it("has no compiled route for retired product areas", () => {
    const retiredPaths = [
      "src/app/(app)/plans",
      "src/app/(app)/billing",
      "src/app/(app)/mixes/wizard",
      "src/app/(app)/mixes/[mixId]/share",
      "src/app/(app)/settings/jumps",
      "src/app/api/billing",
      "src/app/api/integrations/google",
      "src/app/api/webhooks/stripe",
      "src/app/r"
    ];
    const allFiles = sourceFiles("src/app");
    for (const path of retiredPaths) expect(allFiles.some((file) => file.startsWith(`${path}/`)), path).toBe(false);
  });

  it("does not rely on a proxy denylist for removed product routes", () => {
    const proxy = read("src/proxy.ts");
    expect(proxy).not.toContain("BLOCKED_PREFIXES");
    expect(proxy).not.toContain("isBlockedProductRoute");
  });

  it("still returns a normal not-found response for removed routes", async () => {
    for (const path of ["/plans", "/billing", "/api/billing/checkout", "/api/integrations/google/status", "/mixes/wizard", "/r/example"]) {
      expect((await productBoundary(new NextRequest(`http://localhost${path}`))).status).not.toBe(403);
    }
  });

  it("runs only supported background tasks", () => {
    const worker = read("src/worker/index.ts");
    expect(worker).toContain('job.task === "generate-jumps"');
    expect(worker).toContain("job.task === CONTACT_IMPORT_JOB_TASK");
    expect(worker).toContain("cleanupOperationalData");
    expect(worker).not.toMatch(/google contacts|stripe|referral rewards|ai mix/i);
  });

  it("does not enforce commercial limits in core workflows", () => {
    for (const path of ["src/lib/contact-lifecycle-actions.ts", "src/lib/group-actions.ts", "src/lib/date-type-actions.ts", "src/lib/mix-editor-actions.ts", "src/lib/bulk-contact-actions.ts", "src/lib/starter-mix-actions.ts"]) {
      expect(read(path), path).not.toMatch(/PLAN_LIMITS|upgrade|paid plan|plan allows/i);
    }
    expect(read("src/components/TemplateUseForm.tsx")).not.toMatch(/activationAvailable|active Mix allowance/i);
  });
});
