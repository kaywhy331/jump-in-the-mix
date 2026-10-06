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
  async function jump(contactId: string, target: typeof realMix, status: "PENDING" | "DONE" = "PENDING") {
    return prisma.jump.create({ data: {
      workspaceId, contactId, mixId: target.id, mixStepId: target.stepId, stepVersionId: target.versionId,
      scheduledAt: new Date(), reason: "Check in", status, completedAt: status === "DONE" ? new Date() : null,
      uniquenessKey: `mix-status-${randomUUID()}`, templateSnapshot: { channel: "SMS", body: "Hi" }, renderedSnapshot: { body: "Hi" }
    } });
  }
  const status = (contactId: string, now?: Date) => contactMixStatus(workspaceId, contactId, now);

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
    // After the preparation grace, a finished Mix is not a Mix the person is in.
    expect(await status(finished, new Date(Date.now() + 2 * day))).toBe("no-mix");
  });

  it("gives a just-started Mix a day for its Beats to be prepared, unless it is stopped", async () => {
    const started = await person("Started");
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: realMix.id, contactId: started, assignmentKey: `${workspaceId}:${realMix.id}:${started}`, startDate: new Date() } });
    expect(await status(started)).toBe("in-mix");
    expect(await status(started, new Date(Date.now() + 2 * day))).toBe("no-mix");
    await prisma.mixStop.create({ data: { workspaceId, mixId: realMix.id, contactId: started, reason: "plan.limit" } });
    expect(await status(started)).toBe("no-mix");
  });

  it("counts a new tag member while the tag's Mix prepares their Beats", async () => {
    const group = await prisma.group.create({ data: { workspaceId, name: `Kitchens ${suffix}` } });
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: realMix.id, groupId: group.id, assignmentKey: `${workspaceId}:${realMix.id}:group:${group.id}`, startDate: new Date(), mode: "DYNAMIC" } });
    const tagged = await person("Tagged");
    await prisma.contactGroupMembership.create({ data: { contactId: tagged, groupId: group.id } });
    expect(await status(tagged)).toBe("in-mix");
    expect(await status(tagged, new Date(Date.now() + 2 * day))).toBe("no-mix");
  });

  it("counts running or paused Journey work", async () => {
    const working = await person("Working");
    const instance = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: working, admissionKey: `manual:${working}:${suffix}`, label: "Estimate", definition: {}, state: {} } });
    expect(await status(working)).toBe("in-mix");
    await prisma.mixWorkflowInstance.update({ where: { id: instance.id }, data: { status: "PAUSED" } });
    expect(await status(working)).toBe("in-mix");
    await prisma.mixWorkflowInstance.update({ where: { id: instance.id }, data: { status: "FINISHED" } });
    expect(await status(working)).toBe("no-mix");
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
    expect(await contactIdsWithMixStatus(otherWorkspaceId, "no-mix")).toEqual([]);
    const archived = await person("Archived");
    await prisma.contact.update({ where: { id: archived }, data: { archivedAt: new Date() } });
    expect(await status(archived)).toBeNull();
    expect((await contactMixStatuses(otherWorkspaceId, people.map(item => item.id))).size).toBe(0);
  });
});
