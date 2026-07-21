export type QuickAddInterpretation = {
  original: string;
  name: string | null;
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
  if (normalized === "next monday") {
    const daysUntilMonday = ((8 - today.getDay()) % 7) || 7;
    return localDateValue(addLocalDays(today, daysUntilMonday));
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
  const timingToken = original.match(/\b(today|tomorrow|next (?:monday|week)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i)?.[0];
  const name = original.match(/(?:follow up with|call|text|email|add)\s+(.+?)(?=\s+(?:today|tomorrow|next|on|about|regarding)\b|$)/i)?.[1]?.trim() ?? null;
  const reason = original.match(/\b(?:about|regarding)\s+(.+?)[.!?]*$/i)?.[1]?.trim() || "Follow up";
  const dateValue = parsedDateValue(timingToken, now);
  const recognized = Boolean(name || dateValue);
  return {
    original,
    name,
    timing: timingToken ?? "Choose a date",
    dateValue,
    reason,
    confidence: recognized
      ? "The recognized details will be carried into the Contact and first follow-up form."
      : "Choose a capture type and finish the details."
  };
}
