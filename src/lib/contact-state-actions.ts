"use server";

import { redirect } from "next/navigation";
import type { Channel, ContactPriority } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maximum = 20_000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function fail(contactId: string, message: string): never {
  redirect(`/contacts/${contactId}?error=${encodeURIComponent(message)}`);
}

export async function updateContactBasicsInlineAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const contactId = value(formData, "contactId", 120);
  if (impersonation) fail(contactId, "View-only support sessions cannot change Contact details.");
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, include: { emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } });
  if (!contact) fail(contactId, "Contact not found.");
  const company = value(formData, "company", 240) || null;
  const publicNotes = value(formData, "publicNotes", 20_000) || null;
  const email = value(formData, "primaryEmail", 254);
  const phone = value(formData, "primaryPhone", 80);
  if (email && !isValidEmail(email)) fail(contactId, "Enter a valid primary email address.");
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  if (phone && !normalizedPhone) fail(contactId, "Enter a valid primary phone number.");
  const normalizedEmail = email ? normalizeEmail(email) : null;
  if (normalizedEmail) {
    const conflict = await prisma.contactEmail.findFirst({ where: { normalized: normalizedEmail, contactId: { not: contactId }, contact: { workspaceId: workspace.id, archivedAt: null } }, select: { contact: { select: { displayName: true } } } });
    if (conflict) fail(contactId, `That email already belongs to ${conflict.contact.displayName}. Use the duplicate center if these are the same person.`);
  }
  if (normalizedPhone) {
    const conflict = await prisma.contactPhone.findFirst({ where: { normalized: normalizedPhone, contactId: { not: contactId }, contact: { workspaceId: workspace.id, archivedAt: null } }, select: { contact: { select: { displayName: true } } } });
    if (conflict) fail(contactId, `That phone already belongs to ${conflict.contact.displayName}. Use the duplicate center if these are the same person.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contactId }, data: { company, publicNotes } });
    if (email) {
      await tx.contactEmail.updateMany({ where: { contactId }, data: { isPrimary: false } });
      const existing = contact.emails.find((item) => item.normalized === normalizedEmail);
      if (existing) await tx.contactEmail.update({ where: { id: existing.id }, data: { email, normalized: normalizedEmail!, isPrimary: true } });
      else await tx.contactEmail.create({ data: { contactId, email, normalized: normalizedEmail!, label: "Primary", isPrimary: true } });
    }
    if (phone) {
      await tx.contactPhone.updateMany({ where: { contactId }, data: { isPrimary: false } });
      const existing = contact.phones.find((item) => item.normalized === normalizedPhone);
      if (existing) await tx.contactPhone.update({ where: { id: existing.id }, data: { phone, normalized: normalizedPhone!, isPrimary: true } });
      else await tx.contactPhone.create({ data: { contactId, phone, normalized: normalizedPhone!, label: "Primary", isPrimary: true } });
    }
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "contact.inline-update", entityType: "Contact", entityId: contactId, source: "contacts.detail", metadata: { companyChanged: company !== contact.company, customerNotesChanged: publicNotes !== contact.publicNotes, emailChanged: Boolean(email), phoneChanged: Boolean(phone) } } });
  });
  redirect(`/contacts/${contactId}?inlineUpdated=1`);
}

export async function updateContactRelationshipStateAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const contactId = value(formData, "contactId", 120);
  if (impersonation) fail(contactId, "View-only support sessions cannot change relationship details.");
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } });
  if (!contact) fail(contactId, "Contact not found.");
  const submittedVersion = Number.parseInt(value(formData, "version", 20) || "0", 10);
  const preferredRaw = value(formData, "preferredChannel", 40);
  const preferredChannel = preferredRaw && ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"].includes(preferredRaw) ? preferredRaw as Channel : null;
  const priorityRaw = value(formData, "priority", 40);
  const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priorityRaw) ? priorityRaw as ContactPriority : "NORMAL";
  const relationshipStatus = value(formData, "relationshipStatus", 160) || null;
  const nextCommitmentRaw = value(formData, "nextCommitmentAt", 40);
  const nextCommitmentAt = nextCommitmentRaw ? new Date(nextCommitmentRaw) : null;
  if (nextCommitmentRaw && (!nextCommitmentAt || Number.isNaN(nextCommitmentAt.getTime()))) fail(contactId, "Choose a valid next commitment date and time.");
  const existing = await prisma.contactRelationshipState.findUnique({ where: { contactId } });
  if (existing && submittedVersion !== existing.version) fail(contactId, "This relationship state changed in another tab. Reload before saving again.");
  const doNotContact = formData.get("doNotContact") === "on";
  await prisma.$transaction(async (tx) => {
    if (existing) {
      const updated = await tx.contactRelationshipState.updateMany({ where: { id: existing.id, version: submittedVersion }, data: { preferredChannel, priority, doNotContact, relationshipStatus, nextCommitmentAt, version: { increment: 1 } } });
      if (updated.count !== 1) throw new Error("This relationship state changed in another session.");
    } else {
      await tx.contactRelationshipState.create({ data: { workspaceId: workspace.id, contactId, preferredChannel, priority, doNotContact, relationshipStatus, nextCommitmentAt } });
    }
    if (doNotContact) await tx.jump.updateMany({ where: { workspaceId: workspace.id, contactId, status: "PENDING" }, data: { status: "CANCELED", completionMethod: "do_not_contact", completedAt: null } });
    else await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId } } });
    await tx.contactActivity.create({ data: { workspaceId: workspace.id, contactId, actorUserId: user.id, kind: "SYSTEM", visibility: "WORKSPACE", summary: doNotContact ? "Contact marked do not contact." : `Relationship state updated to ${priority.toLowerCase()} priority${relationshipStatus ? ` · ${relationshipStatus}` : ""}.`, nextCommitmentAt, metadata: { preferredChannel, priority, doNotContact } } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "contact.relationship-state.update", entityType: "ContactRelationshipState", entityId: contactId, source: "contacts.detail", beforeData: existing ? { preferredChannel: existing.preferredChannel, priority: existing.priority, doNotContact: existing.doNotContact, relationshipStatus: existing.relationshipStatus, nextCommitmentAt: existing.nextCommitmentAt } : undefined, afterData: { preferredChannel, priority, doNotContact, relationshipStatus, nextCommitmentAt } } });
  });
  redirect(`/contacts/${contactId}?stateUpdated=1`);
}
