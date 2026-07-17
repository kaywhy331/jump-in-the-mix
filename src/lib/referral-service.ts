import type { PlanTier, Prisma, ReferralRewardStatus, SubscriptionStatus } from "@/generated/prisma/client";
import { subscriptionHasPaidAccess } from "@/lib/billing";
import { applyPlanDowngradeSafeguards } from "@/lib/plan-downgrade";
import { prisma } from "@/lib/prisma";
import {
  addReferralDays,
  DAY_MS,
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_MAX_REFERRER_DAYS,
  REFERRAL_REWARD_DAYS
} from "@/lib/referral";

type Tx = Prisma.TransactionClient;

type WorkspacePlanState = {
  id: string;
  ownerId: string;
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  stripeSubscriptionId: string | null;
};

type ReferralAccountState = {
  workspaceId: string;
  code: string;
  plusExpiresAt: Date | null;
  bankedDays: number;
};

export type ReferralInvite = {
  code: string;
  workspaceId: string;
  workspaceName: string;
  ownerName: string;
  ownerEmail: string;
};

export type ReferralHistoryItem = {
  id: string;
  codeUsed: string;
  status: string;
  qualifiedAt: Date | null;
  createdAt: Date;
  referredWorkspaceName: string;
  referredOwnerName: string;
  referredOwnerEmail: string;
  rewardStatus: ReferralRewardStatus | null;
  rewardDays: number;
  rewardStartsAt: Date | null;
  rewardEndsAt: Date | null;
};

export type ReferralDashboard = {
  account: {
    code: string;
    plusExpiresAt: Date | null;
    bankedDays: number;
  };
  qualifiedCount: number;
  attributedCount: number;
  earnedDays: number;
  cappedCount: number;
  remainingRewardDays: number;
  history: ReferralHistoryItem[];
  receivedFrom: {
    workspaceName: string;
    ownerName: string;
    qualifiedAt: Date | null;
  } | null;
};

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function workspaceHasPaidStripeAccess(workspace: Pick<WorkspacePlanState, "stripeSubscriptionId" | "subscriptionStatus">): boolean {
  return Boolean(workspace.stripeSubscriptionId && subscriptionHasPaidAccess(workspace.subscriptionStatus));
}

async function createReferralAccountWithCode(tx: Tx, workspaceId: string, code: string) {
  return tx.referralAccount.create({
    data: { workspaceId, code: normalizeReferralCode(code) }
  });
}

export async function createReferralAccountInTransaction(
  tx: Tx,
  workspaceId: string,
  code = generateReferralCode()
) {
  return createReferralAccountWithCode(tx, workspaceId, code);
}

export async function ensureWorkspaceReferralAccount(workspaceId: string) {
  const existing = await prisma.referralAccount.findUnique({ where: { workspaceId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await prisma.referralAccount.create({
        data: { workspaceId, code: generateReferralCode() }
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.referralAccount.findUnique({ where: { workspaceId } });
      if (raced) return raced;
    }
  }
  throw new Error("A unique referral code could not be created.");
}

export async function findReferralInvite(rawCode: string): Promise<ReferralInvite | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const account = await prisma.referralAccount.findUnique({ where: { code } });
  if (!account) return null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: account.workspaceId },
    include: { owner: { select: { name: true, email: true } } }
  });
  if (!workspace) return null;
  return {
    code,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    ownerName: workspace.owner.name,
    ownerEmail: workspace.owner.email
  };
}

async function accountForWorkspace(tx: Tx, workspaceId: string): Promise<ReferralAccountState> {
  const existing = await tx.referralAccount.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  return createReferralAccountWithCode(tx, workspaceId, generateReferralCode());
}

async function markConsumedRewards(tx: Tx, workspaceId: string, now: Date): Promise<void> {
  await tx.referralReward.updateMany({
    where: { workspaceId, status: "ACTIVE", endsAt: { lte: now } },
    data: { status: "CONSUMED", consumedAt: now }
  });
}

