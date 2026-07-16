import type { Metadata } from "next";
import type { SharedMixReviewState, SharedMixStatus } from "@/generated/prisma/client";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES, normalizeSharedMixSteps, sharedMixContentIssue } from "@/lib/shared-mix";
import { createPlatformSharedMixAction, quickModerateSharedMixAction } from "@/lib/shared-mix-admin-actions";

export const metadata: Metadata = { title: "Admin · Mix Templates" };

type SearchParams = {
  q?: string;
  source?: string;
  status?: string;
  moderated?: string;
  error?: string;
};

function reviewStateFromStatus(status: SharedMixStatus): SharedMixReviewState {
  if (status === "APPROVED") return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  if (status === "UNPUBLISHED") return "UNPUBLISHED";
  return "PENDING";
}

export default async function AdminTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { user }] = await Promise.all([searchParams, requirePlatformAdmin()]);
  const workspaceId = user.memberships[0]?.workspaceId;
  const query = params.q?.trim() ?? "";
  const source = params.source === "platform" || params.source === "community" ? params.source : "all";
  const status = ["PENDING", "APPROVED", "REJECTED", "UNPUBLISHED", "FLAGGED"].includes(params.status ?? "") ? params.status as SharedMixReviewState : "";

  const [candidates, sourceMixes] = await Promise.all([
    prisma.sharedMix.findMany({
      where: query ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { industry: { contains: query, mode: "insensitive" } },
          { publisherWorkspace: { name: { contains: query, mode: "insensitive" } } }
        ]
      } : undefined,
      include: {
        publisherWorkspace: {
          select: {
            id: true,
            name: true,
            planTier: true,
            profile: { select: { company: true, industry: true } }
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 300
    }),
    workspaceId ? prisma.mix.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" }, steps: { some: { isActive: true } } },
      select: { id: true, name: true, category: true, industry: true, framework: true, description: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    }) : Promise.resolve([])
  ]);

  const ids = candidates.map((item) => item.id);
  const publisherIds = [...new Set(candidates.map((item) => item.publisherWorkspaceId).filter((item): item is string => Boolean(item)))];
  const [metadataRows, contributorProfiles] = await Promise.all([
    ids.length ? prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: ids } } }) : [],
    publisherIds.length ? prisma.sharedMixContributorProfile.findMany({ where: { workspaceId: { in: publisherIds } } }) : []
  ]);
  const metadataById = new Map(metadataRows.map((item) => [item.sharedMixId, item]));
  const contributorByWorkspace = new Map(contributorProfiles.map((item) => [item.workspaceId, item]));
  const templates = candidates.filter((item) => {
    const metadata = metadataById.get(item.id);
    const isPlatform = metadata?.isPlatform ?? item.publisherWorkspaceId === null;
    const reviewState = metadata?.reviewState ?? reviewStateFromStatus(item.status);
    if (source === "platform" && !isPlatform) return false;
    if (source === "community" && isPlatform) return false;
    return !status || reviewState === status;
  });
  templates.sort((left, right) => {
    const leftMetadata = metadataById.get(left.id);
    const rightMetadata = metadataById.get(right.id);
    const leftState = leftMetadata?.reviewState ?? reviewStateFromStatus(left.status);
    const rightState = rightMetadata?.reviewState ?? reviewStateFromStatus(right.status);
    const stateOrder: Record<SharedMixReviewState, number> = { PENDING: 0, FLAGGED: 1, APPROVED: 2, REJECTED: 3, UNPUBLISHED: 4 };
    return stateOrder[leftState] - stateOrder[rightState]
      || Number(Boolean(rightMetadata?.featuredAt)) - Number(Boolean(leftMetadata?.featuredAt))
      || right.updatedAt.getTime() - left.updatedAt.getTime();
  });

  const counts = templates.reduce((result, item) => {
    const state = metadataById.get(item.id)?.reviewState ?? reviewStateFromStatus(item.status);
    result[state] = (result[state] ?? 0) + 1;
    return result;
  }, {} as Record<string, number>);
  const platformCount = templates.filter((item) => metadataById.get(item.id)?.isPlatform ?? item.publisherWorkspaceId === null).length;

  return (
    <div className="page admin-template-page">
      {params.moderated && <Notice type="success">Template status updated to {params.moderated}.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Admin · Mix Templates</h1><p>Create official platform templates and moderate Community submissions without editing raw JSON.</p></div>
        <div className="page-actions">
          <Link className="button" href="/admin/users">Users</Link>
          <Link className="button" href="/admin/integrations">Integrations</Link>
          <Link className="button" href="/templates">Public library</Link>
        </div>
      </header>

      <div className="admin-template-metrics">
        <div className="card"><strong>{platformCount}</strong><span>Platform</span></div>
        <div className="card"><strong>{counts.PENDING ?? 0}</strong><span>Pending review</span></div>
        <div className="card"><strong>{counts.FLAGGED ?? 0}</strong><span>Flagged</span></div>
        <div className="card"><strong>{templates.reduce((sum, item) => sum + item.importCount, 0)}</strong><span>Total imports</span></div>
      </div>

      <section className="card admin-platform-template-builder">
        <div className="card-header"><div><h2>Create a Platform Mix Template</h2><p>Use a tested Mix from your administrator workspace as the validated source.</p></div></div>
        {workspaceId && sourceMixes.length ? (
          <form action={createPlatformSharedMixAction} className="form-grid">
            <div className="field full"><label htmlFor="sourceMixId">Source Mix</label><select id="sourceMixId" name="sourceMixId" required><option value="">Choose source Mix</option>{sourceMixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select></div>
            <div className="field full"><label htmlFor="title">Template title</label><input id="title" name="title" maxLength={160} required /></div>
            <div className="field full"><label htmlFor="description">Description</label><textarea id="description" name="description" minLength={20} maxLength={1200} required /></div>
            <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" required><option value="">Choose category</option>{MIX_TEMPLATE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="industry">Industry</label><select id="industry" name="industry" required><option value="">Choose industry</option>{MIX_TEMPLATE_INDUSTRIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field full"><label htmlFor="framework">Framework</label><input id="framework" name="framework" maxLength={160} /></div>
            <div className="form-actions field full"><button className="button primary" type="submit">Create official template</button></div>
          </form>
        ) : (
          <Notice type="info">Create at least one Mix with reusable Jumps in your administrator workspace before publishing a platform template.</Notice>
        )}
      </section>

      <form className="filter-bar admin-template-filter" method="get">
        <input name="q" defaultValue={query} placeholder="Search template, contributor, category, or industry" aria-label="Search Mix Templates" />
        <select name="source" defaultValue={source}><option value="all">All sources</option><option value="platform">Platform</option><option value="community">Community</option></select>
        <select name="status" defaultValue={status}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="FLAGGED">Flagged</option><option value="REJECTED">Rejected</option><option value="UNPUBLISHED">Unpublished</option></select>
        <button className="button" type="submit">Filter</button>
        {(query || source !== "all" || status) && <Link className="button" href="/admin/templates">Clear</Link>}
      </form>

      <div className="admin-template-list">
        {templates.map((template) => {
          const metadata = metadataById.get(template.id);
          const isPlatform = metadata?.isPlatform ?? template.publisherWorkspaceId === null;
          const reviewState = metadata?.reviewState ?? reviewStateFromStatus(template.status);
          const issue = sharedMixContentIssue(template.steps);
          const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
          const contributorProfile = template.publisherWorkspaceId ? contributorByWorkspace.get(template.publisherWorkspaceId) : null;
          const contributor = isPlatform
            ? "Jump in the Mix"
            : contributorProfile?.displayName || template.publisherWorkspace?.name || "Unknown contributor";
          return (
            <article className="card admin-template-card" key={template.id}>
              <div className="admin-template-heading">
                <div>
                  <div className="template-badges"><span className="status-pill">{isPlatform ? "Platform" : "Community"}</span><span className={`status-pill ${reviewState === "APPROVED" ? "done" : ""}`}>{reviewState.toLowerCase()}</span>{metadata?.featuredAt && <span className="status-pill done">Featured</span>}</div>
                  <h2>{template.title}</h2>
                  <p>{template.description}</p>
                  <small>{contributor} · v{metadata?.version ?? 1} · Updated {formatDate(template.updatedAt)} · {metadata?.voteCount ?? 0} votes · {template.importCount} imports</small>
                </div>
                <Link className="button small" href={`/admin/templates/${template.id}/edit`}>Edit & review</Link>
              </div>

              {!isPlatform && (
                <div className="admin-contributor-summary">
                  <strong>{contributor}</strong>
                  <span>{[contributorProfile?.title, template.publisherWorkspace?.profile?.company, template.publisherWorkspace?.profile?.industry].filter(Boolean).join(" · ") || template.publisherWorkspace?.planTier.toLowerCase()}</span>
                  {contributorProfile?.bio && <p>{contributorProfile.bio}</p>}
                  {contributorProfile?.website && <a href={contributorProfile.website} target="_blank" rel="nofollow noopener">Review website</a>}
                </div>
              )}

              {issue ? <Notice type="error">Invalid template content: {issue}</Notice> : (
                <SharedMixPreview title={template.title} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} durationDays={template.durationDays} steps={steps} />
              )}
              {metadata?.moderationNote && <Notice type={reviewState === "REJECTED" || reviewState === "FLAGGED" ? "error" : "info"}>{metadata.moderationNote}</Notice>}

              {!isPlatform && (
                <div className="admin-template-quick-actions">
                  {reviewState !== "APPROVED" && <form action={quickModerateSharedMixAction}><input type="hidden" name="sharedMixId" value={template.id} /><input type="hidden" name="status" value="APPROVED" /><button className="button small primary" type="submit">Approve</button></form>}
                  {reviewState !== "FLAGGED" && <form action={quickModerateSharedMixAction}><input type="hidden" name="sharedMixId" value={template.id} /><input type="hidden" name="status" value="FLAGGED" /><button className="button small" type="submit">Flag</button></form>}
                  {reviewState !== "REJECTED" && <details className="destructive-confirm"><summary className="button small danger">Reject…</summary><div className="destructive-confirm-panel"><form action={quickModerateSharedMixAction} className="form-stack"><input type="hidden" name="sharedMixId" value={template.id} /><input type="hidden" name="status" value="REJECTED" /><label>Reason<textarea name="moderationNote" minLength={10} maxLength={1200} required /></label><button className="button small danger" type="submit">Confirm rejection</button></form></div></details>}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!templates.length && <div className="empty-state"><h2>No Mix Templates found</h2><p>Clear the filters or publish the first official template from an administrator workspace Mix.</p></div>}
    </div>
  );
}
