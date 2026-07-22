"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string, path = "/contacts"): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("Administrator support sessions are view-only.");
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
  if (impersonation) fail("Administrator support sessions are view-only.", path);
  const contactId = value(formData, "contactId");
  const [contact, activeCount] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: { not: null } }, select: { id: true, displayName: true, archivedAt: true } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } })
  ]);
  if (!contact) fail("Archived Contact not found.", path);
  const limit = PLAN_LIMITS[workspace.planTier].contacts;
  if (Number.isFinite(limit) && activeCount >= limit) fail(`Your ${workspace.planTier.toLowerCase()} plan allows ${limit.toLocaleString()} active Contacts. Archive another Contact or upgrade before restoring this one.`, path);
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