async function bankActiveReferralWindow(
  tx: Tx,
  workspaceId: string,
  account: ReferralAccountState,
  now: Date
): Promise<ReferralAccountState> {
  if (!account.plusExpiresAt || account.plusExpiresAt <= now) return account;

  const activeRewards = await tx.referralReward.findMany({
    where: { workspaceId, status: "ACTIVE", endsAt: { gt: now } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }]
  });
  let remainingDays = 0;
  for (const reward of activeRewards) {
    if (!reward.endsAt) continue;
    const segmentStart = reward.startsAt && reward.startsAt > now ? reward.startsAt : now;
    const days = Math.max(Math.ceil((reward.endsAt.getTime() - segmentStart.getTime()) / DAY_MS), 0);
    if (days <= 0) {
      await tx.referralReward.update({
        where: { id: reward.id },
        data: { status: "CONSUMED", consumedAt: now }
      });
      continue;
    }
    remainingDays += days;
    await tx.referralReward.update({
      where: { id: reward.id },
      data: {
        status: "BANKED",
        startsAt: null,
        endsAt: null,
        appliedAt: now,
        consumedAt: null
      }
    });
  }

  if (remainingDays === 0) {
    remainingDays = Math.max(Math.ceil((account.plusExpiresAt.getTime() - now.getTime()) / DAY_MS), 0);
  }
  return tx.referralAccount.update({
    where: { workspaceId },
    data: {
      plusExpiresAt: null,
      bankedDays: Math.min(account.bankedDays + remainingDays, REFERRAL_MAX_REFERRER_DAYS)
    }
  });
}

async function activateBankedRewards(
  tx: Tx,
  workspaceId: string,
  account: ReferralAccountState,
  now: Date
): Promise<Date | null> {
  if (account.bankedDays <= 0) return account.plusExpiresAt;
  const rewards = await tx.referralReward.findMany({
    where: { workspaceId, status: "BANKED", days: { gt: 0 } },
    orderBy: { createdAt: "asc" }
  });
  let cursor = account.plusExpiresAt && account.plusExpiresAt > now ? account.plusExpiresAt : now;
  let appliedDays = 0;
  for (const reward of rewards) {
    const days = Math.min(reward.days, Math.max(account.bankedDays - appliedDays, 0));
    if (days <= 0) break;
    const endsAt = addReferralDays(cursor, days);
    await tx.referralReward.update({
      where: { id: reward.id },
      data: {
        status: "ACTIVE",
        startsAt: cursor,
        endsAt,
        appliedAt: now,
        consumedAt: null
      }
    });
    cursor = endsAt;
    appliedDays += days;
  }

  if (appliedDays < account.bankedDays) {
    cursor = addReferralDays(cursor, account.bankedDays - appliedDays);
  }
  await tx.referralAccount.update({
    where: { workspaceId },
    data: { bankedDays: 0, plusExpiresAt: cursor }
  });
  return cursor;
}

async function applyReward(
  tx: Tx,
  input: {
    rewardId: string;
    workspace: WorkspacePlanState;
    days: number;
    now: Date;
    bankForProOrPaid: boolean;
  }
): Promise<{ status: ReferralRewardStatus; startsAt: Date | null; endsAt: Date | null }> {
  let account = await accountForWorkspace(tx, input.workspace.id);
  const shouldBank = input.bankForProOrPaid
    && (input.workspace.planTier === "PRO" || workspaceHasPaidStripeAccess(input.workspace));

  if (shouldBank) {
    account = await bankActiveReferralWindow(tx, input.workspace.id, account, input.now);
    const bankedDays = Math.min(account.bankedDays + input.days, REFERRAL_MAX_REFERRER_DAYS);
    await tx.referralAccount.update({ where: { workspaceId: input.workspace.id }, data: { bankedDays } });
    await tx.referralReward.update({
      where: { id: input.rewardId },
      data: { days: input.days, status: "BANKED", appliedAt: input.now, startsAt: null, endsAt: null }
    });
    return { status: "BANKED", startsAt: null, endsAt: null };
  }

  const startsAt = account.plusExpiresAt && account.plusExpiresAt > input.now ? account.plusExpiresAt : input.now;
  const endsAt = addReferralDays(startsAt, input.days);
  await Promise.all([
    tx.referralAccount.update({
      where: { workspaceId: input.workspace.id },
      data: { plusExpiresAt: endsAt }
    }),
    tx.workspace.update({ where: { id: input.workspace.id }, data: { planTier: "PLUS" } }),
    tx.referralReward.update({
      where: { id: input.rewardId },
      data: { days: input.days, status: "ACTIVE", startsAt, endsAt, appliedAt: input.now, consumedAt: null }
    })
  ]);
  return { status: "ACTIVE", startsAt, endsAt };
}

