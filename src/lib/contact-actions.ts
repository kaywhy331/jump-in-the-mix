"use server";

import { applyJourneyEvent } from "@/lib/journey";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import {
  buildContactCustomFieldInputs,
  validateContactCustomFieldInputs
} from "@/lib/contact-custom-fields";
import { buildAddressInputs, buildEmailInputs, buildPhoneInputs } from "@/lib/contact-input";
import { listGroupStates, mergeGroupActivity } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { timezoneForUser } from "@/lib/display-preferences";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item));
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function contactPayload(formData: FormData) {
  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const company = value(formData, "company");
  const publicNotes = value(formData, "publicNotes");
  const privateNotes = value(formData, "privateNotes");
  const emails = buildEmailInputs(values(formData, "emailValue"), values(formData, "emailLabel"), value(formData, "emailPrimaryIndex"));
  const phones = buildPhoneInputs(values(formData, "phoneValue"), values(formData, "phoneLabel"), value(formData, "phonePrimaryIndex"));
  const addresses = buildAddressInputs(
    values(formData, "addressStreet1"),
    values(formData, "addressStreet2"),
    values(formData, "addressCity"),
    values(formData, "addressState"),
    values(formData, "addressPostalCode"),
    values(formData, "addressCountry"),
    values(formData, "addressLabel"),
    value(formData, "addressPrimaryIndex"),
    values(formData, "addressId")
  );
  const customFields = buildContactCustomFieldInputs(
    values(formData, "customFieldDefinitionId"),
    values(formData, "customFieldValue")
  );
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || company || emails[0]?.value || phones[0]?.value;
  if (!displayName) throw new Error("Add a name, company, email, or phone number.");
  return {
    firstName: firstName || null,
    lastName: lastName || null,
    company: company || null,
    publicNotes: publicNotes || null,
    privateNotes: privateNotes || null,
    displayName,
    emails,
    phones,
    addresses,
    customFields,
    groupIds: [...new Set(values(formData, "groupIds").filter(Boolean))]
  };
}

type InitialFollowUp = {
  dateTypeId: string;
  dateValue: Date;
  reason: string;
  mixId: string | null;
};

async function initialFollowUpPayload(workspaceId: string, formData: FormData): Promise<InitialFollowUp | null> {
  if (formData.get("scheduleFollowUp") !== "on") return null;
  const dateTypeId = value(formData, "followUpDateTypeId");
  const dateValueRaw = value(formData, "followUpDate");
  const reason = value(formData, "followUpReason") || "Follow up";
  const requestedMixId = value(formData, "followUpMixId");
  const dateValue = new Date(`${dateValueRaw}T12:00:00Z`);
  if (!dateValueRaw || Number.isNaN(dateValue.getTime())) throw new Error("Choose a valid first follow-up date.");
  const dateType = await prisma.dateType.findFirst({
    where: { id: dateTypeId, isActive: true, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true }
  });
  if (!dateType) throw new Error("The selected saved date type is unavailable.");
  if (!requestedMixId) return { dateTypeId: dateType.id, dateValue, reason, mixId: null };
  const mix = await prisma.mix.findFirst({
    where: {
      id: requestedMixId,
      workspaceId,
      status: "ACTIVE",
      triggerMode: "DATE_TRIGGERED",
      dateTypeId: dateType.id,
      source: { not: "ONE_TIME" }
    },
    select: { id: true }
  });
  if (!mix) throw new Error("The selected follow-up mix is no longer active or does not match this saved date.");
  return { dateTypeId: dateType.id, dateValue, reason, mixId: mix.id };
}

