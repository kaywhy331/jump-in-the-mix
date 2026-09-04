import type { Prisma } from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";

export async function createBusinessAccount(
  tx: Prisma.TransactionClient,
  input: { email: string; name: string; passwordHash: string | null; emailVerifiedAt: Date | null }
) {
  const user = await tx.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      emailVerifiedAt: input.emailVerifiedAt
    },
    select: { id: true, email: true, name: true }
  });
  const workspace = await tx.workspace.create({
    data: {
      name: `${input.name}'s business`,
      slug: `${slugify(input.name) || "business"}-${user.id.slice(-7)}`,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      profile: { create: {} },
      groups: {
        create: [
          { name: "Leads", description: "People who may become customers." },
          { name: "Clients", description: "Active customer relationships." },
          { name: "Referrals", description: "People introduced by your network." }
        ]
      }
    },
    select: { id: true }
  });
  await tx.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
  await tx.workspacePreference.create({ data: { workspaceId: workspace.id } });
  await tx.notificationPreference.create({ data: { workspaceId: workspace.id, userId: user.id } });
  return { ...user, workspaceId: workspace.id };
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Business owner";
  const words = local.replace(/[._+-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return name.slice(0, 120) || "Business owner";
}
