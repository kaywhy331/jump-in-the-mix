import { describe, expect, it } from "vitest";
import { automaticDeliveryEligibleAt, automaticSendingOpensAt, automaticSendWindow, type AutomaticSendingRule } from "@/lib/automatic-delivery-window";
import { nextJourneyAvailability, type BusyTime } from "@/lib/journey-availability";
import { readJourneyPreferences } from "@/lib/journey-preferences";
import { zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { isQuietTime, notificationClock } from "@/lib/notification-delivery";

const NEW_YORK = "America/New_York";
const MINUTE = 60_000;
type Scheduling = { quietHoursStart: number; quietHoursEnd: number; journeyPreferences: unknown; appointmentBufferMinutes: number };
type Fixture = { name: string; timezone: string; scheduling: Scheduling | null; calendar: BusyTime[] };
type Follow = { name: string; scheduledAt: Date; createdAt: Date; reviewWindowMinutes: number };

/**
 * The worker's decision before the extraction, copied line for line from runAutomaticDeliveries:
 * quiet hours close the workspace, then working hours with the appointments it reads around `now`,
 * then the review window per follow-up. The candidates query's `scheduledAt <= now - window` bound
 * is implied by that last check, since eligibleAt is never earlier than scheduledAt plus the window.
 */
function legacyWorkspaceClosed(now: Date, timeZone: string, scheduling: Scheduling | null, calendar: BusyTime[]): boolean {
  const clock = notificationClock(now, timeZone);
  if (scheduling && isQuietTime(clock.hour * 60 + clock.minute, scheduling.quietHoursStart, scheduling.quietHoursEnd)) return true;
  if (scheduling && readJourneyPreferences(scheduling.journeyPreferences)) {
    const busy = readJourneyPreferences(scheduling.journeyPreferences)?.avoidAppointments
      ? calendar.filter(entry => entry.startsAt.getTime() <= now.getTime() + 240 * MINUTE && entry.endsAt.getTime() >= now.getTime() - 240 * MINUTE)
      : [];
    if (nextJourneyAvailability(now, timeZone, scheduling, busy).getTime() > now.getTime()) return true;
  }
  return false;
}
function legacyWorkerWouldSend(now: Date, fixture: Fixture, follow: Follow): boolean {
  if (legacyWorkspaceClosed(now, fixture.timezone, fixture.scheduling, fixture.calendar)) return false;
  const eligibleAt = new Date(Math.max(follow.scheduledAt.getTime(), follow.createdAt.getTime()) + follow.reviewWindowMinutes * MINUTE);
  if (eligibleAt > now) return false;
  return true;
}

function ruleFor(fixture: Fixture): AutomaticSendingRule {
  return { timezone: fixture.timezone, quietHours: fixture.scheduling ? { start: fixture.scheduling.quietHoursStart, end: fixture.scheduling.quietHoursEnd } : null, workingHours: fixture.scheduling, appointmentGaps: fixture.calendar };
}
const weekdays = (avoidAppointments: boolean, workDays = [1, 2, 3, 4, 5]) => ({ version: 1, communication: "RECOMMENDED", pace: "RECOMMENDED", workDays, workStart: 9 * 60, workEnd: 17 * 60, avoidAppointments });
const at = (day: number, minutes: number, timezone = NEW_YORK) => zonedDateTimeToUtc({ year: 2026, month: 3, day }, minutes, timezone);

// The sweep starts on Friday 2026-03-06 and crosses the New York spring-forward on Sunday the 8th.
const fixtures: Fixture[] = [
  { name: "no scheduling row", timezone: "UTC", scheduling: null, calendar: [] },
  { name: "overnight quiet hours", timezone: "UTC", scheduling: { quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60, journeyPreferences: null, appointmentBufferMinutes: 0 }, calendar: [] },
  { name: "lunch quiet hour in New York", timezone: NEW_YORK, scheduling: { quietHoursStart: 12 * 60, quietHoursEnd: 13 * 60, journeyPreferences: null, appointmentBufferMinutes: 0 }, calendar: [] },
  { name: "quiet hours switched off", timezone: NEW_YORK, scheduling: { quietHoursStart: 480, quietHoursEnd: 480, journeyPreferences: { stale: true }, appointmentBufferMinutes: 0 }, calendar: [] },
  { name: "working hours avoiding appointments", timezone: NEW_YORK, scheduling: { quietHoursStart: 21 * 60, quietHoursEnd: 8 * 60, journeyPreferences: weekdays(true), appointmentBufferMinutes: 15 }, calendar: [
    { startsAt: at(6, 9 * 60), endsAt: at(6, 10 * 60), kind: "MEETING" },
    { startsAt: at(9, 9 * 60), endsAt: at(9, 11 * 60), kind: "BLOCK" },
    { startsAt: at(10, 16 * 60), endsAt: at(10, 18 * 60), kind: "MEETING" }
  ] },
  { name: "working hours ignoring appointments", timezone: NEW_YORK, scheduling: { quietHoursStart: 21 * 60, quietHoursEnd: 8 * 60, journeyPreferences: weekdays(false), appointmentBufferMinutes: 30 }, calendar: [{ startsAt: at(9, 9 * 60), endsAt: at(9, 11 * 60), kind: "MEETING" }] },
  { name: "weekend-only working days", timezone: NEW_YORK, scheduling: { quietHoursStart: 0, quietHoursEnd: 0, journeyPreferences: weekdays(true, [0, 6]), appointmentBufferMinutes: 0 }, calendar: [{ startsAt: at(7, 9 * 60), endsAt: at(7, 12 * 60), kind: "MEETING" }] }
];
const follows: Follow[] = [
  { name: "due before creation, 30 min", scheduledAt: at(5, 9 * 60), createdAt: at(6, 8 * 60 + 12), reviewWindowMinutes: 30 },
  { name: "created before due, 15 min", scheduledAt: at(6, 16 * 60 + 50), createdAt: at(4, 12 * 60), reviewWindowMinutes: 15 },
  { name: "due on the spring-forward night, 60 min", scheduledAt: new Date("2026-03-08T06:03:00Z"), createdAt: new Date("2026-03-01T15:00:00Z"), reviewWindowMinutes: 60 },
  { name: "a day-long window", scheduledAt: at(7, 10 * 60 + 5), createdAt: at(7, 10 * 60 + 5), reviewWindowMinutes: 1440 }
];
const sweep: Date[] = [];
for (let time = Date.UTC(2026, 2, 6, 0, 0, 0); time <= Date.UTC(2026, 2, 10, 23, 59, 0); time += 17 * MINUTE) sweep.push(new Date(time));

// Each sweep compares thousands of instants against the former inline rule, so each gets a minute.
describe("automaticSendWindow parity with the worker's former inline rule", () => {
  it("opens exactly when the old quiet-hours, working-hours and review-window checks would have sent", () => {
    let sends = 0;
    for (const fixture of fixtures) for (const follow of follows) for (const now of sweep) {
      const expected = legacyWorkerWouldSend(now, fixture, follow);
      const window = automaticSendWindow({ ...ruleFor(fixture), scheduledAt: follow.scheduledAt, createdAt: follow.createdAt, reviewWindowMinutes: follow.reviewWindowMinutes, now });
      if (window.open !== expected) throw new Error(`${fixture.name} / ${follow.name} at ${now.toISOString()}: helper ${window.open}, worker ${expected}`);
      if (expected) sends += 1;
    }
    expect(sends).toBeGreaterThan(200);
  }, 60_000);

  it("closes the workspace exactly when the old per-pass checks did", () => {
    for (const fixture of fixtures) for (const now of sweep) {
      const closed = automaticSendingOpensAt(now, ruleFor(fixture)).getTime() > now.getTime();
      if (closed !== legacyWorkspaceClosed(now, fixture.timezone, fixture.scheduling, fixture.calendar)) throw new Error(`${fixture.name} at ${now.toISOString()}: helper closed=${closed}`);
    }
  }, 60_000);

  it("names the first instant a worker pass would send, never earlier and never later", () => {
    let checked = 0;
    for (const fixture of fixtures) for (const follow of follows) for (const now of sweep.filter((_, index) => index % 5 === 0)) {
      const window = automaticSendWindow({ ...ruleFor(fixture), scheduledAt: follow.scheduledAt, createdAt: follow.createdAt, reviewWindowMinutes: follow.reviewWindowMinutes, now });
      expect(window.opensAt).not.toBeNull();
      if (window.open) { expect(window.opensAt!.getTime()).toBe(now.getTime()); continue; }
      const opensAt = window.opensAt!;
      expect(opensAt.getTime()).toBeGreaterThan(now.getTime());
      if (!legacyWorkerWouldSend(opensAt, fixture, follow)) throw new Error(`${fixture.name} / ${follow.name} from ${now.toISOString()}: worker would not send at ${opensAt.toISOString()}`);
      if (legacyWorkerWouldSend(new Date(opensAt.getTime() - 1000), fixture, follow)) throw new Error(`${fixture.name} / ${follow.name} from ${now.toISOString()}: worker already sends before ${opensAt.toISOString()}`);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  }, 60_000);
});

describe("automaticSendWindow", () => {
  const plain: AutomaticSendingRule = { timezone: "UTC", quietHours: null };

  it("ends the review window after the later of due time and creation", () => {
    expect(automaticDeliveryEligibleAt(new Date("2026-09-24T09:30:00Z"), new Date("2026-09-24T09:00:00Z"), 30).toISOString()).toBe("2026-09-24T10:00:00.000Z");
    expect(automaticDeliveryEligibleAt(new Date("2026-09-24T09:30:00Z"), new Date("2026-09-24T09:50:00Z"), 30).toISOString()).toBe("2026-09-24T10:20:00.000Z");
    const window = automaticSendWindow({ ...plain, scheduledAt: new Date("2026-09-24T09:30:00Z"), createdAt: new Date("2026-09-24T09:50:00Z"), reviewWindowMinutes: 30, now: new Date("2026-09-24T09:55:00Z") });
    expect(window).toEqual({ eligibleAt: new Date("2026-09-24T10:20:00Z"), opensAt: new Date("2026-09-24T10:20:00Z"), open: false });
  });

  it("is open at the instant the window has ended and names now as the time", () => {
    const window = automaticSendWindow({ ...plain, scheduledAt: new Date("2026-09-24T09:30:00Z"), createdAt: new Date("2026-09-24T09:00:00Z"), reviewWindowMinutes: 30, now: new Date("2026-09-24T10:00:00Z") });
    expect(window.open).toBe(true);
    expect(window.opensAt?.toISOString()).toBe("2026-09-24T10:00:00.000Z");
  });

  it("moves a time inside overnight quiet hours to the morning they end, in the owner's timezone", () => {
    const rule: AutomaticSendingRule = { timezone: NEW_YORK, quietHours: { start: 21 * 60, end: 8 * 60 } };
    // 22:10 in New York on the 23rd is 02:10Z on the 24th; quiet until 08:00 New York.
    const window = automaticSendWindow({ ...rule, scheduledAt: new Date("2026-09-24T01:40:00Z"), createdAt: new Date("2026-09-20T00:00:00Z"), reviewWindowMinutes: 30, now: new Date("2026-09-24T01:45:00Z") });
    expect(window.opensAt?.toISOString()).toBe("2026-09-24T12:00:00.000Z");
    expect(window.open).toBe(false);
    // Already past the window but inside quiet hours: not open, and the time is the quiet end.
    const late = automaticSendWindow({ ...rule, scheduledAt: new Date("2026-09-23T20:00:00Z"), createdAt: new Date("2026-09-20T00:00:00Z"), reviewWindowMinutes: 30, now: new Date("2026-09-24T03:00:00Z") });
    expect(late).toMatchObject({ open: false, opensAt: new Date("2026-09-24T12:00:00Z") });
  });

  it("waits for the next working day and clears appointments with their buffer, but not blocks", () => {
    const scheduling: Scheduling = { quietHoursStart: 21 * 60, quietHoursEnd: 8 * 60, journeyPreferences: weekdays(true), appointmentBufferMinutes: 15 };
    const calendar: BusyTime[] = [{ startsAt: at(9, 9 * 60), endsAt: at(9, 10 * 60), kind: "MEETING" }, { startsAt: at(9, 13 * 60), endsAt: at(9, 14 * 60), kind: "BLOCK" }];
    const rule: AutomaticSendingRule = { timezone: NEW_YORK, quietHours: { start: 21 * 60, end: 8 * 60 }, workingHours: scheduling, appointmentGaps: calendar };
    // Friday 17:30: after hours, so Monday 09:00, which a meeting and its buffer push to 10:15.
    const friday = automaticSendWindow({ ...rule, scheduledAt: at(6, 17 * 60), createdAt: at(6, 17 * 60), reviewWindowMinutes: 30, now: at(6, 17 * 60 + 40) });
    expect(friday.opensAt?.toISOString()).toBe(at(9, 10 * 60 + 15).toISOString());
    // A block has no buffer: due inside it, the follow-up goes out when it ends.
    const block = automaticSendWindow({ ...rule, scheduledAt: at(9, 13 * 60), createdAt: at(9, 13 * 60), reviewWindowMinutes: 15, now: at(9, 13 * 60 + 20) });
    expect(block.opensAt?.toISOString()).toBe(at(9, 14 * 60).toISOString());
  });

  it("steps forward through a quiet end that falls inside the spring-forward gap", () => {
    // 02:30 does not exist in New York on 2026-03-08; the first minute after quiet hours is 03:00 EDT.
    const rule: AutomaticSendingRule = { timezone: NEW_YORK, quietHours: { start: 22 * 60, end: 2 * 60 + 30 } };
    const now = new Date("2026-03-08T06:03:27Z"); // 01:03:27 EST, still quiet
    const window = automaticSendWindow({ ...rule, scheduledAt: new Date("2026-03-08T05:00:00Z"), createdAt: new Date("2026-03-08T05:00:00Z"), reviewWindowMinutes: 15, now });
    expect(window.opensAt?.toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(automaticSendingOpensAt(new Date("2026-03-08T07:00:00Z"), rule).toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("reports no time, rather than throwing, when the search limit is exhausted", () => {
    // Every minute quiet: start and end differ but together cover the day through working hours that never open.
    const rule: AutomaticSendingRule = { timezone: "UTC", quietHours: { start: 0, end: 1439 }, workingHours: { journeyPreferences: { ...weekdays(false), workStart: 0, workEnd: 1439 }, quietHoursStart: 0, quietHoursEnd: 1439 } };
    const window = automaticSendWindow({ ...rule, scheduledAt: new Date("2026-09-24T09:30:00Z"), createdAt: new Date("2026-09-24T09:30:00Z"), reviewWindowMinutes: 15, now: new Date("2026-09-24T10:00:00Z") });
    expect(window).toMatchObject({ opensAt: null, open: false });
    expect(() => automaticSendingOpensAt(new Date("2026-09-24T10:00:00Z"), rule)).toThrow(/No available follow-up time|No automatic sending time/);
  });
});
