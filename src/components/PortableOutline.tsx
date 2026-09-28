import { AppIcon } from "@/components/AppIcon";
import { compareJourneyNumbers, numberPortable } from "@/lib/journey-numbering";
import type { PortablePackage } from "@/lib/mix-portable";

const channelLabel: Record<string, string> = { SMS: "Text", WHATSAPP: "WhatsApp", EMAIL: "Email", PHONE_CALL: "Call", VOICEMAIL: "Voicemail" };
const timing = (step: PortablePackage["mixes"][number]["steps"][number], waiting: boolean) => waiting ? "After a connection" : step.anchor === "CALENDAR_DAY" ? `Day ${step.dayOffset}` : "Around an appointment";

/** A numbered, read-only outline of a Mix or Mega-Mix: Beats in journey order and where each path leads. */
export function PortableOutline({ value, label }: { value: PortablePackage; label: string }) {
  const numbers = numberPortable(value);
  const waiting = new Set(value.waitingBeats.map(entry => `${entry.mix}/${entry.beat}`));
  const mixes = [...value.mixes].sort((a, b) => compareJourneyNumbers(numbers.mixes[a.key] ?? "", numbers.mixes[b.key] ?? ""));
  const destination = (target: { mix: string; beat: string | null } | null) => {
    if (!target) return "Finish this path";
    const mix = value.mixes.find(item => item.key === target.mix), step = target.beat ? mix?.steps.find(item => item.key === target.beat) : null;
    const number = target.beat ? numbers.beats[`${target.mix}/${target.beat}`] : numbers.mixes[target.mix];
    return `${number ? `${number} · ` : ""}${step ? `${step.name} in ` : ""}${mix?.name ?? "Unavailable Mix"}`;
  };
  return <ol className="portable-outline" aria-label={label}>{mixes.map(mix => {
    const rules = value.rules.filter(rule => rule.source.mix === mix.key);
    return <li key={mix.key} className="portable-outline-mix">
      <h3><span className="portable-outline-icon" aria-hidden="true"><AppIcon name="mixes" /></span><span>{numbers.mixes[mix.key] && <b className="mix-number" title={`Mix ${numbers.mixes[mix.key]}`}><span className="sr-only">Mix </span>{numbers.mixes[mix.key]}</b>}{mix.name}<small>{mix.steps.length} {mix.steps.length === 1 ? "Beat" : "Beats"}{mix.triggerMode === "DATE_TRIGGERED" ? " · Starts from a date" : ""}</small></span></h3>
      <ol className="portable-outline-beats">{mix.steps.map(step => { const id = `${mix.key}/${step.key}`; return <li key={step.key}><b className="beat-number" title={`Beat ${numbers.beats[id]}`}><span className="sr-only">Beat </span>{numbers.beats[id]}</b><span><strong>{step.name}</strong><small>{channelLabel[step.channel] ?? step.channel} · {timing(step, waiting.has(id))}</small></span></li>; })}</ol>
      {rules.length > 0 && <ul className="portable-outline-paths" aria-label={`Paths after ${mix.name}`}>{rules.flatMap(rule => rule.routes.map(route => <li key={route.key}><AppIcon name="chevronRight" aria-hidden="true" /><span>{route.label} → {destination(route.target)}{route.maxVisits ? ` · repeat limit ${route.maxVisits}` : ""}</span></li>))}</ul>}
      {value.finishes.includes(mix.key) && !rules.length && <p className="portable-outline-end"><AppIcon name="check" aria-hidden="true" />Finishes here</p>}
    </li>;
  })}</ol>;
}
