"use client";

/**
 * The Mix for new contacts in Settings → New contacts (JITM-09 §2.78). Picking a Mix also picks "Add them to a Mix",
 * so a Mix chosen while another option is still selected isn't dropped on save.
 */
export function NewContactsMixSelect({ mixes, defaultValue }: { mixes: Array<{ id: string; name: string }>; defaultValue: string }) {
  return <select id="newContactMixId" name="mixId" defaultValue={defaultValue} aria-describedby="newContactMixHint" onChange={(event) => {
    const option = event.currentTarget.form?.querySelector<HTMLInputElement>('input[name="placement"][value="MIX"]');
    if (event.currentTarget.value && option) option.checked = true;
  }}><option value="">Choose a Mix</option>{mixes.map(mix => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select>;
}
