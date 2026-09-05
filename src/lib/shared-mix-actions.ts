"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { importSharedMixIntoWorkspace } from "@/lib/shared-mix-service";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function templatesReturnTo(formData: FormData): string {
  const requested = value(formData, "returnTo");
  return requested === "/templates" || requested.startsWith("/templates?") ? requested : "/templates";
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function importSharedMixAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const returnTo = templatesReturnTo(formData);
  if (impersonation) fail(returnTo, "Administrator support sessions are view-only.");
  const sharedMixId = value(formData, "sharedMixId");
  if (!sharedMixId) fail(returnTo, "Choose a ready-made plan.");
  try {
    const result = await importSharedMixIntoWorkspace({ workspaceId: workspace.id, actorUserId: user.id, sharedMixId });
    redirect(`/mixes/${result.mixId}/edit?imported=${result.importNumber}`);
  } catch (error) {
    fail(returnTo, error instanceof Error ? error.message : "The ready-made plan could not be added.");
  }
}
