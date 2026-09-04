import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { hashReviewToken, reviewResponseStatus } from "@/lib/review-requests";

type Payload = { rating?: unknown; feedback?: unknown };

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 200);
  const tokenHash = hashReviewToken(token);
  const metadata = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "review-request.respond", identifiers: [tokenHash, metadata.ipAddress], limit: 10, windowMs: 60 * 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const payload = await request.json().catch(() => null) as Payload | null;
  const rating = Number(payload?.rating);
  let status: "HAPPY" | "NEEDS_ATTENTION";
  try { status = reviewResponseStatus(rating); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Choose a rating from 1 to 5." }, { status: 400 }); }
  const feedback = typeof payload?.feedback === "string" ? payload.feedback.trim().slice(0, 2000) || null : null;
  const record = await prisma.reviewRequest.findUnique({ where: { tokenHash } });
  if (!record || record.expiresAt <= new Date()) return NextResponse.json({ error: "This feedback link is invalid or expired." }, { status: 404 });
  if (record.respondedAt) return NextResponse.json({ outcome: record.rating && record.rating >= 4 ? "happy" : "attention", duplicate: true });

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.reviewRequest.updateMany({ where: { id: record.id, respondedAt: null, status: { in: ["READY", "OPENED"] }, expiresAt: { gt: new Date() } }, data: { status, rating, feedback, respondedAt: new Date() } });
      if (updated.count !== 1) throw new Error("This feedback was already submitted.");
      await tx.contactActivity.create({ data: { workspaceId: record.workspaceId, contactId: record.contactId, kind: "SYSTEM", visibility: "WORKSPACE", summary: status === "HAPPY" ? `Private check-in rated ${rating} of 5.` : `Private feedback received with a ${rating} of 5 rating.`, metadata: { reviewRequestId: record.id, rating, hasFeedback: Boolean(feedback) } } });
      await tx.auditLog.create({ data: { workspaceId: record.workspaceId, actorType: "SYSTEM", action: "review-request.responded", entityType: "ReviewRequest", entityId: record.id, source: "public.review", metadata: { rating, status, hasFeedback: Boolean(feedback) } } });
    });
  } catch {
    const replay = await prisma.reviewRequest.findUnique({ where: { id: record.id }, select: { rating: true, respondedAt: true } });
    if (replay?.respondedAt) return NextResponse.json({ outcome: replay.rating && replay.rating >= 4 ? "happy" : "attention", duplicate: true });
    return NextResponse.json({ error: "Your feedback could not be saved. Please try again." }, { status: 409 });
  }
  return NextResponse.json({ outcome: status === "HAPPY" ? "happy" : "attention" });
}
