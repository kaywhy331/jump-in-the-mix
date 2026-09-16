"use server";

import { safeAdminReturnTo } from "@/lib/admin-navigation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { manageUserAccess, UserAdminError, type UserAdminOperation } from "@/lib/user-admin";

export async function manageUserAccessAction(formData: FormData): Promise<void> {
  const returnTo = safeAdminReturnTo(String(formData.get("returnTo") ?? ""), "/admin/users");
  const destination = (key: string, value: string) => { const url = new URL(returnTo, "https://admin.invalid"); url.searchParams.delete("error"); url.searchParams.delete("updated"); url.searchParams.set(key, value); return `${url.pathname}${url.search}`; };
  const operation = String(formData.get("operation") ?? "");
  if (!["suspend", "restore", "revoke_sessions"].includes(operation)) redirect(destination("error", "Choose a listed account operation."));
  const { user, session } = await requirePlatformAdmin(["users.read", operation === "revoke_sessions" ? "sessions.revoke" : "users.suspend"]);
  const rate = await consumeRateLimit({ scope: "admin.user.access", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) redirect(destination("error", "Too many attempts. Try again in 15 minutes."));
  try {
    await manageUserAccess({ actorUserId: user.id, actorSessionId: session.id, targetUserId: String(formData.get("userId") ?? ""), expectedRevision: Number(formData.get("revision")), operation: operation as UserAdminOperation, reason: String(formData.get("reason") ?? ""), password: String(formData.get("currentPassword") ?? "") });
  } catch (error) {
    if (error instanceof UserAdminError) {
      if (error.needsMfa) redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(returnTo)}`);
      redirect(destination("error", error.message));
    }
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect(destination("updated", operation));
}
