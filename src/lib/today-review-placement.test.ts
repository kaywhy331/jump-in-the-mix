import { describe, expect, it } from "vitest";
import { placeTodayGroups, type TodayDueGroup, type TodayReviewPin } from "./today-review-placement";

const groups: TodayDueGroup[] = [
  { contactId: "a", section: "overdue", jumpIds: ["a-1"] },
  { contactId: "b", section: "today", jumpIds: ["b-1", "b-2"] },
  { contactId: "c", section: "today", jumpIds: ["c-1"] }
];
const pin: TodayReviewPin = { contactId: "b", jumpId: "b-1", section: "overdue" };
const ids = (rows: TodayDueGroup[]) => rows.map(row => row.contactId);

describe("Today's open review placement", () => {
  it("keeps a person's newly grouped follow-ups in the open review's section and adjusts both counts", () => {
    const placed = placeTodayGroups(groups, pin);
    expect(ids(placed.overdue)).toEqual(["a", "b"]);
    expect(ids(placed.today)).toEqual(["c"]);
    expect(placed.overdueAdjustment).toBe(2);
    expect(placed.overdue[1]).toBe(groups[1]);
    expect(groups[1].section).toBe("today");
  });

  it("keeps the earlier follow-up under Today when its later one leaves", () => {
    const fresh: TodayDueGroup[] = [groups[0], { ...groups[1], section: "overdue", jumpIds: ["b-1"] }, groups[2]];
    const placed = placeTodayGroups(fresh, { ...pin, section: "today" });
    expect(ids(placed.overdue)).toEqual(["a"]);
    expect(ids(placed.today)).toEqual(["b", "c"]);
    expect(placed.overdueAdjustment).toBe(-1);
  });

  it("keeps the server's due order when another person's earlier follow-up arrives", () => {
    const fresh: TodayDueGroup[] = [{ contactId: "new", section: "today", jumpIds: ["new-1"] }, ...groups];
    expect(ids(placeTodayGroups(fresh, { ...pin, section: "today" }).today)).toEqual(["new", "b", "c"]);
  });

  it("places a held person in due order among the other section's people", () => {
    expect(ids(placeTodayGroups([groups[1], groups[0], groups[2]], pin).overdue)).toEqual(["b", "a"]);
  });

  it("does not move a later person ahead of the review when an earlier person leaves", () => {
    expect(ids(placeTodayGroups(groups.slice(1), { ...pin, section: "today" }).today)).toEqual(["b", "c"]);
  });

  it("lets a closed review return to the current grouping", () => {
    const placed = placeTodayGroups(groups, null);
    expect(ids(placed.overdue)).toEqual(["a"]);
    expect(ids(placed.today)).toEqual(["b", "c"]);
    expect(placed.overdueAdjustment).toBe(0);
  });

  it("does not hold the person's remaining follow-up after the reviewed one leaves", () => {
    const fresh = [groups[0], { ...groups[1], jumpIds: ["b-2"] }, groups[2]];
    expect(placeTodayGroups(fresh, pin)).toEqual(placeTodayGroups(fresh, null));
  });

  it("does not recreate a person removed or filtered out of the fresh page", () => {
    const fresh = [groups[0], groups[2]];
    expect(placeTodayGroups(fresh, pin)).toEqual(placeTodayGroups(fresh, null));
  });
});
