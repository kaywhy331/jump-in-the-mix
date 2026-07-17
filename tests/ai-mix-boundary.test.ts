import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("AI Mix Wizard boundary", () => {
  it("derives workspace identity from authenticated context and blocks support-view writes", () => {
    const actions = read("src/lib/ai-mix-actions.ts");
    expect(actions).toContain("requireWorkspace()");
    expect(actions).toContain("Administrator support sessions are view-only");
    expect(actions).not.toContain('formData.get("workspaceId")');
  });

  it("enforces plan and request-rate boundaries before provider use", () => {
    const actions = read("src/lib/ai-mix-actions.ts");
    expect(actions).toContain("PLAN_LIMITS[workspace.planTier].aiWizard");
    expect(actions).toContain('scope: "ai-mix.generate"');
    expect(actions).toContain('scope: "ai-mix.refine"');
  });

  it("accepts only active workspace Contact Groups as AI audiences", () => {
    const actions = read("src/lib/ai-mix-actions.ts");
    const wizard = read("src/app/(app)/mixes/wizard/page.tsx");
    expect(actions).toContain("activeGroupIdsForWorkspace(workspace.id, groupIds)");
    expect(actions).toContain("activeGroupIdsForWorkspace(context.workspace.id, groupIds)");
    expect(actions).toContain("Choose only active Contact Groups");
    expect(actions).toContain("became inactive");
    expect(wizard).toContain("mergeGroupActivity(rawGroups, groupStates).filter((group) => group.isActive)");
  });

  it("uses schema-constrained provider output with storage disabled", () => {
    const service = read("src/lib/ai-mix.ts");
    expect(service).toContain('type: "json_schema"');
    expect(service).toContain("strict: true");
    expect(service).toContain("store: false");
    expect(service).toContain('`${env.aiBaseUrl}/responses`');
  });

  it("does not query or transmit Contact records to the AI provider", () => {
    const service = read("src/lib/ai-mix.ts");
    expect(service).not.toContain("prisma.contact");
    expect(service).not.toContain("contact.find");
    expect(service).not.toContain("privateNotes");
    expect(service).toContain("audienceSegments");
  });

  it("publishes through one transaction into ordinary editable Mix records", () => {
    const service = read("src/lib/ai-mix-service.ts");
    expect(service).toContain("await prisma.$transaction(async (tx) =>");
    expect(service).toContain('status: "DRAFT"');
    expect(service).toContain('source: "AI_WIZARD"');
    expect(service).toContain("tx.stepTemplate.create");
    expect(service).toContain("tx.stepVersion.create");
    expect(service).toContain("tx.mixStep.create");
    expect(service).toContain("tx.mixAssignment.create");
    expect(service).toContain('task: "generate-jumps"');
  });

  it("keeps the workflow review-first and never inserts Reply STOP copy", () => {
    const wizard = read("src/app/(app)/mixes/wizard/page.tsx");
    const review = read("src/app/(app)/mixes/wizard/[draftId]/page.tsx");
    const service = read("src/lib/ai-mix.ts");
    expect(wizard).toContain("Generate review draft");
    expect(review).toContain("Create editable Mix Draft");
    expect(review).toContain("Nothing has been activated");
    expect(service).toContain("Personal SMS Jumps must not include");
    expect(service).not.toContain('body: "Reply STOP');
  });
});
