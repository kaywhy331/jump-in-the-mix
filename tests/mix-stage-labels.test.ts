import { describe, expect, it } from "vitest";
import { MEGA_MIXES, megaMixStageOf } from "@/lib/mega-mixes";
import { tailorMegaMix, initialJourneySetup } from "@/lib/journey-preferences";
import { MAX_CONTACT_STAGES, newStageLabels } from "@/lib/mix-stage-labels";
import { stageSetFrom, mixStageSummary } from "@/lib/mix-stage";

describe("Mega-Mix stage labels (JITM-09 §2.79, P8)", () => {
  it.each(MEGA_MIXES)("$name names each label once, links only its own Mixes, and fits in Contact stages", blueprint => {
    const names = blueprint.stages.map(stage => stage.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(MAX_CONTACT_STAGES);
    expect(new Set(names.map(name => name.toLowerCase())).size).toBe(names.length);
    for (const name of names) expect(name.length).toBeGreaterThan(0), expect(name.length).toBeLessThanOrEqual(60);
    const linked = blueprint.stages.flatMap(stage => stage.nodes);
    expect(new Set(linked).size).toBe(linked.length);
    for (const key of linked) expect(blueprint.nodes.some(node => node.key === key)).toBe(true);
    // Every root sets a stage, so a person started where the Mega-Mix begins has one.
    for (const root of blueprint.roots) expect(megaMixStageOf(blueprint, root)).not.toBeNull();
    // A concern, a quiet conversation or an agreed later time leaves the person's stage as it was.
    for (const node of blueprint.nodes.filter(item => ["concern", "quiet", "later", "candidate-later", "client-later"].includes(item.key))) expect(megaMixStageOf(blueprint, node.key)).toBeNull();
    // Stage and milestone wording never assumes a sale (JITM-09 §2.80).
    expect(names.some(name => /\bsale\b/i.test(name))).toBe(false);
  });

  it("keeps its labels through the owner's tailoring", () => {
    const setup = initialJourneySetup(null, "UTC");
    setup.preferences.pace = "RELAXED";
    for (const blueprint of MEGA_MIXES) expect(tailorMegaMix(blueprint, setup).stages).toEqual(blueprint.stages);
  });

  it("counts only the labels a business doesn't have, whatever their case", () => {
    expect(newStageLabels(["Lead", "past client"], ["New lead", "Lead", "Past client"])).toEqual(["New lead"]);
    expect(newStageLabels([], ["A", "B"])).toEqual(["A", "B"]);
  });

  it("words the activity line and reads a recorded change back", () => {
    expect(mixStageSummary("Lead", "Estimate", "Estimate follow-up")).toBe("Lead → Estimate, set by the Estimate follow-up Mix.");
    expect(mixStageSummary(null, "Inquiry", "New inquiry")).toBe("Joined Inquiry, set by the New inquiry Mix.");
    const set = { contactId: "c", mixId: "m", stageId: "s", eventKey: "mix-stage:x", version: 2, previous: { stageId: "p", stageSince: "2026-10-01T00:00:00.000Z", managedAssignmentId: null } };
    expect(stageSetFrom(JSON.parse(JSON.stringify(set)))).toEqual(set);
    expect(stageSetFrom({ ...set, previous: null })).toEqual({ ...set, previous: null });
    expect(stageSetFrom({ ...set, version: "2" })).toBeNull();
    expect(stageSetFrom({ ...set, previous: { stageId: "p" } })).toBeNull();
    expect(stageSetFrom(null)).toBeNull();
  });
});
