import type { WorkflowConfiguration, WorkflowTarget } from "@/lib/mix-workflow-types";

type NumberedMix = { id: string; status: string; source: string; steps: Array<{ id: string }> };
type Label = { number: number; suffix: string };
// `rest` means the Beats run as the remainder of their Mix, so Mix-level paths follow the last one.
type Entry = { mixId: string; beats: string[]; rest: boolean; label: Label; order: number };

export const branchLetters = (index: number) => { let value = "", next = index; do { value = String.fromCharCode(97 + next % 26) + value; next = Math.floor(next / 26) - 1; } while (next >= 0); return value; };
const track = (index: number) => index ? branchLetters(index).toUpperCase() : "";

/**
 * Number every Beat by its position in the journey: 1, 2, 3, then 4a/4b where a path
 * splits and 6aa/6ab where a split path splits again. A join continues without the branch
 * letters. Bounded return paths, finishes and Beats that already have a number never create
 * a branch, so a loop back keeps the original numbers. The earliest position wins. Separate
 * entry points are numbered as their own tracks: B1, B2 and so on.
 */
export function numberJourneyBeats(mixes: NumberedMix[], configuration: Pick<WorkflowConfiguration, "rules" | "gatedStepIds">): Record<string, string> {
  const usable = mixes.filter(mix => mix.status !== "ARCHIVED" && mix.source !== "ONE_TIME");
  const byId = new Map(usable.map(mix => [mix.id, mix]));
  const gated = new Set(configuration.gatedStepIds);
  const forward = (target: WorkflowTarget | null, maxVisits: number | null): target is WorkflowTarget => Boolean(target && maxVisits === null && byId.has(target.mixId) && (!target.stepId || byId.get(target.mixId)!.steps.some(step => step.id === target.stepId)));
  const rules = configuration.rules.filter(rule => byId.has(rule.source.mixId));
  const scheduled = (mixId: string) => byId.get(mixId)!.steps.filter(step => !gated.has(step.id)).map(step => step.id);
  const beatsOf = (target: WorkflowTarget) => target.stepId ? [target.stepId] : scheduled(target.mixId);
  const labels = new Map<string, Label>(), output: Record<string, string> = {};

  const entered = new Set<string>();
  for (const rule of rules) {
    for (const route of rule.routes) if (forward(route.target, route.maxVisits) && route.target.mixId !== rule.source.mixId) entered.add(route.target.mixId);
    if (rule.join && byId.has(rule.join.target.mixId) && rule.join.target.mixId !== rule.source.mixId) entered.add(rule.join.target.mixId);
  }

  let order = 0;
  const walk = (start: WorkflowTarget, prefix: string) => {
    const pending: Entry[] = [{ mixId: start.mixId, beats: beatsOf(start), rest: !start.stepId, label: { number: 1, suffix: "" }, order: order++ }];
    while (pending.length) {
      // Always continue from the earliest position so every Beat keeps its lowest number.
      const index = pending.reduce((best, entry, position) => entry.label.number < pending[best].label.number || entry.label.number === pending[best].label.number && entry.order < pending[best].order ? position : best, 0);
      const [entry] = pending.splice(index, 1);
      const beats = entry.beats.filter(id => !labels.has(id));
      if (!beats.length) continue;
      const mixBeats = scheduled(entry.mixId);
      for (const [position, stepId] of beats.entries()) {
        const label = { number: entry.label.number + position, suffix: entry.label.suffix };
        labels.set(stepId, label); output[stepId] = `${prefix}${label.number}${label.suffix}`;
        const last = entry.rest ? position === beats.length - 1 : stepId === mixBeats.at(-1);
        const sources = rules.filter(rule => rule.source.mixId === entry.mixId && (rule.source.stepId === stepId || !rule.source.stepId && last));
        const seen = new Set<string>(), targets: WorkflowTarget[] = [];
        for (const rule of sources) for (const route of rule.routes) {
          if (!forward(route.target, route.maxVisits)) continue;
          const key = `${route.target.mixId}:${route.target.stepId ?? ""}`;
          if (!seen.has(key) && beatsOf(route.target).some(id => !labels.has(id))) { seen.add(key); targets.push(route.target); }
        }
        const remainder = entry.rest ? beats.slice(position + 1) : [];
        const branches = (remainder.length && targets.length ? 1 : 0) + targets.length;
        const after = (letter: number) => ({ number: label.number + 1, suffix: branches > 1 ? `${label.suffix}${branchLetters(letter)}` : label.suffix });
        targets.forEach((target, letter) => pending.push({ mixId: target.mixId, beats: beatsOf(target), rest: !target.stepId, label: after(letter + (remainder.length ? 1 : 0)), order: order++ }));
        for (const rule of sources) if (rule.join && byId.has(rule.join.target.mixId)) {
          const span = Math.max(1, ...rule.routes.flatMap(route => forward(route.target, route.maxVisits) ? [beatsOf(route.target).length] : []));
          pending.push({ mixId: rule.join.target.mixId, beats: beatsOf(rule.join.target), rest: !rule.join.target.stepId, label: { number: label.number + 1 + span, suffix: label.suffix }, order: order++ });
        }
        // The rest of this Mix becomes branch "a" when a Beat in the middle also leads elsewhere.
        if (remainder.length && targets.length) { pending.push({ mixId: entry.mixId, beats: remainder, rest: true, label: after(0), order: order++ }); break; }
      }
    }
  };
  // A Mix reached only through a bounded return path is still numbered, as its own track.
  const starts = [...usable.filter(mix => !entered.has(mix.id)), ...usable.filter(mix => entered.has(mix.id))];
  let tracks = 0;
  for (const mix of starts) if (scheduled(mix.id).some(id => !labels.has(id))) walk({ mixId: mix.id, stepId: null }, track(tracks++));
  // Beats that only start through a direct connection get their own track after the Mixes.
  for (const mix of usable) for (const step of mix.steps) if (!labels.has(step.id)) walk({ mixId: mix.id, stepId: step.id }, track(tracks++));
  return output;
}

