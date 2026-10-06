"use server";

import { Prisma, type AssignmentMode } from "@/generated/prisma/client";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { timezoneForUser, timezoneForWorkspace } from "@/lib/display-preferences";
import { logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { NO_MIX_NEEDED_NOTICE, type MixStartCounts, type MixStartResult } from "@/lib/contact-mix-status-labels";
import { contactIdsInMix, contactMixStatuses } from "@/lib/contact-mix-status";

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
  /** The assignment as it was before this start, or null when the start created it; Undo puts it back (UNDO-02). */
  previous: { isActive: boolean; startDate: Date | null; mode: AssignmentMode } | null;
};

/**
 * Starts one person on a Mix inside the caller's transaction, after the plan and eligibility checks.
 * The chosen day is where the plan starts. A plan that starts from a saved date gets that date when
 * the person has none; one they already have is kept. Returns what the confirmation names.
 */
async function startMixForContact(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string; contactId: string; mix: StartableMix; start: LogicalDate; timezone: string; source: string; queuePreparation?: boolean }): Promise<MixStartOutcome> {
  const { workspaceId, contactId, mix, start, timezone } = input;
  await assertMixStartEligible(tx, workspaceId, contactId, mix.id);
  const assignmentKey = `${workspaceId}:${mix.id}:${contactId}`;
  const startAt = zonedDateTimeToUtc(start, 12 * 60, timezone);
  let startedOn: string = logicalDateKey(start);
  const previous = await tx.mixAssignment.findUnique({ where: { assignmentKey }, select: { isActive: true, startDate: true, mode: true } });
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
  // A bulk start queues one job for all of its people instead (PERF-01).
  if (input.queuePreparation !== false) await tx.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId, mixId: mix.id } } });
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
  return { result, startedOn, waitsForVisit: mix.steps.length > 0, assignment: { id: assignment.id, updatedAt: assignment.updatedAt }, writtenDate, previous };
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
const BULK_MIX_START_NOTICE = ["mixStarted", "mixKept", "mixSaved", "mixDated", "mixStartedId", "mixStartOn", "mixVisit", "mixUndo", "mixUndone", "mixUndoKept", "mixUndoDates", "mixUndoConfirmed"];

/** One start a bulk Add made, as recorded for its Undo (D46): what it changed, and what was there before. */
type RecordedStart = {
  contactId: string; assignmentId: string; assignmentUpdatedAt: string; jumpDateId: string | null; jumpDateUpdatedAt: string | null;
  previous: { isActive: boolean; startDate: string | null; mode: AssignmentMode } | null; noMixNeeded: boolean;
};
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
      // Anyone this Mix already has work for, by any route (their own start, its audience or a tag, a visit or
      // Journey work), keeps their start and gets no second run (BLK-02).
      const alreadyIn = await contactIdsInMix(tx, workspace.id, mix.id, contacts.map(contact => contact.id));
      // A No Mix needed confirmation in force before the start, which Undo puts back (UNDO-02).
      const before = await contactMixStatuses(workspace.id, contacts.map(contact => contact.id), new Date(), tx);
      const starts: RecordedStart[] = [];
      for (const contact of contacts) {
        if (alreadyIn.has(contact.id)) { counts["already-running"] += 1; continue; }
        let outcome: MixStartOutcome;
        try { outcome = await startMixForContact(tx, { workspaceId: workspace.id, userId: user.id, contactId: contact.id, mix, start: start!, timezone, source: "contacts.bulk", queuePreparation: false }); }
        catch (error) { throw error instanceof UserFacingError ? new UserFacingError(`${contact.displayName}: ${error.message}`) : error; }
        counts[outcome.result] += 1;
        // Someone already in the Mix keeps their start, so Undo has nothing of theirs to end.
        if (outcome.result !== "already-running") starts.push({
          contactId: contact.id, assignmentId: outcome.assignment.id, assignmentUpdatedAt: outcome.assignment.updatedAt.toISOString(),
          jumpDateId: outcome.writtenDate?.id ?? null, jumpDateUpdatedAt: outcome.writtenDate?.updatedAt.toISOString() ?? null,
          previous: outcome.previous ? { isActive: outcome.previous.isActive, startDate: outcome.previous.startDate?.toISOString() ?? null, mode: outcome.previous.mode } : null,
          noMixNeeded: before.get(contact.id) === "no-mix-needed"
        });
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
    const { contactId, assignmentId, assignmentUpdatedAt, jumpDateId, jumpDateUpdatedAt, previous, noMixNeeded } = item as Record<string, unknown>;
    if (typeof contactId !== "string" || typeof assignmentId !== "string" || typeof assignmentUpdatedAt !== "string") return [];
    const earlier = previous && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, unknown> : null;
    return [{
      contactId, assignmentId, assignmentUpdatedAt,
      jumpDateId: typeof jumpDateId === "string" ? jumpDateId : null, jumpDateUpdatedAt: typeof jumpDateUpdatedAt === "string" ? jumpDateUpdatedAt : null,
      previous: earlier && typeof earlier.isActive === "boolean" && (earlier.mode === "SNAPSHOT" || earlier.mode === "DYNAMIC")
        ? { isActive: earlier.isActive, startDate: typeof earlier.startDate === "string" ? earlier.startDate : null, mode: earlier.mode } : null,
      noMixNeeded: noMixNeeded === true
    }];
  });
}

