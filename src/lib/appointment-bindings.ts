import type { Prisma } from "@/generated/prisma/client";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { queueBoundReconciliation, saveCalendarEntryIn, type CalendarEntryInput } from "@/lib/calendar";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { applyJourneyEvent } from "@/lib/journey";
import { placeNewContacts } from "@/lib/new-contact-placement";
import { phoneLookupKeys, workspacePhoneRegion } from "@/lib/phone-number";
import { prisma } from "@/lib/prisma";
import { boundPlanOutlook, type BoundPlanOutlook } from "@/lib/step-timing";
import { UserFacingError } from "@/lib/user-facing-error";

export type ScheduleVisitInput = Omit<CalendarEntryInput, "contactId"> & {
  contactId?: string | null;
  /** One save: a new person to create and bind when no existing contact is chosen. */
  newContact?: {
    name: string;
    phone?: string | null;
    email?: string | null;
    /** The saved person the owner chose after an ambiguous match. It must still be one of the matches. */
    resolvedContactId?: string | null;
  } | null;
  /** The plan to bind to this visit; its beats anchor to the appointment. */
  planId?: string | null;
};

export type ContactCandidate = { id: string; displayName: string; matched: Array<"phone" | "email"> };

/**
 * More than one saved person matches the entered phone or email, so no match is unambiguous.
 * Nothing was saved. The owner chooses one of these inline and saves again with everything
 * they entered still in place.
 */
export class ContactChoiceRequiredError extends Error {
  constructor(public readonly candidates: ContactCandidate[]) {
    super("More than one saved person matches the phone or email you entered. Choose who this visit is with.");
    this.name = "ContactChoiceRequiredError";
  }
}

export type ScheduleVisitResult = {
  entryId: string;
  contactId: string | null;
  bindingId: string | null;
  /** True when the person already had this plan running without an appointment scope; it is left alone and both proceed. */
  unscopedEnrollmentKept: boolean;
  createdContact: boolean;
  /** What the bound plan gives the owner right now, beat by beat, so the confirmation is truthful; null without a plan. */
  outlook: BoundPlanOutlook | null;
};

export function appointmentAssignmentKey(workspaceId: string, mixId: string, calendarEntryId: string, contactId: string): string {
  return `${workspaceId}:${mixId}:appointment:${calendarEntryId}:${contactId}`;
}

