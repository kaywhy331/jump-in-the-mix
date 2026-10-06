import type { Prisma } from "@/generated/prisma/client";
import { logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";

export type StartableMix = { id: string; name: string; triggerMode: string; dateTypeId: string | null };

/**
 * Starts one person on a Mix inside the caller's transaction, after the plan and eligibility checks.
 * The chosen day is where the plan starts. A plan that starts from a saved date gets that date when
 * the person has none; one they already have is kept. Returns what the confirmation names. With no
 * user, the start is recorded as the system's, for a placement the owner set up in advance.
 */
export async function startMixForContact(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string | null; contactId: string; mix: StartableMix; start: LogicalDate; timezone: string; source: string }): Promise<string> {
  const { workspaceId, contactId, mix, start, timezone } = input;
  await assertMixStartEligible(tx, workspaceId, contactId, mix.id);
  const assignmentKey = `${workspaceId}:${mix.id}:${contactId}`;
  const startAt = zonedDateTimeToUtc(start, 12 * 60, timezone);
  let startedOn: string = logicalDateKey(start);
  const previous = await tx.mixAssignment.findUnique({ where: { assignmentKey }, select: { isActive: true } });
  // A finished or removed plan restarts from the chosen day; one still running keeps its start.
  const restart = !previous || !previous.isActive || !(await tx.jump.count({ where: { workspaceId, contactId, mixId: mix.id, status: "PENDING" } }));
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
  if (mix.triggerMode === "DATE_TRIGGERED" && mix.dateTypeId) {
    const saved = await tx.jumpDate.findFirst({ where: { workspaceId, contactId, dateTypeId: mix.dateTypeId, isActive: true }, select: { id: true } });
    if (saved) {
      startedOn = "saved";
    } else {
      await tx.jumpDate.create({ data: {
        workspaceId, contactId, dateTypeId: mix.dateTypeId,
        dateValue: new Date(Date.UTC(start.year, start.month - 1, start.day, 12)), month: start.month, day: start.day,
        recurrence: "NONE", timezone, label: mix.name
      } });
    }
  }
  await tx.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId, mixId: mix.id } } });
  await tx.auditLog.create({
    data: {
      workspaceId,
      actorType: input.userId ? "USER" : "SYSTEM",
      actorUserId: input.userId,
      action: "mix.assignment.activate",
      entityType: "MixAssignment",
      entityId: assignment.id,
      source: input.source,
      metadata: { contactId, mixId: mix.id, startedOn }
    }
  });
  return startedOn;
}
