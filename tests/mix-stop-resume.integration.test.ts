import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Stop and Resume for one person through the owner's real actions and the worker's passes (TRU-02): Resume brings
// back the Beats its Stop cancelled. The worker is not running here: `prepareQueued` does what src/worker/index.ts
// does with each generate-jumps job, and Journey work is processed directly.
const session = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { contactMixStatus } from "../src/lib/contact-mix-status";
import { generateJumps } from "../src/lib/jump-engine";
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { processWorkflowInstance, startWorkflowInstance } from "../src/lib/mix-workflow";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { initialJourneySetup } from "../src/lib/journey-preferences";
import { resumeMixForContactAction, stopMixForContactAction } from "../src/lib/mix-stop-actions";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const day = 86_400_000;

describe.skipIf(!local).sequential("Stop and Resume for one person", () => {
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
  function fields(entries: Record<string, string | string[]>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
    return data;
  }
  /** Runs an action and returns where it sent the owner. */
  async function redirected(action: Promise<unknown>): Promise<URL> {
    try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("redirect:")) return new URL(error.message.slice("redirect:".length), "https://app.invalid"); throw error; }
    throw new Error("The action finished without redirecting.");
  }

  const pending = (contactId: string) => prisma.jump.findMany({ where: { workspaceId, contactId, status: "PENDING" }, orderBy: { scheduledAt: "asc" }, select: { id: true, scheduledAt: true } });
  const stop = (contactId: string, mixId: string) => redirected(stopMixForContactAction(fields({ contactId, mixId, returnTo: `/contacts/${contactId}` })));
  const resume = (contactId: string, mixId: string) => redirected(resumeMixForContactAction(fields({ contactId, mixId, returnTo: `/contacts/${contactId}` })));

  it("brings back a running Mix's Beats, with their original dates, after Stop then Resume", async () => {
    await save(mixForm({ name: `Quote check-in ${suffix}`, beats: [{ script: "First call.", day: 0 }, { script: "Two weeks on.", day: 14 }] }));
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: `Quote check-in ${suffix}` } });
    const someone = await person("Someone");
    // Started yesterday, so the first Beat is a day late.
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: mix.id, contactId: someone, assignmentKey: `${workspaceId}:${mix.id}:${someone}`, startDate: new Date(Date.now() - day) } });
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId: someone, mixId: mix.id } } });
    await prepareQueued();
    const before = await pending(someone);
    expect(before).toHaveLength(2);
    expect((await stop(someone, mix.id)).search).toBe("?mixStopped=1");
    expect(await pending(someone)).toEqual([]);
    expect(await status(someone)).toBe("no-mix");
    // While stopped, a preparation pass brings nothing back.
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId: someone, mixId: mix.id } } });
    await prepareQueued();
    expect(await pending(someone)).toEqual([]);
    expect((await resume(someone, mix.id)).search).toBe("?mixResumed=1");
    await prepareQueued();
    expect(await pending(someone)).toEqual(before);
    expect(await status(someone)).toBe("in-mix");
    // The Beat already due comes back for the owner to send or skip, never by automatic sending (JITM-09 §2.72);
    // automatic delivery passes over manual-only rows (src/lib/automatic-delivery.ts). The later Beat sends as before.
    const flags = await prisma.jump.findMany({ where: { workspaceId, contactId: someone, status: "PENDING" }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true, manualOnly: true } });
    expect(flags.map(row => [row.scheduledAt < new Date(), row.manualOnly])).toEqual([[true, true], [false, false]]);
  });

  it("brings back the Beats a tag runs for them", async () => {
    const tagged = await person("Tagged");
    const group = await prisma.group.create({ data: { workspaceId, name: `Customers ${suffix}`, memberships: { create: { contactId: tagged } } } });
    await save(mixForm({ name: `Aftercare ${suffix}`, groupIds: [group.id], beats: [{ script: "How is it holding up?", day: 2 }] }));
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: `Aftercare ${suffix}` } });
    await prepareQueued();
    const before = await pending(tagged);
    expect(before).toHaveLength(1);
    await stop(tagged, mix.id);
    expect(await pending(tagged)).toEqual([]);
    await resume(tagged, mix.id);
    await prepareQueued();
    expect(await pending(tagged)).toEqual(before);
  });

  it("leaves a stage change's cancelled Beats ended: Resume only lifts that stop", async () => {
    await save(mixForm({ name: `Lead nurture ${suffix}`, beats: [{ script: "Checking in.", day: 3 }] }));
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: `Lead nurture ${suffix}` }, include: { steps: true } });
    const moved = await person("Moved");
    // What a stage change leaves (src/lib/journey.ts): the start ended, a stop, and the Beat cancelled.
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: mix.id, contactId: moved, assignmentKey: `${workspaceId}:${mix.id}:${moved}`, startDate: new Date(), isActive: false } });
    await prisma.mixStop.create({ data: { workspaceId, mixId: mix.id, contactId: moved, reason: "journey.stage.exit" } });
    const when = new Date(Date.now() + 3 * day), key = `stage-exit-${suffix}`;
    await prisma.jump.create({ data: { id: key, workspaceId, contactId: moved, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: mix.steps[0].stepVersionId, scheduledAt: when, baseScheduledAt: when, status: "CANCELED", completionMethod: "journey_stage_changed", reason: "Lead nurture", uniquenessKey: key, templateSnapshot: {}, renderedSnapshot: {} } });
    await resume(moved, mix.id);
    await prepareQueued();
    expect(await pending(moved)).toEqual([]);
    expect(await prisma.mixStop.count({ where: { workspaceId, contactId: moved } })).toBe(0);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: key } })).completionMethod).toBe("journey_stage_changed");
  });

  it("brings back Journey work's Beats after Stop then Resume", async () => {
    await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1, setup: initialJourneySetup(null, "UTC") });
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Estimate follow-up" } });
    const client = await person("Client");
    const instanceId = await startWorkflowInstance({ workspaceId, contactId: client, mixId: mix.id, requestId: randomUUID(), label: "Kitchen estimate" });
    await processWorkflowInstance(workspaceId, instanceId, new Date());
    const before = await pending(client);
    expect(before.length).toBeGreaterThan(0);
    await stop(client, mix.id);
    await processWorkflowInstance(workspaceId, instanceId, new Date());
    expect(await pending(client)).toEqual([]);
    await resume(client, mix.id);
    expect(await prisma.job.count({ where: { workspaceId, task: "mix-workflow", completedAt: null, payload: { path: ["instanceId"], equals: instanceId } } })).toBeGreaterThan(0);
    await processWorkflowInstance(workspaceId, instanceId, new Date());
    expect((await pending(client)).map(item => item.id)).toEqual(before.map(item => item.id));
  });
});
