import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashReviewToken } from "@/lib/review-requests";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 200);
  const record = await prisma.reviewRequest.findUnique({ where: { tokenHash: hashReviewToken(token) } });
  if (!record || record.expiresAt <= new Date() || !record.rating || record.rating < 4) return new NextResponse("This review link is invalid or expired.", { status: 404 });
  const workspace = await prisma.workspace.findUnique({ where: { id: record.workspaceId }, select: { profile: { select: { reviewUrl: true } } } });
  const rawUrl = workspace?.profile?.reviewUrl;
  let destination: URL;
  try { destination = new URL(rawUrl ?? ""); } catch { return new NextResponse("The business has not configured a public review page.", { status: 404 }); }
  if (destination.protocol !== "https:") return new NextResponse("The public review page is unavailable.", { status: 404 });

  await prisma.$transaction(async (tx) => {
    const clicked = await tx.reviewRequest.updateMany({ where: { id: record.id, reviewClickedAt: null }, data: { status: "REVIEW_CLICKED", reviewClickedAt: new Date() } });
    if (clicked.count) await tx.contactActivity.create({ data: { workspaceId: record.workspaceId, contactId: record.contactId, kind: "SYSTEM", visibility: "WORKSPACE", summary: "Opened the public review page.", metadata: { reviewRequestId: record.id } } });
  });
  return NextResponse.redirect(destination, { status: 302, headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
