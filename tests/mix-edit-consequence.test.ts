import { describe, expect, it } from "vitest";
import { classifyMixEdit, mixEditConsequenceText, type MixEditState } from "../src/lib/mix-edit-consequence";

const active: MixEditState = { status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: "birthday", everyone: false, groupIds: ["clients"] };
const classify = (next: Partial<MixEditState>, saved: MixEditState | null = active) => classifyMixEdit(saved, { ...active, ...next });

describe("Mix save consequences", () => {
  it("distinguishes wording-only edits from future-start configuration without starting anyone", () => {
    const wording = classifyMixEdit(active, active, { changedFields: ["inlineBody-0", "variantEmailSubject-0", "variantEmailBody-0"] });
    expect(wording.kinds).toEqual(["wording-only"]);
    expect(wording.startsPeople).toBe(false);
    expect(mixEditConsequenceText(wording, active)).toContain("People already in this Mix keep their saved Beats.");
    for (const field of ["dayOffset", "anchor", "offsetMinutes", "sendTimeMinutes", "plannedAt", "mixStepId", "inlineChannel-0", "completionSourceId", "broadcastTime", "stageId"]) {
      const edit = classifyMixEdit(active, active, { changedFields: ["inlineBody-0", field] });
      expect(edit.kinds).toEqual(["future-starts"]);
      expect(edit.startsPeople).toBe(false);
    }
    expect(classify({}).kinds).toEqual(["future-starts"]);
  });

  it.each([null, { ...active, status: "DRAFT" as const }])("classifies activation for a new or draft Mix", saved => {
    const result = classify({}, saved);
    expect(result.kinds).toEqual(["activation"]);
    expect(result.starts).toEqual({ all: false, groupIds: ["clients"] });
    expect(result.startsPeople).toBe(true);
    expect(mixEditConsequenceText(result, active)).toContain("selected audience");
  });

  it("allows a manual activation without promising anyone starts", () => {
    const next = { ...active, triggerMode: "MANUAL_START" as const, groupIds: [] };
    const result = classifyMixEdit(null, next);
    expect(result.turningOn).toBe(true);
    expect(result.starts).toBeNull();
    expect(mixEditConsequenceText(result, next)).toContain("You can then start it for a person");
  });

  it("resumes without an audience and starts selected tags added while paused only once", () => {
    const paused = { ...active, status: "PAUSED" as const };
    expect(classifyMixEdit({ ...paused, groupIds: [] }, { ...active, groupIds: [] }).kinds).toEqual(["resume"]);
    const result = classifyMixEdit(paused, { ...active, groupIds: ["clients", "new"] }, { resumeGroupIds: ["clients", "removed", "new"] });
    expect(result.kinds).toEqual(["resume", "audience-widening"]);
    expect(result.starts?.groupIds).toEqual(["new", "clients"]);
    expect(result.pausedGroupIds).toEqual(["clients", "new"]);
    expect(classifyMixEdit(active, active, { resumeGroupIds: ["clients"] }).widens).toBe(false);
  });

  it("distinguishes widening from unchanged, reordered or narrowed audiences", () => {
    expect(classify({ everyone: true }).kinds).toEqual(["audience-widening"]);
    expect(classify({ groupIds: ["clients", "leads"] }).kinds).toEqual(["audience-widening"]);
    expect(classify({ groupIds: [] }).widens).toBe(false);
    expect(classify({ groupIds: ["leads", "clients"] }, { ...active, groupIds: ["clients", "leads"] }).widens).toBe(false);
    const everyone = { ...active, everyone: true };
    const resume = classifyMixEdit({ ...everyone, status: "PAUSED" }, everyone);
    expect(resume.widens).toBe(false);
    expect(resume.starts).toEqual({ all: false, groupIds: [], resume: true });
  });

  it("reschedules only an on or resuming Mix with an audience and changed start rule", () => {
    expect(classify({ triggerMode: "MANUAL_START" }).retriggers).toBe(true);
    expect(classify({ dateTypeId: "renewal" }).retriggers).toBe(true);
    expect(classify({ dateTypeId: "renewal", groupIds: [] }).retriggers).toBe(false);
    expect(classify({ triggerMode: "AFTER_MIX" }).retriggers).toBe(false);
    const manual = { ...active, triggerMode: "MANUAL_START" as const };
    expect(classifyMixEdit(manual, { ...manual, dateTypeId: "ignored" }).retriggers).toBe(false);
    const next = { ...active, triggerMode: "MANUAL_START" as const, everyone: true };
    const result = classifyMixEdit({ ...active, status: "PAUSED" }, next);
    expect(result.kinds).toEqual(["resume", "audience-widening", "trigger-reschedule"]);
    expect(mixEditConsequenceText(result, next)).toContain("resumes");
    expect(mixEditConsequenceText(result, next)).toContain("added audience");
    expect(mixEditConsequenceText(result, next)).toContain("reschedules");
  });

  it.each(["DRAFT", "PAUSED"] as const)("does not claim starts when saving %s", status => {
    const next = { ...active, status, everyone: true, dateTypeId: "renewal" };
    const result = classifyMixEdit(active, next);
    expect(result.startsPeople).toBe(false);
    expect(result.starts).toBeNull();
    expect(result.retriggers).toBe(false);
    expect(mixEditConsequenceText(result, next)).toContain(status === "DRAFT" ? "won’t start anyone" : "paused");
  });
});
