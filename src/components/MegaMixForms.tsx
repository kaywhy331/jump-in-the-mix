"use client";

import Link from "next/link";
import { startTransition, useActionState, useMemo, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { deleteMegaMixAction, duplicateMegaMixAction, importFileAction, previewImportAction, saveMegaMixAction, type ImportPreview } from "@/lib/mega-mix-pipeline-actions";

export type MegaMixChoice = { id: string; name: string; beats: number; status: string; pipeline: { id: string; name: string } | null };

/** Name a Mega-Mix and choose its Mixes. A Mix already in another Mega-Mix moves here when chosen. */
export function MegaMixForm({ pipeline, mixes }: { pipeline?: { id: string; name: string; description: string | null; mixIds: string[] }; mixes: MegaMixChoice[] }) {
  const [chosen, setChosen] = useState(() => new Set(pipeline?.mixIds ?? []));
  const [query, setQuery] = useState("");
  const visible = useMemo(() => mixes.filter(mix => !query || mix.name.toLowerCase().includes(query.toLowerCase())), [mixes, query]);
  const moving = mixes.filter(mix => chosen.has(mix.id) && mix.pipeline && mix.pipeline.id !== pipeline?.id);
  return <ActionForm action={saveMegaMixAction} protect className="form-stack mega-mix-form">
    {pipeline && <input type="hidden" name="pipelineId" value={pipeline.id} />}
    <label className="field"><span>Mega-Mix name</span><input name="name" required maxLength={80} defaultValue={pipeline?.name} placeholder="For example, Kitchen remodels" autoComplete="off" /></label>
    <label className="field"><span>Description (optional)</span><textarea name="description" maxLength={2000} rows={3} defaultValue={pipeline?.description ?? ""} placeholder="What this pipeline is for" /></label>
    <fieldset className="mega-mix-choices"><legend>Mixes in this Mega-Mix <span>{chosen.size} chosen</span></legend>
      <label className="sr-only" htmlFor="mega-mix-choice-search">Find a Mix</label>
      <input id="mega-mix-choice-search" type="search" placeholder="Find a Mix" value={query} onChange={event => setQuery(event.target.value)} />
      {visible.length ? <ul>{visible.map(mix => <li key={mix.id}><label className="checkbox-label"><input type="checkbox" name="mixId" value={mix.id} checked={chosen.has(mix.id)} onChange={event => setChosen(current => { const next = new Set(current); if (event.target.checked) next.add(mix.id); else next.delete(mix.id); return next; })} />
        <span><strong>{mix.name}</strong><small>{mix.beats} {mix.beats === 1 ? "Beat" : "Beats"} · {mix.status.toLowerCase()}{mix.pipeline && mix.pipeline.id !== pipeline?.id ? ` · in ${mix.pipeline.name}` : ""}</small></span></label></li>)}</ul> : <p className="muted-copy">{mixes.length ? "No Mix matches." : "Create a Mix first, then group it here."}</p>}
      {/* Hidden inputs keep chosen Mixes that the search hides. */}
      {[...chosen].filter(id => !visible.some(mix => mix.id === id)).map(id => <input key={id} type="hidden" name="mixId" value={id} />)}
    </fieldset>
    {moving.length > 0 && <p className="notice" role="status">{moving.length === 1 ? `${moving[0].name} moves here from ${moving[0].pipeline!.name}.` : `${moving.length} Mixes move here from other Mega-Mixes.`} A Mix belongs to one Mega-Mix at a time.</p>}
    <p className="muted-copy">Grouping never starts anyone or changes Beats. Journey connections stay as they are.</p>
    <div className="form-actions"><FormSubmitButton label={pipeline ? "Save Mega-Mix" : "Create Mega-Mix"} pendingLabel="Saving…" /><Link className="button" href={pipeline ? `/mixes/mega?megaMix=${encodeURIComponent(pipeline.id)}` : "/mixes/mega"}>Cancel</Link></div>
  </ActionForm>;
}

export function DuplicateMegaMixForm({ pipeline }: { pipeline: { id: string; name: string } }) {
  return <ActionForm action={duplicateMegaMixAction} className="form-stack">
    <input type="hidden" name="pipelineId" value={pipeline.id} />
    <label className="field"><span>Name for the copy</span><input name="name" required maxLength={80} defaultValue={`${pipeline.name} copy`.slice(0, 80)} /></label>
    <p className="muted-copy">Copies every Mix, Beat and connection so you can change the copy without touching the original. No one is started.</p>
    <FormSubmitButton label="Make a copy" pendingLabel="Copying…" />
  </ActionForm>;
}

export function RemoveMegaMixButton({ pipeline }: { pipeline: { id: string; name: string } }) {
  return <ConfirmDialog trigger={<><AppIcon name="trash" />Remove Mega-Mix</>} title={`Remove ${pipeline.name}?`} description="Removes this grouping only. Its Mixes, their people, follow-ups and Journey connections all stay." danger>
    <ActionForm action={deleteMegaMixAction} className="form-stack"><input type="hidden" name="pipelineId" value={pipeline.id} /><button className="button danger" type="submit">Remove Mega-Mix</button></ActionForm>
  </ConfirmDialog>;
}

/** Read a file on this device, check it on the server, show what it adds, then import on confirmation. */
export function ImportFileForm() {
  const [text, setText] = useState(""), [fileName, setFileName] = useState(""), [readError, setReadError] = useState("");
  const [preview, check, checking] = useActionState<ImportPreview, FormData>(previewImportAction, {});
  return <div className="form-stack import-file">
    <div className="form-stack">
      <label className="field"><span>Mix or Mega-Mix file</span><input type="file" accept=".json,application/json" required onChange={async event => {
        const file = event.target.files?.[0]; setReadError(""); setText("");
        if (!file) return;
        if (file.size > 900_000) { setReadError("This file is too large to import."); return; }
        setFileName(file.name); const value = await file.text(); setText(value);
        const data = new FormData(); data.set("file", value);
        startTransition(() => check(data));
      }} /></label>
      {readError && <p className="notice error" role="alert">{readError}</p>}
      {checking && <p role="status">Checking {fileName}…</p>}
      {preview.error && !checking && <p className="notice error" role="alert">{preview.error}</p>}
    </div>
    {preview.kind && !checking && text && <ActionForm action={importFileAction} className="form-stack">
      <input type="hidden" name="file" value={text} />
      <div className="import-summary" role="status"><strong>{preview.kind === "mix" ? "A Mix" : "A Mega-Mix"}: {preview.summary!.mixes} {preview.summary!.mixes === 1 ? "Mix" : "Mixes"} · {preview.summary!.beats} Beats{preview.kind === "mega-mix" ? ` · ${preview.summary!.connections} paths` : ""}</strong>
        <ul>{preview.mixes!.slice(0, 15).map((mix, index) => <li key={index}>{mix.name} <small>{mix.beats} {mix.beats === 1 ? "Beat" : "Beats"}</small></li>)}{preview.mixes!.length > 15 && <li>and {preview.mixes!.length - 15} more</li>}</ul></div>
      <label className="field"><span>{preview.kind === "mix" ? "Mix name" : "Mega-Mix name"}</span><input name="name" required maxLength={80} defaultValue={preview.name} /></label>
      <label className="checkbox-label"><input type="checkbox" name="reviewed" required />I’ve reviewed the wording. Imported Mixes start no one and send nothing until I start someone.</label>
      <FormSubmitButton label="Import" pendingLabel="Importing…" />
    </ActionForm>}
  </div>;
}
