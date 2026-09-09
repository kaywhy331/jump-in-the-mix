"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { hashAuthToken } from "@/lib/auth-tokens";
import { issueStaffInvitation, manageStaffInvitation, acceptStaffInvitation, StaffInvitationError } from "@/lib/staff-invitations";
import { StaffAccessError } from "@/lib/staff-access";
import type { AdminRole } from "@/lib/admin-permissions";

function teamError(error: unknown): never {
  if (error instanceof StaffInvitationError && error.needsMfa) redirect("/account/admin-mfa?verify=1&returnTo=%2Fadmin%2Fteam");
  if (error instanceof StaffInvitationError || error instanceof StaffAccessError) redirect(`/admin/team?error=${encodeURIComponent(error.message)}`);
  throw error;
}

export async function sendStaffInvitationAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("staff.manage");
  const limit = await consumeRateLimit({ scope: "staff.invitation.issue", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!limit.allowed) redirect("/admin/team?error=Too+many+attempts.+Try+again+in+15+minutes.");
  try {
    await issueStaffInvitation({ actorUserId: user.id, actorSessionId: session.id, password: String(formData.get("currentPassword") ?? ""), reason: String(formData.get("reason") ?? ""),
      email: String(formData.get("email") ?? ""), role: String(formData.get("role") ?? "SUPPORT") as AdminRole,
      grants: formData.getAll("grant").map(String), denies: formData.getAll("deny").map(String) });
  } catch (error) { teamError(error); }
  revalidatePath("/admin/team"); redirect("/admin/team?invitation=queued");
}

export async function changeStaffInvitationAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("staff.manage");
  const limit = await consumeRateLimit({ scope: "staff.invitation.manage", identifiers: [user.id], limit: 15, windowMs: 15 * 60_000 });
  if (!limit.allowed) redirect("/admin/team?error=Too+many+attempts.+Try+again+in+15+minutes.");
  try {
    await manageStaffInvitation({ actorUserId: user.id, actorSessionId: session.id, password: String(formData.get("currentPassword") ?? ""), reason: String(formData.get("reason") ?? ""),
      invitationId: String(formData.get("invitationId") ?? ""), operation: String(formData.get("operation")) as "revoke" | "retry" });
  } catch (error) { teamError(error); }
  revalidatePath("/admin/team"); redirect("/admin/team?invitation=updated");
}

export async function acceptStaffInvitationAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const path = /^[A-Za-z0-9_-]{43}$/.test(token) ? `/staff/accept?token=${encodeURIComponent(token)}` : "/staff/accept";
  const fail = (message: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
  const { ipAddress } = await getRequestMetadata();
  const ip = await consumeRateLimit({ scope: "staff.invitation.accept.ip", identifiers: [ipAddress], limit: 10, windowMs: 60 * 60_000 });
  const link = await consumeRateLimit({ scope: "staff.invitation.accept.token", identifiers: [hashAuthToken(token.slice(0, 200))], limit: 5, windowMs: 60 * 60_000 });
  if (!ip.allowed || !link.allowed) fail("Too many attempts. Please try again in an hour.");
  const password = String(formData.get("password") ?? "").trim();
  if (password !== String(formData.get("confirmPassword") ?? "").trim()) fail("The passwords do not match.");
  let user: { id: string };
  try {
    user = await acceptStaffInvitation({ token, email: String(formData.get("email") ?? ""), name: String(formData.get("name") ?? ""), password });
  } catch (error) {
    if (error instanceof StaffInvitationError || error instanceof StaffAccessError) fail(error.message);
    throw error;
  }
  await createSession(user.id);
  redirect("/account/admin-mfa?setup=1&returnTo=%2Fadmin");
}
