import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, ReferralStatus } from "@/generated/prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { referralRewardStatusLabel } from "@/lib/referral";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin · Referrals" };

type SearchParams = { q?: string; status?: string };

const statuses: Array<{ value: ReferralStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "ATTRIBUTED", label: "Attributed" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "REVOKED", label: "Revoked" }
];

export default async function AdminReferralsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params] = await Promise.all([searchParams, requirePlatformAdmin()]);
  const query = params.q?.trim() ?? "";
  const status = statuses.some((item) => item.value === params.status) ? params.status as ReferralStatus : null;
  const matchingWorkspaces = query
    ? await prisma.workspace.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { owner: { name: { contains: query, mode: "insensitive" } } },
            { owner: { email: { contains: query, mode: "insensitive" } } }
          ]
        },
        select: { id: true }
      })
    : [];
  const matchingAccounts = query
    ? await prisma.referralAccount.findMany({
        where: { code: { contains: query.toUpperCase() } },
        select: { workspaceId: true }
      })
    : [];
  const workspaceIds = [...new Set([...matchingWorkspaces, ...matchingAccounts].map((item) => item.id ?? item.workspaceId))];
  const where: Prisma.ReferralWhereInput = {
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { codeUsed: { contains: query.toUpperCase() } },
            { referrerWorkspaceId: { in: workspaceIds } },
            { referredWorkspaceId: { in: workspaceIds } }
          ]
        }
      : {})
  };

  const now = new Date();
  const [referrals, qualifiedCount, attributedCount, activePlusCount, bankedDays, cappedCount] = await Promise.all([
    prisma.referral.findMany({
      where,
      include: { rewards: true },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prisma.referral.count({ where: { status: "QUALIFIED" } }),
    prisma.referral.count({ where: { status: "ATTRIBUTED" } }),
    prisma.referralAccount.count({ where: { plusExpiresAt: { gt: now } } }),
    prisma.referralAccount.aggregate({ _sum: { bankedDays: true } }),
    prisma.referralReward.count({ where: { recipient: "REFERRER", status: "CAPPED" } })
  ]);

  const allWorkspaceIds = [...new Set(referrals.flatMap((item) => [item.referrerWorkspaceId, item.referredWorkspaceId]))];
  const [workspaces, accounts] = await Promise.all([
    allWorkspaceIds.length
      ? prisma.workspace.findMany({
          where: { id: { in: allWorkspaceIds } },
          include: { owner: { select: { name: true, email: true } } }
        })
      : [],
    allWorkspaceIds.length
      ? prisma.referralAccount.findMany({ where: { workspaceId: { in: allWorkspaceIds } } })
      : []
  ]);
  const workspaceById = new Map(workspaces.map((item) => [item.id, item]));
  const accountById = new Map(accounts.map((item) => [item.workspaceId, item]));

  return (
    <div className="page admin-referrals-page">
      <header className="page-header">
        <div>
          <h1>Admin · Referrals</h1>
          <p>Review attributed signups, qualified rewards, active Plus access, banked Pro credits, and cap enforcement.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/admin/users">Users</Link>
          <Link className="button" href="/admin/billing">Billing</Link>
          <Link className="button" href="/admin/support">Support</Link>
          <Link className="button" href="/admin/templates">Templates</Link>
        </div>
      </header>

      <section className="stats-grid admin-referral-stats">
        <article className="stat-card"><small>Qualified referrals</small><strong>{qualifiedCount}</strong></article>
        <article className="stat-card"><small>Awaiting qualification</small><strong>{attributedCount}</strong></article>
        <article className="stat-card"><small>Active referral Plus</small><strong>{activePlusCount}</strong></article>
        <article className="stat-card"><small>Banked Plus days</small><strong>{bankedDays._sum.bankedDays ?? 0}</strong></article>
      </section>

      <form className="card admin-referral-filters" method="get">
        <label className="field admin-referral-query">
          <span className="field-label">Search</span>
          <input name="q" defaultValue={query} placeholder="Invite code, workspace, user, or email" />
        </label>
        <label className="field">
          <span className="field-label">Status</span>
          <select name="status" defaultValue={status ?? "all"}>
            {statuses.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div className="admin-referral-filter-actions">
          <button className="button primary" type="submit">Apply filters</button>
          <Link className="button" href="/admin/referrals">Clear</Link>
        </div>
      </form>

      {cappedCount > 0 && (
        <div className="notice info">{cappedCount} qualified referral reward{cappedCount === 1 ? " has" : "s have"} reached the 360-day referrer cap.</div>
      )}

      <section className="admin-referral-list">
        {referrals.map((referral) => {
          const referrer = workspaceById.get(referral.referrerWorkspaceId);
          const referred = workspaceById.get(referral.referredWorkspaceId);
          const referrerAccount = accountById.get(referral.referrerWorkspaceId);
          const referrerReward = referral.rewards.find((reward) => reward.recipient === "REFERRER");
          const referredReward = referral.rewards.find((reward) => reward.recipient === "REFERRED");
          return (
            <article className="card admin-referral-row" key={referral.id}>
              <div className="admin-referral-heading">
                <div>
                  <span className="support-ticket-reference">{referral.codeUsed}</span>
                  <h2>{referrer?.owner.name ?? "Unknown referrer"} → {referred?.owner.name ?? "Unknown signup"}</h2>
                  <p>{referrer?.owner.email ?? referral.referrerWorkspaceId} → {referred?.owner.email ?? referral.referredWorkspaceId}</p>
                </div>
                <span className={`status-pill ${referral.status === "QUALIFIED" ? "done" : ""}`}>{referral.status.toLowerCase()}</span>
              </div>
              <div className="admin-referral-context">
                <span>Invited {formatDateTime(referral.createdAt)}</span>
                <span>{referral.qualifiedAt ? `Qualified ${formatDateTime(referral.qualifiedAt)}` : "Email qualification pending"}</span>
                <span>{referrer?.name ?? referral.referrerWorkspaceId}</span>
                <span>{referred?.name ?? referral.referredWorkspaceId}</span>
              </div>
              <div className="admin-referral-rewards">
                <div>
                  <strong>Referrer reward</strong>
                  <span>{referrerReward ? referralRewardStatusLabel(referrerReward.status) : "Missing"}</span>
                  <small>{referrerReward?.days ?? 0} days{referrerReward?.endsAt ? ` · through ${formatDate(referrerReward.endsAt)}` : ""}</small>
                </div>
                <div>
                  <strong>Friend signup reward</strong>
                  <span>{referredReward ? referralRewardStatusLabel(referredReward.status) : "Missing"}</span>
                  <small>{referredReward?.days ?? 0} days{referredReward?.endsAt ? ` · through ${formatDate(referredReward.endsAt)}` : ""}</small>
                </div>
                <div>
                  <strong>Referrer balance</strong>
                  <span>{referrerAccount?.bankedDays ?? 0} banked days</span>
                  <small>{referrerAccount?.plusExpiresAt ? `Active through ${formatDate(referrerAccount.plusExpiresAt)}` : "No active referral window"}</small>
                </div>
              </div>
            </article>
          );
        })}
        {!referrals.length && (
          <div className="empty-state">
            <div className="empty-icon">↗</div>
            <h2>No referrals match these filters</h2>
            <p>Referral attribution will appear after a visitor follows a workspace invite and creates an account.</p>
          </div>
        )}
      </section>
    </div>
  );
}
