import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseTodayCursor, readTodayPage, todayCursor, TODAY_PAGE_SIZE } from "@/lib/today-list";
import type { JumpStatus, Prisma } from "@/generated/prisma/client";

it("rejects malformed ordering positions without trusting their fields", () => {
  for (const value of [undefined, [], "", "x".repeat(601), "not-json", Buffer.from(JSON.stringify({ pending: true, scheduledAt: "0000-01-01T00:00:00.000Z", id: "item" })).toString("base64url"), Buffer.from(JSON.stringify({ pending: true, scheduledAt: "2026-02-30T00:00:00.000Z", id: "item" })).toString("base64url")]) expect(parseTodayCursor(value)).toBeNull();
  expect(parseTodayCursor(todayCursor({ id: "item-1", status: "PENDING", scheduledAt: new Date("2026-09-06T10:00:00.000Z") }))).toEqual({ pending: true, scheduledAt: "2026-09-06T10:00:00.000Z", id: "item-1" });
});

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("Today cursor navigation", () => {
  let userId: string, workspaceId: string, foreignId: string;
  let fixture: { contactId: string; mixId: string; mixStepId: string; stepVersionId: string };
  const stamp = new Date("2026-09-06T10:00:00.000Z");
  beforeEach(async () => {
    const suffix = randomUUID();
    userId = (await prisma.user.create({ data: { email: `today-list-${suffix}@example.com`, name: "Today list fixture" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Today list", slug: `today-list-${suffix}` } })).id;
    foreignId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Other list", slug: `today-list-other-${suffix}` } })).id;
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Fixture person" } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Fixture text", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Unsent fixture" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Fixture plan", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
    fixture = { contactId: contact.id, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id };
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignId].filter(Boolean) } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function add(count: number, status: JumpStatus, scheduledAt = stamp) {
    const prefix = randomUUID();
    const ids = Array.from({ length: count }, (_, index) => `${prefix}-${String(index).padStart(4, "0")}`);
    await prisma.jump.createMany({ data: ids.map(id => ({ ...fixture, id, workspaceId, status, scheduledAt, reason: "Fixture follow-up", uniquenessKey: id, templateSnapshot: {}, renderedSnapshot: { body: "Unsent fixture" } })) });
    return ids;
  }
  async function pages(filters: Prisma.JumpWhereInput = {}, groupFilters: Parameters<typeof readTodayPage>[3] = {}) {
    const results: Awaited<ReturnType<typeof readTodayPage>>[] = [];
    let after: string | undefined;
    for (let index = 0; index < 30; index++) {
      const page = await readTodayPage(workspaceId, filters, { after }, groupFilters); results.push(page);
      expect(page.items.length).toBeLessThanOrEqual(TODAY_PAGE_SIZE);
      if (!page.next) return results;
      after = page.next;
    }
    throw new Error("Cursor navigation did not finish");
  }

  it("reaches every matching record beyond 300 with open work first and timestamp ties intact", async () => {
    const completed = await add(304, "DONE", new Date(stamp.getTime() - 3_600_000));
    const pending = await add(325, "PENDING"); await add(2, "CANCELED");
    const result = await pages();
    const ids = result.flatMap(page => page.items.map(item => item.id));
    expect(ids).toEqual([...pending, ...completed]);
    expect(new Set(ids).size).toBe(629);
    expect(result[0].previous).toBeNull(); expect(result.at(-1)!.next).toBeNull();
  });

  it("does not skip untouched work after earlier outcomes or a deleted cursor anchor", async () => {
    const pending = await add(91, "PENDING");
    const first = await readTodayPage(workspaceId, { status: "PENDING" });
    await prisma.jump.updateMany({ where: { workspaceId, id: { in: pending.slice(0, 29) } }, data: { status: "DONE" } });
    await prisma.jump.delete({ where: { id: pending[29] } });
    const second = await readTodayPage(workspaceId, { status: "PENDING" }, { after: first.next });
    expect(second.items.map(item => item.id)).toEqual(pending.slice(30, 60));
    expect(second.previous).toBeNull();
  });

  it("navigates backward across the open/history boundary without reordering completed and skipped work", async () => {
    const pending = await add(35, "PENDING");
    const skipped = await add(18, "SKIPPED", new Date(stamp.getTime() - 1000));
    const completed = await add(18, "DONE");
    const forward = await pages();
    expect(forward.flatMap(page => page.items.map(item => item.id))).toEqual([...pending, ...skipped, ...completed]);
    for (let index = forward.length - 1; index > 0; index--) {
      const previous = await readTodayPage(workspaceId, {}, { before: forward[index].previous });
      expect(previous.items.map(item => item.id)).toEqual(forward[index - 1].items.map(item => item.id));
    }
  });

  it("preserves date, channel, status and workspace boundaries throughout navigation", async () => {
    const pending = await add(65, "PENDING"); await add(20, "DONE");
    await add(4, "PENDING", new Date(stamp.getTime() + 86_400_000));
    const contact = await prisma.contact.create({ data: { workspaceId: foreignId, displayName: "Foreign person" } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId: foreignId, name: "Foreign text", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Foreign private content" } });
    const mix = await prisma.mix.create({ data: { workspaceId: foreignId, name: "Foreign plan", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
    const foreign = await prisma.jump.create({ data: { workspaceId: foreignId, contactId: contact.id, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt: new Date(stamp.getTime() + 500), reason: "Foreign follow-up", uniquenessKey: randomUUID(), templateSnapshot: {}, renderedSnapshot: { body: "Foreign private content" } } });
    const filters: Prisma.JumpWhereInput = { status: "PENDING", scheduledAt: { gte: stamp, lt: new Date(stamp.getTime() + 1000) }, stepVersion: { stepTemplate: { channel: "SMS" } } };
    expect((await pages(filters)).flatMap(page => page.items.map(item => item.id))).toEqual(pending);
    expect((await readTodayPage(workspaceId, { ...filters, stepVersion: { stepTemplate: { channel: "EMAIL" } } })).items).toEqual([]);
    expect((await readTodayPage(foreignId, filters, { after: todayCursor({ id: pending[0], status: "PENDING", scheduledAt: stamp }) })).items.map(item => item.id)).toEqual([foreign.id]);
    expect((await readTodayPage(workspaceId, { workspaceId: foreignId })).items).toEqual([]);
  });

  it("preserves daily open and completed work across pages with separate date constraints", async () => {
    const day = 86_400_000, end = new Date(stamp.getTime() + day);
    const pending = await add(35, "PENDING");
    const done = await add(40, "DONE", new Date(stamp.getTime() - 3600000));
    const skipped = await add(3, "SKIPPED", new Date(stamp.getTime() - 1800000));
    const older = await add(400, "DONE", new Date(stamp.getTime() - day));
    await add(5, "PENDING", end);
    await prisma.jump.updateMany({ where: { id: { in: [...done, ...skipped] } }, data: { completedAt: stamp } });
    await prisma.jump.updateMany({ where: { id: { in: older } }, data: { completedAt: new Date(stamp.getTime() - day) } });
    const filters: Prisma.JumpWhereInput = { OR: [
      { status: "PENDING", scheduledAt: { lt: end } },
      { status: { in: ["DONE", "SKIPPED"] }, completedAt: { gte: stamp, lt: end } }
    ] };
    const groupFilters = { pending: { scheduledAt: { lt: end } }, completed: { completedAt: { gte: stamp, lt: end } } };
    const forward = await pages(filters, groupFilters);
    expect(forward.flatMap(page => page.items.map(item => item.id))).toEqual([...pending, ...done, ...skipped]);
    for (let index = forward.length - 1; index > 0; index--) {
      const previous = await readTodayPage(workspaceId, filters, { before: forward[index].previous }, groupFilters);
      expect(previous.items.map(item => item.id)).toEqual(forward[index - 1].items.map(item => item.id));
    }
    // No completed work in the next day, even though older history is populated.
    const nextDay = { completedAt: { gte: end, lt: new Date(end.getTime() + day) } };
    expect((await readTodayPage(workspaceId, { status: "DONE", ...nextDay }, {}, { completed: nextDay })).items).toEqual([]);
    expect((await readTodayPage(workspaceId, { ...filters, workspaceId: foreignId }, {}, groupFilters)).items).toEqual([]);
    await prisma.jump.updateMany({ where: { workspaceId }, data: { status: "DONE", completedAt: new Date(stamp.getTime() - day) } });
    expect(await readTodayPage(workspaceId, filters, {}, groupFilters)).toEqual({ items: [], previous: null, next: null, reset: false });
  });

  it("returns to the first surviving work when a formerly reachable page disappears", async () => {
    const pending = await add(31, "PENDING");
    const first = await readTodayPage(workspaceId, { status: "PENDING" });
    await prisma.jump.update({ where: { id: pending[30] }, data: { status: "CANCELED" } });
    const reset = await readTodayPage(workspaceId, { status: "PENDING" }, { after: first.next });
    expect(reset.reset).toBe(true); expect(reset.items.map(item => item.id)).toEqual(pending.slice(0, 30));
    await prisma.jump.updateMany({ where: { workspaceId }, data: { status: "CANCELED" } });
    const empty = await readTodayPage(workspaceId, { status: "PENDING" }, { after: first.next });
    expect(empty).toEqual({ items: [], previous: null, next: null, reset: false });
  });
});
