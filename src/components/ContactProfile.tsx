import { ContactAnchorReveal } from "@/components/ContactAnchorReveal";
import { PLAN_LIMIT_STOP } from "@/lib/plan-limits";
import { contactDueLabel, recordedStageChanges, sameContactSequence } from "@/lib/contact-profile-view";
import { ContactWorkflowProgress } from "@/components/WorkflowProgress";
import { getJumpDateOccurrences, logicalDateInTimezone, logicalDateKey, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { ContactJourneyPanel } from "@/components/ContactJourneyPanel";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveContactAction } from "@/lib/actions";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContactRelationshipStatePanel } from "@/components/ContactRelationshipStatePanel";
import { ContactTimeline } from "@/components/ContactTimeline";
import { ContactsBackLink } from "@/components/ContactsBackLink";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Notice } from "@/components/Notice";
import { PreparationNotice } from "@/components/PreparationNotice";
import { ReviewRequestButton } from "@/components/ReviewRequestButton";
import { Sheet } from "@/components/Sheet";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { requireWorkspace } from "@/lib/auth";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { restoreContactAction } from "@/lib/contact-lifecycle-actions";
import { assignMixToContactAction, removeMixAssignmentAction } from "@/lib/contact-mix-actions";
import { contactMixStatus } from "@/lib/contact-mix-status";
import { setNoMixNeededAction } from "@/lib/contact-no-mix-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDate, formatDateTime } from "@/lib/format";
import { listGroupStates } from "@/lib/group-activity";
import { createImportantDateAction, deactivateImportantDateAction, updateImportantDateAction } from "@/lib/important-date-actions";
import { formatDateInput } from "@/lib/mix-broadcast";
import { resumeMixForContactAction, stopMixForContactAction } from "@/lib/mix-stop-actions";
import { prisma } from "@/lib/prisma";
import { readPreparationStatus } from "@/lib/preparation";


const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export type ContactProfileSearchParams = {
  created?: string; followUpScheduled?: string; dateCreated?: string; dateUpdated?: string; dateDeleted?: string; mixAssigned?: string; mixStart?: string; mixRemoved?: string;
  mixStopped?: string; mixResumed?: string; mixStopError?: string; mixResumeError?: string; updated?: string; inlineUpdated?: string;
  stateUpdated?: string; merged?: string; restored?: string; error?: string; at?: string; sig?: string;
  noMixNeeded?: string; noMixCleared?: string; noMixInMix?: string; noMixDnc?: string; noMixAlready?: string;
};

