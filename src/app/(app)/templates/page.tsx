import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { requireWorkspace } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  MIX_TEMPLATE_CATEGORIES,
  MIX_TEMPLATE_INDUSTRIES,
  normalizeSharedMixSteps,
  sharedMixContentIssue,
  sharedMixTrendingScore
} from "@/lib/shared-mix";
import { importSharedMixAction, toggleSharedMixVoteAction } from "@/lib/shared-mix-actions";

export const metadata: Metadata = { title: "Mix Templates" };

type SearchParams = {
  source?: string;
  q?: string;
  category?: string;
  industry?: string;
  sort?: string;
  voted?: string;
  unvoted?: string;
  error?: string;
};

function sourceValue(value: string | undefined): "platform" | "community" {
  return value === "community" ? "community" : "platform";
}

function sortValue(value: string | undefined): "featured" | "trending" | "popular" | "newest" {
  if (["trending", "popular", "newest"].includes(value ?? "")) return value as "trending" | "popular" | "newest";
  return "featured";
}

function returnTo(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const key of ["source", "q", "category", "industry", "sort"] as const) {
    const value = params[key]?.trim();
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `/templates?${suffix}` : "/templates";
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]?.toUpperCase()).join("") || "JM";
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const source = sourceValue(params.source);
  const sort = sortValue(params.sort);
  const query = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const industry = params.industry?.trim() ?? "";

  const templates = await prisma.sharedMix.findMany({
    where: {
      status: "APPROVED",
      isPlatform: source === "platform",
      ...(category ? { category } : {}),
      ...(industry ? { industry } : {}),
      ...(query ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { framework: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { industry: { contains: query, mode: "insensitive" } }
        ]
      } : {})
    },
    include: {
      publisherWorkspace: {
        select: {
          id: true,
          name: true,
          profile: {
            select: {
              communityProfileEnabled: true,
              communityDisplayName: true,
              communityTitle: true,
              communityBio: true,
              communityAvatarUrl: true,
              communityWebsite: true,
              company: true,
              industry: true
            }
          }
        }
      }
    },
    orderBy: sort === "newest"
      ? [{ publishedAt: "desc" }, { createdAt: "desc" }]
      : sort === "popular"
        ? [{ importCount: "desc" }, { voteCount: "desc" }, { publishedAt: "desc" }]
        : [{ featuredAt: "desc" }, { voteCount: "desc" }, { importCount: "desc" }, { publishedAt: "desc" }],
    take: 100
  });

  if (sort === "trending") {
    templates.sort((left, right) => sharedMixTrendingScore(right) - sharedMixTrendingScore(left));
  }

  const templateIds = templates.map((item) => item.id);
  const [votes, imports] = templateIds.length ? await Promise.all([
    prisma.sharedMixVote.findMany({
      where: { workspaceId: workspace.id, sharedMixId: { in: templateIds } },
      select: { sharedMixId: true }
    }),
    prisma.sharedMixImport.findMany({
      where: { workspaceId: workspace.id, sharedMixId: { in: templateIds } },
      select: { sharedMixId: true, sharedMixVersion: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    })
  ]) : [[], []];
  const votedIds = new Set(votes.map((item) => item.sharedMixId));
  const importsById = new Map<string, { count: number; latestVersion: number }>();
  for (const item of imports) {
    const current = importsById.get(item.sharedMixId);
    importsById.set(item.sharedMixId, {
      count: (current?.count ?? 0) + 1,
      latestVersion: Math.max(current?.latestVersion ?? 0, item.sharedMixVersion)
    });
  }
  const currentReturnTo = returnTo(params);

  return (
    <div className="page mix-template-page">
      {params.voted && <Notice type="success">Your vote was added.</Notice>}
      {params.unvoted && <Notice type="info">Your vote was removed.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div>
          <h1>Mix Templates</h1>
          <p>Preview complete Jump sequences, then import a clean Draft you can customize before activation.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/mixes">My Mixes</Link>
          <Link className="button primary" href="/mixes/new">Create my own</Link>
        </div>
      </header>

      <div className="template-source-tabs" role="tablist" aria-label="Mix Template source">
        <Link className={source === "platform" ? "button primary" : "button"} href="/templates?source=platform">Jump in the Mix</Link>
        <Link className={source === "community" ? "button primary" : "button"} href="/templates?source=community">Community</Link>
      </div>

      <form className="filter-bar template-filter-bar" method="get">
        <input type="hidden" name="source" value={source} />
        <input name="q" defaultValue={query} placeholder="Search outcome, situation, framework, or phrase" aria-label="Search Mix Templates" />
        <select name="category" defaultValue={category} aria-label="Filter by category">
          <option value="">All categories</option>
          {MIX_TEMPLATE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select name="industry" defaultValue={industry} aria-label="Filter by industry">
          <option value="">All industries</option>
          {MIX_TEMPLATE_INDUSTRIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort Mix Templates">
          <option value="featured">Featured</option>
          <option value="trending">Trending</option>
          <option value="popular">Most imported</option>
          <option value="newest">Newest</option>
        </select>
        <button className="button" type="submit">Apply</button>
        {(query || category || industry || sort !== "featured") && <Link className="button" href={`/templates?source=${source}`}>Clear</Link>}
      </form>

      {templates.length ? (
        <div className="mix-template-grid">
          {templates.map((template) => {
            const issue = sharedMixContentIssue(template.steps);
            const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
            const imported = importsById.get(template.id);
            const voted = votedIds.has(template.id);
            const profile = template.publisherWorkspace?.profile;
            const contributorName = profile?.communityProfileEnabled
              ? profile.communityDisplayName || template.publisherWorkspace?.name || "Community contributor"
              : "Community contributor";
            const contributorSubtitle = [profile?.communityTitle, profile?.company].filter(Boolean).join(" · ");
            const ownsTemplate = template.publisherWorkspaceId === workspace.id;

            return (
              <article className="card mix-template-card" key={template.id}>
                <div className="mix-template-card-heading">
                  <div>
                    <div className="template-badges">
                      <span className="status-pill">{template.category}</span>
                      {template.industry && <span className="status-pill">{template.industry}</span>}
                      {template.featuredAt && <span className="status-pill done">Featured</span>}
                    </div>
                    <h2>{template.title}</h2>
                    <p>{template.description}</p>
                  </div>
                  <div className="template-score" aria-label={`${template.voteCount} votes and ${template.importCount} imports`}>
                    <span>♥ {template.voteCount}</span>
                    <span>⇩ {template.importCount}</span>
                  </div>
                </div>

                {!template.isPlatform && (
                  <div className="template-contributor">
                    {profile?.communityAvatarUrl ? (
                      <img src={profile.communityAvatarUrl} alt="" width={44} height={44} loading="lazy" />
                    ) : (
                      <span className="template-contributor-avatar" aria-hidden="true">{initials(contributorName)}</span>
                    )}
                    <span><strong>{contributorName}</strong><small>{contributorSubtitle || profile?.industry || "Jump in the Mix community"}</small></span>
                  </div>
                )}

                {issue ? (
                  <Notice type="error">This template is temporarily unavailable: {issue}</Notice>
                ) : (
                  <SharedMixPreview
                    title={template.title}
                    triggerMode={template.triggerMode}
                    dateTypeName={template.dateTypeName}
                    durationDays={template.durationDays}
                    steps={steps}
                  />
                )}

                {profile?.communityProfileEnabled && (profile.communityBio || profile.communityWebsite) && (
                  <details className="template-profile-details">
                    <summary>About the contributor</summary>
                    {profile.communityBio && <p>{profile.communityBio}</p>}
                    {profile.communityWebsite && <p><a href={profile.communityWebsite} rel="nofollow noopener" target="_blank">Visit contributor website</a></p>}
                  </details>
                )}

                <div className="mix-template-card-footer">
                  {!ownsTemplate && (
                    <form action={toggleSharedMixVoteAction}>
                      <input type="hidden" name="sharedMixId" value={template.id} />
                      <input type="hidden" name="returnTo" value={currentReturnTo} />
                      <button className={voted ? "button small primary" : "button small"} type="submit" aria-pressed={voted}>{voted ? "♥ Voted" : "♡ Vote"}</button>
                    </form>
                  )}
                  {ownsTemplate && template.publisherMixId && <Link className="button small" href={`/mixes/${template.publisherMixId}/share`}>Manage sharing</Link>}
                  {!issue && !ownsTemplate && !imported && (
                    <form action={importSharedMixAction}>
                      <input type="hidden" name="sharedMixId" value={template.id} />
                      <input type="hidden" name="returnTo" value={currentReturnTo} />
                      <button className="button small primary" type="submit">Import Draft</button>
                    </form>
                  )}
                  {!issue && !ownsTemplate && imported && (
                    <details className="template-reimport-confirm">
                      <summary className="button small">Imported {imported.count}×</summary>
                      <div className="destructive-confirm-panel">
                        <p>You previously imported version {imported.latestVersion}. Import another independent Draft?</p>
                        <form action={importSharedMixAction}>
                          <input type="hidden" name="sharedMixId" value={template.id} />
                          <input type="hidden" name="returnTo" value={currentReturnTo} />
                          <button className="button small primary" type="submit">Import another Draft</button>
                        </form>
                      </div>
                    </details>
                  )}
                </div>
                <small className="template-updated">Version {template.version} · Updated {formatDate(template.updatedAt)}</small>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={source === "platform" ? "No platform templates match" : "No approved community templates match"}
          description="Try clearing a filter or searching for a broader outcome."
          actionHref={`/templates?source=${source}`}
          actionLabel="Clear filters"
        />
      )}
    </div>
  );
}
