"use server";

import { Prisma } from "@/generated/prisma/client";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { timezoneForUser } from "@/lib/display-preferences";
import { startMixForContact, visitTimedBeats, type MixStartOutcome } from "@/lib/contact-mix-start";
import { logicalDateInTimezone, logicalDateKey, type LogicalDate } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { NO_MIX_NEEDED_NOTICE, type MixStartCounts, type MixStartResult } from "@/lib/contact-mix-status-labels";

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
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" }, select: { id: true, name: true, triggerMode: true, dateTypeId: true, steps: visitTimedBeats } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } })
  ]);
  if (!mix || !contact) fail(contactId, "Choose an active Mix.", session, today);

  let startedOn = logicalDateKey(start);
  try { await prisma.$transaction(async (tx) => {
    await assertRoomForPeople(tx, workspace.id, [contact.id]);
    ({ startedOn } = await startMixForContact(tx, { workspaceId: workspace.id, userId: user.id, contactId: contact.id, mix, start, timezone, source: today ? "today.mix-end" : "contacts.detail" }));
  });
  } catch (error) { fail(contactId, error instanceof UserFacingError ? error.message : "This Mix could not be started.", session, today); }
  // Beats timed from an appointment have nothing to count from here; the confirmation says so
  // rather than presenting them as scheduled. The visit is chosen explicitly on the calendar.
  const notice = new URLSearchParams({ mixAssigned: mix.steps.length ? "visit" : "1", mixStart: startedOn });
  if (today) redirect(`/jumps?${notice}&mixPerson=${encodeURIComponent(contact.id)}`);
  redirect(`/contacts/${contact.id}?${notice}`);
}

/** The notice parameters a bulk start returns with; a later return drops them so the notice never repeats. */
const BULK_MIX_START_NOTICE = ["mixStarted", "mixKept", "mixSaved", "mixDated", "mixStartedId", "mixStartOn", "mixVisit", "mixUndo", "mixUndone", "mixUndoKept", "mixUndoDates"];

/** One start a bulk Add made, as recorded for its Undo (D46). */
type RecordedStart = { contactId: string; assignmentId: string; assignmentUpdatedAt: string; jumpDateId: string | null; jumpDateUpdatedAt: string | null };
const BULK_START_ACTION = "mix.assignment.bulk-start";

