import type { Metadata } from "next";
import type { SharedMixStatus } from "@/generated/prisma/client";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { requirePlatformAdmin } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  MIX_TEMPLATE_CATEGORIES,
  MIX_TEMPLATE_INDUSTRIES,
  normalizeSharedMixSteps,
  sharedMixContentIssue
} from "@/lib/shared-mix";
import { createPlatformSharedMixAction } from "@/lib/shared-mix-admin-actions";

export const metadata: Metadata = { title: "Admin · Ready-made plans" };

type SearchParams = {
  q?: string;
  status?: string;
  error?: string;
};

export default async function AdminTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { user }] = await Promise.all([searchParams, requirePlatformAdmin()]);
  const displayPreferences = await displayPreferencesForUser(user.id);
  const workspaceId = user.memberships[0]?.workspaceId;
  const query = params.q?.trim().slice(0, 160) ?? "";
  const status: SharedMixStatus | undefined = params.status === "APPROVED" || params.status === "UNPUBLISHED"
    ? params.status
    : undefined;

  const [templates, sourcePlans] = await Promise.all([
    prisma.sharedMix.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(query ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
            { industry: { contains: query, mode: "insensitive" } }
          ]
        } : {})
      },
      orderBy: { updatedAt: "desc" },
      take: 300
    }),
    workspaceId ? prisma.mix.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" }, steps: { some: { isActive: true } } },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    }) : Promise.resolve([])
  ]);
  const metadataRows = templates.length
    ? await prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: templates.map((item) => item.id) } } })
    : [];
  const metadataById = new Map(metadataRows.map((item) => [item.sharedMixId, item]));
  const publishedCount = templates.filter((item) => item.status === "APPROVED").length;

  return (
    <div className="page admin-template-page">
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Admin · Ready-made plans</h1><p>Create and maintain the curated plans shown in the customer library.</p></div>
        <div className="page-actions"><Link className="button" href="/templates">Customer library</Link></div>
      </header>

      <div className="admin-template-metrics">
        <div className="card"><strong>{templates.length}</strong><span>Curated plans</span></div>
        <div className="card"><strong>{publishedCount}</strong><span>Published</span></div>
        <div className="card"><strong>{templates.length - publishedCount}</strong><span>Hidden</span></div>
        <div className="card"><strong>{templates.reduce((sum, item) => sum + item.importCount, 0)}</strong><span>Total uses</span></div>
      </div>

      <section className="card admin-platform-template-builder">
        <div className="card-header"><div><h2>Create a ready-made plan</h2><p>Start from a tested plan in your administrator business.</p></div></div>
        {workspaceId && sourcePlans.length ? (
          <form action={createPlatformSharedMixAction} className="form-grid">
            <div className="field full"><label htmlFor="sourceMixId">Source plan</label><select id="sourceMixId" name="sourceMixId" required><option value="">Choose a plan</option>{sourcePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
            <div className="field full"><label htmlFor="title">Library title</label><input id="title" name="title" maxLength={160} required /></div>
            <div className="field full"><label htmlFor="description">Description</label><textarea id="description" name="description" minLength={20} maxLength={1200} required /></div>
            <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" required><option value="">Choose category</option>{MIX_TEMPLATE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="industry">Industry</label><select id="industry" name="industry" required><option value="">Choose industry</option>{MIX_TEMPLATE_INDUSTRIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field full"><label htmlFor="framework">Short label</label><input id="framework" name="framework" maxLength={160} /></div>
            <div className="form-actions field full"><button className="button primary" type="submit">Publish ready-made plan</button></div>
          </form>
        ) : (
          <Notice type="info">Create a plan with at least one follow-up in your administrator business first.</Notice>
        )}
      </section>

      <form className="filter-bar admin-template-filter" method="get">
        <input name="q" defaultValue={query} placeholder="Search title, category, or industry" aria-label="Search ready-made plans" />
        <select name="status" defaultValue={status ?? ""}><option value="">All visibility</option><option value="APPROVED">Published</option><option value="UNPUBLISHED">Hidden</option></select>
        <button className="button" type="submit">Filter</button>
        {(query || status) && <Link className="button" href="/admin/templates">Clear</Link>}
      </form>

      <div className="admin-template-list">
        {templates.map((template) => {
          const itemMetadata = metadataById.get(template.id);
          const issue = sharedMixContentIssue(template.steps);
          const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
          return (
            <article className="card admin-template-card" key={template.id}>
              <div className="admin-template-heading">
                <div>
                  <div className="template-badges"><span className={`status-pill ${template.status === "APPROVED" ? "done" : ""}`}>{template.status === "APPROVED" ? "Published" : "Hidden"}</span>{itemMetadata?.featuredAt && <span className="status-pill done">Featured</span>}</div>
                  <h2>{template.title}</h2>
                  <p>{template.description}</p>
                  <small>Version {itemMetadata?.version ?? 1} · Updated {formatDate(template.updatedAt, displayPreferences)} · Used {template.importCount} times</small>
                </div>
                <Link className="button small" href={`/admin/templates/${template.id}/edit`}>Edit</Link>
              </div>
              {issue ? <Notice type="error">Invalid plan content: {issue}</Notice> : (
                <SharedMixPreview title={template.title} triggerMode={itemMetadata?.triggerMode ?? "MANUAL_START"} dateTypeName={itemMetadata?.dateTypeName ?? null} durationDays={template.durationDays} steps={steps} />
              )}
            </article>
          );
        })}
      </div>

      {!templates.length && <div className="empty-state"><h2>No ready-made plans found</h2><p>Clear the filters or publish the first curated plan.</p></div>}
    </div>
  );
}
