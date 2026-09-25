import { logicalDateInTimezone, type LogicalDate } from "@/lib/jump-schedule";

/**
 * Pure helpers for what the Today page says about a follow-up. Nothing here reads the database or
 * changes a row; the page decides what to show and these functions keep the wording honest.
 */

/**
 * How many calendar days overdue a follow-up is in the owner's timezone: the distance between the
 * due date and today's date, never the elapsed milliseconds, so a daylight-saving change cannot
 * shorten a day. At least one, since the page asks only for follow-ups due before today.
 */
export function calendarDaysOverdue(scheduledAt: Date, today: LogicalDate, timezone: string): number {
  const due = logicalDateInTimezone(scheduledAt, timezone);
  const days = Math.round((Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(due.year, due.month - 1, due.day)) / 86_400_000);
  return Math.max(1, days);
}

export type FailedDeliveryNotice = {
  /** "uncertain" when the message may have gone out; "failed" when it certainly did not. */
  kind: "uncertain" | "failed";
  text: string;
};

// The worker records these when it cannot tell whether the provider accepted the message: a lease
// that expired mid-send, a lost lease after the send, or a request that timed out or never answered.
const UNCERTAIN = /uncertain|lease was lost|timed? ?out|abort|fetch failed|network|socket/i;

function plainReason(stored: string): string {
  if (/no email address/i.test(stored)) return "this person has no email address";
  if (/no phone number/i.test(stored)) return "this person has no phone number";
  if (/message is empty|empty or cannot be sent/i.test(stored)) return "the message was empty";
  if (/exceeds|character limit|too long/i.test(stored)) return "the message was too long";
  if (/only email and text/i.test(stored)) return "only texts and emails can be sent automatically";
  if (/not configured/i.test(stored)) return "automatic sending isn’t set up";
  return "the provider rejected it";
}

/**
 * Plain words for a stored automatic-delivery error. The worker never retries a failed send, so the
 * owner sends it; when the result is unknown they check their sent messages first.
 */
export function failedDeliveryNotice(error: string | null | undefined): FailedDeliveryNotice {
  const stored = (error ?? "").trim();
  if (UNCERTAIN.test(stored)) {
    return { kind: "uncertain", text: "We couldn’t confirm whether this was sent. Check your sent messages before sending again." };
  }
  return { kind: "failed", text: `Couldn’t send automatically: ${plainReason(stored)}. Send it yourself.` };
}

/**
 * The number beside "Done". In the due view it is today's completed total, whatever page or part of
 * the list is open; other date ranges have no "today" to total, so they count what the page lists.
 */
export function doneSummaryCount(range: string, listedCompleted: number, completedToday: number): number {
  return range === "due" ? completedToday : listedCompleted;
}
