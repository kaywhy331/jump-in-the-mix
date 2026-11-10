"use server";
import { workflowContinuation } from "@/lib/workflow-continuation";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { parseCalendarTime } from "@/lib/calendar-time";
import { importCalendar, queueBoundReconciliation, syncCalendarConnection } from "@/lib/calendar";
import { CALENDAR_CONNECTION_STAGES } from "@/lib/calendar-connection-stages";
import { ContactChoiceRequiredError, recordAppointmentOutcome, scheduleVisit, setAppointmentBindingDelivery, setAppointmentBindingHold, type AppointmentOutcome, type ContactCandidate } from "@/lib/appointment-bindings";
import { calendarFeedUrl } from "@/lib/calendar-feed-fetch";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { createConnectionToken } from "@/lib/connection-tokens";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { UserFacingError } from "@/lib/user-facing-error";

const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
/** A failed save says once that the form kept what was entered (JITM-08 §2.24). */
const ENTRIES_KEPT = "Your entries are kept.";
async function context() { const ctx = await requireWorkspace(); if (ctx.impersonation) throw new Error("Support sessions are view-only."); return ctx; }
/** The save either failed with a message or needs one inline choice between saved people; the form keeps everything entered either way. */
export type CalendarSaveState = { error: string; choice?: { candidates: ContactCandidate[] } };
export async function saveCalendarAction(_state: CalendarSaveState, data: FormData): Promise<CalendarSaveState> {
  const { workspace, user } = await context(); const timezone = value(data, "timezone");
  let result: Awaited<ReturnType<typeof scheduleVisit>>;
  try {
    result = await scheduleVisit({ workspaceId: workspace.id, actorUserId: user.id, id: value(data, "id") || undefined, version: Number(value(data, "version")), title: value(data, "title"), kind: value(data, "kind"), location: value(data, "location"), link: value(data, "link"), details: value(data, "details"), contactId: value(data, "contactId"), startsAt: parseCalendarTime(value(data, "startsAt"), timezone), endsAt: parseCalendarTime(value(data, "endsAt"), timezone), timezone, planId: value(data, "planId") || null, newContact: value(data, "newContactName") ? { name: value(data, "newContactName"), phone: value(data, "newContactPhone"), email: value(data, "newContactEmail"), resolvedContactId: value(data, "resolvedContactId") || null } : null, allowOverlap: data.get("allowOverlap") === "on" });
  } catch (error) {
    if (error instanceof ContactChoiceRequiredError) return { error: "", choice: { candidates: error.candidates } };
    return { error: error instanceof UserFacingError ? error.message : `This event could not be saved. ${ENTRIES_KEPT}` };
  }
  const next = new URLSearchParams({ date: value(data, "startsAt").slice(0, 10), saved: "1", savedEvent: result.entryId });
  const returnTo = workflowContinuation(value(data, "returnTo"));
  if (returnTo) next.set("returnTo", returnTo);
  if (result.bindingId) next.set("plan", "1");
  for (const [key, count] of Object.entries(result.outlook ?? {})) if (count > 0) next.set(key, String(count));
  if (result.unscopedEnrollmentKept) next.set("kept", "1");
  if (result.createdContact) next.set("person", "1");
  redirect(`/calendar?${next}`);
}

/** What happened at the visit: it anchors the bound plan and is a journey event the stage rules can act on. */
export async function appointmentOutcomeAction(data: FormData) {
  const { workspace, user, session } = await context();
  const raw = value(data, "outcome");
  const outcome = raw === "COMPLETED" || raw === "NO_SHOW" ? raw as AppointmentOutcome : null;
  const result = await recordAppointmentOutcome({ workspaceId: workspace.id, actorUserId: user.id, entryId: value(data, "id"), version: Number(value(data, "version")), outcome });
  if (!result.ok) redirect(withViewerError(`/calendar?${calendarPlace(data)}`, result.message, session));
  // The confirmation names the visit and what was recorded (TRU-07).
  redirect(`/calendar?${calendarPlace(data, { done: outcome === "COMPLETED" ? "happened" : outcome === "NO_SHOW" ? "no-show" : "cleared", event: value(data, "id") })}`);
}

