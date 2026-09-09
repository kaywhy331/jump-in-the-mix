import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { Sheet } from "@/components/Sheet";
import { planGoalLabel, planGoalValues } from "@/lib/business-taxonomy";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { PlanApproachGuide } from "@/components/PlanApproachGuide";
import { requireWorkspace } from "@/lib/auth";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixSteps, sharedMixContentIssue } from "@/lib/shared-mix";
import { salesPlanById, salesPlanSearchIds } from "@/lib/sales-plan-library";

export const metadata: Metadata = { title: "Ready-made mixes" };
const PAGE_SIZE = 9;

type SearchParams = { q?: string; category?: string; industry?: string; framework?: string; page?: string; error?: string };

function pageHref(params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const key of ["q", "category", "industry", "framework"] as const) if (params[key]?.trim()) query.set(key, params[key]!.trim());
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/templates?${suffix}` : "/templates";
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, , configuredCategories, configuredIndustries, options] = await Promise.all([
    searchParams,
    requireWorkspace(),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries"),
    prisma.sharedMix.findMany({ where: { status: "APPROVED" }, select: { category: true, industry: true, framework: true }, distinct: ["category", "industry", "framework"] })
  ]);
  const categories = [...new Set([...configuredCategories, ...options.map(item => item.category)].map(planGoalLabel))];
  const industries = [...new Set([...configuredIndustries, ...options.flatMap(item => item.industry ? [item.industry] : [])])];
  const frameworks = [...new Set(options.flatMap(item => item.framework ? [item.framework] : []))].sort();
  const query = params.q?.trim().slice(0, 160) ?? "";
  const category = planGoalLabel(params.category?.trim() ?? "");
  const industry = params.industry?.trim() ?? "";
  const framework = params.framework?.trim() ?? "";
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const candidates = await prisma.sharedMix.findMany({
    where: {
      status: "APPROVED",
      ...(category ? { category: { in: planGoalValues(category) } } : {}),
      ...(industry ? { industry: { in: [...new Set([industry, "Any business"])] } } : {}),
      ...(framework ? { framework } : {}),
      ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { framework: { contains: query, mode: "insensitive" } }, { category: { contains: query, mode: "insensitive" } }, { industry: { contains: query, mode: "insensitive" } }, { id: { in: salesPlanSearchIds(query) } }] } : {})
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 500
  });
  const metadataRows = candidates.length ? await prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: candidates.map((item) => item.id) } } }) : [];
  const metadataById = new Map(metadataRows.map((item) => [item.sharedMixId, item]));
  const templates = [...candidates].sort((left, right) => Number(Boolean(metadataById.get(right.id)?.featuredAt)) - Number(Boolean(metadataById.get(left.id)?.featuredAt)));
  const totalPages = Math.max(1, Math.ceil(templates.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = templates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <div className="page mix-template-page">
    {params.error && <Notice type="error">{params.error}</Notice>}
    <header className="page-header"><div><h1>Ready-made mixes</h1><p>Find your rhythm. Remix a starting point for a new connection, a customer, or someone you want to reconnect with.</p></div><div className="page-actions"><Link className="button" href="/mixes">My mixes</Link><Link className="button primary" href="/mixes/new?custom=1">Create a mix</Link></div></header>
    <form className="filter-bar plan-library-filters" method="get" action="/templates">
      <label className="field library-search"><span className="sr-only">Search ready-made mixes</span><input name="q" defaultValue={query} placeholder="Search a goal, approach, or author" type="search" /></label>
      <details className="library-refinements"><summary>Refine mixes{[category, industry, framework].filter(Boolean).length > 0 ? ` · ${[category, industry, framework].filter(Boolean).length}` : ""}</summary><div className="library-filter-fields">
        <label className="field"><span>Goal</span><select name="category" defaultValue={category} aria-label="Filter by goal"><option value="">Every goal</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Business type</span><select name="industry" defaultValue={industry} aria-label="Filter by business type"><option value="">Every business type</option>{industries.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Approach</span><select name="framework" defaultValue={framework} aria-label="Filter by approach"><option value="">Every approach</option>{frameworks.map(item => <option key={item} value={item}>{item === "Ready-made" ? "Everyday follow-up" : item}</option>)}</select></label>
      </div></details>
      <button className="button" type="submit">Show mixes</button>
    </form>
    <div className="library-results-line"><p role="status" aria-live="polite"><strong>{templates.length} {templates.length === 1 ? "mix" : "mixes"}</strong>{industry ? ` for ${industry.toLowerCase()}` : " to make your next conversation easier"}</p>{(query || category || industry || framework) && <Link className="button small" href="/templates">Clear filters</Link>}</div>
    {industry && industry !== "Any business" && <p className="muted-copy">Includes adaptable mixes for any business.</p>}
    {visible.length ? <div className="mix-template-grid plan-library-grid">{visible.map((template) => {
      const metadata = metadataById.get(template.id);
      const issue = sharedMixContentIssue(template.steps);
      const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
      const salesPlan = salesPlanById(template.id);
      return <article className="card mix-template-card library-plan-card" key={template.id}>
        <div className="template-badges"><span className="library-goal">{planGoalLabel(template.category)}</span><span className="library-industry">{template.framework === "Relationships" ? "Business, personal & networking" : template.industry || "Any business"}</span></div>
        <h2>{template.title}</h2><p className="library-plan-description">{template.description}</p>
        <p className="library-plan-facts"><span>{steps.length} beats</span><span>{template.durationDays} days</span></p>
        {template.framework && <p className="template-approach">{template.framework === "Ready-made" ? "Everyday follow-up" : template.framework}</p>}
        {issue ? <Notice type="error">This mix is being updated. Please choose another.</Notice> : <div className="mix-template-card-footer">
          <Sheet className="plan-preview-sheet" trigger={<button className="button" type="button" aria-label={`Preview the rhythm: ${template.title}`}>Preview the rhythm <span aria-hidden="true">↗</span></button>} title={template.title} description={template.description}>
            <Link className="button primary plan-preview-use" href={`/templates/${template.id}/use`}>Remix it</Link>
            {salesPlan && <p className="plan-audience"><strong>Best for</strong> {salesPlan.audience}</p>}
            <SharedMixPreview title={template.title} triggerMode={metadata?.triggerMode ?? "MANUAL_START"} dateTypeName={metadata?.dateTypeName ?? null} durationDays={template.durationDays} steps={steps} expanded />
            {salesPlan && <PlanApproachGuide plan={salesPlan}/>}
          </Sheet>
        </div>}
      </article>;

    })}</div> : <EmptyState title="No mixes match" description="Try clearing a filter or searching for a broader goal." actionHref="/templates" actionLabel="Clear filters"/>}
    <nav className="pagination-bar" aria-label="Ready-made mix result pages"><span>{templates.length.toLocaleString()} mixes</span><div className="page-actions">{currentPage > 1 && <Link className="button" href={pageHref(params, currentPage - 1)}>Previous</Link>}<span>Page {currentPage} of {totalPages}</span>{currentPage < totalPages && <Link className="button" href={pageHref(params, currentPage + 1)}>Next</Link>}</div></nav>
  </div>;
}
