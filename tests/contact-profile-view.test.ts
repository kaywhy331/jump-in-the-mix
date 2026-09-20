import { describe, expect, it } from "vitest";
import { contactDueLabel, recordedStageChanges, sameContactSequence } from "../src/lib/contact-profile-view";

const preferences = { locale: "en-US", timeZone: "America/Los_Angeles" };
const beat = (id: string, date: string, offset = 0) => ({ id, mixId: "mix-a", mixStepId: id, jumpDateId: "birthday", appointmentBindingId: null as string | null, templateSnapshot: { originalLocalDate: date } as unknown, mixStep: { dayOffset: offset, plannedAt: null as Date | null } });

describe("contact timeline meaning", () => {
  it("groups beats from one occurrence while excluding other Mixes and annual runs", () => {
    const first = beat("first", "2026-09-19");
    expect(sameContactSequence(first, beat("second", "2026-09-23", 4))).toBe(true);
    expect(sameContactSequence(first, beat("last-year", "2025-09-23", 4))).toBe(false);
    expect(sameContactSequence(first, { ...beat("other", "2026-09-23", 4), mixId: "mix-b" })).toBe(false);
  });
  it("keeps appointment runs separate even when dates and steps match", () => {
    const first = { ...beat("a", "2026-09-19"), appointmentBindingId: "visit-a" };
    expect(sameContactSequence(first, { ...beat("b", "2026-09-20"), appointmentBindingId: "visit-a" })).toBe(true);
    expect(sameContactSequence(first, { ...beat("c", "2026-09-19"), appointmentBindingId: "visit-b" })).toBe(false);
  });
  it("does not invent links between legacy or planned records without an occurrence stamp", () => {
    const legacy = { ...beat("legacy", "2026-09-19"), templateSnapshot: {} };
    expect(sameContactSequence(legacy, legacy)).toBe(true);
    expect(sameContactSequence(legacy, { ...legacy, id: "other" })).toBe(false);
    expect(sameContactSequence(beat("a", "2026-09-19"), { ...beat("b", "2026-09-20", 1), mixStep: { dayOffset: 1, plannedAt: new Date("2026-09-20") } })).toBe(false);
  });
  it("retains real returns to an earlier stage but removes consecutive no-op events", () => {
    const events = ["lead", "lead", "client", "client", "lead"].map((resultingStageId, id) => ({ id, resultingStageId }));
    expect(recordedStageChanges(events).map(event => event.id)).toEqual([0, 2, 4]);
  });
  it("counts lateness by the viewer's calendar across daylight-saving changes", () => {
    expect(contactDueLabel(new Date("2026-03-08T08:30:00Z"), new Date("2026-03-09T07:05:00Z"), preferences)).toBe("1 day late");
    expect(contactDueLabel(new Date("2026-09-19T08:00:00Z"), new Date("2026-09-19T20:00:00Z"), preferences)).toMatch(/^Earlier today/);
    expect(contactDueLabel(new Date("2026-09-20T16:00:00Z"), new Date("2026-09-19T20:00:00Z"), preferences)).toMatch(/^Tomorrow/);
  });
});
