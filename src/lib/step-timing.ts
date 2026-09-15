import type { StepAnchor } from "@/generated/prisma/client";
import { minutesInTimezone } from "@/lib/planned-step";

/**
 * Timing for a beat of a plan bound to a local appointment. The default is the calendar-day rule
 * (a day offset from the appointment's date, at the beat's own time or the appointment's). The
 * other anchors are elapsed durations: minutes from the appointment's start or end, or minutes
 * after the visit is marked completed, counted from the moment that outcome was recorded. Elapsed
 * durations are instants: a daylight-saving change between the appointment and the beat does not
 * move them, and weekend and quiet-hour rules do not apply. They run only when the plan is bound
 * to a visit; an enrollment without an appointment has nothing to count from and skips them.
 */
export const STEP_ANCHORS: readonly StepAnchor[] = ["CALENDAR_DAY", "APPOINTMENT_START", "APPOINTMENT_END", "VISIT_COMPLETED"];

/** Thirty days either way is plenty for a visit's follow-up and keeps a typo from scheduling years out. */
export const MAX_STEP_OFFSET_MINUTES = 30 * 24 * 60;

export const STEP_ANCHOR_LABELS: Record<StepAnchor, string> = {
  CALENDAR_DAY: "Calendar day",
  APPOINTMENT_START: "Minutes from the appointment start",
  APPOINTMENT_END: "Minutes from the appointment end",
  VISIT_COMPLETED: "After the visit is marked completed"
};

/** The stored shape: the sign of offsetMinutes says before (negative) or after; the editor shows a positive duration. */
export type StepTiming = { anchor: StepAnchor; offsetMinutes: number | null };

export function isStepAnchor(value: string): value is StepAnchor {
  return (STEP_ANCHORS as readonly string[]).includes(value);
}

/** Normalizes editor input for one beat; the message names the beat when it refuses. */
export function validateStepTiming(anchorRaw: string, offsetRaw: string, beatNumber: number): StepTiming {
  const anchor = anchorRaw || "CALENDAR_DAY";
  if (!isStepAnchor(anchor)) throw new Error(`Beat ${beatNumber} has an unknown timing.`);
  if (anchor === "CALENDAR_DAY") return { anchor, offsetMinutes: null };
  const offsetMinutes = Number(offsetRaw);
  if (!offsetRaw.trim() || !Number.isInteger(offsetMinutes)) throw new Error(`Beat ${beatNumber} needs a whole number of minutes.`);
  if (Math.abs(offsetMinutes) > MAX_STEP_OFFSET_MINUTES) throw new Error(`Beat ${beatNumber} must stay within ${MAX_STEP_OFFSET_MINUTES / 1440} days of the appointment.`);
  if (anchor === "VISIT_COMPLETED" && offsetMinutes < 0) throw new Error(`Beat ${beatNumber} can only follow the moment the visit is marked completed.`);
  // Normalizes a signed zero so "0 minutes before" and "0 minutes after" store the same value.
  return { anchor, offsetMinutes: offsetMinutes === 0 ? 0 : offsetMinutes };
}

export type AppointmentTimingSource = { startsAt: Date; endsAt: Date; outcome: string | null; outcomeAt: Date | null };

/**
 * The instant an elapsed-minute beat becomes due for one appointment, or null while it has nothing
 * to count from yet (a completion-anchored beat before the visit is marked completed).
 * Calendar-day beats are not timed here.
 */
export function anchoredStepInstant(step: StepTiming, appointment: AppointmentTimingSource): Date | null {
  const offset = (step.offsetMinutes ?? 0) * 60_000;
  switch (step.anchor) {
    case "APPOINTMENT_START": return new Date(appointment.startsAt.getTime() + offset);
    case "APPOINTMENT_END": return new Date(appointment.endsAt.getTime() + offset);
    case "VISIT_COMPLETED": return appointment.outcome === "COMPLETED" && appointment.outcomeAt ? new Date(appointment.outcomeAt.getTime() + offset) : null;
    default: return null;
  }
}

/** Whether an elapsed-minute beat lands before the appointment starts, which makes it preparation. */
export function anchoredStepIsPreparation(step: StepTiming, appointment: AppointmentTimingSource): boolean {
  if (step.anchor === "VISIT_COMPLETED") return false;
  const at = anchoredStepInstant(step, appointment);
  return Boolean(at && at < appointment.startsAt);
}

/** Every field the preparation rule reads from a beat of a bound plan. */
export type BoundStepTiming = StepTiming & { plannedAt: Date | null; dayOffset: number; sendTimeMinutes: number | null };

/**
 * The one rule for what counts as preparation for a bound beat, shared by the engine's holds and
 * the owner-facing confirmations so they never disagree. A calendar-day beat is preparation when
 * its day is before the appointment's, or the same day at an earlier time (a same-day beat with no
 * time of its own goes out at the appointment's time and so follows the visit); a planned beat when
 * its instant is before the start; an elapsed beat when it lands before the start. A completion
 * beat always follows the visit.
 */
