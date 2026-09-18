import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { lockAccess } from "@/lib/access-lock";
import { getAdmissionPolicy } from "@/lib/admission";
import { invitationEmailSuppressed } from "@/lib/invitation-preferences";
import { isValidEmail, normalizePhone } from "@/lib/contact-input";

import { REFERRAL_INVITE_LIMIT, renderSystemMix } from "@/lib/system-mix";
import { lockSystemMix, readPublishedSystemMix } from "@/lib/system-mix-store";
export class AccessInviteError extends Error {}

export function validAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// Caller runs this in a transaction: all writes roll back if allocation fails.
export async function allocateAccessInvite(tx: Prisma.TransactionClient, input: { userId: string; workspaceId: string; contactId: string; recipientEmail?: string; recipientPhone?: string; expectedVersion: number; expectedSender?: string; expectedContact?: string }) {
  await lockAccess(tx);
  const owner = await tx.user.findUnique({ where: { id: input.userId }, select: { name: true, emailVerifiedAt: true, suspendedAt: true } });
  if (owner?.suspendedAt) throw new AccessInviteError("Account access is paused.");
  if (!owner?.emailVerifiedAt) throw new AccessInviteError("Verify your email before inviting your contacts.");
  if (!await tx.workspace.findFirst({ where: { id: input.workspaceId, ownerId: input.userId }, select: { id: true } })) throw new AccessInviteError("Choose a contact from your own account.");
  const contact = await tx.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId, archivedAt: null }, select: { id: true, displayName: true, emails: { select: { email: true } }, phones: { select: { phone: true } }, relationshipState: { select: { doNotContact: true } } } });
  if (!contact) throw new AccessInviteError("Choose an active contact from your own account.");
  if (contact.relationshipState?.doNotContact) throw new AccessInviteError("This person is marked do not contact.");
  const recipientEmail = input.recipientEmail?.trim().toLowerCase() || null;
  const recipientPhone = input.recipientPhone ? normalizePhone(input.recipientPhone) : null;
  if (Boolean(recipientEmail) === Boolean(recipientPhone)) throw new AccessInviteError("Choose one email address or text number for this invitation.");
  if (recipientEmail && (!isValidEmail(recipientEmail) || !contact.emails.some(item => item.email.trim().toLowerCase() === recipientEmail))) throw new AccessInviteError("Choose an email saved on this contact.");
  if (recipientPhone && !contact.phones.some(item => normalizePhone(item.phone) === recipientPhone)) throw new AccessInviteError("Choose a phone number saved on this contact.");
  if (recipientEmail && await tx.user.findUnique({ where: { email: recipientEmail }, select: { id: true } })) throw new AccessInviteError("This contact already has an account.");
  if (recipientEmail && await invitationEmailSuppressed(tx, recipientEmail)) throw new AccessInviteError("This person has opted out of invitations. Choose another contact.");
  const existing = await tx.referralAccessInvite.findUnique({ where: { inviterUserId_contactId: { inviterUserId: input.userId, contactId: contact.id } } });
  if (existing) {
    if (!existing.manualDelivery || existing.acceptedAt || existing.revokedAt) throw new AccessInviteError("This contact’s invitation has already been prepared, used, or revoked.");
    if (existing.recipientEmail !== recipientEmail || existing.recipientPhone !== recipientPhone) throw new AccessInviteError("This person already has an invitation for different contact details. Check Today.");
    return existing;
  }
  await lockSystemMix(tx);
  const published = await readPublishedSystemMix(tx);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== published.version || input.expectedSender !== undefined && input.expectedSender !== owner.name || input.expectedContact !== undefined && input.expectedContact !== contact.displayName) throw new AccessInviteError("Your invitation preview changed. Review the updated wording and contact details before sending.");
  if (await tx.referralAccessInvite.findFirst({ where: { ...(recipientEmail ? { recipientEmail } : { recipientPhone }), acceptedAt: null, revokedAt: null }, select: { id: true } })) throw new AccessInviteError("This contact already has an invitation. Ask them to use their existing link.");
  // Personal reminders have their own lifetime quota; they do not reserve email-wave capacity.
  const policy = await getAdmissionPolicy(tx);
  if (policy.grantsPaused || policy.referralsPaused) throw new AccessInviteError("New invitations are paused. Please try again later. Your remaining invitations are unchanged.");
  const quota = await tx.user.updateMany({ where: { id: input.userId, referralInvitesIssued: { lt: REFERRAL_INVITE_LIMIT } }, data: { referralInvitesIssued: { increment: 1 } } });
  if (quota.count !== 1) throw new AccessInviteError("You’ve used all three invitations.");
  const token = randomBytes(32).toString("base64url");
  const invite = await tx.referralAccessInvite.create({ data: {
    inviterUserId: input.userId, workspaceId: input.workspaceId, contactId: contact.id,
    recipientEmail, recipientPhone, manualDelivery: true, tokenHash: hashAuthToken(token), tokenCiphertext: encryptIntegrationCredentials({ token }), systemMixVersion: published.version
  } });
  const url = new URL("/register", env.appUrl); url.searchParams.set("invite", token);
  const { subject, body: intro } = renderSystemMix(published.content, owner.name, contact.displayName);
  const body = `${intro}\n\nCreate your free account: ${url.href}\n\n${recipientEmail ? `Use ${recipientEmail} to sign up. ` : ""}This personal link can create one account. Please keep it for yourself.`;
  const channel = recipientEmail ? "EMAIL" : "SMS";
  const mix = await tx.mix.create({ data: { workspaceId: input.workspaceId, name: "Personal invitation", triggerMode: "MANUAL_START", status: "ARCHIVED", source: "ONE_TIME" } });
  const template = await tx.stepTemplate.create({ data: { workspaceId: input.workspaceId, name: "Personal invitation", channel, isActive: false } });
  const version = await tx.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, subject, body, longSms: channel === "SMS" } });
  const step = await tx.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1, isActive: false } });
  const now = new Date();
  await tx.jump.create({ data: {
    workspaceId: input.workspaceId, contactId: contact.id, accessInviteId: invite.id,
    mixId: mix.id, mixStepId: step.id, stepVersionId: version.id, scheduledAt: now, baseScheduledAt: now,
    reason: "Send a personal invitation", uniquenessKey: `personal-invite:${invite.id}`,
    templateSnapshot: { subject, body, channel, oneTime: true }, renderedSnapshot: { subject, body, script: null }
  } });
  await tx.contactActivity.create({ data: { workspaceId: input.workspaceId, contactId: contact.id, actorUserId: input.userId,
    kind: "SYSTEM", summary: "Prepared a personal invitation with the Jump in the Mix System Mix.", metadata: { accessInviteId: invite.id, systemMixVersion: published.version } } });
  if (recipientEmail) await tx.waitlistEntry.updateMany({ where: { email: recipientEmail, status: "WAITING" }, data: { status: "ACCESS_GRANTED", accessGrantedAt: new Date() } });
  return invite;
}

