import { randomBytes } from "node:crypto";
import type { AccessInviteSource, Prisma } from "@/generated/prisma/client";
import { lockAccess } from "@/lib/access-lock";
import { AUTH_TOKEN_PURPOSES, hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { encryptIntegrationCredentials, integrationEncryptionConfigured } from "@/lib/integration-crypto";
import { prisma } from "@/lib/prisma";
import { transactionalEmailConfigured } from "@/lib/transactional-email";
import { queueAccessInvitation } from "@/lib/access-invitation-mail";
import { AdmissionError, admissionSnapshot, getAdmissionPolicy, issuanceProblem } from "@/lib/admission";

export const WAITLIST_INTERVAL_MS = 7 * 24 * 60 * 60_000;
export const WAITLIST_BATCH_HALF = 5;
export const WAITLIST_MANUAL_LIMIT = 50;

export function normalizeWaitlistEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// Duplicate submissions preserve original queue position. No account is created here.
export async function requestWaitlistEntry(email: string, now = new Date()): Promise<string | null> {
  return prisma.$transaction(async tx => {
    await lockAccess(tx);
    if ((await getAdmissionPolicy(tx)).collectionPaused) throw new AdmissionError("New waitlist requests are paused. Please try again later.");
    if (await tx.user.findUnique({ where: { email }, select: { id: true } }) ||
        await tx.referralAccessInvite.findFirst({ where: { recipientEmail: email, acceptedAt: null, revokedAt: null }, select: { id: true } })) return null;
    if (await tx.emailSuppression.findFirst({ where: { clearedAt: null, email, reason: { not: "INVITATION_OPTOUT" } }, select: { id: true } })) return null;
    const entry = await tx.waitlistEntry.upsert({ where: { email }, create: { email }, update: {} });
    if (!(["WITHDRAWN", "SUPPRESSED"] as string[]).includes(entry.status) && (entry.verifiedAt || entry.status !== "WAITING")) return null;
    const token = randomBytes(32).toString("base64url");
    await tx.verificationToken.updateMany({ where: { email, purpose: AUTH_TOKEN_PURPOSES.waitlist, usedAt: null }, data: { usedAt: now } });
    await tx.verificationToken.create({ data: { email, purpose: AUTH_TOKEN_PURPOSES.waitlist, tokenHash: hashAuthToken(token), expiresAt: new Date(now.getTime() + 24 * 60 * 60_000) } });
    return token;
  });
}

export async function confirmWaitlistEntry(token: string, now = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  return prisma.$transaction(async tx => {
    await lockAccess(tx);
    const verification = await tx.verificationToken.findFirst({ where: { tokenHash: hashAuthToken(token), purpose: AUTH_TOKEN_PURPOSES.waitlist, usedAt: null, expiresAt: { gt: now } } });
    if (!verification) return false;
    await tx.verificationToken.update({ where: { id: verification.id }, data: { usedAt: now } });
    const email = verification.email;
    if (await tx.emailSuppression.findFirst({ where: { clearedAt: null, email, reason: { not: "INVITATION_OPTOUT" } }, select: { id: true } })) return false;
    const optout = await tx.emailSuppression.deleteMany({ where: { email, reason: "INVITATION_OPTOUT" } });
    const rejoined = await tx.waitlistEntry.updateMany({ where: { email, OR: [{ status: "WITHDRAWN" }, { status: "SUPPRESSED" }, ...(optout.count ? [{ status: "WAITING" as const }] : [])] }, data: { status: "WAITING", verifiedAt: now, createdAt: now, withdrawnAt: null, accessGrantedAt: null } });
    if (rejoined.count) {
      // A newly confirmed request starts a fresh place; old stop links must not undo it.
      await tx.verificationToken.updateMany({ where: { email, purpose: AUTH_TOKEN_PURPOSES.invitationOptout, usedAt: null }, data: { usedAt: now } });
      const entry = await tx.waitlistEntry.findUniqueOrThrow({ where: { email }, select: { id: true } });
      await tx.waitlistAudit.create({ data: { action: "RECIPIENT_REJOINED", entryId: entry.id } });
    } else await tx.waitlistEntry.updateMany({ where: { email, status: "WAITING", verifiedAt: null }, data: { verifiedAt: now } });
    return true;
  });
}

// Reconcile pre-existing accounts/invites as well as writes from older app versions.
async function reconcileWaitlist(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`UPDATE "WaitlistEntry" w SET status = CASE WHEN EXISTS (SELECT 1 FROM "EmailSuppression" s WHERE s.email = w.email AND s."clearedAt" IS NULL AND s.reason <> 'INVITATION_OPTOUT') THEN 'SUPPRESSED'::"WaitlistStatus" ELSE 'WITHDRAWN'::"WaitlistStatus" END, "updatedAt" = NOW()
    WHERE w.status IN ('WAITING', 'ACCESS_GRANTED') AND EXISTS (SELECT 1 FROM "EmailSuppression" s WHERE s.email = w.email AND s."clearedAt" IS NULL)`;
  await tx.$executeRaw`UPDATE "WaitlistEntry" w SET status = 'JOINED', "joinedAt" = COALESCE(w."joinedAt", NOW()), "updatedAt" = NOW()
    WHERE w.status IN ('WAITING', 'ACCESS_GRANTED') AND EXISTS (SELECT 1 FROM "User" u WHERE u.email = w.email)`;
  await tx.$executeRaw`UPDATE "WaitlistEntry" w SET status = 'ACCESS_GRANTED', "accessGrantedAt" = COALESCE(w."accessGrantedAt", NOW()), "updatedAt" = NOW()
    WHERE w.status = 'WAITING' AND EXISTS (SELECT 1 FROM "ReferralAccessInvite" i WHERE i."recipientEmail" = w.email AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL)`;
}

async function grantWaitlistAccess(tx: Prisma.TransactionClient, entry: { id: string; email: string }, source: AccessInviteSource, now: Date, actorUserId?: string, reason?: string, waveId?: string) {
  const token = randomBytes(32).toString("base64url");
  const invite = await tx.referralAccessInvite.create({ data: { recipientEmail: entry.email, source, waveId, tokenHash: hashAuthToken(token), tokenCiphertext: encryptIntegrationCredentials({ token }) } });
  const url = new URL("/register", env.appUrl);
  url.searchParams.set("invite", token);
  await queueAccessInvitation(tx, {
    inviteId: invite.id,
    email: entry.email,
    subject: "Your invitation to Jump in the Mix",
    text: `You’re invited to create your free Jump in the Mix account.\n\nOpen your personal invitation: ${url.href}\n\nUse the email address this was sent to. Once verified, you’ll have five invitations to share with your contacts through the System Mix.\n\nThis link is just for you and can be used once.`,
    html: `<p>You’re invited to create your free Jump in the Mix account.</p><p><a href="${url.href}">Create your free account</a></p><p>Use the email address this was sent to. Once verified, you’ll have five invitations to share with your contacts through the System Mix.</p><p>This link is just for you and can be used once.</p>`,
    idempotencyKey: `waitlist-invite-${invite.id}`
  }, now);
  await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "ACCESS_GRANTED", accessGrantedAt: now } });
  await tx.waitlistAudit.create({ data: { action: source, entryId: entry.id, inviteId: invite.id, actorUserId, reason } });
}

