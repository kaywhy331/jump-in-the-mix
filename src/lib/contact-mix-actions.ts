"use server";

import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(contactId: string, message: string, viewer: ErrorViewer): never {
  redirect(withViewerError(`/contacts/${encodeURIComponent(contactId)}`, message, viewer));
}

export async function assignMixToContactAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const contactId = value(formData, "contactId");
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.", session);
  const [mix, contact] = await Promise.all([
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" }, select: { id: true, triggerMode: true, steps: { where: { isActive: true, anchor: { not: "CALENDAR_DAY" } }, select: { id: true }, take: 1 } } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } })
  ]);
  if (!mix || !contact) fail(contactId, "Choose an active mix.", session);

  const assignmentKey = `${workspace.id}:${mix.id}:${contact.id}`;
  try { await prisma.$transaction(async (tx) => {
    await assertMixStartEligible(tx, workspace.id, contact.id, mix.id);
    const assignment = await tx.mixAssignment.upsert({
      where: { assignmentKey },
      create: {
        assignmentKey,
        workspaceId: workspace.id,
        mixId: mix.id,
        contactId: contact.id,
        startDate: mix.triggerMode === "MANUAL_START" ? new Date() : null,
        isActive: true
      },
      update: { isActive: true }
    });
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
        metadata: { contactId: contact.id, mixId: mix.id }
      }
    });
  });
  } catch (error) { fail(contactId, error instanceof UserFacingError ? error.message : "This Mix could not be started.", session); }
  // Beats timed from an appointment have nothing to count from here; the confirmation says so
  // rather than presenting them as scheduled. The visit is chosen explicitly on the calendar.
  redirect(`/contacts/${contact.id}?mixAssigned=${mix.steps.length ? "visit" : "1"}`);
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
