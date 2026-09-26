import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { readQuietDays, resolveQuietDay } from "../src/lib/quiet-days";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("Quiet-day check-in lifecycle", () => {
  let workspaceId: string, userId: string, stageId: string, mixId: string, stepId: string, versionId: string;
  const now = new Date("2026-09-20T18:00:00Z");
  const old = new Date("2026-07-01T12:00:00Z");
  const read = (contactId?: string, at = now, timezone = "America/Los_Angeles") => readQuietDays({ workspaceId, timezone, contactId, now: at });
  const person = async (name: string, createdAt = old) => prisma.contact.create({ data: { workspaceId, displayName: name, createdAt, journey: { create: { workspaceId, stageId } } } });
  const jump = async (contactId: string, status: "DONE" | "SKIPPED" | "PENDING" = "DONE") => prisma.jump.create({ data: { workspaceId, contactId, mixId, mixStepId: stepId, stepVersionId: versionId, scheduledAt: now, status, completedAt: status === "PENDING" ? null : now, reason: "Fixture", templateSnapshot: {}, renderedSnapshot: {}, uniquenessKey: randomUUID() } });
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `quiet-${randomUUID()}@example.test`, name: "Quiet fixture", passwordHash: "fixture-only" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Quiet fixture" } })).id;
    stageId = (await prisma.journeyStage.create({ data: { workspaceId, name: "Client", position: 0 } })).id;
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Fixture", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Catch up" } } }, include: { versions: true } }); versionId = template.versions[0].id;
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Fixture", triggerMode: "MANUAL_START", status: "ACTIVE", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } }); mixId = mix.id; stepId = mix.steps[0].id;
  });
  afterAll(async () => { if (workspaceId) { await prisma.contactActivity.deleteMany({ where: { workspaceId } }); await prisma.workspacePreference.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: workspaceId } }); } if (userId) await prisma.user.deleteMany({ where: { id: userId } }); });
  it("is opt-in and uses real contact age once enabled", async () => {
    const maria = await person("Maria");
    expect((await read(maria.id)).enabled).toBe(false);
    await prisma.workspacePreference.create({ data: { workspaceId, quietDaysEnabled: true, quietDays: 60 } });
    expect(await read(maria.id)).toMatchObject({ total: 1, days: 60, stageIds: [stageId], items: [expect.objectContaining({ name: "Maria", dueDate: "2026-08-30" })] });
    const recent = await person("Recent", new Date("2026-09-01T12:00:00Z"));
    expect((await read(recent.id)).items).toEqual([]);
  });
  it("counts local calendar days at midnight, including across daylight saving", async () => {
    const contact = await person("Boundary", new Date("2026-07-23T00:30:00Z"));
    expect((await read(contact.id, new Date("2026-09-20T06:59:59Z"))).total).toBe(0);
    expect((await read(contact.id, new Date("2026-09-20T07:00:00Z"))).total).toBe(1);
    expect((await read(contact.id, new Date("2026-09-20T07:00:00Z"), "UTC")).total).toBe(0);
    const dst = await person("DST", new Date("2026-01-08T20:00:00Z"));
    expect((await read(dst.id, new Date("2026-03-09T06:59:59Z"))).total).toBe(0);
    expect((await read(dst.id, new Date("2026-03-09T07:00:00Z"))).total).toBe(1);
  });
  it("resolves from completed follow-ups, and reopening restores the suggestion", async () => {
    const contact = await person("Follow-up completion");
    const task = await jump(contact.id);
    expect((await read(contact.id)).total).toBe(0);
    await prisma.jump.update({ where: { id: task.id }, data: { status: "PENDING", completedAt: null } });
    expect((await read(contact.id)).total).toBe(1);
    const skipped = await person("Unrelated skipped follow-up"); await jump(skipped.id, "SKIPPED");
    expect((await read(skipped.id)).total).toBe(1);
  });
  it("ordinary notes and unsent attempts do not reset the clock; logged conversations do", async () => {
    const contact = await person("Conversation");
    const note = await prisma.contactActivity.create({ data: { workspaceId, contactId: contact.id, actorUserId: userId, kind: "CUSTOMER_NOTE", summary: "Remember an idea", occurredAt: now } });
    expect((await read(contact.id)).total).toBe(1);
    await prisma.contactActivity.update({ where: { id: note.id }, data: { metadata: { conversation: true } } });
    expect((await read(contact.id)).total).toBe(0);
    await prisma.contactActivity.delete({ where: { id: note.id } });
    expect((await read(contact.id)).total).toBe(1);
    await prisma.journeyEvent.create({ data: { workspaceId, contactId: contact.id, eventKey: randomUUID(), eventType: "CONVERSATION_STARTED", source: "Logged conversation", occurredAt: now } });
    expect((await read(contact.id)).total).toBe(0);
  });
  it("a completed meeting resets the clock, while scheduling alone does not", async () => {
    const contact = await person("Meeting");
    const entry = await prisma.calendarEntry.create({ data: { workspaceId, contactId: contact.id, title: "Catch up", kind: "MEETING", startsAt: now, endsAt: new Date(now.getTime() + 3_600_000), timezone: "UTC" } });
    expect((await read(contact.id)).total).toBe(1);
    await prisma.calendarEntry.update({ where: { id: entry.id }, data: { outcome: "COMPLETED", outcomeAt: now } });
    expect((await read(contact.id)).total).toBe(0);
  });
  for (const resolution of ["COMPLETED", "SKIPPED"] as const) it(`${resolution} clears one cycle, survives retries, and returns after another quiet period without moving stage`, async () => {
    const contact = await person(`Explicit ${resolution}`); const suggestion = (await read(contact.id)).items[0];
    const input = { workspaceId, userId, timezone: "America/Los_Angeles", contactId: contact.id, cycle: suggestion.cycle, resolution, now };
    const results = await Promise.all([resolveQuietDay(input), resolveQuietDay(input)]);
    expect(results.every(result => result.resolved)).toBe(true);
    expect((await read(contact.id)).total).toBe(0);
    expect(await prisma.contactActivity.count({ where: { workspaceId, contactId: contact.id, kind: "SYSTEM" } })).toBe(1);
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).stageId).toBe(stageId);
    const later = new Date("2026-11-19T08:00:00Z");
    expect((await read(contact.id, later)).total).toBe(1);
    await resolveQuietDay({ ...input, now: later }); // A delayed retry of the old click must not clear the new suggestion.
    expect((await read(contact.id, later)).total).toBe(1);
  });
  it("rejects stale cycles after a conversation or changed interval", async () => {
    const contact = await person("Stale"); const cycle = (await read(contact.id)).items[0].cycle;
    await prisma.contactActivity.create({ data: { workspaceId, contactId: contact.id, kind: "PRIVATE_UPDATE", visibility: "PRIVATE", summary: "We spoke", metadata: { conversation: true }, occurredAt: now } });
    expect(await resolveQuietDay({ workspaceId, userId, timezone: "America/Los_Angeles", contactId: contact.id, cycle, resolution: "SKIPPED", now })).toMatchObject({ stale: true });
    expect(await prisma.contactActivity.count({ where: { workspaceId, contactId: contact.id, kind: "SYSTEM" } })).toBe(0);
    const another = await person("Changed interval"); const before = (await read(another.id)).items[0];
    await prisma.workspacePreference.update({ where: { workspaceId }, data: { quietDays: 30 } });
    try {
      expect((await read(another.id)).items[0].cycle).not.toBe(before.cycle);
      expect(await resolveQuietDay({ workspaceId, userId, timezone: "America/Los_Angeles", contactId: another.id, cycle: before.cycle, resolution: "COMPLETED", now })).toMatchObject({ stale: true });
      expect(await prisma.contactActivity.count({ where: { workspaceId, contactId: another.id, kind: "SYSTEM" } })).toBe(0);
    } finally { await prisma.workspacePreference.update({ where: { workspaceId }, data: { quietDays: 60 } }); }
  });
  it("excludes archived, do-not-contact and other-workspace people", async () => {
    const archived = await person("Archived"); await prisma.contact.update({ where: { id: archived.id }, data: { archivedAt: now } });
    const blocked = await person("Do not contact"); await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: blocked.id, doNotContact: true } });
    expect((await read(archived.id)).total).toBe(0); expect((await read(blocked.id)).total).toBe(0);
    expect(await resolveQuietDay({ workspaceId: "unrelated", userId, timezone: "UTC", contactId: blocked.id, cycle: "a".repeat(64), resolution: "COMPLETED", now })).toMatchObject({ stale: true });
  });
  it("paginates actual totals and treats search wildcards literally", async () => {
    for (let i = 0; i < 23; i++) await person(`Page ${String(i).padStart(2, "0")}`);
    const input = { workspaceId, timezone: "UTC", query: "Page", now };
    const first = await readQuietDays(input), last = await readQuietDays({ ...input, page: 999 });
    expect(first.total).toBe(23); expect(first.items).toHaveLength(20); expect(last.page).toBe(2); expect(last.items).toHaveLength(3);
    expect(new Set([...first.items, ...last.items].map(item => item.contactId)).size).toBe(23);
    expect((await readQuietDays({ ...input, query: "%" })).total).toBe(0);
  });
});
