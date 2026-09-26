import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { saveMixAction } from "../src/lib/mix-editor-actions";

const CHANGED_ELSEWHERE = "This Mix was changed on another device after you opened it. Reload to compare, then apply your changes again.";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!local).sequential("a Mix saved from two devices", () => {
  let userId: string, workspaceId: string;
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `stale-mix-${randomUUID()}@example.test`, name: "Stale save fixture", passwordHash: "fixture-only" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Stale save fixture", profile: { create: {} } } }); workspaceId = workspace.id;
    session.context = { user, workspace, impersonation: null };
  });
  afterAll(async () => {
    if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
  });

  /** The editor's form: one field per Beat, in order, as MixEditor posts it. */
  const form = (input: { mixId?: string; openedAt?: string | null; name: string; beats: Array<{ id?: string; name: string; script: string }> }) => {
    const data = new FormData();
    if (input.mixId) data.set("mixId", input.mixId);
    if (input.openedAt) data.set("mixUpdatedAt", input.openedAt);
    for (const [key, value] of Object.entries({ name: input.name, status: "DRAFT", triggerMode: "MANUAL_START", workflowRevision: "0" })) data.set(key, value);
    for (const [index, beat] of input.beats.entries()) {
      for (const [key, value] of Object.entries({ mixStepId: beat.id ?? "", dayOffset: String(index), sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "" })) data.append(key, value);
      data.set(`inlineName-${index}`, beat.name); data.set(`inlineChannel-${index}`, "PHONE_CALL"); data.set(`inlineScript-${index}`, beat.script);
    }
    return data;
  };
  const read = (mixId: string) => prisma.mix.findUniqueOrThrow({ where: { id: mixId }, include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { stepVersion: { include: { stepTemplate: true } } } } } });
  const opened = (mix: { updatedAt: Date }) => mix.updatedAt.toISOString();

  it("refuses the second of two saves opened from the same version and keeps the first", async () => {
    await expect(saveMixAction(form({ name: "Estimate follow-up", beats: [{ name: "Call about the estimate", script: "Ask what they thought of the estimate." }] }))).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?created=manual/);
    const created = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Estimate follow-up" }, include: { steps: true } });
    const token = opened(created), first = created.steps[0].id;

    // The phone adds a Beat and saves.
    await expect(saveMixAction(form({ mixId: created.id, openedAt: token, name: "Estimate follow-up", beats: [{ id: first, name: "Call about the estimate", script: "Ask what they thought of the estimate." }, { name: "Check in a week later", script: "Ask whether they have decided." }] })))
      .rejects.toThrow(`redirect:/mixes/${created.id}/edit?updated=manual`);
    const phone = await read(created.id);
    expect(phone.steps.map(step => step.stepVersion.stepTemplate.name)).toEqual(["Call about the estimate", "Check in a week later"]);
    expect(opened(phone)).not.toBe(token);

    // The desktop tab, opened before that save, changes the wording: nothing is written and the phone's Beat stays.
    const [templates, audits, jobs] = await Promise.all([prisma.stepTemplate.count({ where: { workspaceId } }), prisma.auditLog.count({ where: { workspaceId, action: "mix.update" } }), prisma.job.count({ where: { workspaceId } })]);
    await expect(saveMixAction(form({ mixId: created.id, openedAt: token, name: "Estimate follow-up (desktop)", beats: [{ id: first, name: "Call about the estimate", script: "Reworded on the desktop." }] })))
      .resolves.toEqual({ error: CHANGED_ELSEWHERE });
    const kept = await read(created.id);
    expect(kept.name).toBe("Estimate follow-up");
    expect(kept.steps.map(step => [step.stepVersion.stepTemplate.name, step.stepVersion.script])).toEqual([["Call about the estimate", "Ask what they thought of the estimate."], ["Check in a week later", "Ask whether they have decided."]]);
    expect(opened(kept)).toBe(opened(phone));
    expect(await Promise.all([prisma.stepTemplate.count({ where: { workspaceId } }), prisma.auditLog.count({ where: { workspaceId, action: "mix.update" } }), prisma.job.count({ where: { workspaceId } })])).toEqual([templates, audits, jobs]);

    // The same stale token is refused every time until the owner reloads; the reloaded version saves.
    await expect(saveMixAction(form({ mixId: created.id, openedAt: token, name: "Estimate follow-up", beats: [{ id: first, name: "Call about the estimate", script: "Again from the desktop." }] })))
      .resolves.toEqual({ error: CHANGED_ELSEWHERE });
    await expect(saveMixAction(form({ mixId: created.id, openedAt: opened(kept), name: "Estimate follow-up", beats: [...kept.steps.map(step => ({ id: step.id, name: step.stepVersion.stepTemplate.name, script: step.stepVersion.script ?? "" })), { name: "Last check", script: "Close the loop." }] })))
      .rejects.toThrow("updated=manual");
    expect((await read(created.id)).steps).toHaveLength(3);
  });

  it("saves a form without the token, as an editor opened before this release posts it", async () => {
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Estimate follow-up" }, include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { stepVersion: { include: { stepTemplate: true } } } } } });
    await prisma.mix.update({ where: { id: mix.id }, data: { description: "Changed elsewhere" } });
    await expect(saveMixAction(form({ mixId: mix.id, openedAt: null, name: "Saved by an older tab", beats: mix.steps.map(step => ({ id: step.id, name: step.stepVersion.stepTemplate.name, script: step.stepVersion.script ?? "" })) })))
      .rejects.toThrow(`redirect:/mixes/${mix.id}/edit?updated=manual`);
    expect((await read(mix.id)).name).toBe("Saved by an older tab");
  });

  it("refuses a token that is not the saved version, whatever it holds", async () => {
    const mix = await read((await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Saved by an older tab" } })).id);
    const beats = mix.steps.map(step => ({ id: step.id, name: step.stepVersion.stepTemplate.name, script: step.stepVersion.script ?? "" }));
    for (const openedAt of ["not a date", new Date(mix.updatedAt.getTime() - 1).toISOString()]) {
      await expect(saveMixAction(form({ mixId: mix.id, openedAt, name: "Tampered", beats }))).resolves.toEqual({ error: CHANGED_ELSEWHERE });
    }
    expect((await read(mix.id)).name).toBe("Saved by an older tab");
  });
});
