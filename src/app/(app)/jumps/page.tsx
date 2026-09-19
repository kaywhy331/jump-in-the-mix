import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditableFollowUpAction } from "@/components/EditableFollowUpAction";
import { FollowUpChannelChoice, type ChannelChoiceOption } from "@/components/FollowUpChannelChoice";
import { EmptyState } from "@/components/EmptyState";
import { JumpOutcomeButton, JumpReturnTray, JumpStampEditor, JumpWorkflowCard } from "@/components/JumpWorkflow";
import { Notice } from "@/components/Notice";
import { TodayBriefing } from "@/components/TodayBriefing";
import { todayBriefing } from "@/lib/today-briefing";
import { PreparationNotice } from "@/components/PreparationNotice";
import { Sheet } from "@/components/Sheet";
import { TodayLink, TodayNavigation } from "@/components/TodayNavigation";
import { WhenField } from "@/components/WhenPicker";
import type { Channel, JumpStatus, Prisma } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { projectDraftSource, type DraftValues } from "@/lib/draft-segments";
import { formatDateTime } from "@/lib/format";
import { readJumpDrafts } from "@/lib/jump-drafts";
import { buildJumpReplacementValues } from "@/lib/jump-render";
import { detachedChanges, preparationFamilyForChannel, type PreparationFamily } from "@/lib/preparation-family";
import { offersChoice, preparedVariants, selectedVariant, usableVariants, variantsOfSnapshot } from "@/lib/preparation-variants";
import { addLogicalDays, logicalDateInTimezone, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";
import { readPreparationStatus } from "@/lib/preparation";
import { snoozeJumpAction } from "@/lib/snooze-actions";
import { snoozeChoices } from "@/lib/snooze-schedule";
import { parseTodayCursor, readTodayPage } from "@/lib/today-list";

export const metadata: Metadata = { title: "Today" };

type Snapshot = { subject?: string | null; body?: string | null; script?: string | null };
type TemplateText = { subject: string | null; body: string | null; script: string | null };

/** The token-form text a follow-up was prepared from; null when the row predates stored templates. */
function templateTextOf(value: Prisma.JsonValue): TemplateText | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = (key: "subject" | "body" | "script") => { const item = (value as Record<string, unknown>)[key]; return typeof item === "string" ? item : null; };
  const template = { subject: text("subject"), body: text("body"), script: text("script") };
  return template.subject === null && template.body === null && template.script === null ? null : template;
}

/** Only the tokens the template or draft uses travel to the browser. */
function pickTokens(values: Record<string, string>, sources: Array<string | null | undefined>): DraftValues {
  const picked: DraftValues = {};
  for (const source of sources) for (const token of source?.match(/{{[^}]+}}/g) ?? []) if (Object.hasOwn(values, token)) picked[token] = values[token];
  return picked;
}
type SearchParams = {
  q?: string;
  jump?: string;
  priority?: string;
  view?: string;
  invitations?: string;
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


const pendingStatuses: JumpStatus[] = ["PENDING"];
const doneStatuses: JumpStatus[] = ["DONE"];
const completedStatuses: JumpStatus[] = [...doneStatuses, "SKIPPED"];
const channels: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];

function channelLabel(channel: Channel): string {
  if (channel === "PHONE_CALL") return "call";
  if (channel === "VOICEMAIL") return "voicemail";
  return channel.replaceAll("_", " ").toLowerCase();
}

