import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import {
  googleIntegrationConfigured,
  readGoogleConnectionMetadata
} from "@/lib/google-contacts";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const connection = await prisma.integrationConnection.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: membership.workspaceId,
        provider: "GOOGLE_CONTACTS"
      }
    },
    include: {
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 10
      }
    }
  });
  const metadata = readGoogleConnectionMetadata(connection?.metadata);
  return NextResponse.json({
    configured: googleIntegrationConfigured(),
    entitled: PLAN_LIMITS[membership.workspace.planTier].googleContacts,
    planTier: membership.workspace.planTier,
    readOnly: Boolean(session.impersonation),
    connection: connection ? {
      id: connection.id,
      status: connection.status,
      accountEmail: metadata.accountEmail ?? null,
      accountName: metadata.accountName ?? null,
      selectedGroupResourceNames: metadata.selectedGroupResourceNames ?? [],
      selectedGroupLabels: metadata.selectedGroupLabels ?? {},
      autoMergeExact: metadata.autoMergeExact !== false,
      lastSummary: metadata.lastSummary ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      nextSyncAt: connection.nextSyncAt?.toISOString() ?? null,
      lastError: connection.lastError,
      syncMode: connection.syncCursor ? "incremental" : "initial"
    } : null,
    runs: (connection?.syncRuns ?? []).map((run) => ({
      id: run.id,
      mode: run.mode,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      createdCount: run.createdCount,
      updatedCount: run.updatedCount,
      skippedCount: run.skippedCount,
      errorCount: run.errorCount,
      errorSummary: run.errorSummary
    }))
  });
}
