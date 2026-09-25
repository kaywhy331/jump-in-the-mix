import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { EmailCategory, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { reserveEmailAttempt, emailMessageId, emailRecipientHash } from "@/lib/email-budget";
import { prisma } from "@/lib/prisma";
import { recordEmailAcceptance } from "@/lib/email-events";
import { EmailDeliveryError } from "@/lib/email-errors";

export type TransactionalEmail = {
  from?: string;
  replyTo?: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
  category?: EmailCategory;
};

export type EmailDeliveryResult = {
  // Provider acceptance, not proof of inbox placement.
  delivered: boolean;
  providerId: string | null;
  messageId?: string;
  firstAttemptAt?: Date;
  acceptedAt?: Date;
};

export function transactionalEmailConfigured(): boolean {
  return Boolean(env.resendApiKey && env.emailFrom);
}

export function preparedEmail(message: TransactionalEmail) {
  const email = message.to.trim().toLowerCase();
  const replyTo = message.replyTo === undefined ? env.emailReplyTo : message.replyTo;
  const body = JSON.stringify({ from: message.from ?? env.emailFrom, to: [email], subject: message.subject, text: message.text, html: message.html, ...(replyTo ? { reply_to: replyTo } : {}) });
  return { email, category: message.category ?? "PRODUCT", body, payloadHash: createHash("sha256").update(body).digest("hex") };
}

// Read a receipt without making a provider request or reserving sending capacity.
// Frozen key, recipient and full payload must all match the recorded acceptance.
export async function recordedEmailAcceptance(message: TransactionalEmail, tx: Prisma.TransactionClient = prisma): Promise<EmailDeliveryResult | null> {
  if (!message.idempotencyKey || message.idempotencyKey.length > 256) return null;
  const prepared = preparedEmail(message);
  const record = await tx.emailMessage.findUnique({ where: { id: emailMessageId(message.idempotencyKey) } });
  if (!record?.acceptedAt || !record.providerId || record.payloadHash !== prepared.payloadHash || record.recipientHash !== emailRecipientHash(prepared.email) || record.category !== prepared.category) return null;
  return { delivered: true, providerId: record.providerId, messageId: record.id, firstAttemptAt: record.firstAttemptAt, acceptedAt: record.acceptedAt };
}

const MAX_ATTEMPTS = 3;
const attemptScope = new AsyncLocalStorage<number>();

/**
 * Runs `send` with every transactional email inside it limited to `attempts` provider attempts. Sign-in,
 * verification and password-reset requests use one attempt, so a slow provider holds the page for one
 * 15-second try instead of about 50 seconds and the person is told to try again; the idempotency ledger keeps
 * a retry of the same key safe. Background and worker email keeps its retries.
 */
export function withEmailAttempts<T>(attempts: number, send: () => Promise<T>): Promise<T> {
  return attemptScope.run(attempts, send);
}

function attemptLimit(requested: number | undefined): number {
  const value = requested ?? attemptScope.getStore() ?? MAX_ATTEMPTS;
  return Number.isInteger(value) && value >= 1 && value <= MAX_ATTEMPTS ? value : MAX_ATTEMPTS;
}

function retryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}
function delay(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.min(5000, 500 * 2 ** attempt + Math.random() * 300)));
}

export async function sendTransactionalEmail(message: TransactionalEmail, options: { retryBefore?: Date; attempts?: number } = {}): Promise<EmailDeliveryResult> {
  if (!transactionalEmailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Transactional email is not configured.");
    // Development auth pages expose their own test links; never print secret URLs or customer content.
    console.info("[transactional-email] Email is not configured; no message was sent.");
    return { delivered: false, providerId: null };
  }
  const key = message.idempotencyKey ?? `jitm-${randomUUID()}`;
  if (!key || key.length > 256) throw new EmailDeliveryError("MISMATCH", "Invalid email delivery key.");
  const { email, category, body, payloadHash } = preparedEmail(message);
  let firstAttemptAt: Date | null = null;
  let lastStatus = 0;
  let attempted = false;
  const attempts = attemptLimit(options.attempts);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const reservation = await reserveEmailAttempt({ key, email, payloadHash, category, retryBefore: options.retryBefore }).catch(error => {
      if (error instanceof EmailDeliveryError) error.attempted = attempted;
      throw error;
    });
    const record = reservation.message;
    firstAttemptAt = record.firstAttemptAt;
    if (reservation.cached) return { delivered: true, providerId: record.providerId, messageId: record.id, firstAttemptAt };
    try {
      attempted = true;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body, cache: "no-store", signal: AbortSignal.timeout(15_000)
      });
      lastStatus = response.status;
      const payload = await response.json().catch(() => null) as { id?: unknown } | null;
      if (response.ok && typeof payload?.id === "string" && payload.id.length <= 200 && payload.id.length > 0) {
        await recordEmailAcceptance(record.id, payload.id);
        return { delivered: true, providerId: payload.id, messageId: record.id, firstAttemptAt };
      }
      if (!retryable(response.status) && !response.ok) throw new EmailDeliveryError("PROVIDER", `Email provider rejected the request (status ${response.status}).`, firstAttemptAt);
    } catch (error) {
      // Permanent provider errors must not fall through to automatic retry.
      if (error instanceof EmailDeliveryError) { error.attempted = attempted; throw error; }
      // A timeout or failed acceptance write is uncertain; retry the identical request/key.
    }
    if (attempt < attempts - 1) await delay(attempt);
  }
  const failure = new EmailDeliveryError("PROVIDER", `Email acceptance could not be confirmed${lastStatus ? ` (status ${lastStatus})` : ""}.`, firstAttemptAt);
  failure.attempted = attempted;
  throw failure;
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
