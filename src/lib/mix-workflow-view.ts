import { readWorkflowAnalytics } from "@/lib/mix-workflow-analytics";
import type { WorkflowAnalytics } from "@/lib/workflow-analytics";
import { prisma } from "@/lib/prisma";
import { readWorkflowDefinition, workflowDefinition, workflowState } from "@/lib/mix-workflow";
import { workflowNodeKey, type WorkflowConfiguration, type WorkflowMix, type WorkflowState } from "@/lib/mix-workflow-types";

export type WorkflowGraphMix = Pick<WorkflowMix, "id" | "name" | "status" | "source" | "triggerMode"> & { steps: Array<Pick<WorkflowMix["steps"][number], "id" | "name" | "dayOffset" | "anchor" | "channel">>; pending: number; completed: number };
export type WorkflowInstanceView = {
  id: string; contactId: string; contactName: string; label: string; status: string; revision: number; definitionRevision: number; updatedAt: string;
  state: WorkflowState;
  appointments: Array<{ id: string; title: string; startsAt: string }>;
  decisions: Array<{ id: string; name: string; outcome: string | null; status: string; choices: Array<{ value: string; label: string }> }>;
  beats: Array<{ visitId: string; jumpId: string | null; mixName: string; name: string; status: string; scheduledAt: string | null }>;
};
export type WorkflowGraphView = {
  analytics: WorkflowAnalytics;
  revision: number; historical: boolean; configuration: WorkflowConfiguration; mixes: WorkflowGraphMix[]; canEdit: boolean;
  metrics: Record<string, { started: number; eligible: number; waiting: number; held: number; canceled: number; selected: number; decisions: number; undecided: number }>;
  instances: WorkflowInstanceView[]; instanceTotal: number; people: Array<{ id: string; displayName: string }>;
  issues: Array<{ node: string; message: string }>; updatedAt: string;
};

