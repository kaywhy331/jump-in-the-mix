"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import {
  importSharedMixIntoWorkspace,
  publishWorkspaceMix,
  toggleSharedMixVote,
  unpublishWorkspaceMix
} from "@/lib/shared-mix-service";

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
  if (!sharedMixId) fail(returnTo, "Choose a Mix Template to import.");
  try {
    const result = await importSharedMixIntoWorkspace({ workspaceId: workspace.id, actorUserId: user.id, sharedMixId });
    redirect(`/mixes/${result.mixId}/edit?imported=${result.importNumber}`);
  } catch (error) {
    fail(returnTo, error instanceof Error ? error.message : "The Mix Template could not be imported.");
  }
}

export async function toggleSharedMixVoteAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const returnTo = templatesReturnTo(formData);
  if (impersonation) fail(returnTo, "Administrator support sessions are view-only.");
  const sharedMixId = value(formData, "sharedMixId");
  if (!sharedMixId) fail(returnTo, "Choose a Mix Template.");
  try {
    const result = await toggleSharedMixVote({ workspaceId: workspace.id, actorUserId: user.id, sharedMixId });
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${result.voted ? "voted" : "unvoted"}=1`);
  } catch (error) {
    fail(returnTo, error instanceof Error ? error.message : "Your vote could not be saved.");
  }
}

export async function shareMixAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const path = mixId ? `/mixes/${mixId}/share` : "/mixes";
  if (impersonation) fail(path, "Administrator support sessions are view-only.");
  if (!mixId) fail("/mixes", "Choose a Mix to share.");
  try {
    await publishWorkspaceMix({
      workspaceId: workspace.id,
      actorUserId: user.id,
      mixId,
      metadata: {
        title: value(formData, "title"),
        description: value(formData, "description"),
        category: value(formData, "category"),
        industry: value(formData, "industry"),
        framework: value(formData, "framework") || null
      }
    });
    redirect(`${path}?submitted=1`);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The Mix could not be submitted.");
  }
}

export async function unpublishMixAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const path = mixId ? `/mixes/${mixId}/share` : "/mixes";
  if (impersonation) fail(path, "Administrator support sessions are view-only.");
  if (!mixId) fail("/mixes", "Choose a Mix.");
  try {
    await unpublishWorkspaceMix({ workspaceId: workspace.id, actorUserId: user.id, mixId });
    redirect(`${path}?unpublished=1`);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The shared Mix could not be unpublished.");
  }
}
