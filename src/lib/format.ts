export type DisplayFormatPreferences = {
  locale: string;
  timeZone: string;
};

export function formatDate(
  value: Date | string,
  preferences: DisplayFormatPreferences,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat(preferences.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
    timeZone: preferences.timeZone
  }).format(new Date(value));
}

export function formatDateTime(value: Date | string, preferences: DisplayFormatPreferences): string {
  return new Intl.DateTimeFormat(preferences.locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: preferences.timeZone
  }).format(new Date(value));
}

/** A time of day on the 12-hour clock in the reader's timezone (e.g. "10:00 AM"; D79). */
export function formatTime(value: Date | string, preferences: DisplayFormatPreferences): string {
  return new Intl.DateTimeFormat(preferences.locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: preferences.timeZone }).format(new Date(value));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