/** Hold or resume one visit's follow-ups without touching the person's other plans. */
export async function appointmentBindingHoldAction(data: FormData) {
  const { workspace, session } = await context();
  const changed = await setAppointmentBindingHold({ workspaceId: workspace.id, bindingId: value(data, "bindingId"), held: value(data, "held") === "1" });
  // A notice confirms only a change that happened (CAL-02).
  if (!changed) redirect(withViewerError(`/calendar?${calendarPlace(data)}`, "This visit’s follow-ups changed. Refresh the calendar and try again.", session));
  redirect(`/calendar?${calendarPlace(data, { done: value(data, "held") === "1" ? "held" : "resumed", binding: value(data, "bindingId") })}`);
}

/** Automatic sending for one visit's follow-ups stays off until the owner turns it on here. */
export async function appointmentBindingDeliveryAction(data: FormData) {
  const { workspace, session } = await context();
  const changed = await setAppointmentBindingDelivery({ workspaceId: workspace.id, bindingId: value(data, "bindingId"), automaticDelivery: value(data, "automaticDelivery") === "1" });
  if (!changed) redirect(withViewerError(`/calendar?${calendarPlace(data)}`, "This visit’s follow-ups changed. Refresh the calendar and try again.", session));
  redirect(`/calendar?${calendarPlace(data, { done: value(data, "automaticDelivery") === "1" ? "delivery-on" : "delivery-off", binding: value(data, "bindingId") })}`);
}

export async function cancelCalendarAction(data: FormData) {
  const { workspace, user, session } = await context();
  const canceled = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
    const entry = await tx.calendarEntry.findFirst({ where: { id: value(data, "id"), workspaceId: workspace.id, connectionId: null, canceledAt: null, version: Number(value(data, "version")) } });
    if (!entry) return false;
    await tx.calendarEntry.update({ where: { id: entry.id }, data: { canceledAt: new Date(), version: { increment: 1 } } });
    // Bound follow-ups are held with their own reason on the next pass, never sent for a visit that is off.
    await queueBoundReconciliation(tx, workspace.id, entry.id);
    if (entry.contactId) await tx.contactActivity.create({ data: { workspaceId: workspace.id, contactId: entry.contactId, actorUserId: user.id, kind: "SYSTEM", visibility: "WORKSPACE", summary: `Canceled calendar event: ${entry.title}. The customer’s stage was kept.`, metadata: { calendarEntryId: entry.id } } });
    return true;
  });
  // Back to the days the owner was viewing, with a notice that names the event, or says nothing was canceled (TRU-07, CAL-02).
  if (!canceled) redirect(withViewerError(`/calendar?${calendarPlace(data)}`, "This event changed. Refresh the calendar before canceling it.", session));
  redirect(`/calendar?${calendarPlace(data, { done: "canceled", event: value(data, "id") })}`);
}

/** The Calendar view a form came from (its date and one or seven days), plus a result. */
function calendarPlace(data: FormData, result: Record<string, string> = {}): URLSearchParams {
  const date = value(data, "date"), days = value(data, "days");
  return new URLSearchParams({ ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}), ...(days === "1" ? { days } : {}), ...result });
}

/** A calendar connection request this action refuses; its message is shown as written. */
class CalendarConnectionError extends Error {}

/** A subscription whose first refresh failed was not connected (F-02); the form adds that entries are kept. */
const UNREADABLE_LINK = "We couldn’t read that calendar link. Nothing was connected. Check the sharing URL and try again.";

/**
 * Discards the connection this request created after its first refresh or import failed, and never
 * throws, so the caller can always rethrow the original failure. The row was created pending, which
 * every refresh ignores, and only a successful first refresh or import turns it on, so it is never
 * usable even when this cleanup is refused. If the delete is refused, the row is also turned off and
 * its link cleared; if that is refused too, it simply stays pending. Only this request's row is
 * touched; operators get each error in the log.
 */
async function discardFailedConnection(workspaceId: string, id: string, cause: unknown) {
  try { await prisma.calendarConnection.delete({ where: { id } }); return; } catch (cleanup) {
    try { await prisma.calendarConnection.updateMany({ where: { id, workspaceId }, data: { enabled: false, urlEncrypted: null } }); }
    catch (disable) { console.error(`Calendar connection ${id} failed its first refresh and could not be removed or turned off.`, { cause, cleanup, disable }); return; }
    console.error(`Calendar connection ${id} failed its first refresh; it was turned off because it could not be removed.`, { cause, cleanup });
  }
}

/** Connecting a subscription or importing a file answers the open form: an error, or what was added. */
export type CalendarConnectionState = { error?: string; notice?: string };

