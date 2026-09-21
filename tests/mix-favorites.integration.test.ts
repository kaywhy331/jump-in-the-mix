import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMixFavorite } from "@/lib/mix-favorites";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("personal Mix favorites", () => {
  let userId = "", otherId = "", workspaceId = "", mixId = "", templateId = "";
  beforeEach(async () => {
    userId = otherId = workspaceId = mixId = templateId = "";
    userId = (await prisma.user.create({ data: { name: "Favorite fixture", email: `favorite-${randomUUID()}@example.invalid` } })).id;
    otherId = (await prisma.user.create({ data: { name: "Favorite fixture", email: `favorite-other-${randomUUID()}@example.invalid` } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Favorites fixture", slug: randomUUID(), members: { create: [{ userId, role: "OWNER" }, { userId: otherId, role: "OWNER" }] } } })).id;
    mixId = (await prisma.mix.create({ data: { workspaceId, name: "Favorite Mix", status: "DRAFT", triggerMode: "MANUAL_START" } })).id;
    templateId = (await prisma.sharedMix.create({ data: { title: "Favorite ready-made", description: "Synthetic", category: "Relationships", durationDays: 0, steps: [], status: "APPROVED" } })).id;
  });
  afterEach(async () => { if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (templateId) await prisma.sharedMix.deleteMany({ where: { id: templateId } }); await prisma.user.deleteMany({ where: { id: { in: [userId, otherId].filter(Boolean) } } }); });
  afterAll(() => prisma.$disconnect());
  const set = (kind: "mix" | "template", id: string, favorite = true, person = userId) => prisma.$transaction(db => setMixFavorite(db, workspaceId, person, { kind, id }, favorite));
  it("persists favorites per user and acknowledges duplicate requests", async () => {
    await set("mix", mixId); await set("mix", mixId); await set("mix", mixId, true, otherId);
    expect(await prisma.mixFavorite.count({ where: { workspaceId } })).toBe(2);
    await set("mix", mixId, false); await set("mix", mixId, false);
    expect(await prisma.mixFavorite.findMany({ where: { workspaceId }, select: { userId: true } })).toEqual([{ userId: otherId }]);
    expect((await prisma.mix.findUniqueOrThrow({ where: { id: mixId } })).status).toBe("DRAFT");
  });
  it("supports the shared library and rejects unpublished or archived targets", async () => {
    await set("template", templateId);
    expect(await prisma.mixFavorite.count({ where: { workspaceId, userId, sharedMixId: templateId } })).toBe(1);
    await prisma.sharedMix.update({ where: { id: templateId }, data: { status: "UNPUBLISHED" } });
    await expect(set("template", templateId)).rejects.toThrow("no longer available");
    await prisma.mix.update({ where: { id: mixId }, data: { status: "ARCHIVED" } });
    await expect(set("mix", mixId)).rejects.toThrow("no longer available");
  });
  it("blocks foreign Mixes and users who are no longer workspace members", async () => {
    const elsewhere = await prisma.workspace.create({ data: { ownerId: otherId, name: "Elsewhere", slug: randomUUID() } });
    try {
      const foreign = await prisma.mix.create({ data: { workspaceId: elsewhere.id, name: "Private", triggerMode: "MANUAL_START" } });
      await expect(set("mix", foreign.id)).rejects.toThrow("no longer available");
      await prisma.workspaceMember.deleteMany({ where: { workspaceId, userId: otherId } });
      await expect(set("mix", mixId, true, otherId)).rejects.toThrow("workspace is no longer available");
      expect(await prisma.mixFavorite.count({ where: { workspaceId } })).toBe(0);
    } finally { await prisma.workspace.delete({ where: { id: elsewhere.id } }); }
  });
  it("removes favorites when their target, user or workspace is deleted", async () => {
    await set("mix", mixId); await set("template", templateId);
    await prisma.mix.delete({ where: { id: mixId } }); expect(await prisma.mixFavorite.count({ where: { workspaceId } })).toBe(1);
    await prisma.sharedMix.delete({ where: { id: templateId } }); expect(await prisma.mixFavorite.count({ where: { workspaceId } })).toBe(0);
  });
});
