import { createHash, createHmac } from "node:crypto";
import type { EmailCategory, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { EmailDeliveryError } from "@/lib/email-errors";
import { AUTH_TOKEN_PURPOSES, ISSUED_TOKEN_MEMORY_MS } from "@/lib/auth-tokens";

export const EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60_000;
const DAY = 24 * 60 * 60_000;
const MONTH = 31 * DAY;

export function emailRecipientHash(email: string) {
  return createHmac("sha256", env.dataEncryptionKey).update(`email-recipient:${email.trim().toLowerCase()}`).digest("hex");
}
export function emailMessageId(key: string) { return createHash("sha256").update(key).digest("hex"); }

export async function readEmailBudget(tx: Prisma.TransactionClient = prisma, now = new Date()) {
  const windows = [{ name: "day", since: new Date(now.getTime() - DAY), total: env.emailDailyLimit, other: env.emailDailyLimit - env.emailDailyAuthReserve, duration: DAY },
    { name: "month", since: new Date(now.getTime() - MONTH), total: env.emailMonthlyLimit, other: env.emailMonthlyLimit - env.emailMonthlyAuthReserve, duration: MONTH }];
  return Promise.all(windows.map(async window => {
    const rows = await tx.emailSendAttempt.groupBy({ by: ["category"], where: { createdAt: { gt: window.since } }, _count: { _all: true } });
    return { ...window, used: rows.reduce((n, row) => n + row._count._all, 0), otherUsed: rows.filter(row => row.category !== "AUTH").reduce((n, row) => n + row._count._all, 0) };
  }));
}

/*
 * Per-address daily limits for the account emails anyone can request for any address. They are silent:
 * a request over the limit gets the same "check your email" answer as one that sent, so the limit never
 * says whether an account exists, and the pages state the fixed numbers instead. A browser that has
 * signed in to the account before (rate-limit.ts: known device) is exempt, so the limits cannot lock
 * the owner out.
 */
export const AUTH_EMAILS_PER_RECIPIENT_PER_DAY = { magicLogin: 3, resetPassword: 3, verifyEmail: 4 } as const;
export type RecipientLimitedAuthEmail = keyof typeof AUTH_EMAILS_PER_RECIPIENT_PER_DAY;

// The idempotency key each account email is sent with (auth-email.ts): `<prefix>:<hashAuthToken(token)>`.
export const AUTH_EMAIL_KEY_PREFIXES: Record<RecipientLimitedAuthEmail, string> = { magicLogin: "magic-login", resetPassword: "reset-password", verifyEmail: "verify-email" };

/**
 * How many emails of this kind were sent to the address in the last 24 hours, counted from the send
 * ledger: a link issued in that time counts only when its email reached the ledger (an attempt was
 * reserved), so a link whose send was refused before reaching the provider does not use up the day.
 */
export async function authEmailsSentToday(email: string, kind: RecipientLimitedAuthEmail, now = new Date(), db: Prisma.TransactionClient = prisma): Promise<number> {
  const address = email.trim().toLowerCase();
  const since = new Date(now.getTime() - Math.min(DAY, ISSUED_TOKEN_MEMORY_MS));
  const links = await db.verificationToken.findMany({ where: { email: address, purpose: AUTH_TOKEN_PURPOSES[kind], createdAt: { gt: since } }, select: { tokenHash: true }, take: 200 });
  if (!links.length) return 0;
  return db.emailMessage.count({ where: {
    id: { in: links.map(link => emailMessageId(`${AUTH_EMAIL_KEY_PREFIXES[kind]}:${link.tokenHash}`)) },
    recipientHash: emailRecipientHash(address), category: "AUTH", firstAttemptAt: { gt: since }
  } });
}

/** True when the address has had its daily allowance of this kind of account email. */
export async function authEmailLimitReached(email: string, kind: RecipientLimitedAuthEmail, now = new Date()): Promise<boolean> {
  return await authEmailsSentToday(email, kind, now) >= AUTH_EMAILS_PER_RECIPIENT_PER_DAY[kind];
}

/*
 * Account email (sign-in, verification, reset) has a protected reserve in each window. Heavy use of it is
 * the visible sign of sign-in email abuse, so Operations warns at half of the reserve, well before the
 * reserve or the whole allowance runs out.
 */
export const AUTH_RESERVE_WARNING_SHARE = 0.5;
type BudgetWindow = { name: string; used: number; total: number; otherUsed: number; other: number };
export function authReserveUse(windows: BudgetWindow[]): Array<{ name: string; used: number; reserve: number; warning: boolean }> {
  return windows.map(window => {
    const used = Math.max(window.used - window.otherUsed, 0), reserve = Math.max(window.total - window.other, 0);
    return { name: window.name, used, reserve, warning: reserve > 0 && used >= reserve * AUTH_RESERVE_WARNING_SHARE };
  });
}

export async function reserveEmailAttempt(input: { key: string; email: string; payloadHash: string; category: EmailCategory; retryBefore?: Date }, now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 4)`;
    const id = emailMessageId(input.key);
    const existing = await tx.emailMessage.findUnique({ where: { id } });
    if (existing && (existing.payloadHash !== input.payloadHash || existing.category !== input.category)) throw new EmailDeliveryError("MISMATCH", "The same email key cannot be used with changed content.", existing.firstAttemptAt);
    if (existing?.detailsRetiredAt) throw new EmailDeliveryError("REVIEW", "This delivery key has been retired and cannot send again.", existing.firstAttemptAt);
    if (existing?.acceptedAt && existing.providerId) return { message: existing, cached: true };
    if (input.retryBefore && now >= input.retryBefore || existing && now.getTime() - existing.firstAttemptAt.getTime() >= EMAIL_RETRY_WINDOW_MS) {
      throw new EmailDeliveryError("REVIEW", "The safe email retry window has expired. An operator must review delivery.", existing?.firstAttemptAt ?? null);
    }
    const suppressed = await tx.emailSuppression.findFirst({ where: { clearedAt: null, email: input.email, ...(input.category === "INVITATION" ? {} : { reason: { not: "INVITATION_OPTOUT" } }) }, select: { id: true } });
    if (suppressed) throw new EmailDeliveryError("SUPPRESSED", "Email cannot be sent to this address.", existing?.firstAttemptAt ?? null);
    const windows = await readEmailBudget(tx, now);
    let retryAt: Date | undefined;
    for (const window of windows) {
      const totalFull = window.used >= window.total;
      const otherFull = input.category !== "AUTH" && window.otherUsed >= window.other;
      if (!totalFull && !otherFull) continue;
      // Recheck when the next relevant reservation ages out; never consume the auth reserve.
      const oldest = await tx.emailSendAttempt.findFirst({ where: { createdAt: { gt: window.since }, ...(!totalFull && otherFull ? { category: { not: "AUTH" } } : {}) }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
      const next = new Date((oldest?.createdAt.getTime() ?? now.getTime()) + window.duration + 1000);
      if (!retryAt || next > retryAt) retryAt = next;
    }
    if (retryAt) throw new EmailDeliveryError("BUDGET", "Email capacity is temporarily reserved. Please try again later.", existing?.firstAttemptAt ?? null, retryAt);
    const message = existing ?? await tx.emailMessage.create({ data: { id, recipientHash: emailRecipientHash(input.email), payloadHash: input.payloadHash, category: input.category, firstAttemptAt: now } });
    await tx.emailSendAttempt.create({ data: { messageId: id, category: input.category, createdAt: now } });
    return { message, cached: false };
  });
}
