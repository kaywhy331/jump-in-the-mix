import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MixLibraryShell } from "@/components/MixLibraryShell";
import { MixWorkspace } from "@/components/MixWorkspace";
import { MixLibraryNav } from "@/components/MixLibraryNav";
import { AppIcon } from "@/components/AppIcon";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BrandTermsHelp } from "@/components/BrandTermsHelp";
import { MarketplaceNotices } from "@/components/MarketplaceShare";

export const metadata: Metadata = { title: "Mixes" };
type SearchParams = { mix?: string; view?: string; activate?: string; imported?: string; created?: string; updated?: string; activated?: string; paused?: string; archived?: string; error?: string; q?: string; status?: string; page?: string; favorites?: string };

export default async function MixesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams, { workspace, user, impersonation } = await requireWorkspace();
  const q = params.q?.trim().slice(0, 160) ?? "", favorites = params.favorites === "1";
  const status = ["ACTIVE", "PAUSED", "DRAFT"].includes(params.status ?? "") ? params.status as "ACTIVE" | "PAUSED" | "DRAFT" : "";
  const where: Prisma.MixWhereInput = { workspaceId: workspace.id, source: { not: "ONE_TIME" }, status: status || { not: "ARCHIVED" }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}), ...(favorites ? { favorites: { some: { workspaceId: workspace.id, userId: user.id } } } : {}) };
  const total = await prisma.mix.count({ where }), pageSize = 20, pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page) || 1)));
  const href = (patch: Record<string, string | undefined> = {}) => {
    const values: Record<string, string | undefined> = { q: q || undefined, status: status || undefined, favorites: favorites ? "1" : undefined, page: page > 1 ? String(page) : undefined, ...patch };
    const query = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))); return `/mixes${query.size ? `?${query}` : ""}`;
  };
  const mixes = await prisma.mix.findMany({ where, include: { steps: { where: { isActive: true }, select: { dayOffset: true, anchor: true }, orderBy: { sortOrder: "asc" } }, favorites: { where: { workspaceId: workspace.id, userId: user.id }, select: { id: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: pageSize, skip: (page - 1) * pageSize });
  const requested = params.mix ? await prisma.mix.findFirst({ where: { id: params.mix, workspaceId: workspace.id, status: { not: "ARCHIVED" }, source: { not: "ONE_TIME" } }, select: { id: true } }) : null;
  if (params.mix && !requested) notFound();
  const selected = requested?.id ?? mixes[0]?.id;
  return <div className="page mixes-page mix-workspace-page">
    {params.error && <Notice type="error">{params.error}</Notice>}
    <MarketplaceNotices workspaceId={workspace.id} />
    {(params.activated || params.paused || params.archived) && <Notice type="success">{params.activated ? "Mix started." : params.paused ? "Mix paused." : "Mix archived."}</Notice>}
    <MixLibraryShell selectedMixId={selected} explicitSelection={Boolean(params.mix)}>
      <aside className="mix-library-directory" aria-label="Mix library">
        <header className="mix-directory-header">
          <h1>Mixes</h1>
          <div className="mix-directory-actions">
            <BrandTermsHelp />
            <Link className="icon-button" href="/mixes/new?custom=1" aria-label="Create a mix" title="Create a mix"><AppIcon name="plus" /></Link>
            <Sheet trigger={<button className="icon-button" type="button" aria-label="More Mix tools" title="More Mix tools"><AppIcon name="more" /></button>} title="Mix tools">
              <nav className="contact-tools-links"><Link href="/templates"><AppIcon name="import" />Ready-made mixes</Link><Link href="/mixes/system"><AppIcon name="people" />My invitations</Link></nav>
            </Sheet>
          </div>
        </header>
        <nav className="mix-library-tabs" aria-label="Mix collection"><Link href="/mixes" aria-current="page"><AppIcon name="mixes" />My mixes</Link><Link href="/mixes/mega"><AppIcon name="journey" />Mega-Mixes</Link><Link href="/marketplace"><AppIcon name="store" />Marketplace</Link></nav>
        <Link className="mix-clear-filters" href="/templates/journeys"><AppIcon name="journey" />Choose a complete mega-mix</Link>
        <div className="mix-directory-search">
          <form className="mix-library-search" key={`${q}:${status}:${favorites}`} action="/mixes">
            <button className="icon-button" type="submit" aria-label="Search mixes"><AppIcon name="search" /></button><label className="sr-only" htmlFor="mix-search">Search mixes</label><input id="mix-search" type="search" name="q" defaultValue={q} placeholder="Search mixes" />
            {favorites && <input type="hidden" name="favorites" value="1" />}{status && <input type="hidden" name="status" value={status} />}
          </form>
          <Sheet trigger={<button className="icon-button" type="button" aria-label="Filter mixes" title="Filter mixes"><AppIcon name="filter" />{status && <span className="mix-filter-count">1</span>}</button>} title="Filter mixes" description="Choose filters, then apply them.">
            <form className="form-grid" action="/mixes"><input name="q" type="hidden" value={q} />{favorites && <input name="favorites" type="hidden" value="1" />}
              <label className="field full"><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="ACTIVE">On</option><option value="PAUSED">Paused</option><option value="DRAFT">Draft</option></select></label>
              <button className="button primary" type="submit"><AppIcon name="check" />Apply filters</button>
            </form>
          </Sheet>
        </div>
        <div className="mix-library-total"><span role="status">{total} {total === 1 ? "mix" : "mixes"}</span><Link className="mix-favorites-filter" href={href({ favorites: favorites ? undefined : "1", page: undefined })} aria-current={favorites ? "page" : undefined}><AppIcon name="heart" />Favorites</Link></div>
        {(q || status || favorites) && <Link className="mix-clear-filters" href="/mixes"><AppIcon name="close" />Clear filters</Link>}
        {mixes.length ? <MixLibraryNav showTabs={false} mixes={mixes.map(mix => ({ ...mix, favorite: mix.favorites.length > 0 }))} selected={selected} href={id => `${href({ mix: id })}#selected-mix`} canEdit={!impersonation} /> : <p className="muted-copy">{favorites ? "Favorite a Mix to find it here." : "No mixes found."}</p>}
        {pages > 1 && <nav className="mix-library-pagination" aria-label="Mix result pages">{page > 1 && <Link className="icon-button" href={href({ page: String(page - 1) })} aria-label="Previous mixes"><AppIcon name="arrowLeft" /></Link>}<span>{page} / {pages}</span>{page < pages && <Link className="icon-button" href={href({ page: String(page + 1) })} aria-label="Next mixes"><AppIcon name="arrowLeft" style={{ transform: "rotate(180deg)" }} /></Link>}</nav>}
      </aside>
      {selected ? <MixWorkspace key={selected} mixId={selected} embedded query={params} libraryHref={href({ mix: selected })} /> : <EmptyState title={q || status || favorites ? "No matching mixes" : "Create your first mix"} description={q || status || favorites ? "Try another search or clear your filters." : "Choose a ready-made mix or create your own."} actionHref={q || status || favorites ? "/mixes" : "/templates"} actionLabel={q || status || favorites ? "Clear filters" : "Browse ready-made mixes"} />}
    </MixLibraryShell>
  </div>;
}
