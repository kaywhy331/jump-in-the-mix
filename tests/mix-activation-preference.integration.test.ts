import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { activateMixAction } from "../src/lib/mix-lifecycle-actions";
import { useSharedMixTemplateAction } from "../src/lib/shared-mix-use-actions";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("persisted Mix activation policy", () => {
  let userId: string, workspaceId: string;
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `activation-${randomUUID()}@example.test`, name: "Activation fixture", passwordHash: "fixture-only" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Activation fixture", profile: { create: {} } }, include: { profile: true } }); workspaceId = workspace.id;
    session.context = { user, workspace, impersonation: null };
  });
  afterAll(async () => { if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); } });
  const form = () => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ name: randomUUID(), status: "ACTIVE", triggerMode: "MANUAL_START", dayOffset: "0", mixStepId: "", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask about the estimate." })) data.set(key, value);
    return data;
  };
  it("requires review by default and ignores client claims that direct mode is enabled", async () => {
    const data = form(); data.set("reviewMixActivation", "false"); data.set("mixActivation", "DIRECT");
    await expect(saveMixAction(data)).rejects.toThrow("Review%20who%20gets%20the%20mix");
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
    data.set("sharedMixId", "fixture-missing-template");
    await expect(useSharedMixTemplateAction(data)).rejects.toThrow("Review%20who%20gets%20the%20mix");
  });
  it("allows confirmed activation in review mode and unconfirmed activation only with the saved direct preference", async () => {
    const reviewed = form(); reviewed.set("activationConfirmed", "1");
    await expect(saveMixAction(reviewed)).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?created=manual/);
    await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
    const direct = form();
    await expect(saveMixAction(direct)).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?created=manual/);
    expect(await prisma.mix.count({ where: { workspaceId, status: "ACTIVE" } })).toBe(2);
  });
  it("routes list activation through review when the preference changes back", async () => {
    await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: true } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Paused fixture", status: "PAUSED", triggerMode: "MANUAL_START" } });
    const data = new FormData(); data.set("mixId", mix.id);
    await expect(activateMixAction(data)).rejects.toThrow(`redirect:/mixes/${mix.id}/edit?activate=1`);
    expect((await prisma.mix.findUniqueOrThrow({ where: { id: mix.id } })).status).toBe("PAUSED");
  });
});