async function qualifyReferralById(tx: Tx, referralId: string, now: Date) {
  const referral = await tx.referral.findUnique({
    where: { id: referralId },
    include: { rewards: true }
  });
  if (!referral || referral.status !== "ATTRIBUTED") return referral;

  await tx.workspace.update({
    where: { id: referral.referrerWorkspaceId },
    data: { updatedAt: now }
  });
  const [referrerWorkspace, referredWorkspace] = await Promise.all([
    tx.workspace.findUnique({
      where: { id: referral.referrerWorkspaceId },
      select: { id: true, ownerId: true, planTier: true, subscriptionStatus: true, stripeSubscriptionId: true }
    }),
    tx.workspace.findUnique({
      where: { id: referral.referredWorkspaceId },
      select: { id: true, ownerId: true, planTier: true, subscriptionStatus: true, stripeSubscriptionId: true }
    })
  ]);
  if (!referrerWorkspace || !referredWorkspace) throw new Error("The referral workspace could not be resolved.");

  const referrerReward = referral.rewards.find((reward) => reward.recipient === "REFERRER");
  const referredReward = referral.rewards.find((reward) => reward.recipient === "REFERRED");
  if (!referrerReward || !referredReward) throw new Error("The referral reward records are incomplete.");

  const earned = await tx.referralReward.aggregate({
    where: {
      workspaceId: referral.referrerWorkspaceId,
      recipient: "REFERRER",
      status: { in: ["ACTIVE", "BANKED", "CONSUMED"] }
    },
    _sum: { days: true }
  });
  const remaining = Math.max(REFERRAL_MAX_REFERRER_DAYS - (earned._sum.days ?? 0), 0);
  const referrerDays = Math.min(REFERRAL_REWARD_DAYS, remaining);

  let referrerResult: { status: ReferralRewardStatus; startsAt: Date | null; endsAt: Date | null };
  if (referrerDays <= 0) {
    await tx.referralReward.update({
      where: { id: referrerReward.id },
      data: { days: 0, status: "CAPPED", appliedAt: now }
    });
    referrerResult = { status: "CAPPED", startsAt: null, endsAt: null };
  } else {
    referrerResult = await applyReward(tx, {
      rewardId: referrerReward.id,
      workspace: referrerWorkspace,
      days: referrerDays,
      now,
      bankForProOrPaid: true
    });
  }

  const referredResult = await applyReward(tx, {
    rewardId: referredReward.id,
    workspace: referredWorkspace,
    days: REFERRAL_REWARD_DAYS,
    now,
    bankForProOrPaid: true
  });

  await tx.referral.update({
    where: { id: referral.id },
    data: { status: "QUALIFIED", qualifiedAt: now }
  });
  await Promise.all([
    tx.auditLog.create({
      data: {
        workspaceId: referral.referrerWorkspaceId,
        actorType: "SYSTEM",
        action: "referral.qualified",
        entityType: "Referral",
        entityId: referral.id,
        source: "referral.signup",
        metadata: {
          referredWorkspaceId: referral.referredWorkspaceId,
          days: referrerDays,
          rewardStatus: referrerResult.status,
          startsAt: referrerResult.startsAt?.toISOString() ?? null,
          endsAt: referrerResult.endsAt?.toISOString() ?? null
        }
      }
    }),
    tx.auditLog.create({
      data: {
        workspaceId: referral.referredWorkspaceId,
        actorType: "SYSTEM",
        action: "referral.signup-reward",
        entityType: "Referral",
        entityId: referral.id,
        source: "referral.signup",
        metadata: {
          referrerWorkspaceId: referral.referrerWorkspaceId,
          days: REFERRAL_REWARD_DAYS,
          rewardStatus: referredResult.status,
          startsAt: referredResult.startsAt?.toISOString() ?? null,
          endsAt: referredResult.endsAt?.toISOString() ?? null
        }
      }
    })
  ]);
  return referral;
}

