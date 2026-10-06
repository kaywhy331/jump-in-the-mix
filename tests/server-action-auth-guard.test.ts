import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TENANT_ACTION_MODULES = [
  "src/lib/bulk-contact-actions.ts",
  "src/lib/contact-actions.ts",
  "src/lib/contact-lifecycle-actions.ts",
  "src/lib/contact-mix-actions.ts",
  "src/lib/contact-no-mix-actions.ts",
  "src/lib/custom-field-actions.ts",
  "src/lib/date-type-actions.ts",
  "src/lib/group-actions.ts",
  "src/lib/important-date-actions.ts",
  "src/lib/jump-status-actions.ts",
  "src/lib/mix-editor-actions.ts",
  "src/lib/mix-lifecycle-actions.ts",
  "src/lib/mix-stop-actions.ts",
  "src/lib/onboarding-actions.ts",
  "src/lib/snooze-actions.ts",
  "src/lib/starter-mix-actions.ts",
  "src/lib/support-actions.ts",
  "src/lib/workspace-profile-actions.ts"
] as const;

// requireWritableWorkspace() is requireWorkspace() that also refuses during a support view.
const WORKSPACE_GUARD = /\brequire(?:Writable)?Workspace\(/;
const WRITABLE_ACTION_MODULES = [
  "src/lib/bulk-contact-actions.ts",
  "src/lib/contact-actions.ts",
  "src/lib/contact-lifecycle-actions.ts",
  "src/lib/contact-no-mix-actions.ts",
  "src/lib/custom-field-actions.ts",
  "src/lib/date-type-actions.ts",
  "src/lib/group-actions.ts",
  "src/lib/mix-stop-actions.ts",
  "src/lib/onboarding-actions.ts",
  "src/lib/snooze-actions.ts"
] as const;

function exportedAsyncFunctions(source: string): { name: string; source: string }[] {
  const matches = [...source.matchAll(/(?:export )?async function\s+(\w+)\s*\(/g)];
  return matches.map((match, index) => ({
    name: match[1],
    source: source.slice(match.index, matches[index + 1]?.index ?? source.length)
  }));
}

describe("tenant mutation authentication guards", () => {
  for (const path of TENANT_ACTION_MODULES) {
    it(`${path} scopes every tenant server action through requireWorkspace`, () => {
      const source = readFileSync(path, "utf8");
      const functions = exportedAsyncFunctions(source);
      expect(functions.length).toBeGreaterThan(0);
      const delegates: Record<string, string[]> = {
        saveContactFormAction: ["createContact", "updateContact"], createContactAction: ["createContact"], updateContactAction: ["updateContact"],
        completeOnboardingFormAction: ["completeOnboardingAction"], createSupportTicketFormAction: ["createSupportTicketAction"],
        replyToSupportTicketFormAction: ["replyToSupportTicketAction"], updateWorkspaceProfileFormAction: ["updateWorkspaceProfileAction"]
      };
      for (const fn of functions.filter(fn => fn.source.startsWith("export async function"))) {
        const targets = delegates[fn.name];
        if (targets) for (const name of targets) {
          expect(fn.source, `${fn.name} must delegate to its guarded implementation`).toContain(`${name}(`);
          expect(functions.find(item => item.name === name)?.source, `${name} must authenticate before mutation`).toMatch(WORKSPACE_GUARD);
        } else expect(fn.source, `${fn.name} must derive the active workspace from the authenticated session`).toMatch(WORKSPACE_GUARD);
      }
    });
  }

  it.each(WRITABLE_ACTION_MODULES)("%s refuses support views in the action as well as at the proxy", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain('from "@/lib/writable-workspace"');
    expect(source, "every mutation in this module uses the writable guard").not.toContain("requireWorkspace(");
  });

  // The profile's own Mix actions still use requireWorkspace() with a hand check, so this module is checked by action (SEC-01, TST-02).
  it("refuses support views in the bulk Mix start and its Undo", () => {
    const functions = exportedAsyncFunctions(readFileSync("src/lib/contact-mix-actions.ts", "utf8"));
    for (const name of ["bulkAssignMixAction", "undoBulkMixStartAction"]) expect(functions.find(fn => fn.name === name)?.source, name).toMatch(/\brequireWritableWorkspace\(/);
  });

  it("keeps the legacy action barrel free of mutation implementations", () => {
    const source = readFileSync("src/lib/actions.ts", "utf8");
    expect(source).not.toContain('"use server"');
    expect(source).not.toMatch(/export async function/);
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("requireWorkspace(");
  });

  it("the Jump action-event API authenticates and scopes the Jump lookup", () => {
    const source = readFileSync("src/app/api/jumps/[jumpId]/actions/route.ts", "utf8");
    expect(source).toContain("getCurrentSession(");
    expect(source).toContain("workspaceId: membership.workspaceId");
    expect(source).not.toMatch(/workspaceId\s*:\s*payload/);
  });
});