/** Back to the list the owner acted from, filters kept; anything else returns to Contacts. */
function contactsReturn(raw: string, notice: Record<string, string>): string {
  const base = /^\/contacts(\?[^#]*)?$/.test(raw) ? new URL(raw, "http://local") : new URL("/contacts", "http://local");
  for (const key of ["people", "error", "at", "sig", ...BULK_MIX_START_NOTICE, ...NO_MIX_NEEDED_NOTICE]) base.searchParams.delete(key);
  for (const [key, item] of Object.entries(notice)) base.searchParams.set(key, item);
  return `${base.pathname}?${base.searchParams}`;
}

/**
 * Starts the selected people on one Mix (JITM-09 §2.77). Like a start from the profile, it asks for a
 * start day, and the plan, Do not contact and stopped-Mix checks refuse the whole batch before anything is saved.
 */
export async function bulkAssignMixAction(formData: FormData): Promise<void> {
  const returnTo = value(formData, "returnTo");
  // A support view is refused by the shared guard, with its own message, back on the list (JITM-11 §2.11).
  const { workspace, user, session } = await requireWritableWorkspace((message, viewer) => redirect(withViewerError(contactsReturn(returnTo, {}), message, viewer)));
  const refuse: (message: string) => never = (message) => redirect(withViewerError(contactsReturn(returnTo, {}), message, session));
  const contactIds = [...new Set(formData.getAll("contactIds").map(String).filter(Boolean))];
  if (!contactIds.length) refuse("Select at least one Contact.");
  if (contactIds.length > 100) refuse("Add up to 100 people to a Mix at a time.");
  const timezone = await timezoneForUser(user.id);
  const start = startLogicalDate(value(formData, "startDate"), timezone);
  if (!start) refuse("Choose a start date from today on.");
  const [mix, contacts] = await Promise.all([
    prisma.mix.findFirst({ where: { id: value(formData, "mixId"), workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } }, select: { id: true, name: true, triggerMode: true, dateTypeId: true, steps: visitTimedBeats } }),
    prisma.contact.findMany({ where: { id: { in: contactIds }, workspaceId: workspace.id, archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })
  ]);
  if (!mix) refuse("Choose an active Mix.");
  if (contacts.length !== contactIds.length) refuse("One or more selected Contacts are unavailable.");
  const counts: MixStartCounts = { started: 0, "already-running": 0, "saved-date-kept": 0, "date-written": 0 };
  let undoId: string | null = null;
  try {
    undoId = await prisma.$transaction(async (tx) => {
      await assertRoomForPeople(tx, workspace.id, contacts.map(contact => contact.id));
      const starts: RecordedStart[] = [];
      for (const contact of contacts) {
        let outcome: MixStartOutcome;
        try { outcome = await startMixForContact(tx, { workspaceId: workspace.id, userId: user.id, contactId: contact.id, mix, start: start!, timezone, source: "contacts.bulk", queuePreparation: false }); }
        catch (error) { throw error instanceof UserFacingError ? new UserFacingError(`${contact.displayName}: ${error.message}`) : error; }
        counts[outcome.result] += 1;
        // Someone already in the Mix keeps their start, so Undo has nothing of theirs to end.
        if (outcome.result !== "already-running") starts.push({ contactId: contact.id, assignmentId: outcome.assignment.id, assignmentUpdatedAt: outcome.assignment.updatedAt.toISOString(), jumpDateId: outcome.writtenDate?.id ?? null, jumpDateUpdatedAt: outcome.writtenDate?.updatedAt.toISOString() ?? null });
      }
      // One preparation pass for the Mix rather than one per person: the worker reads only mixId, so it prepares
      // the whole Mix once, as a save of that Mix does, and contactIds lets these people read as being prepared.
      await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { mixId: mix.id, contactIds: contacts.map(contact => contact.id) } } });
      if (!starts.length) return null;
      // The record of what this action started, which its Undo reads back (D46).
      return (await tx.auditLog.create({ select: { id: true }, data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: BULK_START_ACTION, entityType: "Mix", entityId: mix.id, source: "contacts.bulk", metadata: { mixId: mix.id, starts } } })).id;
    }, { timeout: 30_000 });
  } catch (error) { refuse(error instanceof UserFacingError ? error.message : "These people could not be added to the Mix."); }
  // The notice is built from what each start did and names the Mix (JITM-04 §2.7).
  const notice: Record<string, string> = {
    mixStarted: String(counts.started + counts["saved-date-kept"] + counts["date-written"]),
    mixStartedId: mix.id,
    mixStartOn: logicalDateKey(start),
    ...(counts["already-running"] ? { mixKept: String(counts["already-running"]) } : {}),
    ...(counts["saved-date-kept"] ? { mixSaved: String(counts["saved-date-kept"]) } : {}),
    ...(counts["date-written"] ? { mixDated: String(counts["date-written"]) } : {}),
    ...(mix.steps.length ? { mixVisit: "1" } : {}),
    ...(undoId ? { mixUndo: undoId } : {})
  };
  redirect(contactsReturn(returnTo, notice));
}

function recordedStarts(metadata: Prisma.JsonValue | null | undefined): RecordedStart[] {
  const starts = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Prisma.JsonObject).starts : null;
  if (!Array.isArray(starts)) return [];
  return starts.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { contactId, assignmentId, assignmentUpdatedAt, jumpDateId, jumpDateUpdatedAt } = item as Record<string, unknown>;
    if (typeof contactId !== "string" || typeof assignmentId !== "string" || typeof assignmentUpdatedAt !== "string") return [];
    return [{ contactId, assignmentId, assignmentUpdatedAt, jumpDateId: typeof jumpDateId === "string" ? jumpDateId : null, jumpDateUpdatedAt: typeof jumpDateUpdatedAt === "string" ? jumpDateUpdatedAt : null }];
  });
}

