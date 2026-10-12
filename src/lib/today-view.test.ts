import { describe, expect, it } from "vitest";
import { zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { calendarDaysOverdue, doneGrowth, doneSummaryCount, failedDeliveryNotice, groupDueFollowUps } from "@/lib/today-view";

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
      ["The saved phone number could not be read with its country code, so it was not texted automatically.", "the saved phone number couldn’t be read with a country code"],
      ["Text delivery failed with status 400: The 'To' number is not a valid phone number.", "the provider rejected it"],
      ["Resend returned 422", "the provider rejected it"],
      [null, "the provider rejected it"]
    ];
    for (const [error, reason] of cases) {
      expect(failedDeliveryNotice(error)).toEqual({ kind: "failed", text: `Couldn’t send automatically: ${reason}. Send it yourself.` });
    }
  });
});

describe("doneSummaryCount", () => {
  it("shows today's completed total in the due view, whatever the open page lists", () => {
    expect(doneSummaryCount("due", 2, 7)).toBe(7);
    expect(doneSummaryCount("due", 0, 7)).toBe(7);
    expect(doneSummaryCount("due", 0, 0)).toBe(0);
  });

  it("counts what the page lists in other date ranges, where there is no today to total", () => {
    expect(doneSummaryCount("week", 2, 7)).toBe(2);
    expect(doneSummaryCount("month", 0, 7)).toBe(0);
    expect(doneSummaryCount("all", 30, 7)).toBe(30);
  });
});

describe("doneGrowth", () => {
  const view = { range: "week", status: "all", priority: "all" };
  const page = { pending: 0, pendingOnPage: 0, listedCompleted: 0, size: 30, previous: false };

  it("grows the due view's Done with completed outcomes, never skipped ones", () => {
    expect(doneGrowth({ ...view, range: "due" }, { ...page, pending: 45, pendingOnPage: 30 })).toEqual({ done: true, skipped: false });
  });

  it("grows a list's Done while every pending follow-up fits on the page", () => {
    expect(doneGrowth(view, { ...page, pending: 29, pendingOnPage: 29 })).toEqual({ done: true, skipped: true });
    expect(doneGrowth(view, { ...page, pending: 30, pendingOnPage: 30 })).toEqual({ done: true, skipped: true });
    expect(doneGrowth(view, { ...page, pending: 31, pendingOnPage: 30 })).toEqual({ done: false, skipped: false });
  });

  it("grows it on a later page that already lists completed follow-ups", () => {
    expect(doneGrowth(view, { ...page, pending: 45, pendingOnPage: 15, listedCompleted: 12 })).toEqual({ done: true, skipped: true });
  });

  it("grows it on a later page whose pending follow-ups leave room, before any completed one is listed", () => {
    expect(doneGrowth(view, { ...page, pending: 45, pendingOnPage: 15 })).toEqual({ done: true, skipped: true });
  });

  it("keeps it on any Previous page, read back from a pending or a completed follow-up", () => {
    expect(doneGrowth(view, { ...page, pending: 45, pendingOnPage: 15, previous: true })).toEqual({ done: false, skipped: false });
    expect(doneGrowth(view, { ...page, pending: 12, pendingOnPage: 12, listedCompleted: 12, previous: true })).toEqual({ done: false, skipped: false });
  });

  it("follows the status filter, and doesn't grow when only overdue follow-ups are listed", () => {
    expect(doneGrowth({ ...view, status: "pending" }, { ...page, pending: 3, pendingOnPage: 3 })).toEqual({ done: false, skipped: false });
    expect(doneGrowth({ ...view, status: "done" }, { ...page, listedCompleted: 4 })).toEqual({ done: true, skipped: false });
    expect(doneGrowth({ ...view, status: "skipped" }, { ...page, listedCompleted: 4 })).toEqual({ done: false, skipped: true });
    expect(doneGrowth({ ...view, priority: "overdue" }, { ...page, pending: 3, pendingOnPage: 3 })).toEqual({ done: false, skipped: false });
  });
});

describe("groupDueFollowUps", () => {
  const startToday = new Date("2026-10-09T00:00:00.000Z");
  const due = (id: string, contactId: string, hoursFromMidnight: number) => ({ id, contactId, scheduledAt: new Date(startToday.getTime() + hoursFromMidnight * 3_600_000) });
  const ids = (groups: { id: string }[][]) => groups.map(group => group.map(item => item.id));

  it("keeps one card per follow-up when each person has one, each in its own section", () => {
    const result = groupDueFollowUps([due("a", "A", -30), due("b", "B", 2), due("c", "C", 5)], startToday);
    expect(ids(result.overdue)).toEqual([["a"]]);
    expect(ids(result.today)).toEqual([["b"], ["c"]]);
    expect(result.moved).toBe(0);
  });

  it("puts a person's overdue and due-today follow-ups on one card under Today, led by the earlier", () => {
    const result = groupDueFollowUps([due("text", "M", -24), due("p", "P", 1), due("call", "M", 3)], startToday);
    expect(ids(result.overdue)).toEqual([]);
    expect(ids(result.today)).toEqual([["text", "call"], ["p"]]);
    expect(result.moved).toBe(1);
  });

  it("keeps three of one person's follow-ups in due order and counts both overdue ones as moved", () => {
    const result = groupDueFollowUps([due("one", "M", -48), due("two", "M", -24), due("three", "M", 4)], startToday);
    expect(ids(result.today)).toEqual([["one", "two", "three"]]);
    expect(result.moved).toBe(2);
  });

  it("leaves a card whose follow-ups are all overdue under Overdue", () => {
    const result = groupDueFollowUps([due("one", "M", -48), due("two", "M", -2)], startToday);
    expect(ids(result.overdue)).toEqual([["one", "two"]]);
    expect(ids(result.today)).toEqual([]);
    expect(result.moved).toBe(0);
  });

  it("orders cards by their first follow-up", () => {
    const result = groupDueFollowUps([due("a1", "A", -5), due("b1", "B", -4), due("b2", "B", 1), due("a2", "A", 2)], startToday);
    expect(ids(result.today)).toEqual([["a1", "a2"], ["b1", "b2"]]);
    expect(result.moved).toBe(2);
  });

  it("keeps an overdue follow-up under Overdue, and counted there, when the person's due-today one is on another page", () => {
    // Page 1 holds only the overdue text; the call due today is the 31st follow-up, on page 2.
    expect(groupDueFollowUps([due("text", "M", -24), due("p", "P", 1)], startToday)).toEqual({ overdue: [[expect.objectContaining({ id: "text" })]], today: [[expect.objectContaining({ id: "p" })]], moved: 0 });
    expect(groupDueFollowUps([due("call", "M", 9)], startToday).moved).toBe(0);
  });

  it("lets every section count at least the cards it shows, wherever the pages break", () => {
    const list = [due("m1", "M", -50), due("n1", "N", -26), due("m2", "M", -20), due("p1", "P", 1), due("n2", "N", 2), due("q1", "Q", 3), due("m3", "M", 6), due("p2", "P", 7)];
    const overdueTotal = list.filter(item => item.scheduledAt < startToday).length;
    const todayTotal = list.length - overdueTotal;
    for (let start = 0; start < list.length; start++) {
      for (let end = start + 1; end <= list.length; end++) {
        const { overdue, today, moved } = groupDueFollowUps(list.slice(start, end), startToday);
        expect(overdueTotal - moved).toBeGreaterThanOrEqual(overdue.flat().length);
        expect(todayTotal + moved).toBeGreaterThanOrEqual(today.flat().length);
      }
    }
  });
});