export async function createReferralAttributionInTransaction(
  tx: Tx,
  input: {
    code: string;
    referrerWorkspaceId: string;
    referredWorkspaceId: string;
    qualifyImmediately: boolean;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  if (input.referrerWorkspaceId === input.referredWorkspaceId) throw new Error("A workspace cannot refer itself.");
  const referral = await tx.referral.create({
    data: {
      codeUsed: normalizeReferralCode(input.code),
      referrerWorkspaceId: input.referrerWorkspaceId,
      referredWorkspaceId: input.referredWorkspaceId,
      status: "ATTRIBUTED",
      rewards: {
        create: [
          { workspaceId: input.referrerWorkspaceId, recipient: "REFERRER", days: REFERRAL_REWARD_DAYS, status: "PENDING" },
          { workspaceId: input.referredWorkspaceId, recipient: "REFERRED", days: REFERRAL_REWARD_DAYS, status: "PENDING" }
        ]
      }
    }
  });
  await tx.auditLog.create({
    data: {
      workspaceId: input.referredWorkspaceId,
      actorType: "SYSTEM",
      action: "referral.attributed",
      entityType: "Referral",
      entityId: referral.id,
      source: "auth.register",
      metadata: { referrerWorkspaceId: input.referrerWorkspaceId, codeUsed: normalizeReferralCode(input.code) }
    }
  });
  if (input.qualifyImmediately) await qualifyReferralById(tx, referral.id, now);
  return referral;
}

export async function qualifyAttributedReferralForUser(tx: Tx, userId: string, now = new Date()): Promise<boolean> {
  const workspace = await tx.workspace.findFirst({ where: { ownerId: userId }, select: { id: true } });
  if (!workspace) return false;
  const referral = await tx.referral.findFirst({
    where: { referredWorkspaceId: workspace.id, status: "ATTRIBUTED" },
    select: { id: true }
  });
  if (!referral) return false;
  await qualifyReferralById(tx, referral.id, now);
  return true;
}

export async function resolveWorkspacePlanAfterStripe(
  tx: Tx,
  input: {
    workspaceId: string;
    paidPlanTier: Exclude<PlanTier, "FREE">;
    subscriptionStatus: SubscriptionStatus;
    now?: Date;
  }
): Promise<PlanTier> {
  const now = input.now ?? new Date();
  await markConsumedRewards(tx, input.workspaceId, now);
  if (subscriptionHasPaidAccess(input.subscriptionStatus)) return input.paidPlanTier;

  const account = await tx.referralAccount.findUnique({ where: { workspaceId: input.workspaceId } });
  if (!account) return "FREE";
  if (account.plusExpiresAt && account.plusExpiresAt > now) return "PLUS";
  if (account.bankedDays > 0) {
    await activateBankedRewards(tx, input.workspaceId, account, now);
    return "PLUS";
  }
  if (account.plusExpiresAt) {
    await tx.referralAccount.update({ where: { workspaceId: input.workspaceId }, data: { plusExpiresAt: null } });
  }
  return "FREE";
}

export async function reconcileWorkspaceReferralEntitlement(workspaceId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
    let account = await tx.referralAccount.findUnique({ where: { workspaceId } });
    if (!workspace || !account) return workspace;

    await markConsumedRewards(tx, workspaceId, now);
    if (workspaceHasPaidStripeAccess(workspace) || workspace.planTier === "PRO") {
      account = await bankActiveReferralWindow(tx, workspaceId, account, now);
      return workspace;
    }

    if (account.plusExpiresAt && account.plusExpiresAt > now) {
      return workspace.planTier === "PLUS"
        ? workspace
        : tx.workspace.update({ where: { id: workspaceId }, data: { planTier: "PLUS" } });
    }

    if (account.bankedDays > 0) {
      await activateBankedRewards(tx, workspaceId, account, now);
      return tx.workspace.update({ where: { id: workspaceId }, data: { planTier: "PLUS" } });
    }

    if (account.plusExpiresAt) {
      await tx.referralAccount.update({ where: { workspaceId }, data: { plusExpiresAt: null } });
      if (workspace.planTier === "PLUS") {
        const next = await tx.workspace.update({ where: { id: workspaceId }, data: { planTier: "FREE" } });
        await applyPlanDowngradeSafeguards(tx, {
          workspaceId,
          previousTier: "PLUS",
          nextTier: "FREE",
          now
        });
        await tx.auditLog.create({
          data: {
            workspaceId,
            actorType: "SYSTEM",
            action: "referral.entitlement.expired",
            entityType: "ReferralAccount",
            entityId: workspaceId,
            source: "referral.reconciliation",
            metadata: { expiredAt: now.toISOString() }
          }
        });
        return next;
      }
    }
    return workspace;
  });
}

