"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSharedMixDraftFormAction } from "@/lib/shared-mix-admin-actions";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES, normalizeSharedMixSteps, sharedMixChannelLabel } from "@/lib/shared-mix";
import { EMPTY_LIBRARY_CONTENT, libraryDateKey, type LibraryContent } from "@/lib/library-content";
import { CONTACT_PLACEHOLDERS, MY_INFO_PLACEHOLDERS, PRIVATE_NOTE_PLACEHOLDERS } from "@/lib/placeholders";
import { useAdminDraft } from "@/components/AdminDraftProvider";
import { useConfirmDialog } from "@/components/useConfirmDialog";

export function LibraryDraftForm({ id, revision, content, returnTo = "/admin/templates", sourceKey = "new" }: { id?: string; revision: number; content: LibraryContent; returnTo?: string; sourceKey?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveSharedMixDraftFormAction, {});
  const [confirm, confirmDialog] = useConfirmDialog();
  const draft = useAdminDraft(`library:${id ?? sourceKey}`, { content, revision, reason: "" });
  const { content: current, reason } = draft.value;
  const [expanded, setExpanded] = useState<number | null>(0);
  const form = useRef<HTMLFormElement>(null);
  const navigated = useRef<string | undefined>(undefined);
  useEffect(() => { if (state.redirectTo && navigated.current !== state.redirectTo) { navigated.current = state.redirectTo; draft.clear(); router.push(state.redirectTo); } }, [state.redirectTo, draft, router]);
  const conflict = draft.dirty && draft.value.revision !== revision;
  const update = (patch: Partial<LibraryContent>) => draft.set({ ...draft.value, content: { ...current, ...patch } });
  const updateStep = (index: number, patch: Partial<LibraryContent["steps"][number]>) => update({ steps: current.steps.map((step, position) => position === index ? { ...step, ...patch } : step) });
  function move(index: number, direction: number) { const next = [...current.steps]; if (!next[index + direction]) return; [next[index], next[index + direction]] = [next[index + direction], next[index]]; update({ steps: next }); setExpanded(index + direction); }
  const errorFor = (name: string) => state.field === name ? <small className="field-error" role="alert">{state.error}</small> : null;
  const problems: Array<{ text: string; name: string; index?: number }> = [];
  if (!current.title.trim()) problems.push({ text: "Add a title", name: "title" });
  if (current.description.trim().length < 20) problems.push({ text: "Description needs at least 20 characters", name: "description" });
  if (current.triggerMode === "DATE_TRIGGERED" && !current.dateTypeName?.trim()) problems.push({ text: "Choose a saved date type", name: "dateTypeName" });
  current.steps.forEach((step, index) => {
    if (!step.name.trim()) problems.push({ text: `Name Beat ${index + 1}`, name: "stepName", index });
    try { normalizeSharedMixSteps([step]); } catch (error) { problems.push({ text: `Beat ${index + 1}: ${error instanceof Error ? error.message.replace(/#1|Beat 1/g, "") : "Review content and timing"}`, name: "stepName", index }); }
  });
  if (reason.trim().length < 10) problems.push({ text: "Add a change reason (10 characters)", name: "reason" });
  function goToProblem(problem: typeof problems[number]) {
    const target = form.current?.querySelectorAll<HTMLElement>(`[name="${problem.name}"]`)[problem.index ?? 0];
    if (!target) return;
    const panel = target.closest("details"); if (panel) { panel.open = true; if (problem.index !== undefined) setExpanded(problem.index); }
    requestAnimationFrame(() => { target.focus(); target.scrollIntoView({ block: "center", behavior: "smooth" }); });
  }
  return <form ref={form} action={action} className="admin-template-editor-form" onInvalid={event => { const panel = (event.target as HTMLElement).closest("details"); if (panel) { panel.open = true; const first = form.current?.querySelector(":invalid"); if (first === event.target) setExpanded(Number(panel.dataset.beat)); } }}>
    <input type="hidden" name="sharedMixId" value={id ?? ""} /><input type="hidden" name="sourceMixId" value={sourceKey === "new" ? "" : sourceKey} /><input type="hidden" name="revision" value={draft.value.revision} /><input type="hidden" name="returnTo" value={returnTo} />
    <div className="admin-draft-readiness"><strong role="status">{problems.length ? `${problems.length} item(s) need review` : "Ready to save for review"} · {current.steps.length} {current.steps.length === 1 ? "Beat" : "Beats"}</strong>{problems.length > 0 && <details><summary>Find incomplete fields</summary><ul>{problems.map((problem, index) => <li key={index}><button className="button small" type="button" onClick={() => goToProblem(problem)}>{problem.text}</button></li>)}</ul></details>}<small>Saving creates a private draft; publish the saved preview separately.</small></div>
    <p className="admin-result-summary" role="status">{draft.dirty ? "Unsaved · kept in this tab for 30 minutes. Save before reloading." : "Draft · publishing is a separate step."}</p>
    {conflict && <div className="notice info" role="alert"><p>A newer version is available. Review the saved preview and changes before applying your retained draft.</p><button className="button" type="button" onClick={() => draft.set({ ...draft.value, revision })}>I reviewed the latest version; keep my draft</button></div>}
    {state.error && <div className="notice error" role="alert">{state.field ? `${state.field}: ` : ""}{state.error}</div>}
    <div className="admin-library-editor-grid"><section className="card form-stack"><h2>Draft details</h2>
      <label className="field"><span>Title</span><input name="title" value={current.title} onChange={e => update({ title: e.target.value })} maxLength={160} required aria-invalid={state.field === "title"} />{errorFor("title")}</label>
      <label className="field"><span>Description</span><textarea name="description" value={current.description} onChange={e => update({ description: e.target.value })} minLength={20} maxLength={1200} required rows={3} aria-invalid={state.field === "description"} />{errorFor("description")}</label>
      <div className="form-grid">
        <label className="field"><span>Category</span><select name="category" value={current.category} onChange={e => update({ category: e.target.value })}>{MIX_TEMPLATE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Industry</span><select name="industry" value={current.industry} onChange={e => update({ industry: e.target.value })}>{MIX_TEMPLATE_INDUSTRIES.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Short label</span><input name="framework" value={current.framework ?? ""} onChange={e => update({ framework: e.target.value })} maxLength={160} /></label>
        <label className="field"><span>Starts</span><select name="triggerMode" value={current.triggerMode} onChange={e => update({ triggerMode: e.target.value as LibraryContent["triggerMode"] })}><option value="MANUAL_START">When chosen for someone</option><option value="DATE_TRIGGERED">From a saved date</option><option value="BROADCAST">On one fixed date</option></select></label>
      </div>
      {current.triggerMode === "DATE_TRIGGERED" ? <><label className="field"><span>Saved date type name</span><input name="dateTypeName" value={current.dateTypeName ?? ""} onChange={e => update({ dateTypeName: e.target.value })} maxLength={120} required /></label><details><summary>Saved date key ({current.dateTypeSlug || libraryDateKey(current.dateTypeName || "") || "generated from name"})</summary><label className="field"><span>Saved date key</span><input name="dateTypeSlug" value={current.dateTypeSlug ?? ""} onChange={e => update({ dateTypeSlug: e.target.value })} placeholder={libraryDateKey(current.dateTypeName || "")} maxLength={120} /><small>Leave blank to generate it from the name. An existing key links Mixes to the matching saved date type.</small></label></details></> : <><input type="hidden" name="dateTypeName" value="" /><input type="hidden" name="dateTypeSlug" value="" /></>}
      <label><input type="checkbox" name="featured" checked={current.featured} onChange={e => update({ featured: e.target.checked })} />Feature this Mix when published</label>
    </section>
    <section className="card form-stack"><h2>Prepared Beats ({current.steps.length})</h2>
      {current.steps.map((step, index) => {
        const script = ["PHONE_CALL", "VOICEMAIL"].includes(step.channel);
        const placeholders = [...CONTACT_PLACEHOLDERS.slice(0, 7), ...MY_INFO_PLACEHOLDERS.slice(0, 7), ...(step.channel === "PHONE_CALL" ? [...PRIVATE_NOTE_PLACEHOLDERS.slice(0, 1)] : [])];
        return <details key={index} data-beat={index} className="admin-beat-editor" open={expanded === index} onToggle={event => { if (event.currentTarget.open) setExpanded(index); }}><summary>Beat {index + 1}: {step.name || "Untitled"} · {sharedMixChannelLabel(step.channel)} · day {step.dayOffset}</summary><div className="form-stack">
          <label className="field"><span>Beat name</span><input name="stepName" value={step.name} onChange={e => updateStep(index, { name: e.target.value })} maxLength={160} required /></label>
          <div className="form-grid admin-beat-timing"><label className="field"><span>Channel</span><select name="stepChannel" value={step.channel} onChange={e => updateStep(index, { channel: e.target.value as typeof step.channel })}><option value="SMS">Text</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Call</option><option value="VOICEMAIL">Voicemail</option><option value="WHATSAPP">WhatsApp</option></select></label>
          <label className="field"><span>Days from the start date (negative = before)</span><input name="stepDayOffset" type="number" min={-3650} max={3650} step={1} value={step.dayOffset} onChange={e => updateStep(index, { dayOffset: Number(e.target.value) })} required /></label>
          <label className="field"><span>Send time</span><input type="time" value={step.sendTimeMinutes === null ? "" : `${String(Math.floor(step.sendTimeMinutes / 60)).padStart(2, "0")}:${String(step.sendTimeMinutes % 60).padStart(2, "0")}`} onChange={e => { const [h, m] = e.target.value.split(":").map(Number); updateStep(index, { sendTimeMinutes: e.target.value ? h * 60 + m : null }); }} /><small>Blank: customer’s default</small></label><input name="stepSendTimeMinutes" type="hidden" value={step.sendTimeMinutes ?? ""} /></div>
          {step.channel === "EMAIL" ? <label className="field"><span>Email subject</span><input name="stepSubject" value={step.subject ?? ""} onChange={e => updateStep(index, { subject: e.target.value })} maxLength={300} required /></label> : <input name="stepSubject" type="hidden" value="" />}
          <label className="field"><span>{script ? "Phone or voicemail notes" : "Message"}</span><textarea name={script ? "stepScript" : "stepBody"} value={(script ? step.script : step.body) ?? ""} onChange={e => updateStep(index, { [script ? "script" : "body"]: e.target.value })} maxLength={20_000} rows={4} required /></label><input name={script ? "stepBody" : "stepScript"} type="hidden" value="" />
          <label className="field"><span>Insert placeholder</span><select value="" onChange={e => { const field = script ? "script" : "body"; updateStep(index, { [field]: (step[field] ?? "") + e.target.value }); }}><option value="">Choose a placeholder…</option>{placeholders.map(item => <option key={item}>{item}</option>)}</select></label>
          {step.channel === "SMS" && <label><input type="checkbox" name="stepLongSms" value={index} checked={step.longSms} onChange={e => updateStep(index, { longSms: e.target.checked })} />Allow long text messages</label>}
          {!["PHONE_CALL", "VOICEMAIL"].includes(step.channel) && <label><input type="checkbox" name="stepOptOut" value={index} checked={step.includeOptOut} onChange={e => updateStep(index, { includeOptOut: e.target.checked })} />Include opt-out wording</label>}
          <div className="form-actions"><button className="button small" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move earlier</button><button className="button small" type="button" disabled={index === current.steps.length - 1} onClick={() => move(index, 1)}>Move later</button><button className="button small" type="button" disabled={current.steps.length === 1} onClick={() => void confirm({ title: `Remove Beat ${index + 1}?`, description: "Its wording and timing are removed from this draft.", confirmLabel: "Remove Beat", danger: true }).then(ok => { if (ok) { update({ steps: current.steps.filter((_, position) => position !== index) }); setExpanded(Math.max(0, index - 1)); } })}>Remove Beat</button></div>
        </div></details>;
      })}
      <button className="button" type="button" disabled={current.steps.length >= 50} onClick={() => { update({ steps: [...current.steps, { ...EMPTY_LIBRARY_CONTENT.steps[0] }] }); setExpanded(current.steps.length); }}>Add Beat</button>
    </section>
    </div><section className="card admin-save-bar"><label className="field"><span>Reason for draft change</span><input name="reason" value={reason} onChange={e => draft.set({ ...draft.value, reason: e.target.value })} minLength={10} maxLength={500} required /></label><button className="button primary" type="submit" disabled={pending || conflict}>{pending ? "Saving draft…" : "Save draft for review"}</button></section>
  {confirmDialog}</form>;
}
