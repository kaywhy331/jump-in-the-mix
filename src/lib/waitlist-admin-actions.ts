"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { lockAccess } from "@/lib/access-lock";
import { prisma } from "@/lib/prisma";
import { inviteSelectedWaitlistEntries, WAITLIST_INTERVAL_MS, waitlistSendingReady, WAITLIST_MANUAL_LIMIT } from "@/lib/waitlist";
import { WAITLIST_RETRY_WINDOW_MS } from "@/lib/waitlist-delivery";
import { AdmissionError } from "@/lib/admission";
import { lockStaff, staffSessionHasPermissions } from "@/lib/staff-access";
import { invitationEmailSuppressed } from "@/lib/invitation-preferences";

function fail(message: string): never { redirect(`/admin/waitlist?error=${encodeURIComponent(message)}`); }

export async function inviteWaitlistSelectionAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin(["waitlist.read", "waitlist.manage"]);
  const ids = [...new Set(formData.getAll("entryId").map(String))];
  const reason = String(formData.get("reason") ?? "").trim();
  if (!ids.length || ids.length > WAITLIST_MANUAL_LIMIT || ids.some(id => id.length > 100)) fail(`Select between 1 and ${WAITLIST_MANUAL_LIMIT} people.`);
  if (!reason || reason.length > 500) fail("Enter a reason of 1–500 characters.");
  if (!waitlistSendingReady()) fail("Configure transactional email and encryption before sending invitations.");
  let result;
  try { result = await inviteSelectedWaitlistEntries(ids, user.id, reason); }
  catch (error) { if (error instanceof AdmissionError) fail(error.message); throw error; }
  revalidatePath("/admin/waitlist");
  redirect(`/admin/waitlist?queued=${result.queued}&skipped=${result.skipped}`);
}

export async function setWaitlistScheduleAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin(["waitlist.read", "waves.pause"]);
  const action = String(formData.get("scheduleAction") ?? "");
  if (action !== "pause" && action !== "resume") fail("Choose pause or resume.");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 500) fail("Enter a reason of 1–500 characters.");
  await prisma.$transaction(async tx => {
    await lockAccess(tx);
    const schedule = await tx.waitlistSchedule.findUnique({ where: { id: "default" } });
    const paused = action === "pause";
    if (schedule?.paused === paused) return;
    const nextRunAt = new Date(Date.now() + WAITLIST_INTERVAL_MS);
    await tx.waitlistSchedule.upsert({ where: { id: "default" }, create: { id: "default", paused, nextRunAt }, update: { paused, ...(!paused ? { nextRunAt } : {}) } });
    await tx.waitlistAudit.create({ data: { actorUserId: user.id, action: `SCHEDULE_${action.toUpperCase()}`, reason } });
  });
  revalidatePath("/admin/waitlist");
  redirect("/admin/waitlist");
}

export async function retryWaitlistDeliveryAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin(["waitlist.read", "waitlist.manage"]);
  const id = String(formData.get("deliveryId") ?? "");
  if (!id || id.length > 100) fail("Choose a listed invitation delivery.");
  const retried = await prisma.$transaction(async tx => {
    await lockStaff(tx); await lockAccess(tx);
    if (!await staffSessionHasPermissions(tx, { userId: user.id, sessionId: session.id }, ["waitlist.read", "waitlist.manage"])) return 0;
    const delivery = await tx.waitlistDelivery.findUnique({ where: { id }, select: { invite: { select: { recipientEmail: true } } } });
    if (!delivery?.invite || await invitationEmailSuppressed(tx, delivery.invite.recipientEmail)) return 0;
    const changed = await tx.waitlistDelivery.updateMany({ where: { id, status: "REVIEW", firstAttemptAt: { gt: new Date(Date.now() - WAITLIST_RETRY_WINDOW_MS) }, invite: { acceptedAt: null, revokedAt: null, source: { not: "REFERRAL" } } }, data: { status: "QUEUED", nextAttemptAt: new Date() } });
    if (changed.count) await tx.waitlistAudit.create({ data: { actorUserId: user.id, action: "DELIVERY_RETRY", reason: `Delivery ${id}` } });
    return changed.count;
  });
  if (!retried) fail("This delivery cannot be safely retried. Check the provider record before sending again.");
  revalidatePath("/admin/waitlist");
  redirect("/admin/waitlist?retry=1");
}
