"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import {
  buildContactCustomFieldInputs,
  validateContactCustomFieldInputs
} from "@/lib/contact-custom-fields";
import { buildAddressInputs, buildEmailInputs, buildPhoneInputs } from "@/lib/contact-input";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

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
    value(formData, "addressPrimaryIndex")
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

async function validateContactPayload(workspaceId: string, payload: ReturnType<typeof contactPayload>, excludeContactId?: string) {
  const groups = payload.groupIds.length
    ? await prisma.group.findMany({ where: { workspaceId, id: { in: payload.groupIds } }, select: { id: true } })
    : [];
  if (groups.length !== payload.groupIds.length) throw new Error("One or more selected groups are not available in this workspace.");
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
  let payload: ReturnType<typeof contactPayload>;
  try {
    payload = contactPayload(formData);
    await validateContactPayload(workspace.id, payload);
  } catch (error) {
    fail("/contacts/new", error instanceof Error ? error.message : "The Contact could not be saved.");
  }

  const currentCount = await prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } });
  const limit = PLAN_LIMITS[workspace.planTier].contacts;
  if (currentCount >= limit) fail("/contacts/new", `Your ${workspace.planTier.toLowerCase()} plan allows ${limit} active Contacts.`);

  const contact = await prisma.$transaction(async (tx) => {
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
        addresses: payload.addresses.length ? { create: payload.addresses } : undefined,
        groupMemberships: payload.groupIds.length ? { create: payload.groupIds.map((groupId) => ({ groupId })) } : undefined,
        customFieldValues: payload.customFields.length ? { create: payload.customFields.map((item) => ({ definitionId: item.definitionId, value: item.value })) } : undefined
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact.create",
        entityType: "Contact",
        entityId: created.id,
        source: "contacts.form",
        metadata: { groupCount: payload.groupIds.length, customFieldCount: payload.customFields.length }
      }
    });
    return created;
  });
  await queueContactReconciliation(workspace.id, contact.id);
  redirect("/contacts?created=1");
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
    await tx.contactEmail.deleteMany({ where: { contactId } });
    await tx.contactPhone.deleteMany({ where: { contactId } });
    await tx.contactAddress.deleteMany({ where: { contactId } });
    await tx.contactGroupMembership.deleteMany({ where: { contactId } });
    await tx.contactCustomFieldValue.deleteMany({ where: { contactId } });
    if (payload.emails.length) await tx.contactEmail.createMany({ data: payload.emails.map((item) => ({ contactId, email: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) });
    if (payload.phones.length) await tx.contactPhone.createMany({ data: payload.phones.map((item) => ({ contactId, phone: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) });
    if (payload.addresses.length) await tx.contactAddress.createMany({ data: payload.addresses.map((item) => ({ contactId, ...item })) });
    if (payload.groupIds.length) await tx.contactGroupMembership.createMany({ data: payload.groupIds.map((groupId) => ({ contactId, groupId })) });
    if (payload.customFields.length) await tx.contactCustomFieldValue.createMany({ data: payload.customFields.map((item) => ({ contactId, definitionId: item.definitionId, value: item.value })) });
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
