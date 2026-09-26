"use client";

import { AppIcon } from "@/components/AppIcon";
import { Sheet } from "@/components/Sheet";

const TERMS = [
  ["Mix", "A ready-to-go series of follow-ups for one situation, like a new estimate or a finished job."],
  ["Beat", "One step in a Mix: a text, email or call that comes due on a set day."],
  ["Mega-mix", "A full set of connected Mixes that covers your whole pipeline, from first inquiry to repeat work."],
  ["Journey", "The map of how your Mixes connect, and where each customer is right now."],
  ["Today", "Your list of Beats that are due, ready to review and send."]
] as const;

/** Keeps the memorable product names while explaining them in plain words. */
export function BrandTermsHelp({ className = "icon-button" }: { className?: string }) {
  return <Sheet trigger={<button className={className} type="button" aria-label="What these words mean" title="What these words mean"><AppIcon name="info" /></button>} title="What these words mean" description="The names you’ll see around Jump in the Mix.">
    <dl className="brand-terms">{TERMS.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
  </Sheet>;
}
