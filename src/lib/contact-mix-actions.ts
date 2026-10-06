"use server";

import { Prisma } from "@/generated/prisma/client";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { timezoneForUser } from "@/lib/display-preferences";
import { logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import type { MixStartCounts, MixStartResult } from "@/lib/contact-mix-status-labels";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(contactId: string, message: string, viewer: ErrorViewer): never {
  redirect(withViewerError(`/contacts/${encodeURIComponent(contactId)}`, message, viewer));
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

/** `steps` holds the Mix's active Beats timed from an appointment (at most one is needed). */
type StartableMix = { id: string; name: string; triggerMode: string; dateTypeId: string | null; steps: { id: string }[] };
/** The Beats that tell whether a Mix waits for a visit: active ones timed from an appointment. */
const visitTimedBeats = { where: { isActive: true, anchor: { not: "CALENDAR_DAY" as const } }, select: { id: true }, take: 1 };

/** What one start did, for the confirmation (JITM-04 §2.7). */
type MixStartOutcome = {
  /** started, already running (keeps its start), saved date kept, or date written. */
  result: MixStartResult;
  /** The day the confirmation names (YYYY-MM-DD): the chosen day, or the start a running Mix keeps; "saved" when it follows the person's saved date. */
  startedOn: string;
  /** Whether any of the Mix's Beats is timed from an appointment, so it waits until the person is lined up with a visit. */
  waitsForVisit: boolean;
  /** The assignment as this start left it, and the saved date it wrote, if any: a bulk Undo ends only what nothing changed since (D46). */
  assignment: { id: string; updatedAt: Date };
  writtenDate: { id: string; updatedAt: Date } | null;
};

/**
 * Starts one person on a Mix inside the caller's transaction, after the plan and eligibility checks.
 * The chosen day is where the plan starts. A plan that starts from a saved date gets that date when
 * the person has none; one they already have is kept. Returns what the confirmation names.
 */
async function startMixForContact(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string; contactId: string; mix: StartableMix; start: LogicalDate; timezone: string; source: string }): Promise<MixStartOutcome> {
  const { workspaceId, contactId, mix, start, timezone } = input;
  await assertMixStartEligible(tx, workspaceId, contactId, mix.id);
  const assignmentKey = `${workspaceId}:${mix.id}:${contactId}`;
  const startAt = zonedDateTimeToUtc(start, 12 * 60, timezone);
  let startedOn: string = logicalDateKey(start);
  const previous = await tx.mixAssignment.findUnique({ where: { assignmentKey }, select: { isActive: true } });
  // A finished or removed plan restarts from the chosen day; one still running keeps its start.
  const restart = !previous || !previous.isActive || !(await tx.jump.count({ where: { workspaceId, contactId, mixId: mix.id, status: "PENDING" } }));
  let result: MixStartResult = restart ? "started" : "already-running";
  const assignment = await tx.mixAssignment.upsert({
    where: { assignmentKey },
    create: {
      assignmentKey,
      workspaceId,
      mixId: mix.id,
      contactId,
      startDate: mix.triggerMode === "MANUAL_START" ? startAt : null,
      isActive: true
    },
    update: { isActive: true, ...(mix.triggerMode === "MANUAL_START" && restart ? { startDate: startAt } : {}) }
  });
  if (mix.triggerMode === "MANUAL_START" && !restart && previous) {
    const current = await tx.mixAssignment.findUnique({ where: { assignmentKey }, select: { startDate: true } });
    if (current?.startDate) startedOn = logicalDateKey(logicalDateInTimezone(current.startDate, timezone));
  }
  let writtenDate: MixStartOutcome["writtenDate"] = null;
  if (mix.triggerMode === "DATE_TRIGGERED" && mix.dateTypeId) {
    const saved = await tx.jumpDate.findFirst({ where: { workspaceId, contactId, dateTypeId: mix.dateTypeId, isActive: true }, select: { id: true } });
    if (saved) {
      startedOn = "saved";
      if (restart) result = "saved-date-kept";
    } else {
      writtenDate = await tx.jumpDate.create({ select: { id: true, updatedAt: true }, data: {
        workspaceId, contactId, dateTypeId: mix.dateTypeId,
        dateValue: new Date(Date.UTC(start.year, start.month - 1, start.day, 12)), month: start.month, day: start.day,
        recurrence: "NONE", timezone, label: mix.name
      } });
      if (restart) result = "date-written";
    }
  }
  await tx.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId, mixId: mix.id } } });
  await tx.auditLog.create({
    data: {
      workspaceId,
      actorType: "USER",
      actorUserId: input.userId,
      action: "mix.assignment.activate",
      entityType: "MixAssignment",
      entityId: assignment.id,
      source: input.source,
      metadata: { contactId, mixId: mix.id, startedOn, result }
    }
  });
  return { result, startedOn, waitsForVisit: mix.steps.length > 0, assignment: { id: assignment.id, updatedAt: assignment.updatedAt }, writtenDate };
}

