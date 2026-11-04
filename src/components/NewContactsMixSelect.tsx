"use client";

/** Controlled by the placement form so toggling modes and failed saves keep the choice. */
export function NewContactsMixSelect({ mixes, selected, onChange }: {
  mixes: Array<{ id: string; name: string }>;
  selected: { id: string; name: string } | null;
  onChange: (id: string) => void;
}) {
  const unavailable = selected && !mixes.some(mix => mix.id === selected.id);
  return <select id="newContactMixId" name="mixId" value={selected?.id ?? ""} required aria-invalid={unavailable || undefined} aria-describedby="newContactMixHint" onChange={event => onChange(event.target.value)}>
    <option value="">Choose a Mix</option>
    {unavailable && <option value={selected.id} disabled>{selected.name} (not available)</option>}
    {mixes.map(mix => <option key={mix.id} value={mix.id}>{mix.name}</option>)}
  </select>;
}
