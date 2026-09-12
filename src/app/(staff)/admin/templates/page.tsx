import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin · Ready-made mixes" };
const PAGE_SIZE = 25;

export default async function AdminTemplatesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; sort?: string }> }) {
  const { user } = await requirePlatformAdmin("mixes.edit");
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 160) ?? "";
  const status = query.status === "APPROVED" || query.status === "UNPUBLISHED" ? query.status : "";
  const sort = query.sort === "title" || query.sort === "popular" ? query.sort : "updated";
  const search: Prisma.SharedMixWhereInput = q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {};
  const where: Prisma.SharedMixWhereInput = { ...search, ...(status ? { status } : {}) };
  const [count, allCount, published, hidden, uses, sourceMixes] = await Promise.all([
    prisma.sharedMix.count({ where }),
    prisma.sharedMix.count({ where: search }),
    prisma.sharedMix.count({ where: { ...search, status: "APPROVED" } }),
    prisma.sharedMix.count({ where: { ...search, status: "UNPUBLISHED" } }),
    prisma.sharedMix.aggregate({ _sum: { importCount: true } }),
    prisma.mix.findMany({ where: { workspace: { ownerId: user.id }, status: { not: "ARCHIVED" }, steps: { some: { isActive: true } } }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" }, take: 50 })
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(query.page) || 1)));
  const orderBy: Prisma.SharedMixOrderByWithRelationInput[] = [sort === "title" ? { title: "asc" } : sort === "popular" ? { importCount: "desc" } : { updatedAt: "desc" }, { id: "asc" }];
  const templates = await prisma.sharedMix.findMany({ where, orderBy, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, select: { id: true, title: true, description: true, category: true, status: true, importCount: true } });
  const metadata = await prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: templates.map(row => row.id) } }, select: { sharedMixId: true, version: true, draftVersion: true } });
  const byId = new Map(metadata.map(row => [row.sharedMixId, row]));
  const href = (next: number, visibility = status) => `/admin/templates?${new URLSearchParams({ ...(q ? { q } : {}), ...(visibility ? { status: visibility } : {}), sort, page: String(next) })}`;

  return <div className="page admin-library-page">
    <header className="page-header"><div><h1>Ready-made mixes</h1><p>Find a mix, refine its content, and review it for publication.</p></div><Link className="button primary" href="/admin/templates/new">Create library draft</Link></header>
    <div className="admin-library-toolbar">
      <nav className="admin-content-tabs" aria-label="Library visibility">
        {[{ label: "All mixes", value: "", count: allCount }, { label: "Published", value: "APPROVED", count: published }, { label: "Drafts & hidden", value: "UNPUBLISHED", count: hidden }].map(tab => <Link key={tab.value} href={href(1, tab.value)} aria-current={status === tab.value ? "page" : undefined}>{tab.label}<span>{tab.count}</span></Link>)}
      </nav>
      <form className="admin-library-search" method="get" role="search" aria-label="Content library">
        {status && <input type="hidden" name="status" value={status} />}
        <input type="search" name="q" defaultValue={q} placeholder="Search title or description" aria-label="Search ready-made mixes" />
        <select name="sort" defaultValue={sort} aria-label="Sort mixes"><option value="updated">Recently updated</option><option value="title">Title A–Z</option><option value="popular">Most copied</option></select>
        <button className="button" type="submit">Search</button>
        {q && <Link href={`/admin/templates?${new URLSearchParams({ status, sort })}`}>Clear search</Link>}
      </form>
    </div>
    <section className="admin-panel admin-library-results" aria-label="Library mixes">
      <div className="admin-library-column-head" aria-hidden="true"><span>Mix</span><span>Visibility</span><span>Copies</span><span /></div>
      {templates.map(row => {
        const meta = byId.get(row.id);
        const version = meta?.version ?? 1, draftVersion = meta?.draftVersion ?? 1;
        return <article className="admin-library-row" key={row.id}>
          <div className="admin-library-title"><h2><Link href={`/admin/templates/${row.id}/edit`}>{row.title}</Link></h2><p>{row.description}</p><small>{row.category}{draftVersion !== version ? ` · Unpublished changes in draft ${draftVersion}` : ` · Draft ${draftVersion}`}</small></div>
          <div className="admin-library-visibility"><span className={`admin-content-status ${row.status === "APPROVED" ? "published" : ""}`}>{row.status === "APPROVED" ? "Published" : "Hidden"}</span>{row.status === "APPROVED" && <small>Version {version}</small>}</div>
          <span className="admin-library-copies">{row.importCount.toLocaleString("en-US")}<span className="admin-mobile-copy-label"> copies</span></span>
          <Link className="button small" href={`/admin/templates/${row.id}/edit`} aria-label={`Review and edit ${row.title}`}>Edit<span aria-hidden="true"> →</span></Link>
        </article>;
      })}
      {!count && <div className="admin-calm-state"><h2>{q || status ? "No mixes match these filters" : "Your content library starts here"}</h2><p>{q || status ? "Try another search or return to all mixes." : "Create your first draft, then preview it before publishing."}</p><Link className="button" href={q || status ? "/admin/templates" : "/admin/templates/new"}>{q || status ? "Show all mixes" : "Create library draft"}</Link></div>}
      <nav className="admin-library-pagination" aria-label="Library pages"><span>{count ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, count)} of ${count} mixes` : "0 mixes"}</span><div>{page > 1 && <Link className="button small" href={href(page - 1)}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="button small" href={href(page + 1)}>Next</Link>}</div></nav>
    </section>
    <details className="admin-library-help"><summary>Library guidance & copying an existing mix</summary><p>{uses._sum.importCount ?? 0} total customer copies. Drafts stay private until published. Publishing or rolling back changes future copies; customers keep their existing content.</p>
      {sourceMixes.length > 0 && <form className="form-stack" action="/admin/templates/new" method="get"><label className="field"><span>Start from your own mix</span><select name="sourceMixId" required>{sourceMixes.map(mix => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select></label><button className="button" type="submit">Copy into a library draft</button></form>}
    </details>
  </div>;
}
