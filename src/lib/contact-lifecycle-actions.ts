"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string, path = "/contacts"): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("View-only support sessions cannot archive Contacts.");
  const contactId = value(formData, "contactId");
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
    select: { id: true, displayName: true }
  });
  if (!contact) fail("Contact not found.");

  const archivedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contact.id }, data: { archivedAt } });
    await tx.jump.updateMany({
      where: { contactId: contact.id, workspaceId: workspace.id, status: { in: ["PENDING", "COPIED"] } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "contact_archived" }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId: contact.id } } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact.archive",
        entityType: "Contact",
        entityId: contact.id,
        source: "contacts.list",
        metadata: { displayName: contact.displayName, archivedAt: archivedAt.toISOString() }
      }
    });
  });
  redirect("/contacts?archived=1");
}

export async function restoreContactAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const path = "/contacts/archived";
  if (impersonation) fail("View-only support sessions cannot restore Contacts.", path);
  const contactId = value(formData, "contactId");
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: { not: null } }, select: { id: true, displayName: true, archivedAt: true } });
  if (!contact) fail("Archived Contact not found.", path);
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contact.id }, data: { archivedAt: null } });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId: contact.id } } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact.restore",
        entityType: "Contact",
        entityId: contact.id,
        source: "contacts.archived",
        metadata: { displayName: contact.displayName, priorArchivedAt: contact.archivedAt?.toISOString() }
      }
    });
  });
  redirect(`${path}?restored=1`);
}
