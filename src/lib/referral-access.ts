import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { lockAccess } from "@/lib/access-lock";
import { admissionSnapshot, getAdmissionPolicy, issuanceProblem } from "@/lib/admission";
import { queueAccessInvitation } from "@/lib/access-invitation-mail";
import { invitationEmailSuppressed } from "@/lib/invitation-preferences";
import { escapeHtml } from "@/lib/transactional-email";

import { REFERRAL_INVITE_LIMIT, renderSystemMix } from "@/lib/system-mix";
import { lockSystemMix, readPublishedSystemMix } from "@/lib/system-mix-store";
export class AccessInviteError extends Error {}

export function validAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// Caller runs this in a transaction: all writes roll back if allocation fails.
export async function allocateAccessInvite(tx: Prisma.TransactionClient, input: { userId: string; workspaceId: string; contactId: string; recipientEmail: string; expectedVersion: number; expectedSender?: string; expectedContact?: string }) {
  await lockAccess(tx);
  const owner = await tx.user.findUnique({ where: { id: input.userId }, select: { name: true, emailVerifiedAt: true, suspendedAt: true } });
  if (owner?.suspendedAt) throw new AccessInviteError("Account access is paused.");
  if (!owner?.emailVerifiedAt) throw new AccessInviteError("Verify your email before inviting your contacts.");
  if (!await tx.workspace.findFirst({ where: { id: input.workspaceId, ownerId: input.userId }, select: { id: true } })) throw new AccessInviteError("Choose a contact from your own account.");
  const contact = await tx.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId, archivedAt: null }, select: { id: true, displayName: true, emails: { select: { email: true } } } });
  if (!contact) throw new AccessInviteError("Choose an active contact from your own account.");
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!contact.emails.some(item => item.email.trim().toLowerCase() === recipientEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) || recipientEmail.length > 254) throw new AccessInviteError("Choose an email saved on this contact.");
  if (await tx.user.findUnique({ where: { email: recipientEmail }, select: { id: true } })) throw new AccessInviteError("This contact already has an account.");
  if (await invitationEmailSuppressed(tx, recipientEmail)) throw new AccessInviteError("Invitations cannot be sent to this email address. Choose another contact.");
  const existing = await tx.referralAccessInvite.findUnique({ where: { inviterUserId_contactId: { inviterUserId: input.userId, contactId: contact.id } } });
  if (existing) return existing;
  await lockSystemMix(tx);
  const published = await readPublishedSystemMix(tx);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== published.version || input.expectedSender !== undefined && input.expectedSender !== owner.name || input.expectedContact !== undefined && input.expectedContact !== contact.displayName) throw new AccessInviteError("Your invitation preview changed. Review the updated wording and contact details before sending.");
  if (await tx.referralAccessInvite.findFirst({ where: { recipientEmail, acceptedAt: null, revokedAt: null }, select: { id: true } })) throw new AccessInviteError("This contact already has an invitation. Ask them to check their email.");
  const problem = issuanceProblem(await admissionSnapshot(tx), "REFERRAL");
  if (problem) throw new AccessInviteError(problem);
  // Atomic row update serializes competing allocations, including the fifth slot.
  const quota = await tx.user.updateMany({ where: { id: input.userId, referralInvitesIssued: { lt: REFERRAL_INVITE_LIMIT } }, data: { referralInvitesIssued: { increment: 1 } } });
  if (quota.count !== 1) throw new AccessInviteError("You’ve used all five invitations.");
  const token = randomBytes(32).toString("base64url");
  const invite = await tx.referralAccessInvite.create({ data: {
    inviterUserId: input.userId, workspaceId: input.workspaceId, contactId: contact.id,
    recipientEmail, tokenHash: hashAuthToken(token), tokenCiphertext: encryptIntegrationCredentials({ token }), systemMixVersion: published.version
  } });
  const url = new URL("/register", env.appUrl); url.searchParams.set("invite", token);
  const { subject, body: intro } = renderSystemMix(published.content, owner.name, contact.displayName);
  await queueAccessInvitation(tx, {
    inviteId: invite.id, email: recipientEmail, subject,
    text: `${intro}\n\nCreate your free account: ${url.href}\n\nThis invitation is only for ${recipientEmail} and can be used once.`,
    html: `<p>${escapeHtml(intro).replaceAll("\n", "<br>")}</p><p><a href="${escapeHtml(url.href)}">Accept your personal invitation</a></p><p>This invitation is only for ${escapeHtml(recipientEmail)} and can be used once.</p>`,
    idempotencyKey: `system-invite-${invite.id}`
  });
  await tx.contactActivity.create({ data: { workspaceId: input.workspaceId, contactId: contact.id, actorUserId: input.userId,
    kind: "SYSTEM", summary: "Prepared a personal invitation with the Jump in the Mix System Mix.", metadata: { accessInviteId: invite.id, systemMixVersion: published.version } } });
  await tx.waitlistEntry.updateMany({ where: { email: recipientEmail, status: "WAITING" }, data: { status: "ACCESS_GRANTED", accessGrantedAt: new Date() } });
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
  const claimed = await tx.referralAccessInvite.updateMany({ where: { tokenHash, recipientEmail: email.trim().toLowerCase(), acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
  if (claimed.count !== 1) throw new AccessInviteError("This invitation is unavailable or has already been used.");
  const invite = await tx.referralAccessInvite.findUniqueOrThrow({ where: { tokenHash }, select: { id: true } });
  return invite.id;
}
