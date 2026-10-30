import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { readIntakeReviews, type IntakeReviewQuery } from "@/lib/intake-review-reader";
import { IntakeReviewPanel } from "@/components/IntakeReviews";
import { BackLink } from "@/components/BackLink";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";

export const metadata = { title: "Needs review" };
type Query = IntakeReviewQuery & { saved?: string; error?: string; at?: string; sig?: string };
export default async function IntakeReviewsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [{ session, workspace, impersonation }, query] = await Promise.all([requireWorkspace(), searchParams]);
  const review = await readIntakeReviews(workspace.id, query);
  return <div className="page page--form connections-page">
    <BackLink href="/contacts" label="Contacts" />
    <header className="page-header"><div><h1>Review inquiries</h1><p>Choose who each inquiry belongs to.</p></div>
      <nav className="page-actions" aria-label="Review destinations"><Link className="button" href="/jumps">Today</Link><Link className="button" href="/settings/connections">Lead sources</Link></nav>
    </header>
    {query.saved && <Notice>Inquiry reviewed.</Notice>}<UrlErrorNotice params={query} viewer={session} />
    <IntakeReviewPanel review={review} viewOnly={Boolean(impersonation)} />
  </div>;
}