export async function assignMixToContactAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const contactId = value(formData, "contactId");
  if (impersonation) fail(contactId, "Administrator support sessions are view-only.", session);
  const timezone = await timezoneForUser(user.id);
  const start = startLogicalDate(value(formData, "startDate"), timezone);
  if (!start) fail(contactId, "Choose a start date from today on.", session);
  const [mix, contact] = await Promise.all([
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" }, select: { id: true, name: true, triggerMode: true, dateTypeId: true, steps: visitTimedBeats } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } })
  ]);
  if (!mix || !contact) fail(contactId, "Choose an active Mix.", session);

  let startedOn = logicalDateKey(start);
  try { await prisma.$transaction(async (tx) => {
    await assertRoomForPeople(tx, workspace.id, [contact.id]);
    ({ startedOn } = await startMixForContact(tx, { workspaceId: workspace.id, userId: user.id, contactId: contact.id, mix, start, timezone, source: "contacts.detail" }));
  });
  } catch (error) { fail(contactId, error instanceof UserFacingError ? error.message : "This Mix could not be started.", session); }
  // Beats timed from an appointment have nothing to count from here; the confirmation says so
  // rather than presenting them as scheduled. The visit is chosen explicitly on the calendar.
  redirect(`/contacts/${contact.id}?${new URLSearchParams({ mixAssigned: mix.steps.length ? "visit" : "1", mixStart: startedOn })}`);
}

/** The notice parameters a bulk start returns with; a later return drops them so the notice never repeats. */
const BULK_MIX_START_NOTICE = ["mixStarted", "mixKept", "mixSaved", "mixDated", "mixStartedId", "mixStartOn", "mixVisit", "mixUndo", "mixUndone", "mixUndoKept", "mixUndoDates"];

/** One start a bulk Add made, as recorded for its Undo (D46). */
type RecordedStart = { contactId: string; assignmentId: string; assignmentUpdatedAt: string; jumpDateId: string | null; jumpDateUpdatedAt: string | null };
const BULK_START_ACTION = "mix.assignment.bulk-start";

/** Back to the list the owner acted from, filters kept; anything else returns to Contacts. */
function contactsReturn(raw: string, notice: Record<string, string>): string {
  const base = /^\/contacts(\?[^#]*)?$/.test(raw) ? new URL(raw, "http://local") : new URL("/contacts", "http://local");
  for (const key of ["people", "error", "at", "sig", ...BULK_MIX_START_NOTICE, "noMixNeeded", "noMixCleared", "noMixSkipped", "noMixPeople"]) base.searchParams.delete(key);
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
        try { outcome = await startMixForContact(tx, { workspaceId: workspace.id, userId: user.id, contactId: contact.id, mix, start: start!, timezone, source: "contacts.bulk" }); }
        catch (error) { throw error instanceof UserFacingError ? new UserFacingError(`${contact.displayName}: ${error.message}`) : error; }
        counts[outcome.result] += 1;
        // Someone already in the Mix keeps their start, so Undo has nothing of theirs to end.
        if (outcome.result !== "already-running") starts.push({ contactId: contact.id, assignmentId: outcome.assignment.id, assignmentUpdatedAt: outcome.assignment.updatedAt.toISOString(), jumpDateId: outcome.writtenDate?.id ?? null, jumpDateUpdatedAt: outcome.writtenDate?.updatedAt.toISOString() ?? null });
      }
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