/**
 * Undo for Add to the Mix (D46, JITM-08 §2.5). It ends the starts that one bulk action made: the assignments it
 * created or reactivated go inactive, the follow-ups still to come from them are cancelled, and a saved date the
 * start wrote is removed. Completed and skipped follow-ups and all history stay (JITM-00 §2.6). Anything changed
 * since, such as a person started again on their own, is left as it is.
 */
export async function undoBulkMixStartAction(formData: FormData): Promise<void> {
  const returnTo = value(formData, "returnTo");
  const { workspace, user } = await requireWritableWorkspace((message, viewer) => redirect(withViewerError(contactsReturn(returnTo, {}), message, viewer)));
  const undoId = value(formData, "undoId").slice(0, 64);
  const record = undoId ? await prisma.auditLog.findFirst({ where: { id: undoId, workspaceId: workspace.id, action: BULK_START_ACTION }, select: { id: true, entityId: true, metadata: true } }) : null;
  const starts = recordedStarts(record?.metadata);
  if (!record?.entityId || !starts.length) redirect(contactsReturn(returnTo, { mixUndone: "0" }));
  const mixId = record.entityId;
  const result = await prisma.$transaction(async (tx) => {
    // Row locks make a double tap end each start once: the second request waits, then finds nothing unchanged.
    const rows = await tx.$queryRaw<Array<{ id: string; contactId: string | null; isActive: boolean; updatedAt: Date }>>`
      SELECT id, "contactId", "isActive", "updatedAt" FROM "MixAssignment"
      WHERE "workspaceId" = ${workspace.id} AND "mixId" = ${mixId} AND id IN (${Prisma.join(starts.map(start => start.assignmentId))}) ORDER BY id FOR UPDATE`;
    const byId = new Map(rows.map(row => [row.id, row]));
    const unchanged = starts.filter(start => {
      const row = byId.get(start.assignmentId);
      return row?.isActive && row.contactId === start.contactId && row.updatedAt.getTime() === Date.parse(start.assignmentUpdatedAt);
    });
    if (!unchanged.length) return { ended: 0, kept: starts.length, dates: 0 };
    const contactIds = unchanged.map(start => start.contactId);
    await tx.mixAssignment.updateMany({ where: { workspaceId: workspace.id, id: { in: unchanged.map(start => start.assignmentId) } }, data: { isActive: false } });
    // Only follow-ups still to come; done and skipped ones are history. Cancelled as reconciled, so the pass
    // queued below brings back any that a tag still runs for the person.
    await tx.jump.updateMany({ where: { workspaceId: workspace.id, mixId, contactId: { in: contactIds }, status: "PENDING" }, data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" } });
    let dates = 0;
    for (const start of unchanged) {
      if (!start.jumpDateId || !start.jumpDateUpdatedAt) continue;
      dates += (await tx.jumpDate.updateMany({ where: { id: start.jumpDateId, workspaceId: workspace.id, contactId: start.contactId, isActive: true, updatedAt: new Date(start.jumpDateUpdatedAt) }, data: { isActive: false } })).count;
    }
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { mixId } } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "mix.assignment.bulk-undo", entityType: "Mix", entityId: mixId, source: "contacts.bulk", metadata: { startRecordId: record.id, contactIds, endedDates: dates } } });
    return { ended: unchanged.length, kept: starts.length - unchanged.length, dates };
  });
  redirect(contactsReturn(returnTo, { mixUndone: String(result.ended), mixStartedId: mixId, ...(result.kept ? { mixUndoKept: String(result.kept) } : {}), ...(result.dates ? { mixUndoDates: String(result.dates) } : {}) }));
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
