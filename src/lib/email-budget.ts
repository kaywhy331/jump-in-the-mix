import { createHash, createHmac } from "node:crypto";
import type { EmailCategory, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { EmailDeliveryError } from "@/lib/email-errors";

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