/** Sort key that keeps 2 before 10 and 4a before 4b. */
export function compareBeatNumbers(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** "3b–6b" for a Mix whose Beats run consecutively, otherwise every number in order. */
export function beatNumberRange(stepIds: string[], numbers: Record<string, string>) {
  const values = stepIds.map(id => numbers[id]).filter(Boolean);
  const parts = values.map(value => /^([A-Z]*)(\d+)([a-z]*)$/.exec(value));
  const consecutive = parts.every((part, index) => part && parts[0] && part[1] === parts[0][1] && part[3] === parts[0][3] && Number(part[2]) === Number(parts[0][2]) + index);
  return values.length >= 2 && consecutive ? `${values[0]}–${values.at(-1)}` : values.join(", ");
}

/** Numbers for a portable package, keyed "mix/beat", using the same rules as the Journey map. */
export function numberPortableBeats(value: { mixes: Array<{ key: string; steps: Array<{ key: string }> }>; rules: Array<{ source: { mix: string; beat: string | null }; routes: Array<{ target: { mix: string; beat: string | null } | null; maxVisits: number | null; when: "FINISHED" | "OUTCOME" | "TIMEOUT"; label: string; outcome: string; delayMinutes: number; replace: boolean; key: string }>; join: { mode: "ALL" | "ANY"; target: { mix: string; beat: string | null }; cancelRemaining: boolean } | null; key: string; name: string; enabled: boolean; mode: "CHOICE" | "PARALLEL" }>; waitingBeats: Array<{ mix: string; beat: string }> }) {
  const point = (entry: { mix: string; beat: string | null }) => ({ mixId: entry.mix, stepId: entry.beat ? `${entry.mix}/${entry.beat}` : null });
  return numberJourneyBeats(value.mixes.map(mix => ({ id: mix.key, status: "ACTIVE", source: "PORTABLE", steps: mix.steps.map(step => ({ id: `${mix.key}/${step.key}` })) })), {
    gatedStepIds: value.waitingBeats.map(entry => `${entry.mix}/${entry.beat}`),
    rules: value.rules.map(rule => ({ id: rule.key, name: rule.name, enabled: rule.enabled, mode: rule.mode, source: point(rule.source), join: rule.join ? { ...rule.join, target: point(rule.join.target) } : null,
      routes: rule.routes.map(route => ({ id: route.key, label: route.label, when: route.when, outcome: route.outcome, delayMinutes: route.delayMinutes, maxVisits: route.maxVisits, replace: route.replace, target: route.target ? point(route.target) : null })) }))
  });
}
