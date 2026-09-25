import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { lockAccess } from "@/lib/access-lock";
import { getAdmissionPolicy } from "@/lib/admission";
import { invitationEmailSuppressed } from "@/lib/invitation-preferences";
import { isValidEmail } from "@/lib/contact-input";
import { phoneLookupKeys, workspacePhoneRegion } from "@/lib/phone-number";

import { REFERRAL_INVITE_LIMIT, renderSystemMix } from "@/lib/system-mix";
import { lockSystemMix, readPublishedSystemMix } from "@/lib/system-mix-store";

/** Why an invitation could not be claimed, so each sign-up path can say it in its own fixed words. */
export type AccessInviteErrorCode = "NO_INVITATION" | "REDEMPTION_PAUSED" | "UNAVAILABLE" | "OWNER_SETUP_COMPLETE";

export class AccessInviteError extends Error {
  constructor(message: string, readonly code: AccessInviteErrorCode | null = null) { super(message); }
}

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
  // A text invitation stores the number's canonical key; numbers are compared by every key they answer to.
  const region = input.recipientPhone ? await workspacePhoneRegion(tx, input.workspaceId) : null;
  const recipientKeys = input.recipientPhone && region ? phoneLookupKeys(input.recipientPhone, region) : [];
  const recipientPhone = recipientKeys[0] ?? null;
  if (Boolean(recipientEmail) === Boolean(recipientPhone)) throw new AccessInviteError("Choose one email address or text number for this invitation.");
  if (recipientEmail && (!isValidEmail(recipientEmail) || !contact.emails.some(item => item.email.trim().toLowerCase() === recipientEmail))) throw new AccessInviteError("Choose an email saved on this contact.");
  if (recipientPhone && !contact.phones.some(item => phoneLookupKeys(item.phone, region!).some(key => recipientKeys.includes(key)))) throw new AccessInviteError("Choose a phone number saved on this contact.");
  if (recipientEmail && await tx.user.findUnique({ where: { email: recipientEmail }, select: { id: true } })) throw new AccessInviteError("This contact already has an account.");
  if (recipientEmail && await invitationEmailSuppressed(tx, recipientEmail)) throw new AccessInviteError("This person has opted out of invitations. Choose another contact.");
  const existing = await tx.referralAccessInvite.findUnique({ where: { inviterUserId_contactId: { inviterUserId: input.userId, contactId: contact.id } } });
  if (existing) {
    if (!existing.manualDelivery || existing.acceptedAt || existing.revokedAt) throw new AccessInviteError("This contact’s invitation has already been prepared, used, or revoked.");
    const samePhone = existing.recipientPhone === null ? recipientPhone === null : recipientPhone !== null && sameInvitationPhone(existing.recipientPhone, recipientKeys, region!);
    if (existing.recipientEmail !== recipientEmail || !samePhone) throw new AccessInviteError("This person already has an invitation for different contact details. Check Today.");
    return existing;
  }
  await lockSystemMix(tx);
  const published = await readPublishedSystemMix(tx);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== published.version || input.expectedSender !== undefined && input.expectedSender !== owner.name || input.expectedContact !== undefined && input.expectedContact !== contact.displayName) throw new AccessInviteError("Your invitation preview changed. Review the updated wording and contact details before sending.");
  if (recipientEmail ? await tx.referralAccessInvite.findFirst({ where: { recipientEmail, acceptedAt: null, revokedAt: null }, select: { id: true } }) : await outstandingPhoneInvitation(tx, recipientKeys, region!)) throw new AccessInviteError("This contact already has an invitation. Ask them to use their existing link.");
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

/*
 * A stored invitation number is a key: the canonical key for invitations prepared since Release B, or an
 * older spelling's key before it (the phone-key sweep rewrites contacts, not invitations). Compare the
 * numbers they denote, not the stored strings.
 */
function sameInvitationPhone(stored: string, recipientKeys: string[], region: string): boolean {
  return recipientKeys.includes(stored) || phoneLookupKeys(stored, region).some(key => recipientKeys.includes(key));
}

// One outstanding text invitation per number across all accounts, each read in its own workspace's region.
async function outstandingPhoneInvitation(tx: Prisma.TransactionClient, recipientKeys: string[], region: string): Promise<boolean> {
  // Every stored key for a number contains its last seven digits, whatever the spelling or extension.
  const digits = (recipientKeys[0] ?? "").replace(/;ext=\d+$/, "").replace(/\D/g, "");
  const candidates = await tx.referralAccessInvite.findMany({ where: { recipientPhone: { contains: digits.slice(-7) }, acceptedAt: null, revokedAt: null }, select: { recipientPhone: true, workspaceId: true }, orderBy: { createdAt: "asc" }, take: 100 });
  for (const candidate of candidates) {
    if (!candidate.recipientPhone) continue;
    const candidateRegion = candidate.workspaceId ? await workspacePhoneRegion(tx, candidate.workspaceId) : region;
    if (sameInvitationPhone(candidate.recipientPhone, recipientKeys, candidateRegion)) return true;
  }
  return false;
}

const INVITATION_TOKEN_HASH = /^[0-9a-f]{64}$/;

// Claim and account creation must share the same transaction. GET never consumes a link.
export async function claimAccessInvite(tx: Prisma.TransactionClient, token: string | undefined, email: string): Promise<string | null> {
  return claimInvitation(tx, token && validAccessToken(token) ? hashAuthToken(token) : null, email);
}

/**
 * The same claim for a sign-in that carried the invitation as `hashAuthToken(token)` rather than the
 * token itself: a Google or Apple sign-up stores only the hash while the person is at the provider.
 */
export async function claimAccessInviteByHash(tx: Prisma.TransactionClient, tokenHash: string | null | undefined, email: string): Promise<string | null> {
  return claimInvitation(tx, tokenHash && INVITATION_TOKEN_HASH.test(tokenHash) ? tokenHash : null, email);
}

async function claimInvitation(tx: Prisma.TransactionClient, tokenHash: string | null, email: string): Promise<string | null> {
  await lockAccess(tx);
  if (env.pilotMode) {
    if (await tx.user.count() === 0) return null;
    throw new AccessInviteError("Owner setup is already complete on this server.", "OWNER_SETUP_COMPLETE");
  }
  if (!tokenHash) throw new AccessInviteError("Use the unique invitation link shared by someone in your network.", "NO_INVITATION");
  if ((await getAdmissionPolicy(tx)).redemptionPaused) throw new AccessInviteError("Account creation is temporarily paused. Your invitation has not been used. Please try this same link again later.", "REDEMPTION_PAUSED");
  const claimed = await tx.referralAccessInvite.updateMany({ where: { tokenHash, OR: [{ recipientEmail: email.trim().toLowerCase() }, { recipientEmail: null, recipientPhone: { not: null }, manualDelivery: true }], acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
  if (claimed.count !== 1) throw new AccessInviteError("This invitation is unavailable or has already been used.", "UNAVAILABLE");
  const invite = await tx.referralAccessInvite.findUniqueOrThrow({ where: { tokenHash }, select: { id: true } });
  await tx.jump.updateMany({ where: { accessInviteId: invite.id, status: "PENDING" }, data: { status: "CANCELED", completionMethod: "invitation_accepted" } });
  return invite.id;
}
