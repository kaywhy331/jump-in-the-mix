import { describe, expect, it } from "vitest";
import { buildContactMixRows, contactMixRowRoute, contactMixRowStatus, contactMixRowSummary, type ContactMixRowInput } from "../src/lib/contact-mix-row-labels";

const preferences = { timeZone: "America/New_York", locale: "en-US" };
const now = new Date("2026-10-11T16:00:00Z");
const input = (partial: Partial<ContactMixRowInput>): ContactMixRowInput => ({ mixes: [], starts: [], tags: [], stops: [], pending: [], preparing: { mixIds: [], all: false }, work: [], ...partial });
const mix = (id: string, name: string, status: ContactMixRowInput["mixes"][number]["status"] = "ACTIVE") => ({ id, name, status });

describe("the profile's Mixes rows (D77)", () => {
  it("gives each Mix one row, whatever placed the person in it", () => {
    const rows = buildContactMixRows(input({
      mixes: [mix("a", "Estimate follow-up"), mix("b", "Aftercare check-in"), mix("c", "Referral thanks"), mix("d", "Seasonal tune-up")],
      starts: [{ assignmentId: "start-a", mixId: "a" }],
      tags: [{ mixId: "a", tag: "Customers" }, { mixId: "b", tag: "Customers" }, { mixId: "b", tag: "Leads" }],
      pending: [{ mixId: "a", at: new Date("2026-10-14T14:00:00Z") }, { mixId: "a", at: new Date("2026-10-12T14:00:00Z") }],
      stops: [{ mixId: "c", planLimit: false, stageExit: false }],
      work: [{ id: "work-1", paused: false, runs: [{ mixId: "d", viaConnection: true }] }]
    }));
    expect(rows.map(row => row.mixId)).toEqual(["a", "b", "d", "c"]);
    expect(rows[0]).toMatchObject({ assignmentId: "start-a", tags: ["Customers"], nextBeatAt: new Date("2026-10-12T14:00:00Z") });
    expect(rows[1]).toMatchObject({ assignmentId: null, tags: ["Customers", "Leads"] });
    expect(rows[2]).toMatchObject({ workIds: ["work-1"], workPaused: false, workViaConnection: true });
    expect(rows[3]).toMatchObject({ stop: "stopped" });
  });

  it("leaves out archived Mixes and Mixes it doesn't know, such as one-time follow-ups", () => {
    const rows = buildContactMixRows(input({ mixes: [mix("a", "Old Mix", "ARCHIVED")], starts: [{ assignmentId: "start-a", mixId: "a" }], pending: [{ mixId: "one-time", at: now }] }));
    expect(rows).toEqual([]);
  });

  it("orders work to come soonest first, then preparing, then nothing to come, then stopped, each by name", () => {
    const rows = buildContactMixRows(input({
      mixes: [mix("z", "Zebra"), mix("y", "Yak"), mix("x", "Xerus"), mix("w", "Walrus"), mix("v", "Vole")],
      starts: ["z", "y", "x", "w", "v"].map(mixId => ({ assignmentId: `start-${mixId}`, mixId })),
      pending: [{ mixId: "z", at: new Date("2026-10-20T00:00:00Z") }, { mixId: "y", at: new Date("2026-10-13T00:00:00Z") }],
      preparing: { mixIds: ["x"], all: false },
      stops: [{ mixId: "v", planLimit: true, stageExit: false }]
    }));
    expect(rows.map(row => row.name)).toEqual(["Yak", "Zebra", "Xerus", "Walrus", "Vole"]);
  });

  it("never calls a stopped Mix preparing, even when the account prepares everything", () => {
    const [row] = buildContactMixRows(input({ mixes: [mix("a", "Estimate follow-up")], stops: [{ mixId: "a", planLimit: false, stageExit: false }], preparing: { mixIds: [], all: true } }));
    expect(row.preparing).toBe(false);
    expect(contactMixRowStatus(row, now, preferences)).toEqual({ label: "Stopped", tone: "stopped" });
  });

  it("says where the Mix stands, the person's stop and the Mix's own state first", () => {
    const [base] = buildContactMixRows(input({ mixes: [mix("a", "Estimate follow-up")], starts: [{ assignmentId: "s", mixId: "a" }] }));
    const status = (patch: Partial<typeof base>) => contactMixRowStatus({ ...base, ...patch }, now, preferences);
    expect(status({ stop: "plan-limit" })).toEqual({ label: "Not started: plan limit", tone: "stopped" });
    expect(status({ stop: "stopped", mixStatus: "PAUSED" }).label).toBe("Stopped");
    expect(status({ stop: "stage-exit" })).toEqual({ label: "Ended at a stage change", tone: "stopped" });
    expect(status({ mixStatus: "DRAFT", nextBeatAt: now })).toEqual({ label: "Draft", tone: "paused" });
    expect(status({ mixStatus: "PAUSED", nextBeatAt: now })).toEqual({ label: "Mix paused", tone: "paused" });
    expect(status({ workPaused: true, nextBeatAt: now })).toEqual({ label: "Journey work paused", tone: "paused" });
    expect(status({ nextBeatAt: new Date("2026-10-09T14:00:00Z") })).toEqual({ label: "Next Beat · 2 days late", tone: "late" });
    expect(status({ nextBeatAt: new Date("2026-10-12T14:00:00Z") })).toEqual({ label: "Next Beat · Tomorrow, 10:00 AM", tone: "running" });
    expect(status({ nextBeatAt: new Date("2026-10-20T14:00:00Z") })).toEqual({ label: "Next Beat · Oct 20", tone: "running" });
    expect(status({ preparing: true })).toEqual({ label: "Getting follow-ups ready", tone: "running" });
    expect(status({})).toEqual({ label: "No follow-ups to come", tone: "idle" });
  });

  it("names the route only when it isn't the owner's own start", () => {
    const [base] = buildContactMixRows(input({ mixes: [mix("a", "Estimate follow-up")], starts: [{ assignmentId: "s", mixId: "a" }] }));
    expect(contactMixRowRoute({ ...base, tags: ["Customers"] })).toBeNull();
    expect(contactMixRowRoute({ ...base, assignmentId: null, tags: ["Customers"] })).toBe("Through the tag Customers");
    expect(contactMixRowRoute({ ...base, assignmentId: null, tags: ["Customers", "Leads"] })).toBe("Through the tags Customers, Leads");
    // Work the owner started from the Journey page has no transition behind it (TRU-01).
    expect(contactMixRowRoute({ ...base, assignmentId: null, workIds: ["w"] })).toBe("Started in Journey");
    expect(contactMixRowRoute({ ...base, assignmentId: null, workIds: ["w"], workViaConnection: true })).toBe("Started by a Journey connection");
    expect(contactMixRowRoute({ ...base, assignmentId: null })).toBeNull();
  });

  it("sums up the row in one sentence for its menu", () => {
    const [base] = buildContactMixRows(input({ mixes: [mix("a", "Estimate follow-up")], starts: [{ assignmentId: "s", mixId: "a" }] }));
    const summary = (patch: Partial<typeof base>) => contactMixRowSummary({ ...base, ...patch }, "Marcus Reed", now, preferences);
    expect(summary({ stop: "stopped" })).toBe("Stopped for Marcus Reed. Resuming prepares their follow-ups from it again.");
    // Resume only lifts the stop, so what it promises depends on what still places them and on the Mix (TRU-01).
    expect(summary({ stop: "stopped", mixStatus: "PAUSED" })).toBe("Stopped for Marcus Reed. Resuming lets it prepare their follow-ups once the Mix is on.");
    expect(summary({ stop: "stopped", mixStatus: "DRAFT" })).toBe("Stopped for Marcus Reed. Resuming lets it prepare their follow-ups once the Mix is on.");
    expect(summary({ stop: "stopped", assignmentId: null })).toBe("Stopped for Marcus Reed. Resuming only lifts the stop: add them to the Mix to restart it.");
    expect(summary({ stop: "stopped", assignmentId: null, tags: ["Customers"] })).toBe("Stopped for Marcus Reed. Resuming prepares their follow-ups from it again through the tag.");
    expect(summary({ stop: "stage-exit", assignmentId: null })).toBe("Ended when Marcus Reed’s stage changed. It starts again if they return to that stage. Resuming only lifts the stop: add them to the Mix to restart it.");
    expect(summary({ stop: "plan-limit" })).toBe("Not started for Marcus Reed: your plan’s people limit was reached.");
    expect(summary({ mixStatus: "PAUSED" })).toBe("This Mix is paused for everyone, so Marcus Reed’s follow-ups from it wait until it’s turned back on.");
    expect(summary({ nextBeatAt: new Date("2026-10-09T14:00:00Z") })).toBe("Next Beat was due Oct 9, 10:00 AM.");
    expect(summary({ nextBeatAt: new Date("2026-10-12T14:00:00Z") })).toBe("Next Beat is due Oct 12, 10:00 AM.");
    expect(summary({})).toBe("No follow-ups to come for Marcus Reed from this Mix.");
  });

  it("keeps a stage change's stop apart from the owner's, and the plan limit's apart from both", () => {
    const rows = buildContactMixRows(input({ mixes: [mix("a", "Lead nurture"), mix("b", "Quote check-in"), mix("c", "Welcome")], stops: [{ mixId: "a", planLimit: false, stageExit: true }, { mixId: "b", planLimit: false, stageExit: false }, { mixId: "c", planLimit: true, stageExit: false }] }));
    expect(Object.fromEntries(rows.map(row => [row.name, row.stop]))).toEqual({ "Lead nurture": "stage-exit", "Quote check-in": "stopped", Welcome: "plan-limit" });
  });
});
