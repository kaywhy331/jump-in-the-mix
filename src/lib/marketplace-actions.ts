"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace, requirePlatformAdmin } from "@/lib/auth";
import type { FormResult } from "@/lib/form-errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { addFromMarketplace, markReportsSeen, reportListing, reviewListing, shareOnMarketplace, unshareFromMarketplace } from "@/lib/marketplace-service";

/** Messages our own code writes are shown as they are; database and unexpected errors get the plain fallback. */
const failed = (error: unknown, fallback: string): FormResult => ({ error: error instanceof Error && error.name === "Error" ? error.message : fallback });
async function writer() {
  const session = await requireWorkspace();
  if (session.impersonation) throw new Error("Administrator support sessions are view-only.");
  return session;
}
const refresh = () => { revalidatePath("/marketplace"); revalidatePath("/mixes"); revalidatePath("/mixes/mega"); };
const item = (listingId: string, section = "mine") => `/marketplace?section=${section}&item=${encodeURIComponent(`listing:${listingId}`)}`;

export async function shareAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  let listingId = "";
  try {
    const { workspace, user } = await writer();
    const kind = data.get("kind") === "MEGA_MIX" ? "MEGA_MIX" : "MIX";
    listingId = (await shareOnMarketplace({ workspaceId: workspace.id, actorUserId: user.id, kind, targetId: String(data.get("targetId") ?? ""), publicName: String(data.get("publicName") ?? ""),
      summary: String(data.get("summary") ?? ""), industry: String(data.get("industry") ?? ""), confirmed: data.get("confirmed") === "on" })).id;
  } catch (error) { return failed(error, "This could not be shared. Your entries are kept."); }
  refresh();
  redirect(`${item(listingId)}&shared=1`);
}

export async function unshareAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  const listingId = String(data.get("listingId") ?? "");
  try { const { workspace, user } = await writer(); await unshareFromMarketplace({ workspaceId: workspace.id, actorUserId: user.id, listingId }); }
  catch (error) { return failed(error, "Sharing could not be stopped. Try again."); }
  refresh();
  redirect(`${item(listingId)}&unshared=1`);
}

export async function addFromMarketplaceAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  let target = "/mixes";
  try {
    const { workspace, user } = await writer();
    if (data.get("reviewed") !== "on") return { error: "Review the wording before adding it." };
    const result = await addFromMarketplace({ listingId: String(data.get("listingId") ?? ""), workspaceId: workspace.id, actorUserId: user.id, name: String(data.get("name") ?? ""), expectedFingerprint: String(data.get("fingerprint") ?? "") });
    target = result.pipelineId ? `/mixes/mega?megaMix=${encodeURIComponent(result.pipelineId)}&imported=1` : `/mixes?mix=${encodeURIComponent(result.mixIds[0])}&imported=1#selected-mix`;
  } catch (error) { return failed(error, "That share couldn’t be added. Try again."); }
  refresh();
  redirect(target);
}

export async function reportAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  const listingId = String(data.get("listingId") ?? "");
  let hidden = false;
  try {
    const { workspace, user } = await writer();
    const limit = await consumeRateLimit({ scope: "marketplace.report", identifiers: [workspace.id, user.id], limit: 10, windowMs: 3_600_000, blockMs: 3_600_000 });
    if (!limit.allowed) return { error: "You’ve sent several reports recently. Try again later, or contact support." };
    hidden = (await reportListing({ listingId, reporterUserId: user.id, reporterWorkspaceId: workspace.id, reason: String(data.get("reason") ?? ""), details: String(data.get("details") ?? "") })).hidden;
  } catch (error) { return failed(error, "The report could not be sent. Try again."); }
  refresh();
  redirect(`/marketplace?section=community&reported=${hidden ? "hidden" : "1"}`);
}

export async function markReportsSeenAction(data: FormData) {
  const { workspace, impersonation } = await requireWorkspace();
  if (impersonation) return;
  await markReportsSeen(workspace.id, String(data.get("listingId") ?? ""));
  refresh();
}

export async function reviewListingAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  try {
    const { user } = await requirePlatformAdmin("mixes.publish");
    await reviewListing({ listingId: String(data.get("listingId") ?? ""), staffUserId: user.id, decision: data.get("decision") === "RESTORE" ? "RESTORE" : "HIDE", note: String(data.get("note") ?? "") });
  } catch (error) { return failed(error, "The decision could not be saved."); }
  revalidatePath("/admin/marketplace"); revalidatePath("/marketplace");
  redirect("/admin/marketplace?reviewed=1");
}
