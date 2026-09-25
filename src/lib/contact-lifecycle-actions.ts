"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { requireWritableWorkspace } from "@/lib/writable-workspace";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string, viewer: ErrorViewer, path = "/contacts"): never {
  redirect(withViewerError(path, message, viewer));
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace();
  const contactId = value(formData, "contactId");
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId: workspace.id, archivedAt: null },
    select: { id: true, displayName: true }
  });
  if (!contact) fail("Contact not found.", session);

  const archivedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contact.id }, data: { archivedAt } });
    await tx.jump.updateMany({
      where: { contactId: contact.id, workspaceId: workspace.id, status: "PENDING" },
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
  redirect(`/contacts?archived=1&archivedContact=${encodeURIComponent(contact.id)}`);
}

export async function restoreContactAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace();
  const contactId = value(formData, "contactId");
  const returnTo = value(formData, "returnTo");
  // "Undo" on the Contacts list restores in place and an archived person's own page returns to
  // that person; the Archived page keeps its own return.
  const profile = `/contacts/${encodeURIComponent(contactId)}`;
  const path = returnTo === "/contacts" ? "/contacts" : contactId && returnTo === profile ? profile : "/contacts/archived";
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id }, select: { id: true, displayName: true, archivedAt: true } });
  if (!contact) fail("Archived Contact not found.", session, path === profile ? "/contacts/archived" : path);
  // A second tap of Undo or Restore finds the person already back: that is the same success, not an error.
  if (!contact.archivedAt) redirect(`${path}?restored=1`);
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

/**
 * Undo for a bulk archive. Restores the listed people who are still archived, logs each one and
 * queues one reconciliation; a repeated Undo finds nobody left to restore and is the same success.
 */
export async function restoreContactsAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace();
  const contactIds = [...new Set(formData.getAll("contactIds").map(String).filter((id) => id && id.length <= 120))].slice(0, 50);
  if (!contactIds.length) fail("Select at least one Contact.", session);
  const known = await prisma.contact.count({ where: { workspaceId: workspace.id, id: { in: contactIds } } });
  if (!known) fail("Archived Contacts not found.", session);
  await prisma.$transaction(async (tx) => {
    // The row locks make a double tap restore, log and reconcile each person exactly once: the
    // second request waits, then no longer matches "still archived".
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Contact" WHERE "workspaceId" = ${workspace.id} AND id IN (${Prisma.join(contactIds)}) AND "archivedAt" IS NOT NULL ORDER BY id FOR UPDATE`;
    if (!locked.length) return;
    const archived = await tx.contact.findMany({ where: { workspaceId: workspace.id, id: { in: locked.map((row) => row.id) } }, select: { id: true, displayName: true, archivedAt: true } });
    await tx.contact.updateMany({ where: { workspaceId: workspace.id, id: { in: archived.map((contact) => contact.id) } }, data: { archivedAt: null } });
    await tx.auditLog.createMany({
      data: archived.map((contact) => ({
        workspaceId: workspace.id,
        actorType: "USER" as const,
        actorUserId: user.id,
        action: "contact.restore",
        entityType: "Contact",
        entityId: contact.id,
        source: "contacts.bulk",
        metadata: { displayName: contact.displayName, priorArchivedAt: contact.archivedAt?.toISOString(), restoredCount: archived.length }
      }))
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
  });
  redirect(`/contacts?bulkRestored=${known}`);
}
