"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function fail(message: string): never {
  redirect(`/contacts/duplicates?error=${encodeURIComponent(message)}`);
}

function appendNote(current: string | null, incoming: string | null, sourceName: string): string | null {
  const value = incoming?.trim();
  if (!value || current?.includes(value)) return current;
  const block = `[Merged from ${sourceName} ${new Date().toISOString().slice(0, 10)}]\n${value}`;
  return [current?.trim(), block].filter(Boolean).join("\n\n").slice(0, 20_000) || null;
}

function addressKey(address: { street1: string | null; street2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }): string {
  return [address.street1, address.street2, address.city, address.state, address.postalCode, address.country]
    .map((part) => (part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

function sourceSnapshot(source: Awaited<ReturnType<typeof loadMergeContact>>): Prisma.InputJsonValue {
  if (!source) return {};
  return JSON.parse(JSON.stringify(source)) as Prisma.InputJsonValue;
}

async function loadMergeContact(workspaceId: string, contactId: string) {
  return prisma.contact.findFirst({
    where: { id: contactId, workspaceId, archivedAt: null },
    include: {
      emails: true,
      phones: true,
      addresses: true,
      groupMemberships: true,
      customFieldValues: true,
      jumpDates: true,
      mixAssignments: true,
      externalLinks: true
    }
  });
}

export async function mergeContactsAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("View-only support sessions cannot merge Contacts.");
  const survivorId = value(formData, "survivorContactId", 120);
  const sourceId = value(formData, "sourceContactId", 120);
  const confirmation = value(formData, "confirmation", 240);
  if (!survivorId || !sourceId || survivorId === sourceId) fail("Choose two different Contacts and select the survivor.");

  const [survivor, source] = await Promise.all([
    loadMergeContact(workspace.id, survivorId),
    loadMergeContact(workspace.id, sourceId)
  ]);
  if (!survivor || !source) fail("One of the selected Contacts is no longer active.");
  if (confirmation !== source.displayName) fail(`Type ${source.displayName} exactly to confirm the merge.`);

  const survivorEmails = new Set(survivor.emails.map((item) => item.normalized));
  const survivorPhones = new Set(survivor.phones.map((item) => item.normalized));
  const survivorAddresses = new Set(survivor.addresses.map(addressKey));
  const survivorGroups = new Set(survivor.groupMemberships.map((item) => item.groupId));
  const survivorFields = new Map(survivor.customFieldValues.map((item) => [item.definitionId, item]));
  const survivorAssignments = new Map(survivor.mixAssignments.map((item) => [`${item.mixId}:${item.mode}`, item]));
  const sourceState = await prisma.contactRelationshipState.findUnique({ where: { contactId: source.id } });
  const survivorState = await prisma.contactRelationshipState.findUnique({ where: { contactId: survivor.id } });
  const archivedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: survivor.id },
      data: {
        firstName: survivor.firstName ?? source.firstName,
        lastName: survivor.lastName ?? source.lastName,
        company: survivor.company ?? source.company,
        publicNotes: appendNote(survivor.publicNotes, source.publicNotes, source.displayName),
        privateNotes: appendNote(survivor.privateNotes, source.privateNotes, source.displayName)
      }
    });

    for (const email of source.emails) {
      if (survivorEmails.has(email.normalized)) continue;
      await tx.contactEmail.create({ data: { contactId: survivor.id, email: email.email, normalized: email.normalized, label: email.label, isPrimary: !survivor.emails.length && email.isPrimary } });
      survivorEmails.add(email.normalized);
    }
    for (const phone of source.phones) {
      if (survivorPhones.has(phone.normalized)) continue;
      await tx.contactPhone.create({ data: { contactId: survivor.id, phone: phone.phone, normalized: phone.normalized, label: phone.label, isPrimary: !survivor.phones.length && phone.isPrimary } });
      survivorPhones.add(phone.normalized);
    }
    for (const address of source.addresses) {
      const key = addressKey(address);
      if (survivorAddresses.has(key)) continue;
      await tx.contactAddress.create({ data: { contactId: survivor.id, label: address.label, street1: address.street1, street2: address.street2, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country, isPrimary: !survivor.addresses.length && address.isPrimary } });
      survivorAddresses.add(key);
    }
    const newGroups = source.groupMemberships.filter((item) => !survivorGroups.has(item.groupId));
    if (newGroups.length) await tx.contactGroupMembership.createMany({ data: newGroups.map((item) => ({ contactId: survivor.id, groupId: item.groupId })), skipDuplicates: true });

    for (const field of source.customFieldValues) {
      const existing = survivorFields.get(field.definitionId);
      if (!existing) {
        await tx.contactCustomFieldValue.create({ data: { contactId: survivor.id, definitionId: field.definitionId, value: field.value } });
      } else if (!existing.value.trim() && field.value.trim()) {
        await tx.contactCustomFieldValue.update({ where: { id: existing.id }, data: { value: field.value } });
      } else if (field.value.trim() && existing.value.trim() !== field.value.trim()) {
        await tx.contactActivity.create({ data: { workspaceId: workspace.id, contactId: survivor.id, actorUserId: user.id, kind: "SYSTEM", visibility: "WORKSPACE", summary: `Merged alternate custom-field value: ${field.value.slice(0, 500)}`, metadata: { definitionId: field.definitionId, mergedContactId: source.id } } });
      }
    }

    await tx.jumpDate.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id } });
    await tx.contactActivity.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id } });
    await tx.externalContactLink.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id } });
    await tx.jump.updateMany({ where: { workspaceId: workspace.id, contactId: source.id, status: { in: ["DONE", "SENT", "SKIPPED"] } }, data: { contactId: survivor.id } });
    await tx.jump.updateMany({ where: { workspaceId: workspace.id, contactId: source.id, status: { in: ["PENDING", "COPIED"] } }, data: { status: "CANCELED", completionMethod: "contact_merged", completedAt: null } });

    for (const assignment of source.mixAssignments) {
      const key = `${assignment.mixId}:${assignment.mode}`;
      const existing = survivorAssignments.get(key);
      if (existing) {
        await tx.mixAssignment.update({ where: { id: assignment.id }, data: { isActive: false } });
      } else {
        await tx.mixAssignment.update({ where: { id: assignment.id }, data: { contactId: survivor.id, assignmentKey: `${workspace.id}:${assignment.mixId}:merged:${survivor.id}:${assignment.id}` } });
        survivorAssignments.set(key, assignment);
      }
    }

    if (!survivor.referredByContactId && source.referredByContactId && source.referredByContactId !== survivor.id) {
      await tx.contact.update({ where: { id: survivor.id }, data: { referredByContactId: source.referredByContactId } });
    }
    await tx.contact.updateMany({ where: { workspaceId: workspace.id, referredByContactId: source.id, id: { not: survivor.id } }, data: { referredByContactId: survivor.id } });

    if (sourceState) {
      await tx.contactRelationshipState.upsert({
        where: { contactId: survivor.id },
        create: {
          workspaceId: workspace.id,
          contactId: survivor.id,
          preferredChannel: survivorState?.preferredChannel ?? sourceState.preferredChannel,
          priority: survivorState?.priority === "NORMAL" || !survivorState ? sourceState.priority : survivorState.priority,
          doNotContact: Boolean(survivorState?.doNotContact || sourceState.doNotContact),
          relationshipStatus: survivorState?.relationshipStatus ?? sourceState.relationshipStatus,
          nextCommitmentAt: survivorState?.nextCommitmentAt ?? sourceState.nextCommitmentAt
        },
        update: {
          preferredChannel: survivorState?.preferredChannel ?? sourceState.preferredChannel,
          priority: survivorState?.priority === "NORMAL" ? sourceState.priority : survivorState?.priority,
          doNotContact: Boolean(survivorState?.doNotContact || sourceState.doNotContact),
          relationshipStatus: survivorState?.relationshipStatus ?? sourceState.relationshipStatus,
          nextCommitmentAt: survivorState?.nextCommitmentAt ?? sourceState.nextCommitmentAt,
          version: { increment: 1 }
        }
      });
      await tx.contactRelationshipState.deleteMany({ where: { contactId: source.id } });
    }

    await tx.contactActivity.create({ data: { workspaceId: workspace.id, contactId: survivor.id, actorUserId: user.id, kind: "SYSTEM", visibility: "WORKSPACE", summary: `Merged duplicate Contact ${source.displayName}.`, metadata: { mergedContactId: source.id } } });
    await tx.contact.update({ where: { id: source.id }, data: { archivedAt } });
    await tx.contactMergeRecord.create({
      data: {
        workspaceId: workspace.id,
        survivorContactId: survivor.id,
        mergedContactId: source.id,
        actorUserId: user.id,
        sourceSnapshot: sourceSnapshot(source),
        mergeSummary: {
          copiedEmails: source.emails.filter((item) => !survivor.emails.some((existing) => existing.normalized === item.normalized)).length,
          copiedPhones: source.phones.filter((item) => !survivor.phones.some((existing) => existing.normalized === item.normalized)).length,
          movedDates: source.jumpDates.length,
          movedAssignments: source.mixAssignments.length,
          archivedAt: archivedAt.toISOString()
        }
      }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId: survivor.id } } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "contact.merge", entityType: "Contact", entityId: survivor.id, source: "contacts.duplicates", beforeData: { survivorId: survivor.id, mergedId: source.id }, afterData: { survivorId: survivor.id, mergedArchivedAt: archivedAt.toISOString() }, metadata: { sourceDisplayName: source.displayName, survivorDisplayName: survivor.displayName } } });
  });
  redirect(`/contacts/${survivor.id}?merged=1`);
}
