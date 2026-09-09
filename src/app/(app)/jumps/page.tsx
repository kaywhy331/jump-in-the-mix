import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditableFollowUpAction } from "@/components/EditableFollowUpAction";
import { EmptyState } from "@/components/EmptyState";
import { JumpActionLink } from "@/components/JumpActionControls";
import { JumpOutcomeButton, JumpReturnTray, JumpWorkflowCard } from "@/components/JumpWorkflow";
import { Notice } from "@/components/Notice";
import { TodayBriefing } from "@/components/TodayBriefing";
import { todayBriefing } from "@/lib/today-briefing";
import { PreparationNotice } from "@/components/PreparationNotice";
import { Sheet } from "@/components/Sheet";
import { TodayLink, TodayNavigation } from "@/components/TodayNavigation";
import type { Channel, JumpStatus, Prisma } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { addLogicalDays, logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";
import { readPreparationStatus } from "@/lib/preparation";
import { snoozeJumpAction } from "@/lib/snooze-actions";
import { parseTodayCursor, readTodayPage } from "@/lib/today-list";

export const metadata: Metadata = { title: "Today" };

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
  error?: string;
  after?: string;
  before?: string;
  listReset?: string;
};

type ActionType = "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";

const pendingStatuses: JumpStatus[] = ["PENDING"];
const doneStatuses: JumpStatus[] = ["DONE"];
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

function channelLabel(channel: Channel): string {
  if (channel === "PHONE_CALL") return "call";
  if (channel === "VOICEMAIL") return "voicemail";
  return channel.replaceAll("_", " ").toLowerCase();
}