/** Refreshing, disconnecting and the private link return to the calendar; connecting and importing use addCalendarConnectionAction. */
export async function calendarConnectionAction(data: FormData) {
  const { workspace, session } = await context(); const intent = value(data, "intent"), id = value(data, "id");
  try {
    if (intent === "rotate" || intent === "subscribe") await prisma.calendarPreference.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, ...createConnectionToken() }, update: createConnectionToken() });
    else if (intent === "revoke") await prisma.calendarPreference.deleteMany({ where: { workspaceId: workspace.id } });
    else if (intent === "disconnect") await prisma.calendarConnection.deleteMany({ where: { id, workspaceId: workspace.id } });
    else if (intent === "sync") await syncCalendarConnection(workspace.id, id);
    else throw new CalendarConnectionError("Choose a calendar action.");
  } catch (error) { redirect(`${withViewerError("/calendar", error instanceof CalendarConnectionError || error instanceof UserFacingError ? error.message : "The calendar could not be updated.", session)}#calendar-connections`); }
  redirect("/calendar?saved=1#calendar-connections");
}

/**
 * The connect and import intents return their result to the open form, which keeps every entry on
 * an error (JITM-08 §2.24) and shows what was added on success (JITM-04 §2.7).
 */
export async function addCalendarConnectionAction(_state: CalendarConnectionState, data: FormData): Promise<CalendarConnectionState> {
  const { workspace } = await context(); const intent = value(data, "intent"), name = value(data, "name"), timezone = value(data, "timezone");
  let listed = false, result: CalendarConnectionState;
  try {
    if (!name || name.length > 100) throw new CalendarConnectionError("Give this calendar a name of up to 100 characters.");
    if (!timezone || !isValidTimezone(timezone)) throw new CalendarConnectionError("Choose a valid timezone.");
    if (await prisma.calendarConnection.count({ where: { workspaceId: workspace.id } }) >= 20) throw new CalendarConnectionError("Connect up to 20 calendars. Disconnect one before adding another.");
    let busyTimes: number;
    if (intent === "connect") {
      // The address check fails only for a URL this app will not fetch, so its fixed advice is safe to show.
      let url: string;
      try { url = calendarFeedUrl(value(data, "url")).href; } catch { throw new CalendarConnectionError("Use an HTTPS calendar URL without a username, password, or custom port."); }
      // Created pending, so no refresh can use it until its first refresh succeeds and turns it on (DATA-01).
      const connection = await prisma.calendarConnection.create({ data: { workspaceId: workspace.id, name, urlEncrypted: encryptIntegrationCredentials({ url, timezone }), ...CALENDAR_CONNECTION_STAGES.pending } });
      // A first refresh that fails connects nothing: like import, it removes only the row this request
      // created, and says so (F-02). Connections saved earlier, broken ones included, are left alone.
      // The reply always comes from the refresh failure, even when the cleanup is refused (DATA-01).
      try { busyTimes = await syncCalendarConnection(workspace.id, connection.id, new Date(), "pending"); }
      catch (error) {
        await discardFailedConnection(workspace.id, connection.id, error);
        throw error instanceof UserFacingError ? new CalendarConnectionError(UNREADABLE_LINK, { cause: error }) : error;
      }
      listed = true;
    } else if (intent === "import") {
      const file = data.get("file");
      if (!(file instanceof File) || !file.size || file.size > 900_000) throw new CalendarConnectionError("Choose an .ics file of up to 900 KB.");
      const connection = await prisma.calendarConnection.create({ data: { workspaceId: workspace.id, name, ...CALENDAR_CONNECTION_STAGES.pending } });
      try { busyTimes = await importCalendar(workspace.id, connection.id, await file.text(), timezone, new Date(), "pending"); }
      catch (error) { await discardFailedConnection(workspace.id, connection.id, error); throw error; }
      listed = true;
    } else throw new CalendarConnectionError("Choose a calendar action.");
    result = { notice: addedNotice(intent === "connect" ? "Connected" : "Imported", name, busyTimes) };
  } catch (error) {
    result = { error: `${error instanceof CalendarConnectionError || error instanceof UserFacingError ? error.message : "The calendar could not be updated."} ${ENTRIES_KEPT}` };
  }
  // The connections list above the form shows a calendar this attempt added.
  if (listed) refresh();
  return result;
}

/** Names the calendar and what it added (JITM-04 §2.7). */
function addedNotice(done: "Connected" | "Imported", name: string, busyTimes: number): string {
  const what = `${done} ${name}`;
  if (!busyTimes) return `${what}. It has no busy times from the past month through the next year.`;
  return `${what}: ${busyTimes.toLocaleString("en-US")} busy ${busyTimes === 1 ? "time" : "times"} added.`;
}
