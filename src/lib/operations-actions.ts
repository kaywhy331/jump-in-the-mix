"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { acknowledgeOperationsCheck, OperationsReviewError } from "@/lib/operations-alerts";

export async function acknowledgeOperationsCheckAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin(["operations.read", "operations.manage"]);
  try {
    if (!(await consumeRateLimit({ scope: "admin.ops-acknowledge", identifiers: [user.id], limit: 20, windowMs: 5 * 60_000 })).allowed) throw new OperationsReviewError("Too many acknowledgment attempts. Please wait five minutes.");
    await acknowledgeOperationsCheck({ actorUserId: user.id, actorSessionId: session.id, code: String(formData.get("code") ?? ""), expectedRevision: Number(formData.get("revision")), reason: String(formData.get("reason") ?? "") });
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    redirect(`/admin/operations/alerts?error=${encodeURIComponent(error instanceof OperationsReviewError ? error.message : "The alert could not be acknowledged. Reload and review it again.")}`);
  }
  revalidatePath("/admin/operations/alerts");
  redirect("/admin/operations/alerts?acknowledged=1");
}
