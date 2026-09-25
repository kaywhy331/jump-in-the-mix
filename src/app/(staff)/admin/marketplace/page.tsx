import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Notice } from "@/components/Notice";
import { PortableOutline } from "@/components/PortableOutline";
import { reasonLabel } from "@/lib/marketplace";
import { reviewListingAction } from "@/lib/marketplace-actions";
import { readModerationQueue, type ModerationView } from "@/lib/marketplace-service";

export const metadata: Metadata = { title: "Admin · Community reports" };
const TABS = [{ value: "", label: "Needs review" }, { value: "hidden", label: "Hidden" }, { value: "reviewed", label: "Reviewed" }] as const;
/**
 * What each decision does depends on where the share stands; a share the author stopped is never re-shared by
 * staff, and a hidden share with nothing to show is restored as not shared.
 */
const decisionCopy = (listing: { status: string; reviewRequestedAt: Date | null; value: unknown; reports: Array<{ status: string }> }) => listing.status === "HIDDEN"
  ? `${listing.reviewRequestedAt ? "The author changed this share and asked for another review. " : ""}Hidden now. Restoring puts it back on the Marketplace; keeping it hidden ${listing.reports.some(report => report.status === "OPEN") ? "upholds the reports" : "sends your note to the author"}.${listing.value ? "" : " It has nothing to show right now, so restoring leaves it unshared."}`
  : listing.status === "LIVE" ? "Still shared. Dismissing closes the reports and keeps it shared; hiding takes it down until it is restored."
  : "The author stopped sharing this. Either decision only closes the reports; it stays unshared until the author shares it again.";
const utc = (at: Date) => `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** Staff review of reported community shares. The shared wording is public; reporters stay anonymous to authors. */
export default async function AdminMarketplacePage({ searchParams }: { searchParams: Promise<{ view?: string; reviewed?: string }> }) {
  const [{ staff }, query] = await Promise.all([requirePlatformAdmin("mixes.edit"), searchParams]);
  const canDecide = hasAdminPermission(staff, "mixes.publish");
  const view: ModerationView = query.view === "hidden" || query.view === "reviewed" ? query.view : "";
  // Open reports and requests for another review, each with its live wording (null when it has nothing to show).
  const { rows: listings, counts } = await readModerationQueue(view);
  return <div className="page admin-library-page admin-marketplace-page">
    <header className="page-header"><div><h1>Community reports</h1><p>A private-information report from a verified account hides a share at once; every other report keeps it visible until you decide. Authors see the reason and your note, never who reported. After you keep a share hidden, its author can change it and ask for another review.</p></div></header>
    {query.reviewed && <Notice type="success">Decision saved. The author can see it on their share.</Notice>}
    <nav className="admin-content-tabs" aria-label="Report status">{TABS.map(tab => <Link key={tab.value} href={tab.value ? `/admin/marketplace?view=${tab.value}` : "/admin/marketplace"} aria-current={view === tab.value ? "page" : undefined}>{tab.label}{tab.value === "" ? ` (${counts.needsReview})` : tab.value === "hidden" ? ` (${counts.hidden})` : ""}</Link>)}</nav>
    <section className="admin-panel" aria-label="Reported shares">
      {listings.length ? listings.map(listing => <article className="admin-marketplace-row" key={listing.id}>
        <header><h2>{listing.title}</h2><span className={`admin-content-status ${listing.status === "LIVE" ? "published" : ""}`}>{listing.status === "LIVE" ? "Shared" : listing.status === "HIDDEN" ? `Hidden · ${reasonLabel(listing.hiddenReason ?? "OTHER")}` : "Not shared"}</span></header>
        <p className="muted-copy">{listing.kind === "MIX" ? "Mix" : "Mega-Mix"} by {listing.workspace.marketplaceAuthor?.publicName ?? listing.workspace.name} · {listing.beatCount} Beats · {listing._count.favorites} {listing._count.favorites === 1 ? "favorite" : "favorites"} · added {listing._count.imports} {listing._count.imports === 1 ? "time" : "times"}</p>
        {listing.reviewRequestedAt && <div className="notice info"><p><strong>Another review requested</strong> {utc(listing.reviewRequestedAt)}. {listing.value ? `Content changed on ${utc(listing.contentAt)}${listing.decidedAt ? `, after the decision on ${utc(listing.decidedAt)}` : ""}.` : "It has nothing to show right now."}</p>{listing.reviewRequestNote && <p>Author’s note: {listing.reviewRequestNote}</p>}</div>}
        {!listing.reviewRequestedAt && listing.reviewResponseNote && listing.reviewRespondedAt && <p className="muted-copy">Last reply to the author, {utc(listing.reviewRespondedAt)}: {listing.reviewResponseNote}</p>}
        <ul className="marketplace-reports">{listing.reports.map(report => <li key={report.id}><strong>{reasonLabel(report.reason)}{report.autoHidden ? " · hid the share" : ""}</strong><small>{report.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {report.status.toLowerCase()}</small>{report.details && <p>{report.details}</p>}{report.reviewNote && <p><em>Note: {report.reviewNote}</em></p>}</li>)}</ul>
        <details className="admin-marketplace-content"><summary>Read the shared wording</summary>{listing.value ? <PortableOutline value={listing.value} label={`${listing.title} Beats`} /> : <p>The author removed or emptied this since it was reported.</p>}</details>
        {canDecide ? <ActionForm action={reviewListingAction} className="form-stack admin-marketplace-decision">
          <input type="hidden" name="listingId" value={listing.id} /><input type="hidden" name="fingerprint" value={listing.value ? listing.fingerprint : ""} />
          <p className="muted-copy">{decisionCopy(listing)}</p>
          <label className="field"><span>Note for the author</span><textarea name="note" required rows={2} maxLength={1000} placeholder="For example, the phone number in Beat 2 is a real customer’s. Remove it and we’ll restore the share." /></label>
          <div className="form-actions"><FormSubmitButton name="decision" value="RESTORE" label={listing.status === "HIDDEN" ? "Restore share" : "Dismiss reports"} pendingLabel="Saving…" /><FormSubmitButton name="decision" value="HIDE" label={listing.status === "HIDDEN" ? "Keep hidden" : listing.status === "LIVE" ? "Hide share" : "Uphold reports"} pendingLabel="Saving…" /></div>
        </ActionForm> : <p className="muted-copy">You can read reports. Deciding needs publishing permission.</p>}
      </article>) : <div className="admin-calm-state"><h2>{view === "hidden" ? "No hidden shares" : view === "reviewed" ? "No reviewed reports yet" : "Nothing to review"}</h2><p>Reported community shares and requests for another review appear here.</p></div>}
    </section>
  </div>;
}
