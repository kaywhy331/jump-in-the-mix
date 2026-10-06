import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "contact-no-mix-actions-test-secret-1" } };
});
import { bulkAssignMixAction, undoBulkMixStartAction } from "../src/lib/contact-mix-actions";
import { generateJumps } from "../src/lib/jump-engine";
import { contactMixStatus } from "../src/lib/contact-mix-status";
import { setNoMixNeededAction } from "../src/lib/contact-no-mix-actions";
import { viewerErrorMessage } from "../src/lib/form-errors";
import { VIEW_ONLY_SUPPORT_MESSAGE } from "../src/lib/writable-workspace";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}

async function redirectOf(action: Promise<unknown>): Promise<URL> {
  try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("REDIRECT ")) return new URL(error.message.slice("REDIRECT ".length), "https://app.invalid"); throw error; }
  throw new Error("The action finished without redirecting.");
}

describe.skipIf(!local)("No Mix actions with PostgreSQL (JITM-09 §2.76–§2.77)", () => {
  const suffix = randomUUID().replaceAll("-", "");
  let workspaceId = "";
  let otherWorkspaceId = "";
  let userId = "";
  let mixId = "";
  let versionId = "";
  let owner: { id: string } = { id: "" };
  const today = new Date().toISOString().slice(0, 10);

  async function person(name: string, workspace = workspaceId) {
    return (await prisma.contact.create({ data: { workspaceId: workspace, displayName: `${name} ${suffix.slice(0, 6)}` } })).id;
  }
  const errorFor = (location: URL) => viewerErrorMessage(Object.fromEntries(location.searchParams), { authUser: { id: owner.id } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `no-mix-${suffix}@example.com`, name: "No Mix Owner", passwordHash: "test-only" } });
    owner = user;
    userId = user.id;
    const [workspace, other] = await Promise.all([
      prisma.workspace.create({ data: { name: "No Mix", slug: `no-mix-${suffix}`, ownerId: user.id, profile: { create: {} } } }),
      prisma.workspace.create({ data: { name: "Other", slug: `no-mix-other-${suffix}`, ownerId: user.id, profile: { create: {} } } })
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Checking in" } });
    versionId = version.id;
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    mixId = mix.id;
    auth.context = { session: { authUser: user }, user, workspace, impersonation: null };
  });

  afterAll(async () => {
    for (const id of [workspaceId, otherWorkspaceId].filter(Boolean)) {
      await prisma.contactActivity.deleteMany({ where: { workspaceId: id } });
      await prisma.workspace.delete({ where: { id } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("confirms No Mix needed at once, offers Undo, and Undo takes it back", async () => {
    const supplier = await person("Supplier");
    const done = await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, returnTo: "/contacts?mix=no-mix" })));
    expect(done.pathname).toBe("/contacts");
    expect(Object.fromEntries(done.searchParams)).toMatchObject({ mix: "no-mix", noMixNeeded: "1", noMixPeople: supplier });
    expect(await contactMixStatus(workspaceId, supplier)).toBe("no-mix-needed");
    expect(await prisma.contactActivity.count({ where: { contactId: supplier, summary: "Marked No Mix needed." } })).toBe(1);
    const undone = await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, intent: "clear", returnTo: `/contacts/${supplier}` })));
    expect(undone.pathname).toBe(`/contacts/${supplier}`);
    expect(undone.searchParams.get("noMixCleared")).toBe("1");
    expect(await contactMixStatus(workspaceId, supplier)).toBe("no-mix");
  });

  it("leaves people already in a Mix or marked Do not contact as they are", async () => {
    const busy = await person("Busy");
    const blocked = await person("Blocked");
    // Just started: the assignment and the preparation job a start queues (src/lib/contact-mix-actions.ts).
    await prisma.mixAssignment.create({ data: { workspaceId, mixId, contactId: busy, assignmentKey: `${workspaceId}:${mixId}:${busy}`, startDate: new Date() } });
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId: busy, mixId } } });
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: blocked, doNotContact: true } });
    const result = await redirectOf(setNoMixNeededAction(form({ contactIds: [busy, blocked], returnTo: "/contacts" })));
    // Each reason is counted on its own (COPY-01).
    expect(Object.fromEntries(result.searchParams)).toEqual({ noMixNeeded: "0", noMixInMix: "1", noMixDnc: "1" });
    expect(await contactMixStatus(workspaceId, busy)).toBe("in-mix");
    expect((await prisma.contactRelationshipState.findUnique({ where: { contactId: blocked } }))?.noMixNeededAt).toBeNull();
  });

  it("says nothing was removed, or newly marked, on a second submit (COPY-01)", async () => {
    const supplier = await person("Twice");
    await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, returnTo: "/contacts" })));
    const again = await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, returnTo: "/contacts" })));
    expect(Object.fromEntries(again.searchParams)).toEqual({ noMixNeeded: "0", noMixAlready: "1" });
    expect(Object.fromEntries((await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, intent: "clear", returnTo: "/contacts" })))).searchParams)).toEqual({ noMixCleared: "1" });
    // A Remove from a stale page changes nothing, and says so.
    expect(Object.fromEntries((await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, intent: "clear", returnTo: "/contacts?noMixCleared=1" })))).searchParams)).toEqual({ noMixCleared: "0" });
    expect(await prisma.contactActivity.count({ where: { contactId: supplier } })).toBe(2);
  });

  it("returns only to Contacts, and refuses another workspace's people", async () => {
    const someone = await person("Someone");
    const away = await redirectOf(setNoMixNeededAction(form({ contactIds: someone, returnTo: "https://example.com/contacts" })));
    expect(away.origin).toBe("https://app.invalid");
    expect(away.pathname).toBe("/contacts");
    const outsider = await person("Outsider", otherWorkspaceId);
    const refused = await redirectOf(setNoMixNeededAction(form({ contactIds: outsider, returnTo: "/contacts" })));
    expect(errorFor(refused)).toBe("One or more selected Contacts are unavailable.");
    expect(await prisma.contactRelationshipState.count({ where: { contactId: outsider } })).toBe(0);
  });

  it("adds the selected people to a Mix from a filtered list and returns to it", async () => {
    const first = await person("First");
    const second = await person("Second");
    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: [first, second], mixId, startDate: today, returnTo: `/contacts?mix=no-mix&people=${first}` })));
    expect(Object.fromEntries(result.searchParams)).toEqual({ mix: "no-mix", mixStarted: "2", mixStartedId: mixId, mixStartOn: today, mixUndo: expect.any(String) });
    expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId, contactId: { in: [first, second] }, isActive: true } })).toBe(2);
    // One preparation pass for the Mix, listing the people it started (PERF-01).
    const jobs = await prisma.job.findMany({ where: { workspaceId, task: "generate-jumps", payload: { path: ["contactIds"], array_contains: [first] } }, select: { payload: true } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toEqual({ mixId, contactIds: expect.arrayContaining([first, second]) });
    expect((jobs[0].payload as { contactIds: string[] }).contactIds).toHaveLength(2);
    expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps", payload: { path: ["contactId"], equals: first } } })).toBe(0);
    expect(await contactMixStatus(workspaceId, first)).toBe("in-mix");
  });

  it("reports what the bulk start did, including Beats that wait for a visit (BLK-01)", async () => {
    // A Mix with a Beat on the start day and one timed from the end of an appointment.
    const visitMix = await prisma.mix.create({ data: { workspaceId, name: "Estimate visit", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    await prisma.mixStep.create({ data: { mixId: visitMix.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    const visitBeat = await prisma.mixStep.create({ data: { mixId: visitMix.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 2, anchor: "APPOINTMENT_END", offsetMinutes: 60 } });
    const fresh = [await person("Fresh one"), await person("Fresh two")];
    const running = await person("Running");
    const keptStart = new Date(Date.now() - 3 * 86_400_000);
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: visitMix.id, contactId: running, assignmentKey: `${workspaceId}:${visitMix.id}:${running}`, startDate: keptStart } });
    await prisma.jump.create({ data: { workspaceId, contactId: running, mixId: visitMix.id, mixStepId: visitBeat.id, stepVersionId: versionId, scheduledAt: new Date(Date.now() + 86_400_000), reason: "Estimate visit", uniquenessKey: `bulk-running-${suffix}`, templateSnapshot: {}, renderedSnapshot: {} } });

    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: [...fresh, running], mixId: visitMix.id, startDate: today, returnTo: "/contacts" })));
    expect(Object.fromEntries(result.searchParams)).toEqual({ mixStarted: "2", mixKept: "1", mixStartedId: visitMix.id, mixStartOn: today, mixVisit: "1", mixUndo: expect.any(String) });
    // The person already in it keeps their start; the others start on the chosen day.
    expect((await prisma.mixAssignment.findFirstOrThrow({ where: { mixId: visitMix.id, contactId: running } })).startDate).toEqual(keptStart);
    expect(await prisma.mixAssignment.count({ where: { mixId: visitMix.id, contactId: { in: fresh }, isActive: true } })).toBe(2);
    const audits = await prisma.auditLog.findMany({ where: { workspaceId, action: "mix.assignment.activate", source: "contacts.bulk", entityId: { in: (await prisma.mixAssignment.findMany({ where: { mixId: visitMix.id }, select: { id: true } })).map(item => item.id) } }, select: { metadata: true } });
    // Only the two starts were made; the person already in it was left as they were (BLK-02).
    expect(audits.map(audit => (audit.metadata as { result: string }).result).sort()).toEqual(["started", "started"]);
  });

  it("follows saved dates in a date-based Mix and saves the start day for anyone without one (BLK-01)", async () => {
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Renewal", slug: `renewal-${suffix}` } });
    const dateMix = await prisma.mix.create({ data: { workspaceId, name: "Renewal reminder", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
    await prisma.mixStep.create({ data: { mixId: dateMix.id, stepVersionId: versionId, dayOffset: -7, sortOrder: 1 } });
    const dated = await person("Has a renewal"), undated = await person("No renewal yet");
    await prisma.jumpDate.create({ data: { workspaceId, contactId: dated, dateTypeId: dateType.id, timezone: "UTC", recurrence: "YEARLY", month: 3, day: 14 } });
    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: [dated, undated], mixId: dateMix.id, startDate: today, returnTo: "/contacts" })));
    expect(Object.fromEntries(result.searchParams)).toMatchObject({ mixStarted: "2", mixSaved: "1", mixDated: "1", mixStartedId: dateMix.id });
    expect(result.searchParams.has("mixVisit")).toBe(false);
    // The person who had a date keeps only that one; the other gets the start day, labelled with the Mix's name.
    expect(await prisma.jumpDate.count({ where: { contactId: dated, dateTypeId: dateType.id } })).toBe(1);
    expect(await prisma.jumpDate.findMany({ where: { contactId: undated, dateTypeId: dateType.id }, select: { label: true, recurrence: true, dateValue: true } }))
      .toEqual([{ label: "Renewal reminder", recurrence: "NONE", dateValue: new Date(`${today}T12:00:00Z`) }]);
  });

  /** One worker pass over the queued preparation jobs, as src/worker/index.ts runs them. */
  async function prepareQueued() {
    for (const job of await prisma.job.findMany({ where: { workspaceId, task: "generate-jumps", completedAt: null, failedAt: null }, orderBy: { createdAt: "asc" } })) {
      const payload = job.payload as { contactId?: string; mixId?: string };
      await generateJumps({ workspaceId, contactId: payload.contactId, mixId: payload.mixId });
      await prisma.job.update({ where: { id: job.id }, data: { completedAt: new Date() } });
    }
  }

  it("undoes a bulk start: it puts back what each start replaced and keeps every completed follow-up (UX-01, D46, UNDO-02)", async () => {
    const twoBeats = await prisma.mix.create({ data: { workspaceId, name: "Two-step follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    const first = await prisma.mixStep.create({ data: { mixId: twoBeats.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixStep.create({ data: { mixId: twoBeats.id, stepVersionId: versionId, dayOffset: 7, sortOrder: 2 } });
    const assignmentKey = (contactId: string) => `${workspaceId}:${twoBeats.id}:${contactId}`;
    const fresh = await person("Undo fresh"), finished = await person("Undo finished"), running = await person("Undo running"), changed = await person("Undo changed"), tagged = await person("Undo tagged"), confirmed = await person("Undo confirmed");
    // Finished the Mix a month ago; already in it with a follow-up to come.
    const finishedStart = new Date(Date.now() - 30 * 86_400_000);
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: twoBeats.id, contactId: finished, assignmentKey: assignmentKey(finished), startDate: finishedStart } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: twoBeats.id, contactId: running, assignmentKey: assignmentKey(running), startDate: new Date(Date.now() - 2 * 86_400_000) } });
    // Marked No Mix needed before the bulk start.
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: confirmed, noMixNeededAt: new Date(Date.now() - 60_000) } });
    // A tag that runs this Mix from the same day; one of them joins it after the bulk start.
    const group = await prisma.group.create({ data: { workspaceId, name: `Undo tag ${suffix}` } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: twoBeats.id, groupId: group.id, assignmentKey: `${workspaceId}:${twoBeats.id}:group:${group.id}`, mode: "DYNAMIC", startDate: new Date(`${today}T12:00:00Z`) } });
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId: twoBeats.id } } });
    await prepareQueued();
    await prisma.jump.updateMany({ where: { contactId: finished }, data: { status: "DONE", completedAt: new Date(Date.now() - 20 * 86_400_000), completionMethod: "outcome:sent" } });
    const history = await prisma.jump.findMany({ where: { contactId: finished }, select: { id: true, status: true, completedAt: true }, orderBy: { id: "asc" } });
    expect(history).toHaveLength(2);
    const runningBefore = await prisma.jump.findMany({ where: { contactId: running }, select: { id: true, status: true } });
    expect(await contactMixStatus(workspaceId, confirmed)).toBe("no-mix-needed");

    const started = await redirectOf(bulkAssignMixAction(form({ contactIds: [fresh, finished, running, changed, tagged, confirmed], mixId: twoBeats.id, startDate: today, returnTo: "/contacts?mix=no-mix" })));
    expect(Object.fromEntries(started.searchParams)).toMatchObject({ mix: "no-mix", mixStarted: "5", mixKept: "1", mixStartedId: twoBeats.id });
    const undoId = started.searchParams.get("mixUndo")!;
    expect(undoId).toBeTruthy();
    await prepareQueued();
    await prisma.contactGroupMembership.create({ data: { contactId: tagged, groupId: group.id } });
    // The start's follow-ups replaced the confirmation, and the finished person started again.
    expect(await contactMixStatus(workspaceId, confirmed)).toBe("in-mix");
    expect(await prisma.jump.count({ where: { contactId: finished, status: "PENDING" } })).toBe(2);
    // The fresh person has done their first follow-up; someone else started the changed person again on their own.
    await prisma.jump.updateMany({ where: { contactId: fresh, mixStepId: first.id }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:sent" } });
    await prisma.mixAssignment.update({ where: { assignmentKey: assignmentKey(changed) }, data: { startDate: new Date(`${today}T13:00:00Z`) } });

    const undone = await redirectOf(undoBulkMixStartAction(form({ undoId, returnTo: "/contacts?mix=no-mix&mixStarted=4&mixUndo=old" })));
    // A start that created an assignment ends it; one that restarted an earlier run puts that run back as it was.
    expect(await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: assignmentKey(finished) }, select: { isActive: true, startDate: true, mode: true } }))
      .toEqual({ isActive: true, startDate: finishedStart, mode: "SNAPSHOT" });
    for (const contactId of [fresh, tagged, confirmed]) expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: assignmentKey(contactId) } })).isActive).toBe(false);
    expect(Object.fromEntries(undone.searchParams)).toEqual({ mix: "no-mix", mixUndone: "4", mixStartedId: twoBeats.id, mixUndoKept: "1", mixUndoConfirmed: "1" });
    // Completed follow-ups stay done; only those still to come were cancelled.
    expect(await prisma.jump.findMany({ where: { contactId: fresh }, select: { mixStepId: true, status: true }, orderBy: { scheduledAt: "asc" } }))
      .toEqual([{ mixStepId: first.id, status: "DONE" }, { mixStepId: expect.any(String), status: "CANCELED" }]);
    // The finished person's earlier run stays exactly as it was; the restart's new follow-ups are gone.
    expect(await prisma.jump.findMany({ where: { id: { in: history.map(item => item.id) } }, select: { id: true, status: true, completedAt: true }, orderBy: { id: "asc" } })).toEqual(history);
    expect(await prisma.jump.count({ where: { contactId: finished, status: "PENDING" } })).toBe(0);
    // The person already in it, and the one started again since, are left as they were.
    expect(await prisma.jump.findMany({ where: { contactId: running }, select: { id: true, status: true } })).toEqual(runningBefore);
    expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: assignmentKey(changed) } })).isActive).toBe(true);
    expect(await prisma.jump.count({ where: { contactId: changed, status: "PENDING" } })).toBeGreaterThan(0);
    // The confirmation the start replaced is back.
    expect(await Promise.all([fresh, finished, confirmed].map(contactId => contactMixStatus(workspaceId, contactId)))).toEqual(["no-mix", "no-mix", "no-mix-needed"]);
    // The worker's next pass: the tag still runs the Mix for its member, so their follow-ups come back; the
    // restored run has nothing left to bring, and the confirmation holds.
    await prepareQueued();
    expect(await prisma.jump.count({ where: { contactId: tagged, status: "PENDING" } })).toBe(2);
    expect(await Promise.all([tagged, finished, confirmed].map(contactId => contactMixStatus(workspaceId, contactId)))).toEqual(["in-mix", "no-mix", "no-mix-needed"]);
    expect(await prisma.jump.count({ where: { contactId: finished, status: "PENDING" } })).toBe(0);

    // A second tap finds nothing left to end.
    const again = await redirectOf(undoBulkMixStartAction(form({ undoId, returnTo: "/contacts" })));
    expect(Object.fromEntries(again.searchParams)).toMatchObject({ mixUndone: "0", mixUndoKept: "5" });
    // Another account's record, or none, undoes nothing.
    expect(Object.fromEntries((await redirectOf(undoBulkMixStartAction(form({ undoId: "unknown", returnTo: "/contacts" })))).searchParams)).toEqual({ mixUndone: "0" });
  });

  it("cancels only the follow-ups its own starts produced, never a Journey path's, a visit's or another run's (UNDO-01)", async () => {
    const own = await prisma.mix.create({ data: { workspaceId, name: "Own follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    const beat = await prisma.mixStep.create({ data: { mixId: own.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixStep.create({ data: { mixId: own.id, stepVersionId: versionId, dayOffset: 7, sortOrder: 2 } });
    const started = await person("Started in bulk");
    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: started, mixId: own.id, startDate: today, returnTo: "/contacts" })));
    await prepareQueued();
    const ownRows = await prisma.jump.findMany({ where: { contactId: started, mixId: own.id, status: "PENDING" }, select: { id: true } });
    expect(ownRows).toHaveLength(2);
    // After the start, other routes bring the same person into the same Mix:
    // a Journey path, with its own follow-up;
    const record = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: started, admissionKey: `undo-path:${started}`, label: "Own follow-up", definition: {}, state: {} } });
    const routed = await prisma.jump.create({ data: { workspaceId, contactId: started, mixId: own.id, mixStepId: beat.id, stepVersionId: versionId, scheduledAt: new Date(Date.now() + 2 * 86_400_000), reason: "Own follow-up", uniquenessKey: `workflow:${record.id}:undo`, templateSnapshot: {}, renderedSnapshot: {}, workflowInstanceId: record.id, workflowManaged: true } });
    // a tag that runs the Mix from another day;
    const group = await prisma.group.create({ data: { workspaceId, name: `Earlier tag ${suffix}`, memberships: { create: { contactId: started } } } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: own.id, groupId: group.id, assignmentKey: `${workspaceId}:${own.id}:group:${group.id}`, mode: "DYNAMIC", startDate: new Date(Date.now() - 3 * 86_400_000) } });
    // and a visit the Mix is lined up with, done yesterday, so the Beats that follow it are released.
    const visit = await prisma.calendarEntry.create({ data: { workspaceId, contactId: started, kind: "MEETING", title: "Site visit", startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() - 86_400_000 + 3_600_000), timezone: "UTC", outcome: "COMPLETED", outcomeAt: new Date() } });
    const visitAssignment = await prisma.mixAssignment.create({ data: { workspaceId, mixId: own.id, contactId: started, assignmentKey: `${workspaceId}:${own.id}:appointment:${visit.id}:${started}` } });
    await prisma.appointmentBinding.create({ data: { workspaceId, contactId: started, calendarEntryId: visit.id, mixId: own.id, assignmentId: visitAssignment.id } });
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId: own.id } } });
    await prepareQueued();
    const others = await prisma.jump.findMany({ where: { contactId: started, mixId: own.id, status: "PENDING", id: { notIn: ownRows.map(row => row.id) } }, select: { id: true, appointmentBindingId: true, workflowManaged: true } });
    // The Journey path's follow-up, the tag run's and the visit's, all written after the start.
    expect(others.filter(row => row.workflowManaged)).toHaveLength(1);
    expect(others.filter(row => row.appointmentBindingId)).toHaveLength(2);
    expect(others.filter(row => !row.workflowManaged && !row.appointmentBindingId).length).toBeGreaterThan(0);

    const undone = await redirectOf(undoBulkMixStartAction(form({ undoId: result.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
    expect(undone.searchParams.get("mixUndone")).toBe("1");
    // Only the start's own follow-ups are cancelled; every other route keeps its work, before and after the next pass.
    expect(await prisma.jump.findMany({ where: { id: { in: ownRows.map(row => row.id) } }, select: { status: true, completionMethod: true } }))
      .toEqual([{ status: "CANCELED", completionMethod: "reconciled" }, { status: "CANCELED", completionMethod: "reconciled" }]);
    expect(await prisma.jump.count({ where: { id: { in: others.map(row => row.id) }, status: "PENDING" } })).toBe(others.length);
    await prepareQueued();
    expect(await prisma.jump.count({ where: { id: { in: [routed.id, ...others.map(row => row.id)] }, status: "PENDING" } })).toBe(others.length);
    expect(await prisma.jump.count({ where: { id: { in: ownRows.map(row => row.id) }, status: "PENDING" } })).toBe(0);
    expect(await contactMixStatus(workspaceId, started)).toBe("in-mix");
  });

  it("leaves a start the owner moved on in Journey with a business update (UNDO-05 a)", async () => {
    // (a) A business update on the start's run, as the Journey pass records it: the run is no longer the
    // scheduler's, and its Beats became Journey-managed. The start counts as changed since.
    const moved = await prisma.mix.create({ data: { workspaceId, name: "Moved on", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    await prisma.mixStep.create({ data: { mixId: moved.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    const updated = await person("Moved on in Journey"), plain = await person("Not moved on");
    const started = await redirectOf(bulkAssignMixAction(form({ contactIds: [updated, plain], mixId: moved.id, startDate: today, returnTo: "/contacts" })));
    await prepareQueued();
    const record = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: updated, admissionKey: `legacy:moved-${updated}`, label: "Moved on", definition: {},
      state: { runs: [{ id: "run1", mixId: moved.id, status: "ACTIVE", legacy: false, parentTransitionId: null }], visits: [], evaluations: [], transitions: [], updates: [{ id: "update1", kind: "OUTCOME" }], context: { timezone: "UTC", appointmentBindingId: null, occurrenceKey: `manual:${today}` } } } });
    await prisma.jump.updateMany({ where: { contactId: updated, mixId: moved.id }, data: { workflowInstanceId: record.id, workflowManaged: true } });
    const undone = await redirectOf(undoBulkMixStartAction(form({ undoId: started.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
    expect(Object.fromEntries(undone.searchParams)).toMatchObject({ mixUndone: "1", mixUndoKept: "1" });
    expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: `${workspaceId}:${moved.id}:${updated}` } })).isActive).toBe(true);
    expect(await prisma.jump.count({ where: { contactId: updated, mixId: moved.id, status: "PENDING" } })).toBe(1);
    expect((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: record.id } })).status).toBe("ACTIVE");
    expect(await prisma.jump.count({ where: { contactId: plain, mixId: moved.id, status: "PENDING" } })).toBe(0);
  });

  it("ends a date-based start's planned Beats at once, as it does a hand-started one's (UNDO-05 b)", async () => {
    // A planned Beat is keyed by the Beat, not by the date, whatever the Mix's start type.
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Move-in", slug: `move-in-${suffix}` } });
    const dated = await prisma.mix.create({ data: { workspaceId, name: "Move-in note", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
    const planned = await prisma.mixStep.create({ data: { mixId: dated.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1, plannedAt: new Date(Date.now() + 5 * 86_400_000) } });
    const mover = await person("Moving in");
    const datedStart = await redirectOf(bulkAssignMixAction(form({ contactIds: mover, mixId: dated.id, startDate: today, returnTo: "/contacts" })));
    await prepareQueued();
    const plannedRows = await prisma.jump.findMany({ where: { contactId: mover, mixStepId: planned.id, status: "PENDING" }, select: { id: true, templateSnapshot: true } });
    expect(plannedRows.map(row => String((row.templateSnapshot as { occurrenceKey?: string }).occurrenceKey).split(":")[0])).toEqual(["planned"]);
    await redirectOf(undoBulkMixStartAction(form({ undoId: datedStart.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
    expect(await prisma.jump.findMany({ where: { id: { in: plannedRows.map(row => row.id) } }, select: { status: true, completionMethod: true } })).toEqual([{ status: "CANCELED", completionMethod: "reconciled" }]);
  });

  it("comes back to the list with a message when Undo cannot finish, and changes nothing (ERR-01)", async () => {
    const blocked = await person("Undo blocked");
    const started = await redirectOf(bulkAssignMixAction(form({ contactIds: blocked, mixId, startDate: today, returnTo: "/contacts?mix=no-mix" })));
    // A lock timeout or a deadlock inside the Undo's transaction.
    const failing = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("deadlock detected"));
    try {
      const refused = await redirectOf(undoBulkMixStartAction(form({ undoId: started.searchParams.get("mixUndo")!, returnTo: "/contacts?mix=no-mix" })));
      expect(errorFor(refused)).toBe("Nothing was undone. Try again in a moment.");
      expect(refused.searchParams.get("mix")).toBe("no-mix");
      expect(refused.searchParams.has("mixUndone")).toBe(false);
    } finally { failing.mockRestore(); }
    expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: `${workspaceId}:${mixId}:${blocked}` } })).isActive).toBe(true);
    // A later tap still works.
    const undone = await redirectOf(undoBulkMixStartAction(form({ undoId: started.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
    expect(undone.searchParams.get("mixUndone")).toBe("1");
  });

  it("removes the date a bulk start saved when it is undone, and keeps dates people already had (D46)", async () => {
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Service date", slug: `service-${suffix}` } });
    const dateMix = await prisma.mix.create({ data: { workspaceId, name: "Service reminder", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
    await prisma.mixStep.create({ data: { mixId: dateMix.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    const dated = await person("Serviced before"), undated = await person("Never serviced");
    const kept = await prisma.jumpDate.create({ data: { workspaceId, contactId: dated, dateTypeId: dateType.id, timezone: "UTC", recurrence: "YEARLY", month: 9, day: 1 } });
    const started = await redirectOf(bulkAssignMixAction(form({ contactIds: [dated, undated], mixId: dateMix.id, startDate: today, returnTo: "/contacts" })));
    const undone = await redirectOf(undoBulkMixStartAction(form({ undoId: started.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
    expect(Object.fromEntries(undone.searchParams)).toEqual({ mixUndone: "2", mixStartedId: dateMix.id, mixUndoDates: "1" });
    expect(await prisma.jumpDate.findMany({ where: { dateTypeId: dateType.id, isActive: true }, select: { id: true } })).toEqual([{ id: kept.id }]);
    expect(await prisma.mixAssignment.count({ where: { mixId: dateMix.id, isActive: true } })).toBe(0);
  });

  it("leaves anyone already in the Mix through a tag, its audience, a visit or a Journey path as they are (BLK-02)", async () => {
    const shared = await prisma.mix.create({ data: { workspaceId, name: "Shared follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    const beat = await prisma.mixStep.create({ data: { mixId: shared.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    const tagged = await person("Through a tag"), audience = await person("In the audience"), visiting = await person("Lined up with a visit"), routed = await person("On a Journey path"), fresh = await person("Not in it");
    // A tag that runs the Mix, the Mix's own Everyone audience, and a visit the Mix is lined up with.
    const group = await prisma.group.create({ data: { workspaceId, name: `Shared tag ${suffix}`, memberships: { create: { contactId: tagged } } } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: shared.id, groupId: group.id, assignmentKey: `${workspaceId}:${shared.id}:group:${group.id}`, mode: "DYNAMIC", startDate: new Date() } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: shared.id, contactId: audience, assignmentKey: `${workspaceId}:${shared.id}:audience:${audience}`, mode: "DYNAMIC", startDate: new Date() } });
    const visit = await prisma.calendarEntry.create({ data: { workspaceId, contactId: visiting, kind: "MEETING", title: "Site visit", startsAt: new Date(Date.now() + 3 * 86_400_000), endsAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000), timezone: "UTC" } });
    const visitAssignment = await prisma.mixAssignment.create({ data: { workspaceId, mixId: shared.id, contactId: visiting, assignmentKey: `${workspaceId}:${shared.id}:appointment:${visit.id}:${visiting}` } });
    await prisma.appointmentBinding.create({ data: { workspaceId, contactId: visiting, calendarEntryId: visit.id, mixId: shared.id, assignmentId: visitAssignment.id } });
    await prepareQueued();
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId: shared.id } } });
    await prepareQueued();
    // A Journey path that brought one person into this Mix, with its follow-up waiting.
    const record = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: routed, admissionKey: `path:${routed}`, label: "Shared follow-up", definition: {}, state: {} } });
    await prisma.jump.create({ data: { workspaceId, contactId: routed, mixId: shared.id, mixStepId: beat.id, stepVersionId: versionId, scheduledAt: new Date(Date.now() + 86_400_000), reason: "Shared follow-up", uniquenessKey: `workflow:${record.id}:visit1`, templateSnapshot: {}, renderedSnapshot: {}, workflowInstanceId: record.id, workflowManaged: true } });
    const pendingBefore = await prisma.jump.count({ where: { mixId: shared.id, status: "PENDING" } });
    expect(await prisma.jump.count({ where: { mixId: shared.id, status: "PENDING", contactId: { in: [tagged, audience, routed] } } })).toBe(3);

    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: [tagged, audience, visiting, routed, fresh], mixId: shared.id, startDate: today, returnTo: "/contacts" })));
    // Only the person not in it starts; the notice counts the other four as already in it.
    expect(Object.fromEntries(result.searchParams)).toMatchObject({ mixStarted: "1", mixKept: "4" });
    expect(await prisma.mixAssignment.findMany({ where: { mixId: shared.id, assignmentKey: { in: [tagged, audience, visiting, routed, fresh].map(id => `${workspaceId}:${shared.id}:${id}`) } }, select: { contactId: true } })).toEqual([{ contactId: fresh }]);
    // After the worker's pass, nobody already in it has a second run.
    await prepareQueued();
    expect(await prisma.jump.count({ where: { mixId: shared.id, status: "PENDING" } })).toBe(pendingBefore + 1);
    for (const contactId of [tagged, audience, routed]) expect(await prisma.jump.count({ where: { mixId: shared.id, contactId, status: "PENDING" } })).toBe(1);
  });

  it("refuses the whole batch while billing is on and the plan has no room, and keeps no places (TST-01)", async () => {
    const saved = { enabled: process.env.BILLING_ENABLED, key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET };
    Object.assign(process.env, { BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
    try {
      const { PLANS } = await import("../src/lib/plans");
      const room = PLANS.find(plan => plan.id === "FREE")!.people;
      // Fill the Free plan to one place short of its limit.
      const filler = Array.from({ length: room - 1 - await prisma.planPerson.count({ where: { workspaceId } }) }, (_, index) => ({ id: `plan-filler-${index}-${suffix}`, workspaceId, displayName: `Filler ${index}` }));
      await prisma.contact.createMany({ data: filler });
      await prisma.planPerson.createMany({ data: filler.map(contact => ({ workspaceId, contactId: contact.id })) });
      const pair = [await person("Over one"), await person("Over two")];
      const jobs = await prisma.job.count({ where: { workspaceId } });
      const refused = await redirectOf(bulkAssignMixAction(form({ contactIds: pair, mixId, startDate: today, returnTo: "/contacts?mix=no-mix" })));
      expect(errorFor(refused)).toMatch(/^Your Free plan has room for /);
      expect(refused.searchParams.get("mix")).toBe("no-mix");
      // Nothing was kept: no assignment, no place on the plan, no preparation, no Undo record.
      expect(await prisma.mixAssignment.count({ where: { contactId: { in: pair } } })).toBe(0);
      expect(await prisma.planPerson.count({ where: { contactId: { in: pair } } })).toBe(0);
      expect(await prisma.job.count({ where: { workspaceId } })).toBe(jobs);
      // One person still fits, and takes the last place.
      const fits = await redirectOf(bulkAssignMixAction(form({ contactIds: pair[0], mixId, startDate: today, returnTo: "/contacts" })));
      expect(fits.searchParams.get("mixStarted")).toBe("1");
      expect(await prisma.planPerson.count({ where: { workspaceId } })).toBe(room);
    } finally {
      for (const [name, value] of [["BILLING_ENABLED", saved.enabled], ["STRIPE_SECRET_KEY", saved.key], ["STRIPE_WEBHOOK_SECRET", saved.secret]] as const) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });

  it("refuses the whole batch when the Mix is stopped for one of them, naming them (TST-01)", async () => {
    const willing = await person("Willing"), stoppedPerson = await person("Asked to stop");
    await prisma.mixStop.create({ data: { workspaceId, mixId, contactId: stoppedPerson, reason: "Asked to stop" } });
    const refused = await redirectOf(bulkAssignMixAction(form({ contactIds: [willing, stoppedPerson], mixId, startDate: today, returnTo: "/contacts" })));
    expect(errorFor(refused)).toBe(`Asked to stop ${suffix.slice(0, 6)}: This Mix is stopped for this person. Open More on their contact profile to review and resume the stopped Mix.`);
    expect(await prisma.mixAssignment.count({ where: { contactId: { in: [willing, stoppedPerson] } } })).toBe(0);
    // The stop is never cleared by a start.
    expect(await prisma.mixStop.count({ where: { contactId: stoppedPerson } })).toBe(1);
  });

  it("starts each person once when the same bulk start is submitted twice (TST-01)", async () => {
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Anniversary", slug: `anniversary-${suffix}` } });
    const dateMix = await prisma.mix.create({ data: { workspaceId, name: "Anniversary note", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
    await prisma.mixStep.create({ data: { mixId: dateMix.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    const pair = [await person("Double one"), await person("Double two")];
    const submit = () => redirectOf(bulkAssignMixAction(form({ contactIds: pair, mixId: dateMix.id, startDate: today, returnTo: "/contacts" })));
    // A double tap: both requests arrive together and queue on the plan and contact locks.
    const [first, second] = await Promise.all([submit(), submit()]);
    const again = await submit();
    // One submit starts them; the others find them already in the Mix, keep their start and offer no Undo.
    const results = [first, second, again].map(result => Object.fromEntries(result.searchParams));
    expect(results.filter(result => result.mixStarted === "2" && result.mixDated === "2" && result.mixUndo)).toHaveLength(1);
    expect(results.filter(result => result.mixStarted === "0" && result.mixKept === "2" && !result.mixUndo)).toHaveLength(2);
    expect(await prisma.mixAssignment.count({ where: { mixId: dateMix.id, contactId: { in: pair } } })).toBe(2);
    // The start day is saved as their date once, not once per submit.
    expect(await prisma.jumpDate.count({ where: { dateTypeId: dateType.id, contactId: { in: pair } } })).toBe(2);
  });

  it("refuses the whole batch, before saving anything, when one person cannot start", async () => {
    const ready = await person("Ready");
    const blocked = await person("Do not contact");
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: blocked, doNotContact: true } });
    const refused = await redirectOf(bulkAssignMixAction(form({ contactIds: [ready, blocked], mixId, startDate: today, returnTo: "/contacts?mix=no-mix" })));
    expect(refused.searchParams.get("mix")).toBe("no-mix");
    expect(errorFor(refused)).toMatch(/^Do not contact .*: This person is marked Do not contact\./);
    expect(await prisma.mixAssignment.count({ where: { contactId: { in: [ready, blocked] } } })).toBe(0);
    const pastStart = await redirectOf(bulkAssignMixAction(form({ contactIds: [ready], mixId, startDate: "2020-01-01", returnTo: "/contacts" })));
    expect(errorFor(pastStart)).toBe("Choose a start date from today on.");
  });

  it("is view-only in a support session, with the shared guard's message on the page the owner came from (SEC-01)", async () => {
    const someone = await person("Viewed");
    const started = await redirectOf(bulkAssignMixAction(form({ contactIds: someone, mixId, startDate: today, returnTo: "/contacts" })));
    const context = auth.context;
    auth.context = { ...context, impersonation: { id: "support" } };
    try {
      const refused = await redirectOf(setNoMixNeededAction(form({ contactIds: someone, returnTo: `/contacts/${someone}?noMixCleared=1` })));
      expect(refused.pathname).toBe(`/contacts/${someone}`);
      expect(refused.searchParams.has("noMixCleared")).toBe(false);
      expect(errorFor(refused)).toBe(VIEW_ONLY_SUPPORT_MESSAGE);
      const bulk = await redirectOf(bulkAssignMixAction(form({ contactIds: someone, mixId, startDate: today, returnTo: "/contacts?mix=no-mix" })));
      expect(bulk.searchParams.get("mix")).toBe("no-mix");
      expect(errorFor(bulk)).toBe(VIEW_ONLY_SUPPORT_MESSAGE);
      const undo = await redirectOf(undoBulkMixStartAction(form({ undoId: started.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
      expect(errorFor(undo)).toBe(VIEW_ONLY_SUPPORT_MESSAGE);
      // Nothing was written: the person is still only in the Mix the owner started, and not marked No Mix needed.
      expect(await prisma.mixAssignment.count({ where: { contactId: someone, isActive: true } })).toBe(1);
      expect(await prisma.contactRelationshipState.count({ where: { contactId: someone } })).toBe(0);
    } finally { auth.context = context; }
  });

  it("returns to Today when the owner acted from Today", async () => {
    const supplier = await person("From Today");
    const done = await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, returnTo: "/jumps?range=due" })));
    expect(done.pathname).toBe("/jumps");
    expect(Object.fromEntries(done.searchParams)).toMatchObject({ range: "due", noMixNeeded: "1" });
  });
});
