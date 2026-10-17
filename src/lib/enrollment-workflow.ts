import { Prisma } from "@/generated/prisma/client";
import type { EnrollmentEnded, WorkflowState } from "@/lib/mix-workflow-types";

/**
 * When an enrollment ends (Remove from Mix, or Undo of a bulk start), the Journey record the scheduler keeps for
 * that run ends with it (UNDO-04). Otherwise the Journey pass reads the run's cancelled Beats as held, and Today,
 * the morning email and Journey People ask the owner for input under an internal word, while the record keeps a
 * plan place. Only the run the enrollment started ends: settled Beats stay as history, and work the Journey has
 * already moved on to in another Mix keeps running. What ended is saved on the record, so a later start of the same
 * occurrence, on the same day too, picks the record back up (`reopenEnrollmentRun`).
 */

/** Shown on the record's ended Beats and paths, for example in its work history. */
export const ENROLLMENT_REMOVED_REASON = "Removed from this Mix.";
export const ENROLLMENT_UNDONE_REASON = "Its start was undone.";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "mixWorkflowInstance">;

/** The scheduler's own run: the legacy root run it started for an enrollment, not a path the Journey added. */
const rootRuns = (state: WorkflowState) => (Array.isArray(state.runs) ? state.runs : []).filter(run => run.legacy && !run.parentTransitionId);

/** Whether the owner moved this record on in Journey with a business update, which makes it theirs, not the start's. */
export function workflowTookUpdate(state: WorkflowState): boolean {
  return Boolean(state.updates?.length) || (Array.isArray(state.runs) && state.runs.some(run => !run.parentTransitionId && !run.legacy));
}

/**
 * Ends the enrollment's run in a record's saved state. Returns the status the record should have afterwards, or null
 * when nothing was left to end. The record stops only when nothing else in it is still running or waiting.
 */
export function endEnrollmentRun(state: WorkflowState, status: string, reason: string, at: string): string | null {
  const roots = rootRuns(state);
  if (!roots.length) return null;
  const rootIds = new Set(roots.map(run => run.id));
  const saved: EnrollmentEnded = { at, status, reason, runs: [], visits: [], evaluations: [], transitions: [], pendingChoices: [] };
  for (const run of roots) if (run.status === "ACTIVE") { saved.runs.push({ id: run.id, status: run.status, completedAt: run.completedAt }); run.status = "CANCELED"; }
  const rootVisitIds = new Set<string>();
  for (const visit of state.visits ?? []) {
    if (!rootIds.has(visit.runId)) continue;
    rootVisitIds.add(visit.id);
    if (visit.status === "PENDING" || visit.status === "HELD") { saved.visits.push({ id: visit.id, status: visit.status, reason: visit.reason }); visit.status = "CANCELED"; visit.reason = reason; }
  }
  const rootEvaluationIds = new Set<string>();
  for (const evaluation of state.evaluations ?? []) {
    if (!rootIds.has(evaluation.runId)) continue;
    rootEvaluationIds.add(evaluation.id);
    if (evaluation.status === "WAITING") { saved.evaluations.push({ id: evaluation.id, status: evaluation.status }); evaluation.status = "CANCELED"; }
  }
  for (const path of state.transitions ?? []) {
    if (!rootEvaluationIds.has(path.evaluationId) || (path.status !== "WAITING" && path.status !== "HELD")) continue;
    saved.transitions.push({ id: path.id, status: path.status, reason: path.reason }); path.status = "CANCELED"; path.reason = reason;
  }
  const choices = state.pendingChoices ?? [];
  saved.pendingChoices = choices.filter(choice => rootVisitIds.has(choice.visitId));
  if (saved.pendingChoices.length) state.pendingChoices = choices.filter(choice => !rootVisitIds.has(choice.visitId));
  if (!saved.runs.length && !saved.visits.length && !saved.evaluations.length && !saved.transitions.length && !saved.pendingChoices.length) return null;
  const earlier = state.context?.enrollmentEnded;
  state.context = {
    ...(state.context ?? { timezone: "UTC", appointmentBindingId: null }),
    enrollmentEnded: earlier ? { ...earlier, runs: [...earlier.runs, ...saved.runs], visits: [...earlier.visits, ...saved.visits], evaluations: [...earlier.evaluations, ...saved.evaluations], transitions: [...earlier.transitions, ...saved.transitions], pendingChoices: [...earlier.pendingChoices, ...saved.pendingChoices] } : saved
  };
  const busy = (state.runs ?? []).some(run => run.status === "ACTIVE")
    || (state.evaluations ?? []).some(item => item.status === "WAITING")
    || (state.transitions ?? []).some(item => item.status === "WAITING" || item.status === "HELD" || item.status === "STARTED")
    || Boolean(state.commitments?.some(item => item.status === "OPEN") || state.pendingChoices?.length || state.pendingBusinessUpdate || state.issue);
  return busy ? status : "STOPPED";
}

