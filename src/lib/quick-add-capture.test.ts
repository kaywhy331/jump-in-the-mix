import { describe, expect, it } from "vitest";
import { inferQuickAddCapture, splitContactName } from "./quick-add-capture";

describe("splitContactName", () => {
  it("keeps the first token as the first name and preserves the remaining family name", () => {
    expect(splitContactName("Jordan Lee Smith")).toEqual({ firstName: "Jordan", lastName: "Lee Smith" });
  });

  it("handles a single name", () => {
    expect(splitContactName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
  });
});

describe("inferQuickAddCapture", () => {
  const now = new Date(2026, 6, 21, 12, 0, 0);

  it("extracts a person, date, and reason for a follow-up", () => {
    expect(inferQuickAddCapture("Follow up with Jordan Lee next Monday about the proposal", now)).toMatchObject({
      name: "Jordan Lee",
      dateValue: "2026-07-27",
      reason: "the proposal"
    });
  });

  it("normalizes tomorrow without a timezone conversion", () => {
    expect(inferQuickAddCapture("Call Avery tomorrow regarding renewal", now).dateValue).toBe("2026-07-22");
  });

  it("recognizes every supported named weekday and makes the resolved date explicit", () => {
    expect(inferQuickAddCapture("Email Priya next Friday", now)).toMatchObject({
      name: "Priya",
      timing: "next Friday",
      dateValue: "2026-07-24"
    });
  });

  it("carries a phone number without including it in the Contact name", () => {
    expect(inferQuickAddCapture("Add Sam with 626-555-0100", now)).toMatchObject({
      name: "Sam",
      phone: "626-555-0100"
    });
  });

  it("carries a meeting name and context without inventing a scheduled follow-up", () => {
    expect(inferQuickAddCapture("I met Elena at the chamber event.", now)).toMatchObject({
      name: "Elena",
      dateValue: null,
      reason: "Met at the chamber event"
    });
  });

  it("rolls a yearless date forward when it has already passed", () => {
    expect(inferQuickAddCapture("Text Sam 1/15 about planning", now).dateValue).toBe("2027-01-15");
  });
});
