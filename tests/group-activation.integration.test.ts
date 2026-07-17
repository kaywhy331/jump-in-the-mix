import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setActiveWorkspaceGroups } from "../src/lib/group-activity";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";

describe.sequential("Contact Group activation lifecycle", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `group-activation-${suffix}@example.com`,
        name: "Group Activation Owner",
        passwordHash: "test-only"
      }
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: "Group Activation Test",
        slug: `group-activation-${suffix}`,
        ownerId: user.id,
        planTier: "FREE",
        profile: { create: { timezone: "UTC" } }
      }
    });
    const group = await prisma.group.create({
      data: { workspaceId: workspace.id, name: `Priority Group ${suffix}` }
    });
    const contact = await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        displayName: "Group Contact",
        groupMemberships: { create: { groupId: group.id } }
      }
    });
    const template = await prisma.stepTemplate.create({
      data: { workspaceId: workspace.id, name: "Group Check-In", channel: "SMS" }
    });
    const version = await prisma.stepVersion.create({
      data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}, checking in." }
    });
    const mix = await prisma.mix.create({
      data: {
        workspaceId: workspace.id,
        name: "Group Mix",
        triggerMode: "MANUAL_START",
        status: "ACTIVE"
      }
    });
    await prisma.mixStep.create({
      data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }
    });
    const assignment = await prisma.mixAssignment.create({
      data: {
        assignmentKey: `${workspace.id}:${mix.id}:group:${group.id}`,
        workspaceId: workspace.id,
        mixId: mix.id,
        groupId: group.id,
        mode: "DYNAMIC",
        startDate: new Date()
      }
    });

    Object.assign(ids, {
      user: user.id,
      workspace: workspace.id,
      group: group.id,
      contact: contact.id,
      mix: mix.id,
      assignment: assignment.id
    });
  });

  afterAll(async () => {
    if (ids.workspace) await prisma.contactGroupState.deleteMany({ where: { workspaceId: ids.workspace } });
    if (ids.workspace) await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("cancels future work while preserving membership and assignment, then restores it after reactivation", async () => {
    const first = await reconcileJumps({ workspaceId: ids.workspace });
    expect(first.desired).toBe(1);
    expect(await prisma.jump.count({ where: { workspaceId: ids.workspace, status: "PENDING" } })).toBe(1);

    await setActiveWorkspaceGroups({
      workspaceId: ids.workspace,
      planTier: "FREE",
      selectedIds: [],
      actorUserId: ids.user
    });
    const deactivated = await reconcileJumps({ workspaceId: ids.workspace });
    expect(deactivated.desired).toBe(0);
    expect(deactivated.canceled).toBe(1);
    expect(await prisma.jump.count({ where: { workspaceId: ids.workspace, status: "PENDING" } })).toBe(0);
    expect(await prisma.jump.count({ where: { workspaceId: ids.workspace, status: "CANCELED" } })).toBe(1);
    expect(await prisma.contactGroupMembership.count({ where: { contactId: ids.contact, groupId: ids.group } })).toBe(1);
    expect(await prisma.mixAssignment.count({ where: { id: ids.assignment, isActive: true } })).toBe(1);

    await setActiveWorkspaceGroups({
      workspaceId: ids.workspace,
      planTier: "FREE",
      selectedIds: [ids.group],
      actorUserId: ids.user
    });
    const reactivated = await reconcileJumps({ workspaceId: ids.workspace });
    expect(reactivated.desired).toBe(1);
    expect(reactivated.updated).toBe(1);
    expect(await prisma.jump.count({ where: { workspaceId: ids.workspace, status: "PENDING" } })).toBe(1);
    expect(await prisma.contactGroupState.findUnique({ where: { groupId: ids.group } })).toMatchObject({
      workspaceId: ids.workspace,
      isActive: true
    });
  });
});