export async function readWorkflowGraph(workspaceId: string, options: { contactId?: string; query?: string; offset?: number; canEdit: boolean; instanceId?: string; node?: string; status?: string; stage?: string; peopleOffset?: number; days?: number; focusedInstance?: string }): Promise<WorkflowGraphView> {
  const snapshot = options.instanceId ? await prisma.mixWorkflowInstance.findFirst({ where: { id: options.instanceId, workspaceId }, select: { definition: true } }) : null;
  if (options.instanceId && !snapshot) throw new Error("That journey instance is unavailable.");
  const definition = snapshot ? workflowDefinition(snapshot.definition) : await readWorkflowDefinition(prisma, workspaceId);
  const where = { workspaceId, ...(options.contactId ? { contactId: options.contactId } : {}) };
  const [counts, instances, instanceTotal, people, analytics] = await Promise.all([
    prisma.jump.groupBy({ by: ["mixId", "status"], where, _count: true }),
    prisma.mixWorkflowInstance.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: options.offset ?? 0, take: 50, include: { contact: { select: { displayName: true } }, jumps: { select: { id: true, workflowVisitId: true, scheduledAt: true, status: true } } } }),
    prisma.mixWorkflowInstance.count({ where }),
    prisma.contact.findMany({ where: { workspaceId, archivedAt: null, ...(options.query ? { displayName: { contains: options.query, mode: "insensitive" as const } } : {}) }, select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 50 }),
    // Selecting work changes the map focus and details, while the directory stays browsable.
    readWorkflowAnalytics(workspaceId, { node: options.node, status: options.status, stage: options.stage, query: options.query, offset: options.peopleOffset })
  ]);
  if (options.focusedInstance && !instances.some(instance => instance.id === options.focusedInstance)) {
    const focused = await prisma.mixWorkflowInstance.findFirst({ where: { ...where, id: options.focusedInstance }, include: { contact: { select: { displayName: true } }, jumps: { select: { id: true, workflowVisitId: true, scheduledAt: true, status: true } } } });
    if (focused) instances.unshift(focused);
  }
  if (options.contactId && !people.some(person => person.id === options.contactId)) {
    const selected = await prisma.contact.findFirst({ where: { id: options.contactId, workspaceId, archivedAt: null }, select: { id: true, displayName: true } });
    if (selected) people.unshift(selected);
  }
  const appointments = await prisma.calendarEntry.findMany({ where: { workspaceId, contactId: { in: [...new Set(instances.map(instance => instance.contactId))] }, canceledAt: null }, orderBy: { startsAt: "desc" }, take: 1000, select: { id: true, contactId: true, title: true, startsAt: true } });
  const metrics: WorkflowGraphView["metrics"] = {};
  // All instances in the declared cohort, in bounded pages; never infer a rate from a roster page.
  let cursor: string | undefined;
  const since = new Date(Date.now() - ([7, 30, 90].includes(options.days ?? 30) ? options.days ?? 30 : 30) * 86400_000);
  for (;;) {
    const page = await prisma.mixWorkflowInstance.findMany({ where: { ...where, createdAt: { gte: since }, definition: { path: ["revision"], equals: definition.revision } }, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 250, select: { id: true, state: true } });
    for (const instance of page) {
      for (const path of workflowState(instance.state).transitions) {
        const metric = metrics[path.routeId] ??= { started: 0, eligible: 0, waiting: 0, held: 0, canceled: 0, selected: 0, decisions: 0, undecided: 0 };
        if (path.status === "CANCELED") { metric.canceled++; continue; }
        if (Date.parse(path.dueAt) > Date.now()) { metric.waiting++; continue; }
        metric.eligible++;
        if (path.startedAt) metric.started++;
        if (path.status === "HELD") metric.held++;
        else if (!path.startedAt) metric.waiting++;
      }
      const state = workflowState(instance.state);
      for (const evaluation of state.evaluations.filter(item => item.status !== "CANCELED")) {
        const rule = definition.rules.find(item => item.id === evaluation.ruleId);
        for (const route of rule?.routes ?? []) {
          const metric = metrics[route.id] ??= { started: 0, eligible: 0, waiting: 0, held: 0, canceled: 0, selected: 0, decisions: 0, undecided: 0 };
          if (evaluation.status === "WAITING") { metric.undecided++; continue; }
          metric.decisions++;
          if (state.transitions.some(path => path.evaluationId === evaluation.id && path.generation === evaluation.generation && path.routeId === route.id && path.status !== "CANCELED")) metric.selected++;
        }
      }
    }
    if (page.length < 250) break;
    cursor = page.at(-1)!.id;
  }
  const issues: WorkflowGraphView["issues"] = [];
  for (const mix of definition.mixes.filter(item => item.status !== "ARCHIVED")) {
    if (!mix.steps.length) issues.push({ node: `mix:${mix.id}`, message: `${mix.name} has no Beats.` });
    if (!definition.intentionalEnds.includes(`mix:${mix.id}`) && !definition.rules.some(rule => rule.enabled && (rule.source.mixId === mix.id || (rule.join && rule.routes.some(route => route.target?.mixId === mix.id))))) issues.push({ node: `mix:${mix.id}`, message: `${mix.name}: no next connection. Mark an intentional finish or connect what follows.` });
    for (const step of mix.steps.filter(item => definition.gatedStepIds.includes(item.id))) if (!definition.rules.some(rule => rule.routes.some(route => route.target?.stepId === step.id) || rule.join?.target.stepId === step.id)) issues.push({ node: `beat:${step.id}`, message: `${step.name} waits for a connection that has not been configured.` });
  }
  for (const rule of definition.rules) for (const route of rule.routes) if (route.target && !definition.mixes.some(mix => mix.id === route.target!.mixId && mix.status === "ACTIVE")) issues.push({ node: workflowNodeKey(rule.source), message: `${route.label}: its destination is not active.` });
  return {
    revision: definition.revision, historical: Boolean(snapshot), configuration: { rules: definition.rules, gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds }, canEdit: options.canEdit,
    mixes: definition.mixes.map(mix => ({ id: mix.id, name: mix.name, status: mix.status, source: mix.source, triggerMode: mix.triggerMode,
      steps: mix.steps.map(({ id, name, dayOffset, anchor, channel }) => ({ id, name, dayOffset, anchor, channel })),
      pending: counts.find(item => item.mixId === mix.id && item.status === "PENDING")?._count ?? 0,
      completed: counts.find(item => item.mixId === mix.id && item.status === "DONE")?._count ?? 0 })),
    analytics, metrics, instanceTotal, people, issues, updatedAt: new Date().toISOString(),
    instances: instances.map(instance => {
      const saved = workflowDefinition(instance.definition), state = workflowState(instance.state);
      return { id: instance.id, contactId: instance.contactId, contactName: instance.contact.displayName, label: instance.label, status: instance.status, revision: instance.revision, definitionRevision: saved.revision, appointments: appointments.filter(entry => entry.contactId === instance.contactId).slice(0, 30).map(entry => ({ id: entry.id, title: entry.title, startsAt: entry.startsAt.toISOString() })), state: { ...state, commands: [], context: undefined }, updatedAt: instance.updatedAt.toISOString(),
        decisions: state.evaluations.filter(evaluation => evaluation.status !== "CANCELED").flatMap(evaluation => {
          const rule = saved.rules.find(rule => rule.id === evaluation.ruleId);
          const choices = [...new Map(rule?.routes.filter(route => route.when === "OUTCOME").map(route => [route.outcome, { value: route.outcome, label: route.outcome }])).values()];
          return rule && choices.length ? [{ id: evaluation.id, name: rule.name, outcome: evaluation.outcome, status: evaluation.status, choices }] : [];
        }),
        beats: state.visits.map(visit => { const run = state.runs.find(run => run.id === visit.runId), mix = saved.mixes.find(mix => mix.id === run?.mixId), jump = instance.jumps.find(jump => jump.workflowVisitId === visit.id);
          return { visitId: visit.id, jumpId: jump?.id ?? null, mixName: mix?.name ?? "Previous Mix", name: mix?.steps.find(step => step.id === visit.stepId)?.name ?? "Previous Beat", status: visit.status, scheduledAt: jump?.scheduledAt.toISOString() ?? null }; }) };
    })
  };
}
