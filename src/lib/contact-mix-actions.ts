"use server";

import { assertRoomForPeople } from "@/lib/plan-limits";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { timezoneForUser } from "@/lib/display-preferences";
import { logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(contactId: string, message: string, viewer: ErrorViewer): never {
  redirect(withViewerError(`/contacts/${encodeURIComponent(contactId)}`, message, viewer));
}

function startLogicalDate(raw: string, timezone: string): LogicalDate | null {
  const today = logicalDateInTimezone(new Date(), timezone);
  if (!raw) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return logicalDateKey({ year, month, day }) < logicalDateKey(today) ? null : { year, month, day };
}

export async function assignMixToContactAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const contactId = value(formData, "contactId");
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.", session);
  const timezone = await timezoneForUser(user.id);
  const start = startLogicalDate(value(formData, "startDate"), timezone);
  if (!start) fail(contactId, "Choose a start date from today on.", session);
  const [mix, contact] = await Promise.all([
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" }, select: { id: true, name: true, triggerMode: true, dateTypeId: true, steps: { where: { isActive: true, anchor: { not: "CALENDAR_DAY" } }, select: { id: true }, take: 1 } } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } })
  ]);
  if (!mix || !contact) fail(contactId, "Choose an active Mix.", session);

  const assignmentKey = `${workspace.id}:${mix.id}:${contact.id}`;
  // The chosen day is where the plan starts. A plan that starts from a saved date gets that date when
  // the person has none; one they already have is kept and named in the confirmation.
  const startAt = zonedDateTimeToUtc(start, 12 * 60, timezone);
  let startedOn: string = logicalDateKey(start);
  try { await prisma.$transaction(async (tx) => {
    await assertRoomForPeople(tx, workspace.id, [contact.id]);
    await assertMixStartEligible(tx, workspace.id, contact.id, mix.id);
    const previous = await tx.mixAssignment.findUnique({ where: { assignmentKey }, select: { isActive: true } });
    // A finished or removed plan restarts from the chosen day; one still running keeps its start.
    const restart = !previous || !previous.isActive || !(await tx.jump.count({ where: { workspaceId: workspace.id, contactId: contact.id, mixId: mix.id, status: "PENDING" } }));
    const assignment = await tx.mixAssignment.upsert({
      where: { assignmentKey },
      create: {
        assignmentKey,
        workspaceId: workspace.id,
        mixId: mix.id,
        contactId: contact.id,
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
      const saved = await tx.jumpDate.findFirst({ where: { workspaceId: workspace.id, contactId: contact.id, dateTypeId: mix.dateTypeId, isActive: true }, select: { id: true } });
      if (saved) {
        startedOn = "saved";
      } else {
        await tx.jumpDate.create({ data: {
          workspaceId: workspace.id, contactId: contact.id, dateTypeId: mix.dateTypeId,
          dateValue: new Date(Date.UTC(start.year, start.month - 1, start.day, 12)), month: start.month, day: start.day,
          recurrence: "NONE", timezone, label: mix.name
        } });
      }
    }
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId: contact.id, mixId: mix.id } } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.assignment.activate",
        entityType: "MixAssignment",
        entityId: assignment.id,
        source: "contacts.detail",
        metadata: { contactId: contact.id, mixId: mix.id, startedOn }
      }
    });
  });
  } catch (error) { fail(contactId, error instanceof UserFacingError ? error.message : "This Mix could not be started.", session); }
  // Beats timed from an appointment have nothing to count from here; the confirmation says so
  // rather than presenting them as scheduled. The visit is chosen explicitly on the calendar.
  redirect(`/contacts/${contact.id}?${new URLSearchParams({ mixAssigned: mix.steps.length ? "visit" : "1", mixStart: startedOn })}`);
}

export async function removeMixAssignmentAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const assignmentId = value(formData, "assignmentId");
  const contactId = value(formData, "contactId");
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.", session);
  const assignment = await prisma.mixAssignment.findFirst({
    where: { id: assignmentId, workspaceId: workspace.id, contactId },
    select: { id: true, mixId: true }
  });
  if (!assignment) fail(contactId, "Mix assignment not found.", session);

  await prisma.$transaction([
    prisma.mixAssignment.update({ where: { id: assignment.id }, data: { isActive: false } }),
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId, mixId: assignment.mixId } } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.assignment.deactivate",
        entityType: "MixAssignment",
        entityId: assignment.id,
        source: "contacts.detail",
        metadata: { contactId, mixId: assignment.mixId }
      }
    })
  ]);
  redirect(`/contacts/${contactId}?mixRemoved=1`);
}
