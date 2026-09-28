import type { WorkflowRule, WorkflowTarget } from "@/lib/mix-workflow-types";

type NumberedMix = { id: string; status: string; source: string; createdAt?: string | Date | null; steps: Array<{ id: string }> };
/** Journey labels: `mixes` holds A1, A2, B1…; `beats` holds A1.a, A1.b… */
export type JourneyNumbers = { mixes: Record<string, string>; beats: Record<string, string> };

/** 0 → a, 25 → z, 26 → aa. */
export const branchLetters = (index: number) => { let value = "", next = index; do { value = String.fromCharCode(97 + next % 26) + value; next = Math.floor(next / 26) - 1; } while (next >= 0); return value; };

/**
 * Number the Journey. Each starting point opens a lettered journey (A, B, C…), its Mixes are
 * numbered in the order its paths reach them (A1, A2, A3…), and each Mix's Beats are lettered in
 * order (A1.a, A1.b…). Journeys are lettered by when their starting Mix was created. When a path
 * hands people off into another journey's Mixes, the journey created first keeps them, so each
 * Mix has one number. Bounded return paths never renumber what they lead back to. Archived and
 * one-time Mixes are not numbered.
 */
export function numberJourney(mixes: NumberedMix[], configuration: { rules: WorkflowRule[] }): JourneyNumbers {
  const usable = mixes.filter(mix => mix.status !== "ARCHIVED" && mix.source !== "ONE_TIME");
  const byId = new Map(usable.map(mix => [mix.id, mix]));
  const forward = (target: WorkflowTarget | null, maxVisits: number | null): target is WorkflowTarget => Boolean(target && maxVisits === null && byId.has(target.mixId));
  // Paths leave a Mix from one of its Beats or after the whole Mix; follow them in that order.
  const position = (rule: WorkflowRule) => { const steps = byId.get(rule.source.mixId)!.steps; return rule.source.stepId ? steps.findIndex(step => step.id === rule.source.stepId) : steps.length; };
  const rules = configuration.rules.filter(rule => byId.has(rule.source.mixId));
  const next = new Map(usable.map(mix => [mix.id, [...new Set(rules.filter(rule => rule.source.mixId === mix.id).map((rule, index) => ({ rule, index }))
    .sort((a, b) => position(a.rule) - position(b.rule) || a.index - b.index)
    .flatMap(({ rule }) => [...rule.routes.flatMap(route => forward(route.target, route.maxVisits) ? [route.target.mixId] : []), ...(rule.join && byId.has(rule.join.target.mixId) ? [rule.join.target.mixId] : [])])
    .filter(id => id !== mix.id))]]));
  const entered = new Set([...next.values()].flat());

  const created = (mix: NumberedMix) => mix.createdAt ? new Date(mix.createdAt).getTime() : Number.POSITIVE_INFINITY;
  const order = new Map(usable.map((mix, index) => [mix.id, index]));
  const earliest = (a: NumberedMix, b: NumberedMix) => (created(a) - created(b) || 0) || order.get(a.id)! - order.get(b.id)!;
  // Starting points first; a Mix reached only through a loop or a cycle still opens a journey.
  const starts = [...usable.filter(mix => !entered.has(mix.id)).sort(earliest), ...usable.filter(mix => entered.has(mix.id)).sort(earliest)];

  const output: JourneyNumbers = { mixes: {}, beats: {} };
  let journeys = 0;
  for (const start of starts) {
    if (output.mixes[start.id]) continue;
    const letter = branchLetters(journeys++).toUpperCase(), queue = [start.id];
    let count = 0;
    while (queue.length) {
      const id = queue.shift()!;
      if (output.mixes[id]) continue;
      const label = `${letter}${++count}`;
      output.mixes[id] = label;
      byId.get(id)!.steps.forEach((step, index) => { output.beats[step.id] = `${label}.${branchLetters(index)}`; });
      queue.push(...next.get(id)!.filter(target => !output.mixes[target]));
    }
  }
  return output;
}

/** Sort key that keeps A2 before A10, A1 before A1.a, and A9 before B1. */
export function compareJourneyNumbers(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** "A3" for a whole Mix, "A3.b" for one of its Beats. */
export function journeyTargetNumber(target: WorkflowTarget, numbers: JourneyNumbers) {
  return (target.stepId ? numbers.beats[target.stepId] : numbers.mixes[target.mixId]) ?? "";
}

/** Numbers for a portable package, keyed "mix" and "mix/beat", using the same rules as the Journey map. */
export function numberPortable(value: { mixes: Array<{ key: string; steps: Array<{ key: string }> }>; rules: Array<{ source: { mix: string; beat: string | null }; routes: Array<{ target: { mix: string; beat: string | null } | null; maxVisits: number | null; when: "FINISHED" | "OUTCOME" | "TIMEOUT"; label: string; outcome: string; delayMinutes: number; replace: boolean; key: string }>; join: { mode: "ALL" | "ANY"; target: { mix: string; beat: string | null }; cancelRemaining: boolean } | null; key: string; name: string; enabled: boolean; mode: "CHOICE" | "PARALLEL" }> }) {
  const point = (entry: { mix: string; beat: string | null }) => ({ mixId: entry.mix, stepId: entry.beat ? `${entry.mix}/${entry.beat}` : null });
  // A file has no creation dates; its Mixes keep the order they were saved in.
  return numberJourney(value.mixes.map(mix => ({ id: mix.key, status: "ACTIVE", source: "PORTABLE", steps: mix.steps.map(step => ({ id: `${mix.key}/${step.key}` })) })), {
    rules: value.rules.map(rule => ({ id: rule.key, name: rule.name, enabled: rule.enabled, mode: rule.mode, source: point(rule.source), join: rule.join ? { ...rule.join, target: point(rule.join.target) } : null,
      routes: rule.routes.map(route => ({ id: route.key, label: route.label, when: route.when, outcome: route.outcome, delayMinutes: route.delayMinutes, maxVisits: route.maxVisits, replace: route.replace, target: route.target ? point(route.target) : null })) }))
  });
}
