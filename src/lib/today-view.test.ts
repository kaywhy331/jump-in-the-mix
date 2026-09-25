import { describe, expect, it } from "vitest";
import { zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { calendarDaysOverdue, failedDeliveryNotice } from "@/lib/today-view";

const NEW_YORK = "America/New_York";

/** The page's former arithmetic: elapsed milliseconds since the start of today, rounded down, plus one. */
function elapsedDaysOverdue(scheduledAt: Date, startToday: Date): number {
  return Math.max(1, Math.floor((startToday.getTime() - scheduledAt.getTime()) / 86_400_000) + 1);
}

describe("calendarDaysOverdue", () => {
  it("counts calendar days across the March spring-forward, not elapsed 24-hour blocks", () => {
    // Clocks jumped forward on 2026-03-08, so 23:30 on the 7th is only 23.5 hours before the 9th begins.
    const today = { year: 2026, month: 3, day: 9 };
    const scheduledAt = zonedDateTimeToUtc({ year: 2026, month: 3, day: 7 }, 23 * 60 + 30, NEW_YORK);
    expect(scheduledAt.toISOString()).toBe("2026-03-08T04:30:00.000Z");
    expect(calendarDaysOverdue(scheduledAt, today, NEW_YORK)).toBe(2);
    expect(elapsedDaysOverdue(scheduledAt, zonedDateTimeToUtc(today, 0, NEW_YORK))).toBe(1);
  });

  it("does not add a day across the November fall-back", () => {
    // Clocks fell back on 2026-11-01, so 00:30 on the 1st is 24.5 hours before the 2nd begins.
    const today = { year: 2026, month: 11, day: 2 };
    const scheduledAt = zonedDateTimeToUtc({ year: 2026, month: 11, day: 1 }, 30, NEW_YORK);
    expect(scheduledAt.toISOString()).toBe("2026-11-01T04:30:00.000Z");
    expect(calendarDaysOverdue(scheduledAt, today, NEW_YORK)).toBe(1);
    expect(elapsedDaysOverdue(scheduledAt, zonedDateTimeToUtc(today, 0, NEW_YORK))).toBe(2);
  });

  it("counts ordinary days and never says fewer than one", () => {
    const today = { year: 2026, month: 9, day: 24 };
    expect(calendarDaysOverdue(new Date("2026-09-21T15:00:00Z"), today, "UTC")).toBe(3);
    expect(calendarDaysOverdue(new Date("2026-09-23T23:59:59Z"), today, "UTC")).toBe(1);
    // A follow-up due earlier today is not overdue by a day; the page never asks, but the floor holds.
    expect(calendarDaysOverdue(new Date("2026-09-24T01:00:00Z"), today, "UTC")).toBe(1);
    // The owner's timezone decides the date: 01:00 UTC on the 24th is still the 23rd in New York.
    expect(calendarDaysOverdue(new Date("2026-09-24T01:00:00Z"), today, NEW_YORK)).toBe(1);
    expect(calendarDaysOverdue(new Date("2026-09-23T01:00:00Z"), today, NEW_YORK)).toBe(2);
  });
});

describe("failedDeliveryNotice", () => {
  it("asks the owner to check sent messages when the worker could not tell the result", () => {
    for (const error of [
      "Delivery result became uncertain after the worker stopped. It was not retried to prevent a duplicate message.",
      "The automatic-delivery lease was lost before completion.",
      "The operation was aborted due to timeout",
      "fetch failed"
    ]) {
      expect(failedDeliveryNotice(error)).toEqual({ kind: "uncertain", text: "We couldn’t confirm whether this was sent. Check your sent messages before sending again." });
    }
  });

  it("maps the worker's stored errors to plain reasons and tells the owner to send it", () => {
    const cases: Array<[string | null, string]> = [
      ["This customer has no phone number.", "this person has no phone number"],
      ["This customer has no email address.", "this person has no email address"],
      ["The prepared message is empty or cannot be sent automatically.", "the message was empty"],
      ["The prepared text exceeds Twilio's 1,600-character limit.", "the message was too long"],
      ["Automatic text delivery is not configured.", "automatic sending isn’t set up"],
      ["Text delivery failed with status 400: The 'To' number is not a valid phone number.", "the provider rejected it"],
      ["Resend returned 422", "the provider rejected it"],
      [null, "the provider rejected it"]
    ];
    for (const [error, reason] of cases) {
      expect(failedDeliveryNotice(error)).toEqual({ kind: "failed", text: `Couldn’t send automatically: ${reason}. Send it yourself.` });
    }
  });
});
