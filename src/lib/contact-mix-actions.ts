"use server";

import { assertRoomForPeople } from "@/lib/plan-limits";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { timezoneForUser } from "@/lib/display-preferences";
import { startMixForContact } from "@/lib/contact-mix-start";
import { logicalDateInTimezone, logicalDateKey, type LogicalDate } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Today asks what's next at the end of a Mix (JITM-09 §2.77) and gets the answer back there; anything else is the profile. */
function fromToday(formData: FormData): boolean {
  return value(formData, "returnTo") === "/jumps";
}

function fail(contactId: string, message: string, viewer: ErrorViewer, today = false): never {
  redirect(withViewerError(today ? "/jumps" : `/contacts/${encodeURIComponent(contactId)}`, message, viewer));
}

function startLogicalDate(raw: string, timezone: string): LogicalDate | null {
  const today = logicalDateInTimezone(new Date(), timezone);
  if (!raw) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return logicalDateKey({ year, month, day }) < logicalDateKey(today) ? null : { year, month, day };
}

export async function assignMixToContactAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const contactId = value(formData, "contactId");
  const today = fromToday(formData);
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.", session, today);
  const timezone = await timezoneForUser(user.id);
  const start = startLogicalDate(value(formData, "startDate"), timezone);
  if (!start) fail(contactId, "Choose a start date from today on.", session, today);
  const [mix, contact] = await Promise.all([
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" }, select: { id: true, name: true, triggerMode: true, dateTypeId: true, steps: { where: { isActive: true, anchor: { not: "CALENDAR_DAY" } }, select: { id: true }, take: 1 } } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } })
  ]);
  if (!mix || !contact) fail(contactId, "Choose an active Mix.", session, today);

  let startedOn = logicalDateKey(start);
  try { await prisma.$transaction(async (tx) => {
    await assertRoomForPeople(tx, workspace.id, [contact.id]);
    startedOn = await startMixForContact(tx, { workspaceId: workspace.id, userId: user.id, contactId: contact.id, mix, start, timezone, source: today ? "today.mix-end" : "contacts.detail" });
  });
  } catch (error) { fail(contactId, error instanceof UserFacingError ? error.message : "This Mix could not be started.", session, today); }
  // Beats timed from an appointment have nothing to count from here; the confirmation says so
  // rather than presenting them as scheduled. The visit is chosen explicitly on the calendar.
  const notice = new URLSearchParams({ mixAssigned: mix.steps.length ? "visit" : "1", mixStart: startedOn });
  if (today) redirect(`/jumps?${notice}&mixPerson=${encodeURIComponent(contact.id)}`);
  redirect(`/contacts/${contact.id}?${notice}`);
}

/** Back to the list the owner acted from, filters kept; anything else returns to Contacts. */
function contactsReturn(raw: string, notice: Record<string, string>): string {
  const base = /^\/contacts(\?[^#]*)?$/.test(raw) ? new URL(raw, "http://local") : new URL("/contacts", "http://local");
  for (const key of ["people", "error", "at", "sig", "mixStarted", "noMixNeeded", "noMixCleared", "noMixSkipped", "noMixPeople"]) base.searchParams.delete(key);
  for (const [key, item] of Object.entries(notice)) base.searchParams.set(key, item);
  return `${base.pathname}?${base.searchParams}`;
}

/**
 * Starts the selected people on one Mix (JITM-09 §2.77). Like a start from the profile, it asks for a
 * start day, and the plan, Do not contact and stopped-Mix checks refuse the whole batch before anything is saved.
 */
export async function bulkAssignMixAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const returnTo = value(formData, "returnTo");
  const refuse: (message: string) => never = (message) => redirect(withViewerError(contactsReturn(returnTo, {}), message, session));
  if (impersonation) refuse("Administrator support sessions are view-only.");
  const contactIds = [...new Set(formData.getAll("contactIds").map(String).filter(Boolean))];
  if (!contactIds.length) refuse("Select at least one Contact.");
  if (contactIds.length > 100) refuse("Add up to 100 people to a Mix at a time.");
  const timezone = await timezoneForUser(user.id);
  const start = startLogicalDate(value(formData, "startDate"), timezone);
  if (!start) refuse("Choose a start date from today on.");
  const [mix, contacts] = await Promise.all([
    prisma.mix.findFirst({ where: { id: value(formData, "mixId"), workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } }, select: { id: true, name: true, triggerMode: true, dateTypeId: true } }),
    prisma.contact.findMany({ where: { id: { in: contactIds }, workspaceId: workspace.id, archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })
  ]);
  if (!mix) refuse("Choose an active Mix.");
  if (contacts.length !== contactIds.length) refuse("One or more selected Contacts are unavailable.");
  try {
    await prisma.$transaction(async (tx) => {
      await assertRoomForPeople(tx, workspace.id, contacts.map(contact => contact.id));
      for (const contact of contacts) {
        try { await startMixForContact(tx, { workspaceId: workspace.id, userId: user.id, contactId: contact.id, mix, start: start!, timezone, source: "contacts.bulk" }); }
        catch (error) { throw error instanceof UserFacingError ? new UserFacingError(`${contact.displayName}: ${error.message}`) : error; }
      }
    }, { timeout: 30_000 });
  } catch (error) { refuse(error instanceof UserFacingError ? error.message : "These people could not be added to the Mix."); }
  redirect(contactsReturn(returnTo, { mixStarted: String(contacts.length) }));
}

export async function removeMixAssignmentAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const assignmentId = value(formData, "assignmentId");
  const contactId = value(formData, "contactId");
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.", session);
  const assignment = await prisma.mixAssignment.findFirst({
    where: { id: assignmentId, workspaceId: workspace.id, contactId },
    select: { id: true, mixId: true }
  });
  if (!assignment) fail(contactId, "Mix assignment not found.", session);

  await prisma.$transaction([
    prisma.mixAssignment.update({ where: { id: assignment.id }, data: { isActive: false } }),
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId, mixId: assignment.mixId } } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.assignment.deactivate",
        entityType: "MixAssignment",
        entityId: assignment.id,
        source: "contacts.detail",
        metadata: { contactId, mixId: assignment.mixId }
      }
    })
  ]);
  redirect(`/contacts/${contactId}?mixRemoved=1`);
}
