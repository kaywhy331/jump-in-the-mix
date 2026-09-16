"use server";

import { adminActionDestination } from "@/lib/admin-navigation";
import { sendStaffInvitationAction } from "@/lib/staff-invitation-actions";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { changeStaffAccess, StaffAccessError } from "@/lib/staff-access";
import type { AdminRole } from "@/lib/admin-permissions";

function fail(message: string, data: FormData): never { redirect(adminActionDestination(data, "/admin/team", { error: message })); }

export async function saveStaffAccessAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("staff.manage");
  const rate = await consumeRateLimit({ scope: "admin.staff.change", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) fail("Too many attempts. Try again in 15 minutes.", formData);
  const password = String(formData.get("currentPassword") ?? "");
  if (password.length > 72 || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) fail("Enter your current password to change staff access.", formData);
  if (env.requireAdminMfa && !await prisma.adminMfaSession.findFirst({ where: { sessionId: session.id, userId: user.id, verifiedAt: { gte: new Date(Date.now() - 10 * 60_000) }, expiresAt: { gt: new Date() } } })) {
    redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(adminActionDestination(formData, "/admin/team"))}`);
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254) fail("Choose a valid account email.", formData);
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!target) fail("That email needs a verified account before you can add staff access.", formData);
  const expectedRevision = Number(formData.get("revision"));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail("Reload the staff member before saving.", formData);
  try {
    await changeStaffAccess({ actorUserId: user.id, actorSessionId: session.id, targetUserId: target.id, expectedRevision,
      role: String(formData.get("role")) as AdminRole, status: String(formData.get("status")) as "ACTIVE" | "DISABLED",
      grants: formData.getAll("grant").map(String), denies: formData.getAll("deny").map(String), reason: String(formData.get("reason") ?? "") });
  } catch (error) {
    if (error instanceof StaffAccessError) fail(error.message, formData);
    throw error;
  }
  revalidatePath("/admin", "layout");
  if (target.id === user.id) redirect("/login?signedOutEverywhere=1");
  redirect(adminActionDestination(formData, "/admin/team", { saved: String(Date.now()), changed: email }));
}

export async function addStaffAccessAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin("staff.manage");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid staff email.", formData);
  const target = await prisma.user.findUnique({ where: { email }, select: { emailVerifiedAt: true, suspendedAt: true, staffMembership: { select: { id: true } } } });
  if (!target) return sendStaffInvitationAction(formData);
  if (target.staffMembership) fail("This person already has a staff record. Find them in the roster to change it.", formData);
  if (!target.emailVerifiedAt || target.suspendedAt) fail("The existing account must be verified and active before staff access can be added.", formData);
  return saveStaffAccessAction(formData);
}
