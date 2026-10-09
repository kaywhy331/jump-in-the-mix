import { WorkflowAttention, UpcomingWorkflowCommitments } from "@/components/WorkflowAttention";
import { readWorkflowAttention } from "@/lib/workflow-attention";
import { QuietDaySuggestions } from "@/components/QuietDaySuggestions";
import { readQuietDays } from "@/lib/quiet-days";
import { contactMixCounts, noMixTodayLine } from "@/lib/contact-mix-status";
import { noMixNeededNotice } from "@/lib/contact-mix-status-labels";
import { afterAnotherMixIds } from "@/lib/new-contact-placement";
import { setNoMixNeededAction } from "@/lib/contact-no-mix-actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { MixEndPrompt } from "@/components/MixEndPrompt";
import { sameContactSequence } from "@/lib/contact-profile-view";
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
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
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
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { channelName, channelWord, followUpEndedReason, zoneLabel } from "@/lib/display-labels";
import { readJumpDrafts } from "@/lib/jump-drafts";
import { buildJumpReplacementValues } from "@/lib/jump-render";
import { detachedChanges, preparationFamilyForChannel, type PreparationFamily } from "@/lib/preparation-family";
import { offersChoice, preparedVariants, recommendedVariant, selectedVariant, usableVariants, variantsOfSnapshot } from "@/lib/preparation-variants";
import { readJourneyPreferences } from "@/lib/journey-preferences";
import { addLogicalDays, logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";
import { planLimits, recentPlanLimitSkips } from "@/lib/plan-limits";
import { readPreparationStatus } from "@/lib/preparation";
import { snoozeJumpAction } from "@/lib/snooze-actions";
import { snoozeChoices, type SnoozePreset } from "@/lib/snooze-schedule";
import { LiveAttentionSummary, LiveCount, LiveSection, TodayLiveCounts, TodayMomentum } from "@/components/TodayMomentum";
import { AlsoDueNote, WhileAlsoDue } from "@/components/AlsoDue";
import { followUpPhone, parseTodayCursor, readTodayPage, TODAY_PAGE_SIZE } from "@/lib/today-list";
import { calendarDaysOverdue, doneGrowth, doneSummaryCount, failedDeliveryNotice } from "@/lib/today-view";
import { automaticSendWindow, type AutomaticSendingRule } from "@/lib/automatic-delivery-window";
import { sendsByItself } from "@/lib/automatic-delivery";
import { INVITATIONS_PATH, invitationsLeft } from "@/lib/invitation-allowance";
import { phoneRegionOrDefault } from "@/lib/phone-number";
import { matchedMegaMix, megaMixById } from "@/lib/mega-mixes";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";

export const metadata: Metadata = { title: "Today" };

type Snapshot = { subject?: string | null; body?: string | null; script?: string | null };
type TemplateText = { subject: string | null; body: string | null; script: string | null };
type FailedDelivery = { jumpId: string; error: string | null; updatedAt: Date };

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
  attentionPage?: string; callbackPage?: string; setupLater?: string;
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
  at?: string;
  sig?: string;
  after?: string;
  before?: string;
  listReset?: string;
  contactSaved?: string;
  verified?: string;
  mixAssigned?: string; mixStart?: string; mixPerson?: string;
  noMixNeeded?: string; noMixPeople?: string; noMixCleared?: string; noMixInMix?: string; noMixDnc?: string; noMixAlready?: string;
};


