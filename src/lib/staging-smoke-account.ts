import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * The synthetic account the authenticated staging smoke signs in with. It is only ever created or
 * reset against the approved staging target, and an existing account is reset only when it is
 * positively the synthetic one: no operator status, one owned workspace carrying this marker,
 * and no other membership. Anything else is refused before any write.
 */
export const APPROVED_STAGING_TARGETS = ["https://jump-in-the-mix-test.netlify.app"] as const;
export const SMOKE_ACCOUNT_NAME = "Staging smoke (synthetic)";
export const SMOKE_WORKSPACE_NAME = "Staging smoke workspace";
export const SMOKE_WORKSPACE_SLUG_PREFIX = "staging-smoke-";

export class StagingSmokeAccountError extends Error {
  constructor(message: string) { super(message); this.name = "StagingSmokeAccountError"; }
}

export function assertApprovedStagingTarget(target: string | undefined): string {
  const normalized = target?.trim().replace(/\/+$/, "") ?? "";
  if (!(APPROVED_STAGING_TARGETS as readonly string[]).includes(normalized)) {
    throw new StagingSmokeAccountError(`STAGING_SMOKE_TARGET must name the approved staging site (${APPROVED_STAGING_TARGETS.join(", ")}); nothing was changed.`);
  }
  return normalized;
}

export function validateStagingSmokeCredentials(email: string | undefined, password: string | undefined): { email: string; password: string } {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) throw new StagingSmokeAccountError("STAGING_SMOKE_USER_EMAIL must be a valid address.");
  if (!password || password.length < 24 || password.length > 72) throw new StagingSmokeAccountError("STAGING_SMOKE_USER_PASSWORD must be 24 to 72 characters.");
  return { email: normalized, password };
}

type Db = Pick<PrismaClient, "user" | "$transaction">;

/** Why an existing account is not the synthetic one. Any reason refuses the reset without writes. */
export async function syntheticAccountMismatch(tx: Prisma.TransactionClient | Db, userId: string): Promise<string | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      name: true, isPlatformAdmin: true, staffMembership: { select: { id: true } }, authIdentities: { select: { id: true } },
      ownedWorkspaces: { select: { id: true, name: true, slug: true, _count: { select: { contacts: true, members: true } } } },
      memberships: { select: { workspaceId: true } }
    }
  });
  if (!user) return "the account no longer exists";
  if (user.isPlatformAdmin || user.staffMembership) return "the account has operator access";
  if (user.name !== SMOKE_ACCOUNT_NAME) return "the account's name is not the synthetic marker";
  if (user.authIdentities.length) return "the account has a linked sign-in provider";
  if (user.ownedWorkspaces.length !== 1) return "the account does not own exactly one workspace";
  const [workspace] = user.ownedWorkspaces;
  if (workspace.name !== SMOKE_WORKSPACE_NAME || !workspace.slug.startsWith(SMOKE_WORKSPACE_SLUG_PREFIX)) return "the account's workspace is not the synthetic one";
  if (workspace._count.members !== 1 || user.memberships.some((membership) => membership.workspaceId !== workspace.id)) return "the account shares a workspace with someone";
  if (workspace._count.contacts) return "the account's workspace holds contacts";
  return null;
}

export type SeedStagingSmokeAccountResult = { outcome: "created"; userId: string; workspaceId: string } | { outcome: "reset"; userId: string; workspaceId: string };

/**
 * Creates the synthetic account, or resets its password when it already exists and is positively
 * the synthetic one. An ordinary account at the same address is refused with nothing written.
 */
export async function seedStagingSmokeAccount(db: Db, input: { target: string | undefined; email: string | undefined; password: string | undefined; hash: (password: string) => Promise<string> }): Promise<SeedStagingSmokeAccountResult> {
  assertApprovedStagingTarget(input.target);
  const { email, password } = validateStagingSmokeCredentials(input.email, input.password);
  const passwordHash = await input.hash(password);
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      const mismatch = await syntheticAccountMismatch(tx, existing.id);
      if (mismatch) throw new StagingSmokeAccountError(`An account already uses this address and ${mismatch}; it was not changed. Choose an address that belongs only to the synthetic smoke account.`);
      const workspace = await tx.workspace.findFirstOrThrow({ where: { ownerId: existing.id }, select: { id: true } });
      await tx.user.update({ where: { id: existing.id }, data: { passwordHash, emailVerifiedAt: new Date() } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      return { outcome: "reset" as const, userId: existing.id, workspaceId: workspace.id };
    }
    const user = await tx.user.create({ data: { email, name: SMOKE_ACCOUNT_NAME, passwordHash, emailVerifiedAt: new Date() }, select: { id: true } });
    const workspace = await tx.workspace.create({
      data: {
        name: SMOKE_WORKSPACE_NAME,
        slug: `${SMOKE_WORKSPACE_SLUG_PREFIX}${user.id.slice(-7)}`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
        profile: { create: { onboardingDone: true } }
      },
      select: { id: true }
    });
    await tx.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
    await tx.workspacePreference.create({ data: { workspaceId: workspace.id } });
    await tx.notificationPreference.create({ data: { workspaceId: workspace.id, userId: user.id, emailDigestEnabled: false, weeklyReportEnabled: false } });
    return { outcome: "created" as const, userId: user.id, workspaceId: workspace.id };
  });
}
