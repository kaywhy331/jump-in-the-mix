import { describe, expect, it } from "vitest";
import { journeyMovePath, journeyTouchpointPositions, journeyVisibleTouchpoints } from "@/lib/journey-map-layout";

describe("Journey touchpoint visibility", () => {
  const mixes = Array.from({ length: 9 }, (_, i) => ({ id: `mix-${i}` }));
  const quiet = { id: "quiet-days", placement: "below" as const };

  it("keeps a selected Mix beyond the initial six alongside quiet-day check-ins", () => {
    const visible = journeyVisibleTouchpoints([...mixes, quiet], "mix-8");
    expect(visible).toHaveLength(6);
    expect(visible).toContain(mixes[8]);
    expect(visible).toContain(quiet);
    expect(journeyVisibleTouchpoints(mixes, "mix-8")).toContain(mixes[8]);
    expect(journeyVisibleTouchpoints([...mixes, quiet], "quiet-days")).toHaveLength(6);
    expect(journeyVisibleTouchpoints(mixes, "missing")).toEqual(mixes.slice(0, 6));
  });

  it("centers sparse rows and keeps multiple lower nodes distinct and inside the map", () => {
    expect(journeyTouchpointPositions([quiet], 760, 130)[0].x).toBe(380);
    const points = journeyTouchpointPositions([mixes[0], quiet, { id: "birthday", placement: "below" }], 760, 270);
    expect(points[0].x).toBe(380);
    expect(points[1].y).toBe(points[2].y);
    expect(points[2].x - points[1].x).toBeGreaterThan(150);
    const lower = journeyTouchpointPositions(Array.from({ length: 6 }, (_, i) => ({ id: `lower-${i}`, placement: "below" as const })), 1080, 130);
    expect(new Set(lower.map(point => point.x)).size).toBe(6);
    for (const point of lower) {
      expect(point.x - 75).toBeGreaterThanOrEqual(0);
      expect(point.x + 75).toBeLessThanOrEqual(1080);
    }
  });
});

describe("Journey movement directions", () => {
  const lead = { x: 100, y: 270, radius: 69, index: 0 };
  const prospect = { x: 287, y: 270, radius: 42, index: 1 };
  const client = { x: 473, y: 270, radius: 60, index: 2 };

  it("keeps a forward arrow outside both rings and their selection halos", () => {
    const move = journeyMovePath(lead, prospect);
    expect(move.direct).toBe(true);
    expect(move.start.x).toBeGreaterThan(lead.x + lead.radius + 8);
    expect(move.end.x).toBeLessThan(prospect.x - prospect.radius - 8);
    expect(move.start.x).toBeLessThan(move.end.x);
    expect(move.start.y).toBe(lead.y);
    expect(move.end.y).toBe(prospect.y);
  });

  it("takes skipped stages above intervening nodes and returns below them", () => {
    for (const [from, to, direction] of [[lead, client, -1], [client, lead, 1]] as const) {
      const move = journeyMovePath(from, to);
      expect(move.direct).toBe(false);
      expect(Math.hypot(move.end.x - to.x, move.end.y - to.y)).toBeCloseTo(to.radius + 12);
      expect(Math.hypot(move.start.x - from.x, move.start.y - from.y)).toBeCloseTo(from.radius + 12);
      expect((move.label.y + 12 - prospect.y) * direction).toBeGreaterThan(prospect.radius + 8);
      expect(move.label.y).toBeGreaterThan(0);
      expect(move.label.y).toBeLessThan(450);
    }
  });
});
