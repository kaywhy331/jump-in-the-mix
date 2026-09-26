import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { changeDurationUnit, durationAmount, durationEntry, durationMinutes, durationUnitFor, typeDuration, WorkflowRuleEditor, type DurationEntry } from "@/components/WorkflowRuleEditor";
import type { WorkflowGraphMix } from "@/lib/mix-workflow-view";
import type { WorkflowRule } from "@/lib/mix-workflow-types";

const DAYS = 1440, HOURS = 60, MINUTES = 1;
/** Replays what the field does: every keystroke's text, then leaving the field, with the minutes the parent holds. */
function typeInto(start: DurationEntry, texts: string[]) {
  let entry = start, saved = start.minutes;
  const shown: string[] = [];
  for (const text of texts) {
    const change = typeDuration(entry, text);
    entry = change.entry; if (change.commit !== null) saved = change.commit;
    shown.push(entry.text);
  }
  return { shown, saved, left: durationEntry(saved, entry.unit) };
}

describe("the Journey wait field", () => {
  it("states each wait in the largest unit that is exact", () => {
    expect([2880, 120, 90, 1, 0].map(durationUnitFor)).toEqual([DAYS, HOURS, MINUTES, MINUTES, DAYS]);
    expect(durationAmount(90, HOURS)).toBe("1.5");
    expect(durationAmount(720, DAYS)).toBe("0.5");
    expect(durationAmount(1, HOURS)).toBe("0.02");
    expect(durationAmount(1, DAYS)).toBeNull();
    expect(durationAmount(15, DAYS)).toBeNull();
  });

  it("reads typed amounts and ignores a blank or invalid entry", () => {
    expect(durationMinutes("1.5", HOURS)).toBe(90);
    expect(durationMinutes("0", DAYS)).toBe(0);
    expect(["", "  ", "abc", "-1"].map(text => durationMinutes(text, DAYS))).toEqual([null, null, null, null]);
  });

  it("clearing the field and typing a new number never shows 05", () => {
    const typed = typeInto(durationEntry(0), ["", "5"]);
    expect(typed.shown).toEqual(["", "5"]);
    expect(typed.saved).toBe(5 * DAYS);
    expect(typed.left).toEqual({ unit: DAYS, text: "5", minutes: 5 * DAYS });
    // Clearing commits nothing; leaving a blank field shows the saved wait again.
    const cleared = typeInto(durationEntry(90), [""]);
    expect(cleared.saved).toBe(90);
    expect(cleared.left.text).toBe("90");
  });

  it("shows 1 minute as 1 minute, or 0.02 hours, never as 0 days", () => {
    expect(durationEntry(1)).toEqual({ unit: MINUTES, text: "1", minutes: 1 });
    expect(durationEntry(1, HOURS)).toEqual({ unit: HOURS, text: "0.02", minutes: 1 });
    expect(durationEntry(1, DAYS)).toEqual({ unit: MINUTES, text: "1", minutes: 1 });
    // A tiny amount typed in days is kept as typed, then shown in minutes on leaving the field.
    const tiny = typeInto(durationEntry(DAYS), ["0.0007"]);
    expect(tiny).toMatchObject({ shown: ["0.0007"], saved: 1, left: { unit: MINUTES, text: "1" } });
  });

  it("a new unit keeps the typed number, and only switches the unit when nothing valid is typed", () => {
    expect(changeDurationUnit({ unit: HOURS, text: "2", minutes: 120 }, DAYS)).toEqual({ entry: { unit: DAYS, text: "2", minutes: 2 * DAYS }, commit: 2 * DAYS });
    expect(changeDurationUnit({ unit: MINUTES, text: "", minutes: 90 }, DAYS)).toEqual({ entry: { unit: DAYS, text: "", minutes: 90 }, commit: null });
  });

  it("settles after another change replaces the wait, so updating while rendering cannot loop", () => {
    let entry = durationEntry(2880), renders = 0;
    for (const minutes of [1, 1, 1]) { if (minutes !== entry.minutes) { entry = durationEntry(minutes, entry.unit); renders++; } }
    expect(renders).toBe(1);
    expect(entry).toEqual({ unit: MINUTES, text: "1", minutes: 1 });
  });

  it("opens a saved connection with its waits in exact units", () => {
    const mixes: WorkflowGraphMix[] = [{ id: "m1", name: "Estimate", status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", pending: 0, completed: 0, steps: [{ id: "s1", name: "Call", dayOffset: 0, anchor: "CALENDAR_DAY", channel: "PHONE_CALL" }] }];
    const rule: WorkflowRule = { id: "r1", name: "After the estimate", source: { mixId: "m1", stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: [
      { id: "p1", label: "No answer", when: "TIMEOUT", outcome: "", delayMinutes: 1, target: null, maxVisits: null, replace: false },
      { id: "p2", label: "Accepted", when: "OUTCOME", outcome: "Accepted", delayMinutes: 2880, target: null, maxVisits: null, replace: false }] };
    const html = renderToString(createElement(WorkflowRuleEditor, { initial: rule, mixes, onSave: async () => undefined, onCancel: () => undefined }));
    expect(html).toMatch(/aria-label="Wait for an outcome"[^>]*value="1"|value="1"[^>]*aria-label="Wait for an outcome"/);
    expect(html).toMatch(/aria-label="Wait before continuing"[^>]*value="2"|value="2"[^>]*aria-label="Wait before continuing"/);
    expect(html).toMatch(/aria-label="Wait for an outcome unit"[^>]*>.*?<option value="1" selected="">minutes<\/option>/);
    expect(html).toMatch(/aria-label="Wait before continuing unit"[^>]*><option value="1440" selected="">days<\/option>/);
  });
});
