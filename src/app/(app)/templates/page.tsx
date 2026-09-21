import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MixLibraryShell } from "@/components/MixLibraryShell";
import { ReadyMadeMixWorkspace } from "@/components/ReadyMadeMixWorkspace";
import { AppIcon } from "@/components/AppIcon";
import { MixFavoriteButton } from "@/components/MixFavoriteButton";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { Sheet } from "@/components/Sheet";
import { planGoalLabel, planGoalValues } from "@/lib/business-taxonomy";
import { ProfessionExamples } from "@/components/ProfessionExamples";
import { requireWorkspace } from "@/lib/auth";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixSteps, sharedMixContentIssue } from "@/lib/shared-mix";
import { salesPlanSearchIds } from "@/lib/sales-plan-library";

export const metadata: Metadata = { title: "Ready-made mixes" };
const PAGE_SIZE = 20;

type SearchParams = { mix?: string; favorites?: string; q?: string; category?: string; industry?: string; framework?: string; page?: string; error?: string };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace, user, impersonation }, configuredCategories, configuredIndustries, options] = await Promise.all([
    searchParams,
    requireWorkspace(),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries"),
    prisma.sharedMix.findMany({ where: { status: "APPROVED" }, select: { category: true, industry: true, framework: true }, distinct: ["category", "industry", "framework"] })
  ]);
  const categories = [...new Set([...configuredCategories, ...options.map(item => item.category)].map(planGoalLabel))];
  const industries = [...new Set([...configuredIndustries, ...options.flatMap(item => item.industry ? [item.industry] : [])])];
  const frameworks = [...new Set(options.flatMap(item => item.framework ? [item.framework] : []))].sort();
  const favorites = params.favorites === "1";
  const query = params.q?.trim().slice(0, 160) ?? "";
  const category = planGoalLabel(params.category?.trim() ?? "");
  const industry = params.industry?.trim() ?? "";
  const framework = params.framework?.trim() ?? "";
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const candidates = await prisma.sharedMix.findMany({
    where: {
      status: "APPROVED",
      ...(favorites ? { favorites: { some: { workspaceId: workspace.id, userId: user.id } } } : {}),
      ...(category ? { category: { in: planGoalValues(category) } } : {}),
      ...(industry ? { industry: { in: [...new Set([industry, "Any business"])] } } : {}),
      ...(framework ? { framework } : {}),
      ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { framework: { contains: query, mode: "insensitive" } }, { category: { contains: query, mode: "insensitive" } }, { industry: { contains: query, mode: "insensitive" } }, { id: { in: salesPlanSearchIds(query) } }] } : {})
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    include: { favorites: { where: { workspaceId: workspace.id, userId: user.id }, select: { id: true } } }
  });
  const metadataRows = candidates.length ? await prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: candidates.map((item) => item.id) } } }) : [];
  const metadataById = new Map(metadataRows.map((item) => [item.sharedMixId, item]));
  const templates = [...candidates].sort((left, right) => Number(Boolean(metadataById.get(right.id)?.featuredAt)) - Number(Boolean(metadataById.get(left.id)?.featuredAt)));
  const totalPages = Math.max(1, Math.ceil(templates.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = templates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const favoriteScope = { where: { workspaceId: workspace.id, userId: user.id }, select: { id: true } };
  const selected = params.mix
    ? candidates.find(template => template.id === params.mix) ?? await prisma.sharedMix.findFirst({ where: { id: params.mix, status: "APPROVED" }, include: { favorites: favoriteScope } })
    : visible[0];
  if (params.mix && !selected) notFound();
  const [selectedMetadata, copies] = selected ? await Promise.all([
    metadataById.get(selected.id) ?? prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: selected.id } }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, source: `SHARED_MIX:${selected.id}`, status: { not: "ARCHIVED" } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 5, select: { id: true, name: true, status: true } })
  ]) : [null, []];
  const href = (patch: Partial<SearchParams> = {}) => {
    const values: SearchParams = { q: query || undefined, category: category || undefined, industry: industry || undefined, framework: framework || undefined, favorites: favorites ? "1" : undefined, page: currentPage > 1 ? String(currentPage) : undefined, ...patch };
    const search = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/templates${search.size ? `?${search}` : ""}`;
  };
  const filterCount = [category, industry, framework].filter(Boolean).length;

  return <div className="page mix-workspace-page ready-made-workspace">
    {params.error && <Notice type="error">{params.error}</Notice>}
    <MixLibraryShell selectedMixId={selected?.id} explicitSelection={Boolean(params.mix)}>
      <aside className="mix-library-directory" aria-label="Ready-made Mix library">
        <header className="mix-directory-header"><h1>Mixes</h1><div className="mix-directory-actions">
          <Link className="icon-button" href="/mixes/new?custom=1" aria-label="Create your own" title="Create your own"><AppIcon name="plus" /></Link>
          <Sheet trigger={<button className="icon-button" type="button" aria-label="More ready-made Mix tools" title="More ready-made Mix tools"><AppIcon name="more" /></button>} title="Ready-made Mix tools">
            <nav className="contact-tools-links"><Link href="/mixes/system"><AppIcon name="people" />My invitations</Link></nav>
            <details className="workflow-options"><summary>Ideas for your business</summary><ProfessionExamples /></details>
            <details className="workflow-options"><summary>Browse by task</summary><nav className="contact-tools-links" aria-label="Choose a follow-up task">{[["Follow up a new lead", "lead"], ["Check an estimate", "estimate"], ["Reconnect with someone", "reconnect"]].map(([label, q]) => <Link href={`/templates?q=${q}`} key={q}>{label}</Link>)}<Link href="/templates">Browse all mixes</Link></nav></details>
          </Sheet>
        </div></header>
        <nav className="mix-library-tabs" aria-label="Mix collection"><Link href="/mixes"><AppIcon name="mixes" />My mixes</Link><Link href="/templates" aria-current="page"><AppIcon name="import" />Ready-made</Link></nav>
        <div className="mix-directory-search">
          <form className="mix-library-search" action="/templates" key={`${query}:${category}:${industry}:${framework}:${favorites}`}>
            <button className="icon-button" type="submit" aria-label="Search ready-made mixes"><AppIcon name="search" /></button><label className="sr-only" htmlFor="ready-made-search">Search ready-made mixes</label><input id="ready-made-search" name="q" type="search" defaultValue={query} placeholder="Search mixes" />
            {favorites && <input name="favorites" type="hidden" value="1" />}{category && <input name="category" type="hidden" value={category} />}{industry && <input name="industry" type="hidden" value={industry} />}{framework && <input name="framework" type="hidden" value={framework} />}
          </form>
          <Sheet trigger={<button className="icon-button" type="button" aria-label="Filter ready-made mixes" title="Filter ready-made mixes"><AppIcon name="filter" />{filterCount > 0 && <span className="mix-filter-count">{filterCount}</span>}</button>} title="Filter ready-made mixes">
            <form className="form-grid" action="/templates" key={`${category}:${industry}:${framework}`}><input name="q" type="hidden" value={query} />{favorites && <input name="favorites" type="hidden" value="1" />}
              <label className="field full"><span>Goal</span><select name="category" defaultValue={category} aria-label="Filter by goal"><option value="">Every goal</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="field full"><span>Business type</span><select name="industry" defaultValue={industry} aria-label="Filter by business type"><option value="">Every business type</option>{industries.map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="field full"><span>Approach</span><select name="framework" defaultValue={framework} aria-label="Filter by approach"><option value="">Every approach</option>{frameworks.map(item => <option key={item} value={item}>{item === "Ready-made" ? "Everyday follow-up" : item}</option>)}</select></label>
              <button className="button primary" type="submit"><AppIcon name="check" />Apply filters</button>
            </form>
          </Sheet>
        </div>
        <div className="mix-library-total"><span role="status">{templates.length} {templates.length === 1 ? "mix" : "mixes"}</span><Link className="mix-favorites-filter" href={href({ favorites: favorites ? undefined : "1", page: undefined })} aria-current={favorites ? "page" : undefined}><AppIcon name="heart" />Favorites</Link></div>
        {(query || filterCount || favorites) && <Link className="mix-clear-filters" href="/templates"><AppIcon name="close" />Clear filters</Link>}
        {industry && industry !== "Any business" && <p className="ready-made-directory-note">Includes mixes for any business.</p>}
        {visible.length ? <nav className="mix-library-nav" aria-label="Ready-made mixes">{visible.map(template => {
          const issue = sharedMixContentIssue(template.steps), steps = issue ? [] : normalizeSharedMixSteps(template.steps);
          return <div className="mix-library-row" key={template.id}>
            <Link className="mix-library-item" href={`${href({ mix: template.id })}#selected-mix`} aria-current={selected?.id === template.id ? "page" : undefined}>
              <span className="mix-row-icon" aria-hidden="true"><AppIcon name="mixes" /></span><span className="mix-row-copy"><strong>{template.title}</strong><small>{issue ? "Being updated" : `${steps.length} ${steps.length === 1 ? "Beat" : "Beats"} · ${planGoalLabel(template.category)}`}</small></span>
            </Link><MixFavoriteButton target={{ kind: "template", id: template.id }} name={template.title} initial={template.favorites.length > 0} canEdit={!impersonation} />
          </div>;
        })}</nav> : <p className="muted-copy">{favorites ? "Favorite a Mix to find it here." : "No mixes found."}</p>}
        {totalPages > 1 && <nav className="mix-library-pagination" aria-label="Ready-made mix result pages">{currentPage > 1 && <Link className="icon-button" href={href({ page: String(currentPage - 1) })} aria-label="Previous ready-made mixes"><AppIcon name="arrowLeft" /></Link>}<span>{currentPage} / {totalPages}</span>{currentPage < totalPages && <Link className="icon-button" href={href({ page: String(currentPage + 1) })} aria-label="Next ready-made mixes"><AppIcon name="arrowLeft" style={{ transform: "rotate(180deg)" }} /></Link>}</nav>}
      </aside>
      {selected ? <ReadyMadeMixWorkspace key={selected.id} template={selected} metadata={selectedMetadata} copies={copies} canUse={!impersonation} /> : <EmptyState title={favorites ? "No favorite mixes yet" : "No mixes match"} description={favorites ? "Use the heart beside a Mix to keep it here." : "Try another search or clear your filters."} actionHref="/templates" actionLabel="Browse ready-made mixes" />}
    </MixLibraryShell>
  </div>;
}
