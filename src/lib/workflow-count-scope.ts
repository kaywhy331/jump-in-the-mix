import { workflowStatusLabels, type WorkflowStatus } from "@/lib/workflow-analytics";

export function workflowMapScope(megaMixLabel: string, includeArchived: boolean): string {
  return `Map view: ${megaMixLabel} · ${includeArchived ? "archived Mixes included" : "archived Mixes shown only when work remains"}. Map options do not filter the counts or People.`;
}

export function workflowPeopleScope({ nodeLabel, status, stageLabel, query }: { nodeLabel?: string; status: string; stageLabel?: string; query: string }): string {
  const statusLabel = workflowStatusLabels[status as WorkflowStatus] ?? "All statuses";
  return `People list: ${[nodeLabel || "All Mixes", statusLabel, stageLabel || "All contact stages", query.trim() ? `Name contains “${query.trim()}”` : "All names"].join(" · ")}. Archived contacts excluded.`;
}

export const workflowCountScope = "Counts: all nonarchived contacts, including past work. People filters narrow the list only.";
