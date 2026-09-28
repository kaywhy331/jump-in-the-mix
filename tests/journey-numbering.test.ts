import { describe, expect, it } from "vitest";
import { compareJourneyNumbers, journeyTargetNumber, numberJourney } from "@/lib/journey-numbering";
import { MEGA_MIXES, megaMixConfiguration } from "@/lib/mega-mixes";
import type { WorkflowRoute, WorkflowRule, WorkflowTarget } from "@/lib/mix-workflow-types";

const mix = (id: string, beats: number, extra: Partial<{ status: string; source: string; createdAt: string }> = {}) => ({ id, status: "ACTIVE", source: "USER", ...extra, steps: Array.from({ length: beats }, (_, index) => ({ id: `${id}${index + 1}` })) });
const route = (target: WorkflowTarget | null, extra: Partial<WorkflowRoute> = {}): WorkflowRoute => ({ id: `r-${target?.stepId ?? target?.mixId ?? "end"}-${Math.random()}`, label: "Next", when: "OUTCOME", outcome: "yes", delayMinutes: 0, target, maxVisits: null, replace: false, ...extra });
const rule = (source: WorkflowTarget, routes: WorkflowRoute[], extra: Partial<WorkflowRule> = {}): WorkflowRule => ({ id: `rule-${source.mixId}-${source.stepId ?? ""}-${routes.length}`, name: "Next", enabled: true, mode: "CHOICE", source, routes, join: null, ...extra });
const to = (mixId: string, stepId: string | null = null) => ({ mixId, stepId });
const number = (mixes: ReturnType<typeof mix>[], rules: WorkflowRule[]) => numberJourney(mixes, { rules });

