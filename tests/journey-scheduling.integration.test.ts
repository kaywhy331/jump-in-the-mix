import { describe, expect, it } from "vitest";
import { reconcileJumps } from "@/lib/jump-engine";
import { initialJourneySetup } from "@/lib/journey-preferences";
import { nextJourneyAvailability } from "@/lib/journey-availability";
import { saveJourneySetup } from "@/lib/journey-preference-service";
import { prisma } from "@/lib/prisma";
import { createBroadcastFixture, localDateDaysFromToday } from "./helpers/broadcast-fixture";
import { logicalDateFromDate, zonedDateTimeToUtc } from "@/lib/jump-schedule";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("journey availability in ordinary Mix scheduling", () => {
  it("moves a flexible reminder around booked time, keeps retries stable and honors an explicit snooze", async () => {
    const f = await createBroadcastFixture("journey-hours");
    try {
      const setup = initialJourneySetup(null, "UTC");
      await prisma.$transaction(db => saveJourneySetup(db, f.workspaceId, f.userId, setup));
      const mixId = await f.addBroadcast("Flexible follow-up", 1, { timezone: "UTC", timeMinutes: 600 });
      const start = zonedDateTimeToUtc(logicalDateFromDate(localDateDaysFromToday(1)), 600, "UTC");
      const available = nextJourneyAvailability(start, "UTC", { ...setup, journeyPreferences: setup.preferences });
      const busy = await prisma.calendarEntry.create({ data: { workspaceId: f.workspaceId, title: "Booked time", kind: "MEETING", timezone: "UTC", startsAt: available, endsAt: new Date(available.getTime() + 3600000) } });
      await reconcileJumps({ workspaceId: f.workspaceId });
      const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: f.workspaceId, status: "PENDING" } });
      expect(jump.scheduledAt.getTime()).toBe(busy.endsAt.getTime() + 15 * 60000);
      expect(await reconcileJumps({ workspaceId: f.workspaceId })).toMatchObject({ created: 0, updated: 0 });
      const chosen = new Date(jump.scheduledAt.getTime() + 3 * 86400000 + 12 * 3600000);
      await prisma.jump.update({ where: { id: jump.id }, data: { snoozedUntil: chosen, scheduledAt: chosen } });
      await reconcileJumps({ workspaceId: f.workspaceId });
      expect((await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } })).scheduledAt).toEqual(chosen);
      // A deliberately planned instant keeps its exact time even when outside working hours.
      const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId } });
      const planned = new Date(start.getTime() + 13 * 3600000);
      await prisma.mixStep.update({ where: { id: step.id }, data: { plannedAt: planned } });
      await prisma.jump.update({ where: { id: jump.id }, data: { snoozedUntil: null } });
      await reconcileJumps({ workspaceId: f.workspaceId });
      const explicit = await prisma.jump.findFirstOrThrow({ where: { workspaceId: f.workspaceId, status: "PENDING" } });
      expect(explicit.scheduledAt).toEqual(planned);
    } finally { await f.cleanup(); }
  });
});
