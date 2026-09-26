import { describe, expect, it } from "vitest";
import { conflictMessage, findConflict, normalizeBufferMinutes, slotAvailability } from "../src/lib/calendar-availability";

const meeting = { id: "m1", title: "Estimate with Jordan", kind: "MEETING", start: 600, end: 660 };
const block = { id: "b1", title: "Lunch", kind: "BLOCK", start: 720, end: 780 };

describe("appointment availability with a buffer", () => {
  it("reports a direct overlap before a buffer conflict", () => {
    expect(findConflict({ kind: "MEETING", start: 630, end: 690 }, [meeting], 15)).toEqual({ entry: meeting, withinBuffer: false });
    expect(findConflict({ kind: "MEETING", start: 660, end: 720 }, [meeting], 15)).toEqual({ entry: meeting, withinBuffer: true });
    expect(findConflict({ kind: "MEETING", start: 675, end: 720 }, [meeting], 15)).toBeNull();
    expect(findConflict({ kind: "MEETING", start: 540, end: 590 }, [meeting], 15)).toEqual({ entry: meeting, withinBuffer: true });
  });
  it("leaves time blocks out of the buffer", () => {
    expect(findConflict({ kind: "MEETING", start: 690, end: 720 }, [block], 30)).toBeNull();
    expect(findConflict({ kind: "BLOCK", start: 660, end: 720 }, [meeting], 30)).toBeNull();
    expect(findConflict({ kind: "BLOCK", start: 650, end: 720 }, [meeting], 30)).toEqual({ entry: meeting, withinBuffer: false });
  });
  it("names the earliest conflicting appointment", () => {
    const later = { ...meeting, id: "m2", title: "Later", start: 700, end: 760 };
    expect(findConflict({ kind: "MEETING", start: 640, end: 720 }, [later, meeting], 0)?.entry.id).toBe("m1");
    expect(conflictMessage({ entry: meeting, withinBuffer: true }, 15)).toContain("15-minute buffer around “Estimate with Jordan”");
    expect(conflictMessage({ entry: meeting, withinBuffer: false }, 15)).toContain("overlaps “Estimate with Jordan”");
  });
  it("grays out taken slots with the appointment name and marks the buffer around them", () => {
    const states = slotAvailability([540, 570, 600, 630, 660, 690, 720], 30, [meeting, block], 30, "MEETING");
    expect(states.map(slot => slot.state)).toEqual(["free", "buffer", "busy", "busy", "buffer", "free", "busy"]);
    expect(states[2].title).toBe("Estimate with Jordan");
    expect(states[6].title).toBe("Lunch");
  });
  it("keeps the buffer setting within bounds", () => {
    expect(normalizeBufferMinutes("15")).toBe(15);
    expect(normalizeBufferMinutes(-5)).toBe(0);
    expect(normalizeBufferMinutes("abc")).toBe(0);
    expect(normalizeBufferMinutes(999)).toBe(240);
  });
});
