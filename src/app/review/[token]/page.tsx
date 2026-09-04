import type { Metadata } from "next";
import { ReviewFeedbackForm } from "@/components/ReviewFeedbackForm";
import { prisma } from "@/lib/prisma";
import { hashReviewToken } from "@/lib/review-requests";

export const metadata: Metadata = { title: "How did we do?", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CustomerReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 200);
  const request = await prisma.reviewRequest.findUnique({ where: { tokenHash: hashReviewToken(token) } });
  if (!request || request.expiresAt <= new Date()) {
    return <main className="review-page"><section className="review-card"><h1>This feedback link has expired</h1><p>Please contact the business directly if there is anything they should know.</p></section></main>;
  }
  const [contact, workspace] = await Promise.all([
    prisma.contact.findFirst({ where: { id: request.contactId, workspaceId: request.workspaceId }, select: { firstName: true, displayName: true } }),
    prisma.workspace.findUnique({ where: { id: request.workspaceId }, select: { name: true, profile: { select: { company: true, reviewUrl: true } } } })
  ]);
  if (!contact || !workspace) {
    return <main className="review-page"><section className="review-card"><h1>This feedback link is unavailable</h1></section></main>;
  }
  if (request.status === "READY") {
    await prisma.$transaction(async (tx) => {
      const opened = await tx.reviewRequest.updateMany({ where: { id: request.id, status: "READY", openedAt: null }, data: { status: "OPENED", openedAt: new Date() } });
      if (opened.count) await tx.contactActivity.create({ data: { workspaceId: request.workspaceId, contactId: request.contactId, kind: "SYSTEM", visibility: "WORKSPACE", summary: "Opened the private review check-in.", metadata: { reviewRequestId: request.id } } });
    });
  }
  const company = workspace.profile?.company || workspace.name;
  const firstName = contact.firstName?.trim() || contact.displayName.split(/\s+/)[0] || "there";
  return <main className="review-page"><section className="review-card"><p className="eyebrow">A private check-in from {company}</p><h1>Hi {firstName}, how did we do?</h1><p>Your answer goes directly to {company}. It is not posted publicly.</p><ReviewFeedbackForm token={token} initialStatus={request.status === "READY" ? "OPENED" : request.status} initialRating={request.rating} reviewAvailable={Boolean(workspace.profile?.reviewUrl)} /></section></main>;
}
