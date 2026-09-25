import type { Metadata } from "next";
import Link from "next/link";
import { MixLibraryShell } from "@/components/MixLibraryShell";
import { AppIcon } from "@/components/AppIcon";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { Sheet } from "@/components/Sheet";
import { BrandTermsHelp } from "@/components/BrandTermsHelp";
import { MixFavoriteButton } from "@/components/MixFavoriteButton";
import { PortableOutline } from "@/components/PortableOutline";
import { AddFromMarketplaceForm, ListingFavoriteButton, ReportSheet } from "@/components/MarketplaceControls";
import { requireWorkspace } from "@/lib/auth";
import { getPlatformStringList } from "@/lib/platform-settings";
import { formatDateTime } from "@/lib/format";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { MARKETPLACE_CHANNELS, MARKETPLACE_SIZES, reasonLabel } from "@/lib/marketplace";
import { markReportsSeenAction } from "@/lib/marketplace-actions";
import { readMarketplace, readMarketplaceItem, type MarketplaceFilters } from "@/lib/marketplace-service";
import { portableFingerprint, portableSummary } from "@/lib/mix-portable";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Marketplace" };
type SearchParams = { section?: string; kind?: string; q?: string; industry?: string; channel?: string; size?: string; sort?: string; favorites?: string; page?: string; item?: string; shared?: string; unshared?: string; reported?: string };
const PAGE_SIZE = 20;
const channelName = (value: string) => MARKETPLACE_CHANNELS.find(item => item.value === value)?.label ?? value;

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace, user, impersonation }, industries] = await Promise.all([searchParams, requireWorkspace(), getPlatformStringList("mix.industries")]);
  const display = await displayPreferencesForUser(user.id);
  const section: MarketplaceFilters["section"] = params.section === "community" || params.section === "mine" ? params.section : "official";
  const filters: MarketplaceFilters = {
    section, kind: params.kind === "MIX" || params.kind === "MEGA_MIX" ? params.kind : "", q: params.q?.trim().slice(0, 160) ?? "",
    industry: params.industry?.trim().slice(0, 120) ?? "", channel: MARKETPLACE_CHANNELS.some(item => item.value === params.channel) ? params.channel! : "",
    size: MARKETPLACE_SIZES.some(item => item.value === params.size) ? params.size! : "", sort: params.sort === "newest" || params.sort === "added" ? params.sort : "popular", favorites: params.favorites === "1"
  };
  const requestedPage = Math.max(1, Math.floor(Number(params.page) || 1));
  const viewer = { userId: user.id, workspaceId: workspace.id };
  const [{ rows, total }, myShares, openReports] = await Promise.all([
    readMarketplace(filters, viewer, requestedPage, PAGE_SIZE),
    prisma.marketplaceListing.count({ where: { workspaceId: workspace.id } }),
    prisma.marketplaceReport.count({ where: { authorSeenAt: null, listing: { workspaceId: workspace.id } } })
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(requestedPage, pages);
  const href = (patch: Partial<SearchParams> = {}) => {
    const values: SearchParams = { section: section === "official" ? undefined : section, kind: filters.kind || undefined, q: filters.q || undefined, industry: filters.industry || undefined, channel: filters.channel || undefined,
      size: filters.size || undefined, sort: filters.sort === "popular" ? undefined : filters.sort, favorites: filters.favorites ? "1" : undefined, page: page > 1 ? String(page) : undefined, ...patch };
    const search = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/marketplace${search.size ? `?${search}` : ""}`;
  };
  const selectedKey = params.item ?? rows[0]?.id.replace(/^(?![a-z]+:)/, "listing:");
  const item = selectedKey ? await readMarketplaceItem(selectedKey.slice(0, 200), viewer) : null;
  const filterCount = [filters.industry, filters.channel, filters.size, filters.sort !== "popular" ? filters.sort : ""].filter(Boolean).length;
  const facts = item?.value ? portableSummary(item.value) : null;
  const channels = item?.value ? [...new Set(item.value.mixes.flatMap(mix => mix.steps.map(step => step.channel === "EMAIL" ? "EMAIL" : step.channel === "PHONE_CALL" || step.channel === "VOICEMAIL" ? "CALL" : "TEXT")))].map(channelName).join(", ") : "";
  const kindLabel = (kind: "MIX" | "MEGA_MIX") => kind === "MIX" ? "Mix" : "Mega-Mix";
  const itemKind = item ? item.type === "official-mega" ? "MEGA_MIX" : item.type === "official-mix" ? "MIX" : item.listing.kind : "MIX";

  return <div className="page mix-workspace-page marketplace-page">
    {params.shared && <Notice type="success">Shared. People see your latest saved version, and your edits appear as soon as you save them.</Notice>}
    {params.unshared && <Notice type="success">Sharing stopped. Copies people already added stay theirs.</Notice>}
    {params.reported && <Notice type="success">{params.reported === "hidden" ? "Thanks. The share is hidden while our team reviews it." : "Thanks. Our team will review this share."}</Notice>}
    <MixLibraryShell selectedMixId={item ? selectedKey : undefined} explicitSelection={Boolean(params.item)}>
      <aside className="mix-library-directory" aria-label="Marketplace">
        <header className="mix-directory-header"><h1>Mixes</h1><div className="mix-directory-actions"><BrandTermsHelp /></div></header>
        <nav className="mix-library-tabs" aria-label="Mix collection"><Link href="/mixes"><AppIcon name="mixes" />My mixes</Link><Link href="/mixes/mega"><AppIcon name="journey" />Mega-Mixes</Link><Link href="/marketplace" aria-current="page"><AppIcon name="store" />Marketplace</Link></nav>
        <nav className="marketplace-sections" aria-label="Marketplace section">
          <Link href="/marketplace" aria-current={section === "official" ? "page" : undefined}>Jump in the Mix</Link>
          <Link href="/marketplace?section=community" aria-current={section === "community" ? "page" : undefined}>Community</Link>
          <Link href="/marketplace?section=mine" aria-current={section === "mine" ? "page" : undefined}>My shares{openReports > 0 ? <span className="marketplace-alert" aria-label={`${openReports} new ${openReports === 1 ? "report" : "reports"}`}>{openReports}</span> : myShares ? <span className="marketplace-count">{myShares}</span> : null}</Link>
        </nav>
        <nav className="marketplace-kinds" aria-label="Show">{([["", "All"], ["MIX", "Mixes"], ["MEGA_MIX", "Mega-Mixes"]] as const).map(([value, label]) => <Link key={value} href={href({ kind: value || undefined, page: undefined, item: undefined })} aria-current={filters.kind === value ? "true" : undefined}>{label}</Link>)}</nav>
        <div className="mix-directory-search">
          <form className="mix-library-search" action="/marketplace" key={`${filters.q}:${section}`}>
            <button className="icon-button" type="submit" aria-label="Search the Marketplace"><AppIcon name="search" /></button><label className="sr-only" htmlFor="marketplace-search">Search the Marketplace</label>
            <input id="marketplace-search" name="q" type="search" defaultValue={filters.q} placeholder={section === "community" ? "Search names, descriptions, authors" : "Search the Marketplace"} />
            {section !== "official" && <input type="hidden" name="section" value={section} />}{filters.kind && <input type="hidden" name="kind" value={filters.kind} />}{filters.favorites && <input type="hidden" name="favorites" value="1" />}
            {filters.industry && <input type="hidden" name="industry" value={filters.industry} />}{filters.channel && <input type="hidden" name="channel" value={filters.channel} />}{filters.size && <input type="hidden" name="size" value={filters.size} />}{filters.sort !== "popular" && <input type="hidden" name="sort" value={filters.sort} />}
          </form>
          <Sheet trigger={<button className="icon-button" type="button" aria-label="Filter and sort the Marketplace" title="Filter and sort"><AppIcon name="filter" />{filterCount > 0 && <span className="mix-filter-count">{filterCount}</span>}</button>} title="Filter and sort" description="Choose filters, then apply them.">
            <form className="form-grid" action="/marketplace" key={`${filters.industry}:${filters.channel}:${filters.size}:${filters.sort}`}>
              {section !== "official" && <input type="hidden" name="section" value={section} />}<input type="hidden" name="q" value={filters.q} />{filters.kind && <input type="hidden" name="kind" value={filters.kind} />}{filters.favorites && <input type="hidden" name="favorites" value="1" />}
              <label className="field full"><span>Business type</span><select name="industry" defaultValue={filters.industry}><option value="">Every business type</option>{industries.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className="field full"><span>Uses</span><select name="channel" defaultValue={filters.channel}><option value="">Any channel</option>{MARKETPLACE_CHANNELS.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
              <label className="field full"><span>Length</span><select name="size" defaultValue={filters.size}><option value="">Any length</option>{MARKETPLACE_SIZES.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
              <label className="field full"><span>Sort by</span><select name="sort" defaultValue={filters.sort}><option value="popular">Most favorited</option><option value="newest">Newest</option><option value="added">Most added</option></select></label>
              <button className="button primary" type="submit"><AppIcon name="check" />Apply filters</button>
            </form>
          </Sheet>
        </div>
        <div className="mix-library-total"><span role="status">{total} {total === 1 ? "result" : "results"}</span>{section !== "mine" && <Link className="mix-favorites-filter" href={href({ favorites: filters.favorites ? undefined : "1", page: undefined, item: undefined })} aria-current={filters.favorites ? "page" : undefined}><AppIcon name="heart" />Favorites</Link>}</div>
        {(filters.q || filterCount > 0 || filters.favorites || filters.kind) && <Link className="mix-clear-filters" href={section === "official" ? "/marketplace" : `/marketplace?section=${section}`}><AppIcon name="close" />Clear filters</Link>}
        {rows.length ? <nav className="mix-library-nav marketplace-list" aria-label={section === "official" ? "Jump in the Mix Mixes and Mega-Mixes" : section === "community" ? "Community Mixes and Mega-Mixes" : "Your shares"}>{rows.map(row => {
          const key = row.id.includes(":") ? row.id : `listing:${row.id}`;
          return <div className="mix-library-row" key={row.id}>
            {/* Shares are live, so a prefetched copy could show old wording or counts. */}<Link className="mix-library-item" prefetch={false} href={`${href({ item: key })}#selected-mix`} aria-current={selectedKey === key ? "page" : undefined}>
              <span className="mix-row-icon" aria-hidden="true"><AppIcon name={row.kind === "MIX" ? "mixes" : "journey"} /></span>
              <span className="mix-row-copy"><strong>{row.title}</strong><small>{kindLabel(row.kind)} · {row.kind === "MEGA_MIX" ? `${row.mixCount} Mixes · ` : ""}{row.beatCount} {row.beatCount === 1 ? "Beat" : "Beats"}{section === "community" ? ` · by ${row.author}` : ""}{section === "mine" ? ` · ${row.status === "LIVE" ? "shared" : row.status === "HIDDEN" ? "hidden for review" : "not shared"}${row.openReports ? ` · ${row.openReports} open ${row.openReports === 1 ? "report" : "reports"}` : ""}` : ""}</small></span>
            </Link>
            {row.section === "community" && row.favorites !== null && section !== "mine" ? <ListingFavoriteButton listingId={row.id} name={row.title} initial={row.favorite} count={row.favorites} canEdit={!impersonation} />
              : row.kind === "MIX" && row.section === "official" ? <MixFavoriteButton target={{ kind: "template", id: row.id.slice(4) }} name={row.title} initial={row.favorite} canEdit={!impersonation} /> : null}
          </div>;
        })}</nav> : <p className="muted-copy">{section === "mine" ? "Share a Mix or Mega-Mix from its page to see it here." : filters.favorites ? "Favorite something to find it here." : "Nothing matches. Try another search or clear your filters."}</p>}
        {pages > 1 && <nav className="mix-library-pagination" aria-label="Marketplace result pages">{page > 1 && <Link className="icon-button" href={href({ page: String(page - 1), item: undefined })} aria-label="Previous results"><AppIcon name="arrowLeft" /></Link>}<span>{page} / {pages}</span>{page < pages && <Link className="icon-button" href={href({ page: String(page + 1), item: undefined })} aria-label="Next results"><AppIcon name="arrowLeft" style={{ transform: "rotate(180deg)" }} /></Link>}</nav>}
      </aside>

      {item && item.value ? <div className="mix-edit-columns">
        <section id="selected-mix" className="mix-editor-workspace" aria-label={`Selected ${kindLabel(itemKind)}`}>
          <header className="mix-selected-header"><div><h2>{item.title}</h2><span className="status-pill">{kindLabel(itemKind)}</span></div>
            {item.type === "listing" && !item.own && <ListingFavoriteButton listingId={item.id} name={item.title} initial={item.favorite} count={item.favorites} canEdit={!impersonation} />}
          </header>
          <p className="marketplace-byline">{item.author === "Jump in the Mix" ? <><AppIcon name="check" />Made by Jump in the Mix</> : <>Shared by <strong>{item.author}</strong></>}{item.industry ? ` · ${item.industry}` : ""}</p>
          {item.type === "listing" && item.own && item.listing.status !== "LIVE" && <p className={`notice${item.listing.status === "HIDDEN" ? " error" : ""}`} role="status">{item.listing.status === "HIDDEN" ? `Hidden while our team reviews a report: ${reasonLabel(item.listing.hiddenReason ?? "OTHER")}. You can edit the wording; it stays in your account.` : "Not shared. Only you can see this page."}</p>}
          {item.summary && <p className="mix-selected-description">{item.summary}</p>}
          {facts && <p className="mega-mix-facts">{itemKind === "MEGA_MIX" ? `${facts.mixes} Mixes · ` : ""}{facts.beats} Beats{itemKind === "MEGA_MIX" ? ` · ${facts.connections} paths` : ""} · {channels}{"favorites" in item && item.favorites !== undefined ? ` · ${item.favorites} ${item.favorites === 1 ? "favorite" : "favorites"}` : ""}{"added" in item && item.added ? ` · added ${item.added} ${item.added === 1 ? "time" : "times"}` : ""}</p>}
          <PortableOutline value={item.value} label={`${item.title} Beats in journey order`} />
        </section>
        <aside className="mix-context-pane" aria-label="Add or share">
          {item.type === "official-mega" && <section><h3><AppIcon name="journey" />Add to your account</h3>{item.installed ? <p>Already in your account as <Link href={`/mixes/mega?megaMix=${encodeURIComponent(item.installed.id)}`}>{item.installed.name}</Link>.</p> : <p>Choose your working days and preferred channel, then review before anything is added.</p>}<Link className="button small" href={item.setupHref}><AppIcon name="plus" />{item.installed ? "Open setup" : "Set up this Mega-Mix"}</Link></section>}
          {item.type === "official-mix" && <section><h3><AppIcon name="mixes" />Add to your account</h3><p>Choose who it’s for and when it starts, then review before anything is added.</p><Link className="button small" href={item.setupHref}><AppIcon name="plus" />Set up this Mix</Link></section>}
          {item.type === "listing" && !item.own && <>
            <section><h3><AppIcon name="plus" />Add to your account</h3>
              {item.imports.length > 0 && <p className="muted-copy">You added this {formatDateTime(item.imports[0].createdAt.toISOString(), display)}.{item.imports[0].fingerprint !== item.listing.fingerprint ? " The author has updated it since. Your copy stays as it is; add this version to use the update." : ""}</p>}
              <AddFromMarketplaceForm listingId={item.id} fingerprint={portableFingerprint(item.value)} defaultName={item.title} kind={item.listing.kind} canEdit={!impersonation} />
            </section>
            <section><h3><AppIcon name="flag" />Something wrong?</h3>{!impersonation && <ReportSheet listingId={item.id} title={item.title} reported={item.reported} />}</section>
          </>}
          {item.type === "listing" && item.own && <>
            <section><h3><AppIcon name="share" />Your share</h3><p>{item.listing.status === "LIVE" ? "Shared. Everyone sees your latest saved version." : item.listing.status === "HIDDEN" ? "Hidden for review." : "Not shared."} {item.favorites} {item.favorites === 1 ? "favorite" : "favorites"} · added {item.added} {item.added === 1 ? "time" : "times"}.</p>
              <Link className="button small" href={item.listing.kind === "MIX" ? `/mixes?mix=${encodeURIComponent(item.listing.mixId ?? "")}#selected-mix` : `/mixes/mega?megaMix=${encodeURIComponent(item.listing.pipelineId ?? "")}`}><AppIcon name="edit" />Open to edit or manage sharing</Link></section>
            <section><h3><AppIcon name="flag" />Reports</h3>{item.reports.length ? <><ul className="marketplace-reports">{item.reports.map(report => <li key={report.id}><strong>{reasonLabel(report.reason)}</strong><small>{formatDateTime(report.createdAt.toISOString(), display)} · {report.status === "OPEN" ? report.autoHidden ? "hidden while we review" : "being reviewed" : report.status === "DISMISSED" ? (item.listing.status === "LIVE" ? "reviewed: shared" : "reviewed: report dismissed") : item.listing.status === "HIDDEN" ? "reviewed: share stays hidden" : "reviewed: report upheld"}</small>{report.details && <p>{report.details}</p>}{report.reviewNote && <p><em>Our team: {report.reviewNote}</em></p>}</li>)}</ul>
              {!impersonation && <form action={markReportsSeenAction}><input type="hidden" name="listingId" value={item.id} /><button className="button small" type="submit"><AppIcon name="check" />Mark as read</button></form>}</> : <p>No reports.</p>}</section>
          </>}
        </aside>
      </div> : <EmptyState title={section === "mine" ? "Nothing shared yet" : "Nothing to show"} description={section === "mine" ? "Open a Mix or Mega-Mix and choose Share. It appears here, with its favorites and any reports." : "Try another search or clear your filters."} actionHref={section === "mine" ? "/mixes/mega" : "/marketplace"} actionLabel={section === "mine" ? "Open Mega-Mixes" : "Browse the Marketplace"} />}
    </MixLibraryShell>
  </div>;
}
