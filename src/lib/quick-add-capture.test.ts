import { describe, expect, it } from "vitest";
import { inferQuickAddCapture, inferQuickCaptureReview, splitContactName } from "./quick-add-capture";

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

  it("recognizes bare and abbreviated weekdays", () => {
    expect(inferQuickAddCapture("Text Maria Friday about the estimate", now)).toMatchObject({ name: "Maria", dateValue: "2026-07-24", reason: "the estimate" });
    expect(inferQuickAddCapture("Call Devon Mon", now).dateValue).toBe("2026-07-27");
  });

  it("recognizes relative weeks and named months", () => {
    expect(inferQuickAddCapture("Call Avery in 2 weeks", now).dateValue).toBe("2026-08-04");
    expect(inferQuickAddCapture("Email Priya Sept 12", now).dateValue).toBe("2026-09-12");
  });

  it("captures an email address", () => {
    expect(inferQuickAddCapture("Add Sam sam@example.com", now)).toMatchObject({ name: "Sam", email: "sam@example.com" });
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

describe("combined capture suggestions", () => {
  const now = new Date("2026-09-20T19:00:00Z");
  it("keeps event and follow-up dates separate without inventing follow-up time", () => {
    const result = inferQuickCaptureReview("Coffee with Marcus Thursday at 9 am at Blue Door, then remind me Friday to send revised proposal", now, "America/Los_Angeles");
    expect(result.name).toBe("Marcus");
    expect(result.event).toMatchObject({ enabled: true, title: "Coffee with Marcus", date: "2026-09-24", time: "09:00", location: "Blue Door" });
    expect(result.followUp).toMatchObject({ enabled: true, date: "2026-09-25", time: "", reason: "send revised proposal" });
  });
  it("does not turn a past meeting note into a future event", () => {
    const result = inferQuickCaptureReview("Met Jordan at the home show. Follow up Tuesday about the quote", now, "UTC");
    expect(result.name).toBe("Jordan"); expect(result.event.enabled).toBe(false);
    expect(result.followUp).toMatchObject({ date: "2026-09-22", reason: "the quote" });
  });
  it("keeps text instructions out of customer-facing message copy", () => {
    const result = inferQuickCaptureReview("Text Maria Friday at 3 pm about the estimate", now, "UTC");
    expect(result.followUp).toMatchObject({ channel: "SMS", time: "15:00", wording: "" });
  });
});
