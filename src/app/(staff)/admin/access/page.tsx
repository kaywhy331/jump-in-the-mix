import { emailDeliveryLabel } from "@/lib/email-status";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { manageAccessInvitationAction } from "@/lib/access-admin-actions";
import { WAITLIST_RETRY_WINDOW_MS } from "@/lib/waitlist-delivery";
import { formatDateTime } from "@/lib/format";
import { displayPreferencesForUser } from "@/lib/display-preferences";

export const metadata: Metadata = { title: "Admin · Invitations" };

export default async function AdminAccessPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; review?: string; systemMixVersion?: string; error?: string; done?: string }> }) {
  const { user, permissions } = await requirePlatformAdmin("access.read");
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 254) ?? "";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const review = params.review === "1";
  const version = Number(params.systemMixVersion);
  const validVersion = Number.isSafeInteger(version) && version > 0 && version <= 2_147_483_647;
  const invalidVersion = Boolean(params.systemMixVersion) && !validVersion;
  const where = { ...(validVersion ? { systemMixVersion: version } : invalidVersion ? { systemMixVersion: -1 } : {}), ...(q ? { recipientEmail: { contains: q, mode: "insensitive" as const } } : {}), ...(review ? { delivery: { status: "REVIEW" as const } } : {}) };
  const [invites, count, preferences] = await Promise.all([
    prisma.referralAccessInvite.findMany({ where, select: { id: true, recipientEmail: true, source: true, systemMixVersion: true, createdAt: true, acceptedAt: true, revokedAt: true, lastSentAt: true, delivery: { select: { status: true, attempts: true, firstAttemptAt: true, providerId: true, lastError: true, emailMessage: { select: { acceptedAt: true, deliveredAt: true, delayedAt: true, bouncedAt: true, complainedAt: true, suppressedAt: true, failedAt: true } } } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50 }),
    prisma.referralAccessInvite.count({ where }), displayPreferencesForUser(user.id)
  ]);
  const href = (next: number) => `/admin/access?${new URLSearchParams({ q, review: review ? "1" : "0", systemMixVersion: params.systemMixVersion ?? "", page: String(next) })}`;
  return <div className="page">
    <header className="page-header"><div><h1>Admin · Invitations</h1><p>Review member and waitlist invitations, email acceptance, and delivery problems.</p></div></header>
    {invalidVersion && <Notice type="error">Enter a positive whole System Mix version.</Notice>}
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.done === "revoke" && <Notice>The invitation was revoked. Any email already being sent will contain an unusable link.</Notice>}
    {params.done === "retry" && <Notice>The same invitation email is queued for another attempt.</Notice>}
    <section className="card form-stack"><h2>Find invitations · {count}</h2>
      <form method="get" className="form-stack"><label className="field"><span>Recipient email</span><input type="search" name="q" defaultValue={q} maxLength={254} /></label>
        <label className="field"><span>System Mix version</span><input name="systemMixVersion" type="number" min={1} max={2_147_483_647} step={1} defaultValue={validVersion ? version : ""} /><small>Leave blank to include all invitation sources and legacy records.</small></label>
        <label><input type="checkbox" name="review" value="1" defaultChecked={review} /> Only deliveries needing review</label><button className="button">Search invitations</button>
      </form>
      <p>Revoking does not restore a member’s invitation slot or automatically return someone to the waitlist. Provider acceptance does not confirm inbox delivery.</p>
    </section>
    {!invites.length && <section className="card"><p>No invitations match these filters.</p></section>}
    {invites.map(invite => {
      const active = !invite.acceptedAt && !invite.revokedAt;
      const retry = active && permissions.includes("jobs.retry") && invite.delivery?.status === "REVIEW" && invite.delivery.firstAttemptAt && Date.now() - invite.delivery.firstAttemptAt.getTime() < WAITLIST_RETRY_WINDOW_MS;
      return <section className="card form-stack" key={invite.id} style={{ overflowWrap: "anywhere" }}><h2>{invite.recipientEmail}</h2>
        <p>{invite.source.replaceAll("_", " ")} · {invite.acceptedAt ? "Joined" : invite.revokedAt ? "Revoked" : invite.delivery?.status ?? (invite.lastSentAt ? "SENT" : "Legacy delivery needs review")}</p>
        {invite.source === "REFERRAL" && <p>{invite.systemMixVersion ? `System Mix version ${invite.systemMixVersion}` : "System Mix version unavailable · legacy invitation"}</p>}
        <p>Created {formatDateTime(invite.createdAt, preferences)} · Record {invite.id}</p>
        {invite.delivery && <p>{invite.delivery.attempts} delivery attempts{invite.delivery.providerId ? ` · Provider record ${invite.delivery.providerId}` : ""}</p>}
        {invite.delivery?.emailMessage && <p>{emailDeliveryLabel(invite.delivery.emailMessage)}</p>}
        {invite.delivery?.lastError && <Notice>{invite.delivery.lastError}</Notice>}
        {active && invite.delivery?.status === "REVIEW" && !retry && <p>Automatic retry is unavailable. An operator must inspect the provider record before another send.</p>}
        {(active && permissions.includes("access.revoke") || retry) && <form action={manageAccessInvitationAction} className="form-stack"><input type="hidden" name="inviteId" value={invite.id} />{validVersion && <input type="hidden" name="systemMixVersion" value={version} />}
          <label className="field"><span>Reason for invitation change</span><input name="reason" minLength={10} maxLength={500} required /></label>
          <div className="form-actions">{active && permissions.includes("access.revoke") && <button className="button" name="operation" value="revoke">Revoke invitation</button>}{retry && <button className="button" name="operation" value="retry">Retry same invitation email</button>}</div>
        </form>}
      </section>;
    })}
    <nav className="page-actions" aria-label="Invitation pages">{page > 1 && <Link href={href(page - 1)}>Previous</Link>}<span>Page {page}</span>{page * 50 < count && <Link href={href(page + 1)}>Next</Link>}</nav>
  </div>;
}