const pendingStatuses: JumpStatus[] = ["PENDING"];
const doneStatuses: JumpStatus[] = ["DONE"];
const completedStatuses: JumpStatus[] = [...doneStatuses, "SKIPPED"];
const channels: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];


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
  const range = params.jump ? "all" : ["due", "week", "month", "all"].includes(params.range ?? "") ? params.range! : "due";
  const status = params.jump ? "all" : ["all", "pending", "done", "skipped"].includes(params.status ?? "") ? params.status! : "all";
  const channel = params.channel && channels.includes(params.channel as Channel) ? params.channel as Channel : "all";
  const { session, workspace, user, impersonation } = await requireWorkspace();
  const invitations = impersonation ? null : await invitationsLeft(user.id, workspace.id);
  // Prepared personal invitations wait here until the owner sends them from their own email or text app.
  const invitationsToSend = impersonation ? [] : await prisma.jump.findMany({ where: { workspaceId: workspace.id, status: "PENDING", accessInvite: { is: { inviterUserId: user.id, acceptedAt: null, revokedAt: null } } }, select: { id: true, contact: { select: { displayName: true } }, accessInvite: { select: { recipientEmail: true, recipientPhone: true } } }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 3 });
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

  const where: Prisma.JumpWhereInput = params.jump ? { workspaceId: workspace.id, id: params.jump.slice(0, 120) } : { workspaceId: workspace.id, ...(params.jump ? { id: params.jump.slice(0, 120) } : {}), AND: [statusWhere, dateWhere, channelWhere,
    ...(priority === "overdue" ? [{ status: "PENDING" as const, scheduledAt: { lt: startToday } }] : []),
    ...(query ? [{ OR: [{ contact: { displayName: { contains: query, mode: "insensitive" as const } } }, { mix: { name: { contains: query, mode: "insensitive" as const } } }, { reason: { contains: query, mode: "insensitive" as const } }] }] : [])
  ] };
  // Observe preparation first so a just-finished job cannot report ready beside an older list.
  const preparation = await readPreparationStatus(workspace.id);
  const exactRecord = params.jump ? await prisma.jump.findFirst({ where: { id: params.jump.slice(0, 120), workspaceId: workspace.id }, select: { id: true, contactId: true, status: true, completionMethod: true, workflowInstanceId: true } }) : null;
  const [list, totalCount, pendingCount, attentionCount, overdueCount, dueThisWeekCount, completedTodayCount, sharedOverdueCount] = await Promise.all([
    readTodayPage(workspace.id, where, params, range === "due" ? {
      pending: { scheduledAt: { lt: endToday } },
      completed: { completedAt: { gte: startToday, lt: endToday } }
    } : {}),
    prisma.jump.count({ where }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING" }] } }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING", scheduledAt: { lt: endToday } }] } }),
    prisma.jump.count({ where: { AND: [where, { status: "PENDING", scheduledAt: { lt: startToday } }] } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: { in: pendingStatuses }, scheduledAt: { gte: endToday, lt: endWeek } } }),
    prisma.jump.count({ where: { workspaceId: workspace.id, status: "DONE", completedAt: { gte: startToday, lt: endToday } } }),
    // Overdue follow-ups whose person also has one due today: they share that person's card under Today (D71).
    prisma.jump.count({ where: { AND: [where, { status: "PENDING", scheduledAt: { lt: startToday } }, { contact: { jumps: { some: { AND: [where, { status: "PENDING", scheduledAt: { gte: startToday, lt: endToday } }] } } } }] } })
  ]);
  const followUps = list.items;
  const pendingIds = followUps.filter((followUp) => followUp.status === "PENDING").map((followUp) => followUp.id);
  // A failed automatic send must be visible on Today; a problem reading it hides the notice, never the page.
  const readFailedDeliveries = async (): Promise<FailedDelivery[]> => {
    if (!pendingIds.length) return [];
    return prisma.automatedDelivery.findMany({ where: { workspaceId: workspace.id, jumpId: { in: pendingIds }, status: "FAILED" }, select: { jumpId: true, error: true, updatedAt: true } }).catch(() => []);
  };
  // People the plan's limit kept out of a Mix this week (src/lib/plan-limits.ts); a problem reading it hides the notice.
  const readPlanLimitNotice = async () => {
    const skipped = await recentPlanLimitSkips(workspace.id).catch(() => 0);
    return skipped ? { skipped, plan: (await planLimits(workspace.id)).plan } : null;
  };
  const planLimitNotice = await readPlanLimitNotice().catch(() => null);
  const [drafts, failedDeliveryRows, owner, automation, quietDays, workflowAttention, mixCounts] = await Promise.all([
    readJumpDrafts(workspace.id, pendingIds),
    readFailedDeliveries(),
    prisma.user.findUnique({ where: { id: workspace.ownerId }, select: { name: true, email: true } }),
    prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id }, select: { enabled: true, emailEnabled: true, smsEnabled: true, reviewWindowMinutes: true } }),
    readQuietDays({ workspaceId: workspace.id, timezone }),
    readWorkflowAttention(workspace.id, 30, Math.max(0, Math.min(100000, Math.floor(Number(params.attentionPage) || 0))) * 30, new Date(), Math.max(0, Math.min(100000, Math.floor(Number(params.callbackPage) || 0))) * 30).catch(() => null),
    // People with no Mix have nothing to remind the owner about them (JITM-09 §2.77); a failed count only hides the line.
    contactMixCounts(workspace.id).catch(() => null)
  ]);
  // The Mixes the end-of-Mix question can start, as on the profile: those the owner starts come first, by name, then
  // date-based and fixed-date Mixes, which the question never preselects (END-02).
  const [activeMixes, afterAnotherMix] = await Promise.all([
    prisma.mix.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } }, select: { id: true, name: true, triggerMode: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    afterAnotherMixIds(prisma, workspace.id)
  ]);
  const startedByOwner = (mix: { id: string; triggerMode: string }) => mix.triggerMode === "MANUAL_START" && !afterAnotherMix.includes(mix.id);
  const startableMixes = [...activeMixes.filter(startedByOwner), ...activeMixes.filter(mix => !startedByOwner(mix))].map(mix => ({ ...mix, startedByOwner: startedByOwner(mix) }));
  const noMixCount = mixCounts?.["no-mix"] ?? 0;
  const failedDeliveries = new Map(failedDeliveryRows.map((row) => [row.jumpId, row] as const));
  // A drafted follow-up is held from automatic delivery; the card says so only where delivery would otherwise apply.
  const automaticFor = (followUpChannel: Channel) => sendsByItself(automation, followUpChannel);
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
    select: { defaultFollowUpMinutes: true, quietHoursStart: true, quietHoursEnd: true, journeyPreferences: true, appointmentBufferMinutes: true, phoneRegion: true }
  });
  const ownerPreferred = readJourneyPreferences(scheduling?.journeyPreferences)?.communication ?? null;
  // Numbers saved without a country code are read in the workspace's region; dial targets are computed here.
  const phoneRegion = phoneRegionOrDefault(scheduling?.phoneRegion);
  const now = new Date();
  // The review's "not before" time comes from the worker's own rule (review window, quiet hours,
  // working hours, appointments) in the owner's timezone; the page only formats it for the viewer.
  const readSendingRule = async (): Promise<AutomaticSendingRule | null> => {
    if (!automation?.enabled) return null;
    const ownerTimezone = workspace.ownerId === user.id ? timezone : (await displayPreferencesForUser(workspace.ownerId)).timeZone;
    const appointmentGaps = readJourneyPreferences(scheduling?.journeyPreferences)?.avoidAppointments
      ? await prisma.calendarEntry.findMany({ where: { workspaceId: workspace.id, canceledAt: null, startsAt: { lte: new Date(now.getTime() + 8 * 86_400_000) }, endsAt: { gte: new Date(now.getTime() - 240 * 60_000) } }, select: { startsAt: true, endsAt: true, kind: true }, orderBy: { startsAt: "asc" }, take: 200 })
      : [];
    return { timezone: ownerTimezone, quietHours: scheduling ? { start: scheduling.quietHoursStart, end: scheduling.quietHoursEnd } : null, workingHours: scheduling, appointmentGaps };
  };
  // A problem reading the rule falls back to the fixed wording, never a wrong time or a missing page.
  const sendingRule = await readSendingRule().catch(() => null);
  // Only offer snooze times after the follow-up is due, so nothing offered is refused.
  // Each snooze choice says when it lands: the time today or tomorrow, the day and time further out (TRU-05).
  const snoozeLabel = (preset: SnoozePreset, label: string, at: Date) => `${label} · ${preset === "later-today" || preset === "tomorrow" ? formatTime(at, displayPreferences) : formatDateTime(at, displayPreferences)}`;
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
  // One person's follow-ups due by the end of today share one card, led by the earliest; each keeps its own review,
  // outcome and Undo (D71, JITM-09 §2.82). The card sits where the person's latest follow-up is due, so one that
  // remains after the earlier is recorded stays in place. The list is in due order, and so is each card.
  const people = new Map<string, typeof needsAttention>();
  for (const followUp of needsAttention) people.set(followUp.contactId, [...people.get(followUp.contactId) ?? [], followUp]);
  const dueGroups = [...people.values()];
  const overdueGroups = dueGroups.filter(group => group[group.length - 1].scheduledAt < startToday);
  const todayGroups = dueGroups.filter(group => group[group.length - 1].scheduledAt >= startToday);
  const nextUp = overdueGroups[0]?.[0] ?? todayGroups[0]?.[0] ?? upcoming[0] ?? null;
  const activeFilterCount = Number(range !== "due") + Number(status !== "all") + Number(channel !== "all") + Number(Boolean(query)) + Number(priority !== "all") + Number(Boolean(params.jump));

  // The channel and wording a follow-up's card opens on. A person's card also names the channel of their other
  // follow-up due today (D71), so each follow-up's is worked out once.
  const readVariants = (followUp: (typeof ordered)[number]) => {
    const email = followUp.accessInvite?.recipientEmail ?? followUp.contact.emails.find((item) => item.isPrimary)?.email ?? followUp.contact.emails[0]?.email;
    const { phone, dialTarget } = followUpPhone(followUp, phoneRegion);
    const planChannel = followUp.stepVersion.stepTemplate.channel;
    const isPending = pendingStatuses.includes(followUp.status);
    // A pending follow-up edits its plan text as a draft; the card shows the draft rendered over the
    // contact and business details, so an edit made yesterday still reads with today's details.
    const planTemplate = isPending ? templateTextOf(followUp.templateSnapshot) : null;
    // One follow-up, channel alternatives: the plan's wording plus any authored variant the person can
    // receive. The owner's choice for this follow-up wins while usable; otherwise the plan's channel.
    // WhatsApp needs a full international number; without one, a preferred WhatsApp text goes by SMS.
    const preferredChannel = followUp.contact.relationshipState?.preferredChannel ?? null;
    const methods = { email: email ?? null, phone, preferredChannel: preferredChannel === "WHATSAPP" && !dialTarget ? null : preferredChannel };
    const automaticForPlan = !followUp.manualOnly && !followUp.accessInvite && automaticFor(planChannel);
    const prepared = planTemplate ? preparedVariants({ channel: planChannel, template: planTemplate }, variantsOfSnapshot(followUp.templateSnapshot, planChannel), methods) : [];
    const usable = usableVariants(prepared, methods);
    // Every Beat offers text, email and a call; the recommended one opens unless the owner chose another.
    const recommended = recommendedVariant(usable, { contactPreferred: followUp.contact.relationshipState?.preferredChannel, ownerPreferred, automaticPlan: automaticForPlan });
    const active = selectedVariant(usable, followUp.selectedFamily ?? recommended?.family) ?? prepared[0] ?? null;
    return { email, phone, dialTarget, planChannel, isPending, planTemplate, automaticForPlan, prepared, usable, recommended, active, followUpChannel: active?.channel ?? planChannel };
  };
  const variantsRead = new Map<string, ReturnType<typeof readVariants>>();
  const variantsOf = (followUp: (typeof ordered)[number]) => {
    const read = variantsRead.get(followUp.id) ?? readVariants(followUp);
    variantsRead.set(followUp.id, read);
    return read;
  };
  // How a person's card and reviews name their other follow-up due today: the channel it opens on, and when (D71).
  const alsoDueLabel = (followUp: (typeof ordered)[number]) => {
    const name = channelName(variantsOf(followUp).followUpChannel);
    if (followUp.scheduledAt >= startToday) return `${name} at ${formatTime(followUp.scheduledAt, { locale: displayPreferences.locale, timeZone: timezone })}`;
    const days = calendarDaysOverdue(followUp.scheduledAt, today, timezone);
    return `${name}, ${days} day${days === 1 ? "" : "s"} overdue`;
  };

  const renderCard = (followUp: (typeof ordered)[number], others: typeof needsAttention = []) => {
    const snapshot = (followUp.renderedSnapshot ?? {}) as Snapshot;
    const { email, phone, dialTarget, planChannel, isPending, planTemplate, automaticForPlan, prepared, usable, recommended, active, followUpChannel } = variantsOf(followUp);
    // The small preview never connects separate runs of a reusable Mix. Keep the
    // selected Beat visible even when it falls beyond the contact's preview limit.
    const reviewBeats = [followUp, ...followUp.contact.jumps.filter(beat => beat.id !== followUp.id && sameContactSequence(followUp, beat))]
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id.localeCompare(b.id));
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
    const needsEmail = followUpChannel === "EMAIL";
    const missingMethod = needsEmail ? !email : !phone;
    const directCall = followUpChannel === "PHONE_CALL" || followUpChannel === "VOICEMAIL";
    // A failed automatic send is never retried by the worker; the owner sends this one.
    const failed = isPending ? failedDeliveries.get(followUp.id) ?? null : null;
    const failure = failed ? failedDeliveryNotice(failed.error) : null;
    // Automatic sending applies only while the worker would really send it: the plan's own channel is
    // active, the method exists, no binding or invitation holds it and no attempt has failed. A saved
    // draft is the remaining hold, and the editor reports that one as it happens.
    const automaticDelivery = automaticForPlan && !alternative && !missingMethod && !failure && (!followUp.appointmentBinding || followUp.appointmentBinding.automaticDelivery);
    // When the worker would first send it, by its own rule; the editor keeps the fixed wording when this cannot be computed.
    const sendWindow = automaticDelivery && sendingRule && automation ? automaticSendWindow({ ...sendingRule, scheduledAt: followUp.scheduledAt, createdAt: followUp.createdAt, reviewWindowMinutes: automation.reviewWindowMinutes, now }) : null;
    // Switching away from the plan's channel takes this follow-up out of automatic delivery; the card says so.
    const heldByChoice = Boolean(alternative && automaticForPlan);
    // The note gives the real reason: the owner's choice, or the plan's own method missing so the
    // card fell back to an alternative without anyone choosing it.
    const chosen = Boolean(alternative && followUp.selectedFamily === active?.family);
    const heldNote = !heldByChoice || !active ? null : chosen
      ? `Because you chose ${channelWord(choiceOption(active.family, active.channel).label)} instead of the Mix’s ${channelWord(channelName(planChannel))}, this one waits for you and won’t send automatically.`
      : `The Mix’s ${channelName(planChannel).toLowerCase()} needs ${planChannel === "EMAIL" ? "an email address" : "a phone number"} this person doesn’t have, so this one waits for you and won’t send automatically.`;
    const choice = isPending && active ? <FollowUpChannelChoice
      jumpId={followUp.id}
      contactName={followUp.contact.displayName}
      options={(["TEXT", "EMAIL", "CALL"] as const).map(optionFamily => { const item = usable.find(item => item.family === optionFamily); const option = item ? choiceOption(item.family, item.channel) : { ...choiceOption(optionFamily, optionFamily === "EMAIL" ? "EMAIL" : optionFamily === "CALL" ? "PHONE_CALL" : "SMS"), unavailable: optionFamily === "EMAIL" && !email ? "Needs an email address" : optionFamily !== "EMAIL" && !phone ? "Needs a phone number" : "Not prepared for this Beat" }; return { ...option, recommended: optionFamily === recommended?.family }; })}
      missingMethodHref={!email || !phone ? `/contacts/${followUp.contactId}/edit?returnTo=${encodeURIComponent(`/jumps?jump=${followUp.id}&range=all`)}` : undefined}
      selected={active.family}
      heldNote={heldNote}
    /> : null;
    const snippet = content.length > 150 ? `${content.slice(0, 147)}…` : content;
    const isNext = !compact && followUp.id === nextUp?.id;
    const recentEvents = eventsByFollowUp.get(followUp.id) ?? [];
    const daysOverdue = calendarDaysOverdue(followUp.scheduledAt, today, timezone);
    const dueLabel = !isPending ? `Originally due ${formatDateTime(followUp.scheduledAt, displayPreferences)}` : followUp.scheduledAt < startToday
      ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`
      : followUp.scheduledAt < endToday
        ? `Today · ${formatDateTime(followUp.scheduledAt, displayPreferences)}`
        : formatDateTime(followUp.scheduledAt, displayPreferences);
    const snoozeToDay = <form action={snoozeJumpAction} className="form-stack"><input type="hidden" name="jumpId" value={followUp.id} /><input type="hidden" name="preset" value="custom" /><input type="hidden" name="returnTo" value={returnTo} /><div className="field"><span className="field-label">Choose a day</span><WhenField label="Choose a day" variant="inline" dateName="customDate" defaultDate={choicesFor(followUp).defaultDate} minDate={choicesFor(followUp).minDate} quickSelect={false} /></div><small className="muted-copy">Uses your usual follow-up time ({zoneLabel(timezone)}).</small><button className="button" type="submit">Snooze to this day</button></form>;
    const outcomeActions = <div className="review-outcome-actions"><JumpOutcomeButton jumpId={followUp.id} outcome="COMPLETED" className="button small" ariaLabel={`${directCall ? "Mark done" : "Mark sent"} for ${followUp.contact.displayName}`}><AppIcon name="check" />{directCall ? "Mark done" : "Mark sent"}</JumpOutcomeButton><Sheet trigger={<button className="button small" type="button" aria-label="Snooze"><AppIcon name="snooze" />Snooze</button>} title="Snooze follow-up"><div className="sheet-actions">{choicesFor(followUp).presets.map(([preset, label, at]) => <form action={snoozeJumpAction} key={preset}><input name="jumpId" type="hidden" value={followUp.id} /><input name="preset" type="hidden" value={preset} /><input name="returnTo" type="hidden" value={returnTo} /><button className="button" type="submit">{snoozeLabel(preset, label, at)}</button></form>)}</div>{snoozeToDay}</Sheet><JumpOutcomeButton jumpId={followUp.id} outcome="SKIPPED" className="button small" ariaLabel="Skip Beat"><AppIcon name="skip" />Skip Beat</JumpOutcomeButton></div>;
    const deliveryStatus = failed && failure ? <>
      <div className="notice warning compact" data-delivery-failed={failure.kind}><p>{failure.text}</p><p>Tried {formatDateTime(failed.updatedAt, displayPreferences)}.</p></div>
      <p className="review-delivery-status" data-delivery-status="manual">Manual · you send</p>
    </> : null;
    const editableAction = <EditableFollowUpAction
      key={family}
      jumpId={followUp.id}
      contactId={followUp.contactId}
      contactName={followUp.contact.displayName}
      channel={followUpChannel}
      email={email ?? null}
      phone={phone}
      phoneDialTarget={dialTarget}
      initialSubject={preparedSubject}
      initialContent={content}
      family={family}
      template={template}
      values={draftValues}
      draft={draft ? { subject: draft.subject, body: draft.body, script: draft.script, revision: draft.revision } : null}
      stepVersionId={followUp.stepVersionId}
      contextVersions={contextVersions}
      automaticDelivery={automaticDelivery}
      automaticSendAt={sendWindow?.opensAt && !sendWindow.open ? formatDateTime(sendWindow.opensAt, displayPreferences) : null}
      automaticSendDue={Boolean(sendWindow?.open)}
      deliveryStatus={deliveryStatus}
      channelChoice={choice}
      outcomeActions={outcomeActions}
      changedDetails={changedDetails}
    />;


    const nextScheduled = followUp.contact.jumps.find(beat => beat.id !== followUp.id);
    // What the follow-up is about: its reason, then its Mix. A one-time follow-up's Mix is never named (TDY-02).
    const reason = followUp.reason?.trim() || null;
    const mixShown = followUp.mix.source !== "ONE_TIME" && (!reason || reason.toLowerCase() !== followUp.mix.name.trim().toLowerCase());
    const otherIds = others.map(other => other.id);
    // On a person's shared card, each follow-up's Review and options name it by when it's due (JITM-10 §2.14).
    const dueWhen = otherIds.length === 0 ? "" : followUp.scheduledAt < startToday ? `, ${dueLabel}` : ` at ${formatTime(followUp.scheduledAt, { locale: displayPreferences.locale, timeZone: timezone })}`;
    return (
      <JumpWorkflowCard nextScheduledLabel={nextScheduled ? formatDateTime(nextScheduled.scheduledAt, displayPreferences) : undefined} jumpId={followUp.id} contactName={followUp.contact.displayName} revision={followUp.updatedAt.toISOString()} key={followUp.id}>
        <article id={`jump-${followUp.id}`} className={`jump-card jump-task-card ${isNext ? "next-follow-up" : ""} ${isPending ? "" : "jump-task-complete"}`} data-today-due={isPending && followUp.scheduledAt < endToday ? followUp.scheduledAt < startToday ? "overdue" : "today" : undefined}>
          <div className="jump-card-main"><span className="person-initials jump-person-avatar" aria-hidden="true">{followUp.contact.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("")}</span>
            {isNext && <span className="eyebrow">Next up</span>}
            <div className="jump-card-heading"><h3>{followUp.contact.displayName}</h3><span title={dueLabel} className={isPending && followUp.scheduledAt < startToday ? "due-pill overdue" : "due-pill"}>{isPending && followUp.scheduledAt >= startToday && followUp.scheduledAt < endToday ? formatTime(followUp.scheduledAt, { locale: displayPreferences.locale, timeZone: timezone }) : dueLabel}</span><span className="channel-pill">{channelName(followUpChannel)}</span></div>
            <div className="jump-meta">{!isPending && followUp.completedAt && <JumpStampEditor jumpId={followUp.id} completedAt={followUp.completedAt.toISOString()} label={formatDateTime(followUp.completedAt, displayPreferences)} />}{failure && <span className="jump-delivery-failed" data-delivery-failed={failure.kind}><AppIcon name="alert" />{failure.kind === "uncertain" ? "Send not confirmed" : "Automatic send failed"}</span>}{reason && <span>{reason}</span>}{mixShown && <span>{followUp.mix.name}</span>}</div>
            <p className="jump-snippet">{snippet}</p>
            {otherIds.length > 0 && <p className="jump-also-due-row">Also due: {alsoDueLabel(followUp)}</p>}
            {otherIds.length > 0 && <WhileAlsoDue jumpIds={otherIds}><JumpOutcomeButton jumpId={followUp.id} outcome="SKIPPED" className="text-button jump-skip-earlier" ariaLabel={`Skip this ${channelWord(channelName(followUpChannel))} for ${followUp.contact.displayName}`}><AppIcon name="skip" />Skip this {channelWord(channelName(followUpChannel))}</JumpOutcomeButton></WhileAlsoDue>}
          </div>

          <div className="jump-primary-action">
            {isPending && <Sheet className="follow-up-review-sheet" initiallyOpen={params.jump === followUp.id} desktopInitiallyOpen={isNext} trigger={<button className="button primary jump-channel-action" type="button" data-review-trigger aria-label={`Review ${directCall ? "call" : "message"} for ${followUp.contact.displayName}${dueWhen}`}><AppIcon name={directCall ? "phone" : followUpChannel === "EMAIL" ? "email" : "message"} /><span>Review</span></button>} title={followUp.contact.displayName} accessibleTitle={`Follow up with ${followUp.contact.displayName}`} description={followUp.contact.journey?.stage.name ?? "Follow-up"} leading={<span className="review-person-avatar" aria-hidden="true">{followUp.contact.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("")}</span>}><div className="review-workspace"><div className="review-composer"><div className="review-mix-heading"><div><p className="review-mix-name">{mixShown ? followUp.mix.name : reason ?? "Follow-up"}</p>{mixShown && reason && <p className="review-reason">{reason}</p>}</div><small className={followUp.scheduledAt < startToday ? "review-due-late" : "muted-copy"}>{dueLabel}</small></div>{otherIds.length > 0 && <AlsoDueNote className="review-also-due" items={others.map(other => ({ jumpId: other.id, label: alsoDueLabel(other) }))} />}<ol className="review-beat-rhythm" aria-label="Follow-up dates in this Mix">{reviewBeats.map(beat => <li key={beat.id} aria-current={beat.id === followUp.id ? "step" : undefined}><TodayLink href={`/jumps?jump=${encodeURIComponent(beat.id)}&range=all`} title={beat.reason}><i aria-hidden="true" /><time dateTime={beat.scheduledAt.toISOString()}>{formatDate(beat.scheduledAt, displayPreferences, { year: undefined })}</time></TodayLink></li>)}</ol>{editableAction}</div><aside className="review-person-context" aria-label={`About ${followUp.contact.displayName}`}><h3>Reach {followUp.contact.displayName}</h3>{phone && <p>{phone}</p>}{email && <p>{email}</p>}{followUp.contact.publicNotes && <><h3>Contact notes</h3><p className="conversation-note">{followUp.contact.publicNotes}</p></>}<Link className="inline-action" href={`/contacts/${followUp.contactId}`}>Open contact<AppIcon name="chevronRight" className="inline-action-icon" /></Link></aside></div></Sheet>}
            <div className="jump-completion-actions">
              {!isPending && (followUp.completionMethod?.startsWith("automatic:")
                ? <span className="jump-done-note" data-sent-automatically><AppIcon name="check" />Sent automatically</span>
                : <JumpOutcomeButton jumpId={followUp.id} outcome="REOPENED" className="button small jump-done-action" ariaLabel={`Reopen follow-up with ${followUp.contact.displayName}`}><AppIcon name="undo" /><span>Reopen</span></JumpOutcomeButton>)}
              {isPending && <Sheet
                trigger={<button className="button small" type="button" aria-label={`More options for ${followUp.contact.displayName}${dueWhen}`}><AppIcon name="more" /></button>}
                title={`Follow up with ${followUp.contact.displayName}`}
                description="Move it to a better day, skip it, or stop this Mix."
              >
                <div className="sheet-section"><h3>Already finished?</h3><JumpOutcomeButton jumpId={followUp.id} outcome="COMPLETED" className="button" ariaLabel={`Mark done for ${followUp.contact.displayName}`}><AppIcon name="check" /><span>Mark done</span></JumpOutcomeButton></div>
                <div className="sheet-section"><h3><AppIcon name="snooze" className="sheet-heading-icon" />Snooze</h3><div className="sheet-actions">{choicesFor(followUp).presets.map(([preset, label, at]) => <form action={snoozeJumpAction} key={preset}><input type="hidden" name="jumpId" value={followUp.id} /><input type="hidden" name="preset" value={preset} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button" type="submit">{snoozeLabel(preset, label, at)}</button></form>)}</div></div>
                {snoozeToDay}
                <div className="sheet-danger-zone"><JumpOutcomeButton jumpId={followUp.id} outcome="SKIPPED" className="button" ariaLabel="Skip Beat"><AppIcon name="skip" /><span>Skip Beat</span></JumpOutcomeButton>{followUp.mix.source !== "ONE_TIME" && <ConfirmDialog trigger="Stop Mix…" title={`Stop ${followUp.mix.name} for ${followUp.contact.displayName}?`} description="Future follow-ups from this Mix will be removed. Completed history stays available." danger><form action={stopMixForContactAction}><input type="hidden" name="mixId" value={followUp.mixId} /><input type="hidden" name="contactId" value={followUp.contactId} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button danger" type="submit">Stop Mix</button></form></ConfirmDialog>}</div>
                {recentEvents.length > 0 && <details className="workflow-options"><summary>Recent activity</summary><div className="jump-action-history">{recentEvents.map(event => <span key={event.id}>{eventLabel(event.action)} · {formatDateTime(event.occurredAt, displayPreferences)}</span>)}</div></details>}
              </Sheet>}
            </div>
          </div>
        </article>
      </JumpWorkflowCard>
    );
  };

  // Every due card sits in its person's group, so a follow-up left after the person's other one is recorded keeps its
  // place, and its open review, when the list refreshes (D71).
  const renderGroup = (group: typeof needsAttention) => {
    const shared = group.length > 1;
    return (
      <div key={group[0].contactId} className={`jump-person-group${shared ? " shared" : ""}${shared && !compact && group[0].id === nextUp?.id ? " next-follow-up-group" : ""}`} data-person-group={shared || undefined} role={shared ? "group" : undefined} aria-label={shared ? group[0].contact.displayName : undefined}>
        {group.map(followUp => renderCard(followUp, group.filter(other => other.id !== followUp.id)))}
      </div>
    );
  };

  const firstFollowUp = params.firstContact ? followUps.find(followUp => followUp.contact.displayName === params.firstContact) : undefined;
  const firstNeedsEmail = firstFollowUp?.stepVersion.stepTemplate.channel === "EMAIL";
  const firstFollowUpReady = firstFollowUp && (firstNeedsEmail ? firstFollowUp.contact.emails.length > 0 : firstFollowUp.contact.phones.length > 0);
  const welcomeMessage = firstFollowUpReady ? `Your first follow-up for ${params.firstContact} is ready.`
    : firstFollowUp ? `Your follow-up for ${params.firstContact} is saved. Add ${firstNeedsEmail ? "an email address" : "a phone number"} to review and send it.`
    : preparation.state !== "ready" ? "Your details are saved. We’re checking your follow-ups." : pending.length > 0 ? "Your follow-up list is ready." : "You’re set up.";
  // Only promise a Review when one exists; otherwise point at the step that unblocks the first follow-up.
  const welcomeNextStep = firstFollowUpReady ? " Tap Review to begin."
    : firstFollowUp ? <> <Link className="inline-action" href={`/contacts/${firstFollowUp.contactId}/edit?returnTo=${encodeURIComponent(`/jumps?jump=${firstFollowUp.id}&range=all`)}`}>Add {firstNeedsEmail ? "an email address" : "a phone number"}<AppIcon name="chevronRight" className="inline-action-icon" /></Link></>
    : preparation.state !== "ready" ? null
    : pending.length > 0 ? " Tap Review to begin."
    : <> <Link className="inline-action" href="/contacts/new">Add your first person<AppIcon name="chevronRight" className="inline-action-icon" /></Link></>;
  // Once the first follow-up is ready, a complete Mega-Mix is the optional next step (JITM-09 §2.20): offered for
  // business use while the account has none, naming the one that fits the business type or example when one does.
  const megaMixNextStep = firstFollowUpReady && !impersonation && profile?.useCases.includes("business")
    ? await Promise.all([prisma.megaMixPipeline.count({ where: { workspaceId: workspace.id } }), prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId: workspace.id } })])
      .then(([megaMixes, marketing]) => megaMixes ? null : { blueprint: megaMixById(matchedMegaMix(profile.industry, storedMarketingScenario(marketing?.scenario, marketing?.version)?.id)) })
      .catch(() => null)
    : null;

  // Whether this view's Done grows by an outcome recorded here (CNT-03, CNT-05).
  const doneCounts = doneGrowth({ range, status, priority }, { pending: pendingCount, pendingOnPage: pending.length, listedCompleted: completed.length, size: TODAY_PAGE_SIZE, previous: currentCursor?.direction === "before" });
  // What the header says with nothing due; the live summary says the same once the last due follow-up is done.
  const upcomingTotal = upcomingCount + (workflowAttention?.futureTotal ?? 0);
  const zeroLine = !workflowAttention ? "Your next steps could not be checked." : workflowAttention.total ? `${workflowAttention.total} item${workflowAttention.total === 1 ? " needs" : "s need"} your input.` : workflowAttention.preparing || preparation.state !== "ready" ? "Your follow-up list is awaiting preparation." : upcomingTotal ? `${upcomingTotal.toLocaleString()} upcoming follow-up${upcomingTotal === 1 ? "" : "s"}.` : activeFilterCount ? "No open follow-ups in this view." : "You’re caught up.";

  return (
    <TodayNavigation key={workspace.id} viewKey={returnTo}>
      <TodayLiveCounts readAt={now.toISOString()} overdue={overdueCount} doneCounts={doneCounts} zero={zeroLine} initial={{ overdue: overdueCount - sharedOverdueCount, today: attentionCount - overdueCount + sharedOverdueCount, upcoming: (upcomingCount || dueThisWeekCount) + (workflowAttention?.futureTotal ?? 0), done: doneSummaryCount(range, completed.length, completedTodayCount) }}>
      <TodayMomentum />
      <JumpReturnTray />
      <MixEndPrompt mixes={startableMixes} todayKey={logicalDateKey(logicalDateInTimezone(new Date(), timezone))} address={JSON.stringify(params)} viewOnly={Boolean(impersonation)} />
      {params.setupLater && <Notice type="success">Your setup answers are saved. <Link href="/onboarding">Return to setup</Link> whenever you’re ready.</Notice>}
      {params.invitations && <Notice type="success">{params.invitations === "1" ? "Your invitation is" : "Your invitations are"} ready to send. {params.invitations === "1" ? "It hasn’t" : "They haven’t"} been sent yet.</Notice>}
    {params.welcome && <Notice type="success">{welcomeMessage}{welcomeNextStep}{megaMixNextStep && <> Optional next step: <Link className="inline-action" href={megaMixNextStep.blueprint ? `/templates/journeys?journey=${encodeURIComponent(megaMixNextStep.blueprint.id)}` : "/templates/journeys"}>{megaMixNextStep.blueprint ? `Set up the ${megaMixNextStep.blueprint.name} Mega-Mix` : "Choose a complete Mega-Mix"}<AppIcon name="chevronRight" className="inline-action-icon" /></Link></>}</Notice>}
      {params.demo && <Notice type="info">Using local demo data.</Notice>}
      {params.applied && <Notice type="success">Mix changes saved.</Notice>}
      {params.mixStopped && <Notice type="success">Mix stopped.</Notice>}
      {params.mixStopError && <Notice type="error">Mix could not be stopped.</Notice>}
      {params.snoozed && <Notice type="success">{/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(params.snoozed) && !Number.isNaN(Date.parse(params.snoozed)) ? `Snoozed until ${formatDateTime(params.snoozed, displayPreferences)}.` : "Follow-up snoozed."}</Notice>}
      {params.contactSaved === "1" && <Notice type="success">Contact saved. This follow-up now uses the new details.</Notice>}
      {params.verified === "1" && <Notice type="success">Your email is verified.</Notice>}
      {params.listReset && <Notice type="info">This part of the list changed. You’re back at the first follow-ups.</Notice>}
      {params.mixAssigned && <Notice type="success">{params.mixStart === "saved" ? "Start saved. It follows this person’s saved date." : /^\d{4}-\d{2}-\d{2}$/.test(params.mixStart ?? "") ? `Start saved for ${formatDate(new Date(`${params.mixStart}T12:00:00Z`), { ...displayPreferences, timeZone: "UTC" })}.` : "Start saved."} Follow-ups are being prepared.{params.mixAssigned === "visit" && " Its Beats timed from an appointment wait until you line it up with a visit from the calendar."}{params.mixPerson && <> <Link href={`/contacts/${encodeURIComponent(params.mixPerson)}`}>View person</Link></>}</Notice>}
      {params.noMixNeeded && (Number(params.noMixNeeded) > 0 && params.noMixPeople ? <Notice type="success"><span className="notice-with-action">Marked No Mix needed.<form action={setNoMixNeededAction}><input type="hidden" name="intent" value="clear" />{params.noMixPeople.split(",").slice(0, 100).map(id => <input type="hidden" name="contactIds" value={id} key={id} />)}<input type="hidden" name="returnTo" value="/jumps" /><FormSubmitButton label="Undo" pendingLabel="Undoing…" className="button small" icon={<AppIcon name="undo" />} /></form></span></Notice> : <Notice type="info">{noMixNeededNotice({ marked: 0, inMix: Number(params.noMixInMix) || 0, doNotContact: Number(params.noMixDnc) || 0, already: Number(params.noMixAlready) || 0 })}</Notice>)}
      {params.noMixCleared && <Notice type="success">No Mix needed removed.</Notice>}
      <UrlErrorNotice params={params} viewer={session} />

      <header className="page-header today-page-header">
        <div><h1 tabIndex={-1}>Today</h1><p>{attentionCount ? <LiveAttentionSummary /> : zeroLine}</p>{(!workflowAttention || workflowAttention.total > 0) && <a className="text-button" href="#needs-your-input">Needs your input{workflowAttention ? ` · ${workflowAttention.total}` : ""}</a>}</div>
        <div className="today-header-tools"><Sheet trigger={<button className={query ? "icon-button today-search-trigger active" : "icon-button today-search-trigger"} type="button" aria-label={query ? `Search: ${query}` : "Search Today"}><AppIcon name="search" /></button>} title="Search Today" description="Find a person, Mix, or reason.">
          <form action="/jumps" className="search-row" role="search"><label className="field"><span>Find a person, Mix, or reason</span><input type="search" name="q" autoFocus defaultValue={query} maxLength={160} placeholder="Search this follow-up view" /></label>{[...viewParams].filter(([name]) => name !== "q").map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<button className="button primary" type="submit"><AppIcon name="search" />Search</button></form>
          {query && <TodayLink className="button" href={`/jumps?${new URLSearchParams([...viewParams].filter(([name]) => name !== "q"))}`}>Clear search</TodayLink>}
        </Sheet>
        <Sheet trigger={<button className={activeFilterCount ? "button filter-trigger active" : "button filter-trigger"} type="button"><AppIcon name="filter" />Filter{activeFilterCount ? ` ${activeFilterCount}` : ""}</button>} title="Filter Today" description="Changes apply as soon as you choose them.">
          <AutoSubmitForm key={viewParams.toString()} className="form-stack" action="/jumps" ariaLabel="Today filters">
            <input type="hidden" name="q" value={query} /><input type="hidden" name="view" value={compact ? "compact" : "focus"} /><label className="field"><span>Priority</span><select name="priority" defaultValue={priority}><option value="all">All priorities</option><option value="overdue">Overdue commitments</option></select></label>
            <label className="field"><span>Dates</span><select name="range" defaultValue={range}><option value="due">Due now</option><option value="week">Next 7 days</option><option value="month">Next 30 days</option><option value="all">All dates</option></select></label>
            <label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="all">Open and completed</option><option value="pending">Open</option><option value="done">Completed</option><option value="skipped">Skipped</option></select></label>
            <label className="field"><span>How</span><select name="channel" defaultValue={channel}><option value="all">Any method</option>{channels.map((item) => <option key={item} value={item}>{channelName(item)}</option>)}</select></label>
          </AutoSubmitForm>

      <nav className="page-actions" aria-label="Today layout"><TodayLink className="button small" aria-current={!compact ? "page" : undefined} href={`/jumps?${new URLSearchParams({ ...Object.fromEntries(viewParams), view: "focus" })}`}>Focused work</TodayLink><TodayLink className="button small" aria-current={compact ? "page" : undefined} href={`/jumps?${new URLSearchParams({ ...Object.fromEntries(viewParams), view: "compact" })}`}>Compact scan</TodayLink><TodayLink className="button small" href="/jumps?range=all&status=pending&priority=overdue&view=compact">Review overdue</TodayLink></nav>

          {activeFilterCount > 0 && <TodayLink className="button" href="/jumps">Clear filters</TodayLink>}
        </Sheet></div>
      </header>

      {invitationsToSend.length > 0 && <section className="invite-send" aria-labelledby="invite-send-heading">
        <div className="invite-send-head"><AppIcon name="gift" /><div><h2 id="invite-send-heading">{invitationsToSend.length === 1 ? "1 invitation ready to send" : `${invitationsToSend.length} invitations ready to send`}</h2><p>Not sent yet. Open each one and send it from your own email or text app.</p></div></div>
        <ul className="invite-send-list">{invitationsToSend.map(item => {
          const name = item.contact.displayName, address = item.accessInvite?.recipientEmail ?? item.accessInvite?.recipientPhone ?? "";
          return <li key={item.id}><span className="invite-person"><strong>{name}</strong><small>{address}</small></span><Link className="button small primary" href={`/jumps?jump=${item.id}&range=all#jump-${item.id}`} aria-label={`Review and send the invitation to ${name}`}>Review and send</Link></li>;
        })}</ul>
      </section>}
      {invitations && <section className="invite-strip" aria-label="Personal invitations"><AppIcon name="gift" /><p><strong>You have {invitations} invitation{invitations === 1 ? "" : "s"} to share.</strong></p><Link className="button small primary" href={INVITATIONS_PATH}>Invite people</Link></section>}

      {planLimitNotice && <div className="notice warning compact" data-plan-limit-skipped={planLimitNotice.skipped}><p>{planLimitNotice.skipped === 1 ? "1 person wasn’t" : `${planLimitNotice.skipped.toLocaleString("en-US")} people weren’t`} added to a Mix this week. Your {planLimitNotice.plan.name} plan has room for {planLimitNotice.plan.people.toLocaleString("en-US")} people with follow-ups on.</p><p>Once there’s room, resume the Mix from their contact page. <Link href="/account/billing">See plans</Link></p></div>}
      <PreparationNotice initial={preparation} canRetry={!impersonation} deferWhileEditing />
      {overdueGroups.length > 0 && <LiveSection name="overdue" aria-labelledby="overdue-follow-ups"><div className="section-label urgent"><h2 id="overdue-follow-ups">Overdue</h2><span><LiveCount name="overdue" /></span></div><div className="jump-list">{overdueGroups.map(renderGroup)}</div></LiveSection>}
      {todayGroups.length > 0 && <LiveSection name="today" aria-labelledby="today-follow-ups"><div className="section-label"><h2 id="today-follow-ups">Today</h2><span><LiveCount name="today" /></span></div><div className="jump-list">{todayGroups.map(renderGroup)}</div></LiveSection>}
      <WorkflowAttention attention={workflowAttention} />
      <QuietDaySuggestions locale={displayPreferences.locale} initial={quietDays} canResolve={!impersonation} compact />
      {noMixCount > 0 && <p className="today-no-mix-line"><AppIcon name="people" /><span>{noMixTodayLine(noMixCount)}</span><Link href="/contacts?mix=no-mix">Review</Link></p>}
      <details className="today-queue-group" data-today-section="upcoming" open={upcoming.length > 0 || Boolean(workflowAttention?.future?.length) || undefined}><summary>{range === "due" || range === "week" ? "Next 7 days" : "Upcoming"} <span><LiveCount name="upcoming" /></span></summary><UpcomingWorkflowCommitments attention={workflowAttention} displayPreferences={displayPreferences} />{upcoming.length ? <div className="jump-list">{upcoming.map(followUp => renderCard(followUp))}</div> : <TodayLink href="/jumps?range=week&status=pending">View upcoming follow-ups</TodayLink>}</details>
      <details className="today-queue-group" open={status === "done" || status === "skipped" || pendingCount === 0 || undefined}><summary>Done <span><LiveCount name="done" /></span></summary>{completed.length ? <div className="jump-list">{completed.map(followUp => renderCard(followUp))}</div> : <TodayLink className="today-queue-link" href="/jumps?range=due&status=done">View completed follow-ups</TodayLink>}</details>
      {totalCount > 0 && <nav className="pagination-bar today-pagination" aria-label="Follow-up pages">
        <span role="status">Showing {ordered.length} of {totalCount.toLocaleString()} follow-up{totalCount === 1 ? "" : "s"} in this view.</span>
        <div className="page-actions">
          {list.previous && <><TodayLink className="button" href={firstHref}>First follow-ups</TodayLink><TodayLink className="button" href={pageHref("before", list.previous)}>Previous</TodayLink></>}
          {list.next && <TodayLink className="button primary" href={pageHref("after", list.next)}>Next follow-ups</TodayLink>}
        </div>
      </nav>}
      {!ordered.length && params.jump && <Notice type="info">{!exactRecord ? "This follow-up is unavailable. It may have been removed or belong to another account." : <>{["This follow-up is no longer pending.", followUpEndedReason(exactRecord.completionMethod)].filter(Boolean).join(" ")} <Link href={exactRecord.workflowInstanceId ? `/journey?${new URLSearchParams({ contactId: exactRecord.contactId, work: exactRecord.workflowInstanceId })}` : `/contacts/${exactRecord.contactId}`}>Review its current context</Link>.</>}</Notice>}
      {!ordered.length && !params.jump && workflowAttention && !workflowAttention.total && !workflowAttention.preparing && preparation.state === "ready" && (activeFilterCount
        ? <EmptyState title="No follow-ups match these filters" description="Try clearing the filters to see what needs your attention today." actionHref="/jumps" actionLabel="Clear filters" />
        : <EmptyState title="Nothing due right now" description="A little hello goes a long way. Add a person and choose a follow-up date; your next action will appear here." actionHref="/contacts/new" actionLabel="Add a person" />)}
      {!ordered.length && <div className="page-actions"><TodayLink className="button" href="/jumps?range=month&status=pending">Review upcoming</TodayLink><Link className="button" href="/contacts">Schedule with an existing person</Link></div>}
      </TodayLiveCounts>
    </TodayNavigation>
  );
}
