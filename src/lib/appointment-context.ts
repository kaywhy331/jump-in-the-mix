import { isValidTimezone } from "@/lib/mix-broadcast";

/** The appointment fields a bound follow-up's message can use. */
export type AppointmentContext = {
  title: string;
  startsAt: Date;
  timezone: string;
  location?: string | null;
  link?: string | null;
  details?: string | null;
};

export const APPOINTMENT_DETAIL_LIMITS = { title: 160, location: 200, link: 500, details: 1000 } as const;

/** A join link must be a plain https URL; anything else is refused rather than rewritten. */
export function normalizeAppointmentLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > APPOINTMENT_DETAIL_LIMITS.link) throw new Error("Keep the appointment link under 500 characters.");
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { throw new Error("Enter a full https link to join or find the appointment."); }
  if (parsed.protocol !== "https:") throw new Error("Appointment links must start with https://.");
  return parsed.toString();
}

function formatIn(timezone: string, options: Intl.DateTimeFormatOptions, at: Date, locale: string): string {
  const zone = isValidTimezone(timezone) ? timezone : "UTC";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(at);
}

/** Token values for one appointment, formatted in the appointment's own timezone. */
export function appointmentTokenValues(appointment: AppointmentContext | null | undefined, locale = "en-US"): Record<string, string> {
  const date = appointment ? formatIn(appointment.timezone, { weekday: "long", month: "long", day: "numeric" }, appointment.startsAt, locale) : "";
  const time = appointment ? formatIn(appointment.timezone, { hour: "numeric", minute: "2-digit" }, appointment.startsAt, locale) : "";
  const values = {
    title: appointment?.title?.trim() ?? "",
    date,
    time,
    location: appointment?.location?.trim() ?? "",
    link: appointment?.link?.trim() ?? "",
    details: appointment?.details?.trim() ?? ""
  };
  return {
    "{{Appointment Title}}": values.title,
    "{{Appointment Date}}": values.date,
    "{{Appointment Time}}": values.time,
    "{{Appointment Location}}": values.location,
    "{{Appointment Link}}": values.link,
    "{{Appointment Details}}": values.details,
    "{{appointment.title}}": values.title,
    "{{appointment.date}}": values.date,
    "{{appointment.time}}": values.time,
    "{{appointment.location}}": values.location,
    "{{appointment.link}}": values.link,
    "{{appointment.details}}": values.details
  };
}