function addressText(address: { street1: string | null; street2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }): string {
  return [address.street1, address.street2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ");
}

export async function ContactProfile({ contactId, query = {}, embedded = false, directoryHref }: { contactId: string; query?: ContactProfileSearchParams; embedded?: boolean; directoryHref?: string }) {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  const preparation = await readPreparationStatus(workspace.id, contactId);
  const [contact, dateTypes, plans, stops, groupStates, relationshipState, mergeHistory, nextFollowUp, comingUp, journeyStages, journeyEvents] = await Promise.all([
    // Archived people are found too: an old link or merge note opens their archived state, not a 404.
    prisma.contact.findFirst({
      where: { id: contactId, workspaceId: workspace.id },
      include: {
        journey: { include: { stage: true } },
        emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        groupMemberships: { include: { group: true } },
        customFieldValues: { include: { definition: true }, orderBy: { definition: { name: "asc" } } },
        jumpDates: { where: { isActive: true }, include: { dateType: true }, orderBy: [{ dateValue: "asc" }, { month: "asc" }, { day: "asc" }] },
        mixAssignments: { include: { mix: true }, where: { isActive: true, contactId }, orderBy: { createdAt: "asc" } }
      }
    }),
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } }, orderBy: { name: "asc" } }),
    prisma.mixStop.findMany({ where: { workspaceId: workspace.id, contactId }, orderBy: { stoppedAt: "desc" } }),
    listGroupStates(workspace.id),
    prisma.contactRelationshipState.findUnique({ where: { contactId } }),
    prisma.contactMergeRecord.findMany({ where: { workspaceId: workspace.id, survivorContactId: contactId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.jump.findFirst({ where: { workspaceId: workspace.id, contactId, status: "PENDING" }, orderBy: { scheduledAt: "asc" }, include: { mix: { include: { steps: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } }, mixStep: true } }),
    prisma.jump.findMany({ where: { workspaceId: workspace.id, contactId, status: "PENDING" }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 6, select: { id: true, reason: true, scheduledAt: true, mixId: true } }),
    prisma.journeyStage.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, name: true, position: true, isActive: true, planId: true } }),
    prisma.journeyEvent.findMany({ where: { workspaceId: workspace.id, contactId, resultingStageId: { not: null } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 100 })
  ]);
  if (!contact) notFound();

  const displayPreferences = await displayPreferencesForUser(user.id);
  const todayKey = logicalDateKey(logicalDateInTimezone(new Date(), displayPreferences.timeZone));
  // Where a started plan counts from; a plan that follows a saved date uses the person's own date when they have one.
  const startDateField = <label className="field"><span>Start on</span><input type="date" name="startDate" required min={todayKey} defaultValue={todayKey} /></label>;
  const initials = contact.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("");
  // In the docked Contacts layout a chosen row moves focus here (ContactsBulkWorkspace).
  const heading = embedded ? <h2 id="contact-profile-heading" tabIndex={-1}>{contact.displayName}</h2> : <h1>{contact.displayName}</h1>;
  if (contact.archivedAt) {
    return (
      <div className={`page contact-detail-page${embedded ? " contact-profile-embedded" : ""}`}>
        <UrlErrorNotice params={query} viewer={session} />
        <header className="contact-profile-header">
          <div className="contact-detail-header-actions">
            <ContactsBackLink className="contact-inline-action" ariaLabel="Back to contacts"><AppIcon name="chevronLeft" />Contacts</ContactsBackLink>
          </div>
          <span className="person-initials profile-avatar" aria-hidden="true">{initials}</span>
          <div className="profile-identity">{heading}</div>
        </header>
        <Notice type="info">Archived on {formatDate(contact.archivedAt, displayPreferences)}. Notes, dates and history are kept. Restoring can prepare follow-ups from active Mixes again; do-not-contact and pause settings still apply.</Notice>
        <div className="page-actions">
          <form action={restoreContactAction}><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><FormSubmitButton label="Restore contact" pendingLabel="Restoring…" disabled={Boolean(impersonation)} /></form>
          <Link className="button" href="/contacts/archived">Archived contacts</Link>
        </div>
      </div>
    );
  }
  const [pendingCount, mixStatus] = await Promise.all([
    prisma.jump.count({ where: { workspaceId: workspace.id, contactId, status: "PENDING" } }),
    contactMixStatus(workspace.id, contactId)
  ]);
  const followUpType = dateTypes.find((type) => type.slug === "follow-up");
  const stopByMixId = new Map(stops.map((stop) => [stop.mixId, stop]));
  const directPlanIds = new Set(contact.mixAssignments.map((assignment) => assignment.mixId));
  const additionalStoppedPlans = plans.filter((plan) => stopByMixId.has(plan.id) && !directPlanIds.has(plan.id));
  const activeByGroupId = new Map(groupStates.map((state) => [state.groupId, state.isActive]));
  const primaryEmail = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email ?? null;
  const primaryPhone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone ?? null;
  const state = relationshipState ?? { preferredChannel: null, priority: "NORMAL" as const, doNotContact: false, relationshipStatus: null, nextCommitmentAt: null, version: 0 };

  const now = new Date();
  const shortDate = (date: Date) => formatDate(date, displayPreferences, { year: undefined });
  const sequenceCandidates = nextFollowUp ? await prisma.jump.findMany({
    where: { workspaceId: workspace.id, contactId, mixId: nextFollowUp.mixId, status: { not: "CANCELED" },
      ...(nextFollowUp.appointmentBindingId ? { appointmentBindingId: nextFollowUp.appointmentBindingId } : { jumpDateId: nextFollowUp.jumpDateId }),
      scheduledAt: { gte: new Date(nextFollowUp.scheduledAt.getTime() - 370 * 86_400_000), lte: new Date(nextFollowUp.scheduledAt.getTime() + 370 * 86_400_000) } },
    include: { mixStep: true }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 2000
  }) : [];
  const sequence = nextFollowUp ? sequenceCandidates.filter(beat => sameContactSequence(nextFollowUp, beat)) : [];
  const sequenceSteps = nextFollowUp ? [...nextFollowUp.mix.steps, ...(!nextFollowUp.mix.steps.some(step => step.id === nextFollowUp.mixStepId) ? [nextFollowUp.mixStep] : [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)) : [];
  const currentBeat = sequenceSteps.findIndex(step => step.id === nextFollowUp?.mixStepId) + 1;
  const today = logicalDateInTimezone(now, displayPreferences.timeZone);
  const dateRangeStart = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const dateRangeEnd = new Date(Date.UTC(today.year + 1, today.month - 1, today.day));
  const importantDates = contact.jumpDates.flatMap(item => {
    const next = getJumpDateOccurrences(item, dateRangeStart, dateRangeEnd)[0];
    return next ? [{ id: item.id, title: item.label || item.dateType.name, type: item.dateType.name, date: zonedDateTimeToUtc(next, 12 * 60, displayPreferences.timeZone) }] : [];
  });
  const upcoming = [
    ...comingUp.filter(beat => beat.id !== nextFollowUp?.id).map(beat => ({ id: beat.id, date: beat.scheduledAt, title: beat.reason, href: `/jumps?jump=${encodeURIComponent(beat.id)}&range=all` })),
    ...importantDates.map(date => ({ ...date, href: `#dates-and-mixes` }))
  ].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
  const stagePlanIds = journeyStages.flatMap(stage => stage.planId ? [stage.planId] : []);
  const pastTouchpoints = await prisma.jump.findMany({ where: { workspaceId: workspace.id, contactId, status: "DONE", mixId: { notIn: stagePlanIds } }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: 2, select: { id: true, reason: true, completedAt: true, scheduledAt: true } });
  const futureTouchpoints = comingUp.filter(beat => beat.id !== nextFollowUp?.id && beat.scheduledAt >= now && !stagePlanIds.includes(beat.mixId)).slice(0, 2);
  const stageNames = new Map(journeyStages.map(stage => [stage.id, stage.name]));
  const moves = recordedStageChanges([...journeyEvents].reverse()).slice(-5);
  if (contact.journey && !moves.some(move => move.resultingStageId === contact.journey!.stageId && move.occurredAt.getTime() === contact.journey!.stageSince.getTime())) {
    if (moves.at(-1)?.resultingStageId === contact.journey.stageId) moves.pop();
    moves.push({ id: "current-stage", workspaceId: workspace.id, contactId, eventKey: "current-stage", eventType: "MANUAL", source: "", resultingStageId: contact.journey.stageId, occurredAt: contact.journey.stageSince });
  }
  const futureStages = journeyStages.filter(stage => stage.isActive && contact.journey && stage.position > contact.journey.stage.position).slice(0, 3);
  // Where this person goes next: a Mix, a one-time follow-up, or the owner's confirmation that they need no Mix (JITM-09 §2.76).
  // Docked beside Contacts, the list's filters and this person come back with the notice (D47).
  const returnTo = embedded ? directoryHref ?? `/contacts?person=${encodeURIComponent(contact.id)}` : `/contacts/${contact.id}`;
  const noMixChoice = mixStatus === "no-mix" || mixStatus === "no-mix-needed" ? <form action={setNoMixNeededAction} className="form-stack contact-no-mix-form"><input type="hidden" name="contactIds" value={contact.id} /><input type="hidden" name="returnTo" value={returnTo} />{mixStatus === "no-mix" ? <><p className="muted-copy">Doesn’t need follow-ups from a Mix, such as a supplier? Confirm it so they leave the No Mix list. It clears itself if they join a Mix later.</p><button className="button" type="submit" disabled={Boolean(impersonation)}>Mark No Mix needed</button></> : <><input type="hidden" name="intent" value="clear" /><p className="muted-copy">You confirmed that {contact.displayName} needs no Mix.</p><button className="button" type="submit" disabled={Boolean(impersonation)}>Remove No Mix needed</button></>}</form> : null;
  const touchpoint = <Sheet trigger={<button type="button" className="contact-inline-action"><AppIcon name="mixes" />Start a follow-up</button>} title={`Start a follow-up for ${contact.displayName}`}>
    <p>Choose an existing Mix or schedule a one-time follow-up.</p>
    {plans.length > 0 && <form action={assignMixToContactAction} className="form-stack"><input type="hidden" name="contactId" value={contact.id} /><label className="field"><span>Choose a Mix</span><select name="mixId" required>{plans.map(plan => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select></label>{startDateField}<button className="button primary" disabled={state.doNotContact || Boolean(impersonation)} type="submit">Start Mix</button></form>}
    {!state.doNotContact && <Link className="button" href={`/contacts?intent=one-time-jump&people=${encodeURIComponent(contact.id)}&q=${encodeURIComponent(contact.displayName)}`}>Schedule a one-time follow-up</Link>}
    {state.doNotContact && <p>Do not contact is on. Update this person’s preferences before starting a follow-up.</p>}
    {noMixChoice}
  </Sheet>;
  const mixChip = mixStatus === "no-mix" || mixStatus === "no-mix-needed" ? <Sheet trigger={<button type="button" className="contact-mix-chip" data-status={mixStatus} aria-label={`${mixStatus === "no-mix" ? "No Mix" : "No Mix needed"}: choose what's next for ${contact.displayName}`}>{mixStatus === "no-mix" ? "No Mix" : "No Mix needed"}<AppIcon name="chevronDown" /></button>} title={`What’s next for ${contact.displayName}`} description={mixStatus === "no-mix" ? "No Mix has work to come for this person." : undefined}>
    {plans.length > 0 && !state.doNotContact && <form action={assignMixToContactAction} className="form-stack"><input type="hidden" name="contactId" value={contact.id} /><label className="field"><span>Choose a Mix</span><select name="mixId" required>{plans.map(plan => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select></label>{startDateField}<button className="button primary" disabled={Boolean(impersonation)} type="submit">Start Mix</button></form>}
    {plans.length === 0 && <p>Create a Mix first. <Link href="/mixes">Go to Mixes</Link></p>}
    {!state.doNotContact && <Link className="button" href={`/contacts?intent=one-time-jump&people=${encodeURIComponent(contact.id)}&q=${encodeURIComponent(contact.displayName)}`}>Schedule a one-time follow-up</Link>}
    {noMixChoice}
  </Sheet> : null;
  const journeyTrack = <>
    <div className="contact-section-heading"><h2>Journey</h2>{touchpoint}</div>
    {contact.journey ? <div className="contact-journey-track" role="region" tabIndex={0} aria-label="Recorded stage history and possible next stages">
      <ol className="contact-stage-history">{moves.map((move, index) => <li key={move.id} className={index === moves.length - 1 ? "is-current" : "is-complete"} aria-current={index === moves.length - 1 ? "step" : undefined}><strong>{stageNames.get(move.resultingStageId!) ?? "Previous stage"}</strong><time dateTime={move.occurredAt.toISOString()}>{shortDate(move.occurredAt)}</time><i aria-hidden="true" /></li>)}</ol>
      <div className="contact-journey-today"><i aria-hidden="true" /><span>Today</span></div>
      {futureStages.length > 0 && <ol className="contact-stage-future" aria-label="Possible next stages, not scheduled">{futureStages.map(stage => <li key={stage.id}><span>{stage.name}</span><i aria-hidden="true" /></li>)}</ol>}
    </div> : <p className="contact-empty-copy">No stage yet. Choose a stage beside this person’s name.</p>}
    {(pastTouchpoints.length > 0 || futureTouchpoints.length > 0 || importantDates.length > 0) && <div className="contact-journey-touchpoints" aria-label="Recorded and upcoming follow-ups">
      {pastTouchpoints.map(beat => <Link href="#contact-history" key={beat.id}><AppIcon name="check" />{beat.reason} · {shortDate(beat.completedAt ?? beat.scheduledAt)}</Link>)}
      {futureTouchpoints.map(beat => <Link href={`/jumps?jump=${encodeURIComponent(beat.id)}&range=all`} key={beat.id}><AppIcon name="mixes" />{beat.reason} · {shortDate(beat.scheduledAt)}</Link>)}
      {importantDates.slice(0, 2).map(date => <Link href="#dates-and-mixes" key={date.id}><AppIcon name="calendar" />{date.type} · {shortDate(date.date)}</Link>)}
    </div>}
  </>;

  return (
    <div className={`page contact-detail-page${embedded ? " contact-profile-embedded" : ""}`}>
      <ContactAnchorReveal contactId={contact.id} />
      {query.created && <Notice type="success">Contact added.{query.followUpScheduled && nextFollowUp && <> Their first follow-up is on Today for {formatDateTime(nextFollowUp.scheduledAt, displayPreferences)}.</>}</Notice>}
      {query.updated && <Notice type="success">Contact updated.</Notice>}
      {query.inlineUpdated && <Notice type="success">Contact saved.</Notice>}
      {query.stateUpdated && <Notice type="success">Saved.</Notice>}
      {query.merged && <Notice type="success">Contacts merged.</Notice>}
      {query.restored && <Notice type="success">Contact restored.</Notice>}
      {!query.created && query.dateCreated && <Notice type="success">Date added.</Notice>}
      {query.dateUpdated && <Notice type="success">Date updated.</Notice>}
      {query.dateDeleted && <Notice type="success">Date removed.</Notice>}
      {!query.created && query.mixAssigned && <Notice type="success">{query.mixStart === "saved" ? "Start saved. It follows this person’s saved date." : /^\d{4}-\d{2}-\d{2}$/.test(query.mixStart ?? "") ? `Start saved for ${formatDate(new Date(`${query.mixStart}T12:00:00Z`), { ...displayPreferences, timeZone: "UTC" })}.` : "Start saved."} Follow-ups are being prepared. <Link href="/settings/notifications">Set up reminders for me (optional)</Link>.{query.mixAssigned === "visit" && <> Its Beats timed from an appointment wait until you <Link href={`/calendar?contact=${contact.id}`}>line it up with a visit</Link> from the calendar.</>}</Notice>}
      {query.noMixNeeded && (Number(query.noMixNeeded) > 0 ? <Notice type="success"><span className="notice-with-action">Marked No Mix needed.<form action={setNoMixNeededAction}><input type="hidden" name="intent" value="clear" /><input type="hidden" name="contactIds" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><FormSubmitButton label="Undo" pendingLabel="Undoing…" className="button small" icon={<AppIcon name="undo" />} /></form></span></Notice> : <Notice type="info">{query.noMixAlready ? `${contact.displayName} is already marked No Mix needed.` : query.noMixDnc ? `${contact.displayName} is marked Do not contact, so nothing changed.` : `${contact.displayName} is already in a Mix, so nothing changed.`}</Notice>)}
      {query.noMixCleared && (Number(query.noMixCleared) > 0 ? <Notice type="success">No Mix needed removed.</Notice> : <Notice type="info">{contact.displayName} isn’t marked No Mix needed, so nothing changed.</Notice>)}
      {query.mixRemoved && <Notice type="success">Mix removed.</Notice>}
      {query.mixStopped && <Notice type="success">Mix stopped.</Notice>}
      {query.mixResumed && <Notice type="success">Mix resumed.</Notice>}
      {query.mixStopError && <Notice type="error">Mix could not be stopped.</Notice>}
      {query.mixResumeError && <Notice type="error">Mix could not be resumed.</Notice>}
      <UrlErrorNotice params={query} viewer={session} />
      {state.doNotContact && <Notice type="info">Do not contact is on.</Notice>}

      <header className="contact-profile-header">
        <div className="contact-detail-header-actions">
          <ContactsBackLink className="contact-inline-action" ariaLabel="Back to contacts"><AppIcon name="chevronLeft" />Contacts</ContactsBackLink>
          <Link href={`/contacts/${contact.id}/edit`} className="contact-inline-action"><AppIcon name="edit" />Edit</Link>
        </div>
        <span className="person-initials profile-avatar" aria-hidden="true">{initials}</span>
        <div className="profile-identity">{heading}
          <div className="contact-identity-chips"><Sheet key={contact.journey?.version ?? 0} trigger={<button type="button" className="contact-stage-chip" aria-label={`Change journey stage: ${contact.journey?.stage.name ?? "No stage"}`}>{contact.journey?.stage.name ?? "No stage"}<AppIcon name="chevronDown" /></button>} title={`Journey stage for ${contact.displayName}`}><ContactJourneyPanel workspaceId={workspace.id} contactId={contact.id} expanded returnToDirectory={embedded} /></Sheet>
          {mixChip}</div>
        </div>
        <nav className="contact-profile-quick-actions" aria-label={`Contact ${contact.displayName}`}>
          {primaryPhone && !state.doNotContact ? <a className="button" href={`sms:${primaryPhone}`}><AppIcon name="message" />Text</a> : <button className="button" disabled title={state.doNotContact ? "Do not contact is on" : "Add a phone number in Details"}><AppIcon name="message" />Text</button>}
          {primaryEmail && !state.doNotContact ? <a className="button" href={`mailto:${primaryEmail}`}><AppIcon name="email" />Email</a> : <button className="button" disabled title={state.doNotContact ? "Do not contact is on" : "Add an email address in Details"}><AppIcon name="email" />Email</button>}
          {primaryPhone && !state.doNotContact ? <a className="button" href={`tel:${primaryPhone}`}><AppIcon name="phone" />Call</a> : <button className="button" disabled title={state.doNotContact ? "Do not contact is on" : "Add a phone number in Details"}><AppIcon name="phone" />Call</button>}
          <a className="button" href="#add-note"><AppIcon name="edit" />Note</a>
        </nav>
        {(state.doNotContact || !primaryPhone || !primaryEmail) && <p className="contact-quick-action-hint">{state.doNotContact ? "Do not contact is on, so Text, Email and Call are off." : !primaryPhone && !primaryEmail ? "Add a phone number or email in Details to reach them." : !primaryPhone ? "Add a phone number in Details to text or call." : "Add an email address in Details to email."}</p>}
      </header>

      <section className="contact-next-line" aria-label="Next follow-up">
        <h2>Next</h2>
        {nextFollowUp ? <><div className="contact-next-description"><strong>{nextFollowUp.reason}</strong><span>Beat {currentBeat} of {sequenceSteps.length}<span className={nextFollowUp.scheduledAt < now ? "overdue-text" : ""}>{contactDueLabel(nextFollowUp.scheduledAt, now, displayPreferences)}</span></span></div><Link className="button primary contact-review-button" href={`/jumps?jump=${encodeURIComponent(nextFollowUp.id)}&range=all`}>Review</Link>
          <ol className="contact-beat-track" aria-label={`Beats in ${nextFollowUp.mix.name}`}>{sequenceSteps.map(step => {
            const beat = sequence.find(item => item.mixStepId === step.id);
            const current = beat?.id === nextFollowUp.id;
            return <li key={step.id} className={current ? "is-current" : beat?.status === "DONE" ? "is-complete" : "is-upcoming"} aria-current={current ? "step" : undefined}>{beat ? <Link href={`/jumps?jump=${encodeURIComponent(beat.id)}&range=all`} aria-label={`${current ? "Current Beat" : beat.status === "DONE" ? "Completed Beat" : beat.status === "SKIPPED" ? "Skipped Beat" : "Upcoming Beat"}, ${formatDate(beat.scheduledAt, displayPreferences)}`}><i aria-hidden="true" /><time dateTime={beat.scheduledAt.toISOString()}>{shortDate(beat.scheduledAt)}</time></Link> : <span><i aria-hidden="true" /><small aria-label="Date unavailable" title="No date available for this Beat">—</small></span>}</li>;
          })}</ol>
        </> : <div className="contact-next-empty"><strong>{preparation.state !== "ready" ? "Awaiting follow-up preparation" : "Nothing scheduled"}</strong>{touchpoint}</div>}
      </section>
      <PreparationNotice key={contact.id} initial={preparation} contactId={contact.id} canRetry={!impersonation} />

      {contact.groupMemberships.length > 0 && <div className="contact-group-strip" aria-label="Tags">{contact.groupMemberships.map(({ group }) => {
        const isActive = activeByGroupId.get(group.id) !== false;
        return <span className={`group-chip ${isActive ? "" : "inactive"}`} key={group.id}><span className="group-dot" style={{ background: group.color ?? "#dfe4ee" }} />{group.name}</span>;
      })}</div>}

      <aside className="contact-profile-details">
        <div className="contact-section-heading"><h2>Details</h2><Link className="contact-details-edit contact-inline-action" href={`/contacts/${contact.id}/edit`}><AppIcon name="edit" />Edit</Link></div>
        <div className="contact-details-rows">
          {contact.company && <div className="contact-detail-row"><AppIcon name="business" /><span>{contact.company}</span><small>company</small></div>}
          {contact.phones.map(item => <div className="contact-detail-row" key={item.id}><AppIcon name="phone" />{state.doNotContact ? <span>{item.phone}</span> : <a href={`tel:${item.phone}`}>{item.phone}</a>}<small>{item.label || "phone"}</small></div>)}
          {contact.emails.map(item => <div className="contact-detail-row" key={item.id}><AppIcon name="email" />{state.doNotContact ? <span>{item.email}</span> : <a href={`mailto:${item.email}`}>{item.email}</a>}<small>{item.label || "email"}</small></div>)}
          {contact.addresses.map(item => <div className="contact-detail-row" key={item.id}><AppIcon name="mapPin" />{addressText(item) ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText(item))}`} target="_blank" rel="noopener noreferrer">{addressText(item)}</a> : <span>Address incomplete</span>}<small>{item.label || "address"}</small></div>)}
          {importantDates.filter(date => /birthday/i.test(date.type)).slice(0, 1).map(date => <div className="contact-detail-row contact-birthday" key={date.id}><AppIcon name="calendar" /><span>{shortDate(date.date)}</span><small>birthday</small></div>)}
        </div>
        <Link className="contact-add-details contact-inline-action" href={`/contacts/${contact.id}/edit`}><AppIcon name="add" />Add company, phone or email</Link>
        <section className="contact-coming-up"><div className="contact-section-heading"><h2>Coming up</h2></div>{upcoming.length ? <ol>{upcoming.map(item => <li key={item.id}><time dateTime={item.date.toISOString()}>{shortDate(item.date)}</time><Link href={item.href}>{item.title}</Link></li>)}</ol> : <p className="contact-empty-copy">Nothing else scheduled.</p>}</section>
      </aside>
      <div className="contact-detail-primary">
        <ContactWorkflowProgress key={contact.id} contactId={contact.id} displayPreferences={displayPreferences} />
        <section className="contact-priority-card">{journeyTrack}</section>
        <section className="contact-timeline-card" id="contact-history"><ContactTimeline key={contact.id} contactId={contact.id} displayPreferences={displayPreferences} /></section>
        <details className="contact-notes-card"><summary>Notes to remember</summary><div><p className="note-copy">{contact.publicNotes || "No notes yet."}</p>{contact.privateNotes && <div className="private-note"><strong>Private</strong><p>{contact.privateNotes}</p></div>}<Link className="contact-inline-action" href={`/contacts/${contact.id}/edit#contact-notes`}>Edit contact notes</Link></div></details>
      </div>
      <details className="card contact-detail-more" id="dates-and-mixes" open={Boolean(query.stateUpdated || query.error)}>
        <summary><span><strong>More</strong><small>Dates, Mixes, and custom fields</small></span><AppIcon name="chevronDown" /></summary>
        <div className="contact-more-sections">
          <section className="contact-mobile-journey">{journeyTrack}</section>
          <section><h2>Preferences</h2><Link className="contact-inline-action" href={`/contacts/${contact.id}/edit`}>Edit contact</Link><ConfirmDialog trigger="Archive contact…" title={`Archive ${contact.displayName}?`} description="Future follow-ups will be removed. Completed history stays available." danger><form action={archiveContactAction}><input type="hidden" name="contactId" value={contact.id} /><button type="submit" className="button danger">Archive contact</button></form></ConfirmDialog><ContactRelationshipStatePanel pendingCount={pendingCount} contactId={contact.id} state={state} />{!state.doNotContact && <ReviewRequestButton contactId={contact.id} />}</section>

          <section>
            <div className="card-header"><div><h2>Dates</h2><p>Moments that can start a follow-up Mix.</p></div></div>
            {contact.jumpDates.length ? <div className="important-date-list">{contact.jumpDates.map((item) => <article className="important-date-row" key={item.id}>
              <div className="important-date-summary"><h3>{item.dateType.name}</h3><div className="jump-meta"><span>{item.dateValue ? formatDate(item.dateValue, displayPreferences) : `${item.month}/${item.day}`}</span><span>{item.recurrence.toLowerCase()}</span>{item.label && <span>{item.label}</span>}</div></div>
              <div className="important-date-actions">
                <Sheet trigger={<button className="button small" type="button">Edit</button>} title={`Edit ${item.dateType.name}`} description={`Update this saved date for ${contact.displayName}.`}>
                  <form action={updateImportantDateAction} className="form-stack"><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="jumpDateId" value={item.id} />{!item.dateValue && <input type="hidden" name="monthDayOnly" value="1" />}<label className="field"><span>Type</span><select name="dateTypeId" defaultValue={item.dateTypeId} required>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>{item.dateValue ? <label className="field"><span>Date</span><input name="dateValue" type="date" defaultValue={formatDateInput(item.dateValue)} required /></label> : <><label className="field"><span>Month</span><select name="month" defaultValue={item.month ?? ""} required><option value="">Choose month</option>{MONTHS.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select></label><label className="field"><span>Day</span><input name="day" type="number" min={1} max={31} defaultValue={item.day ?? ""} inputMode="numeric" required /></label></>}<label className="field"><span>Loop · repeat this date</span><select name="recurrence" defaultValue={item.recurrence}><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label><label className="field"><span>Note</span><input name="label" defaultValue={item.label ?? ""} /></label><button className="button primary" type="submit">Save date</button></form>
                </Sheet>
                <ConfirmDialog trigger={<AppIcon name="trash" />} triggerAriaLabel={`Remove ${item.dateType.name}`} triggerClassName="icon-button compact danger" title={`Remove ${item.dateType.name}?`} description="Future follow-ups tied to this date will be removed." danger><form action={deactivateImportantDateAction}><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="jumpDateId" value={item.id} /><button className="button danger" type="submit">Remove date</button></form></ConfirmDialog>
              </div>
            </article>)}</div> : <p className="muted-copy">No dates saved yet.</p>}
            <form id="add-date" action={createImportantDateAction} className="form-grid contact-add-date"><input type="hidden" name="contactId" value={contact.id} /><label className="field"><span>What date?</span><select name="dateTypeId" required defaultValue={followUpType?.id}>{dateTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label className="field"><span>When?</span><input name="dateValue" type="date" required /></label><label className="field"><span>Loop · repeat this date</span><select name="recurrence"><option value="NONE">Does not repeat</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label><label className="field"><span>Note</span><input name="label" placeholder="Estimate follow-up" /></label><label className="checkbox-card field full"><input type="checkbox" name="autoAssignRecommended" defaultChecked /><span><strong>Start a matching Mix</strong><small>Uses your first active Mix for this kind of date.</small></span></label><button className="button primary" type="submit">Add date</button></form>
          </section>

          <section id="contact-mixes">
            <div className="card-header"><div><h2>Mixes</h2><p>Keep this connection in the mix with a series of thoughtful Beats.</p></div></div>
            {plans.length ? <form action={assignMixToContactAction} className="form-stack"><input type="hidden" name="contactId" value={contact.id} /><label className="field"><span>Choose a Mix</span><select name="mixId">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>{startDateField}<button className="button primary" type="submit" disabled={state.doNotContact}>Add to a Mix</button></form> : <p className="muted-copy">Create a Mix first.</p>}
            {contact.mixAssignments.length > 0 && <div className="assigned-mix-list">{contact.mixAssignments.map((assignment) => {
              const stop = stopByMixId.get(assignment.mix.id);
              return <div className="assigned-mix-row" key={assignment.id}><div><Link href={`/mixes/${assignment.mix.id}/edit`}>{assignment.mix.name}</Link>{stop && <small className="stopped-mix-label">{stop.reason === PLAN_LIMIT_STOP ? "Not started: plan limit" : "Stopped"}</small>}</div><div className="assigned-mix-actions">{stop ? <form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small primary" type="submit">Resume</button></form> : <ConfirmDialog trigger="Stop…" triggerAriaLabel={`Stop the ${assignment.mix.name} Mix`} title={`Stop ${assignment.mix.name}?`} description="Future follow-ups from this Mix will be removed."><form action={stopMixForContactAction}><input type="hidden" name="mixId" value={assignment.mix.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small danger" type="submit">Stop Mix</button></form></ConfirmDialog>}<ConfirmDialog trigger="Remove…" triggerAriaLabel={`Remove the ${assignment.mix.name} Mix`} title={`Remove ${assignment.mix.name}?`} description="Completed history stays available." danger><form action={removeMixAssignmentAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="contactId" value={contact.id} /><button className="button small danger" type="submit">Remove</button></form></ConfirmDialog></div></div>;
            })}</div>}
            {additionalStoppedPlans.length > 0 && <div className="stopped-mix-section"><h3>Other stopped Mixes</h3>{additionalStoppedPlans.map((plan) => <div className="assigned-mix-row" key={plan.id}><span>{plan.name}</span><form action={resumeMixForContactAction}><input type="hidden" name="mixId" value={plan.id} /><input type="hidden" name="contactId" value={contact.id} /><input type="hidden" name="returnTo" value={`/contacts/${contact.id}`} /><button className="button small" type="submit">Resume</button></form></div>)}</div>}
          </section>

          {contact.customFieldValues.length > 0 && <section><div className="card-header"><div><h2>Custom fields</h2></div><Link className="button small" href="/contacts/custom-fields">Manage</Link></div><div className="contact-method-sections">{contact.customFieldValues.map((item) => <div className="contact-method-row" key={item.id}><span>{item.value}</span><small>{item.definition.name} · {customFieldPlaceholder(item.definition.key)}</small></div>)}</div></section>}
          {mergeHistory.length > 0 && <small className="muted-copy">{mergeHistory.length} duplicate merge{mergeHistory.length === 1 ? "" : "s"} recorded.</small>}
        </div>
      </details>
    </div>
  );
}
