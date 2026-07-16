"use server";

import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus
} from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isSupportCategory,
  isSupportPriority,
  isSupportStatus
} from "@/lib/support-content";
import { sendSupportReplyNotification } from "@/lib/support-email";
import {
  adminReplyToSupportTicketRecord,
  SupportTicketError,
  updateSupportMessageEmailStatus,
  updateSupportTicketStatus,
  updateSupportTicketTriage
} from "@/lib/support-service";

function value(formData: FormData, key: string, maxLength: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function adminTicketError(ticketId: string, message: string): never {
  redirect(`/admin/support/${encodeURIComponent(ticketId)}?error=${encodeURIComponent(message)}`);
}

async function deliverAdminReplyEmail(input: {
  messageId: string;
  ticketId: string;
  reference: string;
  title: string;
  requesterUserId: string;
  responseBody: string;
}): Promise<"sent" | "previewed" | "failed"> {
  const requester = await prisma.user.findUnique({
    where: { id: input.requesterUserId },
    select: { email: true, name: true }
  });
  if (!requester) {
    await updateSupportMessageEmailStatus({
      messageId: input.messageId,
      status: "FAILED",
      error: "The requesting user no longer exists."
    });
    return "failed";
  }

  try {
    const result = await sendSupportReplyNotification({
      to: requester.email,
      recipientName: requester.name,
      ticketId: input.ticketId,
      reference: input.reference,
      title: input.title,
      responseBody: input.responseBody
    });
    await updateSupportMessageEmailStatus({
      messageId: input.messageId,
      status: result.delivered ? "SENT" : "PREVIEWED",
      providerId: result.providerId
    });
    return result.delivered ? "sent" : "previewed";
  } catch (error) {
    await updateSupportMessageEmailStatus({
      messageId: input.messageId,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Support email delivery failed."
    });
    return "failed";
  }
}

export async function adminReplyToSupportTicketAction(formData: FormData): Promise<void> {
  const { user: adminUser } = await requirePlatformAdmin();
  const ticketId = value(formData, "ticketId", 100);
  const body = value(formData, "body", 5000);
  if (!ticketId) adminTicketError("unknown", "Support ticket not found.");
  if (body.length < 2) adminTicketError(ticketId, "Write a response before sending it.");

  let result: Awaited<ReturnType<typeof adminReplyToSupportTicketRecord>>;
  try {
    result = await adminReplyToSupportTicketRecord({
      ticketId,
      adminUserId: adminUser.id,
      body
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The response could not be saved.";
    adminTicketError(ticketId, message);
  }

  const email = await deliverAdminReplyEmail({
    messageId: result.message.id,
    ticketId: result.ticket.id,
    reference: result.ticket.reference,
    title: result.ticket.title,
    requesterUserId: result.ticket.requesterUserId,
    responseBody: body
  });
  redirect(`/admin/support/${ticketId}?replied=1&email=${email}`);
}

export async function adminUpdateSupportTicketTriageAction(formData: FormData): Promise<void> {
  const { user: adminUser } = await requirePlatformAdmin();
  const ticketId = value(formData, "ticketId", 100);
  const categoryValue = value(formData, "category", 40);
  const priorityValue = value(formData, "priority", 40);
  if (!ticketId) adminTicketError("unknown", "Support ticket not found.");
  if (!isSupportCategory(categoryValue)) adminTicketError(ticketId, "Choose a valid support category.");
  if (!isSupportPriority(priorityValue)) adminTicketError(ticketId, "Choose a valid support priority.");

  try {
    await updateSupportTicketTriage({
      ticketId,
      adminUserId: adminUser.id,
      category: categoryValue as SupportTicketCategory,
      priority: priorityValue as SupportTicketPriority
    });
  } catch (error) {
    adminTicketError(ticketId, error instanceof Error ? error.message : "Ticket triage could not be saved.");
  }
  redirect(`/admin/support/${ticketId}?triageSaved=1`);
}

export async function adminUpdateSupportTicketStatusAction(formData: FormData): Promise<void> {
  const { user: adminUser } = await requirePlatformAdmin();
  const ticketId = value(formData, "ticketId", 100);
  const statusValue = value(formData, "status", 40);
  if (!ticketId) adminTicketError("unknown", "Support ticket not found.");
  if (!isSupportStatus(statusValue)) adminTicketError(ticketId, "Choose a valid support status.");

  try {
    await updateSupportTicketStatus({
      ticketId,
      adminUserId: adminUser.id,
      status: statusValue as SupportTicketStatus
    });
  } catch (error) {
    adminTicketError(ticketId, error instanceof Error ? error.message : "Ticket status could not be updated.");
  }
  redirect(`/admin/support/${ticketId}?statusSaved=1`);
}

export async function adminRetrySupportEmailAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const ticketId = value(formData, "ticketId", 100);
  const messageId = value(formData, "messageId", 100);
  if (!ticketId || !messageId) adminTicketError(ticketId || "unknown", "Support response not found.");

  const message = await prisma.supportTicketMessage.findFirst({
    where: { id: messageId, ticketId, authorType: "ADMIN" },
    include: { ticket: true }
  });
  if (!message) adminTicketError(ticketId, "Support response not found.");

  await updateSupportMessageEmailStatus({ messageId: message.id, status: "PENDING" });
  const email = await deliverAdminReplyEmail({
    messageId: message.id,
    ticketId: message.ticket.id,
    reference: message.ticket.reference,
    title: message.ticket.title,
    requesterUserId: message.ticket.requesterUserId,
    responseBody: message.body
  });
  redirect(`/admin/support/${ticketId}?emailRetried=1&email=${email}`);
}
