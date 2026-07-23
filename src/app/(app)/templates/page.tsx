import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { requireWorkspace } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixSteps, sharedMixContentIssue } from "@/lib/shared-mix";

export const metadata: Metadata = { title: "Mix Templates" };
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
    <header className="page-header"><div><h1>Mix Templates</h1><p>Browse ready-to-use follow-up sequences, then choose the audience, timing, and lifecycle in one focused setup.</p></div><div className="page-actions"><Link className="button" href="/mixes">My Mixes</Link><Link className="button primary" href="/mixes/new">Create my own</Link></div></header>
    <form className="filter-bar template-filter-bar" method="get"><input name="q" defaultValue={query} placeholder="Search outcome, situation, or phrase" aria-label="Search Mix Templates"/><select name="category" defaultValue={category} aria-label="Filter by category"><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select name="industry" defaultValue={industry} aria-label="Filter by industry"><option value="">All industries</option>{industries.map((item) => <option key={item}>{item}</option>)}</select><button className="button" type="submit">Apply</button>{(query || category || industry) && <Link className="button" href="/templates">Clear</Link>}</form>
    <p className="sr-only" role="status" aria-live="polite">{templates.length} Mix Templates found. Showing page {currentPage} of {totalPages}.</p>
    {visible.length ? <div className="mix-template-grid">{visible.map((template) => {
      const metadata = metadataById.get(template.id);
      const issue = sharedMixContentIssue(template.steps);
      const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
      const imported = importedByTemplate.get(template.id);
      const version = metadata?.version ?? 1;
      const updateAvailable = Boolean(imported && version > imported.latestVersion);
      return <article className="card mix-template-card" key={template.id}><div className="mix-template-card-heading"><div><div className="template-badges"><span className="status-pill">{template.category}</span>{template.industry && <span className="status-pill">{template.industry}</span>}{updateAvailable && <span className="status-pill done">New version</span>}</div><h2>{template.title}</h2><p>{template.description}</p></div></div>{issue ? <Notice type="error">This template is temporarily unavailable: {issue}</Notice> : <SharedMixPreview title={template.title} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} durationDays={template.durationDays} steps={steps}/>}<div className="mix-template-card-footer">{!issue && <Link className="button small primary" href={`/templates/${template.id}/use`}>{updateAvailable ? "Use latest version" : imported ? "Use again" : "Use template"}</Link>}</div>{imported && <small>Previously used {imported.count}× · latest used version {imported.latestVersion}</small>}<small className="template-updated">Version {version} · Updated {formatDate(template.updatedAt)}</small></article>;
    })}</div> : <EmptyState title="No templates match" description="Try clearing a filter or searching for a broader outcome." actionHref="/templates" actionLabel="Clear filters"/>}
    <nav className="pagination-bar" aria-label="Mix Template result pages"><span>{templates.length.toLocaleString()} templates</span><div className="page-actions">{currentPage > 1 && <Link className="button" href={pageHref(params, currentPage - 1)}>Previous</Link>}<span>Page {currentPage} of {totalPages}</span>{currentPage < totalPages && <Link className="button" href={pageHref(params, currentPage + 1)}>Next</Link>}</div></nav>
  </div>;
}
