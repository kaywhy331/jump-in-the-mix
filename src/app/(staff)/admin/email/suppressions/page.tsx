import Link from "next/link";
import { Prisma, type EmailSuppressionReason } from "@/generated/prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { AdminPagination } from "@/components/AdminPagination";
import { prisma } from "@/lib/prisma";
import { SUPPRESSION_LABELS } from "@/lib/admin-suppression-presentation";
import { adminPage, adminQuery } from "@/lib/admin-navigation";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
export const metadata = { title: "Admin · Recipient suppression" };
export default async function SuppressionQueue({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string; at?: string; sig?: string; reason?: string }> }) {
  const { user, session, permissions } = await requirePlatformAdmin("email.manage"), params = await searchParams;
  const q = params.q?.trim().toLowerCase().slice(0,254) ?? "", reason = Object.hasOwn(SUPPRESSION_LABELS, params.reason ?? "") ? params.reason as EmailSuppressionReason : undefined;
  const where = { clearedAt: null, ...(q ? { email: { contains: q, mode: "insensitive" as const } } : {}), ...(reason ? { reason } : {}) };
  const counts = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT COUNT(DISTINCT email)::int AS count FROM "EmailSuppression" WHERE "clearedAt" IS NULL ${q ? Prisma.sql`AND email ILIKE ${`%${q}%`}` : Prisma.empty} ${reason ? Prisma.sql`AND reason=${reason}::"EmailSuppressionReason"` : Prisma.empty}`);
  const count = counts[0]?.count ?? 0, page = Math.min(adminPage(params.page),Math.max(1,Math.ceil(count/50)));
  const groups = await prisma.emailSuppression.groupBy({ by: ["email"], where, _min: { id: true }, orderBy: { email: "asc" }, take: 50, skip: (page-1)*50 });
  const blocks = await prisma.emailSuppression.findMany({ where: { clearedAt: null, email: { in: groups.map(row => row.email) } }, select: { email: true, reason: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const display = await displayPreferencesForUser(user.id), href = (page:number) => adminQuery("/admin/email/suppressions", { q, reason, page });
  return <div className="page"><header className="page-header"><div><h1>Recipient suppression</h1><p>Provider blocks and recipient opt-outs.</p></div>{permissions.includes("operations.read") && <Link className="button" href="/admin/email">Email overview</Link>}</header><UrlErrorNotice params={params} viewer={session} />
    <form method="get" className="admin-library-search live-search-form"><label className="field"><span>Recipient email</span><input type="search" name="q" defaultValue={q} maxLength={254} /></label><label className="field"><span>Active reason</span><select name="reason" defaultValue={reason ?? ""}><option value="">All reasons</option>{Object.entries(SUPPRESSION_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="button" type="submit">Search recipients</button><Link href="/admin/email/suppressions">Clear</Link></form>
    <p className="admin-result-summary" role="status">{count} matching blocked recipients</p><div className="admin-queue" role="region" aria-label="Results" tabIndex={0}>{groups.map(group => { const active = blocks.filter(row => row.email === group.email); return <article className="admin-queue-row" key={group.email}><div><h2>{group.email}</h2><p>{[...new Set(active.map(row => SUPPRESSION_LABELS[row.reason]))].join(" · ")}</p><small>First active block {active[0] ? formatDateTime(active[0].createdAt,display) : "unknown"} · {active.some(row => row.reason !== "INVITATION_OPTOUT") ? "Provider review available" : "Recipient confirmation required"}</small></div><Link prefetch={false} className="button" href={adminQuery(`/admin/email/suppressions/${group._min.id}`, { returnTo: href(page) })}>Review recipient</Link></article>; })}</div>
    {!count && <p>No active blocks match these filters.</p>}<AdminPagination page={page} total={count} pageSize={50} href={href} />
  </div>;
}
