import type { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendTransactionalEmail, transactionalEmailConfigured } from "@/lib/transactional-email";

export const SUPPORT_OPERATOR_ALERT_TASK = "support-operator-alert";

type AlertKind = "new" | "reply" | "reopen";

/** Where ticket alerts go: OPERATOR_ALERT_EMAIL, else the public support address. Empty when neither is set. */
export function operatorAlertRecipient(source: Readonly<Record<string, string | undefined>> = process.env): string {
  return (source.OPERATOR_ALERT_EMAIL?.trim() || source.PUBLIC_SUPPORT_EMAIL?.trim() || "").toLowerCase();
}

// Queued with the ticket change, so the alert is sent by the worker and a mail outage never blocks
// a customer's ticket. The email names the ticket and links to it; the customer's words stay in Admin.
export async function queueSupportOperatorAlert(tx: Prisma.TransactionClient, input: { workspaceId: string; ticketId: string; messageId: string; kind: AlertKind }): Promise<void> {
  await tx.job.create({ data: { workspaceId: input.workspaceId, task: SUPPORT_OPERATOR_ALERT_TASK, payload: { ticketId: input.ticketId, messageId: input.messageId, kind: input.kind } } });
}

export async function sendSupportOperatorAlert(payload: unknown): Promise<"sent" | "skipped"> {
  const value = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  const ticketId = typeof value.ticketId === "string" ? value.ticketId : "";
  const messageId = typeof value.messageId === "string" ? value.messageId : "";
  const kind: AlertKind = value.kind === "reply" || value.kind === "reopen" ? value.kind : "new";
  const to = operatorAlertRecipient();
  if (!ticketId || !messageId || !to || !transactionalEmailConfigured()) return "skipped";
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, reference: true, title: true, category: true } });
  if (!ticket) return "skipped";
  const heading = kind === "new" ? "New support ticket" : kind === "reply" ? "Customer replied to a support ticket" : "Support ticket reopened";
  const link = new URL(`/admin/support/${encodeURIComponent(ticket.id)}`, env.appUrl).toString();
  const title = ticket.title.slice(0, 160);
  await sendTransactionalEmail({
    to,
    subject: `${heading}: ${ticket.reference}`,
    text: `${heading}.\n\n${ticket.reference} · ${ticket.category}\n${title}\n\nOpen it in Admin: ${link}`,
    html: `<p>${escapeHtml(heading)}.</p><p><strong>${escapeHtml(ticket.reference)}</strong> · ${escapeHtml(ticket.category)}<br>${escapeHtml(title)}</p><p><a href="${escapeHtml(link)}">Open it in Admin</a></p>`,
    category: "PRODUCT",
    idempotencyKey: `support-operator-alert-${messageId}`
  });
  return "sent";
}
