import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("../src/lib/prisma");
const { contactIdsWithMixStatus, contactMixCounts, contactMixStatus, contactMixStatuses } = await import("../src/lib/contact-mix-status");

describe.sequential("whether a person is in a Mix (JITM-09 §2.76)", () => {
  const suffix = randomUUID().replaceAll("-", "");
  let userId = "";
  let workspaceId = "";
  let otherWorkspaceId = "";
  let realMix = { id: "", stepId: "", versionId: "" };
  let oneTimeMix = { id: "", stepId: "", versionId: "" };
  let dateMix = { id: "", stepId: "", versionId: "" };
  let dateTypeId = "";
  const day = 86_400_000;

  async function mix(name: string, data: Record<string, unknown> = {}) {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Checking in" } });
    const created = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START", ...data } });
    const step = await prisma.mixStep.create({ data: { mixId: created.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    return { id: created.id, stepId: step.id, versionId: version.id };
  }
  async function person(name: string) {
    return (await prisma.contact.create({ data: { workspaceId, displayName: `${name} ${suffix.slice(0, 6)}` } })).id;
  }
  async function jump(contactId: string, target: typeof realMix, status: "PENDING" | "DONE" | "CANCELED" = "PENDING", extra: { completionMethod?: string; createdAt?: Date } = {}) {
    return prisma.jump.create({ data: {
      workspaceId, contactId, mixId: target.id, mixStepId: target.stepId, stepVersionId: target.versionId,
      scheduledAt: new Date(), reason: "Check in", status, completedAt: status === "DONE" ? new Date() : null,
      uniquenessKey: `mix-status-${randomUUID()}`, templateSnapshot: { channel: "SMS", body: "Hi" }, renderedSnapshot: { body: "Hi" }, ...extra
    } });
  }
  /** A row as it stood before this test: created and last written `ago` ms earlier. */
  const backdate = (jumpId: string, ago: number) => prisma.$executeRaw`UPDATE "Jump" SET "createdAt" = ${new Date(Date.now() - ago)}, "updatedAt" = ${new Date(Date.now() - ago)} WHERE id = ${jumpId}`;
  const status = (contactId: string, now?: Date) => contactMixStatus(workspaceId, contactId, now);
  /** A preparation job as the app queues it; the worker marks it done once it has run (src/worker/index.ts). */
  const queue = (payload: { contactId?: string; mixId?: string; contactIds?: string[] }) => prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload } });
  const prepared = () => prisma.job.updateMany({ where: { workspaceId, completedAt: null }, data: { completedAt: new Date() } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `mix-status-${suffix}@example.com`, name: "Mix Status", passwordHash: "test-only", emailVerifiedAt: new Date() } });
    userId = user.id;
    const [workspace, other] = await Promise.all([
      prisma.workspace.create({ data: { name: "Mix status", slug: `mix-status-${suffix}`, ownerId: user.id, profile: { create: {} } } }),
      prisma.workspace.create({ data: { name: "Mix status other", slug: `mix-status-other-${suffix}`, ownerId: user.id, profile: { create: {} } } })
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    dateTypeId = (await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Renewal", slug: `renewal-${suffix}` } })).id;
    realMix = await mix("Estimate follow-up");
    oneTimeMix = await mix("One-time", { source: "ONE_TIME" });
    dateMix = await mix("Renewal reminder", { triggerMode: "DATE_TRIGGERED", dateTypeId });
  });

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("calls someone with nothing, or only a one-time follow-up, No Mix", async () => {
    const nobody = await person("Nobody");
    const oneTime = await person("One time");
    await jump(oneTime, oneTimeMix);
    expect(await status(nobody)).toBe("no-mix");
    expect(await status(oneTime)).toBe("no-mix");
  });

  it("counts a pending Beat in a real Mix, and not once every Beat is done", async () => {
    const active = await person("Active");
    await jump(active, realMix);
    expect(await status(active)).toBe("in-mix");
    const finished = await person("Finished");
    await jump(finished, realMix, "DONE");
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: realMix.id, contactId: finished, assignmentKey: `${workspaceId}:${realMix.id}:${finished}`, startDate: new Date() } });
    // A finished Mix is not a Mix the person is in, however recently its assignment was written.
    expect(await status(finished)).toBe("no-mix");
  });

  it("counts a Mix just started while its Beats are being prepared, unless it is stopped (DEF-01)", async () => {
    const started = await person("Started");
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: realMix.id, contactId: started, assignmentKey: `${workspaceId}:${realMix.id}:${started}`, startDate: new Date() } });
    // An assignment alone is not work to come: nothing is preparing Beats for it.
    expect(await status(started)).toBe("no-mix");
    await queue({ contactId: started, mixId: realMix.id });
    expect(await status(started)).toBe("in-mix");
    // A failed preparation is shown on Today with Retry; the person no longer reads as being prepared.
    await prisma.job.updateMany({ where: { workspaceId, completedAt: null }, data: { failedAt: new Date() } });
    expect(await status(started)).toBe("no-mix");
    await queue({ contactId: started, mixId: realMix.id });
    await prisma.mixStop.create({ data: { workspaceId, mixId: realMix.id, contactId: started, reason: "plan.limit" } });
    expect(await status(started)).toBe("no-mix");
    await prepared();
  });

  it("gives a restart its grace, but never a save or an edit of a Mix someone finished (DEF-01)", async () => {
    const finished = await person("Finished again");
    await jump(finished, realMix, "DONE");
    const assignment = await prisma.mixAssignment.create({ data: { workspaceId, mixId: realMix.id, contactId: finished, assignmentKey: `${workspaceId}:${realMix.id}:${finished}`, startDate: new Date(Date.now() - 30 * day) } });
    // A save of the Mix rewrites its assignments and queues the whole Mix; an edit of the person queues them alone.
    await prisma.mixAssignment.update({ where: { id: assignment.id }, data: { isActive: true, startDate: assignment.startDate } });
    await queue({ mixId: realMix.id });
    await queue({ contactId: finished });
    await queue({});
    expect(await status(finished)).toBe("no-mix");
    // Starting them again names them and the Mix, so they read as in it while the new Beats are prepared.
    await queue({ contactId: finished, mixId: realMix.id });
    expect(await status(finished)).toBe("in-mix");
    await prepared();
    expect(await status(finished)).toBe("no-mix");
    // A bulk start names its people in one job for the Mix (PERF-01).
    await queue({ mixId: realMix.id, contactIds: [finished] });
    expect(await status(finished)).toBe("in-mix");
    await prepared();
    expect(await status(finished)).toBe("no-mix");
  });

  it("counts the people of a tag while the tag's Mix prepares their first Beats (DEF-01)", async () => {
    const group = await prisma.group.create({ data: { workspaceId, name: `Kitchens ${suffix}` } });
    const longStanding = await person("Long-standing");
    await prisma.contactGroupMembership.create({ data: { contactId: longStanding, groupId: group.id, createdAt: new Date(Date.now() - 30 * day) } });
    // The Mix is added to a tag the person has been in for a month.
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: realMix.id, groupId: group.id, assignmentKey: `${workspaceId}:${realMix.id}:group:${group.id}`, startDate: new Date(), mode: "DYNAMIC" } });
    await queue({ mixId: realMix.id });
    expect(await status(longStanding)).toBe("in-mix");
    // Someone joining the tag later is covered by the account-wide preparation that adding a tag member queues.
    await prepared();
    const tagged = await person("Tagged");
    await prisma.contactGroupMembership.create({ data: { contactId: tagged, groupId: group.id } });
    expect(await status(tagged)).toBe("no-mix");
    await queue({});
    expect(await status(tagged)).toBe("in-mix");
    // A hidden tag runs no Mix.
    await prisma.contactGroupState.create({ data: { workspaceId, groupId: group.id, isActive: false } });
    expect(await status(tagged)).toBe("no-mix");
    await prisma.contactGroupState.deleteMany({ where: { groupId: group.id } });
    await prepared();
    expect(await status(tagged)).toBe("no-mix");
  });

  it("never reads a date-based Mix, or one that waits for a visit, as being prepared for everyone (DEF-01)", async () => {
    const undated = await person("No renewal date");
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: dateMix.id, contactId: undated, assignmentKey: `${workspaceId}:${dateMix.id}:${undated}` } });
    const visitOnly = await mix("Visit follow-up");
    await prisma.mixStep.updateMany({ where: { mixId: visitOnly.id }, data: { anchor: "APPOINTMENT_END", offsetMinutes: 60 } });
    const visitor = await person("Waiting for a visit");
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: visitOnly.id, contactId: visitor, assignmentKey: `${workspaceId}:${visitOnly.id}:${visitor}`, startDate: new Date() } });
    await queue({});
    await queue({ mixId: dateMix.id });
    await queue({ mixId: visitOnly.id });
    expect(await status(undated)).toBe("no-mix");
    expect(await status(visitor)).toBe("no-mix");
    // Their own start still reads as being prepared.
    await queue({ contactId: visitor, mixId: visitOnly.id });
    expect(await status(visitor)).toBe("in-mix");
    await prepared();
  });

  it("counts Journey work through its follow-ups and real waiting state, never its status alone (JRN-01)", async () => {
    // As the scheduler records a start in an account with a Journey connection: a record that starts as {}.
    const record = async (contactId: string, data: { status?: string; state?: object } = {}) => prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, admissionKey: `legacy:${contactId}:${randomUUID()}`, label: "Estimate", definition: {}, state: {}, ...data } });
    const linked = async (contactId: string, instanceId: string, status: "PENDING" | "DONE" | "CANCELED", extra: { completionMethod?: string; workflowManaged?: boolean; target?: typeof realMix } = {}) =>
      prisma.jump.update({ where: { id: (await jump(contactId, extra.target ?? realMix, status, { completionMethod: extra.completionMethod })).id }, data: { workflowInstanceId: instanceId, workflowManaged: extra.workflowManaged ?? false } });
    // The last Beat was just done: the record is still ACTIVE and its saved state not yet updated (#128's case).
    const justDone = await person("Just done");
    const doneRecord = await record(justDone);
    await linked(justDone, doneRecord.id, "DONE");
    expect(await status(justDone)).toBe("no-mix");
    // A follow-up still to come counts.
    const running = await person("Journey running");
    await linked(running, (await record(running)).id, "PENDING");
    expect(await status(running)).toBe("in-mix");
    // Journey work the owner paused, held as the Journey pass holds it, counts; once the record finishes it does not (D45).
    const paused = await person("Journey paused");
    const pausedRecord = await record(paused, { status: "PAUSED" });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: realMix.id, contactId: paused, assignmentKey: `${workspaceId}:${realMix.id}:${paused}`, startDate: new Date() } });
    await linked(paused, pausedRecord.id, "CANCELED", { completionMethod: "workflow_held" });
    expect(await status(paused)).toBe("in-mix");
    await prisma.mixWorkflowInstance.update({ where: { id: pausedRecord.id }, data: { status: "FINISHED" } });
    expect(await status(paused)).toBe("no-mix");
    // A Journey follow-up held because its Mix is paused counts (D45); one cancelled because the Mix was stopped does not.
    const pausedMix = await mix("Paused Journey Mix", { status: "PAUSED" });
    const held = await person("Journey held by a pause");
    await linked(held, (await record(held)).id, "CANCELED", { completionMethod: "workflow_held", workflowManaged: true, target: pausedMix });
    expect(await status(held)).toBe("in-mix");
    const stopped = await person("Journey stopped");
    await linked(stopped, (await record(stopped)).id, "CANCELED", { completionMethod: "mix_stopped_for_contact", workflowManaged: true });
    expect(await status(stopped)).toBe("no-mix");
    // The account's Journey connections: one on, one paused by the owner (JRN-02).
    await prisma.mixWorkflow.upsert({ where: { workspaceId }, create: { workspaceId, configuration: { rules: [{ id: "rule-on", enabled: true }, { id: "rule-paused", enabled: false }] } }, update: { configuration: { rules: [{ id: "rule-on", enabled: true }, { id: "rule-paused", enabled: false }] } } });
    // A decision waiting for the owner counts while its Mix is open to the person, and not once it is stopped for them.
    const deciding = await person("Decision waiting");
    await record(deciding, { state: { runs: [{ id: "run1", mixId: realMix.id, status: "FINISHED" }], evaluations: [{ id: "decision1", ruleId: "rule-on", runId: "run1", status: "WAITING" }] } });
    expect(await status(deciding)).toBe("in-mix");
    await prisma.mixStop.create({ data: { workspaceId, mixId: realMix.id, contactId: deciding, reason: "Asked to stop" } });
    expect(await status(deciding)).toBe("no-mix");
    // A path waiting to start another Mix counts while that Mix is open, and not once it is archived.
    const archivedMix = await mix("Archived destination", { status: "ARCHIVED" });
    const routed = await person("Path waiting");
    const path = (target: string) => ({ runs: [{ id: "run1", mixId: realMix.id, status: "FINISHED" }], evaluations: [{ id: "decision1", ruleId: "rule-on", runId: "run1", status: "ROUTED" }], transitions: [{ id: "path1", evaluationId: "decision1", status: "WAITING", target: { mixId: target, stepId: null } }] });
    const routedRecord = await record(routed, { state: path(dateMix.id) });
    expect(await status(routed)).toBe("in-mix");
    await prisma.mixWorkflowInstance.update({ where: { id: routedRecord.id }, data: { state: path(archivedMix.id) } });
    expect(await status(routed)).toBe("no-mix");
  });

  it("counts a Journey wait only while it can still move: never on a removed connection or at a repeat limit (JRN-02)", async () => {
    await prisma.mixWorkflow.upsert({ where: { workspaceId }, create: { workspaceId, configuration: { rules: [{ id: "rule-on", enabled: true }, { id: "rule-paused", enabled: false }] } }, update: { configuration: { rules: [{ id: "rule-on", enabled: true }, { id: "rule-paused", enabled: false }] } } });
    const record = async (name: string, state: object) => {
      const contactId = await person(name);
      await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, admissionKey: `waits:${contactId}`, label: "Estimate", definition: {}, state } });
      return contactId;
    };
    const finished = [{ id: "run1", mixId: realMix.id, status: "FINISHED" }];
    const decision = (ruleId: string) => ({ runs: finished, evaluations: [{ id: "decision1", ruleId, runId: "run1", status: "WAITING" }] });
    const path = (ruleId: string, status: string, reason: string | null) => ({ runs: finished, evaluations: [{ id: "decision1", ruleId, runId: "run1", status: "ROUTED" }], transitions: [{ id: "path1", evaluationId: "decision1", status, reason, target: { mixId: dateMix.id, stepId: null } }] });
    const choice = (ruleIds: string[]) => ({ runs: finished, pendingChoices: [{ requestId: "choice1", visitId: "visit1", sourceCompletedAt: new Date().toISOString(), decisions: ruleIds.map(ruleId => ({ ruleId, outcome: "Booked" })) }] });
    // A decision on a connection that is on, or that the owner paused and can resume, can still move; one on a
    // removed connection never can.
    expect(await Promise.all([decision("rule-on"), decision("rule-paused"), decision("rule-removed")].map((state, index) => record(`Decision ${index}`, state).then(status)))).toEqual(["in-mix", "in-mix", "no-mix"]);
    // The same for a path; and a path held at its repeat limit never moves.
    expect(await Promise.all([
      path("rule-on", "WAITING", null), path("rule-removed", "HELD", "This connection is paused or has been removed. Enable it in Journey or stop this instance."),
      path("rule-on", "HELD", "Repeat limit reached (2). Finish this instance or start new work deliberately."), path("rule-on", "HELD", "The destination Mix is paused, stopped or unavailable.")
    ].map((state, index) => record(`Path ${index}`, state).then(status)))).toEqual(["in-mix", "no-mix", "no-mix", "in-mix"]);
    // A choice being applied counts while every connection it uses is still there.
    expect(await Promise.all([choice(["rule-on"]), choice(["rule-on", "rule-removed"])].map((state, index) => record(`Choice ${index}`, state).then(status)))).toEqual(["in-mix", "no-mix"]);
  });

  it("counts the Beats a paused Mix holds for its people, and only theirs (DEF-02, D45)", async () => {
    const paused = await mix("Paused for the season", { status: "PAUSED" });
    const enroll = (contactId: string) => prisma.mixAssignment.create({ data: { workspaceId, mixId: paused.id, contactId, assignmentKey: `${workspaceId}:${paused.id}:${contactId}`, startDate: new Date() } });
    // Future Beats the pause held, and an overdue one the worker's next pass cancelled while it is paused.
    const ahead = await person("Held ahead");
    await enroll(ahead);
    await jump(ahead, paused, "CANCELED", { completionMethod: "mix_paused" });
    const overdue = await person("Held overdue");
    await enroll(overdue);
    await jump(overdue, paused, "CANCELED", { completionMethod: "reconciled" });
    expect(await status(ahead)).toBe("in-mix");
    expect(await status(overdue)).toBe("in-mix");
    // Someone stopped in the Mix, or taken out of it, has nothing held for them.
    await prisma.mixStop.create({ data: { workspaceId, mixId: paused.id, contactId: overdue, reason: "Asked to stop" } });
    expect(await status(overdue)).toBe("no-mix");
    await prisma.mixAssignment.updateMany({ where: { mixId: paused.id, contactId: ahead }, data: { isActive: false } });
    expect(await status(ahead)).toBe("no-mix");
    // An old row a retimed Beat replaced is not held work: this person finished the Mix before the pause.
    const finished = await person("Finished before the pause");
    await enroll(finished);
    await jump(finished, paused, "CANCELED", { completionMethod: "reconciled", createdAt: new Date(Date.now() - 3 * day) });
    await jump(finished, paused, "DONE", { createdAt: new Date(Date.now() - 2 * day) });
    expect(await status(finished)).toBe("no-mix");
    // Someone who joins the paused Mix's tag, with nothing prepared for them yet, is one of its people too (PAUSE-01).
    const group = await prisma.group.create({ data: { workspaceId, name: `Paused tag ${suffix}` } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: paused.id, groupId: group.id, assignmentKey: `${workspaceId}:${paused.id}:group:${group.id}`, mode: "DYNAMIC", startDate: new Date() } });
    const joiner = await person("Joined during the pause");
    await prisma.contactGroupMembership.create({ data: { contactId: joiner, groupId: group.id } });
    expect(await status(joiner)).toBe("in-mix");
    // Not once the person is stopped in it.
    await prisma.mixStop.create({ data: { workspaceId, mixId: paused.id, contactId: joiner, reason: "Asked to stop" } });
    expect(await status(joiner)).toBe("no-mix");
    // A paused date-based Mix still holds the next date of a repeating one.
    const pausedDates = await mix("Paused renewals", { status: "PAUSED", triggerMode: "DATE_TRIGGERED", dateTypeId });
    const renewing = await person("Renewing");
    await prisma.jumpDate.create({ data: { workspaceId, contactId: renewing, dateTypeId, timezone: "UTC", recurrence: "YEARLY", month: 6, day: 1 } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: pausedDates.id, contactId: renewing, assignmentKey: `${workspaceId}:${pausedDates.id}:${renewing}` } });
    expect(await status(renewing)).toBe("in-mix");
  });

  it("counts a date-based Mix waiting for a repeating or future date, not a past one", async () => {
    const yearly = await person("Yearly");
    const past = await person("Past date");
    for (const [contactId, date] of [[yearly, { recurrence: "YEARLY" as const, month: 3, day: 14 }], [past, { recurrence: "NONE" as const, dateValue: new Date(Date.now() - 400 * day) }]] as const) {
      await prisma.jumpDate.create({ data: { workspaceId, contactId, dateTypeId, timezone: "UTC", ...date } });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: dateMix.id, contactId, assignmentKey: `${workspaceId}:${dateMix.id}:${contactId}` } });
    }
    const later = new Date(Date.now() + 2 * day);
    expect(await status(yearly, later)).toBe("in-mix");
    expect(await status(past, later)).toBe("no-mix");
  });

  it("shows Do not contact instead of a Mix status", async () => {
    const blocked = await person("Blocked");
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: blocked, doNotContact: true } });
    expect(await status(blocked)).toBe("do-not-contact");
  });

  it("keeps No Mix needed until a Mix starts for the person, then lets it lapse", async () => {
    const vendor = await person("Vendor");
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: vendor, noMixNeededAt: new Date() } });
    expect(await status(vendor)).toBe("no-mix-needed");
    const started = await jump(vendor, realMix);
    expect(await status(vendor)).toBe("in-mix");
    await prisma.jump.update({ where: { id: started.id }, data: { status: "DONE", completedAt: new Date() } });
    expect(await status(vendor)).toBe("no-mix");
    // A resumed Mix brings back its held rows instead of creating new ones; that also makes it lapse (D45).
    const resumed = await person("Resumed");
    const heldRow = await jump(resumed, realMix, "CANCELED", { completionMethod: "mix_paused" });
    await backdate(heldRow.id, 3 * day);
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: resumed, noMixNeededAt: new Date(Date.now() - day) } });
    expect(await status(resumed)).toBe("no-mix-needed");
    await prisma.jump.update({ where: { id: heldRow.id }, data: { status: "PENDING", completionMethod: null } });
    expect(await status(resumed)).toBe("in-mix");
    await prisma.jump.update({ where: { id: heldRow.id }, data: { status: "DONE", completedAt: new Date() } });
    expect(await status(resumed)).toBe("no-mix");
    // A one-time follow-up is not a Mix, so it never clears the confirmation.
    const friend = await person("Friend");
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: friend, noMixNeededAt: new Date(Date.now() - 1000) } });
    await jump(friend, oneTimeMix);
    expect(await status(friend)).toBe("no-mix-needed");
  });

  it("agrees across the page read, the filter and the counts, within one workspace", async () => {
    const people = await prisma.contact.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true } });
    const statuses = await contactMixStatuses(workspaceId, people.map(item => item.id));
    const counts = await contactMixCounts(workspaceId);
    for (const value of ["in-mix", "no-mix", "no-mix-needed"] as const) {
      const ids = await contactIdsWithMixStatus(workspaceId, value);
      expect(new Set(ids)).toEqual(new Set([...statuses].filter(([, item]) => item === value).map(([id]) => id)));
      expect(counts[value]).toBe(ids.length);
    }
    // Counted among the people a filtered list shows, the counts cover just them (D47).
    const among = people.slice(0, 3).map(item => item.id);
    const scoped = await contactMixCounts(workspaceId, undefined, among);
    for (const value of ["in-mix", "no-mix", "no-mix-needed", "do-not-contact"] as const) expect(scoped[value]).toBe(among.filter(id => statuses.get(id) === value).length);
    expect(Object.values(await contactMixCounts(workspaceId, undefined, [])).every(count => count === 0)).toBe(true);
    expect(Object.values(await contactMixCounts(otherWorkspaceId, undefined, among)).every(count => count === 0)).toBe(true);
    expect(await contactIdsWithMixStatus(otherWorkspaceId, "no-mix")).toEqual([]);
    const archived = await person("Archived");
    await prisma.contact.update({ where: { id: archived }, data: { archivedAt: new Date() } });
    expect(await status(archived)).toBeNull();
    expect((await contactMixStatuses(otherWorkspaceId, people.map(item => item.id))).size).toBe(0);
  });
});
