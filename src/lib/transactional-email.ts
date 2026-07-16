import { env } from "@/lib/env";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDeliveryResult = {
  delivered: boolean;
  providerId: string | null;
};

export function transactionalEmailConfigured(): boolean {
  return Boolean(env.resendApiKey && env.emailFrom);
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<EmailDeliveryResult> {
  if (!transactionalEmailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Transactional email is not configured.");
    }
    console.info(`[transactional-email preview]\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return { delivered: false, providerId: null };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(env.emailReplyTo ? { reply_to: env.emailReplyTo } : {})
    }),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message || `Transactional email failed with status ${response.status}.`);
  }

  return { delivered: true, providerId: payload?.id ?? null };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
