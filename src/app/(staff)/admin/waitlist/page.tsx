import { WaitlistSelectionForm } from "@/components/WaitlistSelectionForm";
import { AdminPagination } from "@/components/AdminPagination";
import { AdminDraftForm } from "@/components/AdminDraftForm";
import { adminQuery } from "@/lib/admin-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdmissionSnapshot, issuanceProblem } from "@/lib/admission";
import { retryWaitlistDeliveryAction, setWaitlistScheduleAction } from "@/lib/waitlist-admin-actions";
import { WAITLIST_RETRY_WINDOW_MS } from "@/lib/waitlist-delivery";
import { waitlistSendingReady } from "@/lib/waitlist";

export const metadata: Metadata = { title: "Admin · Waitlist" };
const date = (value: Date | null) => value ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC` : "—";

export default async function AdminWaitlistPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; page?: string; error?: string; at?: string; sig?: string; queued?: string; skipped?: string; retry?: string; confirmed?: string; scheduleSaved?: string }> }) {
  const { session, permissions } = await requirePlatformAdmin("waitlist.read");
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 254);
  const view = ["history", "delivery", "waves"].includes(params.view ?? "") ? params.view! : "waiting";
  const confirmed = params.confirmed === "confirmed" || params.confirmed === "unconfirmed" ? params.confirmed : "all";
  const requestedPage = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const where = { ...(confirmed === "confirmed" ? { verifiedAt: { not: null } } : confirmed === "unconfirmed" ? { verifiedAt: null } : {}), status: view !== "history" ? "WAITING" as const : { in: ["ACCESS_GRANTED" as const, "JOINED" as const, "WITHDRAWN" as const, "SUPPRESSED" as const] }, ...(query ? { email: { contains: query, mode: "insensitive" as const } } : {}) };
  const deliveryWhere = { status: { in: ["QUEUED" as const, "SENDING" as const, "REVIEW" as const] }, invite: { source: { not: "REFERRAL" as const }, ...(query ? { recipientEmail: { contains: query, mode: "insensitive" as const } } : {}) } };
  const [count, deliveryCount] = await Promise.all([prisma.waitlistEntry.count({ where }), prisma.waitlistDelivery.count({ where: deliveryWhere })]);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil((view === "delivery" ? deliveryCount : count) / 50)));
  const [entries, eligible, schedule, waves, problems, audit, worker] = await Promise.all([
    prisma.waitlistEntry.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50, skip: (page - 1) * 50 }),
    prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM "WaitlistEntry" w WHERE w.status='WAITING' AND w."verifiedAt" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.email=w.email)
      AND NOT EXISTS (SELECT 1 FROM "EmailSuppression" s WHERE s.email=w.email AND s."clearedAt" IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "ReferralAccessInvite" i WHERE i."recipientEmail"=w.email AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL)`.then(rows => rows[0]?.count ?? 0),
    prisma.waitlistSchedule.findUnique({ where: { id: "default" } }),
    prisma.waitlistWave.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.waitlistDelivery.findMany({ where: deliveryWhere, select: { id: true, status: true, firstAttemptAt: true, lastError: true, invite: { select: { recipientEmail: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50, skip: view === "delivery" ? (page - 1) * 50 : 0 }),
    prisma.waitlistAudit.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } })
  ]);
  const emails = entries.map(entry => entry.email);
  const admission = await getAdmissionSnapshot();
  const admissionProblem = issuanceProblem(admission, "WAITLIST", Math.min(eligible, 10));
  const sendingReady = waitlistSendingReady();
  // A smaller manual selection can fit even when the full weekly batch cannot.
  const manualProblem = issuanceProblem(admission, "WAITLIST") ?? (!sendingReady ? "Sending unavailable. Check email configuration." : null);
  const invites = await prisma.referralAccessInvite.findMany({ where: { recipientEmail: { in: emails } }, select: { id: true, recipientEmail: true, source: true, lastSentAt: true, acceptedAt: true, revokedAt: true, delivery: { select: { status: true } } }, orderBy: { createdAt: "desc" } });
  const [blocked, existing, actors] = await Promise.all([
    prisma.emailSuppression.findMany({ where: { email: { in: emails }, clearedAt: null }, select: { email: true } }),
    prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    prisma.user.findMany({ where: { id: { in: audit.flatMap(row => row.actorUserId ? [row.actorUserId] : []) } }, select: { id: true, name: true } })
  ]);
  const unavailable = new Set([...blocked, ...existing].map(row => row.email));
  for (const invite of invites) if (invite.recipientEmail && !invite.acceptedAt && !invite.revokedAt) unavailable.add(invite.recipientEmail);
  const names = new Map(actors.map(person => [person.id, person.name]));
  const href = (nextPage: number) => adminQuery("/admin/waitlist", { q: query, view, confirmed, page: nextPage });
  return <div className="page admin-waitlist-page">
    <header className="page-header"><div><h1>Waitlist</h1></div></header>
    <UrlErrorNotice params={params} viewer={session} />
    {params.queued !== undefined && <Notice>{Number(params.queued) || 0} invitations queued. {Number(params.skipped) || 0} skipped because they were no longer eligible. The worker sends queued email.</Notice>}
    {params.retry && <Notice>Delivery queued for another attempt.</Notice>}
    {params.scheduleSaved && <Notice>Weekly wave schedule updated.</Notice>}
    <nav className="admin-content-tabs" aria-label="Waitlist views">{[["waiting", "Waiting"], ["history", "Access history"], ["delivery", "Delivery"], ["waves", "Waves and activity"]].map(([key,label]) => <Link key={key} href={adminQuery("/admin/waitlist", { view: key, q: query, confirmed })} aria-current={view === key ? "page" : undefined}>{label}</Link>)}</nav>
    <p role="status" className="admin-inline-status">{eligible} eligible · {admission.remaining} waitlist email-grant spaces available · {manualProblem?.split(". ")[0] ?? "Ready to queue invitations."}</p>

    {["waiting", "history"].includes(view) && <section className="card form-stack" aria-labelledby="waiting-title">
      <h2 id="waiting-title">{view === "waiting" ? "Waiting" : "Access history"} · {count}</h2>
      <form method="get" className="admin-library-search live-search-form"><input type="hidden" name="view" value={view} /><label className="field"><span>Search email</span><input name="q" type="search" defaultValue={query} /></label><label className="field"><span>Email confirmation</span><select name="confirmed" defaultValue={confirmed}><option value="all">All requests</option><option value="confirmed">Confirmed</option><option value="unconfirmed">Awaiting confirmation</option></select></label><button className="button" type="submit">Search</button></form>
      {!entries.length ? <section className="card"><h2>No requests in this view</h2><p>{manualProblem ?? "Share the public waitlist link to collect requests, or adjust the search filters."}</p><Link href="/waitlist">Open public waitlist</Link>{permissions.includes("settings.manage") && <Link href="/admin/admission">Review admission readiness</Link>}</section> : <WaitlistSelectionForm returnTo={href(page)} capacity={admission.remaining} problem={manualProblem} canManage={view === "waiting" && permissions.includes("waitlist.manage")} saved={params.queued !== undefined ? `${params.queued}:${params.skipped}` : undefined} rows={entries.map(entry => ({ id: entry.id, email: entry.email, requested: date(entry.createdAt), href: permissions.includes("access.read") && invites.find(invite => invite.recipientEmail === entry.email) ? adminQuery(`/admin/access/${invites.find(invite => invite.recipientEmail === entry.email)!.id}`, { returnTo: href(page) }) : undefined, confirmed: Boolean(entry.verifiedAt), canInvite: !manualProblem && entry.status === "WAITING" && Boolean(entry.verifiedAt) && !unavailable.has(entry.email), context: unavailable.has(entry.email) && entry.status === "WAITING" ? "Account, invitation or suppression prevents another grant." : entry.status === "WAITING" ? undefined : entry.status.toLowerCase().replaceAll("_", " ") }))} />}
      <AdminPagination page={page} total={count} pageSize={50} href={href} />
    </section>}
    <details className="card form-stack" aria-labelledby="schedule-title"><summary id="schedule-title">Wave schedule</summary>
      <p>{admission.remaining} waitlist email-grant spaces available for new invitations. {admissionProblem ? "The next eligible batch will wait for admission capacity or resumed issuance." : "The eligible batch fits the current admission limits."}</p>
      {permissions.includes("settings.manage") && <Link className="inline-action" href="/admin/admission">Manage admission limits and pauses</Link>}
      <p>{schedule ? schedule.paused ? "New weekly waves are paused." : `Next wave: ${date(schedule.nextRunAt)}.` : "The first wave is scheduled 7 days after the configured worker first runs."}</p>
      <p>Last worker check-in: {date(worker?.lastSeenAt ?? null)}. {permissions.includes("operations.read") && <Link href="/admin/operations?view=health">Check worker health</Link>}</p>
      <p>Fewer than 10 eligible people? Everyone available is invited, up to 5 in each group. Missed weeks do not create extra waves. Pausing stops new waves; invitations already queued still send.</p>
      {permissions.includes("waves.pause") && <AdminDraftForm draftKey="waitlist-schedule" fields={["reason"]} saved={params.scheduleSaved} action={setWaitlistScheduleAction}><input name="returnTo" type="hidden" value={href(page)} />
        <input type="hidden" name="scheduleAction" value={schedule?.paused ? "resume" : "pause"} />
        <label className="field"><span>Reason for schedule change</span><input name="reason" maxLength={500} required /></label>
        <button className="button" type="submit">{schedule?.paused ? "Resume · next wave in 7 days" : "Pause weekly waves"}</button>
      </AdminDraftForm>}
    </details>
    {view === "delivery" && <section className="card form-stack" aria-labelledby="delivery-title"><h2 id="delivery-title">Delivery queue</h2>
      <p>“Sent” means accepted by the email provider. This does not confirm inbox delivery.</p>
      {!problems.length && <p>No pending deliveries or problems.</p>}
      {problems.map(item => item.invite && <div key={item.id} style={{ overflowWrap: "anywhere" }}><strong>{item.invite.recipientEmail} · {item.status}</strong>{item.lastError && <p>{item.lastError}</p>}
        {permissions.includes("waitlist.manage") && item.status === "REVIEW" && item.firstAttemptAt && Date.now() - item.firstAttemptAt.getTime() < WAITLIST_RETRY_WINDOW_MS && <form action={retryWaitlistDeliveryAction}><input type="hidden" name="returnTo" value={href(page)} /><input type="hidden" name="deliveryId" value={item.id} /><button className="button" type="submit">Retry same invitation</button></form>}
      </div>)}
      <AdminPagination page={page} total={deliveryCount} pageSize={50} href={href} />
    </section>}
    {view === "waves" && <><section className="card"><h2>Recent waves (latest 10)</h2>{!waves.length && <p>No waves yet.</p>}{waves.map(wave => <p key={wave.id}>{date(wave.createdAt)} · {wave.fifoCount} in signup order + {wave.randomCount} random</p>)}</section>
    <section className="card"><h2>Recent waitlist activity (latest 20)</h2>{!audit.length && <p>No activity yet.</p>}{audit.map(item => <p key={item.id} style={{ overflowWrap: "anywhere" }}>{date(item.createdAt)} · {item.action.replaceAll("_", " ")} · {item.actorUserId ? names.get(item.actorUserId) ?? "Former staff member" : "System"}{item.reason ? ` · ${item.reason}` : ""}</p>)}</section></>}
  </div>;
}
