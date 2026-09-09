import { env } from "@/lib/env";
import { EmailReviewError } from "@/lib/email-suppression-admin";
import { EMAIL_RETRY_WINDOW_MS } from "@/lib/email-budget";
import { preparedEmail, type TransactionalEmail } from "@/lib/transactional-email";

const MAX_BYTES = 256 * 1024;
export function validProviderEmailId(id: string) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id); }

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing body");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_BYTES) throw new Error("Oversized response");
      chunks.push(result.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// The administrator supplies only an opaque ID. No arbitrary URL, redirect,
// provider error body, secret URL or email content leaves this server function.
export async function verifyProviderInvitation(providerId: string, message: TransactionalEmail, firstAttemptAt: Date) {
  if (!validProviderEmailId(providerId)) throw new EmailReviewError("Enter the provider’s email record ID, not a URL.");
  const key = env.resendRecoveryApiKey || env.resendApiKey;
  if (!key) throw new EmailReviewError("Provider receipt verification is not configured.");
  let raw: unknown;
  try {
    const response = await fetch(`https://api.resend.com/emails/${providerId}`, { method: "GET", headers: { Authorization: `Bearer ${key}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error("Unavailable"); }
    raw = await boundedJson(response);
  } catch { throw new EmailReviewError("The provider record could not be verified. Check the record ID and API access, then try again. No email was sent."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new EmailReviewError("The provider returned an unsupported email record. Keep this delivery in review.");
  const data = raw as Record<string, unknown>;
  const expected = JSON.parse(preparedEmail(message).body) as { from: string; to: string[]; subject: string; text: string; html: string; reply_to?: string };
  const sameList = (actual: unknown, wanted: string[]) => Array.isArray(actual) && actual.length === wanted.length && actual.every((value, i) => value === wanted[i]);
  // Fail closed when provider normalization prevents an exact match.
  if (data.object !== "email" || data.id !== providerId || data.from !== expected.from || !sameList(data.to, expected.to) || !sameList(data.cc, []) || !sameList(data.bcc, []) || !sameList(data.reply_to, expected.reply_to ? [expected.reply_to] : []) || data.subject !== expected.subject || data.text !== expected.text || data.html !== expected.html || data.scheduled_at != null) throw new EmailReviewError("The provider record does not exactly match this frozen email. Keep this delivery in review.");
  // Resend's example uses PostgreSQL timestamps with microseconds and +00.
  const date = typeof data.created_at === "string" ? data.created_at.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})$/, "$1:00") : "";
  const acceptedAt = new Date(date);
  const margin = 5 * 60_000;
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(acceptedAt.getTime()) || acceptedAt.getTime() < firstAttemptAt.getTime() - margin || acceptedAt.getTime() > Math.min(Date.now() + margin, firstAttemptAt.getTime() + EMAIL_RETRY_WINDOW_MS + margin)) throw new EmailReviewError("The provider record falls outside this delivery’s original attempt window.");
  // Adverse/unknown states need recipient investigation, not a success repair.
  // Only signed webhook receipts populate delivery/bounce occurrence timestamps.
  if (!["sent", "delivered", "delivery_delayed"].includes(String(data.last_event))) throw new EmailReviewError("The provider reports an adverse or unsupported status. Review the recipient’s delivery problem before any further send.");
  return { providerId, acceptedAt };
}
