import { env } from "@/lib/env";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
};

export type EmailDeliveryResult = {
  delivered: boolean;
  providerId: string | null;
};

export function transactionalEmailConfigured(): boolean {
  return Boolean(env.resendApiKey && env.emailFrom);
}

function retryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function delay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(5000, 500 * 2 ** attempt + Math.random() * 300)));
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<EmailDeliveryResult> {
  if (!transactionalEmailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Transactional email is not configured.");
    console.info(`[transactional-email preview]\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return { delivered: false, providerId: null };
  }

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendApiKey}`,
          "Content-Type": "application/json",
          ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey.slice(0, 256) } : {})
        },
        body: JSON.stringify({
          from: env.emailFrom,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(env.emailReplyTo ? { reply_to: env.emailReplyTo } : {})
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000)
      });
      lastStatus = response.status;
      const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
      if (response.ok) return { delivered: true, providerId: payload?.id ?? null };
      if (!retryable(response.status) || attempt === 2) throw new Error(`Transactional email failed with status ${response.status}.`);
    } catch (error) {
      if (attempt === 2) throw new Error(error instanceof Error && /status \d+/.test(error.message) ? error.message : `Transactional email delivery failed${lastStatus ? ` with status ${lastStatus}` : ""}.`);
    }
    await delay(attempt);
  }
  throw new Error("Transactional email delivery failed.");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
