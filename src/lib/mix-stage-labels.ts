// Client-safe pieces of the Mix stage rules (src/lib/mix-stage.ts), shared with the Mega-Mix and Mix editor forms.

/** Contact stages a business can have, retired ones included (src/lib/journey-actions.ts). */
export const MAX_CONTACT_STAGES = 20;

/** The labels a business doesn't have yet, matched without regard to case. */
export function newStageLabels(existing: readonly string[], labels: readonly string[]): string[] {
  const known = new Set(existing.map(name => name.toLowerCase()));
  return labels.filter(name => !known.has(name.toLowerCase()));
}
