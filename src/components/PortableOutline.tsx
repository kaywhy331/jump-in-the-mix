import { AppIcon } from "@/components/AppIcon";
import { beatNumberRange, compareBeatNumbers, numberPortableBeats } from "@/lib/journey-numbering";
import type { PortablePackage } from "@/lib/mix-portable";

const channelLabel: Record<string, string> = { SMS: "Text", WHATSAPP: "WhatsApp", EMAIL: "Email", PHONE_CALL: "Call", VOICEMAIL: "Voicemail" };
const timing = (step: PortablePackage["mixes"][number]["steps"][number], waiting: boolean) => waiting ? "After a connection" : step.anchor === "CALENDAR_DAY" ? `Day ${step.dayOffset}` : "Around an appointment";

/** A numbered, read-only outline of a Mix or Mega-Mix: Beats in journey order and where each path leads. */
export function PortableOutline({ value, label }: { value: PortablePackage; label: string }) {
  const numbers = numberPortableBeats(value);
  const waiting = new Set(value.waitingBeats.map(entry => `${entry.mix}/${entry.beat}`));
  const first = (mix: PortablePackage["mixes"][number]) => mix.steps.map(step => numbers[`${mix.key}/${step.key}`]).filter(Boolean).sort(compareBeatNumbers)[0] ?? "";
  const mixes = [...value.mixes].sort((a, b) => compareBeatNumbers(first(a), first(b)));
  const destination = (target: { mix: string; beat: string | null } | null) => {
    if (!target) return "Finish this path";
    const mix = value.mixes.find(item => item.key === target.mix);
    const range = beatNumberRange(target.beat ? [`${target.mix}/${target.beat}`] : mix?.steps.map(step => `${target.mix}/${step.key}`) ?? [], numbers);
    return `${range ? `${range} · ` : ""}${mix?.name ?? "Unavailable Mix"}`;
  };
  return <ol className="portable-outline" aria-label={label}>{mixes.map(mix => {
    const rules = value.rules.filter(rule => rule.source.mix === mix.key);
    return <li key={mix.key} className="portable-outline-mix">
      <h3><span className="portable-outline-icon" aria-hidden="true"><AppIcon name="mixes" /></span><span>{mix.name}<small>{mix.steps.length} {mix.steps.length === 1 ? "Beat" : "Beats"}{mix.triggerMode === "DATE_TRIGGERED" ? " · Starts from a date" : ""}</small></span></h3>
      <ol className="portable-outline-beats">{mix.steps.map(step => { const id = `${mix.key}/${step.key}`; return <li key={step.key}><b className="beat-number" title={`Beat ${numbers[id]}`}><span className="sr-only">Beat </span>{numbers[id]}</b><span><strong>{step.name}</strong><small>{channelLabel[step.channel] ?? step.channel} · {timing(step, waiting.has(id))}</small></span></li>; })}</ol>
      {rules.length > 0 && <ul className="portable-outline-paths" aria-label={`Paths after ${mix.name}`}>{rules.flatMap(rule => rule.routes.map(route => <li key={route.key}><AppIcon name="chevronRight" aria-hidden="true" /><span>{route.label} → {destination(route.target)}{route.maxVisits ? ` · repeat limit ${route.maxVisits}` : ""}</span></li>))}</ul>}
      {value.finishes.includes(mix.key) && !rules.length && <p className="portable-outline-end"><AppIcon name="check" aria-hidden="true" />Finishes here</p>}
    </li>;
  })}</ol>;
}
