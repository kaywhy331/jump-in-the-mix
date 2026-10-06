import { describe, expect, it } from "vitest";
import { bulkMixStartNotice, noMixTodayLine, type MixStartCounts } from "../src/lib/contact-mix-status-labels";

describe("No Mix wording (JITM-09 §2.76–§2.77)", () => {
  it("says that no Mix will remind the owner, in the singular and the plural (D44)", () => {
    expect(noMixTodayLine(1)).toBe("1 person has No Mix, so no Mix will remind you about them.");
    expect(noMixTodayLine(3)).toBe("3 people have No Mix, so no Mix will remind you about them.");
    // A one-time follow-up may still be on its way, so the line never says nothing will remind the owner.
    for (const count of [1, 2]) expect(noMixTodayLine(count)).not.toMatch(/nothing will remind/);
  });

  const counts = (partial: Partial<MixStartCounts>): MixStartCounts => ({ started: 0, "already-running": 0, "saved-date-kept": 0, "date-written": 0, ...partial });
  const notice = (partial: Partial<MixStartCounts>, options: { startsToday?: boolean; waitsForVisit?: boolean } = {}) =>
    bulkMixStartNotice({ mixName: "Estimate follow-up", counts: counts(partial), startDay: "Oct 9", startsToday: options.startsToday ?? true, waitsForVisit: options.waitsForVisit ?? false });

  it("names the Mix and what the bulk start did for each group of people (BLK-01)", () => {
    expect(notice({ started: 3, "already-running": 1 }, { waitsForVisit: true }))
      .toBe("Estimate follow-up started for 3 people. 1 was already in it and keeps their start. Beats timed from an appointment wait until you line each person up with a visit.");
    expect(notice({ started: 1 })).toBe("Estimate follow-up started for 1 person.");
    expect(notice({ started: 2 }, { startsToday: false })).toBe("Estimate follow-up starts on Oct 9 for 2 people.");
    expect(notice({ "already-running": 2 }, { waitsForVisit: true })).toBe("2 people were already in Estimate follow-up and keep their start.");
    expect(notice({ "already-running": 1 })).toBe("1 person was already in Estimate follow-up and keeps their start.");
  });

  it("says which people a date-based Mix follows and which got the start day as their date (BLK-01)", () => {
    expect(notice({ "saved-date-kept": 2, "date-written": 1 }, { startsToday: false }))
      .toBe("Estimate follow-up started for 3 people. 2 follow their saved date. 1 had no saved date, so Oct 9 was saved for them.");
    expect(notice({ "saved-date-kept": 1, "already-running": 2 })).toBe("Estimate follow-up started for 1 person. 2 were already in it and keep their start. 1 follows their saved date.");
  });
});
