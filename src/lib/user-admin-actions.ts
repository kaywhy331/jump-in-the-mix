"use server";

import { safeAdminReturnTo } from "@/lib/admin-navigation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { SIGNED_ERROR_PARAMS, withViewerError } from "@/lib/form-errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { manageUserAccess, UserAdminError, type UserAdminOperation } from "@/lib/user-admin";

export async function manageUserAccessAction(formData: FormData): Promise<void> {
  const returnTo = safeAdminReturnTo(String(formData.get("returnTo") ?? ""), "/admin/users");
  const destination = (key?: string, value = "") => { const url = new URL(returnTo, "https://admin.invalid"); for (const name of [...SIGNED_ERROR_PARAMS, "updated"]) url.searchParams.delete(name); if (key) url.searchParams.set(key, value); return `${url.pathname}${url.search}`; };
  const operation = String(formData.get("operation") ?? "");
  // The error is signed for the staff member, so the guard runs first; every operation needs users.read.
  if (!["suspend", "restore", "revoke_sessions"].includes(operation)) redirect(withViewerError(destination(), "Choose a listed account operation.", (await requirePlatformAdmin("users.read")).session));
  const { user, session } = await requirePlatformAdmin(["users.read", operation === "revoke_sessions" ? "sessions.revoke" : "users.suspend"]);
  const rate = await consumeRateLimit({ scope: "admin.user.access", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) redirect(withViewerError(destination(), "Too many attempts. Try again in 15 minutes.", session));
  try {
    await manageUserAccess({ actorUserId: user.id, actorSessionId: session.id, targetUserId: String(formData.get("userId") ?? ""), expectedRevision: Number(formData.get("revision")), operation: operation as UserAdminOperation, reason: String(formData.get("reason") ?? ""), password: String(formData.get("currentPassword") ?? "") });
  } catch (error) {
    if (error instanceof UserAdminError) {
      if (error.needsMfa) redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(returnTo)}`);
      redirect(withViewerError(destination(), error.message, session));
    }
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect(destination("updated", operation));
}
