import { env } from "@/lib/env";
import {
  escapeHtml,
  sendTransactionalEmail,
  type EmailDeliveryResult,
  type TransactionalEmail
} from "@/lib/transactional-email";

function ticketUrl(ticketId: string): string {
  return new URL(`/account/tickets/${encodeURIComponent(ticketId)}`, env.appUrl).toString();
}

function headerText(value: string, fallback = ""): string {
  return value.replace(/[\r\n]+/g, " ").trim() || fallback;
}

function bodyHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px;line-height:1.65;color:#27314a;">${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

export function buildSupportReplyEmail(input: {
  to: string;
  recipientName: string;
  ticketId: string;
  reference: string;
  title: string;
  responseBody: string;
}): TransactionalEmail {
  const url = ticketUrl(input.ticketId);
  const recipientName = headerText(input.recipientName, "there");
  const reference = headerText(input.reference, "Support ticket");
  const title = headerText(input.title, "Support request");
  const safeName = escapeHtml(recipientName);
  const safeTitle = escapeHtml(title);
  const safeReference = escapeHtml(reference);
  const safeUrl = escapeHtml(url);
  const subject = `Jump in the Mix Response · ${reference} · ${title}`;
  const text = [
    `Hello ${recipientName},`,
    "",
    `Jump in the Mix Response for ${reference}: ${title}`,
    "",
    input.responseBody.trim(),
    "",
    "----------------------------------------",
    `View and reply to this ticket: ${url}`,
    "",
    "If you still need help, reply inside the ticket so the complete conversation stays together.",
    "",
    "Jump in the Mix Support"
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Inter,Arial,sans-serif;color:#172036;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:28px 14px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dfe4ee;border-radius:18px;overflow:hidden;">
          <tr><td style="padding:22px 26px;background:linear-gradient(135deg,#4837ce,#7457ff);color:#ffffff;">
            <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.82;">Jump in the Mix Support</div>
            <h1 style="margin:8px 0 0;font-size:25px;line-height:1.2;">Jump in the Mix Response</h1>
          </td></tr>
          <tr><td style="padding:28px 26px;">
            <p style="margin:0 0 16px;line-height:1.65;">Hello ${safeName},</p>
            <p style="margin:0 0 20px;line-height:1.65;color:#647089;">We added a response to ticket <strong style="color:#172036;">${safeReference}</strong>.</p>
            <div style="margin:0 0 22px;padding:18px;border:1px solid #dfe4ee;border-radius:14px;background:#f8f9fc;">
              <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#647089;">Ticket title</div>
              <h2 style="margin:6px 0 18px;font-size:19px;line-height:1.35;color:#172036;">${safeTitle}</h2>
              <div style="height:1px;background:#dfe4ee;margin:0 0 18px;"></div>
              ${bodyHtml(input.responseBody)}
            </div>
            <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:11px;background:#5d4cf2;color:#ffffff;text-decoration:none;font-weight:750;">View and reply to ticket</a>
            <p style="margin:22px 0 0;line-height:1.6;color:#647089;font-size:14px;">Reply inside the ticket so your full support conversation and timestamps remain together.</p>
          </td></tr>
          <tr><td style="padding:18px 26px;border-top:1px solid #dfe4ee;background:#fbfcfe;color:#647089;font-size:12px;line-height:1.55;">
            Jump in the Mix Support<br />This message concerns support ticket ${safeReference}.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { to: input.to, subject, text, html };
}

export async function sendSupportReplyNotification(input: {
  to: string;
  recipientName: string;
  ticketId: string;
  reference: string;
  title: string;
  responseBody: string;
}): Promise<EmailDeliveryResult> {
  return sendTransactionalEmail(buildSupportReplyEmail(input));
}
