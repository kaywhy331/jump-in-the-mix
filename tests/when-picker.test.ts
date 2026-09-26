import { describe, expect, it } from "vitest";
import { addDays, addMinutesToLocal, addMonths, formatDateTrigger, formatDurationLabel, formatTimeLabel, keyboardDateTarget, keyboardSlotTarget, monthGrid, parseDateKey, quickSelects, splitLocal, timeSlots, weekdayOf } from "../src/lib/when-picker";

describe("follow-up date and time picker helpers", () => {
  it("offers the common follow-up windows as one-tap choices", () => {
    expect(quickSelects("2026-09-11").map(item => [item.label, item.date])).toEqual([
      ["Today", "2026-09-11"], ["Tomorrow", "2026-09-12"], ["Next week", "2026-09-18"], ["In 2 weeks", "2026-09-25"], ["In 1 month", "2026-10-11"]
    ]);
  });
  it("adds days and months without depending on the browser timezone", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-9-1")).toBeNull();
  });
  it("lays the month out in whole weeks starting on Sunday", () => {
    const cells = monthGrid(2026, 10);
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({ key: "2026-09-27", day: 27, inMonth: false });
    expect(cells[4]).toEqual({ key: "2026-10-01", day: 1, inMonth: true });
    expect(cells.at(-1)).toEqual({ key: "2026-10-31", day: 31, inMonth: true });
    expect(monthGrid(2026, 2)).toHaveLength(28);
  });
  it("uses 30-minute business slots and keeps an off-grid current value", () => {
    const slots = timeSlots();
    expect(slots[0]).toBe("07:00");
    expect(slots.at(-1)).toBe("19:00");
    expect(slots).toHaveLength(25);
    expect(timeSlots({}, "09:15")).toContain("09:15");
    expect(timeSlots({}, "09:15").indexOf("09:15")).toBe(5);
    expect(timeSlots({ startMinutes: 540, endMinutes: 600, stepMinutes: 15 })).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
  });
  it("labels the triggers relative to today", () => {
    expect(formatDateTrigger("2026-09-11", "2026-09-11", "en-US")).toBe("Today, Sep 11");
    expect(formatDateTrigger("2026-09-12", "2026-09-11", "en-US")).toBe("Tomorrow, Sep 12");
    expect(formatDateTrigger("2026-10-14", "2026-09-11", "en-US")).toBe("Wed, Oct 14");
    expect(formatDateTrigger("2027-01-05", "2026-09-11", "en-US")).toBe("Tue, Jan 5, 2027");
    expect(formatDateTrigger("2026-10-14", null, "en-US")).toBe("Wed, Oct 14");
    expect(formatDateTrigger("", null, "en-US")).toBe("Choose a date");
    expect(formatTimeLabel("10:00", "en-US")).toBe("10:00 AM");
    expect(formatTimeLabel("13:30", "en-US")).toBe("1:30 PM");
    expect(formatDurationLabel(45)).toBe("45 min");
    expect(formatDurationLabel(90)).toBe("1.5 hr");
    expect(formatDurationLabel(120)).toBe("2 hr");
  });
  it("rolls an end time past midnight onto the next day", () => {
    expect(addMinutesToLocal("2026-09-11", "09:00", 30)).toEqual({ date: "2026-09-11", time: "09:30" });
    expect(addMinutesToLocal("2026-09-11", "23:30", 60)).toEqual({ date: "2026-09-12", time: "00:30" });
    expect(splitLocal("2026-09-11T09:00")).toEqual({ date: "2026-09-11", time: "09:00" });
    expect(splitLocal("2026-09-11")).toBeNull();
  });
  it("moves the focused day with the arrow, Home, End and Page keys", () => {
    // 2026-09-16 is a Wednesday.
    expect(weekdayOf("2026-09-16")).toBe(3);
    expect(keyboardDateTarget("2026-09-16", "ArrowLeft")).toBe("2026-09-15");
    expect(keyboardDateTarget("2026-09-16", "ArrowRight")).toBe("2026-09-17");
    expect(keyboardDateTarget("2026-09-16", "ArrowUp")).toBe("2026-09-09");
    expect(keyboardDateTarget("2026-09-16", "ArrowDown")).toBe("2026-09-23");
    expect(keyboardDateTarget("2026-09-16", "Home")).toBe("2026-09-13");
    expect(keyboardDateTarget("2026-09-16", "End")).toBe("2026-09-19");
    expect(keyboardDateTarget("2026-09-16", "PageUp")).toBe("2026-08-16");
    expect(keyboardDateTarget("2026-09-16", "PageDown")).toBe("2026-10-16");
    expect(keyboardDateTarget("2026-09-30", "ArrowRight")).toBe("2026-10-01");
    expect(keyboardDateTarget("2026-09-16", "Enter")).toBeNull();
    expect(keyboardDateTarget("not-a-date", "ArrowRight")).toBeNull();
  });
  it("keeps keyboard focus on the earliest allowed day instead of losing it in the past", () => {
    expect(keyboardDateTarget("2026-09-12", "ArrowLeft", "2026-09-11")).toBe("2026-09-11");
    expect(keyboardDateTarget("2026-09-11", "ArrowLeft", "2026-09-11")).toBe("2026-09-11");
    expect(keyboardDateTarget("2026-09-11", "ArrowUp", "2026-09-11")).toBe("2026-09-11");
    expect(keyboardDateTarget("2026-10-05", "PageUp", "2026-09-11")).toBe("2026-09-11");
    expect(keyboardDateTarget("2026-09-11", "ArrowRight", "2026-09-11")).toBe("2026-09-12");
  });
  it("moves the focused time slot by one, by a row, or to the ends, passing over taken slots", () => {
    const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].map(time => ({ time, available: time !== "10:00" && time !== "11:30" }));
    expect(keyboardSlotTarget(slots, "09:30", "ArrowRight")).toBe("10:30");
    expect(keyboardSlotTarget(slots, "10:30", "ArrowLeft")).toBe("09:30");
    expect(keyboardSlotTarget(slots, "09:00", "ArrowDown", 2)).toBe("11:00");
    expect(keyboardSlotTarget(slots, "09:30", "ArrowDown", 3)).toBe("11:00");
    expect(keyboardSlotTarget(slots, "11:00", "ArrowUp", 2)).toBe("09:00");
    expect(keyboardSlotTarget(slots, "09:00", "ArrowLeft")).toBeNull();
    expect(keyboardSlotTarget(slots, "11:00", "ArrowRight")).toBeNull();
    expect(keyboardSlotTarget(slots, "10:30", "Home")).toBe("09:00");
    expect(keyboardSlotTarget(slots, "09:00", "End")).toBe("11:00");
    expect(keyboardSlotTarget(slots, "09:00", "Tab")).toBeNull();
    expect(keyboardSlotTarget(slots, "08:00", "ArrowRight")).toBeNull();
  });
});
