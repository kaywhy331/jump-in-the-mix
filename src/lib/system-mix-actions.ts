"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { integrationEncryptionConfigured } from "@/lib/integration-crypto";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AccessInviteError, allocateAccessInvite } from "@/lib/referral-access";
import { lockAccess } from "@/lib/access-lock";
import { transactionalEmailConfigured } from "@/lib/transactional-email";
import { SystemMixError } from "@/lib/system-mix";

const path = "/mixes/system";
function fail(message: string): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }

export async function sendSystemInviteAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Support sessions are view-only.");
  if (env.pilotMode) fail("Network invitations are unavailable in private owner-only mode.");
  if (!user.emailVerifiedAt) fail("Verify your email before inviting your contacts.");
  if (!transactionalEmailConfigured() || !integrationEncryptionConfigured()) fail("Invitations are temporarily unavailable. Please try again later.");
  const decision = await consumeRateLimit({ scope: "system.invite.send", identifiers: [user.id], limit: 10, windowMs: 60 * 60_000 });
  if (!decision.allowed) fail("Too many invitation attempts. Please try again later.");
  let contactId = ""; let recipientEmail = "";
  try {
    const recipient = JSON.parse(String(formData.get("recipient") ?? ""));
    if (typeof recipient.contactId !== "string" || typeof recipient.email !== "string") throw new Error();
    contactId = recipient.contactId; recipientEmail = recipient.email;
  } catch { fail("Choose a contact and their saved email address."); }
  const expectedVersion = Number(formData.get("systemMixVersion"));
  const expectedSender = formData.get("previewSender"), expectedContact = formData.get("previewContact");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || typeof expectedSender !== "string" || typeof expectedContact !== "string") fail("Review the updated invitation before sending.");
  let invite;
  try {
    invite = await prisma.$transaction(tx => allocateAccessInvite(tx, { userId: user.id, workspaceId: workspace.id, contactId, recipientEmail, expectedVersion, expectedSender, expectedContact }));
  } catch (error) {
    if (error instanceof AccessInviteError || error instanceof SystemMixError) fail(error.message);
    // A repeated click for the same contact may race the unique constraint.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      fail("An invitation is already being prepared for this contact. Open the System Mix and retry.");
    }
    throw error;
  }
  if (invite.acceptedAt || invite.revokedAt) fail("This contact’s invitation has already been used or revoked.");
  const delivery = await prisma.waitlistDelivery.findUnique({ where: { inviteId: invite.id }, select: { status: true } });
  if (!delivery) fail("This older invitation needs delivery review. Contact support before sending it again.");
  if (delivery.status === "REVIEW" || delivery.status === "CANCELED") fail("This invitation needs delivery review. Contact support for help.");
  revalidatePath(path); revalidatePath("/mixes");
  redirect(`${path}?${delivery.status === "SENT" ? "sent" : "queued"}=1`);
}

export async function revokeSystemInviteAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Support sessions are view-only.");
  const id = String(formData.get("id") ?? "");
  const result = await prisma.$transaction(async tx => {
    await lockAccess(tx);
    const changed = await tx.referralAccessInvite.updateMany({ where: { id, inviterUserId: user.id, workspaceId: workspace.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (changed.count) await tx.waitlistDelivery.updateMany({ where: { inviteId: id, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null, lastError: null } });
    return changed;
  });
  if (result.count !== 1) fail("This invitation is unavailable or already used.");
  revalidatePath(path);
  redirect(`${path}?revoked=1`);
}