export function boundStepIsPreparation(step: BoundStepTiming, appointment: AppointmentTimingSource & { timezone: string }): boolean {
  if (step.anchor !== "CALENDAR_DAY") return anchoredStepIsPreparation(step, appointment);
  if (step.plannedAt) return step.plannedAt < appointment.startsAt;
  const appointmentMinutes = minutesInTimezone(appointment.startsAt, appointment.timezone);
  return step.dayOffset < 0 || (step.dayOffset === 0 && (step.sendTimeMinutes ?? appointmentMinutes) < appointmentMinutes);
}

/**
 * What binding a plan to this appointment gives the owner right now, by beat: `ready` beats are
 * scheduled on the worker's next pass; `awaitingOutcome` beats follow the visit and wait until how
 * it went is recorded; `awaitingCompletion` beats count from the moment the visit is marked
 * completed; `lapsed` beats are preparation for a visit that has already started; `held` beats are
 * all of them when the visit was recorded as missed. Mirrors the engine's eligibility rules; it
 * changes none of them.
 */
export type BoundPlanOutlook = { ready: number; awaitingOutcome: number; awaitingCompletion: number; lapsed: number; held: number };

export function boundPlanOutlook(steps: BoundStepTiming[], appointment: AppointmentTimingSource & { timezone: string }, now = new Date()): BoundPlanOutlook {
  const outlook: BoundPlanOutlook = { ready: 0, awaitingOutcome: 0, awaitingCompletion: 0, lapsed: 0, held: 0 };
  if (appointment.outcome === "NO_SHOW") return { ...outlook, held: steps.length };
  const ahead = appointment.startsAt > now;
  for (const step of steps) {
    if (boundStepIsPreparation(step, appointment)) {
      if (ahead && appointment.outcome !== "COMPLETED") outlook.ready += 1; else outlook.lapsed += 1;
    } else if (appointment.outcome === "COMPLETED") {
      outlook.ready += 1;
    } else if (step.anchor === "VISIT_COMPLETED") {
      outlook.awaitingCompletion += 1;
    } else {
      outlook.awaitingOutcome += 1;
    }
  }
  return outlook;
}

/** The confirmation after a visit is saved with a plan: what is scheduled now and what waits, and why. */
export function describeBoundPlanOutlook(outlook: BoundPlanOutlook): string {
  const beats = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const parts = ["The plan’s follow-ups line up with this visit."];
  if (outlook.ready) parts.push(`${beats(outlook.ready, "beat is", "beats are")} scheduled and will appear on Today.`);
  if (outlook.awaitingOutcome) parts.push(`${beats(outlook.awaitingOutcome, "beat after the visit waits", "beats after the visit wait")} until you record how it went.`);
  if (outlook.awaitingCompletion) parts.push(`${beats(outlook.awaitingCompletion, "beat counts", "beats count")} from the moment you mark the visit completed.`);
  if (outlook.lapsed) parts.push(`${beats(outlook.lapsed, "beat before the visit has", "beats before the visit have")} lapsed because it has already started.`);
  if (outlook.held) parts.push(`${beats(outlook.held, "beat is", "beats are")} held because the visit was recorded as missed.`);
  return parts.join(" ");
}

function duration(minutes: number): string {
  const total = Math.abs(minutes);
  if (total === 0) return "0 minutes";
  const days = Math.floor(total / 1440), hours = Math.floor((total % 1440) / 60), rest = total % 60;
  const parts = [] as string[];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (rest) parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** A short owner-facing phrase for when a beat becomes due, for the editor and summaries. */
export function describeStepTiming(step: StepTiming): string {
  const minutes = step.offsetMinutes ?? 0;
  switch (step.anchor) {
    case "APPOINTMENT_START": return minutes === 0 ? "when the appointment starts" : minutes < 0 ? `${duration(minutes)} before the appointment starts` : `${duration(minutes)} after the appointment starts`;
    case "APPOINTMENT_END": return minutes === 0 ? "when the appointment ends" : minutes < 0 ? `${duration(minutes)} before the appointment ends` : `${duration(minutes)} after the appointment ends`;
    case "VISIT_COMPLETED": return minutes === 0 ? "as soon as the visit is marked completed" : `${duration(minutes)} after the visit is marked completed`;
    default: return "on its calendar day";
  }
}

/**
 * The condition that gates an elapsed beat's readiness, in the owner's words: preparation lapses
 * once the visit has started, a beat that follows the visit waits for its recorded outcome, and a
 * completion beat has nothing to count from until the visit is marked completed. A beat before the
 * appointment's end may land on either side of the start, which depends on the visit's length.
 */
export function describeStepReadiness(step: StepTiming): string {
  const minutes = step.offsetMinutes ?? 0;
  switch (step.anchor) {
    case "APPOINTMENT_START": return minutes < 0 ? "It is preparation, so it lapses once the visit has started." : "It waits until you record that the visit happened.";
    case "APPOINTMENT_END": return minutes < 0 ? "If it lands before the visit starts it is preparation and lapses once the visit has started; otherwise it waits until you record that the visit happened." : "It waits until you record that the visit happened.";
    case "VISIT_COMPLETED": return "It has nothing to count from until you mark the visit completed.";
    default: return "";
  }
}
