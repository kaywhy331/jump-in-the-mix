import { describe, expect, it } from "vitest";
import { MEGA_MIXES } from "@/lib/mega-mixes";
import { initialJourneySetup, parseJourneySetup, tailorMegaMix, validateJourneySetup } from "@/lib/journey-preferences";
import { nextJourneyAvailability } from "@/lib/journey-availability";
import { connectionBoxesOverlap, connectionDirection, layoutWorkflowConnections } from "@/lib/workflow-connection-layout";

const setup = initialJourneySetup(null, "UTC");
const rule = { ...setup, journeyPreferences: setup.preferences };
const at = (time: string) => new Date(time);
describe("journey preferences", () => {
  it("tailors the same preview data without mutating the supplied blueprints", () => {
    const original = JSON.stringify(MEGA_MIXES);
    for (const blueprint of MEGA_MIXES) {
      const tailored = tailorMegaMix(blueprint, { ...setup, defaultFollowUpMinutes: 630, preferences: { ...setup.preferences, communication: "EMAIL", pace: "RELAXED" } });
      tailored.nodes.forEach((node, i) => node.steps.forEach((step, j) => {
        expect(step.channel).toBe(blueprint.nodes[i].steps[j].channel === "PHONE_CALL" ? "PHONE_CALL" : "EMAIL");
        expect(step.dayOffset).toBe(blueprint.nodes[i].steps[j].dayOffset * 2);
        expect(step.sendTimeMinutes).toBe(630);
      }));
      expect(tailored.nodes.flatMap(node => node.paths).some(path => path.label.includes("six months"))).toBe(false);
    }
    expect(JSON.stringify(MEGA_MIXES)).toBe(original);
  });
  it("rejects unusable windows and malformed times instead of saving an impossible schedule", () => {
    expect(validateJourneySetup({ ...setup, preferences: { ...setup.preferences, workDays: [] } })).toMatch(/working day/);
    expect(validateJourneySetup({ ...setup, quietHoursStart: 480, quietHoursEnd: 1080 })).toMatch(/cover all/);
    const data = new FormData();
    for (const [name, value] of Object.entries({ communication: "SMS", pace: "RECOMMENDED", workDay: "1", workStart: "09:99", workEnd: "17:00", timezone: "UTC", defaultFollowUpTime: "10:00", quietHoursStart: "20:00", quietHoursEnd: "08:00", appointmentBufferMinutes: "15" })) data.set(name, value);
    expect(() => parseJourneySetup(data)).toThrow();
  });
  it("reuses saved communication, hours, timezone and quiet times", () => {
    const saved = { ...rule, defaultFollowUpMinutes: 660, quietHoursStart: 1140, weekendScheduling: "KEEP", journeyPreferences: { ...setup.preferences, reviewedAt: "2026-09-22", communication: "SMS" } };
    expect(initialJourneySetup(saved, "America/Chicago")).toMatchObject({ timezone: "America/Chicago", defaultFollowUpMinutes: 660, quietHoursStart: 1140, preferences: { communication: "SMS", reviewedAt: "2026-09-22", workDays: [1,2,3,4,5] } });
  });
});
describe("working-day availability", () => {
  it("keeps existing accounts unchanged until preferences are reviewed", () => {
    const now = at("2026-09-20T23:15:00Z"); expect(nextJourneyAvailability(now, "UTC", { ...rule, journeyPreferences: null })).toBe(now);
  });
  it("moves evening and weekend work forward without moving it into the past", () => {
    expect(nextJourneyAvailability(at("2026-09-18T23:15:00Z"), "UTC", rule).toISOString()).toBe("2026-09-21T09:00:00.000Z");
    const noonQuiet = { ...rule, quietHoursStart: 720, quietHoursEnd: 780 };
    expect(nextJourneyAvailability(at("2026-09-21T12:30:00Z"), "UTC", noonQuiet).toISOString()).toBe("2026-09-21T13:00:00.000Z");
  });
  it("honors appointment buffers, successive appointments and unpadded blocks", () => {
    const busy = [{ startsAt: at("2026-09-21T10:00Z"), endsAt: at("2026-09-21T11:00Z"), kind: "MEETING" }, { startsAt: at("2026-09-21T11:15Z"), endsAt: at("2026-09-21T12:00Z"), kind: "MEETING" }];
    expect(nextJourneyAvailability(at("2026-09-21T09:45Z"), "UTC", rule, busy).toISOString()).toBe("2026-09-21T12:15:00.000Z");
    expect(nextJourneyAvailability(at("2026-09-21T10:00Z"), "UTC", rule, [{ ...busy[0], kind: "BLOCK" }]).toISOString()).toBe("2026-09-21T11:00:00.000Z");
    expect(nextJourneyAvailability(at("2026-09-21T10:00Z"), "UTC", { ...rule, journeyPreferences: { ...setup.preferences, avoidAppointments: false } }, busy).toISOString()).toBe("2026-09-21T10:00:00.000Z");
  });
  it("never returns a nonexistent opening hour during the spring clock change", () => {
    const special = { ...rule, quietHoursStart: 0, quietHoursEnd: 0, journeyPreferences: { ...setup.preferences, workDays: [0], workStart: 150, workEnd: 240 } };
    expect(nextJourneyAvailability(at("2026-03-08T06:00:00Z"), "America/New_York", special).toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });
  it("preserves local opening time across a daylight-saving weekend", () => {
    expect(nextJourneyAvailability(at("2026-03-06T23:30:00Z"), "America/New_York", rule).toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });
});
describe("connection readability", () => {
  it("places dense forward, return and self-loop labels outside nodes and each other", () => {
    const nodes = [{ id: "a", x: 60, y: 35, width: 280, height: 300 }, { id: "b", x: 450, y: 35, width: 280, height: 300 }];
    const paths = Array.from({ length: 24 }, (_, i) => ({ id: String(i), source: i < 8 ? "a" : "b", destination: i < 16 ? "b" : "a", sourceStep: null, destinationStep: null, label: "A long decision label explaining what happens next", result: "100/100 started" }));
    const layout = layoutWorkflowConnections(nodes, paths, {}, 400, true);
    layout.edges.forEach((edge, index) => {
      expect(nodes.some(node => connectionBoxesOverlap(edge.label, node))).toBe(false);
      expect(layout.edges.slice(0, index).some(other => connectionBoxesOverlap(edge.label, other.label))).toBe(false);
      expect(edge.label.y + edge.label.height).toBeLessThan(layout.height);
      expect(edge.lines.length).toBeGreaterThan(1);
    });
    expect(connectionDirection(paths[0], "a")).toBe("outgoing");
    expect(connectionDirection(paths[16], "a")).toBe("incoming");
    expect(connectionDirection(paths[8], "b")).toBe("return");
  });
});
