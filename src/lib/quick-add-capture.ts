export type QuickAddInterpretation = {
  original: string;
  name: string | null;
  phone: string | null;
  email: string | null;
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
  const relative = normalized.match(/^in\s+(\d{1,3})\s+(day|days|week|weeks)$/);
  if (relative) return localDateValue(addLocalDays(today, Number(relative[1]) * (relative[2].startsWith("week") ? 7 : 1)));
  const weekdayAliases: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const weekday = normalized.match(/^(?:next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)$/)?.[1];
  if (weekday) {
    const weekdayIndex = weekdayAliases[weekday];
    const daysUntilWeekday = ((weekdayIndex - today.getDay() + 7) % 7) || 7;
    return localDateValue(addLocalDays(today, daysUntilWeekday));
  }

  const monthAliases: Record<string, number> = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const named = normalized.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (named && named[1] in monthAliases) {
    const month = monthAliases[named[1]];
    const day = Number(named[2]);
    const suppliedYear = named[3] ? Number(named[3]) : null;
    let candidate = new Date(suppliedYear ?? today.getFullYear(), month, day, 12, 0, 0, 0);
    if (candidate.getMonth() !== month || candidate.getDate() !== day) return null;
    if (suppliedYear === null && candidate < today) candidate = new Date(today.getFullYear() + 1, month, day, 12, 0, 0, 0);
    return localDateValue(candidate);
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

export function inferQuickAddCapture(input: string, now = new Date(), timezone?: string): QuickAddInterpretation {
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
    const number = (type: string) => Number(parts.find(part => part.type === type)?.value);
    now = new Date(number("year"), number("month") - 1, number("day"), 12);
  }
  const original = input.trim();
  const weekday = "(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
  const month = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const timingToken = original.match(new RegExp(`\\b(today|tomorrow|next week|(?:next\\s+)?${weekday}|in\\s+\\d{1,3}\\s+(?:days?|weeks?)|${month}\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)\\b`, "i"))?.[0];
  const phone = original.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b/)?.[0]?.trim() ?? null;
  const email = original.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]?.toLowerCase() ?? null;
  const timingLookahead = `today|tomorrow|next|in\\s+\\d+|${weekday}|${month}\\s+\\d+|on|about|regarding|at|with`;
  const name = original.match(new RegExp(`(?:follow up with|call|text|email|add|i met|met)\\s+(.+?)(?=\\s+(?:${timingLookahead})\\b|\\s+\\+?\\d|\\s+[A-Z0-9._%+-]+@|$)`, "i"))?.[1]?.trim() ?? null;
  const statedReason = original.match(/\b(?:about|regarding)\s+(.+?)[.!?]*$/i)?.[1]?.trim();
  const meetingContext = /\b(?:i met|met)\b/i.test(original)
    ? original.match(/\bat\s+(.+?)[.!?]*$/i)?.[1]?.trim()
    : null;
  const reason = statedReason || (meetingContext ? `Met at ${meetingContext}` : "Follow up");
  const dateValue = parsedDateValue(timingToken, now);
  const recognized = Boolean(name || phone || email || dateValue);
  return {
    original,
    name,
    phone,
    email,
    timing: timingToken ?? "Choose a date",
    dateValue,
    reason,
    confidence: recognized
      ? "The recognized details will be carried into the Contact and first follow-up form."
      : "Choose a capture type and finish the details."
  };
}

/** A conservative suggestion, always reviewed before saving. Unstated times and message copy stay blank. */
export function inferQuickCaptureReview(input: string, now = new Date(), timezone?: string) {
  const original = inferQuickAddCapture(input, now, timezone);
  const eventMatch = input.match(/\b(coffee|lunch|meeting|meet|visit|appointment)\s+with\s+(.+?)(?=\s+(?:today|tomorrow|next|on|at|in\s+\d|sun\w*|mon\w*|tue\w*|wed\w*|thu\w*|fri\w*|sat\w*)\b|[,.;]|$)/i)
    ?? input.match(/\b(meet)\s+(?!with\b)(.+?)(?=\s+(?:today|tomorrow|next|on|at|in\s+\d|sun\w*|mon\w*|tue\w*|wed\w*|thu\w*|fri\w*|sat\w*)\b|[,.;]|$)/i);
  const followMatch = input.match(/\b(?:then\s+)?(?:remind me|follow[ -]?up|call|text|email|whatsapp)\b[\s\S]*/i);
  const eventText = eventMatch ? input.slice(0, followMatch?.index ?? input.length) : "";
  const followText = followMatch?.[0] ?? (eventMatch ? "" : input);
  const follow = inferQuickAddCapture(followText, now, timezone);
  const clock = (text: string) => {
    const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2] ?? 0) > 59) return "";
    return `${String(Number(match[1]) % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2] ?? "00"}`;
  };
  const channel = /\btext\b/i.test(followText) ? "SMS" : /\bemail\b/i.test(followText) ? "EMAIL" : /\bwhatsapp\b/i.test(followText) ? "WHATSAPP" : /\bvoicemail\b/i.test(followText) ? "VOICEMAIL" : /\bcall\b/i.test(followText) ? "PHONE_CALL" : "";
  const namedReason = followText.match(/\b(?:about|regarding|to)\s+(.+?)[.!?]*$/i)?.[1]?.trim();
  const reason = namedReason || follow.reason;
  const suggestedName = eventMatch?.[2]?.trim() ?? original.name?.replace(/[,.;].*$/, "").trim() ?? "";
  // A follow-up pronoun is not a person's identity. Leave it for explicit review.
  const name = /^(?:him|her|them|me|us|you|someone)$/i.test(suggestedName) ? "" : suggestedName;
  return {
    ...original,
    name,
    note: original.original,
    event: { enabled: Boolean(eventMatch), title: eventMatch ? `${eventMatch[1][0].toUpperCase()}${eventMatch[1].slice(1)} with ${eventMatch[2].trim()}` : "", date: eventText ? inferQuickAddCapture(eventText, now, timezone).dateValue ?? "" : "", time: clock(eventText), duration: "60", location: eventText.match(/\bat\s+(?!\d)(.+?)(?=[,.;]|$)/i)?.[1]?.trim() ?? "", allowOverlap: false },
    followUp: { enabled: Boolean(followMatch || (!eventMatch && original.dateValue)), reason, date: follow.dateValue ?? "", time: clock(followText), channel, subject: "", wording: channel === "PHONE_CALL" ? reason : "" }
  };
}