export async function inviteSelectedWaitlistEntries(ids: string[], actorUserId: string, reason: string, now = new Date()) {
  const selected = [...new Set(ids)];
  if (!selected.length || selected.length > WAITLIST_MANUAL_LIMIT) throw new Error(`Select between 1 and ${WAITLIST_MANUAL_LIMIT} people.`);
  if (!reason.trim() || reason.length > 500) throw new Error("Enter a reason of 1–500 characters.");
  return prisma.$transaction(async tx => {
    await lockAccess(tx);
    await reconcileWaitlist(tx);
    const entries = await tx.waitlistEntry.findMany({ where: { id: { in: selected }, status: "WAITING", verifiedAt: { not: null } }, orderBy: { id: "asc" } });
    if (entries.length) {
      const problem = issuanceProblem(await admissionSnapshot(tx), "WAITLIST", entries.length);
      if (problem) throw new AdmissionError("The selected invitations were not queued. " + problem);
    }
    for (const entry of entries) await grantWaitlistAccess(tx, entry, "WAITLIST_MANUAL", now, actorUserId, reason.trim());
    return { queued: entries.length, skipped: selected.length - entries.length };
  }, { timeout: 20_000 });
}

export function waitlistSendingReady(): boolean {
  return !env.pilotMode && transactionalEmailConfigured() && integrationEncryptionConfigured();
}

export async function runDueWaitlistWave(now = new Date()) {
  if (!waitlistSendingReady()) return null;
  return prisma.$transaction(async tx => {
    await lockAccess(tx);
    const schedule = await tx.waitlistSchedule.upsert({ where: { id: "default" }, create: { id: "default", nextRunAt: new Date(now.getTime() + WAITLIST_INTERVAL_MS) }, update: {} });
    if (schedule.paused || schedule.nextRunAt > now) return null;
    await reconcileWaitlist(tx);
    const eligible = await tx.waitlistEntry.count({ where: { status: "WAITING", verifiedAt: { not: null } } });
    // Defer the whole wave rather than silently favoring FIFO at a capacity edge.
    // Keep the due slot so a later worker retries once capacity is available.
    if (issuanceProblem(await admissionSnapshot(tx), "WAITLIST", Math.min(eligible, WAITLIST_BATCH_HALF * 2))) return null;
    const fifo = await tx.waitlistEntry.findMany({ where: { status: "WAITING", verifiedAt: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: WAITLIST_BATCH_HALF });
    const wave = await tx.waitlistWave.create({ data: { scheduledFor: schedule.nextRunAt, fifoCount: fifo.length } });
    for (const entry of fifo) await grantWaitlistAccess(tx, entry, "WAITLIST_FIFO", now, undefined, undefined, wave.id);
    // FIFO recipients are already removed from WAITING in this same locked transaction.
    // PostgreSQL samples across the full remaining pool, without loading it into memory.
    const random = await tx.$queryRaw<Array<{ id: string; email: string }>>`SELECT id, email FROM "WaitlistEntry"
      WHERE status = 'WAITING' AND "verifiedAt" IS NOT NULL ORDER BY random() LIMIT ${WAITLIST_BATCH_HALF}`;
    for (const entry of random) await grantWaitlistAccess(tx, entry, "WAITLIST_RANDOM", now, undefined, undefined, wave.id);
    await tx.waitlistWave.update({ where: { id: wave.id }, data: { randomCount: random.length } });
    // One wave after downtime; retain the UTC cadence and skip missed slots, never burst.
    const missed = Math.floor((now.getTime() - schedule.nextRunAt.getTime()) / WAITLIST_INTERVAL_MS) + 1;
    await tx.waitlistSchedule.update({ where: { id: "default" }, data: { nextRunAt: new Date(schedule.nextRunAt.getTime() + missed * WAITLIST_INTERVAL_MS) } });
    return { id: wave.id, fifo: fifo.length, random: random.length };
  }, { timeout: 20_000 });
}
