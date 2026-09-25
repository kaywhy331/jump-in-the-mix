import type { DisplayFormatPreferences } from "@/lib/format";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

/** The locales the Profile card offers; the preference action accepts nothing else. */
export const DISPLAY_LOCALES = ["en-US", "en-CA", "en-GB", "en-AU"] as const;
export type DisplayLocale = (typeof DISPLAY_LOCALES)[number];
export const DEFAULT_LOCALE: DisplayLocale = "en-US";

export function isDisplayLocale(locale: string): locale is DisplayLocale {
  return (DISPLAY_LOCALES as readonly string[]).includes(locale);
}

/**
 * The stored tag when Intl supports it (canonicalised), otherwise en-US, so one bad row cannot
 * break every page and digest for that person. Mirrors the timezone fallback below.
 */
export function usableLocale(locale: string | null | undefined): string {
  if (!locale) return DEFAULT_LOCALE;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale])[0] ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function displayPreferencesForUser(userId: string, fallbackTimeZone = "UTC"): Promise<DisplayFormatPreferences> {
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  return {
    locale: usableLocale(preference?.locale),
    timeZone: isValidTimezone(preference?.timezone ?? "")
      ? preference!.timezone
      : isValidTimezone(fallbackTimeZone) ? fallbackTimeZone : "UTC"
  };
}

export async function timezoneForUser(userId: string): Promise<string> {
  return (await displayPreferencesForUser(userId)).timeZone;
}

export async function timezoneForWorkspace(workspaceId: string): Promise<string> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
  return workspace ? timezoneForUser(workspace.ownerId) : "UTC";
}
