import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTION_MODULES = [
  "src/lib/actions.ts",
  "src/lib/bulk-contact-actions.ts",
  "src/lib/contact-actions.ts",
  "src/lib/custom-field-actions.ts",
  "src/lib/date-type-actions.ts",
  "src/lib/mix-editor-actions.ts",
  "src/lib/mix-lifecycle-actions.ts",
  "src/lib/mix-stop-actions.ts",
  "src/lib/reusable-jump-update.ts",
  "src/lib/support-actions.ts"
] as const;

const PUBLIC_AUTH_ACTIONS = new Set([
  "registerAction",
  "loginAction",
  "demoLoginAction",
  "logoutAction"
]);

function exportedAsyncFunctions(source: string): { name: string; source: string }[] {
  const matches = [...source.matchAll(/export async function\s+(\w+)\s*\(/g)];
  return matches.map((match, index) => ({
    name: match[1],
    source: source.slice(match.index, matches[index + 1]?.index ?? source.length)
  }));
}

describe("tenant mutation authentication guards", () => {
  for (const path of ACTION_MODULES) {
    it(`${path} scopes every tenant server action through requireWorkspace`, () => {
      const source = readFileSync(path, "utf8");
      const functions = exportedAsyncFunctions(source);
      expect(functions.length).toBeGreaterThan(0);
      for (const fn of functions) {
        if (PUBLIC_AUTH_ACTIONS.has(fn.name)) continue;
        expect(fn.source, `${fn.name} must derive the active workspace from the authenticated session`).toContain("requireWorkspace(");
      }
    });
  }

  it("the Jump action-event API authenticates and scopes the Jump lookup", () => {
    const source = readFileSync("src/app/api/jumps/[jumpId]/actions/route.ts", "utf8");
    expect(source).toContain("getCurrentSession(");
    expect(source).toContain("workspaceId: membership.workspaceId");
    expect(source).not.toMatch(/workspaceId\s*:\s*payload/);
  });
});
