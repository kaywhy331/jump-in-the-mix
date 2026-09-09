"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { lockStaff, staffSessionHasPermissions } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";
import { prisma } from "@/lib/prisma";
import { WAITLIST_RETRY_WINDOW_MS } from "@/lib/waitlist-delivery";
import { invitationEmailSuppressed } from "@/lib/invitation-preferences";

export async function manageAccessInvitationAction(formData: FormData): Promise<void> {
  const operation = String(formData.get("operation") ?? "");
  if (operation !== "revoke" && operation !== "retry") redirect("/admin/access?error=Choose+a+listed+operation.");
  const permission = operation === "revoke" ? "access.revoke" : "jobs.retry";
  const { user, session } = await requirePlatformAdmin(["access.read", permission]);
  const inviteId = String(formData.get("inviteId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!inviteId || inviteId.length > 100 || reason.length < 10 || reason.length > 500) redirect("/admin/access?error=Enter+a+reason+of+10%E2%80%93500+characters.");
  const changed = await prisma.$transaction(async tx => {
    await lockStaff(tx);
    await lockAccess(tx);
    if (!await staffSessionHasPermissions(tx, { userId: user.id, sessionId: session.id }, ["access.read", permission])) return false;
    const invite = await tx.referralAccessInvite.findUnique({ where: { id: inviteId }, select: { id: true, recipientEmail: true, acceptedAt: true, revokedAt: true } });
    if (!invite || invite.acceptedAt || invite.revokedAt) return false;
    if (operation === "revoke") {
      await tx.referralAccessInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
      await tx.waitlistDelivery.updateMany({ where: { inviteId, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null, lastError: null } });
    } else {
      if (await invitationEmailSuppressed(tx, invite.recipientEmail)) return false;
      const retried = await tx.waitlistDelivery.updateMany({ where: { inviteId, status: "REVIEW", firstAttemptAt: { gt: new Date(Date.now() - WAITLIST_RETRY_WINDOW_MS) } }, data: { status: "QUEUED", nextAttemptAt: new Date() } });
      if (!retried.count) return false;
    }
    await tx.platformAuditEvent.create({ data: { actorUserId: user.id, action: `access.invitation.${operation}`, entityType: "ReferralAccessInvite", entityId: inviteId, reason } });
    return true;
  });
  revalidatePath("/admin/access"); revalidatePath("/admin/waitlist"); revalidatePath("/mixes/system");
  const version = Number(formData.get("systemMixVersion"));
  const filter = Number.isSafeInteger(version) && version > 0 && version <= 2_147_483_647 ? `&systemMixVersion=${version}` : "";
  redirect((changed ? `/admin/access?done=${operation}` : "/admin/access?error=The+invitation+changed+or+cannot+be+safely+retried.+Check+the+provider+record.") + filter);
}
