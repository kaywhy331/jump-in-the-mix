import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { journeyRosterIds } from "@/lib/journey-roster";
import { JOURNEY_DUE_FILTERS, journeyDates, journeyDueWhere, journeyMixMembers } from "@/lib/journey-view";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("Journey roster with real memberships and pagination", () => {
  let workspaceId: string, otherWorkspaceId: string, userId: string, stageId: string, mixId: string;
  const prefix = randomUUID();
  const id = (index: number) => `${prefix}-${index}`;
  const dates = journeyDates(new Date("2026-09-19T12:00Z"), "UTC");
  const input = () => ({ workspaceId, stageId, query: "", due: "all" as const, dates, page: 1 });
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `roster-${prefix}@example.test`, name: "Roster fixture", passwordHash: "fixture-only" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Roster", slug: `roster-${prefix}` } })).id;
    otherWorkspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Other", slug: `other-${prefix}` } })).id;
    stageId = (await prisma.journeyStage.create({ data: { workspaceId, name: "Lead", position: 0 } })).id;
    const otherStage = await prisma.journeyStage.create({ data: { workspaceId: otherWorkspaceId, name: "Lead", position: 0 } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Text", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Fixture" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Check-in", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } }); mixId = mix.id;
    await prisma.contact.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ id: id(index), workspaceId: index === 54 ? otherWorkspaceId : workspaceId, displayName: `Person ${String(55-index).padStart(2,"0")}`, archivedAt: index === 53 ? new Date() : null })) });
    await prisma.contactJourney.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ contactId: id(index), workspaceId: index === 54 ? otherWorkspaceId : workspaceId, stageId: index === 54 ? otherStage.id : stageId })) });
    await prisma.jump.createMany({ data: Array.from({ length: 52 }, (_, index) => ({ workspaceId, contactId: id(index), mixId, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt: new Date(dates.start.getTime() + (index-1)*86_400_000), uniquenessKey: `${prefix}-jump-${index}`, reason: "Roster fixture", templateSnapshot: {}, renderedSnapshot: {} })) });
    // A second, later follow-up must not count this overdue person twice.
    await prisma.jump.create({ data: { workspaceId, contactId: id(0), mixId, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt: dates.tomorrow, uniquenessKey: `${prefix}-extra`, reason: "Later fixture", templateSnapshot: {}, renderedSnapshot: {} } });
    const group = await prisma.group.create({ data: { workspaceId, name: "Group audience", memberships: { create: { contactId: id(52) } }, assignments: { create: { workspaceId, mixId, mode: "DYNAMIC", assignmentKey: `${prefix}-group` } } } });
    expect(group.id).toBeTruthy();
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  it("orders across page boundaries by next follow-up and excludes archived or foreign people", async () => {
    const first = await journeyRosterIds(input());
    const second = await journeyRosterIds({ ...input(), page: 2 });
    expect(first.map(row => row.id)).toEqual(Array.from({ length: 50 }, (_, i) => id(i)));
    expect(second.map(row => row.id)).toEqual([id(50), id(51), id(52)]);
    expect(await journeyRosterIds({ ...input(), workspaceId: otherWorkspaceId })).toEqual([]);
    expect(await journeyRosterIds({ ...input(), query: "Person 55" })).toEqual([{ id: id(0) }]);
    expect(await journeyRosterIds({ ...input(), query: "' OR 1=1 --" })).toEqual([]);
  });
  it("keeps counts and roster buckets exclusive, including group members with nothing scheduled", async () => {
    const counts: number[] = [];
    for (const due of JOURNEY_DUE_FILTERS.slice(1)) {
      const where = { AND: [{ workspaceId, archivedAt: null }, journeyMixMembers(workspaceId, mixId), journeyDueWhere(due, dates, mixId)] };
      const count = await prisma.contact.count({ where }); counts.push(count);
      expect(await journeyRosterIds({ ...input(), stageId: undefined, mixId, due })).toHaveLength(count);
    }
    expect(counts).toEqual([1, 1, 6, 44, 1]);
    expect(await journeyRosterIds({ ...input(), stageId: undefined, mixId, due: "quiet" })).toEqual([{ id: id(52) }]);
    await prisma.mixAssignment.updateMany({ where: { workspaceId, mixId }, data: { isActive: false } });
    expect(await journeyRosterIds({ ...input(), stageId: undefined, mixId, due: "quiet" })).toEqual([]);
    expect(await prisma.contact.count({ where: { AND: [{ workspaceId, archivedAt: null }, journeyMixMembers(workspaceId, mixId)] } })).toBe(52);
  });
});
