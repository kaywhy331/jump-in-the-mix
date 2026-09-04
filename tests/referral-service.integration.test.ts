import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  createReferralAccountInTransaction,
  createReferralAttributionInTransaction,
  getReferralDashboard,
  reconcileWorkspaceReferralEntitlement
} from "../src/lib/referral-service";

async function createWorkspace(input: { suffix: string; label: string; planTier?: "FREE" | "PLUS" | "PRO" }) {
  const user = await prisma.user.create({
    data: {
      email: `referral-${input.label}-${input.suffix}@example.com`,
      name: `Referral ${input.label}`,
      passwordHash: "test-only",
      emailVerifiedAt: new Date()
    }
  });
  const workspace = await prisma.workspace.create({
    data: {
      name: `${input.label} Workspace`,
      slug: `referral-${input.label.toLowerCase()}-${input.suffix}`,
      ownerId: user.id,
      planTier: input.planTier ?? "FREE",
      members: { create: { userId: user.id, role: "OWNER" } },
      profile: { create: {} }
    }
  });
  const account = await prisma.$transaction((tx) => createReferralAccountInTransaction(tx, workspace.id));
  return { user, workspace, account };
}

describe.sequential("referral rewards and entitlement reconciliation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  let referrer: Awaited<ReturnType<typeof createWorkspace>>;

  beforeAll(async () => {
    referrer = await createWorkspace({ suffix, label: "Referrer" });
    userIds.push(referrer.user.id);
    workspaceIds.push(referrer.workspace.id);
  });

  afterAll(async () => {
    if (workspaceIds.length) {
      await prisma.referralReward.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.referral.deleteMany({
        where: {
          OR: [
            { referrerWorkspaceId: { in: workspaceIds } },
            { referredWorkspaceId: { in: workspaceIds } }
          ]
        }
      });
      await prisma.referralAccount.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("qualifies a verified signup and grants both workspaces 30 Plus days", async () => {
    const friend = await createWorkspace({ suffix, label: "FriendOne" });
    userIds.push(friend.user.id);
    workspaceIds.push(friend.workspace.id);

    const referral = await prisma.$transaction((tx) => createReferralAttributionInTransaction(tx, {
      code: referrer.account.code,
      referrerWorkspaceId: referrer.workspace.id,
      referredWorkspaceId: friend.workspace.id,
      qualifyImmediately: true
    }));

    const [saved, referrerWorkspace, friendWorkspace, dashboard] = await Promise.all([
      prisma.referral.findUniqueOrThrow({ where: { id: referral.id }, include: { rewards: true } }),
      prisma.workspace.findUniqueOrThrow({ where: { id: referrer.workspace.id } }),
      prisma.workspace.findUniqueOrThrow({ where: { id: friend.workspace.id } }),
      getReferralDashboard(referrer.workspace.id)
    ]);

    expect(saved.status).toBe("QUALIFIED");
    expect(saved.rewards).toHaveLength(2);
    expect(saved.rewards.every((reward) => reward.status === "ACTIVE")).toBe(true);
    expect(referrerWorkspace.planTier).toBe("PLUS");
    expect(friendWorkspace.planTier).toBe("PLUS");
    expect(dashboard.qualifiedCount).toBe(1);
    expect(dashboard.earnedDays).toBe(30);
    expect(dashboard.account.plusExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 28 * 24 * 60 * 60 * 1000);
  });

  it("banks active and newly earned rewards for Pro, then resumes them after paid access ends", async () => {
    await prisma.workspace.update({
      where: { id: referrer.workspace.id },
      data: {
        planTier: "PRO",
        subscriptionStatus: "ACTIVE",
        stripeSubscriptionId: `sub_referral_${suffix}`
      }
    });
    const friend = await createWorkspace({ suffix, label: "FriendTwo" });
    userIds.push(friend.user.id);
    workspaceIds.push(friend.workspace.id);

    await prisma.$transaction((tx) => createReferralAttributionInTransaction(tx, {
      code: referrer.account.code,
      referrerWorkspaceId: referrer.workspace.id,
      referredWorkspaceId: friend.workspace.id,
      qualifyImmediately: true
    }));

    const banked = await prisma.referralAccount.findUniqueOrThrow({ where: { workspaceId: referrer.workspace.id } });
    const bankedRewards = await prisma.referralReward.findMany({
      where: { workspaceId: referrer.workspace.id, recipient: "REFERRER", status: "BANKED" }
    });
    expect(banked.plusExpiresAt).toBeNull();
    expect(banked.bankedDays).toBe(60);
    expect(bankedRewards).toHaveLength(2);
    expect(bankedRewards.every((reward) => reward.days === 30)).toBe(true);

    await prisma.workspace.update({
      where: { id: referrer.workspace.id },
      data: {
        planTier: "FREE",
        subscriptionStatus: "CANCELED",
        stripeSubscriptionId: null
      }
    });
    await reconcileWorkspaceReferralEntitlement(referrer.workspace.id);

    const [activatedWorkspace, activatedAccount, activeRewards] = await Promise.all([
      prisma.workspace.findUniqueOrThrow({ where: { id: referrer.workspace.id } }),
      prisma.referralAccount.findUniqueOrThrow({ where: { workspaceId: referrer.workspace.id } }),
      prisma.referralReward.findMany({ where: { workspaceId: referrer.workspace.id, recipient: "REFERRER", status: "ACTIVE" } })
    ]);
    expect(activatedWorkspace.planTier).toBe("PLUS");
    expect(activatedAccount.bankedDays).toBe(0);
    expect(activatedAccount.plusExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 58 * 24 * 60 * 60 * 1000);
    expect(activeRewards).toHaveLength(2);
  });

  it("expires referral Plus safely and applies Free plan safeguards", async () => {
    const activeMixIds: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const mix = await prisma.mix.create({
        data: {
          workspaceId: referrer.workspace.id,
          name: `Referral expiry mix ${index}`,
          triggerMode: "MANUAL_START",
          status: "ACTIVE",
          source: "USER"
        }
      });
      activeMixIds.push(mix.id);
    }
    await prisma.referralReward.updateMany({
      where: { workspaceId: referrer.workspace.id, status: "ACTIVE" },
      data: { endsAt: new Date(Date.now() - 60_000) }
    });
    await prisma.referralAccount.update({
      where: { workspaceId: referrer.workspace.id },
      data: { plusExpiresAt: new Date(Date.now() - 60_000), bankedDays: 0 }
    });
    await prisma.workspace.update({
      where: { id: referrer.workspace.id },
      data: { planTier: "PLUS", subscriptionStatus: "CANCELED", stripeSubscriptionId: null }
    });

    await reconcileWorkspaceReferralEntitlement(referrer.workspace.id);
    const [workspace, activeMixCount, pausedMixCount] = await Promise.all([
      prisma.workspace.findUniqueOrThrow({ where: { id: referrer.workspace.id } }),
      prisma.mix.count({ where: { id: { in: activeMixIds }, status: "ACTIVE" } }),
      prisma.mix.count({ where: { id: { in: activeMixIds }, status: "PAUSED" } })
    ]);
    expect(workspace.planTier).toBe("FREE");
    expect(activeMixCount).toBe(3);
    expect(pausedMixCount).toBe(1);
  });
});
