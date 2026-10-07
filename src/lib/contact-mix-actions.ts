"use server";

import { Prisma, type AssignmentMode } from "@/generated/prisma/client";
import { assertRoomForPeople } from "@/lib/plan-limits";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { timezoneForUser, timezoneForWorkspace } from "@/lib/display-preferences";
import { startMixForContact, visitTimedBeats, type MixStartOutcome } from "@/lib/contact-mix-start";
import { logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/user-facing-error";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { NO_MIX_NEEDED_NOTICE, type MixStartCounts, type MixStartResult } from "@/lib/contact-mix-status-labels";
import { contactIdsInMix, contactMixStatuses } from "@/lib/contact-mix-status";
import { endLockedEnrollmentWorkflows, ENROLLMENT_REMOVED_REASON, ENROLLMENT_UNDONE_REASON, lockEnrollmentWorkflows, workflowTookUpdate } from "@/lib/enrollment-workflow";
import type { WorkflowState } from "@/lib/mix-workflow-types";

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
const BULK_MIX_START_NOTICE = ["mixStarted", "mixKept", "mixSaved", "mixDated", "mixStartedId", "mixStartOn", "mixVisit", "mixUndo", "mixUndone", "mixUndoKept", "mixUndoDates", "mixUndoConfirmed"];

/**
 * How the scheduler keys one enrollment's run (src/lib/jump-engine.ts). `triggers` key its Journey record
 * (`state.context.occurrenceKey`) and its Beats: a hand-started run by its start day in the owner's time zone, a
 * date-based run by the person's dates (only the date a start wrote, when it wrote one), a fixed-date Mix by its
 * schedule, a visit-bound run by its binding. `beats` adds the planned Beats, keyed by Beat for every start type.
 */
function runKeys(input: { triggerMode: string | undefined; startDate: Date | null; createdAt: Date; ownerTimezone: string; jumpDateId?: string | null; bindingId?: string | null }): { triggers: string[]; beats: string[] } {
  if (input.bindingId) return { triggers: [`appointment:${input.bindingId}`], beats: [`appointment:${input.bindingId}`] };
  const triggers = input.triggerMode === "DATE_TRIGGERED" ? [input.jumpDateId ? `jump-date:${input.jumpDateId}:` : "jump-date:"]
    : input.triggerMode === "BROADCAST" ? ["broadcast:"]
    : [`manual:${logicalDateKey(logicalDateInTimezone(input.startDate ?? input.createdAt, input.ownerTimezone))}`];
  return { triggers, beats: [...triggers, "planned:"] };
}
const occurrenceIn = (prefixes: string[]) => ({ OR: prefixes.map(prefix => ({ templateSnapshot: { path: ["occurrenceKey"], string_starts_with: prefix } })) });

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
  const [mix, ownerTimezone] = await Promise.all([prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id }, select: { triggerMode: true } }), timezoneForWorkspace(workspace.id)]);
  const keysOf = (start: RecordedStart, row: { startDate: Date | null; createdAt: Date }) => runKeys({ triggerMode: mix?.triggerMode, startDate: row.startDate, createdAt: row.createdAt, ownerTimezone, jumpDateId: start.jumpDateId });
  let result: { ended: number; kept: number; dates: number; confirmed: number };
  try {
    result = await prisma.$transaction(async (tx) => {
      // Row locks make a double tap end each start once: the second request waits, then finds nothing unchanged.
      const rows = await tx.$queryRaw<Array<{ id: string; contactId: string | null; isActive: boolean; startDate: Date | null; createdAt: Date; updatedAt: Date }>>`
        SELECT id, "contactId", "isActive", "startDate", "createdAt", "updatedAt" FROM "MixAssignment"
        WHERE "workspaceId" = ${workspace.id} AND "mixId" = ${mixId} AND id IN (${Prisma.join(starts.map(start => start.assignmentId))}) ORDER BY id FOR UPDATE`;
      const byId = new Map(rows.map(row => [row.id, row]));
      const untouched = starts.filter(start => {
        const row = byId.get(start.assignmentId);
        return row?.isActive && row.contactId === start.contactId && row.updatedAt.getTime() === Date.parse(start.assignmentUpdatedAt);
      });
      // In an account with a Journey connection each start also has a Journey record for its run. Lock those first, in
      // the Journey pass's order. A start whose record took a business update since was moved on by the owner in
      // Journey, so it counts as changed since and is left as it is (UNDO-04, UNDO-05).
      const journeys = new Map<string, Awaited<ReturnType<typeof lockEnrollmentWorkflows>>>();
      for (const start of untouched) journeys.set(start.assignmentId, await lockEnrollmentWorkflows(tx, { workspaceId: workspace.id, contactId: start.contactId, mixId, occurrencePrefixes: keysOf(start, byId.get(start.assignmentId)!).triggers }));
      const unchanged = untouched.filter(start => !journeys.get(start.assignmentId)!.some(record => workflowTookUpdate(record.state as unknown as WorkflowState)));
      if (!unchanged.length) return { ended: 0, kept: starts.length, dates: 0, confirmed: 0 };
      const endedAt = new Date();
      let dates = 0, journeysEnded = 0;
      for (const start of unchanged) {
        await tx.mixAssignment.update({ where: { id: start.assignmentId }, data: start.previous
          ? { isActive: start.previous.isActive, startDate: start.previous.startDate ? new Date(start.previous.startDate) : null, mode: start.previous.mode }
          : { isActive: false } });
        // The start's own follow-ups still to come: the scheduler's rows keyed to its run, planned Beats included,
        // written since it. Done and skipped rows are history. Cancelled as reconciled, so the pass queued below
        // brings back any row that another enrollment of the person shares, such as a tag running the Mix from the
        // same day.
        await tx.jump.updateMany({
          where: {
            workspaceId: workspace.id, mixId, contactId: start.contactId, status: "PENDING", workflowManaged: false, appointmentBindingId: null,
            AND: [{ OR: [{ createdAt: { gte: record.createdAt } }, { updatedAt: { gte: record.createdAt } }] }, occurrenceIn(keysOf(start, byId.get(start.assignmentId)!).beats)]
          },
          data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" }
        });
        // Then its Journey record's run ends with it, so nothing asks the owner about those Beats or keeps a plan place.
        journeysEnded += await endLockedEnrollmentWorkflows(tx, journeys.get(start.assignmentId)!, ENROLLMENT_UNDONE_REASON, endedAt);
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
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "mix.assignment.bulk-undo", entityType: "Mix", entityId: mixId, source: "contacts.bulk", metadata: { startRecordId: record.id, contactIds: unchanged.map(start => start.contactId), endedDates: dates, restoredConfirmations: confirmed, endedJourneyRecords: journeysEnded } } });
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
    select: { id: true, mixId: true, startDate: true, createdAt: true, mix: { select: { triggerMode: true } }, appointmentBinding: { select: { id: true } } }
  });
  if (!assignment) fail(contactId, "Mix assignment not found.", session);
  const keys = runKeys({ triggerMode: assignment.mix.triggerMode, startDate: assignment.startDate, createdAt: assignment.createdAt, ownerTimezone: await timezoneForWorkspace(workspace.id), bindingId: assignment.appointmentBinding?.id ?? null });

  await prisma.$transaction(async (tx) => {
    // The run's Journey record, locked before its Beats in the Journey pass's order (UNDO-04).
    const journeys = await lockEnrollmentWorkflows(tx, { workspaceId: workspace.id, contactId, mixId: assignment.mixId, occurrencePrefixes: keys.triggers });
    await tx.mixAssignment.update({ where: { id: assignment.id }, data: { isActive: false } });
    // The run's follow-ups still to come end now, cancelled as reconciled as the scheduler's next pass would have
    // done, so that pass brings back any row another enrollment of the person still wants.
    await tx.jump.updateMany({
      where: { workspaceId: workspace.id, mixId: assignment.mixId, contactId, status: "PENDING", workflowManaged: false, appointmentBindingId: assignment.appointmentBinding?.id ?? null, ...occurrenceIn(keys.beats) },
      data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" }
    });
    // Its Journey record's run ends too, so Today, the morning email and Journey People don't ask about those Beats
    // and the record keeps no plan place; a later start of the same Mix and day picks it back up.
    const journeysEnded = await endLockedEnrollmentWorkflows(tx, journeys, ENROLLMENT_REMOVED_REASON, new Date());
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId, mixId: assignment.mixId } } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.assignment.deactivate",
        entityType: "MixAssignment",
        entityId: assignment.id,
        source: "contacts.detail",
        metadata: { contactId, mixId: assignment.mixId, endedJourneyRecords: journeysEnded }
      }
    });
  }, { timeout: 30_000 });
  redirect(`/contacts/${contactId}?mixRemoved=1`);
}
