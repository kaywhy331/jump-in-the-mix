import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { assignMixToContactAction, bulkAssignMixAction, removeMixAssignmentAction, undoBulkMixStartAction } from "../src/lib/contact-mix-actions";
import { generateJumps } from "../src/lib/jump-engine";
import { readWorkflowDefinition, saveWorkflowConfiguration } from "../src/lib/mix-workflow";
import { startWorkflow } from "../src/lib/mix-workflow-engine";
import { emptyWorkflow, type WorkflowState } from "../src/lib/mix-workflow-types";
import { contactMixStatus } from "../src/lib/contact-mix-status";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const now = new Date("2030-04-10T12:00:00Z");
const fields = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
};
async function redirected(action: Promise<unknown>) {
  try { await action; } catch (error) {
    if (error instanceof Error && error.message.startsWith("redirect:")) return new URL(error.message.slice(9), "https://app.invalid");
    throw error;
  }
  throw new Error("Expected redirect");
}
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
};

describe.skipIf(!local).sequential("Enrollment preparation and Undo ownership", () => {
  let workspaceId = "", userId = "", contactId = "", mixId = "";
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { email: `enrollment-${suffix}@example.test`, name: "Fixture owner" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { ownerId: userId, slug: suffix, name: "Enrollment fixture", profile: { create: {} }, members: { create: { userId, role: "OWNER" } } } }); workspaceId = workspace.id;
    await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
    auth.context = { user, workspace, session: { authUser: user }, impersonation: null };
    contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Alex Example" } })).id;
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Call", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Check in." } } }, include: { versions: true } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Check in", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 1 } } } }); mixId = mix.id;
    await prisma.$transaction(tx => saveWorkflowConfiguration(tx, workspaceId, { ...emptyWorkflow(), rules: [{ id: "question", name: "What next?", source: { mixId, stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: [{ id: "finished", label: "Finished", when: "OUTCOME", outcome: "finished", delayMinutes: 0, target: null, maxVisits: null, replace: false }] }] }, 0, userId));
  });
  afterEach(async () => {
    vi.restoreAllMocks(); vi.useRealTimers();
    if (workspaceId) { await prisma.contactActivity.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: workspaceId } }); }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });
  const start = () => redirected(bulkAssignMixAction(fields({ contactIds: contactId, mixId, startDate: "2030-04-10", returnTo: "/contacts?mix=no-mix" })));
  const undo = (url: URL) => redirected(undoBulkMixStartAction(fields({ undoId: url.searchParams.get("mixUndo")!, returnTo: "/contacts?mix=no-mix" })));

  it.each([false, true])("Undo preserves an older date-based Journey record, with business update: %s (UNDO-06)", async movedOn => {
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Renewal", slug: "renewal" } });
    await prisma.mix.update({ where: { id: mixId }, data: { triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
    const savedDate = await prisma.jumpDate.create({ data: { workspaceId, contactId, dateTypeId: dateType.id, recurrence: "NONE", dateValue: now, timezone: "UTC" } });
    const definition = await readWorkflowDefinition(prisma, workspaceId);
    const oldState = startWorkflow(definition, { mixId, stepId: null }, "2029-04-10T12:00:00Z", true);
    oldState.runs[0].status = "ACTIVE";
    oldState.visits.forEach(visit => { visit.status = "DONE"; visit.completedAt = "2029-04-10T12:01:00Z"; });
    // An old record can remain ACTIVE after its own work ended. A later update must also not block this Undo.
    if (movedOn) oldState.updates = [{ id: "old-update" }] as WorkflowState["updates"];
    oldState.context = { timezone: "UTC", appointmentBindingId: null, occurrenceKey: `jump-date:${savedDate.id}:2029-04-10` };
    const old = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, admissionKey: "legacy:older-date", label: "Older date", definition: JSON.parse(JSON.stringify(definition)), state: JSON.parse(JSON.stringify(oldState)), createdAt: new Date("2020-04-10T12:00:00Z") } });
    const begun = await start();
    expect(begun.searchParams.get("mixStarted")).toBe("1");
    await generateJumps({ workspaceId });
    const current = await prisma.mixWorkflowInstance.findFirstOrThrow({ where: { workspaceId, id: { not: old.id } } });
    const result = await undo(begun);
    expect(result.searchParams.get("mixUndone")).toBe("1");
    expect(await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
    expect((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: current.id } })).status).toBe("STOPPED");
    expect((await prisma.jumpDate.findUniqueOrThrow({ where: { id: savedDate.id } })).isActive).toBe(true);
  });

  it.each(["", "/jumps"])("a fixed-date start confirms its own schedule instead of the chosen start day, return to %s", async returnTo => {
    await prisma.mix.update({ where: { id: mixId }, data: { triggerMode: "BROADCAST" } });
    await prisma.mixBroadcastSchedule.create({ data: { workspaceId, mixId, localDate: new Date("2030-04-20T12:00:00Z"), timeMinutes: 600, timezone: "UTC" } });
    const result = await redirected(assignMixToContactAction(fields({ contactId, mixId, startDate: "2030-04-10", returnTo })));
    expect(result.searchParams.get("mixStart")).toBe("fixed");
    expect(result.pathname).toBe(returnTo || `/contacts/${contactId}`);
    const assignment = await prisma.mixAssignment.findFirstOrThrow({ where: { workspaceId, contactId, mixId } });
    expect(assignment.startDate).toBeNull();
    expect((await prisma.mixBroadcastSchedule.findUniqueOrThrow({ where: { mixId } })).localDate).toEqual(new Date("2030-04-20T12:00:00Z"));
  });

  it("preserves No Mix while Beats await booking or an outcome (D126)", async () => {
    await prisma.mixWorkflow.update({ where: { workspaceId }, data: { configuration: emptyWorkflow() } });
    await prisma.mixStep.updateMany({ where: { mixId }, data: { anchor: "APPOINTMENT_END", offsetMinutes: 60 } });
    await start();
    await generateJumps({ workspaceId });
    await prisma.job.updateMany({ where: { workspaceId }, data: { completedAt: new Date() } });
    expect(await contactMixStatus(workspaceId, contactId)).toBe("no-mix");
    const visit = await prisma.calendarEntry.create({ data: { workspaceId, contactId, kind: "MEETING", title: "Site visit", startsAt: new Date("2030-04-12T12:00:00Z"), endsAt: new Date("2030-04-12T13:00:00Z"), timezone: "UTC" } });
    const assignment = await prisma.mixAssignment.create({ data: { workspaceId, contactId, mixId, assignmentKey: `visit:${visit.id}` } });
    await prisma.appointmentBinding.create({ data: { workspaceId, contactId, mixId, calendarEntryId: visit.id, assignmentId: assignment.id } });
    await generateJumps({ workspaceId });
    expect(await contactMixStatus(workspaceId, contactId)).toBe("no-mix");
    vi.setSystemTime(new Date("2030-04-13T12:00:00Z"));
    await generateJumps({ workspaceId });
    expect(await contactMixStatus(workspaceId, contactId)).toBe("no-mix");
    expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(0);
    // Pausing does not invent work for an exclusively visit-timed enrollment.
    await prisma.mix.update({ where: { id: mixId }, data: { status: "PAUSED" } });
    expect(await contactMixStatus(workspaceId, contactId)).toBe("no-mix");
    await prisma.mix.update({ where: { id: mixId }, data: { status: "ACTIVE" } });
    await prisma.calendarEntry.update({ where: { id: visit.id }, data: { outcome: "COMPLETED", outcomeAt: new Date() } });
    await generateJumps({ workspaceId });
    expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(1);
    expect(await contactMixStatus(workspaceId, contactId)).toBe("in-mix");
  });

  it("two first preparation passes share one admission and one follow-up", async () => {
    await start();
    await Promise.all([generateJumps({ workspaceId }), generateJumps({ workspaceId })]);
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId } })).toBe(1);
    expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(1);
  });

  for (const action of ["Undo", "Remove"] as const) for (const point of ["after enrollment read", "before follow-up write", "before held follow-up update"] as const) {
    it(`${action} wins against preparation ${point} (RACE-01)`, async () => {
      const begun = await start();
      if (point === "before held follow-up update") {
        await generateJumps({ workspaceId });
        await prisma.jump.updateMany({ where: { workspaceId }, data: { status: "CANCELED", completionMethod: "reconciled" } });
      }
      const entered = gate(), resume = gate();
      let paused = false;
      if (point === "after enrollment read") {
        const original = prisma.mixAssignment.findMany.bind(prisma.mixAssignment);
        vi.spyOn(prisma.mixAssignment, "findMany").mockImplementation((async (args: any) => {
          const result = await original(args);
          if (!paused && args?.include?.workspace) { paused = true; entered.release(); await resume.promise; }
          return result;
        }) as typeof prisma.mixAssignment.findMany);
      } else {
        const original = prisma.jump.findMany.bind(prisma.jump);
        vi.spyOn(prisma.jump, "findMany").mockImplementation((async (args: any) => {
          const result = await original(args);
          if (!paused && args?.where?.uniquenessKey?.in && args?.select?.completionMethod) { paused = true; entered.release(); await resume.promise; }
          return result;
        }) as typeof prisma.jump.findMany);
      }
      const preparation = generateJumps({ workspaceId });
      try {
        await entered.promise;
        vi.setSystemTime(new Date(now.getTime() + 1000));
        if (action === "Undo") expect((await undo(begun)).searchParams.get("mixUndone")).toBe("1");
        else {
          const assignment = await prisma.mixAssignment.findFirstOrThrow({ where: { workspaceId, contactId, mixId } });
          await redirected(removeMixAssignmentAction(fields({ assignmentId: assignment.id, contactId })));
        }
      } finally { resume.release(); }
      await preparation;
      vi.restoreAllMocks();
      expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(0);
      expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId, status: "ACTIVE" } })).toBe(0);
      await prisma.job.updateMany({ where: { workspaceId }, data: { completedAt: new Date() } });
      expect(await contactMixStatus(workspaceId, contactId)).toBe("no-mix");
      // An explicit later start is allowed and remains idempotent on repeated preparation.
      vi.setSystemTime(new Date(now.getTime() + 2000));
      expect((await start()).searchParams.get("mixStarted")).toBe("1");
      await generateJumps({ workspaceId }); await generateJumps({ workspaceId });
      expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(1);
      expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId, status: "ACTIVE" } })).toBe(1);
    });
  }
});
