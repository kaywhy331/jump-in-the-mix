import type { PlanTier, Prisma } from "@/generated/prisma/client";
import { isPlanDowngrade } from "@/lib/billing";
import { mergeGroupActivity } from "@/lib/group-activity";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export type PlanDowngradeSafeguards = {
  applied: boolean;
  pausedMixes: number;
  deactivatedDateTypes: number;
  deactivatedGroups: number;
  unpublishedCommunityMixes: number;
  groupsOverLimit: number;
  contactsOverLimit: number;
};

const EMPTY_RESULT: PlanDowngradeSafeguards = {
  applied: false,
  pausedMixes: 0,
  deactivatedDateTypes: 0,
  deactivatedGroups: 0,
  unpublishedCommunityMixes: 0,
  groupsOverLimit: 0,
  contactsOverLimit: 0
};

function excessIds<T extends { id: string }>(items: T[], limit: number): string[] {
  if (!Number.isFinite(limit) || items.length <= limit) return [];
  return items.slice(limit).map((item) => item.id);
}

async function enforceLimits(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; planTier: PlanTier; now?: Date; applied: boolean }
): Promise<PlanDowngradeSafeguards> {
  const limits = PLAN_LIMITS[input.planTier];
  const now = input.now ?? new Date();

  const [activeMixes, activeDateTypes, sharedMixes, groups, groupStates, contactCount] = await Promise.all([
    tx.mix.findMany({
      where: { workspaceId: input.workspaceId, status: "ACTIVE" },
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    }),
    tx.dateType.findMany({
      where: { workspaceId: input.workspaceId, isSystem: false, isActive: true },
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    }),
    tx.sharedMixMetadata.findMany({
      where: {
        publisherWorkspaceId: input.workspaceId,
        isPlatform: false,
        reviewState: { in: ["PENDING", "APPROVED", "FLAGGED"] }
      },
      select: { sharedMixId: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    }),
    tx.group.findMany({
      where: { workspaceId: input.workspaceId },
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    }),
    tx.contactGroupState.findMany({
      where: { workspaceId: input.workspaceId },
      select: { groupId: true, isActive: true }
    }),
    tx.contact.count({ where: { workspaceId: input.workspaceId, archivedAt: null } })
  ]);

  const activeGroups = mergeGroupActivity(groups, groupStates).filter((group) => group.isActive);
  const pausedMixIds = excessIds(activeMixes, limits.mixes);
  const inactiveDateTypeIds = excessIds(activeDateTypes, limits.customDateTypes);
  const inactiveGroupIds = excessIds(activeGroups, limits.groups);
  const unpublishedSharedMixIds = Number.isFinite(limits.sharedMixes) && sharedMixes.length > limits.sharedMixes
    ? sharedMixes.slice(limits.sharedMixes).map((item) => item.sharedMixId)
    : [];

  if (pausedMixIds.length) {
    await tx.mix.updateMany({
      where: { workspaceId: input.workspaceId, id: { in: pausedMixIds }, status: "ACTIVE" },
      data: { status: "PAUSED" }
    });
    await tx.jump.updateMany({
      where: {
        workspaceId: input.workspaceId,
        mixId: { in: pausedMixIds },
        status: "PENDING",
        scheduledAt: { gte: now }
      },
      data: { status: "CANCELED", completedAt: null, completionMethod: "plan_downgrade" }
    });
  }

  if (inactiveDateTypeIds.length) {
    await tx.dateType.updateMany({
      where: { workspaceId: input.workspaceId, id: { in: inactiveDateTypeIds }, isSystem: false },
      data: { isActive: false }
    });
  }

  for (const groupId of inactiveGroupIds) {
    await tx.contactGroupState.upsert({
      where: { groupId },
      create: { groupId, workspaceId: input.workspaceId, isActive: false },
      update: { workspaceId: input.workspaceId, isActive: false }
    });
  }

  if (unpublishedSharedMixIds.length) {
    await tx.sharedMixMetadata.updateMany({
      where: { sharedMixId: { in: unpublishedSharedMixIds }, publisherWorkspaceId: input.workspaceId },
      data: {
        reviewState: "UNPUBLISHED",
        featuredAt: null,
        moderationNote: "Automatically unpublished because the workspace changed to a plan with a lower sharing allowance."
      }
    });
    await tx.sharedMix.updateMany({
      where: { id: { in: unpublishedSharedMixIds }, publisherWorkspaceId: input.workspaceId },
      data: { status: "UNPUBLISHED" }
    });
  }

  return {
    applied: input.applied,
    pausedMixes: pausedMixIds.length,
    deactivatedDateTypes: inactiveDateTypeIds.length,
    deactivatedGroups: inactiveGroupIds.length,
    unpublishedCommunityMixes: unpublishedSharedMixIds.length,
    groupsOverLimit: inactiveGroupIds.length,
    contactsOverLimit: Number.isFinite(limits.contacts) ? Math.max(contactCount - limits.contacts, 0) : 0
  };
}

export async function applyPlanDowngradeSafeguards(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; previousTier: PlanTier; nextTier: PlanTier; now?: Date }
): Promise<PlanDowngradeSafeguards> {
  if (!isPlanDowngrade(input.previousTier, input.nextTier)) return EMPTY_RESULT;
  return enforceLimits(tx, {
    workspaceId: input.workspaceId,
    planTier: input.nextTier,
    now: input.now,
    applied: true
  });
}

export async function enforceCurrentWorkspacePlanLimits(
  workspaceId: string,
  planTier: PlanTier,
  now = new Date()
): Promise<PlanDowngradeSafeguards> {
  return prisma.$transaction((tx) => enforceLimits(tx, {
    workspaceId,
    planTier,
    now,
    applied: true
  }));
}
