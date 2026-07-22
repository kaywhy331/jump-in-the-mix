import { notifyWorkspaceMembers, enqueueUserNotification } from "@/lib/notification-service";
import { prisma } from "@/lib/prisma";

export async function enqueueOperationalNotifications(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let queued = 0;
  const [imports, supportReplies, integrationFailures, billingWorkspaces] = await Promise.all([
    prisma.contactImportBatch.findMany({ where: { completedAt: { gte: since }, status: { in: ["COMPLETED", "PARTIAL", "FAILED"] } }, take: 200 }),
    prisma.supportTicketMessage.findMany({ where: { authorType: "ADMIN", createdAt: { gte: since } }, include: { ticket: true }, take: 200, orderBy: { createdAt: "asc" } }),
    prisma.integrationConnection.findMany({ where: { status: { in: ["ERROR", "REVOKED"] }, updatedAt: { gte: since } }, take: 200 }),
    prisma.workspace.findMany({ where: { subscriptionStatus: { in: ["PAST_DUE", "CANCELED", "UNPAID"] } }, take: 200 })
  ]);

  for (const batch of imports) {
    if (!batch.actorUserId) continue;
    const event = await enqueueUserNotification({
      workspaceId: batch.workspaceId,
      userId: batch.actorUserId,
      idempotencyKey: `contact-import-complete:${batch.id}:${batch.status}`,
      type: "IMPORT_COMPLETE",
      title: batch.status === "COMPLETED" ? "Contact import completed" : batch.status === "PARTIAL" ? "Contact import needs review" : "Contact import failed",
      body: `${batch.createdCount} created, ${batch.mergedCount + batch.replacedCount} updated, ${batch.skippedCount} skipped, and ${batch.failedCount} failed.`,
      href: `/contacts/import?batch=${encodeURIComponent(batch.id)}`,
      preferenceFlag: "importComplete"
    });
    if (event) queued += 1;
  }

  for (const message of supportReplies) {
    const event = await enqueueUserNotification({
      workspaceId: message.ticket.workspaceId,
      userId: message.ticket.requesterUserId,
      idempotencyKey: `support-reply:${message.id}`,
      type: "SUPPORT_REPLY",
      title: `Support replied to ${message.ticket.reference}`,
      body: message.body.slice(0, 500),
      href: `/account/tickets/${message.ticketId}`,
      preferenceFlag: "supportReplies"
    });
    if (event) queued += 1;
  }

  for (const connection of integrationFailures) {
    await notifyWorkspaceMembers({
      workspaceId: connection.workspaceId,
      idempotencyKey: `integration-alert:${connection.id}:${connection.status}:${connection.updatedAt.toISOString()}`,
      type: "INTEGRATION_FAILURE",
      title: `${connection.provider.replaceAll("_", " ")} needs attention`,
      body: connection.status === "REVOKED" ? "The provider authorization is no longer valid. Reconnect the account to resume synchronization." : "The most recent provider operation failed. Review the connection status and retry when appropriate.",
      href: "/account?section=connections",
      preferenceFlag: "integrationFailures",
      roles: ["OWNER", "ADMIN"]
    });
    queued += 1;
  }

  for (const workspace of billingWorkspaces) {
    await notifyWorkspaceMembers({
      workspaceId: workspace.id,
      idempotencyKey: `billing-alert:${workspace.id}:${workspace.subscriptionStatus}:${workspace.currentPeriodEnd?.toISOString() ?? "none"}`,
      type: "BILLING_ALERT",
      title: `Subscription ${workspace.subscriptionStatus.replaceAll("_", " ").toLowerCase()}`,
      body: workspace.subscriptionStatus === "PAST_DUE" ? "A payment needs attention. Paid access is retained during the configured recovery period." : "Review the workspace plan and billing status to understand which active features may be limited.",
      href: "/account?section=billing",
      preferenceFlag: "billingAlerts",
      roles: ["OWNER", "ADMIN"]
    });
    queued += 1;
  }
  return queued;
}
