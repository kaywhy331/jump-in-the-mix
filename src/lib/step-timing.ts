import type { StepAnchor } from "@/generated/prisma/client";

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
  return { anchor, offsetMinutes };
}

export type AppointmentTimingSource = { startsAt: Date; endsAt: Date; outcome: string | null; outcomeAt: Date | null };

/**
 * The instant an elapsed-minute beat goes out for one appointment, or null while it has nothing to
 * count from yet (a completion-anchored beat before the visit is marked completed). Calendar-day
 * beats are not timed here.
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

/** A short owner-facing sentence for a beat's timing, for the editor and summaries. */
export function describeStepTiming(step: StepTiming): string {
  const minutes = step.offsetMinutes ?? 0;
  switch (step.anchor) {
    case "APPOINTMENT_START": return minutes < 0 ? `${duration(minutes)} before the appointment starts` : `${duration(minutes)} after the appointment starts`;
    case "APPOINTMENT_END": return minutes < 0 ? `${duration(minutes)} before the appointment ends` : `${duration(minutes)} after the appointment ends`;
    case "VISIT_COMPLETED": return minutes === 0 ? "as soon as the visit is marked completed" : `${duration(minutes)} after the visit is marked completed`;
    default: return "on its calendar day";
  }
}
