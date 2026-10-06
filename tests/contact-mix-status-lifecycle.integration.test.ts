import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The No Mix status through the owner's real Mix actions and the worker's preparation pass
// (JITM-09 §2.76). The worker is not running here: `prepareQueued` does what src/worker/index.ts
// does with each generate-jumps job, so each step can be checked before and after preparation.
const session = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { contactMixStatus } from "../src/lib/contact-mix-status";
import { generateJumps } from "../src/lib/jump-engine";
import { saveMixAction } from "../src/lib/mix-editor-actions";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const day = 86_400_000;

describe.skipIf(!local).sequential("No Mix status as Mixes are saved, paused and resumed", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  let userId = "", workspaceId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `no-mix-lifecycle-${suffix}@example.test`, name: "Lifecycle owner", passwordHash: "fixture-only" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { ownerId: userId, slug: `no-mix-lifecycle-${suffix}`, name: "Lifecycle fixture", profile: { create: {} } } }); workspaceId = workspace.id;
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.userPreference.create({ data: { userId, timezone: "UTC", reviewMixActivation: false } });
    session.context = { session: { authUser: user }, user, workspace, impersonation: null };
  });
  afterAll(async () => {
    if (workspaceId) { await prisma.contactActivity.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: workspaceId } }); }
    if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
  });

  const status = (contactId: string) => contactMixStatus(workspaceId, contactId);
  const person = async (name: string) => (await prisma.contact.create({ data: { workspaceId, displayName: `${name} ${suffix}`, phones: { create: { phone: "(555) 010-0199", normalized: "+15550100199", isPrimary: true } } } })).id;
  /** One worker pass over every queued preparation job, as src/worker/index.ts runs them. */
  async function prepareQueued() {
    for (const job of await prisma.job.findMany({ where: { workspaceId, task: "generate-jumps", completedAt: null, failedAt: null }, orderBy: { createdAt: "asc" } })) {
      const payload = job.payload as { contactId?: string; mixId?: string };
      await generateJumps({ workspaceId, contactId: payload.contactId, mixId: payload.mixId });
      await prisma.job.update({ where: { id: job.id }, data: { completedAt: new Date() } });
    }
  }
  /** The Mix editor's form, as MixEditor posts it: one call Beat per entry, on the days given. */
  function mixForm(input: { mixId?: string; openedAt?: Date; name: string; everyone?: boolean; groupIds?: string[]; beats: Array<{ id?: string; script: string; day: number }> }) {
    const data = new FormData();
    if (input.mixId) data.set("mixId", input.mixId);
    if (input.openedAt) data.set("mixUpdatedAt", input.openedAt.toISOString());
    for (const [key, value] of Object.entries({ name: input.name, status: "ACTIVE", activationConfirmed: "1", triggerMode: "MANUAL_START", workflowRevision: "0" })) data.set(key, value);
    if (input.everyone) data.set("assignAllContacts", "on");
    for (const groupId of input.groupIds ?? []) data.append("groupIds", groupId);
    for (const [index, beat] of input.beats.entries()) {
      for (const [key, value] of Object.entries({ mixStepId: beat.id ?? "", dayOffset: String(beat.day), sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "" })) data.append(key, value);
      data.set(`inlineName-${index}`, `Call ${index + 1}`); data.set(`inlineChannel-${index}`, "PHONE_CALL"); data.set(`inlineScript-${index}`, beat.script);
    }
    return data;
  }
  async function save(form: FormData) {
    await expect(saveMixAction(form)).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?(created|updated)=manual/);
  }

  it("keeps someone who finished a Mix at No Mix when the Mix is saved again (DEF-01)", async () => {
    const finisher = await person("Finisher");
    await save(mixForm({ name: `Everyone check-in ${suffix}`, everyone: true, beats: [{ script: "Check in.", day: 0 }] }));
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: `Everyone check-in ${suffix}` }, include: { steps: { where: { isActive: true } } } });
    await prepareQueued();
    expect(await status(finisher)).toBe("in-mix");
    await prisma.jump.updateMany({ where: { workspaceId, contactId: finisher, mixId: mix.id, status: "PENDING" }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:sent" } });
    expect(await status(finisher)).toBe("no-mix");

    // A wording-only save rewrites every Everyone assignment and queues the whole Mix.
    await save(mixForm({ mixId: mix.id, openedAt: (await prisma.mix.findUniqueOrThrow({ where: { id: mix.id } })).updatedAt, name: mix.name, everyone: true, beats: [{ id: mix.steps[0].id, script: "Check in, reworded.", day: 0 }] }));
    expect(await prisma.job.count({ where: { workspaceId, completedAt: null, payload: { path: ["mixId"], equals: mix.id } } })).toBe(1);
    expect(await status(finisher)).toBe("no-mix");
    await prepareQueued();
    expect(await status(finisher)).toBe("no-mix");
  });

  it("counts the people of an existing tag while a Mix added to it prepares their Beats (DEF-01)", async () => {
    const member = await person("Member");
    const group = await prisma.group.create({ data: { workspaceId, name: `Kitchens ${suffix}`, memberships: { create: { contactId: member, createdAt: new Date(Date.now() - 30 * day) } } } });
    expect(await status(member)).toBe("no-mix");
    await save(mixForm({ name: `Kitchen follow-up ${suffix}`, groupIds: [group.id], beats: [{ script: "Ask about the kitchen.", day: 0 }, { script: "Check in again.", day: 14 }] }));
    // Before the worker has prepared anything, the tag's people read as in the Mix.
    expect(await prisma.jump.count({ where: { workspaceId, contactId: member } })).toBe(0);
    expect(await status(member)).toBe("in-mix");
    await prepareQueued();
    expect(await prisma.jump.count({ where: { workspaceId, contactId: member, status: "PENDING" } })).toBe(2);
    expect(await status(member)).toBe("in-mix");
  });
});
