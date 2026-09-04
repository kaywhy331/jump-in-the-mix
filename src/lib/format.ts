export type DisplayFormatPreferences = {
  locale: string;
  timeZone: string;
};

export const UTC_DISPLAY_PREFERENCES: DisplayFormatPreferences = {
  locale: "en-US",
  timeZone: "UTC"
};

export function formatDate(
  value: Date | string,
  preferences: DisplayFormatPreferences = UTC_DISPLAY_PREFERENCES,
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

export function formatDateTime(value: Date | string, preferences: DisplayFormatPreferences = UTC_DISPLAY_PREFERENCES): string {
  return new Intl.DateTimeFormat(preferences.locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: preferences.timeZone
  }).format(new Date(value));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
