import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { addLogicalDays, logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc } from "../src/lib/jump-schedule";
import { oneTimeMixId } from "../src/lib/one-time-follow-up";
import { prisma } from "../src/lib/prisma";
import { BROADCAST_TIMEZONE, createBroadcastFixture, localDateDaysFromToday, type BroadcastFixture } from "./helpers/broadcast-fixture";

const mocks = vi.hoisted(() => ({ session: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session, requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Beta loop test" }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
import { POST as postOutcome } from "../src/app/api/jumps/[jumpId]/outcome/route";
import { createContactAction } from "../src/lib/contact-actions";
import { assignMixToContactAction } from "../src/lib/contact-mix-actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}
async function redirected(action: Promise<unknown>): Promise<URL> {
  try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("REDIRECT ")) return new URL(error.message.slice(9), "https://app.invalid"); throw error; }
  throw new Error("The action did not redirect.");
}

const post = (jumpId: string, body: unknown) =>
  postOutcome(new Request(`https://example.test/api/jumps/${jumpId}/outcome`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ jumpId }) });

// LOOP-01: a next promise or a reschedule is exactly one follow-up at the chosen day and time.
// DATA-01: an occurrence the owner finished never comes back after a settings or Beat timing change.
describe.sequential("beta follow-up loop", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  const pending = (mixId: string) => prisma.jump.findMany({ where: { workspaceId, mixId, status: "PENDING" } });
  const complete = (id: string) => prisma.jump.update({ where: { id }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:completed" } });
  const newPendingJump = async (days = -1, timeMinutes = 600) => {
    const mixId = await fixture.addBroadcast(`Loop ${randomUUID().slice(0, 8)}`, days, { timeMinutes });
    await reconcileJumps({ workspaceId, mixId });
    return prisma.jump.findFirstOrThrow({ where: { workspaceId, mixId, status: "PENDING" } });
  };

  beforeAll(async () => {
    fixture = await createBroadcastFixture("beta-loop");
    workspaceId = fixture.workspaceId;
    await prisma.userPreference.create({ data: { userId: fixture.userId, timezone: BROADCAST_TIMEZONE } });
    mocks.session.mockResolvedValue({ user: { id: fixture.userId, memberships: [{ workspaceId }] }, impersonation: null });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    mocks.requireWorkspace.mockResolvedValue({ user, workspace: { id: workspaceId }, session: { authUser: { id: user.id } }, impersonation: null });
  });
  afterAll(async () => {
    await prisma.workspacePreference.deleteMany({ where: { workspaceId } });
    await prisma.userPreference.deleteMany({ where: { userId: fixture.userId } });
    await fixture.cleanup();
  });

  it("schedules the next follow-up once, at the chosen time, outside every plan", async () => {
    const jump = await newPendingJump();
    const day = addLogicalDays(logicalDateInTimezone(new Date(), BROADCAST_TIMEZONE), 3);
    const requestId = randomUUID();
    const body = { outcome: "COMPLETED", requestId, note: "Wants the quote on Friday", nextDate: logicalDateKey(day), nextTime: "14:00" };
    const response = await post(jump.id, body);
    expect(response.status).toBe(200);
    const stored = await response.json() as { status: string; nextJumpId: string; jumpDateId: string | null; nextCommitmentAt: string };
    expect(stored).toMatchObject({ status: "DONE", jumpDateId: null });
    const expectedAt = zonedDateTimeToUtc(day, 14 * 60, BROADCAST_TIMEZONE);
    expect(stored.nextCommitmentAt).toBe(expectedAt.toISOString());

    const next = await prisma.jump.findUniqueOrThrow({ where: { id: stored.nextJumpId }, include: { stepVersion: { include: { stepTemplate: true } } } });
    expect(next).toMatchObject({ status: "PENDING", contactId: fixture.contactId, mixId: oneTimeMixId(workspaceId), manualOnly: true });
    expect(next.scheduledAt.toISOString()).toBe(expectedAt.toISOString());
    expect(next.stepVersion.stepTemplate.channel).toBe("SMS");
    expect(next.reason).toContain("Wants the quote on Friday");
    expect(await prisma.jumpDate.count({ where: { contactId: fixture.contactId } })).toBe(0);

    // A retry replays; a later plan pass leaves the one-time follow-up alone.
    expect(await (await post(jump.id, body)).json()).toMatchObject({ nextJumpId: stored.nextJumpId, duplicate: true });
    await reconcileJumps({ workspaceId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: fixture.contactId, status: "PENDING", scheduledAt: expectedAt } })).toBe(1);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("PENDING");
  });

  it("moves a rescheduled follow-up to the chosen time instead of dropping it", async () => {
    const jump = await newPendingJump();
    const day = addLogicalDays(logicalDateInTimezone(new Date(), BROADCAST_TIMEZONE), 2);
    const response = await post(jump.id, { outcome: "RESCHEDULED", requestId: randomUUID(), nextDate: logicalDateKey(day), nextTime: "09:00" });
    expect(response.status).toBe(200);
    const stored = await response.json() as { status: string; nextJumpId: string };
    expect(stored.status).toBe("DONE");
    const moved = await prisma.jump.findUniqueOrThrow({ where: { id: stored.nextJumpId } });
    expect(moved.status).toBe("PENDING");
    expect(moved.reason).toBe(jump.reason);
    expect(moved.scheduledAt.toISOString()).toBe(zonedDateTimeToUtc(day, 9 * 60, BROADCAST_TIMEZONE).toISOString());
  });

  it("keeps a finished follow-up finished when quiet hours move its time", async () => {
    const jump = await newPendingJump(-1, 21 * 60 + 30);
    await complete(jump.id);
    await prisma.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, quietHoursStart: 22 * 60, quietHoursEnd: 9 * 60 }, update: { quietHoursStart: 22 * 60, quietHoursEnd: 9 * 60 } });
    const result = await reconcileJumps({ workspaceId, mixId: jump.mixId });
    expect(result.created).toBe(0);
    expect(await pending(jump.mixId)).toEqual([]);
    await prisma.workspacePreference.delete({ where: { workspaceId } });
  });

  it("keeps a finished weekend follow-up finished when the weekend rule changes", async () => {
    const today = new Date();
    const toSaturday = (6 - today.getUTCDay() + 7) % 7 || 7;
    const mixId = await fixture.addBroadcast(`Weekend ${randomUUID().slice(0, 8)}`, toSaturday);
    await reconcileJumps({ workspaceId, mixId });
    const [jump] = await pending(mixId);
    await complete(jump.id);
    await prisma.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, weekendScheduling: "NEXT_MONDAY" }, update: { weekendScheduling: "NEXT_MONDAY" } });
    expect((await reconcileJumps({ workspaceId, mixId })).created).toBe(0);
    expect(await pending(mixId)).toEqual([]);
    await prisma.workspacePreference.delete({ where: { workspaceId } });
  });

  it("keeps a finished follow-up finished when its broadcast time zone or Beat day changes", async () => {
    const jump = await newPendingJump(1);
    await complete(jump.id);
    await prisma.mixBroadcastSchedule.update({ where: { mixId: jump.mixId }, data: { timezone: "America/New_York" } });
    expect((await reconcileJumps({ workspaceId, mixId: jump.mixId })).created).toBe(0);
    await prisma.mixStep.update({ where: { id: jump.mixStepId }, data: { dayOffset: 2, sendTimeMinutes: 11 * 60 } });
    expect((await reconcileJumps({ workspaceId, mixId: jump.mixId })).created).toBe(0);
    expect(await pending(jump.mixId)).toEqual([]);
  });

  it("recognises a finished row written before occurrences were recorded", async () => {
    const jump = await newPendingJump(-1, 21 * 60 + 30);
    const { occurrenceKey: _removed, ...legacySnapshot } = jump.templateSnapshot as Record<string, unknown>;
    await prisma.jump.update({ where: { id: jump.id }, data: { status: "SKIPPED", completedAt: new Date(), completionMethod: "outcome:skipped", templateSnapshot: legacySnapshot as never } });
    await prisma.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, quietHoursStart: 22 * 60, quietHoursEnd: 9 * 60 }, update: { quietHoursStart: 22 * 60, quietHoursEnd: 9 * 60 } });
    expect((await reconcileJumps({ workspaceId, mixId: jump.mixId })).created).toBe(0);
    await prisma.workspacePreference.delete({ where: { workspaceId } });
  });

  it("still creates a genuinely new occurrence after one is finished", async () => {
    const jump = await newPendingJump(-1);
    await complete(jump.id);
    await prisma.mixBroadcastSchedule.update({ where: { mixId: jump.mixId }, data: { localDate: localDateDaysFromToday(4) } });
    expect((await reconcileJumps({ workspaceId, mixId: jump.mixId })).created).toBe(1);
  });

  it("does not rewrite pending rows that predate the recorded occurrence", async () => {
    const jump = await newPendingJump(2);
    const { occurrenceKey: _removed, ...legacySnapshot } = jump.templateSnapshot as Record<string, unknown>;
    await prisma.jump.update({ where: { id: jump.id }, data: { templateSnapshot: legacySnapshot as never } });
    expect((await reconcileJumps({ workspaceId, mixId: jump.mixId })).updated).toBe(0);
  });

  it("gives a person added without a plan exactly one follow-up on the chosen day", async () => {
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: `workspace:${workspaceId}`, name: "Follow-up", slug: `follow-up-${randomUUID().slice(0, 8)}` } });
    const day = addLogicalDays(logicalDateInTimezone(new Date(), BROADCAST_TIMEZONE), 2);
    const target = await redirected(createContactAction(form({ requestId: randomUUID(), firstName: "Casey", phonePrimaryIndex: "0", phoneValue: "(555) 234-5690", phoneLabel: "Mobile", emailPrimaryIndex: "0", scheduleFollowUp: "on", followUpDateTypeId: dateType.id, followUpDate: logicalDateKey(day), followUpReason: "Estimate follow-up", followUpMixId: "" })));
    expect(target.searchParams.get("followUpScheduled")).toBe("1");
    const contactId = target.pathname.split("/").pop()!;
    const jumps = await prisma.jump.findMany({ where: { contactId, status: "PENDING" }, include: { stepVersion: { include: { stepTemplate: true } } } });
    expect(jumps).toHaveLength(1);
    expect(jumps[0].scheduledAt.toISOString()).toBe(zonedDateTimeToUtc(day, 600, BROADCAST_TIMEZONE).toISOString());
    expect(jumps[0].stepVersion.stepTemplate.channel).toBe("SMS");
    expect(jumps[0].reason).toBe("Estimate follow-up");
    expect(await prisma.jumpDate.count({ where: { contactId } })).toBe(0);
  });

  it("starts a date-triggered plan from the chosen day when the person has no saved date", async () => {
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: `workspace:${workspaceId}`, name: "Start", slug: `start-${randomUUID().slice(0, 8)}` } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Starter call", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Call {{First Name}}" } } }, include: { versions: true } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Starter", triggerMode: "DATE_TRIGGERED", status: "ACTIVE", dateTypeId: dateType.id, steps: { create: { stepVersionId: template.versions[0].id, dayOffset: 1, sendTimeMinutes: 600, sortOrder: 1 } } } });
    const contact = await prisma.contact.create({ data: { workspaceId, firstName: "Dana", displayName: "Dana" } });
    const day = addLogicalDays(logicalDateInTimezone(new Date(), BROADCAST_TIMEZONE), 1);
    const target = await redirected(assignMixToContactAction(form({ contactId: contact.id, mixId: mix.id, startDate: logicalDateKey(day) })));
    expect(target.searchParams.get("mixStart")).toBe(logicalDateKey(day));
    expect(await prisma.jumpDate.count({ where: { contactId: contact.id, dateTypeId: dateType.id } })).toBe(1);
    await reconcileJumps({ workspaceId, contactId: contact.id });
    const jumps = await prisma.jump.findMany({ where: { contactId: contact.id, status: "PENDING" } });
    expect(jumps.map((item) => item.scheduledAt.toISOString())).toEqual([zonedDateTimeToUtc(addLogicalDays(day, 1), 600, BROADCAST_TIMEZONE).toISOString()]);
    // A past start is refused.
    const refused = await redirected(assignMixToContactAction(form({ contactId: contact.id, mixId: mix.id, startDate: "2020-01-01" })));
    expect(refused.search).toContain("error");
  });

  it("restarts a finished manual plan from the chosen day", async () => {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Call" } } }, include: { versions: true } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Manual", triggerMode: "MANUAL_START", status: "ACTIVE", steps: { create: { stepVersionId: template.versions[0].id, dayOffset: 0, sendTimeMinutes: 600, sortOrder: 1 } } } });
    const contact = await prisma.contact.create({ data: { workspaceId, firstName: "Eli", displayName: "Eli" } });
    const today = logicalDateInTimezone(new Date(), BROADCAST_TIMEZONE);
    await redirected(assignMixToContactAction(form({ contactId: contact.id, mixId: mix.id, startDate: logicalDateKey(addLogicalDays(today, 1)) })));
    await reconcileJumps({ workspaceId, contactId: contact.id });
    const first = await prisma.jump.findFirstOrThrow({ where: { contactId: contact.id, status: "PENDING" } });
    await complete(first.id);
    const restartDay = addLogicalDays(today, 5);
    const target = await redirected(assignMixToContactAction(form({ contactId: contact.id, mixId: mix.id, startDate: logicalDateKey(restartDay) })));
    expect(target.searchParams.get("mixStart")).toBe(logicalDateKey(restartDay));
    await reconcileJumps({ workspaceId, contactId: contact.id });
    const again = await prisma.jump.findMany({ where: { contactId: contact.id, status: "PENDING" } });
    expect(again.map((item) => item.scheduledAt.toISOString())).toEqual([zonedDateTimeToUtc(restartDay, 600, BROADCAST_TIMEZONE).toISOString()]);
  });
});