async function validateContactPayload(workspaceId: string, payload: ReturnType<typeof contactPayload>, excludeContactId?: string) {
  const [groups, groupStates, existingMemberships] = await Promise.all([
    payload.groupIds.length
      ? prisma.group.findMany({ where: { workspaceId, id: { in: payload.groupIds } }, select: { id: true } })
      : [],
    listGroupStates(workspaceId),
    excludeContactId
      ? prisma.contactGroupMembership.findMany({ where: { contactId: excludeContactId }, select: { groupId: true } })
      : []
  ]);
  if (groups.length !== payload.groupIds.length) throw new Error("One or more selected groups are not available in this workspace.");
  const existingGroupIds = new Set(existingMemberships.map((membership) => membership.groupId));
  const unavailableNewGroup = mergeGroupActivity(groups, groupStates)
    .some((group) => !group.isActive && !existingGroupIds.has(group.id));
  if (unavailableNewGroup) {
    throw new Error("Hidden tags cannot receive new assignments. Choose an active tag from Contacts.");
  }

  await validateContactCustomFieldInputs(prisma, workspaceId, payload.customFields);

  for (const email of payload.emails) {
    const duplicate = await prisma.contactEmail.findFirst({
      where: {
        normalized: email.normalized,
        ...(excludeContactId ? { contactId: { not: excludeContactId } } : {}),
        contact: { workspaceId }
      },
      select: { id: true }
    });
    if (duplicate) throw new Error(`Another contact already uses ${email.value}.`);
  }
  for (const phone of payload.phones) {
    const duplicate = await prisma.contactPhone.findFirst({
      where: {
        normalized: phone.normalized,
        ...(excludeContactId ? { contactId: { not: excludeContactId } } : {}),
        contact: { workspaceId }
      },
      select: { id: true }
    });
    if (duplicate) throw new Error(`Another contact already uses ${phone.value}.`);
  }
}

async function queueContactReconciliation(workspaceId: string, contactId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId } } });
}

