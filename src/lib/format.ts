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