/**
 * Puts back what `endEnrollmentRun` ended, for a later start of the same occurrence. Its Beats come back as pending,
 * so the scheduler and the Journey pass set their real state again. Returns the status to restore, or null.
 */
export function reopenEnrollmentRun(state: WorkflowState, status: string): string | null {
  const ended = state.context?.enrollmentEnded;
  if (!ended) return null;
  for (const saved of ended.runs) { const run = state.runs.find(item => item.id === saved.id); if (run?.status === "CANCELED") { run.status = saved.status; run.completedAt = saved.completedAt; } }
  for (const saved of ended.visits) { const visit = state.visits.find(item => item.id === saved.id); if (visit?.status === "CANCELED" && visit.reason === ended.reason) { visit.status = "PENDING"; visit.reason = null; } }
  for (const saved of ended.evaluations) { const evaluation = state.evaluations.find(item => item.id === saved.id); if (evaluation?.status === "CANCELED") evaluation.status = saved.status; }
  for (const saved of ended.transitions) { const path = state.transitions.find(item => item.id === saved.id); if (path?.status === "CANCELED" && path.reason === ended.reason) { path.status = saved.status; path.reason = saved.reason; } }
  const pending = state.pendingChoices ?? [];
  const restored = ended.pendingChoices.filter(choice => !pending.some(item => item.requestId === choice.requestId));
  if (restored.length) state.pendingChoices = [...pending, ...restored];
  delete state.context!.enrollmentEnded;
  return status === "STOPPED" ? ended.status : status;
}

/**
 * Locks the Journey records one enrollment's run keeps for a person and Mix: the scheduler's legacy records, keyed by
 * the run's trigger (`state.context.occurrenceKey`, by prefix), including one whose run the owner has since moved on
 * with a business update (see `workflowTookUpdate`). Lock them before touching their Beats, in the order the Journey
 * pass takes its own locks.
 */
export async function lockEnrollmentWorkflows(tx: Tx, input: { workspaceId: string; contactId: string; mixId: string; occurrencePrefixes: string[]; startedBy?: { id: string; updatedAt: string; since: Date } }): Promise<Array<{ id: string; status: string; state: Prisma.JsonValue }>> {
  if (!input.occurrencePrefixes.length) return [];
  return tx.$queryRaw<Array<{ id: string; status: string; state: Prisma.JsonValue }>>`
    SELECT w.id, w.status, w.state FROM "MixWorkflowInstance" w
    WHERE w."workspaceId" = ${input.workspaceId} AND w."contactId" = ${input.contactId} AND w.status IN ('ACTIVE', 'PAUSED') AND starts_with(w."admissionKey", 'legacy:')
      AND jsonb_typeof(w.state -> 'runs') = 'array'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.state -> 'runs') r WHERE r ->> 'mixId' = ${input.mixId} AND jsonb_typeof(r -> 'parentTransitionId') IS DISTINCT FROM 'string')
      AND (${Prisma.join(input.occurrencePrefixes.map(prefix => Prisma.sql`starts_with(w.state -> 'context' ->> 'occurrenceKey', ${prefix})`), " OR ")})
      ${input.startedBy ? Prisma.sql`AND (
        (w.state -> 'context' -> 'enrollment' ->> 'id' = ${input.startedBy.id}
          AND w.state -> 'context' -> 'enrollment' ->> 'updatedAt' = ${input.startedBy.updatedAt})
        OR (w.state -> 'context' -> 'enrollment' IS NULL AND w."createdAt" >= ${input.startedBy.since})
      )` : Prisma.empty}
    ORDER BY w.id FOR UPDATE OF w`;
}

/** Ends the enrollment's run in each locked record and saves it. Call after the run's own Beats are cancelled. */
export async function endLockedEnrollmentWorkflows(tx: Tx, records: Array<{ id: string; status: string; state: Prisma.JsonValue }>, reason: string, now: Date): Promise<number> {
  let ended = 0;
  for (const record of records) {
    const state = structuredClone(record.state) as unknown as WorkflowState;
    const status = endEnrollmentRun(state, record.status, reason, now.toISOString());
    if (!status) continue;
    await tx.mixWorkflowInstance.update({ where: { id: record.id }, data: { status, state: state as unknown as Prisma.InputJsonValue, revision: { increment: 1 }, nextCheckAt: now } });
    ended += 1;
  }
  return ended;
}