function eventLabel(action: string): string {
  if (action === "COPIED") return "Copied message";
  if (action === "CALLED") return "Opened call";
  if (action === "VOICEMAIL_STARTED") return "Opened voicemail notes";
  if (action === "COMPOSED") return "Opened message";
  return "Opened follow-up";
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const range = ["due", "week", "month", "all"].includes(params.range ?? "") ? params.range! : "due";
  const status = ["all", "pending", "done", "skipped"].includes(params.status ?? "") ? params.status! : "all";
  const channel = params.channel && channels.includes(params.channel as Channel) ? params.channel as Channel : "all";
  const { workspace, user, impersonation } = await requireWorkspace();
  const displayPreferences = await displayPreferencesForUser(user.id);
  const timezone = displayPreferences.timeZone;
  const today = logicalDateInTimezone(new Date(), timezone);
  const startToday = zonedDateTimeToUtc(today, 0, timezone);
  const endToday = zonedDateTimeToUtc(addLogicalDays(today, 1), 0, timezone);
  const endWeek = zonedDateTimeToUtc(addLogicalDays(today, 7), 0, timezone);
  const endMonth = zonedDateTimeToUtc(addLogicalDays(today, 30), 0, timezone);

  const channelWhere: Prisma.JumpWhereInput = channel === "all" ? {} : { stepVersion: { stepTemplate: { channel } } };
  let statusWhere: Prisma.JumpWhereInput;
  if (status === "pending") statusWhere = { status: { in: pendingStatuses } };
  else if (status === "done") statusWhere = { status: { in: doneStatuses } };
  else if (status === "skipped") statusWhere = { status: "SKIPPED" };
  else statusWhere = { status: { not: "CANCELED" } };

  let dateWhere: Prisma.JumpWhereInput = {};
  if (range === "due") {
    dateWhere = status === "done" || status === "skipped"
      ? { completedAt: { gte: startToday, lt: endToday } }
      : status === "pending"
        ? { scheduledAt: { lt: endToday } }
        : { OR: [
            { status: { in: pendingStatuses }, scheduledAt: { lt: endToday } },
            { status: { in: completedStatuses }, completedAt: { gte: startToday, lt: endToday } }
          ] };
  } else if (range === "week") dateWhere = { scheduledAt: { gte: startToday, lt: endWeek } };
  else if (range === "month") dateWhere = { scheduledAt: { gte: startToday, lt: endMonth } };

  const where: Prisma.JumpWhereInput = { workspaceId: workspace.id, ...statusWhere, ...dateWhere, ...channelWhere };
  // Observe preparation first so a just-finished job cannot report ready beside an older list.
  const preparation = await readPreparationStatus(workspace.id);
  const [list, totalCount, pendingCount, attentionCount, overdueCount, dueThisWeekCount, completedTodayCount] = await Promise.all([
    readTodayPage(workspace.id, where, params),
    prisma.jump.count({ where }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING" }] } }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING", scheduledAt: { lt: endToday } }] } }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING", scheduledAt: { lt: startToday } }] } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: { in: pendingStatuses }, scheduledAt: { gte: startToday, lt: endWeek } } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: "DONE", completedAt: { gte: startToday, lt: endToday } } })
  ]);
  const followUps = list.items;
  const viewParams = new URLSearchParams({ range, status, channel });
  const firstHref = `/jumps?${viewParams}`;
  if (list.reset) redirect(`${firstHref}&listReset=1`);
  const pageHref = (direction: "after" | "before", cursor: string) => `${firstHref}&${direction}=${encodeURIComponent(cursor)}`;
  const currentCursor = parseTodayCursor(params.after) ? { direction: "after" as const, value: params.after! }
    : parseTodayCursor(params.before) ? { direction: "before" as const, value: params.before! } : null;
  const returnTo = currentCursor ? pageHref(currentCursor.direction, currentCursor.value) : firstHref;
  const actionEvents = followUps.length ? await prisma.jumpActionEvent.findMany({
    where: { workspaceId: workspace.id, jumpId: { in: followUps.map((followUp) => followUp.id) } },
    orderBy: { occurredAt: "desc" },
    take: 900
  }) : [];
  const eventsByFollowUp = new Map<string, typeof actionEvents>();
  for (const event of actionEvents) {
    const events = eventsByFollowUp.get(event.jumpId) ?? [];
    if (events.length < 3) events.push(event);
    eventsByFollowUp.set(event.jumpId, events);
  }

  const ordered = followUps;
  const pending = ordered.filter((followUp) => pendingStatuses.includes(followUp.status));
  const needsAttention = pending.filter((followUp) => followUp.scheduledAt < endToday);
  const upcoming = pending.filter((followUp) => followUp.scheduledAt >= endToday);
  const completed = ordered.filter((followUp) => completedStatuses.includes(followUp.status));
  const upcomingCount = pendingCount - attentionCount;
  const nextUp = needsAttention[0] ?? null;
  const activeFilterCount = Number(range !== "due") + Number(status !== "all") + Number(channel !== "all");

  const renderCard = (followUp: (typeof ordered)[number]) => {
    const snapshot = (followUp.renderedSnapshot ?? {}) as Snapshot;
    const email = followUp.contact.emails.find((item) => item.isPrimary)?.email ?? followUp.contact.emails[0]?.email;
    const phone = followUp.contact.phones.find((item) => item.isPrimary)?.phone ?? followUp.contact.phones[0]?.phone;
    const followUpChannel = followUp.stepVersion.stepTemplate.channel;
    const url = actionUrl(followUpChannel, email, phone, snapshot);
    const content = snapshot.body ?? snapshot.script ?? snapshot.subject ?? "No message has been prepared yet.";
    const snippet = content.length > 150 ? `${content.slice(0, 147)}…` : content;
    const isPending = pendingStatuses.includes(followUp.status);
    const isNext = followUp.id === nextUp?.id;
    const recentEvents = eventsByFollowUp.get(followUp.id) ?? [];
    const daysOverdue = Math.max(1, Math.floor((startToday.getTime() - followUp.scheduledAt.getTime()) / 86_400_000) + 1);
    const dueLabel = followUp.scheduledAt < startToday
      ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`
      : followUp.scheduledAt < endToday
        ? `Today · ${formatDateTime(followUp.scheduledAt, displayPreferences)}`
        : formatDateTime(followUp.scheduledAt, displayPreferences);
    const needsEmail = followUpChannel === "EMAIL";
    const missingMethod = needsEmail ? !email : !phone;
    const directCall = followUpChannel === "PHONE_CALL" || followUpChannel === "VOICEMAIL";
    const editableAction = <EditableFollowUpAction
      jumpId={followUp.id}
      contactId={followUp.contactId}
      contactName={followUp.contact.displayName}
      channel={followUpChannel}
      email={email ?? null}
      phone={phone ?? null}
      initialSubject={snapshot.subject}
      initialContent={content}
    />;

    return (
      <JumpWorkflowCard jumpId={followUp.id} contactName={followUp.contact.displayName} revision={followUp.updatedAt.toISOString()} key={followUp.id}>
        <article id={`jump-${followUp.id}`} className={`jump-card jump-task-card ${isNext ? "next-follow-up" : ""} ${isPending ? "" : "jump-task-complete"}`}>
          <div className="jump-card-main">
            {isNext && <span className="eyebrow">Next up</span>}
            <div className="jump-card-heading"><h3>{followUp.contact.displayName}</h3><span className={followUp.scheduledAt < startToday ? "due-pill overdue" : "due-pill"}>{dueLabel}</span><span className="channel-pill">{channelLabel(followUpChannel)}</span></div>
            <div className="jump-meta"><span>{followUp.mix.name}</span><span>{followUp.reason}</span></div>
            {isNext ? <>{editableAction}{recentEvents.length > 0 && <div className="jump-action-history"><small>Recent activity</small>{recentEvents.map((event) => <span key={event.id}>{eventLabel(event.action)} · {formatDateTime(event.occurredAt, displayPreferences)}</span>)}</div>}</> : <p className="jump-snippet">{snippet}</p>}
          </div>

          <div className="jump-primary-action">
            {!isNext && (missingMethod ? (
              <Link className="button primary jump-channel-action" href={`/contacts/${followUp.contactId}/edit`} aria-label={`Add ${needsEmail ? "email" : "phone"} for ${followUp.contact.displayName}`}><AppIcon name="add" /><span>Add {needsEmail ? "email" : "phone"}</span></Link>
            ) : directCall && url ? (
              <JumpActionLink jumpId={followUp.id} action={actionType(followUpChannel)} href={url} className="button primary jump-channel-action" ariaLabel={`Call ${followUp.contact.displayName}`} title="Call" contactName={followUp.contact.displayName} channel={followUpChannel}><AppIcon name="phone" /><span>Call</span></JumpActionLink>
            ) : (
              <Sheet trigger={<button className="button primary jump-channel-action" type="button" aria-label={`Review message for ${followUp.contact.displayName}`}><AppIcon name={followUpChannel === "EMAIL" ? "email" : "message"} /><span>Review</span></button>} title={`Message ${followUp.contact.displayName}`} description="Make it sound like you. Fine-tune before opening your phone’s composer.">{editableAction}</Sheet>
            ))}
            <div className="jump-completion-actions">
              <JumpOutcomeButton jumpId={followUp.id} outcome={isPending ? "COMPLETED" : "REOPENED"} className={`button small jump-done-action ${isPending ? "" : "done"}`} ariaLabel={isPending ? "Done" : "Undo"}>{isPending ? "Done" : "Undo"}</JumpOutcomeButton>
              {isPending && <Sheet
                trigger={<button className="button small" type="button" aria-label={`More options for ${followUp.contact.displayName}`}>More</button>}
                title={`Follow up with ${followUp.contact.displayName}`}
                description="Move it to a better day, skip it, or stop this mix."
              >
                <div className="sheet-section"><h3>Snooze</h3><div className="sheet-actions">{[["later-today", "Later today"], ["tomorrow", "Tomorrow"], ["next-monday", "Monday"], ["next-week", "Next week"]].map(([preset, label]) => <form action={snoozeJumpAction} key={preset}><input type="hidden" name="jumpId" value={followUp.id} /><input type="hidden" name="preset" value={preset} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button" type="submit">{label}</button></form>)}</div></div>
                <form action={snoozeJumpAction} className="form-stack"><input type="hidden" name="jumpId" value={followUp.id} /><input type="hidden" name="preset" value="custom" /><input type="hidden" name="returnTo" value={returnTo} /><label className="field"><span>Choose a day</span><input type="date" name="customDate" min={logicalDateKey(today)} required /></label><small className="muted-copy">Uses your default follow-up time in {timezone}.</small><button className="button" type="submit">Snooze to this day</button></form>
                <div className="sheet-danger-zone"><JumpOutcomeButton jumpId={followUp.id} outcome="SKIPPED" className="button">Skip this follow-up</JumpOutcomeButton>{followUp.mix.source !== "ONE_TIME" && <ConfirmDialog trigger="Stop mix…" title={`Stop ${followUp.mix.name} for ${followUp.contact.displayName}?`} description="Future follow-ups from this mix will be removed. Completed history stays available." danger><form action={stopMixForContactAction}><input type="hidden" name="mixId" value={followUp.mixId} /><input type="hidden" name="contactId" value={followUp.contactId} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button danger" type="submit">Stop mix</button></form></ConfirmDialog>}</div>
              </Sheet>}
            </div>
          </div>
        </article>
      </JumpWorkflowCard>
    );
  };

  const firstFollowUpReady = params.firstContact && followUps.some(followUp => followUp.contact.displayName === params.firstContact);
  const welcomeMessage = firstFollowUpReady ? `Your first follow-up for ${params.firstContact} is ready.`
    : preparation.state !== "ready" ? "Your details are saved. We’re checking your follow-ups." : "Your follow-up list is ready.";

  return (
    <TodayNavigation key={workspace.id} viewKey={returnTo}>
      <JumpReturnTray />
      {params.welcome && <><Notice type="success">{welcomeMessage}</Notice><section className="card"><h2>Try your first networking mix</h2><p>You have five personal invitations. Choose a contact and send them unique access through the Jump in the Mix System Mix.</p><Link className="button primary" href="/mixes/system?welcome=1">Try the System Mix</Link></section></>}
      {params.demo && <Notice type="info">Using local demo data.</Notice>}
      {params.applied && <Notice type="success">Mix changes saved.</Notice>}
      {params.mixStopped && <Notice type="success">Mix stopped.</Notice>}
      {params.mixStopError && <Notice type="error">Mix could not be stopped.</Notice>}
      {params.snoozed && <Notice type="success">Follow-up snoozed.</Notice>}
      {params.listReset && <Notice type="info">This part of the list changed. You’re back at the first follow-ups.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}

      <header className="page-header today-page-header">
        <div><h1 tabIndex={-1}>Today</h1><p>{attentionCount ? `${attentionCount.toLocaleString()} follow-up${attentionCount === 1 ? " needs" : "s need"} your attention${overdueCount ? ` · ${overdueCount.toLocaleString()} overdue` : ""}.` : preparation.state !== "ready" ? "Your follow-up list is awaiting preparation." : upcomingCount ? `${upcomingCount.toLocaleString()} upcoming follow-up${upcomingCount === 1 ? "" : "s"}.` : activeFilterCount ? "No open follow-ups in this view." : "You’re caught up."}</p></div>
        <Sheet trigger={<button className={activeFilterCount ? "button filter-trigger active" : "button filter-trigger"} type="button"><AppIcon name="settings" />Filter{activeFilterCount ? ` ${activeFilterCount}` : ""}</button>} title="Filter Today" description="Changes apply as soon as you choose them.">
          <AutoSubmitForm key={viewParams.toString()} className="form-stack" action="/jumps" ariaLabel="Today filters">
            <label className="field"><span>Dates</span><select name="range" defaultValue={range}><option value="due">Due now</option><option value="week">Next 7 days</option><option value="month">Next 30 days</option><option value="all">All dates</option></select></label>
            <label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="all">Open and completed</option><option value="pending">Open</option><option value="done">Completed</option><option value="skipped">Skipped</option></select></label>
            <label className="field"><span>How</span><select name="channel" defaultValue={channel}><option value="all">Any method</option>{channels.map((item) => <option key={item} value={item}>{channelLabel(item)}</option>)}</select></label>
          </AutoSubmitForm>
          {activeFilterCount > 0 && <TodayLink className="button" href="/jumps">Clear filters</TodayLink>}
        </Sheet>
      </header>

      <PreparationNotice initial={preparation} canRetry={!impersonation} deferWhileEditing />
      <p className="today-week-line"><TodayLink href="/jumps?range=week&status=pending">This week: {dueThisWeekCount} open</TodayLink><span>·</span><TodayLink href="/jumps?range=due&status=done">{completedTodayCount} completed today</TodayLink></p>
      {!activeFilterCount && <TodayBriefing text={todayBriefing({ attention: attentionCount, overdue: overdueCount, markedDone: completedTodayCount, ready: preparation.state === "ready" })} />}
      {needsAttention.length > 0 && <section aria-labelledby="needs-attention"><div className="section-label urgent"><h2 id="needs-attention">Needs attention</h2><span>{needsAttention.length < attentionCount ? `${needsAttention.length} of ${attentionCount.toLocaleString()}` : needsAttention.length}</span></div><div className="jump-list">{needsAttention.map(renderCard)}</div></section>}
      {upcoming.length > 0 && <section aria-labelledby="upcoming-follow-ups"><div className="section-label"><h2 id="upcoming-follow-ups">Up next</h2><span>{upcoming.length < upcomingCount ? `${upcoming.length} of ${upcomingCount.toLocaleString()}` : upcoming.length}</span></div><div className="jump-list">{upcoming.map(renderCard)}</div></section>}
      {completed.length > 0 && <section aria-labelledby="completed-follow-ups"><div className="completed-divider"><span id="completed-follow-ups">Completed</span></div><div className="jump-list">{completed.map(renderCard)}</div></section>}
      {totalCount > 0 && <nav className="pagination-bar today-pagination" aria-label="Follow-up pages">
        <span role="status">Showing {ordered.length} of {totalCount.toLocaleString()} follow-up{totalCount === 1 ? "" : "s"} in this view.</span>
        <div className="page-actions">
          {list.previous && <><TodayLink className="button" href={firstHref}>First follow-ups</TodayLink><TodayLink className="button" href={pageHref("before", list.previous)}>Previous</TodayLink></>}
          {list.next && <TodayLink className="button primary" href={pageHref("after", list.next)}>Next follow-ups</TodayLink>}
        </div>
      </nav>}
      {!ordered.length && preparation.state === "ready" && (activeFilterCount
        ? <EmptyState title="No follow-ups match these filters" description="Try clearing the filters to see what needs your attention today." actionHref="/jumps" actionLabel="Clear filters" />
        : <EmptyState title="Nothing due right now" description="A little hello goes a long way. Add a person and choose a follow-up date; your next action will appear here." actionHref="/contacts/new" actionLabel="Add a person" />)}
    </TodayNavigation>
  );
}
