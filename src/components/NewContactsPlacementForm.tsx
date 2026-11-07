"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NewContactsMixSelect } from "@/components/NewContactsMixSelect";
import type { NewContactPlacementSetting } from "@/lib/new-contact-placement";
import { isNavigationSignal, UNCONFIRMED_SAVE } from "@/lib/unconfirmed-save";

export function NewContactsPlacementForm({ placement: savedPlacement, chosen, mixes, viewOnly, serverError, saveAction }: {
  placement: NewContactPlacementSetting["placement"];
  chosen: NewContactPlacementSetting["mix"];
  mixes: Array<{ id: string; name: string }>;
  viewOnly: boolean;
  serverError?: string | null;
  saveAction: (data: FormData) => Promise<string | null>;
}) {
  const router = useRouter();
  const [placement, setPlacement] = useState(savedPlacement);
  const [selected, setSelected] = useState(chosen);
  const [saveError, setSaveError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [, action, pending] = useActionState(async (_previous: null, data: FormData) => {
    setSaveError("");
    try { setSaveError(await saveAction(data) ?? ""); router.refresh(); }
    catch (cause) { if (isNavigationSignal(cause)) throw cause; setSaveError(UNCONFIRMED_SAVE); }
    return null;
  }, null);
  const error = saveError || serverError;
  useEffect(() => { if (error && !pending) errorRef.current?.focus(); }, [error, pending]);
  const option = (value: typeof placement, title: string, detail: string) => <label className="checkbox-card">
    <input type="radio" name="placement" value={value} checked={placement === value} onChange={() => setPlacement(value)} required />
    <span><strong>{title}</strong><small>{detail}</small></span>
  </label>;
  return <form action={action} onReset={event => event.preventDefault()} className="form-stack" aria-describedby={error ? "newContactSaveError" : undefined}>
    {error && <p ref={errorRef} id="newContactSaveError" tabIndex={-1} role="alert" className="notice error">{error}{error !== UNCONFIRMED_SAVE && " Your choices are kept."}</p>}
    <fieldset className="form-stack" disabled={viewOnly || pending}><legend>Where new contacts go</legend>
      {option("NONE", "Save without a default Mix", "No Mix starts from this setting. Contact stage and Everyone rules still apply.")}
      {option("MIX", "Add them to a Mix automatically", "Start the chosen Mix on the day the person is added. You still review and send every message.")}
      {placement === "MIX" && <div className="field new-contacts-mix">
        <label htmlFor="newContactMixId">Mix for new contacts</label>
        <NewContactsMixSelect mixes={mixes} selected={selected} onChange={id => setSelected(mixes.find(mix => mix.id === id) ?? null)} />
        <small id="newContactMixHint">Choose a Mix that starts when you start it for someone, not after another Mix.</small>
        {!mixes.length && <p className="muted-copy">No Mix can be chosen yet. <Link className="inline-action" href="/mixes/new?custom=1">Create a Mix</Link> that starts when you start it for someone, or choose another option above.</p>}
      </div>}
      {option("ASK", "Choose when adding", "Add a contact and Quick Add offer a choice. Phone and connected contacts wait on Today’s No Mix line unless another rule starts a Mix.")}
    </fieldset>
    <button className="button primary" disabled={viewOnly || pending}>{pending ? "Saving…" : "Save"}</button>
  </form>;
}
