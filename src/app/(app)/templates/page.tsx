import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { requireWorkspace } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getPlatformBoolean, getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixSteps, sharedMixContentIssue, sharedMixTrendingScore } from "@/lib/shared-mix";
import { toggleSharedMixVoteAction } from "@/lib/shared-mix-actions";

export const metadata: Metadata = { title: "Mix Templates" };
const PAGE_SIZE = 24;

type SearchParams = {
  source?: string;
  q?: string;
  category?: string;
  industry?: string;
  sort?: string;
  page?: string;
  voted?: string;
  unvoted?: string;
  error?: string;
};

function sourceValue(value: string | undefined): "platform" | "community" {
  return value === "community" ? "community" : "platform";
}

function sortValue(value: string | undefined): "featured" | "trending" | "popular" | "newest" {
  return ["trending", "popular", "newest"].includes(value ?? "") ? value as "trending" | "popular" | "newest" : "featured";
}

function returnTo(params: SearchParams, page?: number): string {
  const query = new URLSearchParams();
  for (const key of ["source", "q", "category", "industry", "sort"] as const) {
    const value = params[key]?.trim();
    if (value) query.set(key, value);
  }
  if ((page ?? Number(params.page ?? "1")) > 1) query.set("page", String(page ?? params.page));
  const suffix = query.toString();
  return suffix ? `/templates?${suffix}` : "/templates";
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]?.toUpperCase()).join("") || "JM";
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }, communityEnabled, categories, industries] = await Promise.all([
    searchParams,
    requireWorkspace(),
    getPlatformBoolean("feature.communityTemplates"),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries")
  ]);
  const requestedSource = sourceValue(params.source);
  const source = communityEnabled ? requestedSource : "platform";
  const sort = sortValue(params.sort);
  const query = params.q?.trim().slice(0, 160) ?? "";
  const category = params.category?.trim() ?? "";
  const industry = params.industry?.trim() ?? "";
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const candidates = await prisma.sharedMix.findMany({
    where: {
      status: "APPROVED",
      ...(category ? { category } : {}),
      ...(industry ? { industry } : {}),
      ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { framework: { contains: query, mode: "insensitive" } }, { category: { contains: query, mode: "insensitive" } }, { industry: { contains: query, mode: "insensitive" } }] } : {})
    },
    include: { publisherWorkspace: { select: { id: true, name: true, profile: { select: { company: true, industry: true } } } } },
    orderBy: [{ importCount: "desc" }, { updatedAt: "desc" }],
    take: 500
  });
  const candidateIds = candidates.map((item) => item.id);
  const publisherIds = [...new Set(candidates.map((item) => item.publisherWorkspaceId).filter((item): item is string => Boolean(item)))];
  const [metadataRows, contributorProfiles] = await Promise.all([
    candidateIds.length ? prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: candidateIds } } }) : [],
    publisherIds.length ? prisma.sharedMixContributorProfile.findMany({ where: { workspaceId: { in: publisherIds } } }) : []
  ]);
  const metadataById = new Map(metadataRows.map((item) => [item.sharedMixId, item]));
  const contributorByWorkspace = new Map(contributorProfiles.map((item) => [item.workspaceId, item]));
  const matching = candidates.filter((item) => {
    const metadata = metadataById.get(item.id);
    const isPlatform = metadata?.isPlatform ?? item.publisherWorkspaceId === null;
    return source === "platform" ? isPlatform : !isPlatform;
  });
  matching.sort((left, right) => {
    const leftMetadata = metadataById.get(left.id);
    const rightMetadata = metadataById.get(right.id);
    if (sort === "newest") return (rightMetadata?.publishedAt ?? right.createdAt).getTime() - (leftMetadata?.publishedAt ?? left.createdAt).getTime();
    if (sort === "popular") return right.importCount - left.importCount || (rightMetadata?.voteCount ?? 0) - (leftMetadata?.voteCount ?? 0);
    if (sort === "trending") return sharedMixTrendingScore({ voteCount: rightMetadata?.voteCount ?? 0, importCount: right.importCount, publishedAt: rightMetadata?.publishedAt ?? null, updatedAt: right.updatedAt }) - sharedMixTrendingScore({ voteCount: leftMetadata?.voteCount ?? 0, importCount: left.importCount, publishedAt: leftMetadata?.publishedAt ?? null, updatedAt: left.updatedAt });
    return Number(Boolean(rightMetadata?.featuredAt)) - Number(Boolean(leftMetadata?.featuredAt)) || (rightMetadata?.voteCount ?? 0) - (leftMetadata?.voteCount ?? 0) || right.importCount - left.importCount;
  });
  const totalPages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const templates = matching.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const templateIds = templates.map((item) => item.id);
  const [votes, imports] = templateIds.length ? await Promise.all([
    prisma.sharedMixVote.findMany({ where: { workspaceId: workspace.id, sharedMixId: { in: templateIds } }, select: { sharedMixId: true } }),
    prisma.sharedMixImport.findMany({ where: { workspaceId: workspace.id, sharedMixId: { in: templateIds } }, select: { id: true, sharedMixId: true, createdAt: true }, orderBy: { createdAt: "desc" } })
  ]) : [[], []];
  const importIds = imports.map((item) => item.id);
  const importMetadata = importIds.length ? await prisma.sharedMixImportMetadata.findMany({ where: { importId: { in: importIds } } }) : [];
  const importMetadataById = new Map(importMetadata.map((item) => [item.importId, item]));
  const votedIds = new Set(votes.map((item) => item.sharedMixId));
  const importsById = new Map<string, { count: number; latestVersion: number }>();
  for (const item of imports) {
    const current = importsById.get(item.sharedMixId);
    importsById.set(item.sharedMixId, { count: (current?.count ?? 0) + 1, latestVersion: Math.max(current?.latestVersion ?? 0, importMetadataById.get(item.id)?.sharedMixVersion ?? 1) });
  }
  const currentReturnTo = returnTo(params, currentPage);

  return (
    <div className="page mix-template-page">
      {params.voted && <Notice type="success">Saved to your template favorites.</Notice>}
      {params.unvoted && <Notice type="info">Removed from your template favorites.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      {!communityEnabled && requestedSource === "community" && <Notice type="info">Community Mix Templates are temporarily unavailable. Platform Templates remain available and existing records are preserved.</Notice>}
      <header className="page-header"><div><h1>Mix Templates</h1><p>Preview a complete sequence, then choose its name, audience, schedule, and activation state in one setup screen.</p></div><div className="page-actions"><Link className="button" href="/mixes">My Mixes</Link><Link className="button primary" href="/mixes/new">Create my own</Link></div></header>
      <div className="template-source-tabs" role="tablist" aria-label="Mix Template source"><Link className={source === "platform" ? "button primary" : "button"} href="/templates?source=platform">Jump in the Mix</Link>{communityEnabled ? <Link className={source === "community" ? "button primary" : "button"} href="/templates?source=community">Community</Link> : <span className="button" aria-disabled="true">Community unavailable</span>}</div>
      <form className="filter-bar template-filter-bar" method="get"><input type="hidden" name="source" value={source} /><input name="q" defaultValue={query} placeholder="Search outcome, situation, framework, or phrase" aria-label="Search Mix Templates" /><select name="category" defaultValue={category} aria-label="Filter by category"><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select><select name="industry" defaultValue={industry} aria-label="Filter by industry"><option value="">All industries</option>{industries.map((item) => <option key={item} value={item}>{item}</option>)}</select><select name="sort" defaultValue={sort} aria-label="Sort Mix Templates"><option value="featured">Featured</option><option value="trending">Trending</option><option value="popular">Most used</option><option value="newest">Newest</option></select><button className="button" type="submit">Apply</button>{(query || category || industry || sort !== "featured") && <Link className="button" href={`/templates?source=${source}`}>Clear</Link>}</form>
      <p className="sr-only" role="status" aria-live="polite">{matching.length} Mix Templates found. Showing page {currentPage} of {totalPages}.</p>

      {templates.length ? <div className="mix-template-grid">{templates.map((template) => {
        const metadata = metadataById.get(template.id);
        const isPlatform = metadata?.isPlatform ?? template.publisherWorkspaceId === null;
        const issue = sharedMixContentIssue(template.steps);
        const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
        const imported = importsById.get(template.id);
        const voted = votedIds.has(template.id);
        const contributorProfile = template.publisherWorkspaceId ? contributorByWorkspace.get(template.publisherWorkspaceId) : null;
        const contributorName = contributorProfile?.enabled ? contributorProfile.displayName || template.publisherWorkspace?.name || "Community contributor" : "Community contributor";
        const contributorSubtitle = [contributorProfile?.title, template.publisherWorkspace?.profile?.company].filter(Boolean).join(" · ");
        const ownsTemplate = template.publisherWorkspaceId === workspace.id;
        const voteCount = metadata?.voteCount ?? 0;
        const version = metadata?.version ?? 1;
        const updateAvailable = Boolean(imported && version > imported.latestVersion);
        return <article className="card mix-template-card" key={template.id}><div className="mix-template-card-heading"><div><div className="template-badges"><span className="status-pill">{template.category}</span>{template.industry && <span className="status-pill">{template.industry}</span>}{metadata?.featuredAt && <span className="status-pill done">Featured</span>}{updateAvailable && <span className="status-pill done">New version</span>}</div><h2>{template.title}</h2><p>{template.description}</p></div><div className="template-score" aria-label={`${voteCount} favorites and ${template.importCount} uses`}><span><AppIcon name="heart" /> {voteCount}</span><span><AppIcon name="import" /> {template.importCount}</span></div></div>{!isPlatform && <div className="template-contributor">{contributorProfile?.avatarUrl ? <img src={contributorProfile.avatarUrl} alt="" width={44} height={44} loading="lazy" /> : <span className="template-contributor-avatar" aria-hidden="true">{initials(contributorName)}</span>}<span><strong>{contributorName}</strong><small>{contributorSubtitle || template.publisherWorkspace?.profile?.industry || "Jump in the Mix community"}</small></span></div>}{issue ? <Notice type="error">This template is temporarily unavailable: {issue}</Notice> : <SharedMixPreview title={template.title} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} durationDays={template.durationDays} steps={steps} />}{contributorProfile?.enabled && (contributorProfile.bio || contributorProfile.website) && <details className="template-profile-details"><summary>About the contributor</summary>{contributorProfile.bio && <p>{contributorProfile.bio}</p>}{contributorProfile.website && <p><a href={contributorProfile.website} rel="nofollow noopener" target="_blank">Visit contributor website</a></p>}</details>}<div className="mix-template-card-footer">{!ownsTemplate && <form action={toggleSharedMixVoteAction}><input type="hidden" name="sharedMixId" value={template.id} /><input type="hidden" name="returnTo" value={currentReturnTo} /><button className={voted ? "button small primary" : "button small"} type="submit" aria-pressed={voted}><AppIcon name="heart" /> {voted ? "Saved" : "Save"}</button></form>}{ownsTemplate && metadata?.publisherMixId && <Link className="button small" href={`/mixes/${metadata.publisherMixId}/share`}>Manage sharing</Link>}{!issue && !ownsTemplate && <Link className="button small primary" href={`/templates/${template.id}/use`}>{updateAvailable ? "Use latest version" : imported ? "Use again" : "Use template"}</Link>}</div>{imported && <small>Previously used {imported.count}× · latest used version {imported.latestVersion}</small>}<small className="template-updated">Version {version} · Updated {formatDate(template.updatedAt)}</small></article>;
      })}</div> : <EmptyState title={source === "platform" ? "No platform templates match" : "No approved community templates match"} description="Try clearing a filter or searching for a broader outcome." actionHref={`/templates?source=${source}`} actionLabel="Clear filters" />}
      <nav className="pagination-bar" aria-label="Mix Template result pages"><span>{matching.length.toLocaleString()} templates</span><div className="page-actions">{currentPage > 1 && <Link className="button" href={returnTo(params, currentPage - 1)}>Previous</Link>}<span>Page {currentPage} of {totalPages}</span>{currentPage < totalPages && <Link className="button" href={returnTo(params, currentPage + 1)}>Next</Link>}</div></nav>
    </div>
  );
}
