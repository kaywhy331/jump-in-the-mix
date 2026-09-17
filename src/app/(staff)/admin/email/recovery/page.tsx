import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adminPage, adminQuery } from "@/lib/admin-navigation";
import { AdminPagination } from "@/components/AdminPagination";
import { Notice } from "@/components/Notice";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
export const metadata = { title: "Admin · Email recovery" };
export default async function EmailRecoveryPage({ searchParams }: { searchParams: Promise<{ page?: string; error?: string; status?: string; q?: string }> }) {
  const { user, permissions } = await requirePlatformAdmin("email.manage"), params = await searchParams;
  const status = params.status === "SENT" ? "SENT" : "REVIEW", q = params.q?.trim().toLowerCase().slice(0,254) ?? "";
  const scope = [...(permissions.includes("access.read") ? [{ inviteId: { not: null }, ...(q ? { invite: { recipientEmail: { contains: q } } } : {}) }] : []), ...(permissions.includes("staff.manage") ? [{ staffInvitationId: { not: null }, ...(q ? { staffInvitation: { email: { contains: q } } } : {}) }] : [])];
  const where: Prisma.WaitlistDeliveryWhereInput = { status, payloadPurgedAt: null, OR: scope };
  const count = scope.length ? await prisma.waitlistDelivery.count({ where }) : 0, page = Math.min(adminPage(params.page),Math.max(1,Math.ceil(count / 50)));
  const rows = scope.length ? await prisma.waitlistDelivery.findMany({ where, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50, select: { id: true, status: true, firstAttemptAt: true, invite: { select: { recipientEmail: true, acceptedAt: true, revokedAt: true } }, staffInvitation: { select: { email: true, acceptedAt: true, revokedAt: true, expiresAt: true } } } }) : [];
  const display = await displayPreferencesForUser(user.id), href = (page: number) => adminQuery("/admin/email/recovery", { page, status, q });
  return <div className="page"><header className="page-header"><div><h1>Email recovery</h1></div><Link className="button" href="/admin/email/suppressions">Recipient suppression</Link></header>{params.error && <Notice type="error">{params.error}</Notice>}
    <form method="get" className="admin-library-search live-search-form"><label className="field"><span>Recipient email</span><input type="search" name="q" defaultValue={q} maxLength={254} /></label><label className="field"><span>Delivery status</span><select name="status" defaultValue={status}><option value="REVIEW">Needs review</option><option value="SENT">Accepted by provider</option></select></label><button className="button" type="submit">Find invitations</button></form><p className="admin-result-summary" role="status">{count} deliveries · expired payloads excluded</p>
    <div className="admin-queue" role="region" aria-label="Results" tabIndex={0}>{rows.map(row => { const grant = row.invite ?? row.staffInvitation; return <article className="admin-queue-row" key={row.id}><div><h2>{row.invite?.recipientEmail ?? row.staffInvitation?.email}</h2><p>{row.staffInvitation ? "Staff" : "Customer"} invitation · {grant?.acceptedAt ? "Accepted grant" : grant?.revokedAt ? "Revoked grant" : row.staffInvitation && row.staffInvitation.expiresAt <= new Date() ? "Expired grant" : "Unused grant"} · {row.status.toLowerCase()}</p><small>First attempt {row.firstAttemptAt ? formatDateTime(row.firstAttemptAt,display) : "not recorded"}</small></div><Link className="button" href={adminQuery(`/admin/email/recovery/${row.id}`, { returnTo: href(page) })}>Review delivery</Link></article>; })}</div>{!count && <p>No matching deliveries within your permissions.</p>}<AdminPagination page={page} total={count} pageSize={50} href={href} />
  </div>;
}
