import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm } from "@/components/ActionForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Notice } from "@/components/Notice";
import { PortableOutline } from "@/components/PortableOutline";
import { reasonLabel } from "@/lib/marketplace";
import { reviewListingAction } from "@/lib/marketplace-actions";
import { exportMegaMixPipeline, exportSingleMix } from "@/lib/mega-mix-pipeline-service";

export const metadata: Metadata = { title: "Admin · Community reports" };
const TABS = [{ value: "", label: "Needs review" }, { value: "hidden", label: "Hidden" }, { value: "reviewed", label: "Reviewed" }] as const;
/** What each decision does depends on where the share stands; a share the author stopped is never re-shared by staff. */
const decisionCopy = (status: string) => status === "HIDDEN" ? "Hidden now. Restoring puts it back on the Marketplace; keeping it hidden upholds the reports."
  : status === "LIVE" ? "Still shared. Dismissing closes the reports and keeps it shared; hiding takes it down until it is restored."
  : "The author stopped sharing this. Either decision only closes the reports; it stays unshared until the author shares it again.";

/** Staff review of reported community shares. The shared wording is public; reporters stay anonymous to authors. */
export default async function AdminMarketplacePage({ searchParams }: { searchParams: Promise<{ view?: string; reviewed?: string }> }) {
  const [{ staff }, query] = await Promise.all([requirePlatformAdmin("mixes.edit"), searchParams]);
  const canDecide = hasAdminPermission(staff, "mixes.publish");
  const view = TABS.some(tab => tab.value === query.view) ? query.view! : "";
  const where = view === "hidden" ? { status: "HIDDEN" as const } : view === "reviewed" ? { reports: { some: { status: { not: "OPEN" as const } }, none: { status: "OPEN" as const } } } : { reports: { some: { status: "OPEN" as const } } };
  const [listings, counts] = await Promise.all([
    prisma.marketplaceListing.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 50, include: {
      workspace: { select: { name: true, marketplaceAuthor: { select: { publicName: true } } } },
      reports: { orderBy: { createdAt: "desc" }, take: 20 }, _count: { select: { favorites: true, imports: true } } } }),
    Promise.all([prisma.marketplaceListing.count({ where: { reports: { some: { status: "OPEN" } } } }), prisma.marketplaceListing.count({ where: { status: "HIDDEN" } })])
  ]);
  const content = await Promise.all(listings.map(listing => (listing.kind === "MIX" && listing.mixId ? exportSingleMix(prisma, listing.workspaceId, listing.mixId) : listing.pipelineId ? exportMegaMixPipeline(prisma, listing.workspaceId, listing.pipelineId) : Promise.reject(new Error("missing"))).then(result => result.package).catch(() => null)));
  return <div className="page admin-library-page admin-marketplace-page">
    <header className="page-header"><div><h1>Community reports</h1><p>A private-information report from a verified account hides a share at once; every other report keeps it visible until you decide. Authors see the reason and your note, never who reported.</p></div></header>
    {query.reviewed && <Notice type="success">Decision saved. The author can see it on their share.</Notice>}
    <nav className="admin-content-tabs" aria-label="Report status">{TABS.map(tab => <Link key={tab.value} href={tab.value ? `/admin/marketplace?view=${tab.value}` : "/admin/marketplace"} aria-current={view === tab.value ? "page" : undefined}>{tab.label}{tab.value === "" ? ` (${counts[0]})` : tab.value === "hidden" ? ` (${counts[1]})` : ""}</Link>)}</nav>
    <section className="admin-panel" aria-label="Reported shares">
      {listings.length ? listings.map((listing, index) => <article className="admin-marketplace-row" key={listing.id}>
        <header><h2>{listing.title}</h2><span className={`admin-content-status ${listing.status === "LIVE" ? "published" : ""}`}>{listing.status === "LIVE" ? "Shared" : listing.status === "HIDDEN" ? `Hidden · ${reasonLabel(listing.hiddenReason ?? "OTHER")}` : "Not shared"}</span></header>
        <p className="muted-copy">{listing.kind === "MIX" ? "Mix" : "Mega-Mix"} by {listing.workspace.marketplaceAuthor?.publicName ?? listing.workspace.name} · {listing.beatCount} Beats · {listing._count.favorites} {listing._count.favorites === 1 ? "favorite" : "favorites"} · added {listing._count.imports} {listing._count.imports === 1 ? "time" : "times"}</p>
        <ul className="marketplace-reports">{listing.reports.map(report => <li key={report.id}><strong>{reasonLabel(report.reason)}{report.autoHidden ? " · hid the share" : ""}</strong><small>{report.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {report.status.toLowerCase()}</small>{report.details && <p>{report.details}</p>}{report.reviewNote && <p><em>Note: {report.reviewNote}</em></p>}</li>)}</ul>
        <details className="admin-marketplace-content"><summary>Read the shared wording</summary>{content[index] ? <PortableOutline value={content[index]!} label={`${listing.title} Beats`} /> : <p>The author removed or emptied this since it was reported.</p>}</details>
        {canDecide ? <ActionForm action={reviewListingAction} className="form-stack admin-marketplace-decision">
          <input type="hidden" name="listingId" value={listing.id} />
          <p className="muted-copy">{decisionCopy(listing.status)}</p>
          <label className="field"><span>Note for the author</span><textarea name="note" required rows={2} maxLength={1000} placeholder="For example, the phone number in Beat 2 is a real customer’s. Remove it and we’ll restore the share." /></label>
          <div className="form-actions"><FormSubmitButton name="decision" value="RESTORE" label={listing.status === "HIDDEN" ? "Restore share" : "Dismiss reports"} pendingLabel="Saving…" /><FormSubmitButton name="decision" value="HIDE" label={listing.status === "HIDDEN" ? "Keep hidden" : listing.status === "LIVE" ? "Hide share" : "Uphold reports"} pendingLabel="Saving…" /></div>
        </ActionForm> : <p className="muted-copy">You can read reports. Deciding needs publishing permission.</p>}
      </article>) : <div className="admin-calm-state"><h2>{view === "hidden" ? "No hidden shares" : view === "reviewed" ? "No reviewed reports yet" : "No reports to review"}</h2><p>Reported community shares appear here.</p></div>}
    </section>
  </div>;
}
