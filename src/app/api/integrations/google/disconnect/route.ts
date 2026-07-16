import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { revokeGoogleCredentials } from "@/lib/google-contacts";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

export async function POST() {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });

  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.google.disconnect",
    identifiers: [membership.workspaceId, session.authUser.id, metadata.ipAddress],
    limit: 5,
    windowMs: 60 * 60 * 1000,
    blockMs: 30 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many disconnect requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: membership.workspaceId,
        provider: "GOOGLE_CONTACTS"
      }
    }
  });
  if (!connection) return new NextResponse(null, { status: 204 });

  let warning: string | null = null;
  try {
    await revokeGoogleCredentials(connection);
  } catch (error) {
    warning = error instanceof Error ? error.message : "Google access could not be revoked remotely.";
  }

  await prisma.$transaction([
    prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: "REVOKED",
        credentialsCiphertext: null,
        syncCursor: null,
        nextSyncAt: null,
        lastError: warning
      }
    }),
    prisma.syncRun.updateMany({
      where: { connectionId: connection.id, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELED", completedAt: new Date(), errorSummary: "Google Contacts was disconnected." }
    }),
    prisma.job.updateMany({
      where: {
        workspaceId: membership.workspaceId,
        task: "sync-google-contacts",
        completedAt: null,
        failedAt: null
      },
      data: { failedAt: new Date(), lastError: "Google Contacts was disconnected.", lockedAt: null, lockedBy: null }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: membership.workspaceId,
        actorType: "USER",
        actorUserId: session.authUser.id,
        action: "integration.google.disconnect",
        entityType: "IntegrationConnection",
        entityId: connection.id,
        source: "account.integrations",
        metadata: { remoteRevocationWarning: warning }
      }
    })
  ]);
  return NextResponse.json({ disconnected: true, warning });
}
