import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { ReviewFeedbackForm } from "@/components/ReviewFeedbackForm";
import { prisma } from "@/lib/prisma";
import { hashReviewToken } from "@/lib/review-requests";

export const metadata: Metadata = { title: "How did we do?", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type BusinessProfile = { company: string | null; website: string | null; phone: string | null } | null;

// The business's own website, or a dialable phone number, for "Contact the business".
function businessContact(profile: BusinessProfile): string | null {
  if (profile?.website?.startsWith("https://")) return profile.website;
  return profile?.phone && /^[+\d ()-]+$/.test(profile.phone) ? `tel:${profile.phone.replace(/[^+\d]/g, "")}` : null;
}

// A link that can no longer be used: the shared system card, a heading that names the state, and a next step
// that speaks with the business name when the link still identifies the business (JITM-04 §2.37, JITM-08 §2.39).
function ClosedFeedbackLink({ heading, company, contact }: { heading: string; company?: string | null; contact?: string | null }) {
  return <AuthCard>
    <h1>{heading}</h1>
    <p>{company ? `If there is anything ${company} should know, contact them directly.` : "Please contact the business directly if there is anything they should know."} You can close this page.</p>
    {company && contact && <a className="button primary" href={contact}>Contact {company}</a>}
  </AuthCard>;
}

export default async function CustomerReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.slice(0, 200);
  const request = await prisma.reviewRequest.findUnique({ where: { tokenHash: hashReviewToken(token) } });
  if (!request) return <ClosedFeedbackLink heading="This feedback link has expired" />;
  const [contact, workspace] = await Promise.all([
    prisma.contact.findFirst({ where: { id: request.contactId, workspaceId: request.workspaceId }, select: { firstName: true, displayName: true } }),
    prisma.workspace.findUnique({ where: { id: request.workspaceId }, select: { name: true, profile: { select: { company: true, reviewUrl: true, website: true, phone: true } } } })
  ]);
  if (request.expiresAt <= new Date()) {
    const company = workspace ? workspace.profile?.company || workspace.name : null;
    return <ClosedFeedbackLink heading="This feedback link has expired" company={company} contact={businessContact(workspace?.profile ?? null)} />;
  }
  if (!contact || !workspace) return <ClosedFeedbackLink heading="This feedback link isn’t available" />;
  if (request.status === "READY") {
    await prisma.$transaction(async (tx) => {
      const opened = await tx.reviewRequest.updateMany({ where: { id: request.id, status: "READY", openedAt: null }, data: { status: "OPENED", openedAt: new Date() } });
      if (opened.count) await tx.contactActivity.create({ data: { workspaceId: request.workspaceId, contactId: request.contactId, kind: "SYSTEM", visibility: "WORKSPACE", summary: "Opened the private review check-in.", metadata: { reviewRequestId: request.id } } });
    });
  }
  const company = workspace.profile?.company || workspace.name;
  const firstName = contact.firstName?.trim() || contact.displayName.split(/\s+/)[0] || "there";
  return <main className="review-page"><section className="review-card"><h1>Hi {firstName}, how did we do?</h1><p>Your answer goes directly to {company}. It is not posted publicly.</p><ReviewFeedbackForm token={token} initialStatus={request.status === "READY" ? "OPENED" : request.status} initialRating={request.rating} businessContact={businessContact(workspace.profile)} reviewAvailable={Boolean(workspace.profile?.reviewUrl)} /></section></main>;
}
