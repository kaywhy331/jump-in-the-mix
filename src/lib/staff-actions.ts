"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { changeStaffAccess, StaffAccessError } from "@/lib/staff-access";
import type { AdminRole } from "@/lib/admin-permissions";

function fail(message: string): never { redirect(`/admin/team?error=${encodeURIComponent(message)}`); }

export async function saveStaffAccessAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("staff.manage");
  const rate = await consumeRateLimit({ scope: "admin.staff.change", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) fail("Too many attempts. Try again in 15 minutes.");
  const password = String(formData.get("currentPassword") ?? "");
  if (password.length > 72 || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) fail("Enter your current password to change staff access.");
  if (env.requireAdminMfa && !await prisma.adminMfaSession.findFirst({ where: { sessionId: session.id, userId: user.id, verifiedAt: { gte: new Date(Date.now() - 10 * 60_000) }, expiresAt: { gt: new Date() } } })) {
    redirect("/account/admin-mfa?verify=1&returnTo=%2Fadmin%2Fteam");
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254) fail("Choose a valid account email.");
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!target) fail("That email needs a verified account before you can add staff access.");
  const expectedRevision = Number(formData.get("revision"));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail("Reload the staff member before saving.");
  try {
    await changeStaffAccess({ actorUserId: user.id, actorSessionId: session.id, targetUserId: target.id, expectedRevision,
      role: String(formData.get("role")) as AdminRole, status: String(formData.get("status")) as "ACTIVE" | "DISABLED",
      grants: formData.getAll("grant").map(String), denies: formData.getAll("deny").map(String), reason: String(formData.get("reason") ?? "") });
  } catch (error) {
    if (error instanceof StaffAccessError) fail(error.message);
    throw error;
  }
  revalidatePath("/admin", "layout");
  if (target.id === user.id) redirect("/login?signedOutEverywhere=1");
  redirect("/admin/team?saved=1");
}