// Claim and account creation must share the same transaction. GET never consumes a link.
export async function claimAccessInvite(tx: Prisma.TransactionClient, token: string | undefined, email: string): Promise<string | null> {
  await lockAccess(tx);
  if (env.pilotMode) {
    if (await tx.user.count() === 0) return null;
    throw new AccessInviteError("Owner setup is already complete on this server.");
  }
  if (!token || !validAccessToken(token)) throw new AccessInviteError("Use the unique invitation link shared by someone in your network.");
  if ((await getAdmissionPolicy(tx)).redemptionPaused) throw new AccessInviteError("Account creation is temporarily paused. Your invitation has not been used. Please try this same link again later.");
  const tokenHash = hashAuthToken(token);
  const claimed = await tx.referralAccessInvite.updateMany({ where: { tokenHash, OR: [{ recipientEmail: email.trim().toLowerCase() }, { recipientEmail: null, recipientPhone: { not: null }, manualDelivery: true }], acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
  if (claimed.count !== 1) throw new AccessInviteError("This invitation is unavailable or has already been used.");
  const invite = await tx.referralAccessInvite.findUniqueOrThrow({ where: { tokenHash }, select: { id: true } });
  await tx.jump.updateMany({ where: { accessInviteId: invite.id, status: "PENDING" }, data: { status: "CANCELED", completionMethod: "invitation_accepted" } });
  return invite.id;
}
