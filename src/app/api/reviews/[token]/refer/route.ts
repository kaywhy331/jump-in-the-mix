import { prisma } from "@/lib/prisma";
import { hashReviewToken, referralShareMessage } from "@/lib/review-requests";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 200);
  const record = await prisma.reviewRequest.findUnique({ where: { tokenHash: hashReviewToken(token) } });
  if (!record || record.expiresAt <= new Date() || !record.rating || record.rating < 4) return new Response("This referral link is invalid or expired.", { status: 404 });
  const workspace = await prisma.workspace.findUnique({ where: { id: record.workspaceId }, select: { name: true, profile: { select: { company: true, website: true } } } });
  if (!workspace) return new Response("This referral link is unavailable.", { status: 404 });
  await prisma.$transaction(async (tx) => {
    const clicked = await tx.reviewRequest.updateMany({ where: { id: record.id, referralClickedAt: null }, data: { status: "REFERRAL_CLICKED", referralClickedAt: new Date() } });
    if (clicked.count) await tx.contactActivity.create({ data: { workspaceId: record.workspaceId, contactId: record.contactId, kind: "SYSTEM", visibility: "WORKSPACE", summary: "Opened the referral share composer.", metadata: { reviewRequestId: record.id } } });
  });
  const company = workspace.profile?.company || workspace.name;
  const location = `sms:?body=${encodeURIComponent(referralShareMessage(company, workspace.profile?.website ?? null))}`;
  return new Response(null, { status: 302, headers: { Location: location, "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
