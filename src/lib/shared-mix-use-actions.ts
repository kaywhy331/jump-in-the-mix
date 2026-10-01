"use server";

import { UserFacingError } from "@/lib/user-facing-error";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { type ErrorViewer, withViewerError } from "@/lib/form-errors";
import { LibraryError } from "@/lib/library-content";
import { SharedMixContentError } from "@/lib/shared-mix";
import { useSharedMixTemplate } from "@/lib/shared-mix-use-service";
import { prisma } from "@/lib/prisma";
import { timezoneForUser } from "@/lib/display-preferences";

function value(formData: FormData, key: string, maximum = 4000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item).trim()).filter(Boolean);
}

function fail(sharedMixId: string, message: string, viewer: ErrorViewer): never {
  redirect(withViewerError(`/templates/${encodeURIComponent(sharedMixId)}/use`, message, viewer));
}

/**
 * Sentences useSharedMixTemplate (shared-mix-use-service.ts, with parseBroadcastScheduleInput) throws as plain errors.
 * Matched exactly, so a database or network error's text never reaches the page; it gets the fixed sentence.
 */
const SETUP_REFUSALS = new Set([
  "The template setup request is invalid. Reload and try again.",
  "This workspace is unavailable.",
  "Choose everyone or at least one tag.",
  "Choose only active tags.",
  "This Mix does not identify its saved date type.",
  "Choose a valid Mix start date.",
  "Choose a valid Mix start time.",
  "Choose a valid Mix timezone."
]);
const INACTIVE_DATE_TYPE = /^Turn on the [^\n]+ date type before using this Mix\.$/;

function setupRefusal(error: unknown): string {
  if (error instanceof LibraryError || error instanceof SharedMixContentError || error instanceof UserFacingError) return error.message;
  return error instanceof Error && (SETUP_REFUSALS.has(error.message) || INACTIVE_DATE_TYPE.test(error.message)) ? error.message : "The ready-made Mix could not be used.";
}

export async function useSharedMixTemplateAction(formData: FormData): Promise<void> {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  const sharedMixId = value(formData, "sharedMixId", 100);
  if (!sharedMixId) redirect(withViewerError("/templates", "Choose a ready-made Mix.", session));
  if (impersonation) fail(sharedMixId, "Administrator support sessions are view-only.", session);
  const status = value(formData, "status", 20) === "ACTIVE" ? "ACTIVE" : "DRAFT";
  if (status === "ACTIVE" && value(formData, "activationConfirmed", 4) !== "1") {
    const preference = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { reviewMixActivation: true } });
    if (preference?.reviewMixActivation !== false) fail(sharedMixId, "Review who gets the Mix before turning it on.", session);
  }
  const workspaceTimezone = await timezoneForUser(user.id);
  let result: Awaited<ReturnType<typeof useSharedMixTemplate>>;
  try {
    result = await useSharedMixTemplate({
      workspaceId: workspace.id,
      actorUserId: user.id,
      sharedMixId,
      expectedVersion: Number(value(formData, "expectedVersion", 12)),
      requestId: value(formData, "requestId", 120),
      name: value(formData, "name", 160),
      status,
      assignAllContacts: formData.get("assignAllContacts") === "on",
      groupIds: [...new Set(values(formData, "groupIds"))],
      broadcastDate: value(formData, "broadcastDate", 10) || null,
      broadcastTime: value(formData, "broadcastTime", 5) || null,
      broadcastTimezone: value(formData, "broadcastTimezone", 120) || workspaceTimezone
    });
  } catch (error) {
    fail(sharedMixId, setupRefusal(error), session);
  }
  redirect(`/mixes/${result.mixId}/edit?imported=1${status === "ACTIVE" ? "&activated=1" : ""}`);
}
