import { describe, expect, it } from "vitest";
import { MAX_STEP_OFFSET_MINUTES, anchoredStepInstant, anchoredStepIsPreparation, describeStepTiming, validateStepTiming } from "@/lib/step-timing";

const appointment = { startsAt: new Date("2026-10-06T20:00:00Z"), endsAt: new Date("2026-10-06T20:45:00Z"), outcome: null as string | null, outcomeAt: null as Date | null };

describe("step timing", () => {
  it("normalizes editor input and refuses what cannot be timed", () => {
    expect(validateStepTiming("", "", 1)).toEqual({ anchor: "CALENDAR_DAY", offsetMinutes: null });
    expect(validateStepTiming("CALENDAR_DAY", "90", 1)).toEqual({ anchor: "CALENDAR_DAY", offsetMinutes: null });
    expect(validateStepTiming("APPOINTMENT_START", "-90", 2)).toEqual({ anchor: "APPOINTMENT_START", offsetMinutes: -90 });
    expect(validateStepTiming("APPOINTMENT_END", "60", 3)).toEqual({ anchor: "APPOINTMENT_END", offsetMinutes: 60 });
    expect(validateStepTiming("VISIT_COMPLETED", "0", 4)).toEqual({ anchor: "VISIT_COMPLETED", offsetMinutes: 0 });
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

  it("describes timing in the owner's words", () => {
    expect(describeStepTiming({ anchor: "APPOINTMENT_START", offsetMinutes: -90 })).toBe("1 hour 30 minutes before the appointment starts");
    expect(describeStepTiming({ anchor: "APPOINTMENT_END", offsetMinutes: 15 })).toBe("15 minutes after the appointment ends");
    expect(describeStepTiming({ anchor: "VISIT_COMPLETED", offsetMinutes: 0 })).toBe("as soon as the visit is marked completed");
    expect(describeStepTiming({ anchor: "VISIT_COMPLETED", offsetMinutes: 2880 })).toBe("2 days after the visit is marked completed");
    expect(describeStepTiming({ anchor: "CALENDAR_DAY", offsetMinutes: null })).toBe("on its calendar day");
  });
});
