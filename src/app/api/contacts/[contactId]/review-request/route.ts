import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { hashReviewToken, reviewRequestExpiresAt } from "@/lib/review-requests";

export async function POST(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  const metadata = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "review-request.create", identifiers: [membership.workspaceId, session.user.id, metadata.ipAddress], limit: 20, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many review requests. Try again tomorrow." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const { contactId } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId: membership.workspaceId, archivedAt: null },
    include: { phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, relationshipState: true }
  });
  if (!contact) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  if (contact.relationshipState?.doNotContact) return NextResponse.json({ error: "Turn off Do not contact before preparing a review request." }, { status: 409 });

  const profile = membership.workspace.profile;
  const company = profile?.company || membership.workspace.name;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = reviewRequestExpiresAt();
  await prisma.$transaction(async (tx) => {
    await tx.reviewRequest.updateMany({
      where: { workspaceId: membership.workspaceId, contactId, status: { in: ["READY", "OPENED"] }, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() }
    });
    const created = await tx.reviewRequest.create({ data: { workspaceId: membership.workspaceId, contactId, tokenHash: hashReviewToken(token), expiresAt } });
    await tx.auditLog.create({
      data: { workspaceId: membership.workspaceId, actorType: "USER", actorUserId: session.user.id, action: "review-request.created", entityType: "ReviewRequest", entityId: created.id, source: "contact.review-request", metadata: { contactId, expiresAt: expiresAt.toISOString() } }
    });
  });

  const reviewUrl = new URL(`/review/${encodeURIComponent(token)}`, env.appUrl).toString();
  const firstName = contact.firstName?.trim() || contact.displayName.split(/\s+/)[0] || "there";
  const signature = profile?.smsSignature?.trim() || session.user.name;
  const message = `Hi ${firstName}, thanks for choosing ${company}. How did we do? Your private feedback takes a few seconds: ${reviewUrl} — ${signature}`;
  const phone = contact.phones[0]?.phone ?? null;
  const email = contact.emails[0]?.email ?? null;
  return NextResponse.json({
    reviewUrl,
    message,
    smsUrl: phone ? `sms:${phone}?body=${encodeURIComponent(message)}` : null,
    emailUrl: email ? `mailto:${email}?subject=${encodeURIComponent(`How did we do at ${company}?`)}&body=${encodeURIComponent(message)}` : null,
    expiresAt: expiresAt.toISOString()
  }, { headers: { "Cache-Control": "no-store" } });
}
