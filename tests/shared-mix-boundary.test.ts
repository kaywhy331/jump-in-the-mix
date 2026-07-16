import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Mix Template boundary", () => {
  it("derives workspace identity from authenticated context and blocks support-view writes", () => {
    const actions = read("src/lib/shared-mix-actions.ts");
    expect(actions).toContain("requireWorkspace()");
    expect(actions).toContain("impersonation");
    expect(actions).not.toContain('formData.get("workspaceId")');
  });

  it("requires platform-administrator authorization for moderation", () => {
    const actions = read("src/lib/shared-mix-admin-actions.ts");
    const page = read("src/app/(app)/admin/templates/page.tsx");
    expect(actions).toContain("requirePlatformAdmin()");
    expect(page).toContain("requirePlatformAdmin()");
  });

  it("uses human-readable previews instead of exposing raw JSON", () => {
    for (const path of [
      "src/app/(app)/templates/page.tsx",
      "src/app/(app)/admin/templates/page.tsx"
    ]) {
      const source = read(path);
      expect(source).toContain("SharedMixPreview");
      expect(source).not.toContain("JSON.stringify(template.steps");
      expect(source).not.toContain("<pre>");
    }
    const editor = read("src/app/(app)/admin/templates/[sharedMixId]/edit/page.tsx");
    expect(editor).toContain("Prepared Jumps");
    expect(editor).toContain('name="stepBody"');
    expect(editor).toContain('name="stepScript"');
    expect(editor).not.toContain("JSON.stringify(template.steps");
    expect(editor).not.toContain("<pre>");
  });

  it("imports through one server transaction and creates an editable Draft", () => {
    const service = read("src/lib/shared-mix-service.ts");
    expect(service).toContain("return prisma.$transaction(async (tx) =>");
    expect(service).toContain('status: "DRAFT"');
    expect(service).toContain("tx.stepTemplate.create");
    expect(service).toContain("tx.mixStep.create");
    expect(service).toContain("tx.sharedMixImport.create");
  });

  it("does not copy Contacts, Groups, or completed Jumps into shared payloads", () => {
    const service = read("src/lib/shared-mix-service.ts");
    const snapshotStart = service.indexOf("export async function snapshotWorkspaceMix");
    const snapshotEnd = service.indexOf("export async function publishWorkspaceMix");
    const snapshot = service.slice(snapshotStart, snapshotEnd);
    expect(snapshot).not.toContain("contact.find");
    expect(snapshot).not.toContain("group.find");
    expect(snapshot).not.toContain("jump.find");
  });
});
