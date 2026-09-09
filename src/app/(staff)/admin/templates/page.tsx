import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin · Ready-made mixes" };
export default async function AdminTemplatesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const { user } = await requirePlatformAdmin("mixes.edit"); const query = await searchParams;
  const sourceMixes = await prisma.mix.findMany({ where: { workspace: { ownerId: user.id }, status: { not: "ARCHIVED" }, steps: { some: { isActive: true } } }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" }, take: 50 });
  const page = Math.max(1, Math.floor(Math.min(100_000, Number(query.page) || 1)));
  const q = query.q?.trim().slice(0, 160) ?? "";
  const status = query.status === "APPROVED" || query.status === "UNPUBLISHED" ? query.status : undefined;
  const where: Prisma.SharedMixWhereInput = { ...(status ? { status } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) };
  const [templates, count, published, uses] = await Promise.all([
    prisma.sharedMix.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 50, skip: (page - 1) * 50, select: { id: true, title: true, description: true, status: true, importCount: true } }),
    prisma.sharedMix.count({ where }), prisma.sharedMix.count({ where: { status: "APPROVED" } }), prisma.sharedMix.aggregate({ _sum: { importCount: true } })
  ]);
  const metadata = await prisma.sharedMixMetadata.findMany({ where: { sharedMixId: { in: templates.map(row => row.id) } }, select: { sharedMixId: true, version: true, draftVersion: true } });
  const byId = new Map(metadata.map(row => [row.sharedMixId, row]));
  const href = (next: number) => `/admin/templates?${new URLSearchParams({ q, status: status ?? "", page: String(next) })}`;
  return <div className="page admin-template-page">
    <header className="page-header"><div><h1>Admin · Ready-made mixes</h1><p>Draft, review, and publish useful starting points for the customer library.</p></div><Link className="button primary" href="/admin/templates/new">Create library draft</Link></header>
    <section className="card"><p>{published} published mixes · {uses._sum.importCount ?? 0} total copies made</p><p>Editing creates a separate draft. Publishing or rolling back changes future copies; existing customer mixes keep their content.</p></section>
    {sourceMixes.length > 0 && <form className="card form-stack" action="/admin/templates/new" method="get"><label className="field"><span>Start from your own mix</span><select name="sourceMixId" required>{sourceMixes.map(mix => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select></label><button className="button" type="submit">Copy into a library draft</button></form>}
    <form className="filter-bar admin-template-filter" method="get">
      <input name="q" defaultValue={q} placeholder="Search library title or description" aria-label="Search ready-made mixes" />
      <select name="status" defaultValue={status ?? ""} aria-label="Library visibility"><option value="">All visibility</option><option value="APPROVED">Published</option><option value="UNPUBLISHED">Hidden</option></select>
      <button className="button" type="submit">Filter</button>
    </form>
    <div className="admin-template-list">{templates.map(row => { const meta = byId.get(row.id); return <article className="card" key={row.id}>
      <h2>{row.title}</h2><p>{row.description}</p><p>{row.status === "APPROVED" ? `Published version ${meta?.version ?? 1}` : "Hidden"} · Latest draft {meta?.draftVersion ?? 1} · {row.importCount} copies</p>
      <Link className="button" href={`/admin/templates/${row.id}/edit`}>Review and edit</Link>
    </article>; })}</div>
    {!count && <p>No mixes match. Create a draft or clear the filter.</p>}
    <nav className="page-actions" aria-label="Library pages">{page > 1 && <Link href={href(page - 1)}>Previous</Link>}<span>Page {page} · {count} results</span>{page * 50 < count && <Link href={href(page + 1)}>Next</Link>}</nav>
  </div>;
}