export async function createContactAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const timezone = await timezoneForUser(user.id);
  let payload: ReturnType<typeof contactPayload>;
  let followUp: InitialFollowUp | null;
  try {
    payload = contactPayload(formData);
    await validateContactPayload(workspace.id, payload);
    followUp = await initialFollowUpPayload(workspace.id, formData);
  } catch (error) {
    fail("/contacts/new", error instanceof Error ? error.message : "The Contact could not be saved.");
  }

  const contact = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
    const created = await tx.contact.create({
      data: {
        workspaceId: workspace.id,
        firstName: payload.firstName,
        lastName: payload.lastName,
        displayName: payload.displayName,
        company: payload.company,
        publicNotes: payload.publicNotes,
        privateNotes: payload.privateNotes,
        emails: payload.emails.length ? { create: payload.emails.map((item) => ({ email: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) } : undefined,
        phones: payload.phones.length ? { create: payload.phones.map((item) => ({ phone: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) } : undefined,
        addresses: payload.addresses.length ? { create: payload.addresses.map(({ id: _id, ...item }) => item) } : undefined,
        groupMemberships: payload.groupIds.length ? { create: payload.groupIds.map((groupId) => ({ groupId })) } : undefined,
        customFieldValues: payload.customFields.length ? { create: payload.customFields.map((item) => ({ definitionId: item.definitionId, value: item.value })) } : undefined
      }
    });
    if (followUp) {
      await tx.jumpDate.create({
        data: {
          workspaceId: workspace.id,
          contactId: created.id,
          dateTypeId: followUp.dateTypeId,
          dateValue: followUp.dateValue,
          month: followUp.dateValue.getUTCMonth() + 1,
          day: followUp.dateValue.getUTCDate(),
          recurrence: "NONE",
          timezone,
          label: followUp.reason
        }
      });
      if (followUp.mixId) {
        await tx.mixAssignment.create({
          data: {
            assignmentKey: `${workspace.id}:${followUp.mixId}:${created.id}`,
            workspaceId: workspace.id,
            mixId: followUp.mixId,
            contactId: created.id,
            isActive: true
          }
        });
      }
    }
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact.create",
        entityType: "Contact",
        entityId: created.id,
        source: "contacts.form",
        metadata: {
          groupCount: payload.groupIds.length,
          customFieldCount: payload.customFields.length,
          scheduledFollowUp: Boolean(followUp),
          assignedMix: Boolean(followUp?.mixId)
        }
      }
    });
    await applyJourneyEvent(tx, { workspaceId: workspace.id, contactId: created.id, eventKey: `contact-created:${created.id}`, eventType: "CONTACT_RECEIVED", source: "Contact added", actorUserId: user.id });
    return created;
  });
  await queueContactReconciliation(workspace.id, contact.id);
  const result = new URLSearchParams({ created: "1" });
  if (followUp) result.set("dateCreated", "1");
  if (followUp?.mixId) result.set("mixAssigned", "1");
  redirect(`/contacts/${contact.id}?${result.toString()}`);
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const path = `/contacts/${contactId}/edit`;
  const existing = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } });
  if (!existing) fail("/contacts", "Contact not found.");

  let payload: ReturnType<typeof contactPayload>;
  try {
    payload = contactPayload(formData);
    await validateContactPayload(workspace.id, payload, contactId);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The Contact could not be updated.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: contactId },
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        displayName: payload.displayName,
        company: payload.company,
        publicNotes: payload.publicNotes,
        privateNotes: payload.privateNotes
      }
    });
    for (const item of payload.emails) {
      await tx.contactEmail.upsert({
        where: { contactId_normalized: { contactId, normalized: item.normalized } },
        create: { contactId, email: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary },
        update: { email: item.value, label: item.label, isPrimary: item.isPrimary }
      });
    }
    await tx.contactEmail.deleteMany({ where: { contactId, ...(payload.emails.length ? { normalized: { notIn: payload.emails.map((item) => item.normalized) } } : {}) } });

    for (const item of payload.phones) {
      await tx.contactPhone.upsert({
        where: { contactId_normalized: { contactId, normalized: item.normalized } },
        create: { contactId, phone: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary },
        update: { phone: item.value, label: item.label, isPrimary: item.isPrimary }
      });
    }
    await tx.contactPhone.deleteMany({ where: { contactId, ...(payload.phones.length ? { normalized: { notIn: payload.phones.map((item) => item.normalized) } } : {}) } });

    const existingAddresses = await tx.contactAddress.findMany({ where: { contactId }, select: { id: true } });
    const existingAddressIds = new Set(existingAddresses.map((item) => item.id));
    const retainedAddressIds: string[] = [];
    for (const { id, ...item } of payload.addresses) {
      if (id) {
        if (!existingAddressIds.has(id)) throw new Error("One or more addresses no longer belong to this contact.");
        await tx.contactAddress.update({ where: { id }, data: item });
        retainedAddressIds.push(id);
      } else {
        const created = await tx.contactAddress.create({ data: { contactId, ...item }, select: { id: true } });
        retainedAddressIds.push(created.id);
      }
    }
    await tx.contactAddress.deleteMany({ where: { contactId, ...(retainedAddressIds.length ? { id: { notIn: retainedAddressIds } } : {}) } });

    for (const groupId of payload.groupIds) {
      await tx.contactGroupMembership.upsert({
        where: { contactId_groupId: { contactId, groupId } },
        create: { contactId, groupId },
        update: {}
      });
    }
    await tx.contactGroupMembership.deleteMany({ where: { contactId, ...(payload.groupIds.length ? { groupId: { notIn: payload.groupIds } } : {}) } });

    for (const item of payload.customFields) {
      await tx.contactCustomFieldValue.upsert({
        where: { contactId_definitionId: { contactId, definitionId: item.definitionId } },
        create: { contactId, definitionId: item.definitionId, value: item.value },
        update: { value: item.value }
      });
    }
    await tx.contactCustomFieldValue.deleteMany({ where: { contactId, ...(payload.customFields.length ? { definitionId: { notIn: payload.customFields.map((item) => item.definitionId) } } : {}) } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact.update",
        entityType: "Contact",
        entityId: contactId,
        source: "contacts.form",
        metadata: { groupCount: payload.groupIds.length, customFieldCount: payload.customFields.length }
      }
    });
  });
  await queueContactReconciliation(workspace.id, contactId);
  redirect(`/contacts/${contactId}?updated=1`);
}
