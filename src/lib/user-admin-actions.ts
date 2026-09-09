"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { manageUserAccess, UserAdminError, type UserAdminOperation } from "@/lib/user-admin";

export async function manageUserAccessAction(formData: FormData): Promise<void> {
  const operation = String(formData.get("operation") ?? "");
  if (!["suspend", "restore", "revoke_sessions"].includes(operation)) redirect("/admin/users?error=Choose+a+listed+account+operation.");
  const { user, session } = await requirePlatformAdmin(["users.read", operation === "revoke_sessions" ? "sessions.revoke" : "users.suspend"]);
  const rate = await consumeRateLimit({ scope: "admin.user.access", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) redirect("/admin/users?error=Too+many+attempts.+Try+again+in+15+minutes.");
  try {
    await manageUserAccess({ actorUserId: user.id, actorSessionId: session.id, targetUserId: String(formData.get("userId") ?? ""), expectedRevision: Number(formData.get("revision")), operation: operation as UserAdminOperation, reason: String(formData.get("reason") ?? ""), password: String(formData.get("currentPassword") ?? "") });
  } catch (error) {
    if (error instanceof UserAdminError) {
      if (error.needsMfa) redirect("/account/admin-mfa?verify=1&returnTo=%2Fadmin%2Fusers");
      redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath("/admin", "layout");
  const query = String(formData.get("q") ?? "").trim().slice(0, 254);
  redirect(`/admin/users?${new URLSearchParams({ updated: operation, ...(query ? { q: query } : {}) })}`);
}
