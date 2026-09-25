"use server";

import { applyJourneyEvent } from "@/lib/journey";

import { workflowContinuation } from "@/lib/workflow-continuation";
import { customerReturnPath } from "@/lib/customer-return-path";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import {
  buildContactCustomFieldInputs,
  validateContactCustomFieldInputs
} from "@/lib/contact-custom-fields";
import { buildAddressInputs, buildEmailInputs, buildPhoneInputs, normalizeEmail } from "@/lib/contact-input";
import { CONTACT_REVISION_INCLUDE, STALE_CONTACT_SAVE, contactRevision } from "@/lib/contact-revision";
import { listGroupStates, mergeGroupActivity } from "@/lib/group-activity";
import { canonicalPhoneKey, phoneLookupKeys, phoneRowKeys, workspacePhoneRegion } from "@/lib/phone-number";
import { prisma } from "@/lib/prisma";
import { timezoneForUser } from "@/lib/display-preferences";
import { ViewOnlySupportSessionError, requireWritableWorkspace } from "@/lib/writable-workspace";
import { WorkspaceScopeError } from "@/lib/workspace-repository";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item));
}

function fail(path: string, message: string, viewer: ErrorViewer): never {
  redirect(withViewerError(path, message, viewer));
}

function withParam(path: string, key: string, parameterValue: string): string {
  const hashIndex = path.indexOf("#");
  const base = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  return `${base}${base.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(parameterValue)}${hash}`;
}

type ErrorLink = { href: string; label: string };
/**
 * `field` names the control an error belongs to, so the form can mark and focus it: `firstName`,
 * `emailValue:<index>` or `phoneValue:<index>` (the row's position among the submitted rows), or
 * `custom:<definitionId>`.
 */
export type ContactFormState = { error?: string; errorLink?: ErrorLink; field?: string };

/** A validation message that belongs to one form control. */
class ContactFieldError extends Error {
  constructor(message: string, readonly field: string) {
    super(message);
  }
}

/** A phone or email that already belongs to someone else: the message names them and the link leads to the fix. */
class ContactMethodConflict extends Error {
  constructor(message: string, readonly link: ErrorLink, readonly field?: string) {
    super(message);
  }
}

/** The contact changed after the edit form was opened, so this save would undo that change. */
class StaleContactSaveError extends Error {}
/** An address id in the form is no longer this contact's (another window removed it). */
class MissingContactAddressError extends Error {}

/** A submitted value this form cannot save (an unavailable tag, date type or Mix); the message is shown as written. */
class ContactInputError extends Error {}

function methodConflict(kind: "phone" | "email", typed: string, owner: { displayName: string; archivedAt: Date | null }, field?: string): ContactMethodConflict {
  const other = kind === "phone" ? "number" : "address";
  if (owner.archivedAt) {
    return new ContactMethodConflict(
      `That ${kind} already belongs to ${owner.displayName} (archived). Restore them from Archived contacts or use another ${other}.`,
      { href: `/contacts/archived?q=${encodeURIComponent(typed)}`, label: "Open Archived contacts" },
      field
    );
  }
  return new ContactMethodConflict(
    `That ${kind} already belongs to ${owner.displayName}. Use Find duplicates if these are the same person.`,
    { href: "/contacts/duplicates", label: "Find duplicates" },
    field
  );
}

function formFailure(error: unknown, fallback: string): ContactFormState {
  if (error instanceof ContactMethodConflict) return { error: error.message, errorLink: error.link, ...(error.field ? { field: error.field } : {}) };
  if (error instanceof ContactFieldError) return { error: error.message, field: error.field };
  // Anything else (a database or network failure) gets the fixed sentence, never its own text.
  return { error: error instanceof ContactInputError || error instanceof WorkspaceScopeError ? error.message : fallback };
}

/** `<name>:<index>` for the first submitted, non-empty row that matches. */
function rowField(name: string, submitted: string[], matches: (typed: string) => boolean): string | undefined {
  const index = submitted.findIndex((item) => item.trim() !== "" && matches(item.trim()));
  return index >= 0 ? `${name}:${index}` : undefined;
}

function rejects(build: () => unknown): boolean {
  try { build(); return false; } catch { return true; }
}

