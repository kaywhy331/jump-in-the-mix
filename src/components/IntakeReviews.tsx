import Link from "next/link";
import { TodayLink } from "@/components/TodayNavigation";
import { journeyEventLabel } from "@/lib/journey-types";
import { reviewIntakeAction } from "@/lib/intake-actions";
import type { IntakeReviews } from "@/lib/intake-review-reader";

export function NeedsReviewLink({ count, today = false }: { count: number | null; today?: boolean }) {
  const NavigationLink = today ? TodayLink : Link;
  return <div className="needs-review-entry" data-review-count={count ?? "unavailable"}>
    <NavigationLink className="button" href="/contacts/review">Needs review{count !== null ? ` · ${count}` : ""}</NavigationLink>
    <span className="muted-copy">{count === null ? "Inquiries could not be checked. Open Needs review to try again." : "Inquiries waiting for you to choose a contact."}</span>
  </div>;
}

/** The same receipt choices on daily work and the existing Settings destination. */
export function IntakeReviewPanel({ review, viewOnly, basePath = "/contacts/review" }: {
  review: IntakeReviews; viewOnly: boolean; basePath?: "/contacts/review" | "/settings/connections";
}) {
  const href = (page: number) => `${basePath}?${new URLSearchParams({ reviewPage: String(page), reviewQ: review.search })}#needs-review`;
  return <section className="card intake-review-panel" id="needs-review" aria-labelledby="needs-review-heading">
    <h2 id="needs-review-heading">Needs review · {review.count}</h2>
    <p>When inquiry details point to different people or an archived contact, choose a contact, create a separate contact, or ignore the inquiry.</p>
    <p className="muted-copy">New contacts waiting for a Mix are separate. If your New contacts setting is Ask each time, people from lead sources wait in <Link className="inline-action" href="/contacts?mix=no-mix">No Mix</Link>, also linked from Today.</p>
    {viewOnly && <p id="review-view-only" role="status">This support session is view-only. Inquiries can be read but not resolved.</p>}
    <form action={`${basePath}#needs-review`} className="filter-bar">
      <label className="field"><span>Find a held inquiry</span><input name="reviewQ" type="search" defaultValue={review.search} placeholder="Name, email, phone, or company" /></label>
      <button className="button">Search review queue</button>
    </form>
    {!review.items.length && <p className="muted-copy">{review.search ? "No inquiries match this search." : "No inquiries waiting for review."}</p>}
    {review.items.map(({ work, payload, sourceName, matches }) => <article className="intake-review" key={work.id} id={`receipt-${work.receiptId}`} data-work-item-id={work.id}>
      <h3>{work.contactName}</h3><p>{sourceName} · {payload.email || "No email"} · {payload.phone || "No phone"}</p>
      <p className="muted-copy">{journeyEventLabel(payload.eventType)}. Accepting this inquiry applies your matching journey rules.</p>
      {payload.message && <p className="preserve-lines">{payload.message}</p>}
      <form action={reviewIntakeAction} className="form-stack">
        <input type="hidden" name="receiptId" value={work.receiptId} /><input type="hidden" name="returnTo" value={basePath} />
        <label className="field"><span>Matching contact</span><select name="contactId" defaultValue="" disabled={viewOnly} aria-describedby={viewOnly ? "review-view-only" : undefined}>
          <option value="">Choose a matching person</option>
          {matches.filter(contact => !contact.archivedAt).map(contact => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
        </select></label>
        {matches.some(contact => contact.archivedAt) && <p className="muted-copy">An archived person matches these details. <Link className="inline-action" href="/contacts/archived">Restore them</Link> to link this inquiry, or create a separate contact if appropriate.</p>}
        {!matches.length && <p className="muted-copy">No matching contact is available. Create a separate contact or ignore this inquiry.</p>}
        <div className="form-actions">
          <button className="button primary" name="decision" value="link" disabled={viewOnly} aria-describedby={viewOnly ? "review-view-only" : undefined}>Link to selected person</button>
          <button className="button" name="decision" value="create" disabled={viewOnly} aria-describedby={viewOnly ? "review-view-only" : undefined}>Create a separate contact</button>
          <button className="button" name="decision" value="ignore" disabled={viewOnly} aria-describedby={viewOnly ? "review-view-only" : undefined}>Ignore inquiry</button>
        </div>
      </form>
    </article>)}
    <nav className="pagination-bar" aria-label="Review pages"><span>Page {review.page} of {review.pages}</span>
      {review.page > 1 && <Link className="button" href={href(review.page - 1)}>Previous reviews</Link>}
      {review.page < review.pages && <Link className="button" href={href(review.page + 1)}>Next reviews</Link>}
    </nav>
  </section>;
}
