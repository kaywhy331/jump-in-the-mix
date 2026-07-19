import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { JumpActionLink, JumpCopyButton } from "@/components/JumpActionControls";
import { Notice } from "@/components/Notice";
import { snoozeJumpAction, updateJumpStatusAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";
import type { Channel, JumpStatus, Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Jump" };

type Snapshot = { subject?: string | null; body?: string | null; script?: string | null };
type SearchParams = {
  range?: string;
  status?: string;
  channel?: string;
  welcome?: string;
  demo?: string;
  applied?: string;
  mixStopped?: string;
  mixStopError?: string;
  snoozed?: string;
  firstContact?: string;
};

type ActionType = "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";

const pendingStatuses: JumpStatus[] = ["PENDING", "COPIED"];
const doneStatuses: JumpStatus[] = ["DONE", "SENT"];
const completedStatuses: JumpStatus[] = [...doneStatuses, "SKIPPED"];
const channels: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];

function actionUrl(channel: Channel, email: string | undefined, phone: string | undefined, snapshot: Snapshot): string | null {
  const body = encodeURIComponent(snapshot.body ?? snapshot.script ?? "");
  if (channel === "EMAIL" && email) return `mailto:${email}?subject=${encodeURIComponent(snapshot.subject ?? "")}&body=${body}`;
  if (channel === "SMS" && phone) return `sms:${phone}?body=${body}`;
  if (channel === "WHATSAPP" && phone) return `https://wa.me/${phone.replace(/\D/g, "")}?text=${body}`;
  if ((channel === "PHONE_CALL" || channel === "VOICEMAIL") && phone) return `tel:${phone}`;
  return null;
}

function actionType(channel: Channel): ActionType {
  if (channel === "PHONE_CALL") return "CALLED";
  if (channel === "VOICEMAIL") return "VOICEMAIL_STARTED";
  return "COMPOSED";
}

function channelIcon(channel: Channel): string {
  if (channel === "EMAIL") return "✉";
  if (channel === "PHONE_CALL") return "☎";
  if (channel === "VOICEMAIL") return "◉";
  if (channel === "WHATSAPP") return "◌";
  return "●";
}

function channelLabel(channel: Channel): string {
  return channel.replaceAll("_", " ").toLowerCase();
}

function taskStatusLabel(status: JumpStatus): string {
  if (pendingStatuses.includes(status)) return "Mark done";
  if (status === "SKIPPED") return "Skipped";
  return "Done";
}

function eventLabel(action: string): string {
  if (action === "COPIED") return "Copied prepared content";
  if (action === "CALLED") return "Opened phone call";
  if (action === "VOICEMAIL_STARTED") return "Opened voicemail action";
  if (action === "COMPOSED") return "Opened channel composer";
  return "Opened Jump";
}

function filterHref(current: { range: string; status: string; channel: string }, key: "range" | "status" | "channel", value: string): string {
  const params = new URLSearchParams({ ...current, [key]: value });
  return `/jumps?${params.toString()}`;
}

export default async function JumpsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const range = ["due", "week", "month", "all"].includes(params.range ?? "") ? params.range! : "due";
  const status = ["all", "pending", "done", "skipped"].includes(params.status ?? "") ? params.status! : "all";
  const channel = params.channel && channels.includes(params.channel as Channel) ? params.channel as Channel : "all";
  const { workspace } = await requireWorkspace();
  const timezone = workspace.profile?.timezone ?? "UTC";
  const today = logicalDateInTimezone(new Date(), timezone);
  const startToday = zonedDateTimeToUtc(today, 0, timezone);
  const endToday = zonedDateTimeToUtc(addLogicalDays(today, 1), 0, timezone);
  const endWeek = zonedDateTimeToUtc(addLogicalDays(today, 7), 0, timezone);
  const endMonth = zonedDateTimeToUtc(addLogicalDays(today, 30), 0, timezone);
  const quietSince = zonedDateTimeToUtc(addLogicalDays(today, -60), 0, timezone);

  const channelWhere: Prisma.JumpWhereInput = channel === "all" ? {} : { stepVersion: { stepTemplate: { channel } } };

  let statusWhere: Prisma.JumpWhereInput;
  if (status === "pending") statusWhere = { status: { in: pendingStatuses } };
  else if (status === "done") statusWhere = { status: { in: doneStatuses } };
  else if (status === "skipped") statusWhere = { status: "SKIPPED" };
  else statusWhere = { status: { not: "CANCELED" } };

  let dateWhere: Prisma.JumpWhereInput = {};
  if (range === "due") {
    if (status === "pending") dateWhere = { scheduledAt: { lt: endToday } };
    else if (status === "done" || status === "skipped") dateWhere = { scheduledAt: { gte: startToday, lt: endToday } };
    else {
      dateWhere = {
        OR: [
          { status: { in: pendingStatuses }, scheduledAt: { lt: endToday } },
          { status: { in: completedStatuses }, scheduledAt: { gte: startToday, lt: endToday } }
        ]
      };
    }
  } else if (range === "week") dateWhere = { scheduledAt: { gte: startToday, lt: endWeek } };
  else if (range === "month") dateWhere = { scheduledAt: { gte: startToday, lt: endMonth } };

  const [jumps, dueThisWeekCount, quietRelationshipCount, completedTodayCount] = await Promise.all([prisma.jump.findMany({
    where: { workspaceId: workspace.id, ...statusWhere, ...dateWhere, ...channelWhere },
    include: {
      contact: { include: { emails: true, phones: true } },
      mix: true,
      stepVersion: { include: { stepTemplate: true } }
    },
    orderBy: { scheduledAt: "asc" },
    take: 300
  }), prisma.jump.count({ where: { workspaceId: workspace.id, status: { in: pendingStatuses }, scheduledAt: { gte: startToday, lt: endWeek } } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null, jumps: { none: { status: { in: doneStatuses }, completedAt: { gte: quietSince } } } } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: { in: completedStatuses }, completedAt: { gte: startToday, lt: endToday } } })]);
  const actionEvents = jumps.length
    ? await prisma.jumpActionEvent.findMany({
        where: { workspaceId: workspace.id, jumpId: { in: jumps.map((jump) => jump.id) } },
        orderBy: { occurredAt: "desc" },
        take: 900
      })
    : [];
  const eventsByJump = new Map<string, typeof actionEvents>();
  for (const event of actionEvents) {
    const events = eventsByJump.get(event.jumpId) ?? [];
    if (events.length < 3) events.push(event);
    eventsByJump.set(event.jumpId, events);
  }

  const ordered = [...jumps].sort((left, right) => {
    const leftPending = pendingStatuses.includes(left.status) ? 0 : 1;
    const rightPending = pendingStatuses.includes(right.status) ? 0 : 1;
    return leftPending - rightPending || left.scheduledAt.getTime() - right.scheduledAt.getTime();
  });
  const pending = ordered.filter((jump) => pendingStatuses.includes(jump.status));
  const overdue = pending.filter((jump) => jump.scheduledAt < startToday);
  const dueToday = pending.filter((jump) => jump.scheduledAt >= startToday && jump.scheduledAt < endToday);
  const upcoming = pending.filter((jump) => jump.scheduledAt >= endToday);
  const completed = ordered.filter((jump) => completedStatuses.includes(jump.status));
  const currentFilters = { range, status, channel };

  const renderCard = (jump: (typeof ordered)[number]) => {
    const snapshot = (jump.renderedSnapshot ?? {}) as Snapshot;
    const email = jump.contact.emails.find((item) => item.isPrimary)?.email ?? jump.contact.emails[0]?.email;
    const phone = jump.contact.phones.find((item) => item.isPrimary)?.phone ?? jump.contact.phones[0]?.phone;
    const jumpChannel = jump.stepVersion.stepTemplate.channel;
    const url = actionUrl(jumpChannel, email, phone, snapshot);
    const content = snapshot.body ?? snapshot.script ?? snapshot.subject ?? "No message content was saved for this Jump.";
    const copyContent = [snapshot.subject, snapshot.body ?? snapshot.script].filter(Boolean).join("\n\n");
    const snippet = content.length > 120 ? `${content.slice(0, 117)}…` : content;
    const isPending = pendingStatuses.includes(jump.status);
    const nextStatus: JumpStatus = isPending ? "DONE" : "PENDING";
    const recentEvents = eventsByJump.get(jump.id) ?? [];
    const daysOverdue = Math.max(1, Math.floor((startToday.getTime() - jump.scheduledAt.getTime()) / 86_400_000) + 1);
    const dueLabel = jump.scheduledAt < startToday
      ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`
      : jump.scheduledAt < endToday
        ? `Today · ${formatDateTime(jump.scheduledAt)}`
        : formatDateTime(jump.scheduledAt);

    return (
      <article id={`jump-${jump.id}`} className={`jump-card jump-task-card ${isPending ? "" : "jump-task-complete"}`} key={jump.id}>
        <details className="jump-details">
          <summary>
            <div className="jump-card-heading"><h3>{jump.contact.displayName}</h3><span className={jump.scheduledAt < startToday ? "due-pill overdue" : "due-pill"}>{dueLabel}</span><span className="channel-pill">{channelLabel(jumpChannel)}</span></div>
            <div className="jump-meta"><span>{jump.mix.name}</span><span>{jump.reason}</span></div>
            <p className="jump-snippet">{snippet}</p>
          </summary>
          <div className="jump-expanded-content">
            {snapshot.subject && <div><small className="field-label">Subject</small><p>{snapshot.subject}</p></div>}
            <div><small className="field-label">Prepared content</small><p>{snapshot.body ?? snapshot.script ?? "No content available."}</p></div>
            {recentEvents.length > 0 && <div className="jump-action-history"><small className="field-label">Recent actions</small>{recentEvents.map((event) => <span key={event.id}>{eventLabel(event.action)} · {formatDateTime(event.occurredAt)}</span>)}</div>}
            <div className="jump-secondary-actions">
              {copyContent && <JumpCopyButton jumpId={jump.id} text={copyContent} />}
              {!isPending && <form action={updateJumpStatusAction}><input type="hidden" name="jumpId" value={jump.id} /><input type="hidden" name="status" value="PENDING" /><button className="button small" type="submit">Undo</button></form>}
            </div>
          </div>
        </details>

        <div className="jump-primary-action">
          {url ? (
            <JumpActionLink
              jumpId={jump.id}
              action={actionType(jumpChannel)}
              href={url}
              target={jumpChannel === "WHATSAPP" ? "_blank" : undefined}
              className="button primary jump-channel-action"
              ariaLabel={`Open ${channelLabel(jumpChannel)} for ${jump.contact.displayName}`}
              title={`Open ${channelLabel(jumpChannel)}`}
            >
              <span aria-hidden="true">{channelIcon(jumpChannel)}</span><span>{jumpChannel === "PHONE_CALL" ? "Call" : jumpChannel === "VOICEMAIL" ? "Open notes" : jumpChannel === "EMAIL" ? "Open email" : jumpChannel === "WHATSAPP" ? "Open WhatsApp" : "Open text"}</span>
            </JumpActionLink>
          ) : <span className="status-pill" title={`Add a primary ${jumpChannel === "EMAIL" ? "email" : "phone"} to this contact first`}>Missing</span>}
          <div className="jump-completion-actions">
            <form action={updateJumpStatusAction}><input type="hidden" name="jumpId" value={jump.id} /><input type="hidden" name="status" value={nextStatus} /><button className={`button small jump-done-action ${isPending ? "" : "done"}`} type="submit">{taskStatusLabel(jump.status)}</button></form>
            {isPending && <details className="jump-overflow"><summary className="button small" aria-label={`More actions for ${jump.contact.displayName}`}>More</summary><div className="jump-overflow-panel"><strong>Snooze</strong>{[["later-today", "Later today"], ["tomorrow", "Tomorrow"], ["next-monday", "Next Monday"], ["next-week", "Next week"]].map(([preset, label]) => <form action={snoozeJumpAction} key={preset}><input type="hidden" name="jumpId" value={jump.id}/><input type="hidden" name="preset" value={preset}/><button className="text-button" type="submit">{label}</button></form>)}<form action={snoozeJumpAction} className="custom-snooze"><input type="hidden" name="jumpId" value={jump.id}/><input type="datetime-local" name="customDate" aria-label="Custom snooze date and time" required/><button className="button small" type="submit">Custom</button></form><form action={updateJumpStatusAction}><input type="hidden" name="jumpId" value={jump.id}/><input type="hidden" name="status" value="SKIPPED"/><button className="text-button danger-text" type="submit">Skip</button></form>{jump.mix.source !== "ONE_TIME" && <form action={stopMixForContactAction}><input type="hidden" name="mixId" value={jump.mixId}/><input type="hidden" name="contactId" value={jump.contactId}/><input type="hidden" name="returnTo" value="/jumps"/><button className="text-button danger-text" type="submit">Stop Mix</button></form>}</div></details>}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="page">
      {params.welcome && <Notice type="success">{params.firstContact ? `Your first Jump for ${params.firstContact} is ready below.` : "Your workspace is ready. Complete a prepared Jump or add a Contact and Important Date to create more."}</Notice>}
      {params.demo && <Notice type="info">You are in the local demo workspace. Actions remain on this computer.</Notice>}
      {params.applied && <Notice type="success">Created {params.applied} one-time Jump{params.applied === "1" ? "" : "s"} for the selected Contacts.</Notice>}
      {params.mixStopped && <Notice type="success">The Mix was stopped for this Contact. Its pending Jumps were removed from the queue.</Notice>}
      {params.mixStopError && <Notice type="error">The Mix could not be stopped for this Contact.</Notice>}
      {params.snoozed && <Notice type="success">Jump snoozed. It will return to your queue at the new time.</Notice>}
      <header className="page-header"><div><h1>Today</h1><p>One clear list of the people who need your attention and what to do next.</p></div><div className="today-summary" aria-label="Current Jump workload"><strong>{overdue.length + dueToday.length}</strong><span>due now</span>{overdue.length > 0 && <small>{overdue.length} overdue</small>}</div></header>

      <section className="today-operating-view" aria-label="Today at a glance"><article><small>Overdue</small><strong>{overdue.length}</strong></article><article><small>Due today</small><strong>{dueToday.length}</strong></article><article><small>Due this week</small><strong>{dueThisWeekCount}</strong></article><article><small>Completed today</small><strong>{completedTodayCount}</strong></article></section>
      {(overdue[0] ?? dueToday[0]) && <aside className="do-next-card"><span className="eyebrow">Do next</span><strong>{(overdue[0] ?? dueToday[0]).contact.displayName}</strong><span>{(overdue[0] ?? dueToday[0]).reason}</span><a className="button primary" href={`#jump-${(overdue[0] ?? dueToday[0]).id}`}>Open next action</a></aside>}
      <div className="today-insights"><Link href="/jumps?range=week&status=pending">Upcoming moments <strong>{dueThisWeekCount}</strong></Link><Link href="/contacts">Relationships going quiet <strong>{quietRelationshipCount}</strong></Link><Link href="/jumps?range=due&status=done">Recently completed <strong>{completedTodayCount}</strong></Link></div>

      <div className="filter-stack" aria-label="Jump filters">
        <div className="filter-bar filter-presets">
          {[["due", "Due"], ["week", "Week"], ["month", "Month"], ["all", "All dates"]].map(([key, label]) => <a key={key} className={range === key ? "button primary" : "button"} href={filterHref(currentFilters, "range", key)}>{label}</a>)}
        </div>
        <form className="filter-bar today-filter-controls" method="get" action="/jumps">
          <input type="hidden" name="range" value={range} />
          <label className="filter-field"><span>Status</span><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="pending">Pending</option><option value="done">Done</option><option value="skipped">Skipped</option></select></label>
          <label className="filter-field"><span>Channel</span><select name="channel" defaultValue={channel}><option value="all">All channels</option>{channels.map((item) => <option key={item} value={item}>{channelLabel(item)}</option>)}</select></label>
          <button className="button" type="submit">Apply</button>
        </form>
      </div>

      {overdue.length > 0 && <section aria-labelledby="overdue-jumps"><div className="section-label urgent"><h2 id="overdue-jumps">Overdue</h2><span>{overdue.length}</span></div><p className="section-guidance">Start with one. You can skip or stop a plan if it is no longer useful.</p><div className="jump-list">{overdue.map(renderCard)}</div></section>}
      {dueToday.length > 0 && <section aria-labelledby="today-jumps"><div className="section-label"><h2 id="today-jumps">Today</h2><span>{dueToday.length}</span></div><div className="jump-list">{dueToday.map(renderCard)}</div></section>}
      {upcoming.length > 0 && <section aria-labelledby="upcoming-jumps"><div className="section-label"><h2 id="upcoming-jumps">Upcoming</h2><span>{upcoming.length}</span></div><div className="jump-list">{upcoming.map(renderCard)}</div></section>}
      {completed.length > 0 && <section aria-labelledby="completed-jumps"><div className="completed-divider"><span id="completed-jumps">Completed</span></div><div className="jump-list">{completed.map(renderCard)}</div></section>}
      {!ordered.length && <EmptyState title="Nothing needs your attention" description="Jumps appear automatically after an active follow-up Mix is assigned to a Contact with a matching Important Date." actionHref="/contacts" actionLabel="Add or review Contacts" />}
    </div>
  );
}
