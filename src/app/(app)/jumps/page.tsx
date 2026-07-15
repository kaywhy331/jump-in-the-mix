import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { updateJumpStatusAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
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
};

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
  if (pendingStatuses.includes(status)) return "Pending";
  if (status === "SKIPPED") return "Skipped";
  return "Done";
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

  const channelWhere: Prisma.JumpWhereInput = channel === "all"
    ? {}
    : { stepVersion: { stepTemplate: { channel } } };

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

  const jumps = await prisma.jump.findMany({
    where: { workspaceId: workspace.id, ...statusWhere, ...dateWhere, ...channelWhere },
    include: {
      contact: { include: { emails: true, phones: true } },
      mix: true,
      stepVersion: { include: { stepTemplate: true } }
    },
    orderBy: { scheduledAt: "asc" },
    take: 300
  });

  const ordered = [...jumps].sort((left, right) => {
    const leftPending = pendingStatuses.includes(left.status) ? 0 : 1;
    const rightPending = pendingStatuses.includes(right.status) ? 0 : 1;
    return leftPending - rightPending || left.scheduledAt.getTime() - right.scheduledAt.getTime();
  });
  const pending = ordered.filter((jump) => pendingStatuses.includes(jump.status));
  const completed = ordered.filter((jump) => completedStatuses.includes(jump.status));
  const currentFilters = { range, status, channel };

  const renderCard = (jump: (typeof ordered)[number]) => {
    const snapshot = (jump.renderedSnapshot ?? {}) as Snapshot;
    const email = jump.contact.emails.find((item) => item.isPrimary)?.email ?? jump.contact.emails[0]?.email;
    const phone = jump.contact.phones.find((item) => item.isPrimary)?.phone ?? jump.contact.phones[0]?.phone;
    const jumpChannel = jump.stepVersion.stepTemplate.channel;
    const url = actionUrl(jumpChannel, email, phone, snapshot);
    const content = snapshot.body ?? snapshot.script ?? snapshot.subject ?? "No message content was saved for this Jump.";
    const snippet = content.length > 120 ? `${content.slice(0, 117)}…` : content;
    const isPending = pendingStatuses.includes(jump.status);
    const nextStatus: JumpStatus = isPending ? "DONE" : "PENDING";

    return (
      <article className={`jump-card jump-task-card ${isPending ? "" : "jump-task-complete"}`} key={jump.id}>
        <form action={updateJumpStatusAction} className="jump-status-column">
          <input type="hidden" name="jumpId" value={jump.id} />
          <input type="hidden" name="status" value={nextStatus} />
          <button className={`jump-status-button ${isPending ? "" : "done"}`} type="submit" title={isPending ? "Mark this Jump done" : "Undo and return this Jump to pending"}>
            <strong>{taskStatusLabel(jump.status)}</strong>
            <time>{formatDateTime(jump.scheduledAt)}</time>
          </button>
        </form>

        <details className="jump-details">
          <summary>
            <div className="jump-card-heading">
              <h3>{jump.contact.displayName}</h3>
              <span className="channel-pill">{channelLabel(jumpChannel)}</span>
            </div>
            <div className="jump-meta"><span>{jump.mix.name}</span><span>{jump.reason}</span></div>
            <p className="jump-snippet">{snippet}</p>
          </summary>
          <div className="jump-expanded-content">
            {snapshot.subject && <div><small className="field-label">Subject</small><p>{snapshot.subject}</p></div>}
            <div><small className="field-label">Prepared content</small><p>{snapshot.body ?? snapshot.script ?? "No content available."}</p></div>
            <div className="jump-secondary-actions">
              {isPending && <form action={updateJumpStatusAction}><input type="hidden" name="jumpId" value={jump.id} /><input type="hidden" name="status" value="SKIPPED" /><button className="button small danger" type="submit">Skip</button></form>}
              {!isPending && <form action={updateJumpStatusAction}><input type="hidden" name="jumpId" value={jump.id} /><input type="hidden" name="status" value="PENDING" /><button className="button small" type="submit">Undo</button></form>}
            </div>
          </div>
        </details>

        <div className="jump-primary-action">
          {url ? (
            <a href={url} target={jumpChannel === "WHATSAPP" ? "_blank" : undefined} rel="noreferrer" className="button primary icon-button" aria-label={`Open ${channelLabel(jumpChannel)} for ${jump.contact.displayName}`} title={`Open ${channelLabel(jumpChannel)}`}>
              <span aria-hidden="true">{channelIcon(jumpChannel)}</span>
            </a>
          ) : (
            <span className="status-pill" title={`Add a primary ${jumpChannel === "EMAIL" ? "email" : "phone"} to this contact first`}>Missing</span>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="page">
      {params.welcome && <Notice type="success">Your workspace is ready. Complete a prepared Jump or add a Contact and Jump Date to create more.</Notice>}
      {params.demo && <Notice type="info">You are in the local demo workspace. Actions remain on this computer.</Notice>}
      <header className="page-header"><div><h1>Jump</h1><p>Complete overdue and due outreach without hunting through a CRM.</p></div></header>

      <div className="filter-stack" aria-label="Jump filters">
        <div className="filter-bar filter-presets">
          {[["due", "Due"], ["week", "Week"], ["month", "Month"], ["all", "All dates"]].map(([key, label]) => (
            <a key={key} className={range === key ? "button primary" : "button"} href={filterHref(currentFilters, "range", key)}>{label}</a>
          ))}
        </div>
        <form className="filter-bar" method="get" action="/jumps">
          <input type="hidden" name="range" value={range} />
          <label className="filter-field"><span>Status</span><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="pending">Pending</option><option value="done">Done</option><option value="skipped">Skipped</option></select></label>
          <label className="filter-field"><span>Channel</span><select name="channel" defaultValue={channel}><option value="all">All channels</option>{channels.map((item) => <option key={item} value={item}>{channelLabel(item)}</option>)}</select></label>
          <button className="button" type="submit">Apply</button>
        </form>
      </div>

      {pending.length > 0 && <section aria-labelledby="pending-jumps"><div className="section-label"><h2 id="pending-jumps">Pending</h2><span>{pending.length}</span></div><div className="jump-list">{pending.map(renderCard)}</div></section>}
      {completed.length > 0 && <section aria-labelledby="completed-jumps"><div className="completed-divider"><span id="completed-jumps">Completed</span></div><div className="jump-list">{completed.map(renderCard)}</div></section>}
      {!ordered.length && <EmptyState title="No Jumps match these filters" description="Jumps appear automatically after an active Mix is assigned to a matching Contact and Jump Date." actionHref="/contacts" actionLabel="Review contacts" />}
    </div>
  );
}
