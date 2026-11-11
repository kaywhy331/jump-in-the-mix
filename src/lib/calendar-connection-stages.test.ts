import { describe, expect, it } from "vitest";
import { CALENDAR_CONNECTION_STAGES, calendarConnectionStage } from "@/lib/calendar-connection-stages";

// Calendar lists a row as connected, with Refresh now, only in the stage every refresh reads (JITM-UXS-02-FU2).
describe("calendarConnectionStage", () => {
  const synced = new Date("2026-11-10T12:00:00Z");

  it("reads a row created pending as pending, whatever else it holds", () => {
    expect(calendarConnectionStage({ ...CALENDAR_CONNECTION_STAGES.pending })).toBe("pending");
    const leftover = { ...CALENDAR_CONNECTION_STAGES.pending, urlEncrypted: null, lastError: "Could not refresh this calendar." };
    expect(calendarConnectionStage(leftover)).toBe("pending");
  });

  it("reads a turned-on row as connected, synced or not, so existing rows keep their presentation", () => {
    expect(calendarConnectionStage({ ...CALENDAR_CONNECTION_STAGES.connected, lastSyncedAt: synced })).toBe("connected");
    expect(calendarConnectionStage({ ...CALENDAR_CONNECTION_STAGES.connected, lastSyncedAt: null })).toBe("connected");
  });

  it("reads a turned-off row that has synced as neither stage", () => {
    expect(calendarConnectionStage({ enabled: !CALENDAR_CONNECTION_STAGES.connected.enabled, lastSyncedAt: synced })).toBeNull();
  });
});
