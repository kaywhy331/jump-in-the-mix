import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

afterAll(async () => {
  if (createdWorkspaceIds.length) await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe.sequential("Contact activity timeline", () => {
  it("stores append-only notes and removes them with the workspace", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const user = await prisma.user.create({
      data: { email: `activity-${suffix}@example.com`, name: "Activity Owner", passwordHash: "test-only" }
    });
    createdUserIds.push(user.id);
    const workspace = await prisma.workspace.create({
      data: { name: "Activity Test", slug: `activity-${suffix}`, ownerId: user.id }
    });
    createdWorkspaceIds.push(workspace.id);
    const contact = await prisma.contact.create({
      data: { workspaceId: workspace.id, displayName: "Timeline Contact", firstName: "Timeline" }
    });

    const first = await prisma.contactActivity.create({
      data: {
        workspaceId: workspace.id,
        contactId: contact.id,
        actorUserId: user.id,
        kind: "CUSTOMER_NOTE",
        visibility: "WORKSPACE",
        summary: "Met at the local chamber event."
      }
    });
    const second = await prisma.contactActivity.create({
      data: {
        workspaceId: workspace.id,
        contactId: contact.id,
        actorUserId: user.id,
        kind: "PRIVATE_UPDATE",
        visibility: "PRIVATE",
        summary: "Requested a revised proposal."
      }
    });

    const items = await prisma.contactActivity.findMany({ where: { contactId: contact.id }, orderBy: { createdAt: "asc" } });
    expect(items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(items.map((item) => item.summary)).toEqual([
      "Met at the local chamber event.",
      "Requested a revised proposal."
    ]);

    await prisma.workspace.delete({ where: { id: workspace.id } });
    createdWorkspaceIds.splice(createdWorkspaceIds.indexOf(workspace.id), 1);
    expect(await prisma.contactActivity.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });

  it("keeps outcome mutations idempotent and in-place at the UI boundary", () => {
    const outcomeRoute = readFileSync("src/app/api/jumps/[jumpId]/outcome/route.ts", "utf8");
    const workflow = readFileSync("src/components/JumpWorkflow.tsx", "utf8");
    const today = readFileSync("src/app/(app)/jumps/page.tsx", "utf8");
    expect(outcomeRoute).toContain("jump-outcome:${jumpId}:${requestId}");
    expect(outcomeRoute).toContain('status: { in: ["PENDING", "COPIED"] }');
    expect(outcomeRoute).toContain('kind: "JUMP_OUTCOME"');
    expect(workflow).toContain('"jitm:jump-state"');
    expect(workflow).toContain("How did the follow-up with");
    expect(today).toContain("<JumpReturnTray />");
    expect(today).toContain("<JumpWorkflowCard");
  });
});
