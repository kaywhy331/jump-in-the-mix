import type { PlanTier } from "@/generated/prisma/client";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export type ContactGroupStateValue = {
  groupId: string;
  isActive: boolean;
};

export type GroupWithActivity<T extends { id: string }> = T & {
  isActive: boolean;
};

export function mergeGroupActivity<T extends { id: string }>(
  groups: T[],
  states: ContactGroupStateValue[]
): GroupWithActivity<T>[] {
  const stateByGroupId = new Map(states.map((state) => [state.groupId, state.isActive]));
  return groups.map((group) => ({
    ...group,
    isActive: stateByGroupId.get(group.id) !== false
  }));
}

export async function listGroupStates(workspaceId: string): Promise<ContactGroupStateValue[]> {
  return prisma.contactGroupState.findMany({
    where: { workspaceId },
    select: { groupId: true, isActive: true }
  });
}

export async function listGroupsWithActivity<T extends { id: string }>(
  workspaceId: string,
  groups: T[]
): Promise<GroupWithActivity<T>[]> {
  return mergeGroupActivity(groups, await listGroupStates(workspaceId));
}

export async function activeGroupIdsForWorkspace(
  workspaceId: string,
  candidateIds?: string[]
): Promise<string[]> {
  const groups = await prisma.group.findMany({
    where: {
      workspaceId,
      ...(candidateIds ? { id: { in: [...new Set(candidateIds)] } } : {})
    },
    select: { id: true }
  });
  const states = await listGroupStates(workspaceId);
  return mergeGroupActivity(groups, states)
    .filter((group) => group.isActive)
    .map((group) => group.id);
}

export async function countActiveGroups(workspaceId: string): Promise<number> {
  return (await activeGroupIdsForWorkspace(workspaceId)).length;
}

export async function isGroupActive(workspaceId: string, groupId: string): Promise<boolean> {
  return (await activeGroupIdsForWorkspace(workspaceId, [groupId])).length === 1;
}

export async function setActiveWorkspaceGroups(input: {
  workspaceId: string;
  planTier: PlanTier;
  selectedIds: string[];
  actorUserId?: string | null;
}): Promise<{ activeCount: number; inactiveCount: number }> {
  const selectedIds = [...new Set(input.selectedIds.filter(Boolean))];
  const limit = PLAN_LIMITS[input.planTier].groups;
  if (Number.isFinite(limit) && selectedIds.length > limit) {
    throw new Error(`Your ${input.planTier.toLowerCase()} plan allows ${limit} active Contact Groups.`);
  }

  return prisma.$transaction(async (tx) => {
    const groups = await tx.group.findMany({
      where: { workspaceId: input.workspaceId },
      select: { id: true }
    });
    const availableIds = new Set(groups.map((group) => group.id));
    if (selectedIds.some((id) => !availableIds.has(id))) {
      throw new Error("One or more selected Contact Groups are unavailable.");
    }

    const selected = new Set(selectedIds);
    await tx.contactGroupState.deleteMany({ where: { workspaceId: input.workspaceId } });
    if (groups.length) {
      await tx.contactGroupState.createMany({
        data: groups.map((group) => ({
          groupId: group.id,
          workspaceId: input.workspaceId,
          isActive: selected.has(group.id)
        }))
      });
    }

    if (input.actorUserId) {
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorType: "USER",
          actorUserId: input.actorUserId,
          action: "contact_groups.activation.update",
          entityType: "ContactGroupState",
          entityId: input.workspaceId,
          source: "contacts.groups",
          metadata: {
            activeCount: selectedIds.length,
            inactiveCount: Math.max(groups.length - selectedIds.length, 0)
          }
        }
      });
    }

    await tx.job.create({
      data: { workspaceId: input.workspaceId, task: "generate-jumps", payload: {} }
    });

    return {
      activeCount: selectedIds.length,
      inactiveCount: Math.max(groups.length - selectedIds.length, 0)
    };
  });
}
