import { personalMixStartsWhere } from "@/lib/contact-mix-rows";
import { workflowDefinition, workflowState } from "@/lib/mix-workflow";
import type { WorkflowTarget, WorkflowTransition } from "@/lib/mix-workflow-types";
import { prisma } from "@/lib/prisma";

export type JourneyPersonFocus = {
  contactId: string;
  personMixIds: string[];
  activeMixIds: string[];
  paths: Array<{ instanceId: string; id: string; source: WorkflowTarget; target: WorkflowTarget; status: WorkflowTransition["status"] }>;
};

/** D121 membership and recorded paths, independent of the paginated work cards. */
export async function readJourneyPersonFocus(workspaceId: string, contactId?: string): Promise<JourneyPersonFocus | null> {
  if (!contactId || !await prisma.contact.findFirst({ where: { workspaceId, id: contactId }, select: { id: true } })) return null;
  const starts = await prisma.mixAssignment.findMany({ where: personalMixStartsWhere(workspaceId, contactId), select: { mixId: true } });
  const mixIds = new Set(starts.map(start => start.mixId)), activeMixIds = new Set<string>();
  const paths: JourneyPersonFocus["paths"] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.mixWorkflowInstance.findMany({
      where: { workspaceId, contactId }, orderBy: { id: "asc" }, take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, state: true, definition: true },
    });
    for (const work of page) {
      const state = workflowState(work.state), saved = workflowDefinition(work.definition);
      for (const run of state.runs) if (run.status !== "CANCELED") {
        mixIds.add(run.mixId);
        if (run.status === "ACTIVE") activeMixIds.add(run.mixId);
      }
      for (const path of state.transitions) {
        if (path.status === "CANCELED" || !path.target) continue;
        const evaluation = state.evaluations.find(item => item.id === path.evaluationId);
        const rule = saved.rules.find(item => item.id === evaluation?.ruleId);
        if (!rule || evaluation?.status === "CANCELED") continue;
        if (path.routeId === `${rule.id}:join`) {
          // A joined fork only marks branches that actually finished in this evaluation.
          for (const branch of state.transitions.filter(item => item.evaluationId === path.evaluationId && item.generation === path.generation && item.status === "FINISHED" && item.target && rule.routes.some(route => route.id === item.routeId))) {
            paths.push({ instanceId: work.id, id: `${rule.id}:join:${branch.routeId}`, source: { mixId: branch.target!.mixId, stepId: null }, target: path.target, status: path.status });
          }
        } else if (rule.routes.some(route => route.id === path.routeId)) {
          paths.push({ instanceId: work.id, id: path.routeId, source: rule.source, target: path.target, status: path.status });
        }
      }
    }
    if (page.length < 250) break;
    cursor = page.at(-1)!.id;
  }
  return { contactId, personMixIds: [...mixIds], activeMixIds: [...activeMixIds], paths };
}
