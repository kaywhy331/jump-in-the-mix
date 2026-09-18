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
import { REFERRAL_INVITE_LIMIT, SystemMixError } from "@/lib/system-mix";
import { isValidEmail, normalizePhone } from "@/lib/contact-input";

const path = "/mixes/system";
function fail(message: string): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }

export async function sendSystemInviteAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Support sessions are view-only.");
  if (env.pilotMode) fail("Network invitations are unavailable in private owner-only mode.");
  if (!user.emailVerifiedAt) fail("Verify your email before inviting your contacts.");
  if (!integrationEncryptionConfigured()) fail("Invitations are temporarily unavailable. Please try again later.");
  const decision = await consumeRateLimit({ scope: "system.invite.prepare", identifiers: [user.id], limit: 10, windowMs: 60 * 60_000 });
  if (!decision.allowed) fail("Too many invitation attempts. Please try again later.");
  const expectedVersion = Number(formData.get("systemMixVersion"));
  const expectedSender = String(formData.get("previewSender") ?? "");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !expectedSender) fail("Review the updated invitation before preparing it.");
  const addresses = formData.getAll("address").map(value => String(value).trim());
  const names = formData.getAll("name").map(value => String(value).trim().slice(0, 160));
  const contactIds = formData.getAll("contactId").map(String);
  if (addresses.length < 1 || addresses.length > REFERRAL_INVITE_LIMIT || addresses.some(address => !address)) fail("Add one to three email addresses or text numbers.");
  const recipients = addresses.map((address, index) => {
    const email = address.includes("@") ? address.toLowerCase() : null;
    const phone = email ? null : normalizePhone(address);
    if (email ? !isValidEmail(email) : !phone || !/^[+\d\s().-]+$/.test(address)) fail("Enter a valid email address or text number for each person.");
    return { email, phone, name: names[index] || address, contactId: contactIds[index] || "" };
  });
  if (new Set(recipients.map(person => person.email ?? person.phone)).size !== recipients.length) fail("Each invitation needs a different email address or text number.");
  try {
    await prisma.$transaction(async tx => {
      await lockAccess(tx);
      const selectedContacts = new Set<string>();
      for (const person of recipients) {
        const matches = person.contactId ? [] : await tx.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null, ...(person.email ? { emails: { some: { normalized: person.email } } } : { phones: { some: { normalized: person.phone! } } }) }, select: { id: true }, take: 2 });
        if (matches.length > 1) throw new AccessInviteError("More than one contact has these details. Choose a saved contact.");
        const contactId = person.contactId || matches[0]?.id || (await tx.contact.create({ data: {
          workspaceId: workspace.id, displayName: person.name, firstName: person.name,
          ...(person.email ? { emails: { create: { email: person.email, normalized: person.email, isPrimary: true } } } : { phones: { create: { phone: person.phone!, normalized: person.phone!, isPrimary: true } } })
        } })).id;
        if (selectedContacts.has(contactId)) throw new AccessInviteError("Choose each person only once per batch.");
        selectedContacts.add(contactId);
        await allocateAccessInvite(tx, { userId: user.id, workspaceId: workspace.id, contactId, recipientEmail: person.email ?? undefined, recipientPhone: person.phone ?? undefined, expectedVersion, expectedSender });
      }
    });
  } catch (error) {
    if (error instanceof AccessInviteError || error instanceof SystemMixError) fail(error.message);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") fail("An invitation is already being prepared for this person. Check Today before trying again.");
    throw error;
  }
  revalidatePath(path); revalidatePath("/jumps"); revalidatePath("/contacts");
  redirect(`/jumps?invitations=${recipients.length}`);
}

export async function revokeSystemInviteAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) fail("Support sessions are view-only.");
  const id = String(formData.get("id") ?? "");
  const result = await prisma.$transaction(async tx => {
    await lockAccess(tx);
    const changed = await tx.referralAccessInvite.updateMany({ where: { id, inviterUserId: user.id, workspaceId: workspace.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (changed.count) {
      await tx.waitlistDelivery.updateMany({ where: { inviteId: id, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null, lastError: null } });
      await tx.jump.updateMany({ where: { accessInviteId: id, workspaceId: workspace.id, status: "PENDING" }, data: { status: "CANCELED", completionMethod: "invitation_revoked" } });
    }
    return changed;
  });
  if (result.count !== 1) fail("This invitation is unavailable or already used.");
  revalidatePath(path); revalidatePath("/jumps");
  redirect(`${path}?revoked=1`);
}
