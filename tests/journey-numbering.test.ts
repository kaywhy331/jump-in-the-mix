import { describe, expect, it } from "vitest";
import { beatNumberRange, compareBeatNumbers, numberJourneyBeats } from "@/lib/journey-numbering";
import { MEGA_MIXES, megaMixConfiguration } from "@/lib/mega-mixes";
import type { WorkflowRoute, WorkflowRule, WorkflowTarget } from "@/lib/mix-workflow-types";

const mix = (id: string, beats: number, extra: Partial<{ status: string; source: string }> = {}) => ({ id, status: "ACTIVE", source: "USER", ...extra, steps: Array.from({ length: beats }, (_, index) => ({ id: `${id}${index + 1}` })) });
const route = (target: WorkflowTarget | null, extra: Partial<WorkflowRoute> = {}): WorkflowRoute => ({ id: `r-${target?.stepId ?? target?.mixId ?? "end"}-${Math.random()}`, label: "Next", when: "OUTCOME", outcome: "yes", delayMinutes: 0, target, maxVisits: null, replace: false, ...extra });
const rule = (source: WorkflowTarget, routes: WorkflowRoute[], extra: Partial<WorkflowRule> = {}): WorkflowRule => ({ id: `rule-${source.mixId}-${source.stepId ?? ""}-${routes.length}`, name: "Next", enabled: true, mode: "CHOICE", source, routes, join: null, ...extra });
const to = (mixId: string, stepId: string | null = null) => ({ mixId, stepId });
const number = (mixes: ReturnType<typeof mix>[], rules: WorkflowRule[], gatedStepIds: string[] = []) => numberJourneyBeats(mixes, { rules, gatedStepIds });

describe("journey Beat numbering", () => {
  it("numbers a straight path consecutively across Mixes", () => {
    expect(number([mix("a", 2), mix("b", 2)], [rule(to("a"), [route(to("b"))])])).toEqual({ a1: "1", a2: "2", b1: "3", b2: "4" });
  });

  it("letters each way a path splits and keeps letters for the rest of that branch", () => {
    const result = number([mix("a", 3), mix("yes", 2), mix("no", 1)], [rule(to("a"), [route(to("yes")), route(to("no")), route(null)])]);
    expect(result).toEqual({ a1: "1", a2: "2", a3: "3", yes1: "4a", yes2: "5a", no1: "4b" });
  });

  it("appends letters when a branch splits again", () => {
    const result = number([mix("a", 3), mix("yes", 2), mix("no", 1), mix("x", 1), mix("y", 1)], [
      rule(to("a"), [route(to("yes")), route(to("no"))]),
      rule(to("yes"), [route(to("x")), route(to("y"))])
    ]);
    expect(result).toMatchObject({ yes1: "4a", yes2: "5a", x1: "6aa", y1: "6ab", no1: "4b" });
  });

  it("keeps the first number when a return path loops back", () => {
    const result = number([mix("a", 2), mix("b", 1)], [
      rule(to("a"), [route(to("b"))]),
      rule(to("b"), [route(to("a"), { maxVisits: 3 })])
    ]);
    expect(result).toEqual({ a1: "1", a2: "2", b1: "3" });
  });

  it("does not letter a split whose other side is already numbered", () => {
    const result = number([mix("a", 1), mix("b", 1), mix("c", 1)], [
      rule(to("a"), [route(to("b")), route(to("c"))]),
      rule(to("b"), [route(to("c")), route(to("a"), { maxVisits: 2 })])
    ]);
    expect(result).toEqual({ a1: "1", b1: "2a", c1: "2b" });
  });

  it("gives a Beat reached by two paths its earliest position", () => {
    const result = number([mix("a", 1), mix("long", 3), mix("end", 1)], [
      rule(to("a"), [route(to("long")), route(to("end"))]),
      rule(to("long"), [route(to("end"))])
    ]);
    expect(result.end1).toBe("2b");
  });

  it("continues without letters after a join", () => {
    const result = number([mix("a", 1), mix("x", 2), mix("y", 1), mix("done", 1)], [
      rule(to("a"), [route(to("x")), route(to("y"))], { mode: "PARALLEL", join: { mode: "ALL", target: to("done"), cancelRemaining: false } })
    ]);
    expect(result).toEqual({ a1: "1", x1: "2a", x2: "3a", y1: "2b", done1: "4" });
  });

  it("treats the rest of a Mix as branch a when a middle Beat leads elsewhere", () => {
    const result = number([mix("a", 3), mix("side", 1), mix("after", 1)], [
      rule(to("a", "a1"), [route(to("side"))]),
      rule(to("a"), [route(to("after"))])
    ]);
    expect(result).toEqual({ a1: "1", a2: "2a", a3: "3a", side1: "2b", after1: "4a" });
  });

  it("numbers a Beat that waits for a connection where the connection reaches it", () => {
    const result = number([mix("a", 2), mix("b", 3)], [rule(to("a"), [route(to("b", "b3"))])], ["b3"]);
    expect(result).toEqual({ a1: "1", a2: "2", b3: "3", b1: "B1", b2: "B2" });
  });

  it("numbers separate entry points as their own tracks and skips archived or one-time Mixes", () => {
    const result = number([mix("a", 1), mix("b", 2), mix("old", 1, { status: "ARCHIVED" }), mix("once", 1, { source: "ONE_TIME" })], []);
    expect(result).toEqual({ a1: "1", b1: "B1", b2: "B2" });
  });

  it("numbers every Beat of each supplied mega-mix uniquely and from one entry", () => {
    for (const blueprint of MEGA_MIXES) {
      const mixIds = Object.fromEntries(blueprint.nodes.map(node => [node.key, node.key]));
      const configuration = megaMixConfiguration(blueprint, mixIds, blueprint.id);
      const mixes = blueprint.nodes.map(node => ({ id: node.key, status: "ACTIVE", source: "MEGA_MIX", steps: node.steps.map((_, index) => ({ id: `${node.key}:${index}` })) }));
      const result = numberJourneyBeats(mixes, configuration);
      const values = Object.values(result);
      expect(values).toHaveLength(mixes.reduce((sum, item) => sum + item.steps.length, 0));
      expect(new Set(values).size).toBe(values.length);
      expect(result[`${blueprint.roots[0]}:0`]).toBe("1");
      for (const value of values) expect(value).toMatch(/^[A-Z]*\d+[a-z]*$/);
    }
  });

  it("sorts numbers naturally and summarizes consecutive runs", () => {
    expect(["10", "4b", "2", "4a"].sort(compareBeatNumbers)).toEqual(["2", "4a", "4b", "10"]);
    expect(beatNumberRange(["x", "y", "z"], { x: "3b", y: "4b", z: "5b" })).toBe("3b–5b");
    expect(beatNumberRange(["x", "y", "z"], { x: "1", y: "2a", z: "3a" })).toBe("1, 2a, 3a");
    expect(beatNumberRange(["x", "y"], { x: "11ba", y: "12ba" })).toBe("11ba–12ba");
  });
});
