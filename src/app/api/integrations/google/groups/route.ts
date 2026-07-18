import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { listGoogleContactGroups, readGoogleConnectionMetadata } from "@/lib/google-contacts";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

export async function GET() {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!PLAN_LIMITS[membership.workspace.planTier].googleContacts) {
    return NextResponse.json({ error: "Google Contacts requires a Plus or Pro plan." }, { status: 403 });
  }
  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.google.groups",
    identifiers: [membership.workspaceId, session.authUser.id, metadata.ipAddress],
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many Google Contacts requests. Try again shortly." },
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
  if (!connection?.credentialsCiphertext || connection.status === "REVOKED") {
    return NextResponse.json({ error: "Connect Google Contacts first." }, { status: 409 });
  }
  try {
    const groups = await listGoogleContactGroups(connection);
    const connectionMetadata = readGoogleConnectionMetadata(connection.metadata);
    return NextResponse.json({
      groups,
      selectedGroupResourceNames: connectionMetadata.selectedGroupResourceNames ?? [],
      autoMergeExact: connectionMetadata.autoMergeExact !== false
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google Contact groups could not be loaded." },
      { status: 400 }
    );
  }
}
