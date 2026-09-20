import { formatDate, type DisplayFormatPreferences } from "@/lib/format";
import { addLogicalDays, logicalDateInTimezone, logicalDateKey } from "@/lib/jump-schedule";

export function contactDueLabel(date: Date, now: Date, preferences: DisplayFormatPreferences): string {
  const due = logicalDateInTimezone(date, preferences.timeZone);
  const today = logicalDateInTimezone(now, preferences.timeZone);
  const days = Math.round((Date.UTC(due.year, due.month - 1, due.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000);
  if (days < 0) return `${-days} ${days === -1 ? "day" : "days"} late`;
  const time = new Intl.DateTimeFormat(preferences.locale, { hour: "numeric", minute: "2-digit", timeZone: preferences.timeZone }).format(date);
  if (days === 0) return `${date < now ? "Earlier today" : "Today"}, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return formatDate(date, preferences, { year: undefined });
}

type SequenceJump = {
  id: string; mixId: string; mixStepId: string; jumpDateId: string | null;
  appointmentBindingId: string | null; templateSnapshot: unknown;
  mixStep: { dayOffset: number; plannedAt: Date | null };
};

/** Group a real occurrence, not all follow-ups sharing a reusable Mix. */
export function contactSequenceKey(jump: SequenceJump): string | null {
  if (jump.appointmentBindingId) return `appointment:${jump.appointmentBindingId}`;
  const snapshot = jump.templateSnapshot && typeof jump.templateSnapshot === "object" && !Array.isArray(jump.templateSnapshot) ? jump.templateSnapshot as Record<string, unknown> : {};
  if (snapshot.oneTime) return `one-time:${typeof snapshot.batchId === "string" ? snapshot.batchId : jump.id}`;
  const date = snapshot.originalLocalDate;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || jump.mixStep.plannedAt) return null;
  const [year, month, day] = date.split("-").map(Number);
  return `${jump.jumpDateId ?? "manual"}:${logicalDateKey(addLogicalDays({ year, month, day }, -jump.mixStep.dayOffset))}`;
}

export function sameContactSequence(focus: SequenceJump, candidate: SequenceJump): boolean {
  if (focus.id === candidate.id) return true;
  if (focus.mixId !== candidate.mixId) return false;
  const key = contactSequenceKey(focus);
  // Older records without an occurrence stamp must not invent a connection.
  return key !== null && key === contactSequenceKey(candidate);
}

export function recordedStageChanges<T extends { resultingStageId: string | null }>(events: T[]): T[] {
  let previous: string | null = null;
  return events.filter(event => {
    if (!event.resultingStageId || event.resultingStageId === previous) return false;
    previous = event.resultingStageId;
    return true;
  });
}