/** The chip for one usable variant: the family's plain name, WhatsApp when the person prefers it. */
function choiceOption(family: PreparationFamily, channel: Channel): ChannelChoiceOption {
  if (family === "EMAIL") return { family, label: "Email", icon: "email" };
  if (family === "CALL") return { family, label: "Call", icon: "phone" };
  return { family, label: channel === "WHATSAPP" ? "WhatsApp" : "Text", icon: "message" };
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
  const query = (params.q ?? "").trim().slice(0, 160);
  const priority = params.priority === "overdue" ? "overdue" : "all";
  const compact = params.view === "compact";
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

  const where: Prisma.JumpWhereInput = { workspaceId: workspace.id, ...(params.jump ? { id: params.jump.slice(0, 120) } : {}), AND: [statusWhere, dateWhere, channelWhere,
    ...(priority === "overdue" ? [{ status: "PENDING" as const, scheduledAt: { lt: startToday } }] : []),
    ...(query ? [{ OR: [{ contact: { displayName: { contains: query, mode: "insensitive" as const } } }, { mix: { name: { contains: query, mode: "insensitive" as const } } }, { reason: { contains: query, mode: "insensitive" as const } }] }] : [])
  ] };
  // Observe preparation first so a just-finished job cannot report ready beside an older list.
  const preparation = await readPreparationStatus(workspace.id);
  const [list, totalCount, pendingCount, attentionCount, overdueCount, dueThisWeekCount, completedTodayCount] = await Promise.all([
    readTodayPage(workspace.id, where, params, range === "due" ? {
      pending: { scheduledAt: { lt: endToday } },
      completed: { completedAt: { gte: startToday, lt: endToday } }
    } : {}),
    prisma.jump.count({ where }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING" }] } }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING", scheduledAt: { lt: endToday } }] } }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING", scheduledAt: { lt: startToday } }] } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: { in: pendingStatuses }, scheduledAt: { gte: startToday, lt: endWeek } } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: "DONE", completedAt: { gte: startToday, lt: endToday } } })
  ]);
  const followUps = list.items;
  const pendingIds = followUps.filter((followUp) => followUp.status === "PENDING").map((followUp) => followUp.id);
  const [drafts, owner, automation] = await Promise.all([
    readJumpDrafts(workspace.id, pendingIds),
    prisma.user.findUnique({ where: { id: workspace.ownerId }, select: { name: true, email: true } }),
    prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id }, select: { enabled: true, emailEnabled: true, smsEnabled: true } })
  ]);
  // A drafted follow-up is held from automatic delivery; the card says so only where delivery would otherwise apply.
  const automaticFor = (followUpChannel: Channel) => Boolean(automation?.enabled && ((followUpChannel === "EMAIL" && automation.emailEnabled) || (followUpChannel === "SMS" && automation.smsEnabled)));
  const profile = workspace.profile;
  const renderOwner = { name: owner?.name ?? user.name ?? "", email: owner?.email ?? user.email };
  const viewParams = new URLSearchParams({ range, status, channel, ...(query ? { q: query } : {}), ...(params.jump ? { jump: params.jump.slice(0, 120) } : {}), ...(priority !== "all" ? { priority } : {}), ...(compact ? { view: "compact" } : {}) });
  const firstHref = `/jumps?${viewParams}`;
  if (list.reset) redirect(`${firstHref}&listReset=1`);
  const pageHref = (direction: "after" | "before", cursor: string) => `${firstHref}&${direction}=${encodeURIComponent(cursor)}`;
  const currentCursor = parseTodayCursor(params.after) ? { direction: "after" as const, value: params.after! }
    : parseTodayCursor(params.before) ? { direction: "before" as const, value: params.before! } : null;
  const returnTo = currentCursor ? pageHref(currentCursor.direction, currentCursor.value) : firstHref;
  const scheduling = await prisma.workspacePreference.findUnique({
    where: { workspaceId: workspace.id },
    select: { defaultFollowUpMinutes: true, quietHoursStart: true, quietHoursEnd: true }
  });
  const now = new Date();
  // Only offer snooze times after the follow-up is due, so nothing offered is refused.
  const choicesFor = (followUp: { baseScheduledAt: Date | null; scheduledAt: Date }) => snoozeChoices({
    now,
    timezone,
    floor: followUp.baseScheduledAt ?? followUp.scheduledAt,
    preferredMinutes: scheduling?.defaultFollowUpMinutes,
    quietHoursStart: scheduling?.quietHoursStart,
    quietHoursEnd: scheduling?.quietHoursEnd
  });
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
  const activeFilterCount = Number(range !== "due") + Number(status !== "all") + Number(channel !== "all") + Number(Boolean(query)) + Number(priority !== "all") + Number(Boolean(params.jump));

  const renderCard = (followUp: (typeof ordered)[number]) => {
    const snapshot = (followUp.renderedSnapshot ?? {}) as Snapshot;
    const email = followUp.accessInvite?.recipientEmail ?? followUp.contact.emails.find((item) => item.isPrimary)?.email ?? followUp.contact.emails[0]?.email;
    const phone = followUp.accessInvite?.recipientPhone ?? followUp.contact.phones.find((item) => item.isPrimary)?.phone ?? followUp.contact.phones[0]?.phone;
    const planChannel = followUp.stepVersion.stepTemplate.channel;
    const isPending = pendingStatuses.includes(followUp.status);
    // A pending follow-up edits its plan text as a draft; the card shows the draft rendered over the
    // contact and business details, so an edit made yesterday still reads with today's details.
    const planTemplate = isPending ? templateTextOf(followUp.templateSnapshot) : null;
    // One follow-up, channel alternatives: the plan's wording plus any authored variant the person can
    // receive. The owner's choice for this follow-up wins while usable; otherwise the plan's channel.
    const methods = { email: email ?? null, phone: phone ?? null, preferredChannel: followUp.contact.relationshipState?.preferredChannel ?? null };
    const prepared = planTemplate ? preparedVariants({ channel: planChannel, template: planTemplate }, variantsOfSnapshot(followUp.templateSnapshot), methods) : [];
    const usable = usableVariants(prepared, methods);
    const active = selectedVariant(usable, followUp.selectedFamily) ?? prepared[0] ?? null;
    const followUpChannel = active?.channel ?? planChannel;
    const family = active?.family ?? preparationFamilyForChannel(planChannel);
    const template = active?.template ?? null;
    const draft = template ? drafts.get(followUp.id)?.find((item) => item.family === family) ?? null : null;
    const allValues = template ? buildJumpReplacementValues(followUp.contact, profile, renderOwner, followUpChannel) : {};
    const draftValues = template ? pickTokens(allValues, [template.subject, template.body, template.script, draft?.subject, draft?.body, draft?.script]) : {};
    // A detail the owner wrote over by hand has changed since; say so rather than rewriting their words.
    const changedDetails = draft ? detachedChanges(draft.detached, allValues) : [];
    // An alternative's wording is rendered from its authored template here; the plan's own comes from the stored render.
    const alternative = active && !active.primary;
    const preparedSubject = draft ? projectDraftSource(draft.subject, draftValues) : alternative ? projectDraftSource(template!.subject, draftValues) : snapshot.subject ?? null;
    const preparedContent = draft ? projectDraftSource(draft.body ?? draft.script, draftValues) : alternative ? projectDraftSource(template!.body ?? template!.script, draftValues) : null;
    const content = preparedContent ?? snapshot.body ?? snapshot.script ?? snapshot.subject ?? "No message has been prepared yet.";
    const contextVersions = { contactVersion: followUp.contact.updatedAt.toISOString(), businessProfileVersion: profile?.updatedAt.toISOString() ?? "none" };
    // Switching away from the plan's channel takes this follow-up out of automatic delivery; the card says so.
    const automaticForPlan = !followUp.accessInvite && automaticFor(planChannel);
    const heldByChoice = Boolean(alternative && automaticForPlan);
    // The note gives the real reason: the owner's choice, or the plan's own method missing so the
    // card fell back to an alternative without anyone choosing it.
    const chosen = Boolean(alternative && followUp.selectedFamily === active?.family);
    const heldNote = !heldByChoice || !active ? null : chosen
      ? `Because you chose ${choiceOption(active.family, active.channel).label.toLowerCase()} instead of the plan’s ${channelLabel(planChannel)}, this one waits for you and won’t send automatically.`
      : `The plan’s ${channelLabel(planChannel)} needs ${planChannel === "EMAIL" ? "an email address" : "a phone number"} this person doesn’t have, so this one waits for you and won’t send automatically.`;
    const choice = isPending && active && offersChoice(usable) ? <FollowUpChannelChoice
      jumpId={followUp.id}
      contactName={followUp.contact.displayName}
      options={usable.map((item) => choiceOption(item.family, item.channel))}
      selected={active.family}
      heldNote={heldNote}
    /> : null;
    const snippet = content.length > 150 ? `${content.slice(0, 147)}…` : content;
    const isNext = !compact && followUp.id === nextUp?.id;
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
      key={family}
      jumpId={followUp.id}
      contactId={followUp.contactId}
      contactName={followUp.contact.displayName}
      channel={followUpChannel}
      email={email ?? null}
      phone={phone ?? null}
      initialSubject={preparedSubject}
      initialContent={content}
      family={family}
      template={template}
      values={draftValues}
      draft={draft ? { subject: draft.subject, body: draft.body, script: draft.script, revision: draft.revision } : null}
      stepVersionId={followUp.stepVersionId}
      contextVersions={contextVersions}
      automaticDelivery={automaticForPlan && !alternative}
      changedDetails={changedDetails}
    />;
    const prepare = <><p className="workflow-step-label">Step 1 · Review your follow-up</p>{choice && <details className="workflow-options"><summary>Change contact method</summary>{choice}</details>}{editableAction}</>;

    return (
      <JumpWorkflowCard jumpId={followUp.id} contactName={followUp.contact.displayName} revision={followUp.updatedAt.toISOString()} key={followUp.id}>
        <article id={`jump-${followUp.id}`} className={`jump-card jump-task-card ${isNext ? "next-follow-up" : ""} ${isPending ? "" : "jump-task-complete"}`}>
          <div className="jump-card-main">
            {isNext && <span className="eyebrow">Next up</span>}
            <div className="jump-card-heading"><h3>{followUp.contact.displayName}</h3><span className={followUp.scheduledAt < startToday ? "due-pill overdue" : "due-pill"}>{dueLabel}</span><span className="channel-pill">{channelLabel(followUpChannel)}</span></div>
            <div className="jump-meta">{!isPending && followUp.completedAt && <JumpStampEditor jumpId={followUp.id} completedAt={followUp.completedAt.toISOString()} label={formatDateTime(followUp.completedAt, displayPreferences)} />}<span>{followUp.mix.name}</span>{followUp.reason && followUp.reason.trim().toLowerCase() !== followUp.mix.name.trim().toLowerCase() && <span>{followUp.reason}</span>}{isPending && <span className="status-pill">{automaticForPlan && !heldByChoice && !drafts.get(followUp.id) && !followUp.accessInvite && (!followUp.appointmentBinding || followUp.appointmentBinding.automaticDelivery) && !missingMethod ? "Automatic sending enabled" : automaticForPlan ? "Held for your review" : "Manual · you send"}</span>}</div>
            <p className="jump-snippet">{snippet}</p>
          </div>

          <div className="jump-primary-action">
            {isPending && <Sheet className="follow-up-review-sheet" desktopInitiallyOpen={isNext} trigger={<button className="button primary jump-channel-action" type="button" aria-label={`Review ${directCall ? "call" : "message"} for ${followUp.contact.displayName}`}><AppIcon name={directCall ? "phone" : followUpChannel === "EMAIL" ? "email" : "message"} /><span>Review</span></button>} title={`Follow up with ${followUp.contact.displayName}`} description="Review, open your app, then come back to record what happened."><div className="review-workspace"><div className="review-composer"><p className="review-mix-name">{followUp.mix.name}</p><small className="muted-copy">{dueLabel}</small>{prepare}</div><aside className="review-person-context" aria-label={`About ${followUp.contact.displayName}`}><h3>Reach {followUp.contact.displayName}</h3>{phone && <p>{phone}</p>}{email && <p>{email}</p>}{followUp.contact.publicNotes && <><h3>Contact notes</h3><p className="conversation-note">{followUp.contact.publicNotes}</p></>}<Link className="inline-action" href={`/contacts/${followUp.contactId}`}>Open contact →</Link></aside></div></Sheet>}
            <div className="jump-completion-actions">
              {!isPending && <JumpOutcomeButton jumpId={followUp.id} outcome="REOPENED" className="button small jump-done-action" ariaLabel="Undo"><span>Undo</span></JumpOutcomeButton>}
              {isPending && <Sheet
                trigger={<button className="button small" type="button" aria-label={`More options for ${followUp.contact.displayName}`}>More</button>}
                title={`Follow up with ${followUp.contact.displayName}`}
                description="Move it to a better day, skip it, or stop this mix."
              >
                <div className="sheet-section"><h3>Already finished?</h3><JumpOutcomeButton jumpId={followUp.id} outcome="COMPLETED" className="button" ariaLabel={`Mark done for ${followUp.contact.displayName}`}><AppIcon name="check" /><span>Mark done</span></JumpOutcomeButton></div>
                <div className="sheet-section"><h3>Snooze</h3><div className="sheet-actions">{choicesFor(followUp).presets.map(([preset, label]) => <form action={snoozeJumpAction} key={preset}><input type="hidden" name="jumpId" value={followUp.id} /><input type="hidden" name="preset" value={preset} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button" type="submit">{label}</button></form>)}</div></div>
                <form action={snoozeJumpAction} className="form-stack"><input type="hidden" name="jumpId" value={followUp.id} /><input type="hidden" name="preset" value="custom" /><input type="hidden" name="returnTo" value={returnTo} /><div className="field"><span className="field-label">Choose a day</span><WhenField label="Choose a day" variant="inline" dateName="customDate" defaultDate={choicesFor(followUp).defaultDate} minDate={choicesFor(followUp).minDate} quickSelect={false} /></div><small className="muted-copy">Uses your default follow-up time in {timezone}.</small><button className="button" type="submit">Snooze to this day</button></form>
                <div className="sheet-danger-zone"><JumpOutcomeButton jumpId={followUp.id} outcome="SKIPPED" className="button">Skip this follow-up</JumpOutcomeButton>{followUp.mix.source !== "ONE_TIME" && <ConfirmDialog trigger="Stop mix…" title={`Stop ${followUp.mix.name} for ${followUp.contact.displayName}?`} description="Future follow-ups from this mix will be removed. Completed history stays available." danger><form action={stopMixForContactAction}><input type="hidden" name="mixId" value={followUp.mixId} /><input type="hidden" name="contactId" value={followUp.contactId} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button danger" type="submit">Stop mix</button></form></ConfirmDialog>}</div>
                {recentEvents.length > 0 && <details className="workflow-options"><summary>Recent activity</summary><div className="jump-action-history">{recentEvents.map(event => <span key={event.id}>{eventLabel(event.action)} · {formatDateTime(event.occurredAt, displayPreferences)}</span>)}</div></details>}
              </Sheet>}
            </div>
          </div>
        </article>
      </JumpWorkflowCard>
    );
  };

  const firstFollowUp = params.firstContact ? followUps.find(followUp => followUp.contact.displayName === params.firstContact) : undefined;
  const firstNeedsEmail = firstFollowUp?.stepVersion.stepTemplate.channel === "EMAIL";
  const firstFollowUpReady = firstFollowUp && (firstNeedsEmail ? firstFollowUp.contact.emails.length > 0 : firstFollowUp.contact.phones.length > 0);
  const welcomeMessage = firstFollowUpReady ? `Your first follow-up for ${params.firstContact} is ready.`
    : firstFollowUp ? `Your follow-up for ${params.firstContact} is saved. Add ${firstNeedsEmail ? "an email address" : "a phone number"} to review and send it.`
    : preparation.state !== "ready" ? "Your details are saved. We’re checking your follow-ups." : "Your follow-up list is ready.";

  return (
    <TodayNavigation key={workspace.id} viewKey={returnTo}>
      <JumpReturnTray />
      {params.invitations && <Notice type="success">Your invitations are ready in Today. Review each message and send it from your own text or email app.</Notice>}
    {params.welcome && <Notice type="success">{welcomeMessage} Tap Review to begin.</Notice>}
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
            <input type="hidden" name="q" value={query} /><input type="hidden" name="view" value={compact ? "compact" : "focus"} /><label className="field"><span>Priority</span><select name="priority" defaultValue={priority}><option value="all">All priorities</option><option value="overdue">Overdue commitments</option></select></label>
            <label className="field"><span>Dates</span><select name="range" defaultValue={range}><option value="due">Due now</option><option value="week">Next 7 days</option><option value="month">Next 30 days</option><option value="all">All dates</option></select></label>
            <label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="all">Open and completed</option><option value="pending">Open</option><option value="done">Completed</option><option value="skipped">Skipped</option></select></label>
            <label className="field"><span>How</span><select name="channel" defaultValue={channel}><option value="all">Any method</option>{channels.map((item) => <option key={item} value={item}>{channelLabel(item)}</option>)}</select></label>
          </AutoSubmitForm>
      <form action="/jumps" className="search-row" role="search"><label className="field"><span>Find a person, Mix, or reason</span><input type="search" name="q" defaultValue={query} maxLength={160} placeholder="Search this follow-up view" /></label>{[...viewParams].filter(([name]) => name !== "q").map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<button className="button" type="submit">Search</button></form>
      <nav className="page-actions" aria-label="Today layout"><TodayLink className="button small" aria-current={!compact ? "page" : undefined} href={`/jumps?${new URLSearchParams({ ...Object.fromEntries(viewParams), view: "focus" })}`}>Focused work</TodayLink><TodayLink className="button small" aria-current={compact ? "page" : undefined} href={`/jumps?${new URLSearchParams({ ...Object.fromEntries(viewParams), view: "compact" })}`}>Compact scan</TodayLink><TodayLink className="button small" href="/jumps?range=all&status=pending&priority=overdue&view=compact">Review overdue</TodayLink></nav>

          {activeFilterCount > 0 && <TodayLink className="button" href="/jumps">Clear filters</TodayLink>}
        </Sheet>
      </header>

      <PreparationNotice initial={preparation} canRetry={!impersonation} deferWhileEditing />
      <details className="today-overview"><summary>This week & completed follow-ups</summary>      <p className="today-week-line"><TodayLink href="/jumps?range=week&status=pending">This week: {dueThisWeekCount} open</TodayLink><span>·</span><TodayLink href="/jumps?range=due&status=done">{completedTodayCount} completed today</TodayLink></p>
      {!activeFilterCount && <TodayBriefing text={todayBriefing({ attention: attentionCount, overdue: overdueCount, markedDone: completedTodayCount, ready: preparation.state === "ready" })} />}
</details>
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
      {!ordered.length && <div className="page-actions"><TodayLink className="button" href="/jumps?range=month&status=pending">Review upcoming</TodayLink><Link className="button" href="/contacts">Schedule with an existing person</Link></div>}
    </TodayNavigation>
  );
}
