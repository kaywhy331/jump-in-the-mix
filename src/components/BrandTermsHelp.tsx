"use client";

import { AppIcon } from "@/components/AppIcon";
import { Sheet } from "@/components/Sheet";

const TERMS = [
  ["Mix", "A reusable follow-up plan for one kind of situation, such as an estimate that’s out: its Beats and when it starts."],
  ["Beat", "One planned text, email or call in a Mix that comes due at a set time. Each Beat has text, email and call versions."],
  ["Mega-Mix", "A named set of connected Mixes that covers your work from first inquiry to repeat business."],
  ["Journey", "The map of how your Mixes connect and where each person is right now."],
  ["Today", "The daily list of what needs you: follow-ups due and overdue, items that need your input and quiet-day check-ins, then what’s upcoming and done."]
] as const;

/** Keeps the memorable product names while explaining them in plain words. */
export function BrandTermsHelp({ className = "icon-button" }: { className?: string }) {
  return <Sheet trigger={<button className={className} type="button" aria-label="What these words mean" title="What these words mean"><AppIcon name="info" /></button>} title="What these words mean" description="The names you’ll see around Jump in the Mix.">
    <dl className="brand-terms">{TERMS.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
  </Sheet>;
}
