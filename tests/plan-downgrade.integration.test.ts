import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countActiveGroups } from "../src/lib/group-activity";
import { enforceCurrentWorkspacePlanLimits } from "../src/lib/plan-downgrade";
import { prisma } from "../src/lib/prisma";

describe.sequential("plan downgrade safeguards", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `downgrade-${suffix}@example.com`, name: "Downgrade Owner", passwordHash: "test-only" }
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: "Downgrade Test",
        slug: `downgrade-${suffix}`,
        ownerId: user.id,
        planTier: "PRO",
        profile: { create: { timezone: "America/Los_Angeles" } }
      }
    });
    ids.user = user.id;
    ids.workspace = workspace.id;

    for (let index = 0; index < 5; index += 1) {
      await prisma.mix.create({
        data: {
          workspaceId: workspace.id,
          name: `Active Mix ${index}`,
          triggerMode: "MANUAL_START",
          status: "ACTIVE"
        }
      });
      await prisma.dateType.create({
        data: {
          workspaceId: workspace.id,
          scopeKey: workspace.id,
          name: `Custom Type ${index} ${suffix}`,
          slug: `custom-type-${index}-${suffix}`,
          isSystem: false,
          isActive: true
        }
      });
      await prisma.group.create({ data: { workspaceId: workspace.id, name: `Group ${index} ${suffix}` } });
    }
    await prisma.contact.createMany({
      data: Array.from({ length: 102 }, (_, index) => ({
        workspaceId: workspace.id,
        displayName: `Contact ${index}`
      }))
    });
  });

  afterAll(async () => {
    if (ids.workspace) await prisma.contactGroupState.deleteMany({ where: { workspaceId: ids.workspace } });
    if (ids.workspace) await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("preserves every record while pausing or deactivating excess active work", async () => {
    const before = {
      mixes: await prisma.mix.count({ where: { workspaceId: ids.workspace } }),
      dateTypes: await prisma.dateType.count({ where: { workspaceId: ids.workspace, isSystem: false } }),
      groups: await prisma.group.count({ where: { workspaceId: ids.workspace } }),
      contacts: await prisma.contact.count({ where: { workspaceId: ids.workspace } })
    };

    const result = await enforceCurrentWorkspacePlanLimits(ids.workspace, "FREE");
    expect(result).toMatchObject({
      applied: true,
      pausedMixes: 2,
      deactivatedDateTypes: 2,
      deactivatedGroups: 2,
      unpublishedCommunityMixes: 0,
      groupsOverLimit: 2,
      contactsOverLimit: 2
    });
    expect(await prisma.mix.count({ where: { workspaceId: ids.workspace, status: "ACTIVE" } })).toBe(3);
    expect(await prisma.mix.count({ where: { workspaceId: ids.workspace, status: "PAUSED" } })).toBe(2);
    expect(await prisma.dateType.count({ where: { workspaceId: ids.workspace, isSystem: false, isActive: true } })).toBe(3);
    expect(await prisma.dateType.count({ where: { workspaceId: ids.workspace, isSystem: false, isActive: false } })).toBe(2);
    expect(await countActiveGroups(ids.workspace)).toBe(3);
    expect(await prisma.contactGroupState.count({ where: { workspaceId: ids.workspace, isActive: false } })).toBe(2);

    expect(await prisma.mix.count({ where: { workspaceId: ids.workspace } })).toBe(before.mixes);
    expect(await prisma.dateType.count({ where: { workspaceId: ids.workspace, isSystem: false } })).toBe(before.dateTypes);
    expect(await prisma.group.count({ where: { workspaceId: ids.workspace } })).toBe(before.groups);
    expect(await prisma.contact.count({ where: { workspaceId: ids.workspace } })).toBe(before.contacts);
  });

  it("is idempotent when the current workspace already satisfies its plan", async () => {
    const result = await enforceCurrentWorkspacePlanLimits(ids.workspace, "FREE");
    expect(result).toMatchObject({ pausedMixes: 0, deactivatedDateTypes: 0, deactivatedGroups: 0 });
    expect(await prisma.mix.count({ where: { workspaceId: ids.workspace, status: "ACTIVE" } })).toBe(3);
    expect(await prisma.dateType.count({ where: { workspaceId: ids.workspace, isSystem: false, isActive: true } })).toBe(3);
    expect(await countActiveGroups(ids.workspace)).toBe(3);
  });
});
