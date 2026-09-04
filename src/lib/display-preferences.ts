import type { DisplayFormatPreferences } from "@/lib/format";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

export async function displayPreferencesForUser(userId: string, fallbackTimeZone = "UTC"): Promise<DisplayFormatPreferences> {
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  return {
    locale: preference?.locale || "en-US",
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
