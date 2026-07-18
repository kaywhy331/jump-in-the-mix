import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { queueGoogleContactsSync } from "@/lib/google-sync-service";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const requestSchema = z.object({
  selectedGroupResourceNames: z.array(z.string().min(1).max(240)).max(1000).default([]),
  selectedGroupLabels: z.record(z.string(), z.string().max(160)).default({}),
  autoMergeExact: z.boolean().default(true)
}).strict();

export async function POST(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  if (!PLAN_LIMITS[membership.workspace.planTier].googleContacts) {
    return NextResponse.json({ error: "Google Contacts requires a Plus or Pro plan." }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The Google sync settings are invalid." }, { status: 400 });

  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.google.sync",
    identifiers: [membership.workspaceId, session.authUser.id, metadata.ipAddress],
    limit: 10,
    windowMs: 60 * 60 * 1000,
    blockMs: 30 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many Google sync requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: membership.workspaceId,
        provider: "GOOGLE_CONTACTS"
      }
    },
    select: { id: true }
  });
  if (!connection) return NextResponse.json({ error: "Connect Google Contacts first." }, { status: 409 });
  try {
    const result = await queueGoogleContactsSync({
      workspaceId: membership.workspaceId,
      connectionId: connection.id,
      actorUserId: session.authUser.id,
      config: parsed.data,
      requestedMode: "MANUAL"
    });
    return NextResponse.json(result, { status: result.mode === "ALREADY_RUNNING" ? 200 : 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google Contacts sync could not be started." },
      { status: 400 }
    );
  }
}
