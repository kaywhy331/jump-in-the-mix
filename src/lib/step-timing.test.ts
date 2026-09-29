import { describe, expect, it } from "vitest";
import { MAX_STEP_OFFSET_MINUTES, anchoredStepInstant, anchoredStepIsPreparation, boundPlanOutlook, boundStepIsPreparation, describeBoundPlanOutlook, describeStepReadiness, describeStepTiming, validateStepTiming } from "@/lib/step-timing";

const appointment = { startsAt: new Date("2026-10-06T20:00:00Z"), endsAt: new Date("2026-10-06T20:45:00Z"), outcome: null as string | null, outcomeAt: null as Date | null };

describe("step timing", () => {
  it("normalizes editor input and refuses what cannot be timed", () => {
    expect(validateStepTiming("", "", 1)).toEqual({ anchor: "CALENDAR_DAY", offsetMinutes: null });
    expect(validateStepTiming("CALENDAR_DAY", "90", 1)).toEqual({ anchor: "CALENDAR_DAY", offsetMinutes: null });
    expect(validateStepTiming("APPOINTMENT_START", "-90", 2)).toEqual({ anchor: "APPOINTMENT_START", offsetMinutes: -90 });
    expect(validateStepTiming("APPOINTMENT_END", "60", 3)).toEqual({ anchor: "APPOINTMENT_END", offsetMinutes: 60 });
    expect(validateStepTiming("VISIT_COMPLETED", "0", 4)).toEqual({ anchor: "VISIT_COMPLETED", offsetMinutes: 0 });
    expect(Object.is(validateStepTiming("APPOINTMENT_START", "-0", 5).offsetMinutes, 0)).toBe(true);
    expect(() => validateStepTiming("SOMETHING_ELSE", "5", 1)).toThrow("Beat 1 has an unknown timing.");
    expect(() => validateStepTiming("APPOINTMENT_START", "", 2)).toThrow("Beat 2 needs a whole number of minutes.");
    expect(() => validateStepTiming("APPOINTMENT_START", "1.5", 2)).toThrow("whole number");
    expect(() => validateStepTiming("APPOINTMENT_END", String(MAX_STEP_OFFSET_MINUTES + 1), 3)).toThrow("within 30 days");
    expect(() => validateStepTiming("VISIT_COMPLETED", "-1", 4)).toThrow("can only follow the moment the visit is marked completed");
  });

  it("counts elapsed minutes from the start, the end, or the recorded completion, and waits without one", () => {
    expect(anchoredStepInstant({ anchor: "APPOINTMENT_START", offsetMinutes: -90 }, appointment)?.toISOString()).toBe("2026-10-06T18:30:00.000Z");
    expect(anchoredStepInstant({ anchor: "APPOINTMENT_END", offsetMinutes: 60 }, appointment)?.toISOString()).toBe("2026-10-06T21:45:00.000Z");
    expect(anchoredStepInstant({ anchor: "VISIT_COMPLETED", offsetMinutes: 1440 }, appointment)).toBeNull();
    expect(anchoredStepInstant({ anchor: "VISIT_COMPLETED", offsetMinutes: 1440 }, { ...appointment, outcome: "NO_SHOW", outcomeAt: new Date("2026-10-06T21:00:00Z") })).toBeNull();
    expect(anchoredStepInstant({ anchor: "VISIT_COMPLETED", offsetMinutes: 1440 }, { ...appointment, outcome: "COMPLETED", outcomeAt: new Date("2026-10-06T21:00:00Z") })?.toISOString()).toBe("2026-10-07T21:00:00.000Z");
    expect(anchoredStepInstant({ anchor: "CALENDAR_DAY", offsetMinutes: null }, appointment)).toBeNull();
  });

  it("treats a beat before the start as preparation and a completion beat as following the visit", () => {
    expect(anchoredStepIsPreparation({ anchor: "APPOINTMENT_START", offsetMinutes: -1 }, appointment)).toBe(true);
    expect(anchoredStepIsPreparation({ anchor: "APPOINTMENT_START", offsetMinutes: 0 }, appointment)).toBe(false);
    expect(anchoredStepIsPreparation({ anchor: "APPOINTMENT_END", offsetMinutes: -60 }, appointment)).toBe(true);
    expect(anchoredStepIsPreparation({ anchor: "APPOINTMENT_END", offsetMinutes: -30 }, appointment)).toBe(false);
    expect(anchoredStepIsPreparation({ anchor: "VISIT_COMPLETED", offsetMinutes: 0 }, appointment)).toBe(false);
  });

  it("keeps an elapsed interval exact when it straddles a daylight-saving change", () => {
    // Denver leaves daylight time at 02:00 MDT on 2026-11-01 (08:00Z). A visit at 03:00 MST (10:00Z) with a beat three
    // hours before lands at 07:00Z, 01:00 MDT: two hours earlier on the wall clock, three hours of elapsed time.
    const autumn = { startsAt: new Date("2026-11-01T10:00:00Z"), endsAt: new Date("2026-11-01T10:30:00Z"), outcome: null, outcomeAt: null };
    expect(anchoredStepInstant({ anchor: "APPOINTMENT_START", offsetMinutes: -180 }, autumn)?.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    // Denver enters daylight time at 02:00 MST on 2027-03-14 (09:00Z). A visit ending at 01:00 MST (08:00Z) with a beat
    // ninety minutes after lands at 09:30Z, 03:30 MDT: the wall clock skips an hour, the elapsed time does not.
    const spring = { startsAt: new Date("2027-03-14T07:30:00Z"), endsAt: new Date("2027-03-14T08:00:00Z"), outcome: "COMPLETED", outcomeAt: new Date("2027-03-14T08:30:00Z") };
    expect(anchoredStepInstant({ anchor: "APPOINTMENT_END", offsetMinutes: 90 }, spring)?.toISOString()).toBe("2027-03-14T09:30:00.000Z");
    expect(anchoredStepInstant({ anchor: "VISIT_COMPLETED", offsetMinutes: 60 }, spring)?.toISOString()).toBe("2027-03-14T09:30:00.000Z");
  });

  it("applies one preparation rule to calendar-day, planned and elapsed beats", () => {
    // 20:00Z on 2026-10-06 is 14:00 in Denver.
    const entry = { ...appointment, timezone: "America/Denver" };
    const calendar = (dayOffset: number, sendTimeMinutes: number | null) => ({ anchor: "CALENDAR_DAY" as const, offsetMinutes: null, plannedAt: null, dayOffset, sendTimeMinutes });
    expect(boundStepIsPreparation(calendar(-1, null), entry)).toBe(true);
    expect(boundStepIsPreparation(calendar(0, 9 * 60), entry)).toBe(true);
    // A same-day beat with no time of its own goes out at the appointment's time and so follows the visit.
    expect(boundStepIsPreparation(calendar(0, null), entry)).toBe(false);
    expect(boundStepIsPreparation(calendar(0, 15 * 60), entry)).toBe(false);
    expect(boundStepIsPreparation(calendar(1, null), entry)).toBe(false);
    expect(boundStepIsPreparation({ ...calendar(0, null), plannedAt: new Date("2026-10-06T19:00:00Z") }, entry)).toBe(true);
    expect(boundStepIsPreparation({ ...calendar(0, null), plannedAt: new Date("2026-10-06T20:00:00Z") }, entry)).toBe(false);
    expect(boundStepIsPreparation({ ...calendar(0, null), anchor: "APPOINTMENT_START", offsetMinutes: -30 }, entry)).toBe(true);
    expect(boundStepIsPreparation({ ...calendar(0, null), anchor: "APPOINTMENT_END", offsetMinutes: 0 }, entry)).toBe(false);
    expect(boundStepIsPreparation({ ...calendar(0, null), anchor: "VISIT_COMPLETED", offsetMinutes: 0 }, entry)).toBe(false);
  });

  it("reports what binding a plan gives the owner now, by the engine's rules, and says it plainly", () => {
    const entry = { ...appointment, timezone: "UTC" };
    const step = (anchor: "CALENDAR_DAY" | "APPOINTMENT_START" | "APPOINTMENT_END" | "VISIT_COMPLETED", offsetMinutes: number | null, dayOffset = 0, sendTimeMinutes: number | null = null) => ({ anchor, offsetMinutes, plannedAt: null, dayOffset, sendTimeMinutes });
    const steps = [step("APPOINTMENT_START", -90), step("APPOINTMENT_END", 30), step("VISIT_COMPLETED", 0), step("CALENDAR_DAY", null, -1, 9 * 60), step("CALENDAR_DAY", null, 1)];
    const before = new Date("2026-10-01T00:00:00Z");
    expect(boundPlanOutlook(steps, entry, before)).toEqual({ ready: 2, awaitingOutcome: 2, awaitingCompletion: 1, lapsed: 0, held: 0 });
    // Once the visit has started, preparation lapses; nothing else changes until the outcome is recorded.
    expect(boundPlanOutlook(steps, entry, appointment.startsAt)).toEqual({ ready: 0, awaitingOutcome: 2, awaitingCompletion: 1, lapsed: 2, held: 0 });
    const completed = { ...entry, outcome: "COMPLETED", outcomeAt: new Date("2026-10-06T21:00:00Z") };
    expect(boundPlanOutlook(steps, completed, before)).toEqual({ ready: 3, awaitingOutcome: 0, awaitingCompletion: 0, lapsed: 2, held: 0 });
    expect(boundPlanOutlook(steps, { ...entry, outcome: "NO_SHOW", outcomeAt: new Date("2026-10-06T21:00:00Z") }, before)).toEqual({ ready: 0, awaitingOutcome: 0, awaitingCompletion: 0, lapsed: 0, held: 5 });
    expect(boundPlanOutlook([], entry, before)).toEqual({ ready: 0, awaitingOutcome: 0, awaitingCompletion: 0, lapsed: 0, held: 0 });
    expect(describeBoundPlanOutlook({ ready: 1, awaitingOutcome: 1, awaitingCompletion: 1, lapsed: 0, held: 0 })).toBe("The Mix’s follow-ups line up with this visit. 1 Beat is scheduled and will appear on Today. 1 Beat after the visit waits until you record how it went. 1 Beat counts from the moment you mark the visit completed.");
    expect(describeBoundPlanOutlook({ ready: 0, awaitingOutcome: 2, awaitingCompletion: 0, lapsed: 2, held: 0 })).toBe("The Mix’s follow-ups line up with this visit. 2 Beats after the visit wait until you record how it went. 2 Beats before the visit have lapsed because it has already started.");
    expect(describeBoundPlanOutlook({ ready: 0, awaitingOutcome: 0, awaitingCompletion: 0, lapsed: 0, held: 3 })).toBe("The Mix’s follow-ups line up with this visit. 3 Beats are held because the visit was recorded as missed.");
  });

  it("names the condition that gates an elapsed beat", () => {
    expect(describeStepReadiness({ anchor: "APPOINTMENT_START", offsetMinutes: -90 })).toBe("It is preparation, so it lapses once the visit has started.");
    expect(describeStepReadiness({ anchor: "APPOINTMENT_START", offsetMinutes: 0 })).toBe("It waits until you record that the visit happened.");
    expect(describeStepReadiness({ anchor: "APPOINTMENT_END", offsetMinutes: -15 })).toContain("If it lands before the visit starts it is preparation");
    expect(describeStepReadiness({ anchor: "APPOINTMENT_END", offsetMinutes: 30 })).toBe("It waits until you record that the visit happened.");
    expect(describeStepReadiness({ anchor: "VISIT_COMPLETED", offsetMinutes: 0 })).toBe("It has nothing to count from until you mark the visit completed.");
    expect(describeStepReadiness({ anchor: "CALENDAR_DAY", offsetMinutes: null })).toBe("");
  });

  it("describes timing in the owner's words", () => {
    expect(describeStepTiming({ anchor: "APPOINTMENT_START", offsetMinutes: -90 })).toBe("1 hour 30 minutes before the appointment starts");
    expect(describeStepTiming({ anchor: "APPOINTMENT_START", offsetMinutes: 0 })).toBe("when the appointment starts");
    expect(describeStepTiming({ anchor: "APPOINTMENT_END", offsetMinutes: 0 })).toBe("when the appointment ends");
    expect(describeStepTiming({ anchor: "APPOINTMENT_END", offsetMinutes: 15 })).toBe("15 minutes after the appointment ends");
    expect(describeStepTiming({ anchor: "VISIT_COMPLETED", offsetMinutes: 0 })).toBe("as soon as the visit is marked completed");
    expect(describeStepTiming({ anchor: "VISIT_COMPLETED", offsetMinutes: 2880 })).toBe("2 days after the visit is marked completed");
    expect(describeStepTiming({ anchor: "CALENDAR_DAY", offsetMinutes: null })).toBe("on its calendar day");
  });
});
