import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { Notice } from "@/components/Notice";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Recipient suppression" };
export default async function SuppressionQueue({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string }> }) {
  await requirePlatformAdmin("email.manage");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase().slice(0, 254) : "";
  const page = typeof params.page === "string" && /^\d{1,4}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
  const rows = await prisma.emailSuppression.groupBy({ by: ["email"], where: { clearedAt: null, ...(q ? { email: { contains: q, mode: "insensitive" } } : {}) }, _count: { _all: true }, _min: { id: true }, orderBy: { email: "asc" }, take: 51, skip: (page - 1) * 50 });
  const href = (next: number) => `/admin/email/suppressions?${new URLSearchParams({ q, page: String(next) })}`;
  return <div className="page">
    <header className="page-header"><div><h1>Recipient suppression</h1><p>Review delivery blocks before allowing email to resume.</p></div></header>
    {params.error && <Notice type="error">{params.error}</Notice>}
    <section className="card form-stack"><h2>Find a blocked recipient</h2><form method="get" className="form-stack"><label className="field"><span>Recipient email</span><input type="search" name="q" defaultValue={q} maxLength={254} /></label><button className="button" type="submit">Search recipients</button></form>
      <p>Clear provider blocks only after reviewing the cause and the recipient’s request. Invitation opt-outs can be reversed only by the recipient confirming a new waitlist request.</p>
    </section>
    {!rows.length && <section className="card"><p>No active suppression records match this search.</p></section>}
    {rows.slice(0, 50).map(row => <section className="card form-stack" key={row.email} style={{ overflowWrap: "anywhere" }}><h2>{row.email}</h2><p>{row._count._all} active suppression records</p><Link prefetch={false} className="button" href={`/admin/email/suppressions/${row._min.id}`}>Review recipient</Link></section>)}
    <nav className="page-actions" aria-label="Suppression pages">{page > 1 && <Link href={href(page - 1)}>Previous</Link>}<span>Page {page}</span>{rows.length > 50 && <Link href={href(page + 1)}>Next</Link>}</nav>
  </div>;
}
