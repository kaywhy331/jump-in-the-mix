import type { Prisma } from "@/generated/prisma/client";

export type MixFavoriteTarget = { kind: "mix" | "template"; id: string };

export async function setMixFavorite(db: Prisma.TransactionClient, workspaceId: string, userId: string, target: MixFavoriteTarget, favorite: boolean) {
  const available = target.kind === "mix"
    ? await db.mix.findFirst({ where: { id: target.id, workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } })
    : await db.sharedMix.findFirst({ where: { id: target.id, status: "APPROVED" }, select: { id: true } });
  if (!available) throw new Error("This Mix is no longer available.");
  if (!await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } })) throw new Error("This workspace is no longer available.");
  if (favorite) {
    const data = { workspaceId, userId, ...(target.kind === "mix" ? { mixId: target.id } : { sharedMixId: target.id }) };
    await db.mixFavorite.upsert({ where: target.kind === "mix" ? { workspaceId_userId_mixId: { workspaceId, userId, mixId: target.id } } : { workspaceId_userId_sharedMixId: { workspaceId, userId, sharedMixId: target.id } }, create: data, update: {} });
  } else await db.mixFavorite.deleteMany({ where: { workspaceId, userId, ...(target.kind === "mix" ? { mixId: target.id } : { sharedMixId: target.id }) } });
  return { favorite };
}