function nameParts(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

/**
 * Every saved person the entered methods point at, with the method that matched each. `phoneKeys` are
 * the entered number's canonical key and, for rows saved before the phone-key change, its old one.
 */
async function matchingContacts(tx: Prisma.TransactionClient, workspaceId: string, phoneKeys: string[], email: string | null): Promise<ContactCandidate[]> {
  if (!phoneKeys.length && !email) return [];
  const rows = await tx.contact.findMany({
    where: { workspaceId, archivedAt: null, OR: [...(phoneKeys.length ? [{ phones: { some: { normalized: { in: phoneKeys } } } }] : []), ...(email ? [{ emails: { some: { normalized: email } } }] : [])] },
    select: {
      id: true,
      displayName: true,
      phones: { where: { normalized: { in: phoneKeys } }, select: { id: true }, take: 1 },
      emails: { where: { normalized: email ?? "" }, select: { id: true }, take: 1 }
    },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: 20
  });
  return rows.map((row) => ({ id: row.id, displayName: row.displayName, matched: [...(row.phones.length ? ["phone" as const] : []), ...(row.emails.length ? ["email" as const] : [])] }));
}

/**
 * Finds the person by a saved phone or email, otherwise creates them. Only an unambiguous
 * match is reused: when the methods point at more than one saved person, the owner chooses
 * inline and that choice is checked against the same matches. Never creates a duplicate of a
 * saved method, and never adds the entered methods to the person the owner chose.
 */
async function findOrCreateContact(tx: Prisma.TransactionClient, workspaceId: string, input: NonNullable<ScheduleVisitInput["newContact"]>): Promise<{ id: string; created: boolean }> {
  const name = input.name.trim();
  if (!name || name.length > 200) throw new UserFacingError("Enter the person's name.");
  const typedPhone = input.phone?.trim() ?? "";
  if (typedPhone && !normalizePhone(typedPhone)) throw new UserFacingError("Enter a phone number with 7 to 15 digits.");
  // [canonical, old key]: a new person is saved under the first; a match may still hold the second.
  const phoneKeys = typedPhone ? phoneLookupKeys(typedPhone, await workspacePhoneRegion(tx, workspaceId)) : [];
  const phone = phoneKeys[0] ?? null;
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (email && !isValidEmail(email)) throw new UserFacingError("Enter a valid email address.");
  const candidates = await matchingContacts(tx, workspaceId, phoneKeys, email);
  if (input.resolvedContactId) {
    const chosen = candidates.find((candidate) => candidate.id === input.resolvedContactId);
    if (!chosen) throw new UserFacingError("The person you chose no longer matches these details. Check the phone and email, then save again.");
    return { id: chosen.id, created: false };
  }
  if (candidates.length > 1) throw new ContactChoiceRequiredError(candidates);
  if (candidates.length === 1) return { id: candidates[0].id, created: false };
  const { firstName, lastName } = nameParts(name);
  const created = await tx.contact.create({
    data: {
      workspaceId,
      firstName,
      lastName,
      displayName: name,
      phones: phone ? { create: { phone: input.phone!.trim(), normalized: phone, isPrimary: true } } : undefined,
      emails: email ? { create: { email: input.email!.trim(), normalized: email, isPrimary: true } } : undefined
    }
  });
  await applyJourneyEvent(tx, { workspaceId, contactId: created.id, eventKey: `contact-created:${created.id}`, eventType: "CONTACT_RECEIVED", source: "Added with a visit" });
  await placeNewContacts(tx, { workspaceId, contactIds: [created.id] });
  return { id: created.id, created: true };
}

/**
 * Saves the visit and everything the owner entered with it in one transaction: the person (found
 * or created), the appointment, and the plan bound to it. The binding reuses only an enrollment
 * already bound to this exact appointment; a plan the person already has without an appointment
 * scope is left alone and both proceed, and the result says so. The follow-ups are generated by
 * the worker after commit and are never sent automatically unless the binding allows it.
 */
export async function scheduleVisit(input: ScheduleVisitInput): Promise<ScheduleVisitResult> {
  const result = await prisma.$transaction(async (tx) => {
    let contactId = input.contactId || null;
    let createdContact = false;
    if (!contactId && input.newContact?.name?.trim()) {
      const person = await findOrCreateContact(tx, input.workspaceId, input.newContact);
      contactId = person.id;
      createdContact = person.created;
    }
    const entry = await saveCalendarEntryIn(tx, { ...input, contactId: contactId ?? undefined });
    if (!input.planId) return { entryId: entry.id, contactId, bindingId: null, unscopedEnrollmentKept: false, createdContact, outlook: null };
    if (!contactId) throw new UserFacingError("Choose or add the person this visit is with before binding a plan.");
    if (entry.kind !== "MEETING") throw new UserFacingError("Only a meeting can carry a follow-up plan.");
    const plan = await tx.mix.findFirst({ where: { id: input.planId, workspaceId: input.workspaceId, status: "ACTIVE", triggerMode: "MANUAL_START", source: { not: "ONE_TIME" } }, select: { id: true } });
    if (!plan) throw new UserFacingError("Choose an active plan from this business.");
    await assertRoomForPeople(tx, input.workspaceId, [contactId]);
    const unscoped = await tx.mixAssignment.findFirst({ where: { workspaceId: input.workspaceId, mixId: plan.id, contactId, isActive: true, appointmentBinding: null }, select: { id: true } });
    const bound = await tx.appointmentBinding.findUnique({ where: { calendarEntryId_mixId: { calendarEntryId: entry.id, mixId: plan.id } }, select: { id: true, assignmentId: true } });
    let bindingId: string;
    if (bound) {
      await tx.mixAssignment.update({ where: { id: bound.assignmentId }, data: { isActive: true } });
      bindingId = bound.id;
    } else {
      const assignmentKey = appointmentAssignmentKey(input.workspaceId, plan.id, entry.id, contactId);
      const assignment = await tx.mixAssignment.upsert({
        where: { assignmentKey },
        create: { assignmentKey, workspaceId: input.workspaceId, mixId: plan.id, contactId, mode: "SNAPSHOT", isActive: true },
        update: { isActive: true, contactId }
      });
      bindingId = (await tx.appointmentBinding.create({ data: { workspaceId: input.workspaceId, contactId, calendarEntryId: entry.id, mixId: plan.id, assignmentId: assignment.id } })).id;
    }
    await tx.job.create({ data: { workspaceId: input.workspaceId, task: "generate-jumps", payload: { contactId, mixId: plan.id } } });
    // The plan is attached to this appointment and no other: the owner chose it on this visit, and
    // nothing here looks for the person's latest or next visit.
    const steps = await tx.mixStep.findMany({ where: { mixId: plan.id, isActive: true }, select: { anchor: true, offsetMinutes: true, plannedAt: true, dayOffset: true, sendTimeMinutes: true } });
    return { entryId: entry.id, contactId, bindingId, unscopedEnrollmentKept: Boolean(unscoped), createdContact, outlook: boundPlanOutlook(steps, entry) };
  }, { timeout: 15_000 });
  return result;
}

export type AppointmentOutcome = "COMPLETED" | "NO_SHOW";

/**
 * Records what happened at a visit, or clears it. The outcome is a journey event the owner's stage
 * rules can act on, and an anchor for the bound plan: a missed visit holds every bound follow-up,
 * a completed one lets the beats before it lapse and runs the ones after. Clearing the outcome
 * brings held beats back on the next pass.
 */
export async function recordAppointmentOutcome(input: { workspaceId: string; actorUserId?: string; entryId: string; version?: number; outcome: AppointmentOutcome | null }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.outcome !== null && input.outcome !== "COMPLETED" && input.outcome !== "NO_SHOW") return { ok: false, message: "Say whether the visit happened or was missed." };
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR NO KEY UPDATE`;
    const entry = await tx.calendarEntry.findFirst({ where: { id: input.entryId, workspaceId: input.workspaceId, connectionId: null, canceledAt: null, ...(input.version !== undefined ? { version: input.version } : {}) } });
    if (!entry) return { ok: false as const, message: "This visit changed. Refresh the calendar before recording it." };
    if (entry.kind !== "MEETING") return { ok: false as const, message: "Only a meeting has an outcome." };
    const now = new Date();
    await tx.calendarEntry.update({ where: { id: entry.id }, data: { outcome: input.outcome, outcomeAt: input.outcome ? now : null, version: { increment: 1 } } });
    if (entry.contactId) {
      const summary = input.outcome === "COMPLETED" ? `Visit happened: ${entry.title}` : input.outcome === "NO_SHOW" ? `Visit missed: ${entry.title}` : `Visit outcome cleared: ${entry.title}`;
      await tx.contactActivity.create({ data: { workspaceId: input.workspaceId, contactId: entry.contactId, actorUserId: input.actorUserId, kind: "SYSTEM", visibility: "WORKSPACE", summary, metadata: { calendarEntryId: entry.id, outcome: input.outcome } } });
      if (input.outcome) await applyJourneyEvent(tx, { workspaceId: input.workspaceId, contactId: entry.contactId, actorUserId: input.actorUserId, eventKey: `calendar-outcome:${entry.id}:${input.outcome}:${entry.version + 1}`, eventType: input.outcome === "COMPLETED" ? "MEETING_COMPLETED" : "MEETING_NO_SHOW", source: entry.title });
    }
    await queueBoundReconciliation(tx, input.workspaceId, entry.id);
    return { ok: true as const };
  }, { timeout: 15_000 });
}

/** An owner hold scoped to one visit's plan. Its follow-ups return when the hold lifts. */
export async function setAppointmentBindingHold(input: { workspaceId: string; bindingId: string; held: boolean }): Promise<boolean> {
  const binding = await prisma.appointmentBinding.findFirst({ where: { id: input.bindingId, workspaceId: input.workspaceId }, select: { id: true, contactId: true, mixId: true } });
  if (!binding) return false;
  await prisma.$transaction([
    prisma.appointmentBinding.update({ where: { id: binding.id }, data: { heldAt: input.held ? new Date() : null } }),
    prisma.job.create({ data: { workspaceId: input.workspaceId, task: "generate-jumps", payload: { contactId: binding.contactId, mixId: binding.mixId } } })
  ]);
  return true;
}

/** Automatic delivery for one visit's plan is off until the owner turns it on here. */
export async function setAppointmentBindingDelivery(input: { workspaceId: string; bindingId: string; automaticDelivery: boolean }): Promise<boolean> {
  const updated = await prisma.appointmentBinding.updateMany({ where: { id: input.bindingId, workspaceId: input.workspaceId }, data: { automaticDelivery: input.automaticDelivery } });
  return updated.count === 1;
}
