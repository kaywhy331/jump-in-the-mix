import { describe, expect, it } from "vitest";
import { buildContactMixRows, contactMixRowStatus, type ContactMixRowInput } from "../src/lib/contact-mix-row-labels";
import { phoneDisplay, canonicalPhoneKey, storedPhoneDialTarget } from "../src/lib/phone-number";
import { recordedStageChanges } from "../src/lib/contact-profile-view";

const now = new Date("2026-10-28T12:00:00Z");
const input = (extra: Partial<ContactMixRowInput>): ContactMixRowInput => ({ mixes: [], starts: [], tags: [], stops: [], pending: [], work: [], preparing: { all: false, mixIds: [] }, ...extra });

describe("contact presentation without changing lifecycle", () => {
  it("groups real current and waiting work ahead of completed records, not by ACTIVE instance status", () => {
    const ids = ["due", "waiting", "complete", "stale", "stopped"];
    const rows = buildContactMixRows(input({
      mixes: ids.map(id => ({ id, name: id, status: "ACTIVE" })),
      starts: ids.map(mixId => ({ mixId, assignmentId: mixId })),
      currentMixIds: ["due", "waiting"], completedMixIds: ["complete", "stopped"],
      pending: [{ mixId: "due", at: now }],
      work: [{ id: "old-record", paused: false, runs: [{ mixId: "stale", viaConnection: false }] }],
      stops: [{ mixId: "stopped", planLimit: false, stageExit: false }]
    }));
    expect(Object.fromEntries(rows.map(row => [row.mixId, row.group]))).toEqual({ due: "current", waiting: "current", complete: "completed", stale: "inactive", stopped: "inactive" });
    expect(contactMixRowStatus(rows.find(row => row.mixId === "complete")!, now, { locale: "en-US", timeZone: "UTC" }).label).toBe("Completed");
  });

  it("keeps an archived outcome or callback actionable without treating the Mix as reactivated", () => {
    const rows = buildContactMixRows(input({
      mixes: [{ id: "archived", name: "Past estimate", status: "ARCHIVED" }, { id: "ended", name: "Ended plan", status: "ARCHIVED" }],
      outstandingMixIds: ["archived"], completedMixIds: ["ended"], currentMixIds: [],
      preparing: { all: true, mixIds: [] }
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mixId: "archived", mixStatus: "ARCHIVED", group: "current", preparing: false });
  });

  it("preserves a return to a previous stage and only the event dates that were recorded", () => {
    const events = ["lead", "client", "lead"].map((resultingStageId, i) => ({ id: String(i), resultingStageId, occurredAt: new Date(`2026-10-${10 + i}T12:00:00Z`) }));
    expect(recordedStageChanges(events)).toEqual(events);
    expect(events.every(event => event.occurredAt < now)).toBe(true);
  });

  it("formats phone display while preserving recipient and dialing values", () => {
    const stored = "+14155550102";
    const canonical = canonicalPhoneKey(stored, "US");
    const before = storedPhoneDialTarget({ phone: stored, normalized: canonical! }, "US");
    expect(phoneDisplay(stored, "US")).toBe("(415) 555-0102");
    expect(stored).toBe("+14155550102");
    expect(storedPhoneDialTarget({ phone: stored, normalized: canonical! }, "US")).toBe(before);
    expect(phoneDisplay("+442079460958", "US")).toBe("+44 20 7946 0958");
    expect(phoneDisplay("02079460958", "GB")).toBe("020 7946 0958");
    expect(phoneDisplay("555-0102 x9", "US")).toBe("555-0102 x9");
    expect(phoneDisplay("not a phone", "US")).toBe("not a phone");
    expect(phoneDisplay("0412 345 678", "US")).toBe("0412 345 678");
    expect(phoneDisplay("+14155550102 ext. 9", "US")).toContain("ext. 9");
  });
});
