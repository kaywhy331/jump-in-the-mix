import { ReferralShareButton } from "@/components/ReferralShareButton";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  referralDaysRemaining,
  referralRewardStatusLabel,
  referralShareMessage,
  referralShareUrl,
  REFERRAL_MAX_REFERRER_DAYS
} from "@/lib/referral";
import { getReferralDashboard } from "@/lib/referral-service";

export async function ReferralAccountCard({
  workspaceId,
  planTier,
  impersonation
}: {
  workspaceId: string;
  planTier: "FREE" | "PLUS" | "PRO";
  impersonation: boolean;
}) {
  if (impersonation) {
    const existing = await prisma.referralAccount.findUnique({ where: { workspaceId }, select: { workspaceId: true } });
    if (!existing) {
      return (
        <section className="card account-referral-card" id="referrals">
          <div className="card-header"><div><h2>Referral history</h2><p>No referral account has been initialized for this workspace.</p></div></div>
          <div className="support-inline-empty referral-empty-state">
            <strong>No referral records are available.</strong>
            <span>View-only support access does not create referral codes or modify account state.</span>
          </div>
        </section>
      );
    }
  }

  const dashboard = await getReferralDashboard(workspaceId);
  const shareUrl = referralShareUrl(env.appUrl, dashboard.account.code);
  const shareMessage = referralShareMessage(shareUrl);
  const activeDays = referralDaysRemaining(dashboard.account.plusExpiresAt);
  const percentage = Math.min((dashboard.earnedDays / REFERRAL_MAX_REFERRER_DAYS) * 100, 100);

  return (
    <section className="card account-referral-card" id="referrals">
      <div className="card-header referral-card-header">
        <div>
          <h2>{impersonation ? "Referral history" : "Invite friends to Jump in the Mix"}</h2>
          {impersonation
            ? <p>Review qualification, reward, and entitlement state without exposing the shareable invite code.</p>
            : planTier !== "PRO" && <p>Friends start with 30 days of Plus. Each qualified signup earns your workspace 30 Plus days, up to 360 days.</p>}
        </div>
        {!impersonation && <ReferralShareButton message={shareMessage} />}
      </div>

      {!impersonation && (
        <div className="referral-code-row">
          <div><small>Your invite code</small><strong>{dashboard.account.code}</strong></div>
          <code>{shareUrl}</code>
        </div>
      )}

      <div className="referral-stats-grid">
        <article><small>Qualified friends</small><strong>{dashboard.qualifiedCount}</strong></article>
        <article><small>Plus days earned</small><strong>{dashboard.earnedDays}</strong></article>
        <article><small>Active days</small><strong>{activeDays}</strong></article>
        <article><small>Banked days</small><strong>{dashboard.account.bankedDays}</strong></article>
      </div>

      <div className="referral-progress-block">
        <div><span>Annual referral reward cap</span><strong>{dashboard.earnedDays}/{REFERRAL_MAX_REFERRER_DAYS} days</strong></div>
        <div className="plan-usage-track" aria-label={`${dashboard.earnedDays} of ${REFERRAL_MAX_REFERRER_DAYS} referral days earned`}>
          <span style={{ width: `${percentage}%` }} />
        </div>
        <small>{dashboard.remainingRewardDays} reward days remain before the one-year cap.</small>
      </div>

      {dashboard.account.plusExpiresAt && (
        <div className="notice info referral-entitlement-notice">
          Referral Plus access is available through {formatDate(dashboard.account.plusExpiresAt)}.
        </div>
      )}
      {planTier === "PRO" && dashboard.account.bankedDays > 0 && (
        <div className="notice info referral-entitlement-notice">
          Banked referral days stay preserved while Pro is active and begin automatically after paid access ends.
        </div>
      )}
      {dashboard.receivedFrom && (
        <div className="notice success referral-entitlement-notice">
          This workspace joined through {dashboard.receivedFrom.ownerName}&apos;s invitation and received a 30-day Plus signup reward.
        </div>
      )}

      <div className="referral-history-heading">
        <div><h3>Referral history</h3><p>Qualification and reward state are recorded separately from Stripe billing.</p></div>
        <span className="status-pill">{dashboard.history.length}</span>
      </div>
      <div className="referral-history-list">
        {dashboard.history.slice(0, 12).map((item) => (
          <article className="referral-history-row" key={item.id}>
            <div>
              <strong>{item.referredOwnerName}</strong>
              <span>{item.referredOwnerEmail}</span>
              <small>{item.referredWorkspaceName} · Invited {formatDateTime(item.createdAt)}</small>
            </div>
            <div className="referral-history-state">
              <span className={`status-pill ${item.status === "QUALIFIED" ? "done" : ""}`}>{item.status.toLowerCase()}</span>
              <small>{item.rewardStatus ? referralRewardStatusLabel(item.rewardStatus) : "Pending"}{item.rewardDays ? ` · ${item.rewardDays} days` : ""}</small>
              {item.rewardEndsAt && <small>Through {formatDate(item.rewardEndsAt)}</small>}
            </div>
          </article>
        ))}
        {!dashboard.history.length && (
          <div className="support-inline-empty referral-empty-state">
            <strong>No invitations have qualified yet.</strong>
            <span>{impersonation ? "This workspace has no qualified referral history." : "Share your invite from the header or this card. Rewards appear after the friend completes qualification."}</span>
          </div>
        )}
      </div>
    </section>
  );
}
