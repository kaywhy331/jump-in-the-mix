"use server";

import type { SupportTicketCategory } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { isSupportCategory } from "@/lib/support-content";
import {
  createSupportTicketRecord,
  reopenSupportTicketRecord,
  replyToSupportTicketRecord,
  SupportTicketError
} from "@/lib/support-service";

function value(formData: FormData, key: string, maxLength: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function helpError(message: string): never {
  redirect(`/help?error=${encodeURIComponent(message)}#contact-support`);
}

function ticketError(ticketId: string, message: string): never {
  redirect(`/account/tickets/${encodeURIComponent(ticketId)}?error=${encodeURIComponent(message)}`);
}

export async function createSupportTicketAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) helpError("Administrator support sessions are view-only.");

  const title = value(formData, "title", 160);
  const body = value(formData, "body", 5000);
  const categoryValue = value(formData, "category", 40);
  if (title.length < 5) helpError("Give the ticket a clear title of at least 5 characters.");
  if (body.length < 10) helpError("Add at least 10 characters describing what happened and what you expected.");
  if (!isSupportCategory(categoryValue)) helpError("Choose a valid support category.");

  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({
    scope: "support.ticket.create",
    identifiers: [workspace.id, user.id, metadata.ipAddress],
    limit: 5,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000
  });
  if (!decision.allowed) {
    helpError(`Too many support tickets were opened recently. Try again in about ${Math.ceil(decision.retryAfterSeconds / 60)} minute(s).`);
  }

  try {
    const ticket = await createSupportTicketRecord({
      workspaceId: workspace.id,
      requesterUserId: user.id,
      title,
      category: categoryValue as SupportTicketCategory,
      body
    });
    redirect(`/account/tickets/${ticket.id}?created=1`);
  } catch (error) {
    helpError(error instanceof Error ? error.message : "The support ticket could not be created.");
  }
}

export async function replyToSupportTicketAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const ticketId = value(formData, "ticketId", 100);
  if (!ticketId) ticketError("unknown", "Support ticket not found.");
  if (impersonation) ticketError(ticketId, "Administrator support sessions are view-only.");
  const body = value(formData, "body", 5000);
  if (body.length < 2) ticketError(ticketId, "Write a reply before sending it.");

  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({
    scope: "support.ticket.reply",
    identifiers: [workspace.id, user.id, metadata.ipAddress],
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 30 * 60 * 1000
  });
  if (!decision.allowed) ticketError(ticketId, "Too many support replies were submitted. Try again later.");

  try {
    await replyToSupportTicketRecord({
      ticketId,
      workspaceId: workspace.id,
      requesterUserId: user.id,
      body
    });
    redirect(`/account/tickets/${ticketId}?replied=1`);
  } catch (error) {
    const message = error instanceof SupportTicketError || error instanceof Error
      ? error.message
      : "The reply could not be added.";
    ticketError(ticketId, message);
  }
}

export async function reopenSupportTicketAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const ticketId = value(formData, "ticketId", 100);
  if (!ticketId) ticketError("unknown", "Support ticket not found.");
  if (impersonation) ticketError(ticketId, "Administrator support sessions are view-only.");

  try {
    await reopenSupportTicketRecord({
      ticketId,
      workspaceId: workspace.id,
      requesterUserId: user.id
    });
    redirect(`/account/tickets/${ticketId}?reopened=1`);
  } catch (error) {
    const message = error instanceof SupportTicketError || error instanceof Error
      ? error.message
      : "The ticket could not be reopened.";
    ticketError(ticketId, message);
  }
}
