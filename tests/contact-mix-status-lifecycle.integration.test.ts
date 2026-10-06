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
import { activateMixAction, archiveMixAction, pauseMixAction } from "../src/lib/mix-lifecycle-actions";
import { bulkAssignMixAction, removeMixAssignmentAction, undoBulkMixStartAction } from "../src/lib/contact-mix-actions";
import { processWorkflowInstance, saveWorkflowConfiguration } from "../src/lib/mix-workflow";
import { emptyWorkflow } from "../src/lib/mix-workflow-types";
import { resumeMixForContactAction, stopMixForContactAction } from "../src/lib/mix-stop-actions";
import { setNoMixNeededAction } from "../src/lib/contact-no-mix-actions";

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

  it("counts a paused Mix for all of its people, and lets No Mix needed lapse when the Mix resumes (DEF-02, D45)", async () => {
    await save(mixForm({ name: `Seasonal check-in ${suffix}`, beats: [{ script: "First call.", day: 0 }, { script: "A month on.", day: 30 }] }));
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: `Seasonal check-in ${suffix}` } });
    // The rows a start writes (src/lib/contact-mix-actions.ts), backdated where a test needs a Beat already due.
    const start = (contactId: string, startDate: Date) => prisma.mixAssignment.create({ data: { workspaceId, mixId: mix.id, contactId, assignmentKey: `${workspaceId}:${mix.id}:${contactId}`, startDate } });
    const overdue = await person("Overdue"), ahead = await person("Ahead"), finished = await person("Finished"), stopped = await person("Stopped"), journey = await person("Journey");
    await start(overdue, new Date(Date.now() - 10 * day)); // one Beat ten days late, one in twenty days
    await start(ahead, new Date(Date.now() + 5 * day)); // only future Beats
    await start(finished, new Date(Date.now() - 40 * day));
    await start(stopped, new Date(Date.now() + 5 * day));
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId: mix.id } } });
    await prepareQueued();
    await prisma.jump.updateMany({ where: { workspaceId, contactId: finished }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:sent" } });
    // Journey work the owner paused for one person, as the Journey pass leaves it: the record PAUSED and its follow-up held.
    await start(journey, new Date(Date.now() + 5 * day));
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId: journey, mixId: mix.id } } });
    await prepareQueued();
    const journeyRecord = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: journey, admissionKey: `manual:${journey}`, label: "Estimate", definition: {}, state: {}, status: "PAUSED" } });
    await prisma.jump.updateMany({ where: { workspaceId, contactId: journey, status: "PENDING" }, data: { status: "CANCELED", completionMethod: "workflow_held", workflowInstanceId: journeyRecord.id } });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: overdue, status: "PENDING", scheduledAt: { lt: new Date() } } })).toBe(1);

    expect((await redirected(pauseMixAction(fields({ mixId: mix.id })))).search).toBe("?paused=1");
    const pausedStatuses = async () => Promise.all([overdue, ahead, journey, finished].map(status));
    // Right after the pause the overdue Beat is still pending; after the worker's pass it is held too.
    expect(await pausedStatuses()).toEqual(["in-mix", "in-mix", "in-mix", "no-mix"]);
    await prepareQueued();
    expect(await prisma.jump.count({ where: { workspaceId, mixId: mix.id, status: "PENDING" } })).toBe(0);
    expect(await pausedStatuses()).toEqual(["in-mix", "in-mix", "in-mix", "no-mix"]);
    // Their work is on hold, so Mark No Mix needed leaves them as they are; only the person who finished changes.
    const marked = await redirected(setNoMixNeededAction(fields({ contactIds: [overdue, ahead, journey, finished], returnTo: "/contacts" })));
    expect(marked.searchParams.get("noMixNeeded")).toBe("1");
    expect(await status(finished)).toBe("no-mix-needed");

    // Stopped for one person during the pause, they read No Mix and the owner confirms No Mix needed.
    await redirected(stopMixForContactAction(fields({ contactId: stopped, mixId: mix.id, returnTo: `/contacts/${stopped}` })));
    expect(await status(stopped)).toBe("no-mix");
    await redirected(setNoMixNeededAction(fields({ contactIds: stopped, returnTo: `/contacts/${stopped}` })));
    expect(await status(stopped)).toBe("no-mix-needed");
    // Resuming them puts their held Beats back under the pause.
    await redirected(resumeMixForContactAction(fields({ contactId: stopped, mixId: mix.id, returnTo: `/contacts/${stopped}` })));
    await prepareQueued();
    expect(await status(stopped)).toBe("in-mix");

    // Resuming the Mix brings back the same rows, and the confirmation set during the pause lapses.
    expect((await redirected(activateMixAction(fields({ mixId: mix.id })))).search).toBe("?activated=1");
    await prepareQueued();
    expect(await prisma.jump.count({ where: { workspaceId, contactId: stopped, status: "PENDING" } })).toBe(2);
    expect(await Promise.all([overdue, ahead, stopped].map(status))).toEqual(["in-mix", "in-mix", "in-mix"]);
    await prisma.jump.updateMany({ where: { workspaceId, contactId: stopped, status: "PENDING" }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:sent" } });
    expect(await status(stopped)).toBe("no-mix");
    // Nothing resumed for the person who had finished, so their confirmation stands.
    expect(await status(finished)).toBe("no-mix-needed");
  });

  it("never counts a Journey record once its start is removed, stopped or archived, but counts a paused Mix (JRN-01)", async () => {
    // A Journey-connected account, like every account that added a Mega-Mix: one connection, from A to B.
    const owner = await prisma.user.create({ data: { email: `no-mix-journey-${suffix}@example.test`, name: "Journey owner", passwordHash: "fixture-only" } });
    const journeyWorkspace = await prisma.workspace.create({ data: { ownerId: owner.id, slug: `no-mix-journey-${suffix}`, name: "Journey fixture", profile: { create: {} } } });
    const ws = journeyWorkspace.id;
    const previous = session.context;
    session.context = { session: { authUser: owner }, user: owner, workspace: journeyWorkspace, impersonation: null };
    try {
      await prisma.workspaceMember.create({ data: { workspaceId: ws, userId: owner.id, role: "OWNER" } });
      const handMix = async (name: string, days: number[]) => {
        const created = await prisma.mix.create({ data: { workspaceId: ws, name, status: "ACTIVE", triggerMode: "MANUAL_START" } });
        for (const [index, dayOffset] of days.entries()) {
          const template = await prisma.stepTemplate.create({ data: { workspaceId: ws, name: `${name} ${index + 1}`, channel: "PHONE_CALL", versions: { create: { version: 1, script: "Check in." } } }, include: { versions: true } });
          await prisma.mixStep.create({ data: { mixId: created.id, stepVersionId: template.versions[0].id, dayOffset, sortOrder: index + 1 } });
        }
        return created.id;
      };
      const estimate = await handMix("Estimate", [0, 7]), thanks = await handMix("Thank you", [0]), seasonal = await handMix("Seasonal", [0, 30]), winter = await handMix("Winter", [0, 30]);
      await prisma.$transaction(db => saveWorkflowConfiguration(db, ws, { ...emptyWorkflow(), rules: [{ id: randomUUID(), name: "After the estimate", source: { mixId: estimate, stepId: null }, enabled: true, mode: "PARALLEL", join: null,
        routes: [{ id: randomUUID(), label: "Continue", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: thanks, stepId: null }, maxVisits: null, replace: false }] }] }, 0, owner.id));
      const contact = async (name: string) => (await prisma.contact.create({ data: { workspaceId: ws, displayName: `${name} ${suffix}` } })).id;
      const running = await contact("Running"), removed = await contact("Removed"), stopped = await contact("Stopped"), archived = await contact("Archived"), paused = await contact("Paused"), finisher = await contact("Finisher"), lone = await contact("Lone");
      const enroll = (mixId: string, contactId: string) => prisma.mixAssignment.create({ data: { workspaceId: ws, mixId, contactId, assignmentKey: `${ws}:${mixId}:${contactId}`, startDate: new Date(Date.now() + day) } });
      for (const person of [running, removed, stopped, finisher]) await enroll(estimate, person);
      await enroll(seasonal, archived);
      await enroll(winter, paused);
      // A Mix with no connection of its own, in this connected account (PR #128's case).
      await enroll(thanks, lone);
      // The worker's passes: the scheduler prepares the Beats and records each start as Journey work.
      const workerPass = async (at = new Date()) => {
        await generateJumps({ workspaceId: ws });
        for (const record of await prisma.mixWorkflowInstance.findMany({ where: { workspaceId: ws, status: { in: ["ACTIVE", "PAUSED"] } }, select: { id: true } })) await processWorkflowInstance(ws, record.id, at);
      };
      await workerPass();
      const statusIn = (contactId: string) => contactMixStatus(ws, contactId);
      expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId: ws, status: "ACTIVE" } })).toBe(7);
      expect(await Promise.all([running, removed, stopped, archived, paused, finisher, lone].map(statusIn))).toEqual(Array(7).fill("in-mix"));

      // Remove one person, stop another, archive one Mix and pause another, then run the worker again.
      const removedAssignment = await prisma.mixAssignment.findFirstOrThrow({ where: { workspaceId: ws, contactId: removed, mixId: estimate } });
      await redirected(removeMixAssignmentAction(fields({ assignmentId: removedAssignment.id, contactId: removed })));
      await redirected(stopMixForContactAction(fields({ contactId: stopped, mixId: estimate, returnTo: `/contacts/${stopped}` })));
      await redirected(archiveMixAction(fields({ mixId: seasonal })));
      await redirected(pauseMixAction(fields({ mixId: winter })));
      await workerPass();
      // Their Journey records are still ACTIVE, yet only the paused Mix's person reads as in a Mix.
      expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId: ws, contactId: { in: [removed, stopped, archived] }, status: "ACTIVE" } })).toBe(3);
      expect(await Promise.all([running, removed, stopped, archived, paused].map(statusIn))).toEqual(["in-mix", "no-mix", "no-mix", "no-mix", "in-mix"]);

      // The last Beat done: the record is still ACTIVE and its state not yet updated, so nothing waits yet (PR #128's question can be asked).
      await prisma.jump.updateMany({ where: { workspaceId: ws, contactId: { in: [finisher, lone] }, status: "PENDING" }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:sent" } });
      expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId: ws, contactId: { in: [finisher, lone] }, status: "ACTIVE" } })).toBe(2);
      expect(await Promise.all([finisher, lone].map(statusIn))).toEqual(["no-mix", "no-mix"]);
      // Once the Journey pass has run after the undo window, the connection starts B for the finisher; the Mix
      // with no connection of its own has nothing more to bring.
      await workerPass(new Date(Date.now() + 60_000));
      expect(await prisma.jump.count({ where: { workspaceId: ws, contactId: finisher, mixId: thanks, status: "PENDING" } })).toBe(1);
      expect(await Promise.all([finisher, lone].map(statusIn))).toEqual(["in-mix", "no-mix"]);
    } finally {
      session.context = previous;
      await prisma.contactActivity.deleteMany({ where: { workspaceId: ws } });
      await prisma.workspace.deleteMany({ where: { id: ws } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
  });

  it("puts people back as they were when a bulk start is undone in a Journey-connected account, and starts nothing after it (UNDO-01, UNDO-02, JRN-01)", async () => {
    const owner = await prisma.user.create({ data: { email: `no-mix-journey-undo-${suffix}@example.test`, name: "Journey owner", passwordHash: "fixture-only" } });
    const journeyWorkspace = await prisma.workspace.create({ data: { ownerId: owner.id, slug: `no-mix-journey-undo-${suffix}`, name: "Journey Undo fixture", profile: { create: {} } } });
    const ws = journeyWorkspace.id;
    const previous = session.context;
    session.context = { session: { authUser: owner }, user: owner, workspace: journeyWorkspace, impersonation: null };
    try {
      await prisma.workspaceMember.create({ data: { workspaceId: ws, userId: owner.id, role: "OWNER" } });
      const handMix = async (name: string, days: number[]) => {
        const created = await prisma.mix.create({ data: { workspaceId: ws, name, status: "ACTIVE", triggerMode: "MANUAL_START" } });
        for (const [index, dayOffset] of days.entries()) {
          const template = await prisma.stepTemplate.create({ data: { workspaceId: ws, name: `${name} ${index + 1}`, channel: "PHONE_CALL", versions: { create: { version: 1, script: "Check in." } } }, include: { versions: true } });
          await prisma.mixStep.create({ data: { mixId: created.id, stepVersionId: template.versions[0].id, dayOffset, sortOrder: index + 1 } });
        }
        return created.id;
      };
      const estimate = await handMix("Estimate", [0, 7]), thanks = await handMix("Thank you", [0]);
      await prisma.$transaction(db => saveWorkflowConfiguration(db, ws, { ...emptyWorkflow(), rules: [{ id: randomUUID(), name: "After the estimate", source: { mixId: estimate, stepId: null }, enabled: true, mode: "PARALLEL", join: null,
        routes: [{ id: randomUUID(), label: "Continue", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: thanks, stepId: null }, maxVisits: null, replace: false }] }] }, 0, owner.id));
      const contact = async (name: string) => (await prisma.contact.create({ data: { workspaceId: ws, displayName: `${name} ${suffix}` } })).id;
      const fresh = await contact("Fresh"), confirmed = await contact("Confirmed");
      await prisma.contactRelationshipState.create({ data: { workspaceId: ws, contactId: confirmed, noMixNeededAt: new Date(Date.now() - 60_000) } });
      const workerPass = async (at = new Date()) => {
        await generateJumps({ workspaceId: ws });
        for (const record of await prisma.mixWorkflowInstance.findMany({ where: { workspaceId: ws, status: { in: ["ACTIVE", "PAUSED"] } }, select: { id: true } })) await processWorkflowInstance(ws, record.id, at);
      };
      const statusIn = (contactId: string) => contactMixStatus(ws, contactId);

      const started = await redirected(bulkAssignMixAction(fields({ contactIds: [fresh, confirmed], mixId: estimate, returnTo: "/contacts" })));
      expect(started.searchParams.get("mixStarted")).toBe("2");
      await workerPass();
      // Each start is Journey work: a record and its Beats, linked to it.
      expect(await prisma.jump.count({ where: { workspaceId: ws, mixId: estimate, status: "PENDING", workflowInstanceId: { not: null } } })).toBe(4);
      expect(await Promise.all([fresh, confirmed].map(statusIn))).toEqual(["in-mix", "in-mix"]);

      const undone = await redirected(undoBulkMixStartAction(fields({ undoId: started.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
      expect(Object.fromEntries(undone.searchParams)).toMatchObject({ mixUndone: "2", mixUndoConfirmed: "1" });
      expect(await Promise.all([fresh, confirmed].map(statusIn))).toEqual(["no-mix", "no-mix-needed"]);
      // The records stay as history, yet nothing counts them, and the cancelled run never reads as finished:
      // after the worker's passes, past the Journey's undo window, the connection has started nothing.
      await workerPass();
      await workerPass(new Date(Date.now() + 60_000));
      expect(await prisma.jump.count({ where: { workspaceId: ws, contactId: { in: [fresh, confirmed] }, status: "PENDING" } })).toBe(0);
      expect(await Promise.all([fresh, confirmed].map(statusIn))).toEqual(["no-mix", "no-mix-needed"]);
    } finally {
      session.context = previous;
      await prisma.contactActivity.deleteMany({ where: { workspaceId: ws } });
      await prisma.workspace.deleteMany({ where: { id: ws } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
  });
});