/** Runs an input builder and ties its validation message to the control that caused it. */
function buildForField<T>(build: () => T, field: () => string | undefined): T {
  try { return build(); }
  catch (error) {
    const name = error instanceof Error ? field() : undefined;
    throw name && error instanceof Error ? new ContactFieldError(error.message, name) : error;
  }
}

/** `region` is the workspace's phone region: phones are stored under their canonical key for it. */
function contactPayload(formData: FormData, region: string) {
  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const company = value(formData, "company");
  const publicNotes = value(formData, "publicNotes");
  const privateNotes = value(formData, "privateNotes");
  const submittedEmails = values(formData, "emailValue");
  const submittedPhones = values(formData, "phoneValue");
  // Each builder checks every row the same way on its own, so the first row it rejects alone is the one to mark.
  const emails = buildForField(
    () => buildEmailInputs(submittedEmails, values(formData, "emailLabel"), value(formData, "emailPrimaryIndex")),
    () => rowField("emailValue", submittedEmails, (typed) => rejects(() => buildEmailInputs([typed], [])))
  );
  const phones = buildForField(
    () => buildPhoneInputs(submittedPhones, values(formData, "phoneLabel"), value(formData, "phonePrimaryIndex"), (typed) => canonicalPhoneKey(typed, region)),
    () => rowField("phoneValue", submittedPhones, (typed) => rejects(() => buildPhoneInputs([typed], [])))
  );
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
  const definitionIds = values(formData, "customFieldDefinitionId");
  const customValues = values(formData, "customFieldValue");
  const customFields = buildForField(
    () => buildContactCustomFieldInputs(definitionIds, customValues),
    () => {
      const index = definitionIds.findIndex((definitionId, position) => rejects(() => buildContactCustomFieldInputs([definitionId], [customValues[position] ?? ""])));
      return index >= 0 ? `custom:${definitionIds[index].trim()}` : undefined;
    }
  );
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || company || emails[0]?.value || phones[0]?.value;
  if (!displayName) throw new ContactFieldError("Add a name, company, email, or phone number.", "firstName");
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
    groupIds: [...new Set(values(formData, "groupIds").filter(Boolean))],
    submittedEmails,
    submittedPhones
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
  if (!dateValueRaw || Number.isNaN(dateValue.getTime())) throw new ContactInputError("Choose a valid first follow-up date.");
  const dateType = await prisma.dateType.findFirst({
    where: { id: dateTypeId, isActive: true, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true }
  });
  if (!dateType) throw new ContactInputError("The selected saved date type is unavailable.");
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
  if (!mix) throw new ContactInputError("The selected follow-up mix is no longer active or does not match this saved date.");
  return { dateTypeId: dateType.id, dateValue, reason, mixId: mix.id };
}

async function validateContactPayload(workspaceId: string, region: string, payload: ReturnType<typeof contactPayload>, excludeContactId?: string) {
  const [groups, groupStates, existingMemberships] = await Promise.all([
    payload.groupIds.length
      ? prisma.group.findMany({ where: { workspaceId, id: { in: payload.groupIds } }, select: { id: true } })
      : [],
    listGroupStates(workspaceId),
    excludeContactId
      ? prisma.contactGroupMembership.findMany({ where: { contactId: excludeContactId }, select: { groupId: true } })
      : []
  ]);
  if (groups.length !== payload.groupIds.length) throw new ContactInputError("One or more selected groups are not available in this workspace.");
  const existingGroupIds = new Set(existingMemberships.map((membership) => membership.groupId));
  const unavailableNewGroup = mergeGroupActivity(groups, groupStates)
    .some((group) => !group.isActive && !existingGroupIds.has(group.id));
  if (unavailableNewGroup) {
    throw new ContactInputError("Hidden tags cannot receive new assignments. Choose an active tag from Contacts.");
  }

  await validateContactCustomFieldInputs(prisma, workspaceId, payload.customFields);

  // Archived people keep their numbers (the unique key spans the workspace), so the owner is
  // named either way and an archived owner points at Restore instead of a dead end.
  for (const email of payload.emails) {
    const duplicate = await prisma.contactEmail.findFirst({
      where: {
        normalized: email.normalized,
        ...(excludeContactId ? { contactId: { not: excludeContactId } } : {}),
        contact: { workspaceId }
      },
      select: { contact: { select: { displayName: true, archivedAt: true } } }
    });
    if (duplicate) throw methodConflict("email", email.value, duplicate.contact, rowField("emailValue", payload.submittedEmails, (typed) => normalizeEmail(typed) === email.normalized));
  }
  // A number saved before this release may still hold its format-based key, so both keys are looked up.
  for (const phone of payload.phones) {
    const duplicate = await prisma.contactPhone.findFirst({
      where: {
        normalized: { in: phoneLookupKeys(phone.value, region) },
        ...(excludeContactId ? { contactId: { not: excludeContactId } } : {}),
        contact: { workspaceId }
      },
      select: { contact: { select: { displayName: true, archivedAt: true } } }
    });
    if (duplicate) throw methodConflict("phone", phone.value, duplicate.contact, rowField("phoneValue", payload.submittedPhones, (typed) => phoneLookupKeys(typed, region)[0] === phone.normalized));
  }
}

