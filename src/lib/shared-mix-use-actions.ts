"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { useSharedMixTemplate } from "@/lib/shared-mix-use-service";
import { timezoneForUser } from "@/lib/display-preferences";

function value(formData: FormData, key: string, maximum = 4000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item).trim()).filter(Boolean);
}

function fail(sharedMixId: string, message: string): never {
  redirect(`/templates/${encodeURIComponent(sharedMixId)}/use?error=${encodeURIComponent(message)}`);
}

export async function useSharedMixTemplateAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const sharedMixId = value(formData, "sharedMixId", 100);
  if (!sharedMixId) redirect("/templates?error=Choose%20a%20ready-made%20plan.");
  if (impersonation) fail(sharedMixId, "Administrator support sessions are view-only.");
  const status = value(formData, "status", 20) === "ACTIVE" ? "ACTIVE" : "DRAFT";
  const workspaceTimezone = await timezoneForUser(user.id);
  let result: Awaited<ReturnType<typeof useSharedMixTemplate>>;
  try {
    result = await useSharedMixTemplate({
      workspaceId: workspace.id,
      actorUserId: user.id,
      sharedMixId,
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
    fail(sharedMixId, error instanceof Error ? error.message : "The ready-made plan could not be used.");
  }
  redirect(`/mixes/${result.mixId}/edit?imported=1${status === "ACTIVE" ? "&activated=1" : ""}`);
}
