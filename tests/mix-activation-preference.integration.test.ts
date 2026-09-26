import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { activateMixAction } from "../src/lib/mix-lifecycle-actions";
import { useSharedMixTemplateAction } from "../src/lib/shared-mix-use-actions";
import { viewerErrorMessage } from "../src/lib/form-errors";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("persisted Mix activation policy", () => {
  let userId: string, workspaceId: string;
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `activation-${randomUUID()}@example.test`, name: "Activation fixture", passwordHash: "fixture-only" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Activation fixture", profile: { create: {} } }, include: { profile: true } }); workspaceId = workspace.id;
    session.context = { session: { authUser: user }, user, workspace, impersonation: null };
  });
  afterAll(async () => { if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); } });
  /** The message the refused action's page shows its signed-in owner. */
  const refusal = async (action: Promise<unknown>) => {
    const location = await action.then(() => { throw new Error("Expected a redirect"); }, (error: Error) => { if (!error.message.startsWith("redirect:")) throw error; return error.message.slice("redirect:".length); });
    return viewerErrorMessage(Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams), { authUser: { id: userId } });
  };
  const form = () => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ name: randomUUID(), status: "ACTIVE", triggerMode: "MANUAL_START", dayOffset: "0", mixStepId: "", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask about the estimate." })) data.set(key, value);
    return data;
  };
  it("requires review by default and ignores client claims that direct mode is enabled", async () => {
    const data = form(); data.set("reviewMixActivation", "false"); data.set("mixActivation", "DIRECT");
    expect(await refusal(saveMixAction(data))).toBe("Review who gets the mix before turning it on.");
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
    data.set("sharedMixId", "fixture-missing-template");
    expect(await refusal(useSharedMixTemplateAction(data))).toBe("Review who gets the mix before turning it on.");
  });
  it("allows confirmed activation in review mode and unconfirmed activation only with the saved direct preference", async () => {
    const reviewed = form(); reviewed.set("activationConfirmed", "1");
    await expect(saveMixAction(reviewed)).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?created=manual/);
    await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
    const direct = form();
    await expect(saveMixAction(direct)).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?created=manual/);
    expect(await prisma.mix.count({ where: { workspaceId, status: "ACTIVE" } })).toBe(2);
  });
  it("saves a completion trigger without an audience and enables it when the Mix starts", async () => {
    const source = await prisma.mix.findFirstOrThrow({ where: { workspaceId, status: "ACTIVE" } });
    const data = form(); data.set("name", "After another Mix"); data.set("status", "DRAFT"); data.set("triggerMode", "AFTER_MIX"); data.set("completionSourceId", source.id); data.set("workflowRevision", "0");
    await expect(saveMixAction(data)).rejects.toThrow(/redirect:.*created=manual/);
    const target = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "After another Mix" } });
    expect(await prisma.mixAssignment.count({ where: { mixId: target.id } })).toBe(0);
    const saved = await prisma.mixWorkflow.findUniqueOrThrow({ where: { workspaceId } });
    expect((saved.configuration as unknown as { rules: Array<{ enabled: boolean }> }).rules[0].enabled).toBe(false);
    const start = new FormData(); start.set("mixId", target.id);
    await expect(activateMixAction(start)).rejects.toThrow("redirect:/mixes?activated=1");
    const active = await prisma.mixWorkflow.findUniqueOrThrow({ where: { workspaceId } });
    expect((active.configuration as unknown as { rules: Array<{ enabled: boolean }> }).rules[0].enabled).toBe(true);
  });
  it("routes list activation through review when the preference changes back", async () => {
    await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: true } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Paused fixture", status: "PAUSED", triggerMode: "MANUAL_START" } });
    const data = new FormData(); data.set("mixId", mix.id);
    await expect(activateMixAction(data)).rejects.toThrow(`redirect:/mixes/${mix.id}/edit?activate=1`);
    expect((await prisma.mix.findUniqueOrThrow({ where: { id: mix.id } })).status).toBe("PAUSED");
  });
  it("shows the Journey's own refusal when a completion trigger is saved against an older Journey", async () => {
    const source = await prisma.mix.findFirstOrThrow({ where: { workspaceId, status: "ACTIVE" } });
    const stale = form(); stale.set("name", "Saved against an old Journey"); stale.set("status", "DRAFT"); stale.set("triggerMode", "AFTER_MIX"); stale.set("completionSourceId", source.id); stale.set("workflowRevision", "0");
    expect(await refusal(saveMixAction(stale))).toBe("Journey changed in another window. Reload its latest configuration before saving; your draft has been kept.");
    expect(await prisma.mix.count({ where: { workspaceId, name: "Saved against an old Journey" } })).toBe(0);
  });
});