export async function reconcileDueReferralEntitlements(now = new Date()): Promise<number> {
  const accounts = await prisma.referralAccount.findMany({
    where: {
      OR: [
        { plusExpiresAt: { lte: now } },
        { bankedDays: { gt: 0 } }
      ]
    },
    select: { workspaceId: true },
    take: 1000
  });
  let reconciled = 0;
  for (const account of accounts) {
    await reconcileWorkspaceReferralEntitlement(account.workspaceId, now);
    reconciled += 1;
  }
  return reconciled;
}

export async function getReferralDashboard(workspaceId: string): Promise<ReferralDashboard> {
  const account = await ensureWorkspaceReferralAccount(workspaceId);
  const [sent, received, earned, cappedCount] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerWorkspaceId: workspaceId },
      include: { rewards: { where: { recipient: "REFERRER" } } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.referral.findUnique({ where: { referredWorkspaceId: workspaceId } }),
    prisma.referralReward.aggregate({
      where: {
        workspaceId,
        recipient: "REFERRER",
        status: { in: ["ACTIVE", "BANKED", "CONSUMED"] }
      },
      _sum: { days: true }
    }),
    prisma.referralReward.count({ where: { workspaceId, recipient: "REFERRER", status: "CAPPED" } })
  ]);

  const referredWorkspaceIds = [...new Set(sent.map((item) => item.referredWorkspaceId))];
  const referredWorkspaces = referredWorkspaceIds.length
    ? await prisma.workspace.findMany({
        where: { id: { in: referredWorkspaceIds } },
        include: { owner: { select: { name: true, email: true } } }
      })
    : [];
  const referredById = new Map(referredWorkspaces.map((item) => [item.id, item]));
  let receivedFrom: ReferralDashboard["receivedFrom"] = null;
  if (received) {
    const referrer = await prisma.workspace.findUnique({
      where: { id: received.referrerWorkspaceId },
      include: { owner: { select: { name: true } } }
    });
    if (referrer) {
      receivedFrom = {
        workspaceName: referrer.name,
        ownerName: referrer.owner.name,
        qualifiedAt: received.qualifiedAt
      };
    }
  }

  const history: ReferralHistoryItem[] = sent.map((item) => {
    const referred = referredById.get(item.referredWorkspaceId);
    const reward = item.rewards[0] ?? null;
    return {
      id: item.id,
      codeUsed: item.codeUsed,
      status: item.status,
      qualifiedAt: item.qualifiedAt,
      createdAt: item.createdAt,
      referredWorkspaceName: referred?.name ?? "Deleted workspace",
      referredOwnerName: referred?.owner.name ?? "Unavailable",
      referredOwnerEmail: referred?.owner.email ?? "Unavailable",
      rewardStatus: reward?.status ?? null,
      rewardDays: reward?.days ?? 0,
      rewardStartsAt: reward?.startsAt ?? null,
      rewardEndsAt: reward?.endsAt ?? null
    };
  });
  const earnedDays = earned._sum.days ?? 0;
  return {
    account: {
      code: account.code,
      plusExpiresAt: account.plusExpiresAt,
      bankedDays: account.bankedDays
    },
    qualifiedCount: sent.filter((item) => item.status === "QUALIFIED").length,
    attributedCount: sent.filter((item) => item.status === "ATTRIBUTED").length,
    earnedDays,
    cappedCount,
    remainingRewardDays: Math.max(REFERRAL_MAX_REFERRER_DAYS - earnedDays, 0),
    history,
    receivedFrom
  };
}
