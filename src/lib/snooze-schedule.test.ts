import { describe, expect, it } from "vitest";
import { resolveSnooze, snoozeChoices } from "@/lib/snooze-schedule";

describe("resolveSnooze", () => {
  it("never pulls a follow-up ahead of its base instant", () => {
    const base = new Date("2026-09-20T17:00:00.000Z");
    const earlier = new Date("2026-09-18T17:00:00.000Z");
    const later = new Date("2026-09-22T17:00:00.000Z");
    expect(resolveSnooze({ chosen: earlier, baseScheduledAt: base })).toEqual({ ok: false, dueAt: base });
    expect(resolveSnooze({ chosen: later, baseScheduledAt: base })).toEqual({ ok: true, scheduledAt: later });
    expect(resolveSnooze({ chosen: earlier, baseScheduledAt: null })).toEqual({ ok: true, scheduledAt: earlier });
  });
});

describe("snoozeChoices", () => {
  const timezone = "America/Los_Angeles";
  const now = new Date("2026-09-14T16:00:00.000Z"); // Monday 09:00 Pacific

  it("offers every preset for an overdue follow-up", () => {
    const choices = snoozeChoices({ now, timezone, floor: new Date("2026-09-10T17:00:00.000Z") });
    expect(choices.presets.map(([preset]) => preset)).toEqual(["later-today", "tomorrow", "next-monday", "next-week"]);
    expect(choices.minDate).toBe("2026-09-14");
    expect(choices.defaultDate).toBe("2026-09-15");
  });

  it("hides presets that land before a follow-up due later today", () => {
    const choices = snoozeChoices({ now, timezone, floor: new Date("2026-09-14T22:00:00.000Z") }); // 15:00 Pacific today
    expect(choices.presets.map(([preset]) => preset)).toEqual(["tomorrow", "next-monday", "next-week"]);
  });

  it("starts the custom picker at the day a future follow-up is due", () => {
    const choices = snoozeChoices({ now, timezone, floor: new Date("2026-09-24T17:00:00.000Z") });
    expect(choices.presets).toEqual([]);
    expect(choices.minDate).toBe("2026-09-24");
    expect(choices.defaultDate).toBe("2026-09-24");
  });
});
