import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { lockAccess } from "@/lib/access-lock";
import { AUTH_TOKEN_PURPOSES, hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { revokeStaffInvitations } from "@/lib/staff-invitation-state";

const STOP_LINK_LIFETIME_MS = 90 * 24 * 60 * 60_000;

export async function invitationEmailSuppressed(tx: Prisma.TransactionClient, email: string): Promise<boolean> {
  return Boolean(await tx.emailSuppression.findFirst({ where: { clearedAt: null, email }, select: { id: true } }));
}

// Existing links remain usable. Only an explicit POST consumes a stop token.
export async function createInvitationStopLink(tx: Prisma.TransactionClient, email: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await tx.verificationToken.create({ data: { email, tokenHash: hashAuthToken(token), purpose: AUTH_TOKEN_PURPOSES.invitationOptout, expiresAt: new Date(now.getTime() + STOP_LINK_LIFETIME_MS) } });
  const url = new URL("/waitlist/leave", env.appUrl);
  url.searchParams.set("token", token);
  return url.href;
}

export async function requestInvitationStopLink(email: string, now = new Date()): Promise<string | null> {
  return prisma.$transaction(async tx => {
    await lockAccess(tx);
    if (await invitationEmailSuppressed(tx, email)) return null;
    const entry = await tx.waitlistEntry.findFirst({ where: { email, status: { in: ["WAITING", "ACCESS_GRANTED"] } }, select: { id: true } });
    const invite = entry ? null : await tx.referralAccessInvite.findFirst({ where: { recipientEmail: email, acceptedAt: null, revokedAt: null }, select: { id: true } });
    const staffInvite = entry || invite ? null : await tx.staffInvitation.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } });
    return entry || invite || staffInvite ? createInvitationStopLink(tx, email, now) : null;
  });
}

export async function stopInvitationEmails(token: string, now = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  return prisma.$transaction(async tx => {
    await lockAccess(tx);
    const proof = await tx.verificationToken.findFirst({ where: { tokenHash: hashAuthToken(token), purpose: AUTH_TOKEN_PURPOSES.invitationOptout, usedAt: null, expiresAt: { gt: now } } });
    if (!proof) return false;
    const email = proof.email;
    await tx.verificationToken.updateMany({ where: { email, purpose: { in: [AUTH_TOKEN_PURPOSES.invitationOptout, AUTH_TOKEN_PURPOSES.waitlist] }, usedAt: null }, data: { usedAt: now } });
    await tx.emailSuppression.upsert({ where: { email_reason: { email, reason: "INVITATION_OPTOUT" } }, create: { email, reason: "INVITATION_OPTOUT" }, update: {} });
    await tx.waitlistEntry.updateMany({ where: { email, status: { in: ["WAITING", "ACCESS_GRANTED"] } }, data: { status: "WITHDRAWN", withdrawnAt: now } });
    await tx.referralAccessInvite.updateMany({ where: { recipientEmail: email, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    await revokeStaffInvitations(tx, { email }, now);
    await tx.waitlistDelivery.updateMany({ where: { invite: { recipientEmail: email, acceptedAt: null }, status: { in: ["QUEUED", "SENDING", "REVIEW"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null, lastError: null } });
    const entry = await tx.waitlistEntry.findUnique({ where: { email }, select: { id: true } });
    await tx.waitlistAudit.create({ data: { action: "RECIPIENT_WITHDRAWAL", entryId: entry?.id } });
    return true;
  });
}
