import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demo seed reset", () => {
  it("removes workspace-scoped records that are outside the Workspace cascade", () => {
    const seed = readFileSync("prisma/seed.ts", "utf8");
    const contributorCleanup = 'sharedMixContributorProfile.deleteMany({ where: { workspaceId: workspace.id } })';
    const contributorCleanupIndex = seed.indexOf(contributorCleanup);
    const workspaceDeleteIndex = seed.indexOf('workspace.delete({ where: { id: workspace.id } })');

    expect(contributorCleanupIndex).toBeGreaterThan(-1);
    expect(workspaceDeleteIndex).toBeGreaterThan(contributorCleanupIndex);
  });
});
