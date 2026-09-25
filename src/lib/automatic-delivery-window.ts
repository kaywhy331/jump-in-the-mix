import { nextJourneyAvailability, type AvailabilityRule, type BusyTime } from "@/lib/journey-availability";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { isQuietTime, notificationClock } from "@/lib/notification-delivery";

/**
 * When the worker may send a follow-up automatically. One rule, three readers: the worker pass
 * decides with it, Today's review shows the "not before" time it yields, and the settings preview
 * lists the same times. Nothing here reads the database; callers pass what the worker reads.
 */

/** Quiet hours as minutes after midnight in the owner's timezone; equal start and end means none. */
export type QuietHours = { start: number; end: number };

export type AutomaticSendingRule = {
  /** The owner's timezone, already validated by the caller (the worker falls back to UTC). */
  timezone: string;
  /** null when the workspace has no scheduling preferences row. */
  quietHours: QuietHours | null;
  /** Opt-in working days and hours; ignored when the stored preferences do not parse. */
  workingHours?: AvailabilityRule | null;
  /** Calendar entries an owner who avoids appointments does not send during. */
  appointmentGaps?: BusyTime[];
};

export type AutomaticSendWindowInput = AutomaticSendingRule & {
  scheduledAt: Date;
  createdAt: Date;
  reviewWindowMinutes: number;
  now: Date;
};

export type AutomaticSendWindow = {
  /** When the review window ends: the later of due time and creation, plus the window. */
  eligibleAt: Date;
  /** The earliest instant at or after `now` when a worker pass would send; null when none was found within the search limit. */
  opensAt: Date | null;
  /** The worker's decision at `now`: the window has ended and sending is open. */
  open: boolean;
};

const MINUTE = 60_000;
const SEARCH_LIMIT = 400;

/** The review-window rule alone: a follow-up waits the window after it is due or after it is created, whichever is later. */
export function automaticDeliveryEligibleAt(scheduledAt: Date, createdAt: Date, reviewWindowMinutes: number): Date {
  return new Date(Math.max(scheduledAt.getTime(), createdAt.getTime()) + reviewWindowMinutes * MINUTE);
}

/**
 * The earliest instant at or after `from` when automatic sending is open for the workspace:
 * outside quiet hours, inside working hours and clear of appointments when those are set. A pass
 * at `from` sends exactly when this returns `from` itself. Throws, as the availability rule does,
 * when no open minute exists within the search limit.
 */
export function automaticSendingOpensAt(from: Date, rule: AutomaticSendingRule): Date {
  const gaps = rule.appointmentGaps ?? [];
  let candidate = from;
  for (let attempt = 0; attempt < SEARCH_LIMIT + gaps.length; attempt++) {
    const clock = notificationClock(candidate, rule.timezone);
    const minute = clock.hour * 60 + clock.minute;
    if (rule.quietHours && isQuietTime(minute, rule.quietHours.start, rule.quietHours.end)) {
      let day = logicalDateInTimezone(candidate, rule.timezone);
      if (rule.quietHours.start > rule.quietHours.end && minute >= rule.quietHours.start) day = addLogicalDays(day, 1);
      const quietEnd = zonedDateTimeToUtc(day, rule.quietHours.end, rule.timezone);
      // A quiet end inside a daylight-saving gap can resolve backward; then step to the next whole minute instead.
      candidate = quietEnd.getTime() > candidate.getTime() ? quietEnd : new Date(Math.floor(candidate.getTime() / MINUTE) * MINUTE + MINUTE);
      continue;
    }
    if (rule.workingHours) {
      const available = nextJourneyAvailability(candidate, rule.timezone, rule.workingHours, gaps);
      if (available.getTime() > candidate.getTime()) { candidate = available; continue; }
    }
    return candidate;
  }
  throw new Error("No automatic sending time was found. Review your quiet hours and working hours.");
}

/**
 * The window for one follow-up: when its review ends and when a worker pass would first send it.
 * `open` is the worker's decision at `now`; `opensAt` is what Today and the settings preview show.
 */
export function automaticSendWindow(input: AutomaticSendWindowInput): AutomaticSendWindow {
  const eligibleAt = automaticDeliveryEligibleAt(input.scheduledAt, input.createdAt, input.reviewWindowMinutes);
  const from = eligibleAt.getTime() > input.now.getTime() ? eligibleAt : input.now;
  let opensAt: Date | null;
  try { opensAt = automaticSendingOpensAt(from, input); } catch { opensAt = null; }
  return { eligibleAt, opensAt, open: opensAt !== null && opensAt.getTime() <= input.now.getTime() };
}
