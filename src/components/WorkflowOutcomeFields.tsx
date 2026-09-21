"use client";
import { useEffect, useState } from "react";

export type WorkflowChoices = Array<{ id: string; name: string; choices: string[] }>;
export function useWorkflowChoices(jumpId?: string) {
  const [choices, setChoices] = useState<WorkflowChoices>([]);
  useEffect(() => {
    const controller = new AbortController(); setChoices([]);
    if (jumpId) fetch(`/api/mix-workflow?jumpId=${encodeURIComponent(jumpId)}`, { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { if (!controller.signal.aborted) setChoices(data?.decisions ?? []); }).catch(() => undefined);
    return () => controller.abort();
  }, [jumpId]);
  return choices;
}
export function WorkflowOutcomeFields({ choices, values, onChange }: { choices: WorkflowChoices; values: Record<string, string>; onChange: (value: Record<string, string>) => void }) {
  if (!choices.length) return null;
  return <span className="form-grid" aria-label="Journey outcomes">{choices.map(choice => <label className="field full" key={choice.id}><span>{choice.name}</span><select value={values[choice.id] ?? ""} onChange={event => onChange({ ...values, [choice.id]: event.target.value })}><option value="">No decision yet — keep waiting</option>{choice.choices.map(value => <option value={value} key={value}>{value}</option>)}</select><small>Your configured path will follow this recorded outcome.</small></label>)}</span>;
}
