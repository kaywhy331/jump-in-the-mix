import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdmissionSnapshot, issuanceProblem } from "@/lib/admission";
import { inviteWaitlistSelectionAction, retryWaitlistDeliveryAction, setWaitlistScheduleAction } from "@/lib/waitlist-admin-actions";
import { WAITLIST_RETRY_WINDOW_MS } from "@/lib/waitlist-delivery";
import { waitlistSendingReady } from "@/lib/waitlist";

export const metadata: Metadata = { title: "Admin · Waitlist" };
const date = (value: Date | null) => value ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC` : "—";

export default async function AdminWaitlistPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; page?: string; error?: string; queued?: string; skipped?: string; retry?: string }> }) {
  const { permissions } = await requirePlatformAdmin("waitlist.read");
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 254);
  const view = params.view === "history" ? "history" : "waiting";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const where = { status: view === "waiting" ? "WAITING" as const : { in: ["ACCESS_GRANTED" as const, "JOINED" as const, "WITHDRAWN" as const, "SUPPRESSED" as const] }, ...(query ? { email: { contains: query, mode: "insensitive" as const } } : {}) };
  const [entries, count, eligible, schedule, waves, problems, audit, worker] = await Promise.all([
    prisma.waitlistEntry.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50, skip: (page - 1) * 50 }),
    prisma.waitlistEntry.count({ where }),
    prisma.waitlistEntry.count({ where: { status: "WAITING", verifiedAt: { not: null } } }),
    prisma.waitlistSchedule.findUnique({ where: { id: "default" } }),
    prisma.waitlistWave.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.waitlistDelivery.findMany({ where: { status: { in: ["QUEUED", "SENDING", "REVIEW"] }, invite: { source: { not: "REFERRAL" } } }, select: { id: true, status: true, firstAttemptAt: true, lastError: true, invite: { select: { recipientEmail: true } } }, orderBy: { createdAt: "asc" }, take: 50 }),
    prisma.waitlistAudit.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } })
  ]);
  const emails = entries.map(entry => entry.email);
  const admission = await getAdmissionSnapshot();
  const admissionProblem = issuanceProblem(admission, "WAITLIST", Math.min(eligible, 10));
  const invites = await prisma.referralAccessInvite.findMany({ where: { recipientEmail: { in: emails } }, select: { recipientEmail: true, source: true, lastSentAt: true, acceptedAt: true, revokedAt: true, delivery: { select: { status: true } } }, orderBy: { createdAt: "desc" } });
  const href = (nextPage: number) => `/admin/waitlist?${new URLSearchParams({ q: query, view, page: String(nextPage) })}`;
  return <div className="page">
    <header className="page-header"><div><h1>Admin · Waitlist</h1><p>Every 7 days: 5 earliest confirmed signups, then 5 randomly selected from the rest. {eligible} eligible now.</p></div></header>
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.queued !== undefined && <Notice>{Number(params.queued) || 0} invitations queued. {Number(params.skipped) || 0} skipped because they were no longer eligible. The worker sends queued email.</Notice>}
    {params.retry && <Notice>Delivery queued for another attempt.</Notice>}
    {!waitlistSendingReady() && <Notice type="error">Sending is unavailable. Configure RESEND_API_KEY, EMAIL_FROM, and DATA_ENCRYPTION_KEY, and disable pilot mode before opening the waitlist.</Notice>}
    <section className="card form-stack" aria-labelledby="schedule-title">
      <h2 id="schedule-title">Automatic waves</h2>
      <p>{admission.remaining} spaces available for new invitations. {admissionProblem ? "The next eligible batch will wait for admission capacity or resumed issuance." : "The eligible batch fits the current admission limits."}</p>
      {permissions.includes("settings.manage") && <Link className="inline-action" href="/admin/admission">Manage admission limits and pauses</Link>}
      <p>{schedule ? schedule.paused ? "New weekly waves are paused." : `Next wave: ${date(schedule.nextRunAt)}.` : "The first wave is scheduled 7 days after the configured worker first runs."}</p>
      <p>Last worker check-in: {date(worker?.lastSeenAt ?? null)}. <Link href="/admin/operations">Check worker health</Link>.</p>
      <p>Fewer than 10 eligible people? Everyone available is invited, up to 5 in each group. Missed weeks do not create extra waves. Pausing stops new waves; invitations already queued still send.</p>
      {permissions.includes("waves.pause") && <form action={setWaitlistScheduleAction} className="form-stack">
        <input type="hidden" name="scheduleAction" value={schedule?.paused ? "resume" : "pause"} />
        <label className="field"><span>Reason for schedule change</span><input name="reason" maxLength={500} required /></label>
        <button className="button" type="submit">{schedule?.paused ? "Resume · next wave in 7 days" : "Pause weekly waves"}</button>
      </form>}
    </section>
    <section className="card form-stack" aria-labelledby="waiting-title">
      <h2 id="waiting-title">{view === "waiting" ? "Waiting" : "Access history"} · {count}</h2>
      <nav className="page-actions" aria-label="Waitlist views"><Link href="/admin/waitlist">Waiting</Link><Link href="/admin/waitlist?view=history">Access history</Link></nav>
      <form method="get" className="form-stack"><input type="hidden" name="view" value={view} /><label className="field"><span>Search email</span><input name="q" type="search" defaultValue={query} /></label><button className="button" type="submit">Search</button></form>
      <form action={inviteWaitlistSelectionAction} className="form-stack">
        {entries.length === 0 && <p>No entries in this view.</p>}
        {entries.map(entry => {
          const invite = invites.find(item => item.recipientEmail === entry.email);
          const canInvite = permissions.includes("waitlist.manage") && entry.status === "WAITING" && Boolean(entry.verifiedAt);
          return <div className="card" key={entry.id} style={{ overflowWrap: "anywhere" }}>
            {view === "waiting" ? <label><input type="checkbox" name="entryId" value={entry.id} disabled={!canInvite} /> {entry.email}</label> : <strong>{entry.email}</strong>}
            <p>Requested {date(entry.createdAt)} · {entry.verifiedAt ? "Email confirmed" : "Awaiting email confirmation"}</p>
            {entry.status === "SUPPRESSED" && <p>Suppressed · email delivery stopped</p>}
            {entry.status === "WITHDRAWN" && <p>Withdrawn · {entry.withdrawnAt ? date(entry.withdrawnAt) : "Invitation emails stopped"}</p>}
            {invite && <p>{invite.source.replaceAll("_", " ")} · {invite.acceptedAt ? "Joined" : invite.revokedAt ? "Revoked" : invite.delivery?.status ?? (invite.lastSentAt ? "SENT" : "Reserved")} · {date(invite.lastSentAt)}</p>}
          </div>;
        })}
        {view === "waiting" && permissions.includes("waitlist.manage") && <><label className="field"><span>Reason for manual invitations</span><input name="reason" maxLength={500} required placeholder="For example, launch partners" /></label>
          <p>Select up to 50 confirmed entries on this page. Manual invitations are additional to the weekly ten and do not use your five personal invitations.</p>
          <button className="button primary" type="submit" disabled={!entries.some(entry => entry.verifiedAt)}>Send invitations to selected people</button></>}
      </form>
      <nav className="page-actions" aria-label="Waitlist pages">{page > 1 && <Link href={href(page - 1)}>Previous</Link>}<span>Page {page}</span>{page * 50 < count && <Link href={href(page + 1)}>Next</Link>}</nav>
    </section>
    <section className="card form-stack" aria-labelledby="delivery-title"><h2 id="delivery-title">Pending deliveries and problems</h2>
      <p>“Sent” means accepted by the email provider. This does not confirm inbox delivery.</p>
      {!problems.length && <p>No pending deliveries or problems.</p>}
      {problems.map(item => item.invite && <div key={item.id} style={{ overflowWrap: "anywhere" }}><strong>{item.invite.recipientEmail} · {item.status}</strong>{item.lastError && <p>{item.lastError}</p>}
        {permissions.includes("waitlist.manage") && item.status === "REVIEW" && item.firstAttemptAt && Date.now() - item.firstAttemptAt.getTime() < WAITLIST_RETRY_WINDOW_MS && <form action={retryWaitlistDeliveryAction}><input type="hidden" name="deliveryId" value={item.id} /><button className="button" type="submit">Retry same invitation</button></form>}
      </div>)}
      {problems.length === 50 && <p>Showing the oldest 50 pending deliveries.</p>}
    </section>
    <section className="card"><h2>Recent waves</h2>{!waves.length && <p>No waves yet.</p>}{waves.map(wave => <p key={wave.id}>{date(wave.createdAt)} · {wave.fifoCount} in signup order + {wave.randomCount} random</p>)}</section>
    <section className="card"><h2>Recent waitlist activity</h2>{!audit.length && <p>No activity yet.</p>}{audit.map(item => <p key={item.id} style={{ overflowWrap: "anywhere" }}>{date(item.createdAt)} · {item.action.replaceAll("_", " ")} · {item.actorUserId ? `Admin ${item.actorUserId}` : "System"}{item.reason ? ` · ${item.reason}` : ""}</p>)}</section>
  </div>;
}
