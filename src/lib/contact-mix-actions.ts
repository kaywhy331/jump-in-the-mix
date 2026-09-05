"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(contactId: string, message: string): never {
  redirect(`/contacts/${encodeURIComponent(contactId)}?error=${encodeURIComponent(message)}`);
}

export async function assignMixToContactAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const contactId = value(formData, "contactId");
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.");
  const [mix, contact] = await Promise.all([
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" }, select: { id: true, triggerMode: true } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } })
  ]);
  if (!mix || !contact) fail(contactId, "Choose an active plan.");

  const assignmentKey = `${workspace.id}:${mix.id}:${contact.id}`;
  await prisma.$transaction(async (tx) => {
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
  redirect(`/contacts/${contact.id}?mixAssigned=1`);
}

export async function removeMixAssignmentAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const assignmentId = value(formData, "assignmentId");
  const contactId = value(formData, "contactId");
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.");
  const assignment = await prisma.mixAssignment.findFirst({
    where: { id: assignmentId, workspaceId: workspace.id, contactId },
    select: { id: true, mixId: true }
  });
  if (!assignment) fail(contactId, "Plan assignment not found.");

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
