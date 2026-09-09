"use server";

import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus
} from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { consumeRateLimit } from "@/lib/rate-limit";
import { assignSupportTicket, SupportAccessError } from "@/lib/support-case-access";
import {
  isSupportCategory,
  isSupportPriority,
  isSupportStatus
} from "@/lib/support-content";
import { retrySupportEmail, recoverSupportEmailReceipt, repeatSupportEmail, cancelSupportEmail } from "@/lib/support-email-recovery";
import { EmailReviewError } from "@/lib/email-suppression-admin";
import {
  adminReplyToSupportTicketRecord,
  SupportTicketError,
  updateSupportTicketStatus,
  updateSupportTicketTriage
} from "@/lib/support-service";

function value(formData: FormData, key: string, maxLength: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function adminTicketError(ticketId: string, message: string): never {
  redirect(`/admin/support/${encodeURIComponent(ticketId)}?error=${encodeURIComponent(message)}`);
}

export async function adminReplyToSupportTicketAction(formData: FormData): Promise<void> {
  const { user: adminUser, session } = await requirePlatformAdmin("support.manage");
  await limitSupportAction(adminUser.id);
  const ticketId = value(formData, "ticketId", 100);
  const body = value(formData, "body", 5000);
  if (!ticketId) adminTicketError("unknown", "Support ticket not found.");
  if (body.length < 2) adminTicketError(ticketId, "Write a response before sending it.");

  let result: Awaited<ReturnType<typeof adminReplyToSupportTicketRecord>> | null = null;
  try {
    result = await adminReplyToSupportTicketRecord({
      ticketId,
      adminUserId: adminUser.id,
      actorSessionId: session.id,
      requestKey: value(formData, "requestKey", 100),
      body
    });
  } catch (error) {
    const message = (error instanceof SupportAccessError || error instanceof SupportTicketError) ? error.message : "The response could not be saved.";
    adminTicketError(ticketId, message);
  }
  if (!result) adminTicketError(ticketId, "The response could not be saved.");

  revalidatePath(`/account/tickets/${ticketId}`);
  redirect(`/admin/support/${ticketId}?replied=1`);
}

export async function adminUpdateSupportTicketTriageAction(formData: FormData): Promise<void> {
  const { user: adminUser, session } = await requirePlatformAdmin("support.manage");
  await limitSupportAction(adminUser.id);
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
      actorSessionId: session.id,
      category: categoryValue as SupportTicketCategory,
      priority: priorityValue as SupportTicketPriority
    });
  } catch (error) {
    adminTicketError(ticketId, (error instanceof SupportAccessError || error instanceof SupportTicketError) ? error.message : "Ticket triage could not be saved.");
  }
  redirect(`/admin/support/${ticketId}?triageSaved=1`);
}

export async function adminUpdateSupportTicketStatusAction(formData: FormData): Promise<void> {
  const { user: adminUser, session } = await requirePlatformAdmin("support.manage");
  await limitSupportAction(adminUser.id);
  const ticketId = value(formData, "ticketId", 100);
  const statusValue = value(formData, "status", 40);
  if (!ticketId) adminTicketError("unknown", "Support ticket not found.");
  if (!isSupportStatus(statusValue)) adminTicketError(ticketId, "Choose a valid support status.");

  try {
    await updateSupportTicketStatus({
      ticketId,
      adminUserId: adminUser.id,
      actorSessionId: session.id,
      status: statusValue as SupportTicketStatus
    });
  } catch (error) {
    adminTicketError(ticketId, (error instanceof SupportAccessError || error instanceof SupportTicketError) ? error.message : "Ticket status could not be updated.");
  }
  redirect(`/admin/support/${ticketId}?statusSaved=1`);
}

export async function adminRetrySupportEmailAction(formData: FormData): Promise<void> {
  await reviewEmailAction(formData, "retry");
}
export async function adminRecoverSupportEmailAction(formData: FormData): Promise<void> {
  await reviewEmailAction(formData, "recover");
}
export async function adminRepeatSupportEmailAction(formData: FormData): Promise<void> {
  await reviewEmailAction(formData, "repeat");
}
export async function adminCancelSupportEmailAction(formData: FormData): Promise<void> {
  await reviewEmailAction(formData, "cancel");
}
async function reviewEmailAction(formData: FormData, operation: "retry" | "recover" | "repeat" | "cancel") {
  const { user, session } = await requirePlatformAdmin("support.manage");
  await limitSupportAction(user.id);
  const ticketId = value(formData, "ticketId", 100);
  const input = { actorUserId: user.id, actorSessionId: session.id, ticketId, deliveryId: value(formData, "deliveryId", 100), expectedUpdatedAt: value(formData, "expectedUpdatedAt", 40), reason: String(formData.get("reason") ?? "") };
  try {
    if (operation === "retry") await retrySupportEmail(input);
    else if (operation === "recover") await recoverSupportEmailReceipt({ ...input, providerId: value(formData, "providerId", 200) || undefined });
    else if (operation === "cancel") await cancelSupportEmail(input);
    else await repeatSupportEmail({ ...input, password: String(formData.get("password") ?? ""), providerReference: String(formData.get("providerReference") ?? ""), requestReference: String(formData.get("requestReference") ?? ""), providerReviewed: formData.get("providerReviewed") === "on", recipientRequested: formData.get("recipientRequested") === "on", duplicateRiskAccepted: formData.get("duplicateRiskAccepted") === "on" });
  } catch (error) {
    adminTicketError(ticketId, error instanceof SupportAccessError || error instanceof EmailReviewError ? error.message : "The notification review could not be saved. Reload the ticket.");
  }
  revalidatePath(`/admin/support/${ticketId}`);
  redirect(`/admin/support/${encodeURIComponent(ticketId)}?emailReviewed=1`);
}

async function limitSupportAction(actorUserId: string) {
  if (!(await consumeRateLimit({ scope: "admin.support-action", identifiers: [actorUserId], limit: 40, windowMs: 5 * 60_000 })).allowed) redirect("/admin/support?error=Too+many+support+actions.+Please+wait+five+minutes.");
}

export async function adminAssignSupportTicketAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("support.manage");
  await limitSupportAction(user.id);
  const ticketId = value(formData, "ticketId", 100);
  try {
    await assignSupportTicket({ actorUserId: user.id, actorSessionId: session.id, ticketId, assignedToUserId: value(formData, "assignedToUserId", 100) || null, expectedRevision: Number(formData.get("assignmentRevision") ?? NaN), reason: String(formData.get("reason") ?? "") });
  } catch (error) { adminTicketError(ticketId, error instanceof SupportAccessError ? error.message : "The assignment could not be saved."); }
  revalidatePath("/admin/support");
  redirect(`/admin/support/${encodeURIComponent(ticketId)}?assignmentSaved=1`);
}