describe("journey numbering", () => {
  it("numbers Mixes A1, A2 along a path and letters each Mix's Beats", () => {
    expect(number([mix("m1", 3), mix("m2", 3)], [rule(to("m1"), [route(to("m2"))])])).toEqual({
      mixes: { m1: "A1", m2: "A2" },
      beats: { m11: "A1.a", m12: "A1.b", m13: "A1.c", m21: "A2.a", m22: "A2.b", m23: "A2.c" }
    });
  });

  it("numbers every Mix a split reaches in turn, never by Beat position", () => {
    const result = number([mix("a", 3), mix("yes", 2), mix("no", 1), mix("x", 1)], [
      rule(to("a"), [route(to("yes")), route(to("no")), route(null)]),
      rule(to("yes"), [route(to("x"))])
    ]);
    expect(result.mixes).toEqual({ a: "A1", yes: "A2", no: "A3", x: "A4" });
    expect(result.beats).toMatchObject({ yes2: "A2.b", no1: "A3.a", x1: "A4.a" });
  });

  it("gives each starting point its own letter, by when its Mix was created", () => {
    const result = number([mix("later", 1, { createdAt: "2026-09-02T00:00:00Z" }), mix("first", 1, { createdAt: "2026-09-01T00:00:00Z" }), mix("next", 1)], [rule(to("first"), [route(to("next"))])]);
    expect(result.mixes).toEqual({ first: "A1", next: "A2", later: "B1" });
  });

  it("keeps a handed-off Mix in the journey created first", () => {
    const mixes = [mix("b", 1, { createdAt: "2026-09-02T00:00:00Z" }), mix("b2", 1, { createdAt: "2026-09-02T00:00:00Z" }), mix("a", 1, { createdAt: "2026-09-01T00:00:00Z" }), mix("a2", 1, { createdAt: "2026-09-01T00:00:00Z" }), mix("shared", 2, { createdAt: "2026-09-03T00:00:00Z" })];
    const result = number(mixes, [
      rule(to("b"), [route(to("b2"))]),
      rule(to("b2"), [route(to("shared"))]),
      rule(to("a"), [route(to("a2"))]),
      rule(to("a2"), [route(to("shared"))])
    ]);
    expect(result.mixes).toEqual({ a: "A1", a2: "A2", shared: "A3", b: "B1", b2: "B2" });
    expect(result.beats.shared2).toBe("A3.b");
  });

  it("follows paths from earlier Beats before paths after the whole Mix", () => {
    const result = number([mix("a", 3), mix("after", 1), mix("side", 1)], [
      rule(to("a"), [route(to("after"))]),
      rule(to("a", "a1"), [route(to("side"))])
    ]);
    expect(result.mixes).toEqual({ a: "A1", side: "A2", after: "A3" });
  });

  it("numbers a join after the paths it brings together", () => {
    const result = number([mix("a", 1), mix("x", 2), mix("y", 1), mix("done", 1)], [
      rule(to("a"), [route(to("x")), route(to("y"))], { mode: "PARALLEL", join: { mode: "ALL", target: to("done"), cancelRemaining: false } })
    ]);
    expect(result.mixes).toEqual({ a: "A1", x: "A2", y: "A3", done: "A4" });
  });

  it("keeps the first numbers when a return path loops back", () => {
    const result = number([mix("a", 2), mix("b", 1)], [rule(to("a"), [route(to("b"))]), rule(to("b"), [route(to("a"), { maxVisits: 3 })])]);
    expect(result.mixes).toEqual({ a: "A1", b: "A2" });
  });

  it("numbers a Mix reached through one of its Beats like any other Mix", () => {
    const result = number([mix("a", 2), mix("b", 3)], [rule(to("a"), [route(to("b", "b3"))])]);
    expect(result.mixes).toEqual({ a: "A1", b: "A2" });
    expect(result.beats.b3).toBe("A2.c");
    expect(journeyTargetNumber(to("b", "b3"), result)).toBe("A2.c");
    expect(journeyTargetNumber(to("b"), result)).toBe("A2");
  });

  it("numbers a cycle with no way in, and skips archived or one-time Mixes", () => {
    const result = number([mix("x", 1), mix("y", 1), mix("old", 1, { status: "ARCHIVED" }), mix("once", 1, { source: "ONE_TIME" })], [rule(to("x"), [route(to("y"))]), rule(to("y"), [route(to("x"))])]);
    expect(result).toEqual({ mixes: { x: "A1", y: "A2" }, beats: { x1: "A1.a", y1: "A2.a" } });
  });

  it("continues letters past z for long Mixes", () => {
    expect(number([mix("a", 28)], []).beats).toMatchObject({ a26: "A1.z", a27: "A1.aa", a28: "A1.ab" });
  });

  it("numbers every Mix and Beat of each supplied mega-mix uniquely, from A1", () => {
    for (const blueprint of MEGA_MIXES) {
      const mixIds = Object.fromEntries(blueprint.nodes.map(node => [node.key, node.key]));
      const configuration = megaMixConfiguration(blueprint, mixIds, blueprint.id);
      const mixes = blueprint.nodes.map(node => ({ id: node.key, status: "ACTIVE", source: "MEGA_MIX", steps: node.steps.map((_, index) => ({ id: `${node.key}:${index}` })) }));
      const result = numberJourney(mixes, configuration);
      expect(Object.keys(result.mixes)).toHaveLength(mixes.length);
      expect(new Set(Object.values(result.mixes)).size).toBe(mixes.length);
      expect(Object.keys(result.beats)).toHaveLength(mixes.reduce((sum, item) => sum + item.steps.length, 0));
      expect(result.mixes[blueprint.roots[0]]).toBe("A1");
      for (const value of Object.values(result.mixes)) expect(value).toMatch(/^[A-Z]+\d+$/);
      for (const value of Object.values(result.beats)) expect(value).toMatch(/^[A-Z]+\d+\.[a-z]+$/);
    }
  });

  it("sorts numbers naturally", () => {
    expect(["A10", "B1", "A2.b", "A2", "A2.a"].sort(compareJourneyNumbers)).toEqual(["A2", "A2.a", "A2.b", "A10", "B1"]);
  });
});
