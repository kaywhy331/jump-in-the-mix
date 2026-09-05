import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Mix Template boundary", () => {
  it("shows only approved curated plans", () => {
    const page = read("src/app/(app)/templates/page.tsx");
    expect(page).toContain('status: "APPROVED"');
    expect(page).not.toMatch(/community|contributor|vote/i);
  });

  it("requires authentication and rejects hidden records on use", () => {
    const page = read("src/app/(app)/templates/[sharedMixId]/use/page.tsx");
    expect(page).toContain("requireWorkspace()");
    expect(page).toContain('status: "APPROVED"');
    expect(page).toContain("notFound()");
  });

  it("uses readable previews instead of exposing raw JSON", () => {
    const source = read("src/app/(app)/templates/page.tsx");
    expect(source).toContain("SharedMixPreview");
    expect(source).not.toContain("JSON.stringify(template.steps");
    expect(source).not.toContain("<pre>");
  });

  it("imports through one server transaction and creates an editable Draft", () => {
    const service = read("src/lib/shared-mix-service.ts");
    expect(service).toContain("return prisma.$transaction(async (tx) =>");
    expect(service).toContain('status: "DRAFT"');
    expect(service).toContain("tx.stepTemplate.create");
    expect(service).toContain("tx.mixStep.create");
    expect(service).toContain("tx.sharedMixImport.create");
  });
});
