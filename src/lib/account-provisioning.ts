import type { Prisma } from "@/generated/prisma/client";
import { claimAccessInvite } from "@/lib/referral-access";
import { slugify } from "@/lib/slug";

export async function createBusinessAccount(
  tx: Prisma.TransactionClient,
  input: { email: string; name: string; passwordHash: string | null; emailVerifiedAt: Date | null; accessToken?: string }
) {
  const inviteId = await claimAccessInvite(tx, input.accessToken, input.email);
  const user = await tx.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      emailVerifiedAt: input.emailVerifiedAt
    },
    select: { id: true, email: true, name: true }
  });
  if (inviteId) await tx.referralAccessInvite.update({ where: { id: inviteId }, data: { acceptedUserId: user.id } });
  await tx.waitlistEntry.updateMany({ where: { email: input.email.trim().toLowerCase(), status: { not: "WITHDRAWN" } }, data: { status: "JOINED", joinedAt: new Date() } });
  const workspace = await tx.workspace.create({
    data: {
      name: `${input.name}'s connections`,
      slug: `${slugify(input.name) || "business"}-${user.id.slice(-7)}`,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      profile: { create: {} },
      groups: {
        create: [
          { name: "New connections", description: "People you’re getting to know." },
          { name: "Keep in touch", description: "Relationships you want to keep growing." },
          { name: "Introductions", description: "People introduced by your network." }
        ]
      }
    },
    select: { id: true }
  });
  await tx.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
  await tx.workspacePreference.create({ data: { workspaceId: workspace.id } });
  await tx.notificationPreference.create({ data: { workspaceId: workspace.id, userId: user.id, emailDigestEnabled: false, weeklyReportEnabled: false } });
  return { ...user, workspaceId: workspace.id };
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Account owner";
  const words = local.replace(/[._+-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return name.slice(0, 120) || "Account owner";
}
