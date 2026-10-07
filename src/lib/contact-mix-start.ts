import type { AssignmentMode, Prisma } from "@/generated/prisma/client";
import type { MixStartResult } from "@/lib/contact-mix-status-labels";
import { logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { setStagesFromMixStarts, type StageSet } from "@/lib/mix-stage";

/** `steps` holds the Mix's active Beats timed from an appointment (at most one is needed). */
export type StartableMix = { id: string; name: string; triggerMode: string; dateTypeId: string | null; steps: { id: string }[] };
/** The Beats that tell whether a Mix waits for a visit: active ones timed from an appointment. */
export const visitTimedBeats = { where: { isActive: true, anchor: { not: "CALENDAR_DAY" as const } }, select: { id: true }, take: 1 };

/** What one start did, for the confirmation (JITM-04 §2.7). */
export type MixStartOutcome = {
  /** started, already running (keeps its start), saved date kept, or date written. */
  result: MixStartResult;
  /** The day the confirmation names (YYYY-MM-DD): the chosen day, or the start a running Mix keeps; "saved" when it follows the person's saved date. */
  startedOn: string;
  /** Whether any of the Mix's Beats is timed from an appointment, so it waits until the person is lined up with a visit. */
  waitsForVisit: boolean;
  /** The assignment as this start left it, and the saved date it wrote, if any: a bulk Undo ends only what nothing changed since (D46). */
  assignment: { id: string; updatedAt: Date };
  writtenDate: { id: string; updatedAt: Date } | null;
  /** The assignment as it was before this start, or null when the start created it; Undo puts it back (UNDO-02). */
  previous: { isActive: boolean; startDate: Date | null; mode: AssignmentMode } | null;
  /** The Contact stage the start set, when the Mix names one (JITM-09 §2.79); Undo puts the earlier one back. */
  stage: StageSet | null;
};

/**
 * Starts one person on a Mix inside the caller's transaction, after the plan and eligibility checks.
 * The chosen day is where the plan starts. A plan that starts from a saved date gets that date when
 * the person has none; one they already have is kept. A Mix that names a Contact stage sets it.
 * Returns what the confirmation names. With no user, the start is recorded as the system's, for a
 * placement the owner set up in advance.
 */
export async function startMixForContact(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string | null; contactId: string; mix: StartableMix; start: LogicalDate; timezone: string; source: string; queuePreparation?: boolean }): Promise<MixStartOutcome> {
  const { workspaceId, contactId, mix, start, timezone } = input;
  await assertMixStartEligible(tx, workspaceId, contactId, mix.id);
  const assignmentKey = `${workspaceId}:${mix.id}:${contactId}`;
  const startAt = zonedDateTimeToUtc(start, 12 * 60, timezone);
  let startedOn: string = logicalDateKey(start);
  const previous = await tx.mixAssignment.findUnique({ where: { assignmentKey }, select: { isActive: true, startDate: true, mode: true } });
  // A finished or removed plan restarts from the chosen day; one still running keeps its start.
  const restart = !previous || !previous.isActive || !(await tx.jump.count({ where: { workspaceId, contactId, mixId: mix.id, status: "PENDING" } }));
  let result: MixStartResult = restart ? "started" : "already-running";
  const assignment = await tx.mixAssignment.upsert({
    where: { assignmentKey },
    create: {
      assignmentKey,
      workspaceId,
      mixId: mix.id,
      contactId,
      startDate: mix.triggerMode === "MANUAL_START" ? startAt : null,
      isActive: true
    },
    update: { isActive: true, ...(mix.triggerMode === "MANUAL_START" && restart ? { startDate: startAt } : {}) }
  });
  if (mix.triggerMode === "MANUAL_START" && !restart && previous) {
    const current = await tx.mixAssignment.findUnique({ where: { assignmentKey }, select: { startDate: true } });
    if (current?.startDate) startedOn = logicalDateKey(logicalDateInTimezone(current.startDate, timezone));
  }
  let writtenDate: MixStartOutcome["writtenDate"] = null;
  if (mix.triggerMode === "DATE_TRIGGERED" && mix.dateTypeId) {
    const saved = await tx.jumpDate.findFirst({ where: { workspaceId, contactId, dateTypeId: mix.dateTypeId, isActive: true }, select: { id: true } });
    if (saved) {
      startedOn = "saved";
      if (restart) result = "saved-date-kept";
    } else {
      writtenDate = await tx.jumpDate.create({ select: { id: true, updatedAt: true }, data: {
        workspaceId, contactId, dateTypeId: mix.dateTypeId,
        dateValue: new Date(Date.UTC(start.year, start.month - 1, start.day, 12)), month: start.month, day: start.day,
        recurrence: "NONE", timezone, label: mix.name
      } });
      if (restart) result = "date-written";
    }
  }
  // A Mix that names a stage sets it when it starts; one already running keeps the stage as it is.
  const [stage = null] = result === "already-running" ? [] : await setStagesFromMixStarts(tx, { workspaceId, starts: [{ contactId, mixId: mix.id }], actorUserId: input.userId });
  // A bulk start queues one job for all of its people instead (PERF-01).
  if (input.queuePreparation !== false) await tx.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId, mixId: mix.id } } });
  await tx.auditLog.create({
    data: {
      workspaceId,
      actorType: input.userId ? "USER" : "SYSTEM",
      actorUserId: input.userId,
      action: "mix.assignment.activate",
      entityType: "MixAssignment",
      entityId: assignment.id,
      source: input.source,
      metadata: { contactId, mixId: mix.id, startedOn, result }
    }
  });
  return { result, startedOn, waitsForVisit: mix.steps.length > 0, assignment: { id: assignment.id, updatedAt: assignment.updatedAt }, writtenDate, previous, stage };
}
