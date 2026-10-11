import { buildContactMixRows, type ContactMixRow } from "@/lib/contact-mix-row-labels";
import { workflowState } from "@/lib/mix-workflow";
import { PLAN_LIMIT_STOP } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";

/** The reason a stage change gives the stop it writes on the old stage's Mix (src/lib/journey.ts). */
const STAGE_EXIT_STOP = "journey.stage.exit";
const payloadOf = (payload: unknown) => payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};

/**
 * The person's Mixes for the profile's Mixes section (D77): their own starts, the shown tags a Mix runs for,
 * the Mixes they were stopped in, any Mix with a Beat still to come for them, and their open Journey work.
 */
export async function readContactMixRows(workspaceId: string, contact: { id: string; mixAssignments: Array<{ id: string; mixId: string }>; groupIds: string[] }, shownGroupIds: Set<string>): Promise<ContactMixRow[]> {
  const contactId = contact.id;
  const [tagStarts, stops, pending, work, jobs] = await Promise.all([
    contact.groupIds.length ? prisma.mixAssignment.findMany({ where: { workspaceId, isActive: true, groupId: { in: contact.groupIds } }, select: { mixId: true, groupId: true, group: { select: { name: true } } } }) : [],
    prisma.mixStop.findMany({ where: { workspaceId, contactId }, select: { mixId: true, reason: true } }),
    prisma.jump.groupBy({ by: ["mixId"], where: { workspaceId, contactId, status: "PENDING" }, _min: { scheduledAt: true } }),
    prisma.mixWorkflowInstance.findMany({ where: { workspaceId, contactId, status: { in: ["ACTIVE", "PAUSED"] } }, select: { id: true, status: true, state: true } }),
    // Preparation still to run that names this person, alone or among a bulk start's people.
    prisma.job.findMany({ where: { workspaceId, task: "generate-jumps", completedAt: null, failedAt: null, OR: [{ payload: { path: ["contactId"], equals: contactId } }, { payload: { path: ["contactIds"], array_contains: [contactId] } }] }, select: { payload: true } })
  ]);
  const tags = tagStarts.flatMap(start => start.groupId && shownGroupIds.has(start.groupId) && start.group ? [{ mixId: start.mixId, tag: start.group.name }] : []);
  // Journey work counts where it is still going on: a run with Beats to come, or an outcome, check-back date or
  // next step it is waiting on. Otherwise its latest run, so the owner can still reach the work.
  const workRows = work.flatMap(instance => {
    const state = workflowState(instance.state);
    const open = state.runs.filter(run => run.status === "ACTIVE"
      || state.evaluations.some(evaluation => evaluation.runId === run.id && evaluation.status === "WAITING")
      || state.commitments?.some(item => item.runId === run.id && item.status === "OPEN")
      || state.transitions.some(path => (path.status === "WAITING" || path.status === "HELD") && state.evaluations.some(evaluation => evaluation.id === path.evaluationId && evaluation.runId === run.id)));
    const latest = [...state.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    // A run a connection started has the transition that started it; one the owner started has none.
    const runs = (open.length ? open : latest ? [latest] : []).map(run => ({ mixId: run.mixId, viaConnection: run.parentTransitionId !== null }));
    return runs.length ? [{ id: instance.id, paused: instance.status === "PAUSED", runs }] : [];
  });
  const preparing = { mixIds: [] as string[], all: false };
  for (const job of jobs) {
    const payload = payloadOf(job.payload);
    const named = payload.contactId === contactId || (Array.isArray(payload.contactIds) && payload.contactIds.includes(contactId));
    if (!named) continue;
    if (typeof payload.mixId === "string") preparing.mixIds.push(payload.mixId);
    else preparing.all = true;
  }
  const pendingRows = pending.flatMap(item => item._min.scheduledAt ? [{ mixId: item.mixId, at: item._min.scheduledAt }] : []);
  const mixIds = [...new Set([...contact.mixAssignments.map(start => start.mixId), ...tags.map(tag => tag.mixId), ...stops.map(stop => stop.mixId), ...pendingRows.map(item => item.mixId), ...workRows.flatMap(item => item.runs.map(run => run.mixId))])];
  const mixes = mixIds.length ? await prisma.mix.findMany({ where: { workspaceId, id: { in: mixIds }, status: { not: "ARCHIVED" }, source: { not: "ONE_TIME" } }, select: { id: true, name: true, status: true } }) : [];
  return buildContactMixRows({
    mixes,
    starts: contact.mixAssignments.map(start => ({ assignmentId: start.id, mixId: start.mixId })),
    tags,
    stops: stops.map(stop => ({ mixId: stop.mixId, planLimit: stop.reason === PLAN_LIMIT_STOP, stageExit: stop.reason === STAGE_EXIT_STOP })),
    pending: pendingRows,
    preparing,
    work: workRows
  });
}
