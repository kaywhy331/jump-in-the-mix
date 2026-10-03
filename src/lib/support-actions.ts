"use server";

import { captureFormFailure, recoverableFormAction, withViewerError, type ErrorViewer, type FormResult } from "@/lib/form-errors";
import type { SupportTicketCategory } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { SupportAccessError } from "@/lib/support-case-access";
import { isSupportCategory } from "@/lib/support-content";
import { formatSupportReport } from "@/lib/support-report";
import {
  createSupportTicketRecord,
  reopenSupportTicketRecord,
  replyToSupportTicketRecord,
  SupportTicketError
} from "@/lib/support-service";

function value(formData: FormData, key: string, maxLength: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function helpError(message: string, viewer: ErrorViewer): never {
  captureFormFailure(message);
  redirect(`${withViewerError("/help", message, viewer)}#contact-support`);
}

function ticketError(ticketId: string, message: string, viewer: ErrorViewer): never {
  captureFormFailure(message);
  redirect(withViewerError(`/account/tickets/${encodeURIComponent(ticketId)}`, message, viewer));
}

export async function createSupportTicketAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  if (impersonation) helpError("Administrator support sessions are view-only.", session);

  const raw = (key: string) => String(formData.get(key) ?? "");
  const { title, report, body } = formatSupportReport({
    title: raw("title"),
    body: raw("body"),
    diagnostics: raw("supportDiagnostics"),
    context: raw("supportContext")
  });
  const categoryValue = value(formData, "category", 40);
  if (title.length < 5) helpError("Give the ticket a clear title of at least 5 characters.", session);
  if (report.trim().length < 10) helpError("Add at least 10 characters describing what happened and what you expected.", session);
  if (!isSupportCategory(categoryValue)) helpError("Choose a valid support category.", session);

  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({
    scope: "support.ticket.create",
    identifiers: [workspace.id, user.id, metadata.ipAddress],
    limit: 5,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000
  });
  if (!decision.allowed) {
    helpError(`Too many support tickets were opened recently. Try again in about ${Math.ceil(decision.retryAfterSeconds / 60)} minute(s).`, session);
  }

  let ticketId = "";
  try {
    const ticket = await createSupportTicketRecord({
      workspaceId: workspace.id,
      requesterUserId: user.id,
      title,
      category: categoryValue as SupportTicketCategory,
      body
    });
    ticketId = ticket.id;
  } catch (error) {
    helpError(error instanceof SupportTicketError ? error.message : "The support ticket could not be created.", session);
  }
  if (!ticketId) helpError("The support ticket could not be created.", session);
  redirect(`/account/tickets/${ticketId}?created=1`);
}

export async function replyToSupportTicketAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const ticketId = value(formData, "ticketId", 100);
  if (!ticketId) ticketError("unknown", "Support ticket not found.", session);
  if (impersonation) ticketError(ticketId, "Administrator support sessions are view-only.", session);
  const body = value(formData, "body", 5000);
  if (body.length < 2) ticketError(ticketId, "Write a reply before sending it.", session);

  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({
    scope: "support.ticket.reply",
    identifiers: [workspace.id, user.id, metadata.ipAddress],
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 30 * 60 * 1000
  });
  if (!decision.allowed) ticketError(ticketId, "Too many support replies were submitted. Try again later.", session);

  try {
    await replyToSupportTicketRecord({
      ticketId,
      workspaceId: workspace.id,
      requesterUserId: user.id,
      body
    });
  } catch (error) {
    const message = error instanceof SupportTicketError || error instanceof SupportAccessError ? error.message : "The reply could not be added.";
    ticketError(ticketId, message, session);
  }
  redirect(`/account/tickets/${ticketId}?replied=1`);
}

export async function reopenSupportTicketAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const ticketId = value(formData, "ticketId", 100);
  if (!ticketId) ticketError("unknown", "Support ticket not found.", session);
  if (impersonation) ticketError(ticketId, "Administrator support sessions are view-only.", session);

  try {
    await reopenSupportTicketRecord({
      ticketId,
      workspaceId: workspace.id,
      requesterUserId: user.id
    });
  } catch (error) {
    const message = error instanceof SupportTicketError || error instanceof SupportAccessError
      ? error.message
      : "The ticket could not be reopened.";
    ticketError(ticketId, message, session);
  }
  redirect(`/account/tickets/${ticketId}?reopened=1`);
}

export async function createSupportTicketFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => createSupportTicketAction(data)); }
export async function replyToSupportTicketFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => replyToSupportTicketAction(data)); }
