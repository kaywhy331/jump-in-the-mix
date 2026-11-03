import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileJumps } from "@/lib/jump-engine";
import { initialJourneySetup } from "@/lib/journey-preferences";
import { nextJourneyAvailability } from "@/lib/journey-availability";
import { saveJourneySetup } from "@/lib/journey-preference-service";
import { prisma } from "@/lib/prisma";
import { createBroadcastFixture, localDateDaysFromToday } from "./helpers/broadcast-fixture";
import { logicalDateFromDate, zonedDateTimeToUtc } from "@/lib/jump-schedule";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("journey availability in ordinary Mix scheduling", () => {
  afterEach(() => { vi.useRealTimers(); });
  function advancePastWrites(...rows: { createdAt: Date; updatedAt: Date }[]) {
    // The stale-row guard only considers writes strictly before reconciliation starts.
    vi.setSystemTime(Math.max(Date.now(), ...rows.flatMap(row => [row.createdAt.getTime(), row.updatedAt.getTime()])) + 1);
  }
  it("moves a flexible reminder around booked time, keeps retries stable and honors an explicit snooze", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const f = await createBroadcastFixture("journey-hours");
    try {
      const setup = initialJourneySetup(null, "UTC");
      await prisma.$transaction(db => saveJourneySetup(db, f.workspaceId, f.userId, setup));
      const mixId = await f.addBroadcast("Flexible follow-up", 1, { timezone: "UTC", timeMinutes: 600 });
      const start = zonedDateTimeToUtc(logicalDateFromDate(localDateDaysFromToday(1)), 600, "UTC");
      const available = nextJourneyAvailability(start, "UTC", { ...setup, journeyPreferences: setup.preferences });
      const busy = await prisma.calendarEntry.create({ data: { workspaceId: f.workspaceId, title: "Booked time", kind: "MEETING", timezone: "UTC", startsAt: available, endsAt: new Date(available.getTime() + 3600000) } });
      advancePastWrites(busy);
      await reconcileJumps({ workspaceId: f.workspaceId });
      const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: f.workspaceId, status: "PENDING" }, orderBy: { scheduledAt: "asc" } });
      expect(jump.scheduledAt.getTime()).toBe(busy.endsAt.getTime() + 15 * 60000);
      expect(await reconcileJumps({ workspaceId: f.workspaceId })).toMatchObject({ created: 0, updated: 0 });
      const chosen = new Date(jump.scheduledAt.getTime() + 3 * 86400000 + 12 * 3600000);
      const snoozed = await prisma.jump.update({ where: { id: jump.id }, data: { snoozedUntil: chosen, scheduledAt: chosen } });
      advancePastWrites(snoozed);
      await reconcileJumps({ workspaceId: f.workspaceId });
      expect((await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } })).scheduledAt).toEqual(chosen);
      // A deliberately planned instant keeps its exact time even when outside working hours.
      const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId }, orderBy: { sortOrder: "asc" } });
      const planned = new Date(start.getTime() + 13 * 3600000);
      const plannedStep = await prisma.mixStep.update({ where: { id: step.id }, data: { plannedAt: planned } });
      const unsnoozed = await prisma.jump.update({ where: { id: jump.id }, data: { snoozedUntil: null } });
      advancePastWrites(plannedStep, unsnoozed);
      await reconcileJumps({ workspaceId: f.workspaceId });
      expect(await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } })).toMatchObject({ status: "CANCELED", completionMethod: "reconciled" });
      const explicit = await prisma.jump.findFirstOrThrow({ where: { workspaceId: f.workspaceId, status: "PENDING" }, orderBy: { scheduledAt: "asc" } });
      expect(explicit.scheduledAt).toEqual(planned);
    } finally { await f.cleanup(); }
  });
});
