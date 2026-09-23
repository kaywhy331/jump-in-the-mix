"use client";
import { useEffect, useState } from "react";

export type WorkflowChoices = Array<{ id: string; name: string; choices: string[] }>;
export function useWorkflowChoices(jumpId?: string) {
  const [result, setResult] = useState<{ jumpId?: string; choices: WorkflowChoices; status: "loading" | "ready" | "error" }>({ choices: [], status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ jumpId, choices: [], status: jumpId ? "loading" : "ready" });
    if (jumpId) fetch(`/api/mix-workflow?jumpId=${encodeURIComponent(jumpId)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unavailable"); const data = await response.json(); if (!Array.isArray(data.decisions)) throw new Error("Unavailable"); return data; })
      .then(data => { if (!controller.signal.aborted) setResult({ jumpId, choices: data.decisions, status: "ready" }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ jumpId, choices: [], status: "error" }); });
    return () => controller.abort();
  }, [jumpId, attempt]);
  return { ...(result.jumpId === jumpId ? result : { choices: [], status: jumpId ? "loading" as const : "ready" as const }), retry: () => setAttempt(value => value + 1) };
}
export function WorkflowChoicesStatus({ status, retry }: Pick<ReturnType<typeof useWorkflowChoices>, "status" | "retry">) {
  if (status === "ready") return null;
  return <span role="status" className="muted-copy">{status === "loading" ? "Checking the next step…" : <>Couldn't check the next step. <button type="button" className="text-button" onClick={retry}>Retry</button></>} You can record this follow-up separately. Any next step needing your input stays in Today.</span>;
}
export function WorkflowOutcomeFields({ choices, values, onChange }: { choices: WorkflowChoices; values: Record<string, string>; onChange: (value: Record<string, string>) => void }) {
  if (!choices.length) return null;
  return <span className="form-grid" aria-label="Journey outcomes">{choices.map(choice => <label className="field full" key={choice.id}><span>{choice.name}</span><select value={values[choice.id] ?? ""} onChange={event => onChange({ ...values, [choice.id]: event.target.value })}><option value="">Decide later — show in Today</option>{choice.choices.map(value => <option value={value} key={value}>{value}</option>)}</select><small>Your configured path will follow this recorded outcome.</small></label>)}</span>;
}
