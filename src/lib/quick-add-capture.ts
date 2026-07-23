export type QuickAddInterpretation = {
  original: string;
  name: string | null;
  phone: string | null;
  timing: string;
  dateValue: string | null;
  reason: string;
  confidence: string;
};

function localDateValue(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function addLocalDays(date: Date, days: number): Date {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parsedDateValue(token: string | undefined, now: Date): string | null {
  if (!token) return null;
  const normalized = token.trim().toLowerCase();
  const today = startOfLocalDay(now);

  if (normalized === "today") return localDateValue(today);
  if (normalized === "tomorrow") return localDateValue(addLocalDays(today, 1));
  if (normalized === "next week") return localDateValue(addLocalDays(today, 7));
  const weekday = normalized.match(/^next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)?.[1];
  if (weekday) {
    const weekdayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday);
    const daysUntilWeekday = ((weekdayIndex - today.getDay() + 7) % 7) || 7;
    return localDateValue(addLocalDays(today, daysUntilWeekday));
  }

  const numeric = normalized.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!numeric) return null;
  const month = Number(numeric[1]);
  const day = Number(numeric[2]);
  const suppliedYear = numeric[3] ? Number(numeric[3]) : null;
  const year = suppliedYear === null
    ? today.getFullYear()
    : suppliedYear < 100
      ? 2000 + suppliedYear
      : suppliedYear;
  let candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) return null;
  if (suppliedYear === null && candidate < today) {
    candidate = new Date(year + 1, month - 1, day, 12, 0, 0, 0);
  }
  return localDateValue(candidate);
}

export function splitContactName(input: string | null | undefined): { firstName: string; lastName: string } {
  const parts = String(input ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() ?? "",
    lastName: parts.join(" ")
  };
}

export function inferQuickAddCapture(input: string, now = new Date()): QuickAddInterpretation {
  const original = input.trim();
  const timingToken = original.match(/\b(today|tomorrow|next (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|week)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i)?.[0];
  const phone = original.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b/)?.[0]?.trim() ?? null;
  const name = original.match(/(?:follow up with|call|text|email|add|i met|met)\s+(.+?)(?=\s+(?:today|tomorrow|next|on|about|regarding|at|with)\b|\s+\+?\d|$)/i)?.[1]?.trim() ?? null;
  const statedReason = original.match(/\b(?:about|regarding)\s+(.+?)[.!?]*$/i)?.[1]?.trim();
  const meetingContext = /\b(?:i met|met)\b/i.test(original)
    ? original.match(/\bat\s+(.+?)[.!?]*$/i)?.[1]?.trim()
    : null;
  const reason = statedReason || (meetingContext ? `Met at ${meetingContext}` : "Follow up");
  const dateValue = parsedDateValue(timingToken, now);
  const recognized = Boolean(name || phone || dateValue);
  return {
    original,
    name,
    phone,
    timing: timingToken ?? "Choose a date",
    dateValue,
    reason,
    confidence: recognized
      ? "The recognized details will be carried into the Contact and first follow-up form."
      : "Choose a capture type and finish the details."
  };
}
