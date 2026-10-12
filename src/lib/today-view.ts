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
  if (/read with its country code/i.test(stored)) return "the saved phone number couldn’t be read with a country code";
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

/**
 * Whether this view's Done grows when an outcome is recorded on the open page, so the live count can grow with it (D70,
 * TRU-06). The due view counts today's completed follow-ups, never skipped ones. Other views count what the page lists,
 * which their status and priority filters may leave out. A first or later page lists its pending follow-ups, then fills
 * up with completed ones, so the next read lists one more completed follow-up when the page already lists some, when
 * every pending one in the view fits on a page, or when the page's own pending ones leave room. A Previous page is read
 * back from its cursor, so whether the next read lists the new completed follow-up depends on where it sorts: Done holds
 * there until that read (CNT-05, CNT-06, CNT-07).
 */
export function doneGrowth(view: { range: string; status: string; priority: string }, page: { pending: number; pendingOnPage: number; listedCompleted: number; size: number; previous: boolean }): { done: boolean; skipped: boolean } {
  if (view.range === "due") return { done: true, skipped: false };
  const lists = view.priority !== "overdue" && !page.previous && (page.listedCompleted > 0 || page.pending <= page.size || page.pendingOnPage < page.size);
  return { done: lists && (view.status === "all" || view.status === "done"), skipped: lists && (view.status === "all" || view.status === "skipped") };
}

/**
 * One person's follow-ups due by the end of today share one card, led by the earliest (D71, JITM-09 §2.82). `due` is the
 * page's due follow-ups in due order, and each group keeps that order. A group sits where its latest follow-up is due,
 * so the one left after the earlier is recorded stays in place. A person `contacted` today stays under Today too, so the
 * earlier follow-up left after the later one is recorded doesn't move, nor close a review open on it (D99, LIV-01).
 * `moved` counts the overdue follow-ups that sit under Today. Both come from the page alone: the sections adjust the
 * view's totals by `moved`, so each section counts at least the cards it shows, however the list is paged (CNT-01).
 */
export function groupDueFollowUps<T extends { contactId: string; scheduledAt: Date }>(due: readonly T[], startToday: Date, contacted: ReadonlySet<string> = new Set()): { overdue: T[][]; today: T[][]; moved: number } {
  const people = new Map<string, T[]>();
  for (const followUp of due) people.set(followUp.contactId, [...(people.get(followUp.contactId) ?? []), followUp]);
  const overdue: T[][] = [], today: T[][] = [];
  let moved = 0;
  for (const group of people.values()) {
    if (group[group.length - 1].scheduledAt < startToday && !contacted.has(group[0].contactId)) overdue.push(group);
    else {
      today.push(group);
      moved += group.filter(followUp => followUp.scheduledAt < startToday).length;
    }
  }
  return { overdue, today, moved };
}
