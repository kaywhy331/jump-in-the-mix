"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { originalLocalDateOf } from "@/lib/jump-engine";
import { prisma } from "@/lib/prisma";
import { mergeWorkflowContact } from "@/lib/mix-workflow";
import { canonicalRowKey, phoneRowKeys, workspacePhoneRegion } from "@/lib/phone-number";

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function fail(message: string, viewer: ErrorViewer): never {
  redirect(withViewerError("/contacts/duplicates", message, viewer));
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
      mixAssignments: true
    }
  });
}

export async function mergeContactsAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  if (impersonation) fail("View-only support sessions cannot merge Contacts.", session);
  const survivorId = value(formData, "survivorContactId", 120);
  const sourceId = value(formData, "sourceContactId", 120);
  const confirmation = value(formData, "confirmation", 240);
  if (!survivorId || !sourceId || survivorId === sourceId) fail("Choose two different Contacts and select the survivor.", session);

  const [survivor, source] = await Promise.all([
    loadMergeContact(workspace.id, survivorId),
    loadMergeContact(workspace.id, sourceId)
  ]);
  if (!survivor || !source) fail("One of the selected Contacts is no longer active.", session);
  if (confirmation !== source.displayName) fail(`Type ${source.displayName} exactly to confirm the merge.`, session);

  const survivorEmails = new Set(survivor.emails.map((item) => item.normalized));
  // A number counts as the survivor's under its stored key or the key its display value has now, so a
  // row saved before the phone-key change still matches; a copied row gets the canonical key.
  const region = await workspacePhoneRegion(prisma, workspace.id);
  const survivorPhoneKeys = new Set(survivor.phones.flatMap((item) => phoneRowKeys(item, region)));
  const survivorPhones = new Set(survivorPhoneKeys);
  const survivorAddresses = new Set(survivor.addresses.map(addressKey));
  const survivorGroups = new Set(survivor.groupMemberships.map((item) => item.groupId));
  const survivorFields = new Map(survivor.customFieldValues.map((item) => [item.definitionId, item]));
  const survivorAssignments = new Map(survivor.mixAssignments.map((item) => [`${item.mixId}:${item.mode}`, item]));
  const sourceState = await prisma.contactRelationshipState.findUnique({ where: { contactId: source.id } });
  const survivorState = await prisma.contactRelationshipState.findUnique({ where: { contactId: survivor.id } });
  const archivedAt = new Date();
  let copiedStops = 0;
  let movedAppointmentBindings = 0;
  let movedReviewRequests = 0;
  let movedAccessInvites = 0;
  let skippedAccessInvites = 0;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
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
      const keys = phoneRowKeys(phone, region);
      if (keys.some((key) => survivorPhones.has(key))) continue;
      await tx.contactPhone.create({ data: { contactId: survivor.id, phone: phone.phone, normalized: canonicalRowKey(phone, region), label: phone.label, isPrimary: !survivor.phones.length && phone.isPrimary } });
      for (const key of keys) survivorPhones.add(key);
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
    await tx.calendarEntry.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id, version: { increment: 1 } } });
    await tx.intakeIdentity.updateMany({ where: { contactId: source.id, connection: { workspaceId: workspace.id } }, data: { contactId: survivor.id } });
    await tx.intakeReceipt.updateMany({ where: { contactId: source.id, connection: { workspaceId: workspace.id } }, data: { contactId: survivor.id } });
    await tx.journeyEvent.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id } });
    // Keep separate pieces of work distinct after their person identities merge.
    await mergeWorkflowContact(tx, workspace.id, source.id, survivor.id);
    const [survivorJourney, sourceJourney] = await Promise.all([tx.contactJourney.findUnique({ where: { contactId: survivor.id } }), tx.contactJourney.findUnique({ where: { contactId: source.id } })]);
    if (sourceJourney) {
      if (!survivorJourney) await tx.contactJourney.update({ where: { contactId: source.id }, data: { contactId: survivor.id, version: { increment: 1 } } });
      else {
        if (sourceJourney.managedAssignmentId) await tx.mixAssignment.updateMany({ where: { id: sourceJourney.managedAssignmentId, workspaceId: workspace.id }, data: { isActive: false } });
        await tx.contactJourney.delete({ where: { contactId: source.id } });
      }
    }
    await tx.jump.updateMany({ where: { workspaceId: workspace.id, contactId: source.id, status: { in: ["DONE", "SKIPPED"] } }, data: { contactId: survivor.id } });
    // The merged person's pending follow-ups are cancelled and regenerate for the survivor. Their
    // drafts are the owner's work and are never deleted here: one moves onto the survivor's pending
    // follow-up for the same beat and occurrence when it already exists, otherwise it stays on the
    // cancelled row and the next pass carries it onto the survivor's regenerated row.
    const drafted = await tx.jump.findMany({
      where: { workspaceId: workspace.id, contactId: source.id, status: "PENDING", drafts: { some: {} } },
      select: { id: true, mixStepId: true, jumpDateId: true, templateSnapshot: true, drafts: { select: { family: true } } }
    });
    await tx.jump.updateMany({ where: { workspaceId: workspace.id, contactId: source.id, status: "PENDING" }, data: { status: "CANCELED", completionMethod: "contact_merged", completedAt: null } });
    for (const cancelled of drafted) {
      const originalLocalDate = originalLocalDateOf(cancelled.templateSnapshot);
      if (!originalLocalDate) continue;
      const target = await tx.jump.findFirst({
        where: { workspaceId: workspace.id, contactId: survivor.id, status: "PENDING", mixStepId: cancelled.mixStepId, jumpDateId: cancelled.jumpDateId, templateSnapshot: { path: ["originalLocalDate"], equals: originalLocalDate } },
        select: { id: true, drafts: { select: { family: true } } }
      });
      if (!target) continue;
      const occupied = new Set(target.drafts.map((draft) => draft.family));
      const families = cancelled.drafts.map((draft) => draft.family).filter((family) => !occupied.has(family));
      if (families.length) await tx.jumpDraft.updateMany({ where: { jumpId: cancelled.id, family: { in: families } }, data: { jumpId: target.id } });
    }

    // An assignment bound to a visit is that visit's own work: it always moves with its binding
    // instead of collapsing into the survivor's plain assignment for the same Mix.
    const boundAssignmentIds = new Set((await tx.appointmentBinding.findMany({ where: { workspaceId: workspace.id, contactId: source.id }, select: { assignmentId: true } })).map((binding) => binding.assignmentId));
    for (const assignment of source.mixAssignments) {
      const key = `${assignment.mixId}:${assignment.mode}`;
      const existing = survivorAssignments.get(key);
      if (existing && !boundAssignmentIds.has(assignment.id)) {
        await tx.mixAssignment.update({ where: { id: assignment.id }, data: { isActive: false } });
      } else {
        await tx.mixAssignment.update({ where: { id: assignment.id }, data: { contactId: survivor.id, assignmentKey: `${workspace.id}:${assignment.mixId}:merged:${survivor.id}:${assignment.id}` } });
        if (!existing) survivorAssignments.set(key, assignment);
      }
    }

    // A stop on either side stops the merged person, the same way do-not-contact is combined
    // below: a Mix the customer asked to end never resumes under the survivor's name. The queued
    // reconciliation cancels any of the survivor's pending follow-ups on a newly stopped Mix.
    const survivorStoppedMixIds = new Set((await tx.mixStop.findMany({ where: { workspaceId: workspace.id, contactId: survivor.id }, select: { mixId: true } })).map((stop) => stop.mixId));
    const sourceStops = await tx.mixStop.findMany({ where: { workspaceId: workspace.id, contactId: source.id } });
    for (const stop of sourceStops) {
      await tx.mixStop.upsert({
        where: { workspaceId_mixId_contactId: { workspaceId: workspace.id, mixId: stop.mixId, contactId: survivor.id } },
        create: { workspaceId: workspace.id, mixId: stop.mixId, contactId: survivor.id, stoppedByUserId: stop.stoppedByUserId, reason: stop.reason, stoppedAt: stop.stoppedAt },
        update: {}
      });
      if (!survivorStoppedMixIds.has(stop.mixId)) copiedStops += 1;
    }

    // Work anchored to the person follows them: a visit's binding, a review link that was already
    // sent, and a network invitation. Each inviter may hold one invitation per person, so an
    // invitation that would double up on the survivor stays on the archived record.
    movedAppointmentBindings = (await tx.appointmentBinding.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id } })).count;
    movedReviewRequests = (await tx.reviewRequest.updateMany({ where: { workspaceId: workspace.id, contactId: source.id }, data: { contactId: survivor.id } })).count;
    const survivorInviters = new Set((await tx.referralAccessInvite.findMany({ where: { workspaceId: workspace.id, contactId: survivor.id, inviterUserId: { not: null } }, select: { inviterUserId: true } })).map((invite) => invite.inviterUserId));
    const sourceInvites = await tx.referralAccessInvite.findMany({ where: { workspaceId: workspace.id, contactId: source.id }, select: { id: true, inviterUserId: true } });
    const movableInviteIds = sourceInvites.filter((invite) => !invite.inviterUserId || !survivorInviters.has(invite.inviterUserId)).map((invite) => invite.id);
    if (movableInviteIds.length) await tx.referralAccessInvite.updateMany({ where: { id: { in: movableInviteIds } }, data: { contactId: survivor.id } });
    movedAccessInvites = movableInviteIds.length;
    skippedAccessInvites = sourceInvites.length - movableInviteIds.length;

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
          copiedPhones: source.phones.filter((item) => !phoneRowKeys(item, region).some((key) => survivorPhoneKeys.has(key))).length,
          movedDates: source.jumpDates.length,
          movedAssignments: source.mixAssignments.length,
          copiedStops,
          movedAppointmentBindings,
          movedReviewRequests,
          movedAccessInvites,
          skippedAccessInvites,
          archivedAt: archivedAt.toISOString()
        }
      }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId: survivor.id } } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "contact.merge", entityType: "Contact", entityId: survivor.id, source: "contacts.duplicates", beforeData: { survivorId: survivor.id, mergedId: source.id }, afterData: { survivorId: survivor.id, mergedArchivedAt: archivedAt.toISOString() }, metadata: { sourceDisplayName: source.displayName, survivorDisplayName: survivor.displayName } } });
  });
  redirect(`/contacts/${survivor.id}?merged=1`);
}