async function queueContactReconciliation(workspaceId: string, contactId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId } } });
}

type CreatedContact = { contactId: string; dateCreated: boolean; mixAssigned: boolean };

function storedCreation(response: Prisma.JsonValue | null | undefined): CreatedContact | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const saved = response as Record<string, unknown>;
  if (typeof saved.contactId !== "string" || !saved.contactId) return null;
  return { contactId: saved.contactId, dateCreated: saved.dateCreated === true, mixAssigned: saved.mixAssigned === true };
}

/** The contact an earlier submission of the same Add form already created, if any. */
async function earlierCreation(workspaceId: string, key: string | null): Promise<CreatedContact | null> {
  if (!key) return null;
  const earlier = await prisma.idempotencyKey.findUnique({ where: { workspaceId_key: { workspaceId, key } }, select: { response: true } });
  return storedCreation(earlier?.response);
}

function createdContactPath(returnTo: string, created: CreatedContact): string {
  const result = new URLSearchParams({ created: "1" });
  if (created.dateCreated) result.set("dateCreated", "1");
  if (created.mixAssigned) result.set("mixAssigned", "1");
  return workflowContinuation(returnTo, created.contactId) ?? `/contacts/${created.contactId}?${result.toString()}`;
}

async function createContact(formData: FormData): Promise<ContactFormState> {
  const { workspace, user } = await requireWritableWorkspace();
  const returnTo = value(formData, "returnTo");
  // The Add form sends one id per opening. A retry after a lost response opens the contact the
  // first submission created instead of saving the same person twice.
  const requestId = value(formData, "requestId").slice(0, 120);
  const idempotencyKey = requestId ? `contact-create:${user.id}:${requestId}` : null;
  const replayed = await earlierCreation(workspace.id, idempotencyKey);
  if (replayed) redirect(createdContactPath(returnTo, replayed));
  const timezone = await timezoneForUser(user.id);
  const region = await workspacePhoneRegion(prisma, workspace.id);
  let payload: ReturnType<typeof contactPayload>;
  let followUp: InitialFollowUp | null;
  try {
    payload = contactPayload(formData, region);
    await validateContactPayload(workspace.id, region, payload);
    followUp = await initialFollowUpPayload(workspace.id, formData);
  } catch (error) {
    // A retry that raced its own first submission finds its phone or email taken by that save.
    const raced = await earlierCreation(workspace.id, idempotencyKey);
    if (raced) redirect(createdContactPath(returnTo, raced));
    return formFailure(error, "The contact could not be saved.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
    // Under the workspace lock, a concurrent submission of the same form has either stored its
    // receipt already (this one replays it) or has not started creating.
    if (idempotencyKey) {
      const earlier = await tx.idempotencyKey.findUnique({ where: { workspaceId_key: { workspaceId: workspace.id, key: idempotencyKey } }, select: { response: true } });
      const receipt = storedCreation(earlier?.response);
      if (receipt) return { ...receipt, replayed: true };
    }
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
    const receipt: CreatedContact = { contactId: created.id, dateCreated: Boolean(followUp), mixAssigned: Boolean(followUp?.mixId) };
    if (idempotencyKey) {
      await tx.idempotencyKey.create({ data: { workspaceId: workspace.id, key: idempotencyKey, response: receipt, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    }
    return { ...receipt, replayed: false };
  });
  if (!saved.replayed) await queueContactReconciliation(workspace.id, saved.contactId);
  redirect(createdContactPath(returnTo, saved));
}

async function updateContact(formData: FormData): Promise<ContactFormState> {
  const { workspace, user, session } = await requireWritableWorkspace();
  const contactId = value(formData, "contactId");
  const path = `/contacts/${contactId}/edit`;
  const existing = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } });
  if (!existing) fail("/contacts", "Contact not found.", session);

  const region = await workspacePhoneRegion(prisma, workspace.id);
  let payload: ReturnType<typeof contactPayload>;
  try {
    payload = contactPayload(formData, region);
    await validateContactPayload(workspace.id, region, payload, contactId);
  } catch (error) {
    return formFailure(error, "The contact could not be updated.");
  }

  // A fingerprint of what the form showed when it was opened (see contact-revision.ts). A form opened
  // before the fingerprint existed (a tab left open across an update) carries none and saves as before.
  const revision = value(formData, "revision");
  try {
  await prisma.$transaction(async (tx) => {
    // Lock the person, then check that nothing this form overwrites changed since it was opened;
    // otherwise, for example, a phone added on another device would be deleted by this older form.
    await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${contactId} AND "workspaceId" = ${workspace.id} FOR UPDATE`;
    const current = await tx.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, include: CONTACT_REVISION_INCLUDE });
    if (!current || (revision && contactRevision(current) !== revision)) throw new StaleContactSaveError();
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

    // A number saved before this release keeps its row: its format-based key is rewritten to the
    // canonical one first, so the upsert below updates it instead of replacing it.
    const phoneKeys = new Set(payload.phones.map((item) => item.normalized));
    const heldKeys = new Set(current.phones.map((row) => row.normalized));
    for (const item of payload.phones) {
      if (heldKeys.has(item.normalized)) continue;
      const earlier = current.phones.find((row) => !phoneKeys.has(row.normalized) && heldKeys.has(row.normalized) && phoneRowKeys(row, region).includes(item.normalized));
      if (!earlier) continue;
      await tx.contactPhone.update({ where: { id: earlier.id }, data: { normalized: item.normalized } });
      heldKeys.delete(earlier.normalized);
      heldKeys.add(item.normalized);
    }
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
        if (!existingAddressIds.has(id)) throw new MissingContactAddressError();
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
  } catch (error) {
    // Keep the owner's entries on screen: a concurrent edit or duplicate is recoverable, not a crash.
    if (error instanceof StaleContactSaveError) return { error: STALE_CONTACT_SAVE };
    if (error instanceof MissingContactAddressError) return { error: "One or more addresses no longer belong to this contact. Reload the contact, then save again." };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "Another contact already uses one of these email addresses or phone numbers. Your entries are kept." };
    return { error: "The contact could not be saved. Your entries are kept. Reload to see the latest version, then try again." };
  }
  await queueContactReconciliation(workspace.id, contactId);
  // Editing from a Today review (e.g. "Add phone") returns to that follow-up; the flag lets
  // Today confirm the save, since the page otherwise looks unchanged.
  const todayReturn = customerReturnPath(value(formData, "returnTo"));
  if (todayReturn?.startsWith("/jumps")) redirect(withParam(todayReturn, "contactSaved", "1"));
  redirect(`/contacts/${contactId}?updated=1`);
}

export async function saveContactFormAction(_previous: ContactFormState, formData: FormData): Promise<ContactFormState> {
  try {
    return await (value(formData, "contactId") ? updateContact(formData) : createContact(formData));
  } catch (error) {
    // A support view is read-only: say so on the form rather than reporting an unconfirmed save.
    if (error instanceof ViewOnlySupportSessionError) return { error: error.message };
    throw error;
  }
}

// The redirecting forms of the save: the error goes back to the form page, signed for the signed-in person.
export async function createContactAction(formData: FormData): Promise<void> {
  const { session } = await requireWritableWorkspace();
  const result = await createContact(formData);
  if (result.error) fail("/contacts/new", result.error, session);
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const { session } = await requireWritableWorkspace();
  const result = await updateContact(formData);
  if (result.error) fail(`/contacts/${value(formData, "contactId")}/edit`, result.error, session);
}
