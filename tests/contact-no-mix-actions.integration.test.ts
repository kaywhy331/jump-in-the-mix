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
    expect(audits.map(audit => (audit.metadata as { result: string }).result).sort()).toEqual(["already-running", "started", "started"]);
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

  it("undoes a bulk start: it ends only the starts it made and keeps every completed follow-up (UX-01, D46)", async () => {
    const twoBeats = await prisma.mix.create({ data: { workspaceId, name: "Two-step follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    const first = await prisma.mixStep.create({ data: { mixId: twoBeats.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixStep.create({ data: { mixId: twoBeats.id, stepVersionId: versionId, dayOffset: 7, sortOrder: 2 } });
    const assignmentKey = (contactId: string) => `${workspaceId}:${twoBeats.id}:${contactId}`;
    const fresh = await person("Undo fresh"), finished = await person("Undo finished"), running = await person("Undo running"), changed = await person("Undo changed"), tagged = await person("Undo tagged");
    // Finished the Mix a month ago; already in it with a follow-up to come.
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: twoBeats.id, contactId: finished, assignmentKey: assignmentKey(finished), startDate: new Date(Date.now() - 30 * 86_400_000) } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: twoBeats.id, contactId: running, assignmentKey: assignmentKey(running), startDate: new Date(Date.now() - 2 * 86_400_000) } });
    // A tag that runs this Mix from the same day; one of them joins it after the bulk start.
    const group = await prisma.group.create({ data: { workspaceId, name: `Undo tag ${suffix}` } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: twoBeats.id, groupId: group.id, assignmentKey: `${workspaceId}:${twoBeats.id}:group:${group.id}`, mode: "DYNAMIC", startDate: new Date(`${today}T12:00:00Z`) } });
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId: twoBeats.id } } });
    await prepareQueued();
    await prisma.jump.updateMany({ where: { contactId: finished }, data: { status: "DONE", completedAt: new Date(Date.now() - 20 * 86_400_000), completionMethod: "outcome:sent" } });
    const history = await prisma.jump.findMany({ where: { contactId: finished }, select: { id: true, status: true, completedAt: true }, orderBy: { id: "asc" } });
    expect(history).toHaveLength(2);
    const runningBefore = await prisma.jump.findMany({ where: { contactId: running }, select: { id: true, status: true } });

    const started = await redirectOf(bulkAssignMixAction(form({ contactIds: [fresh, finished, running, changed, tagged], mixId: twoBeats.id, startDate: today, returnTo: "/contacts?mix=no-mix" })));
    expect(Object.fromEntries(started.searchParams)).toMatchObject({ mix: "no-mix", mixStarted: "4", mixKept: "1", mixStartedId: twoBeats.id });
    const undoId = started.searchParams.get("mixUndo")!;
    expect(undoId).toBeTruthy();
    await prepareQueued();
    await prisma.contactGroupMembership.create({ data: { contactId: tagged, groupId: group.id } });
    // The fresh person has done their first follow-up; someone else started the changed person again on their own.
    await prisma.jump.updateMany({ where: { contactId: fresh, mixStepId: first.id }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:sent" } });
    await prisma.mixAssignment.update({ where: { assignmentKey: assignmentKey(changed) }, data: { startDate: new Date(`${today}T13:00:00Z`) } });

    const undone = await redirectOf(undoBulkMixStartAction(form({ undoId, returnTo: "/contacts?mix=no-mix&mixStarted=4&mixUndo=old" })));
    expect(Object.fromEntries(undone.searchParams)).toEqual({ mix: "no-mix", mixUndone: "3", mixStartedId: twoBeats.id, mixUndoKept: "1" });
    for (const contactId of [fresh, finished, tagged]) expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: assignmentKey(contactId) } })).isActive).toBe(false);
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
    expect(await Promise.all([fresh, finished].map(contactId => contactMixStatus(workspaceId, contactId)))).toEqual(["no-mix", "no-mix"]);
    // The tag still runs the Mix for its member, so the worker's next pass brings their follow-ups back.
    await prepareQueued();
    expect(await prisma.jump.count({ where: { contactId: tagged, status: "PENDING" } })).toBe(2);
    expect(await contactMixStatus(workspaceId, tagged)).toBe("in-mix");

    // A second tap finds nothing left to end.
    const again = await redirectOf(undoBulkMixStartAction(form({ undoId, returnTo: "/contacts" })));
    expect(Object.fromEntries(again.searchParams)).toMatchObject({ mixUndone: "0", mixUndoKept: "4" });
    // Another account's record, or none, undoes nothing.
    expect(Object.fromEntries((await redirectOf(undoBulkMixStartAction(form({ undoId: "unknown", returnTo: "/contacts" })))).searchParams)).toEqual({ mixUndone: "0" });
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