/**
 * Undo for Add to the Mix (D46, JITM-08 §2.5). It takes back the starts that one bulk action made, and only
 * those: each assignment goes back to how it was before (ended when the start created it, or restored with
 * its earlier start when it existed), the follow-ups still to come that the start produced are cancelled, a
 * saved date the start wrote is removed, and a No Mix needed confirmation the start replaced is put back.
 * Completed and skipped follow-ups, history, Journey-managed work, a visit's work and other routes' work are
 * never touched (JITM-00 §2.6, UNDO-01). Anything changed since, such as a person started again on their own,
 * is left as it is.
 */
export async function undoBulkMixStartAction(formData: FormData): Promise<void> {
  const returnTo = value(formData, "returnTo");
  const { workspace, user, session } = await requireWritableWorkspace((message, viewer) => redirect(withViewerError(contactsReturn(returnTo, {}), message, viewer)));
  const undoId = value(formData, "undoId").slice(0, 64);
  const record = undoId ? await prisma.auditLog.findFirst({ where: { id: undoId, workspaceId: workspace.id, action: BULK_START_ACTION }, select: { id: true, entityId: true, metadata: true, createdAt: true } }) : null;
  const starts = recordedStarts(record?.metadata);
  if (!record?.entityId || !starts.length) redirect(contactsReturn(returnTo, { mixUndone: "0" }));
  const mixId = record.entityId;
  // The scheduler keys a hand-started run by its start day in the owner's time zone, and a planned Beat by the
  // Beat; a date-based run by the person's dates; a fixed-date Mix by its schedule (src/lib/jump-engine.ts).
  const [mix, ownerTimezone] = await Promise.all([prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id }, select: { triggerMode: true } }), timezoneForWorkspace(workspace.id)]);
  const occurrencesOf = (start: RecordedStart, row: { startDate: Date | null; createdAt: Date }) => mix?.triggerMode === "DATE_TRIGGERED"
    ? [start.jumpDateId ? `jump-date:${start.jumpDateId}:` : "jump-date:"]
    : mix?.triggerMode === "BROADCAST" ? ["broadcast:"] : [`manual:${logicalDateKey(logicalDateInTimezone(row.startDate ?? row.createdAt, ownerTimezone))}`, "planned:"];
  let result: { ended: number; kept: number; dates: number; confirmed: number };
  try {
    result = await prisma.$transaction(async (tx) => {
      // Row locks make a double tap end each start once: the second request waits, then finds nothing unchanged.
      const rows = await tx.$queryRaw<Array<{ id: string; contactId: string | null; isActive: boolean; startDate: Date | null; createdAt: Date; updatedAt: Date }>>`
        SELECT id, "contactId", "isActive", "startDate", "createdAt", "updatedAt" FROM "MixAssignment"
        WHERE "workspaceId" = ${workspace.id} AND "mixId" = ${mixId} AND id IN (${Prisma.join(starts.map(start => start.assignmentId))}) ORDER BY id FOR UPDATE`;
      const byId = new Map(rows.map(row => [row.id, row]));
      const unchanged = starts.filter(start => {
        const row = byId.get(start.assignmentId);
        return row?.isActive && row.contactId === start.contactId && row.updatedAt.getTime() === Date.parse(start.assignmentUpdatedAt);
      });
      if (!unchanged.length) return { ended: 0, kept: starts.length, dates: 0, confirmed: 0 };
      let dates = 0;
      for (const start of unchanged) {
        await tx.mixAssignment.update({ where: { id: start.assignmentId }, data: start.previous
          ? { isActive: start.previous.isActive, startDate: start.previous.startDate ? new Date(start.previous.startDate) : null, mode: start.previous.mode }
          : { isActive: false } });
        // The start's own follow-ups still to come: the scheduler's rows keyed to its run, written since it. Done and
        // skipped rows are history. Cancelled as reconciled, so the pass queued below brings back any row that
        // another enrollment of the person shares, such as a tag running the Mix from the same day.
        await tx.jump.updateMany({
          where: {
            workspaceId: workspace.id, mixId, contactId: start.contactId, status: "PENDING", workflowManaged: false, appointmentBindingId: null,
            AND: [
              { OR: [{ createdAt: { gte: record.createdAt } }, { updatedAt: { gte: record.createdAt } }] },
              { OR: occurrencesOf(start, byId.get(start.assignmentId)!).map(prefix => ({ templateSnapshot: { path: ["occurrenceKey"], string_starts_with: prefix } })) }
            ]
          },
          data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" }
        });
        if (start.jumpDateId && start.jumpDateUpdatedAt) {
          dates += (await tx.jumpDate.updateMany({ where: { id: start.jumpDateId, workspaceId: workspace.id, contactId: start.contactId, isActive: true, updatedAt: new Date(start.jumpDateUpdatedAt) }, data: { isActive: false } })).count;
        }
      }
      // A confirmation the start replaced comes back, written after everything above, so it counts again.
      const confirmed = unchanged.filter(start => start.noMixNeeded).map(start => start.contactId);
      const confirmedAt = new Date();
      for (const contactId of confirmed) {
        await tx.contactRelationshipState.upsert({ where: { contactId }, create: { workspaceId: workspace.id, contactId, noMixNeededAt: confirmedAt }, update: { noMixNeededAt: confirmedAt } });
      }
      await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { mixId } } });
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "mix.assignment.bulk-undo", entityType: "Mix", entityId: mixId, source: "contacts.bulk", metadata: { startRecordId: record.id, contactIds: unchanged.map(start => start.contactId), endedDates: dates, restoredConfirmations: confirmed } } });
      return { ended: unchanged.length, kept: starts.length - unchanged.length, dates, confirmed: confirmed.length };
    }, { timeout: 30_000 });
  } catch {
    // A lock timeout or deadlock comes back to the list with nothing changed, not the error page (ERR-01).
    redirect(withViewerError(contactsReturn(returnTo, {}), "Nothing was undone. Try again in a moment.", session));
  }
  redirect(contactsReturn(returnTo, { mixUndone: String(result.ended), mixStartedId: mixId, ...(result.kept ? { mixUndoKept: String(result.kept) } : {}), ...(result.dates ? { mixUndoDates: String(result.dates) } : {}), ...(result.confirmed ? { mixUndoConfirmed: String(result.confirmed) } : {}) }));
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
