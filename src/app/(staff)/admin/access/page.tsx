import Link from "next/link";
import type { AccessInviteSource, Prisma } from "@/generated/prisma/client";
import { Notice } from "@/components/Notice";
import { AdminPagination } from "@/components/AdminPagination";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { ACCESS_SOURCES, accessGrantLabel, adminFilterDate } from "@/lib/admin-access-presentation";
import { adminPage, adminQuery } from "@/lib/admin-navigation";
export const metadata = { title: "Admin · Invitations" };
type Search = { q?: string; page?: string; review?: string; systemMixVersion?: string; error?: string; done?: string; source?: string; status?: string; from?: string; through?: string };
export default async function AdminAccessPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { user } = await requirePlatformAdmin("access.read"), params = await searchParams;
  const q = params.q?.trim().slice(0,254) ?? "", review = params.review === "1";
  const status = ["active", "joined", "revoked"].includes(params.status ?? "") ? params.status! : "all";
  const source = Object.hasOwn(ACCESS_SOURCES, params.source ?? "") ? params.source as AccessInviteSource : undefined;
  const version = Number(params.systemMixVersion), validVersion = Number.isSafeInteger(version) && version > 0 && version <= 2_147_483_647;
  const from = adminFilterDate(params.from), through = adminFilterDate(params.through);
  const invalid = Boolean(params.systemMixVersion && !validVersion || params.from && !from || params.through && !through || from && through && from > through);
  const where: Prisma.ReferralAccessInviteWhereInput = { ...(invalid ? { id: "invalid-filter" } : {}), ...(q ? { OR: [{ recipientEmail: { contains: q, mode: "insensitive" } }, { recipientPhone: { contains: q } }] } : {}), ...(source ? { source } : {}), ...(review ? { delivery: { status: "REVIEW" } } : {}), ...(validVersion ? { systemMixVersion: version } : {}), ...(status === "active" ? { acceptedAt: null, revokedAt: null } : status === "joined" ? { acceptedAt: { not: null } } : status === "revoked" ? { acceptedAt: null, revokedAt: { not: null } } : {}), createdAt: { ...(from ? { gte: from } : {}), ...(through ? { lt: new Date(+through + 86400_000) } : {}) } };
  const count = await prisma.referralAccessInvite.count({ where }), page = Math.min(adminPage(params.page), Math.max(1,Math.ceil(count / 50)));
  const [invites, display] = await Promise.all([prisma.referralAccessInvite.findMany({ where, select: { id: true, recipientEmail: true, recipientPhone: true, manualDelivery: true, source: true, acceptedAt: true, revokedAt: true, createdAt: true, delivery: { select: { status: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50 }), displayPreferencesForUser(user.id)]);
  const href = (page: number) => adminQuery("/admin/access", { q, status, source, review: review ? "1" : undefined, systemMixVersion: params.systemMixVersion, from: params.from, through: params.through, page });
  return <div className="page"><header className="page-header"><div><h1>Invitations</h1></div></header>{invalid && <Notice type="error">Choose valid dates in order and a positive whole invitation wording version.</Notice>}{params.error && <Notice type="error">{params.error}</Notice>}
    <form method="get" className="admin-library-search live-search-form"><label className="field"><span>Recipient email or phone</span><input type="search" name="q" defaultValue={q} maxLength={254} placeholder="name@example.com or +15555550123" /></label><label className="field"><span>Access state</span><select name="status" defaultValue={status}><option value="all">All grants</option><option value="active">Reserved access</option><option value="joined">Joined</option><option value="revoked">Revoked</option></select></label><label className="field"><span>Source</span><select name="source" defaultValue={source ?? ""}><option value="">All sources</option>{Object.entries(ACCESS_SOURCES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="button" type="submit">Search invitations</button><Link href="/admin/access">Clear</Link><details className="admin-filter-options" open={Boolean(params.systemMixVersion || params.from || params.through || review)}><summary>More filters{params.systemMixVersion || params.from || params.through || review ? " · active" : ""}</summary><div><label className="field"><span>Created from (UTC)</span><input name="from" type="date" defaultValue={params.from} /></label><label className="field"><span>Through (UTC)</span><input name="through" type="date" defaultValue={params.through} /></label><label><input type="checkbox" name="review" value="1" defaultChecked={review} />Delivery needs review</label>
      <label className="field"><span>Invitation wording version</span><input name="systemMixVersion" type="number" min={1} max={2_147_483_647} step={1} defaultValue={params.systemMixVersion} /><small>Personal referral wording only; blank includes every source.</small></label></div></details>
    </form><p className="admin-result-summary" role="status">{count} matching invitations</p>
    <div className="admin-queue" role="region" aria-label="Results" tabIndex={0}>{invites.map(invite => <article className="admin-queue-row" key={invite.id}><div><h2><Link href={adminQuery(`/admin/access/${invite.id}`, { returnTo: href(page) })}>{invite.recipientEmail ?? invite.recipientPhone}</Link></h2><p>{ACCESS_SOURCES[invite.source]} · {formatDateTime(invite.createdAt, display)}</p></div><div className="page-actions"><span className="status-pill">Grant: {accessGrantLabel(invite)}</span><span className="status-pill">{invite.manualDelivery ? "Member sends from Today" : `Email: ${invite.delivery?.status.toLowerCase() ?? "legacy record"}`}</span><Link className="button small" href={adminQuery(`/admin/access/${invite.id}`, { returnTo: href(page) })}>Review</Link></div></article>)}</div>
    {!count && <p>No invitations match these filters.</p>}<AdminPagination page={page} total={count} pageSize={50} href={href} />
  </div>;
}
