import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  if (impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  if (!(["OWNER", "ADMIN"] as string[]).includes(membership.role)) return NextResponse.json({ error: "Only workspace owners and administrators can export complete workspace data." }, { status: 403 });

  const workspaceId = workspace.id;
  const [
    workspaceRecord,
    workspacePreference,
    members,
    invitations,
    notificationPreferences,
    notificationEvents,
    contacts,
    activities,
    groups,
    groupStates,
    dateTypes,
    stepTemplates,
    mixes,
    mixBroadcasts,
    mixStops,
    jumps,
    actionEvents,
    integrations,
    externalLinks,
    syncRuns,
    captureDrafts,
    aiMixDrafts,
    sharedImports,
    subscriptions,
    contactImports,
    supportTickets,
    referralAccount,
    referrals,
    referralRewards,
    auditLogs,
    jobs
  ] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, include: { profile: true } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId } }),
    prisma.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true, updatedAt: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.workspaceInvitation.findMany({ where: { workspaceId }, select: { id: true, email: true, role: true, status: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, updatedAt: true } }),
    prisma.notificationPreference.findMany({ where: { workspaceId } }),
    prisma.notificationEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.contact.findMany({ where: { workspaceId }, include: { emails: true, phones: true, addresses: true, groupMemberships: true, jumpDates: true, customFieldValues: { include: { definition: true } }, externalLinks: true }, orderBy: { createdAt: "asc" } }),
    prisma.contactActivity.findMany({ where: { workspaceId }, orderBy: { occurredAt: "asc" } }),
    prisma.group.findMany({ where: { workspaceId }, include: { memberships: true }, orderBy: { createdAt: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId } }),
    prisma.dateType.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null, isSystem: true }] }, orderBy: { createdAt: "asc" } }),
    prisma.stepTemplate.findMany({ where: { workspaceId }, include: { versions: { orderBy: { version: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.mix.findMany({ where: { workspaceId }, include: { steps: true, assignments: true }, orderBy: { createdAt: "asc" } }),
    prisma.mixBroadcastSchedule.findMany({ where: { workspaceId } }),
    prisma.mixStop.findMany({ where: { workspaceId } }),
    prisma.jump.findMany({ where: { workspaceId }, orderBy: { scheduledAt: "asc" } }),
    prisma.jumpActionEvent.findMany({ where: { workspaceId }, orderBy: { occurredAt: "asc" } }),
    prisma.integrationConnection.findMany({ where: { workspaceId }, select: { id: true, provider: true, status: true, externalAccountId: true, scopes: true, metadata: true, lastSyncAt: true, nextSyncAt: true, lastError: true, createdAt: true, updatedAt: true } }),
    prisma.externalContactLink.findMany({ where: { workspaceId } }),
    prisma.syncRun.findMany({ where: { workspaceId }, orderBy: { startedAt: "asc" } }),
    prisma.captureDraft.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.aiMixDraft.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.sharedMixImport.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.subscription.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.contactImportBatch.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.supportTicket.findMany({ where: { workspaceId }, include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.referralAccount.findUnique({ where: { workspaceId } }),
    prisma.referral.findMany({ where: { referrerWorkspaceId: workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.referralReward.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.job.findMany({ where: { workspaceId }, select: { id: true, task: true, payload: true, runAt: true, attempts: true, maxAttempts: true, completedAt: true, failedAt: true, lastError: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" } })
  ]);

  const exportDocument = {
    format: "jump-in-the-mix-workspace-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: { id: user.id, name: user.name, email: user.email, role: membership.role },
    workspace: workspaceRecord,
    workspacePreference,
    members,
    invitations,
    notificationPreferences,
    notificationEvents,
    contacts,
    contactActivities: activities,
    groups,
    groupStates,
    dateTypes,
    actionTemplates: stepTemplates,
    mixes,
    mixBroadcastSchedules: mixBroadcasts,
    mixStops,
    jumps,
    jumpActionEvents: actionEvents,
    integrations,
    externalContactLinks: externalLinks,
    synchronizationRuns: syncRuns,
    captureDrafts,
    aiMixDrafts,
    sharedMixImports: sharedImports,
    subscriptions,
    contactImportBatches: contactImports,
    supportTickets,
    referralAccount,
    referrals,
    referralRewards,
    auditLogs,
    backgroundJobs: jobs,
    excludedSecurityMaterial: ["password hashes", "session tokens", "OAuth state", "encrypted provider credentials", "MFA secrets", "recovery-code hashes", "webhook payloads and secrets"]
  };
  const filename = `jump-in-the-mix-${workspace.slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(exportDocument, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
