import type { WorkflowRule } from "@/lib/mix-workflow-types";

export class WorkflowSaveError extends Error {
  constructor(message: string, public readonly code?: string, public readonly currentRule?: WorkflowRule | null) {
    super(message);
  }
}

export async function saveWorkflowChange(input: unknown) {
  let response: Response;
  try {
    response = await fetch("/api/mix-workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  } catch {
    throw new WorkflowSaveError("We couldn’t confirm the save. Your draft is still here. Check your connection and try saving again.");
  }
  const data = await response.json().catch(() => null);
  if (!data) throw new WorkflowSaveError("We couldn’t confirm the save. Your draft is still here. Try saving again.");
  if (!response.ok) throw new WorkflowSaveError(data.error ?? "The change could not be saved. Your draft is still here.", data.code, data.currentRule);
  window.dispatchEvent(new CustomEvent("jitm:workflow-updated"));
  return data;
}
