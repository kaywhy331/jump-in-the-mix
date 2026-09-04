import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { requireWorkspace } from "@/lib/auth";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixSteps, sharedMixContentIssue } from "@/lib/shared-mix";

export const metadata: Metadata = { title: "Ready-made plans" };
const PAGE_SIZE = 24;

type SearchParams = { q?: string; category?: string; industry?: string; page?: string; error?: string };

function pageHref(params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const key of ["q", "category", "industry"] as const) if (params[key]?.trim()) query.set(key, params[key]!.trim());
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/templates?${suffix}` : "/templates";
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }, categories, industries] = await Promise.all([
    searchParams,
    requireWorkspace(),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries")
  ]);
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
    orderBy: [{ updatedAt: "desc" }],
    take: 500
  });
  const metadataRows = candidates.length ? await prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: candidates.map((item) => item.id) }, isPlatform: true } }) : [];
  const metadataById = new Map(metadataRows.map((item) => [item.sharedMixId, item]));
  const templates = candidates.filter((item) => item.publisherWorkspaceId === null || metadataById.has(item.id));
  const totalPages = Math.max(1, Math.ceil(templates.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = templates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const imports = visible.length ? await prisma.sharedMixImport.findMany({ where: { workspaceId: workspace.id, sharedMixId: { in: visible.map((item) => item.id) } }, orderBy: { createdAt: "desc" } }) : [];
  const importMetadata = imports.length ? await prisma.sharedMixImportMetadata.findMany({ where: { importId: { in: imports.map((item) => item.id) } } }) : [];
  const versionByImport = new Map(importMetadata.map((item) => [item.importId, item.sharedMixVersion]));
  const importedByTemplate = new Map<string, { count: number; latestVersion: number }>();
  for (const item of imports) {
    const current = importedByTemplate.get(item.sharedMixId);
    importedByTemplate.set(item.sharedMixId, { count: (current?.count ?? 0) + 1, latestVersion: Math.max(current?.latestVersion ?? 0, versionByImport.get(item.id) ?? 1) });
  }

  return <div className="page mix-template-page">
    {params.error && <Notice type="error">{params.error}</Notice>}
    <header className="page-header"><div><h1>Ready-made plans</h1><p>Practical follow-ups for the moments that grow a small business.</p></div><div className="page-actions"><Link className="button" href="/mixes">My plans</Link><Link className="button primary" href="/mixes/new?custom=1">Build my own</Link></div></header>
    <form className="filter-bar template-filter-bar" method="get"><input name="q" defaultValue={query} placeholder="Search by goal or situation" aria-label="Search ready-made plans"/><select name="category" defaultValue={category} aria-label="Filter by goal"><option value="">Every goal</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select name="industry" defaultValue={industry} aria-label="Filter by business type"><option value="">Every business type</option>{industries.map((item) => <option key={item}>{item}</option>)}</select><button className="button" type="submit">Show plans</button>{(query || category || industry) && <Link className="button" href="/templates">Clear</Link>}</form>
    <p className="sr-only" role="status" aria-live="polite">{templates.length} ready-made plans found. Showing page {currentPage} of {totalPages}.</p>
    {visible.length ? <div className="mix-template-grid">{visible.map((template) => {
      const metadata = metadataById.get(template.id);
      const issue = sharedMixContentIssue(template.steps);
      const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
      return <article className="card mix-template-card" key={template.id}><div className="mix-template-card-heading"><div><div className="template-badges"><span className="status-pill">{template.category}</span>{template.industry && <span className="status-pill">{template.industry}</span>}</div><h2>{template.title}</h2><p>{template.description}</p></div></div>{issue ? <Notice type="error">This plan is temporarily unavailable: {issue}</Notice> : <SharedMixPreview title={template.title} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} durationDays={template.durationDays} steps={steps}/>}<div className="mix-template-card-footer">{!issue && <Link className="button small primary" href={`/templates/${template.id}/use`}>Use this plan</Link>}</div></article>;
    })}</div> : <EmptyState title="No plans match" description="Try clearing a filter or searching for a broader goal." actionHref="/templates" actionLabel="Clear filters"/>}
    <nav className="pagination-bar" aria-label="Ready-made plan result pages"><span>{templates.length.toLocaleString()} plans</span><div className="page-actions">{currentPage > 1 && <Link className="button" href={pageHref(params, currentPage - 1)}>Previous</Link>}<span>Page {currentPage} of {totalPages}</span>{currentPage < totalPages && <Link className="button" href={pageHref(params, currentPage + 1)}>Next</Link>}</div></nav>
  </div>;
}
