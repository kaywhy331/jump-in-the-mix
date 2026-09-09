import { randomUUID } from "node:crypto";
import Link from "next/link";
import { changeContactJourneyAction, toggleContactJourneyAction } from "@/lib/journey-actions";
import { journeyRuleWhen } from "@/lib/journey-types";
import { prisma } from "@/lib/prisma";
export async function ContactJourneyPanel({ workspaceId, contactId }: { workspaceId: string; contactId: string }) {
  const [preference, person, stages] = await Promise.all([
    prisma.journeyPreference.findUnique({ where: { workspaceId } }),
    prisma.contactJourney.findFirst({ where: { workspaceId, contactId }, include: { stage: { include: { outgoingRules: { where: { enabled: true }, include: { toStage: true } } } } } }),
    prisma.journeyStage.findMany({ where: { workspaceId, isActive: true }, select: { id: true, name: true }, orderBy: [{ position: "asc" }, { id: "asc" }] })
  ]);
  if (!stages.length) return <p className="muted-copy"><Link className="inline-action" href="/settings/journey">Set up your customer journey</Link> to track stages and automate the next steps.</p>;
  const milestones = preference?.enabled && person?.automatic ? person.stage.outgoingRules.filter(rule => !["TIME_IN_STAGE", "PLAN_COMPLETED", "CONTACT_RECEIVED"].includes(rule.eventType)) : [];
  return <div className="contact-journey-panel"><div className="journey-current"><span className="status-pill">{person?.stage.name ?? "Not assigned yet"}</span><Link href="/journey" className="inline-action">View journey</Link></div>
    {person && <p className="muted-copy">{!preference?.enabled ? <>Automatic transitions are paused for your business. <Link className="inline-action" href="/settings/journey">Review journey settings</Link></> : !person.automatic ? "Automatic transitions are paused for this person. Resume them under Stage and automation." : person.stage.outgoingRules.length ? "The rules below explain the next automatic moves." : "No automatic moves are set for this stage. You can move this person when they are ready."}</p>}
    {!!person?.stage.outgoingRules.length && <ul className="journey-next-moves" aria-label="Automatic transition rules">{person.stage.outgoingRules.map(rule => <li key={rule.id}>{journeyRuleWhen(rule.eventType, rule.afterDays)} → <strong>{rule.toStage.name}</strong></li>)}</ul>}
    {!!milestones.length && <div className="journey-milestones">{milestones.map(rule => <form action={changeContactJourneyAction} key={rule.id}><input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="version" value={person?.version ?? 0} /><input type="hidden" name="requestId" value={randomUUID()} /><input type="hidden" name="eventType" value={rule.eventType} /><button className="button small" type="submit" aria-describedby={`milestone-${rule.id}`}>{rule.eventType === "SALE_CONFIRMED" ? "Record a sale" : rule.eventType === "WORK_COMPLETED" ? "Work completed" : rule.eventType === "MEETING_SCHEDULED" ? "Record a booked meeting" : "Conversation started"}</button><small id={`milestone-${rule.id}`}>Moves to {rule.toStage.name}</small></form>)}</div>}
    <details><summary>Stage and automation</summary><form action={changeContactJourneyAction} className="form-stack"><input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="version" value={person?.version ?? 0} /><input type="hidden" name="requestId" value={randomUUID()} /><label className="field"><span>Move to stage</span><select name="stageId" defaultValue={person?.stageId ?? ""} required><option value="">Choose a stage</option>{stages.map(stage => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label><button className="button" type="submit">Move stage</button></form>
      {person && <form action={toggleContactJourneyAction}><input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="version" value={person.version} /><input type="hidden" name="automatic" value={String(!person.automatic)} /><button className="button small" type="submit">{person.automatic ? "Pause transitions for this person" : "Resume transitions for this person"}</button></form>}
      <p className="muted-copy">Pausing transitions keeps this person’s current mixes running. A manual move can stop the previous stage’s mix and start the next stage’s mix.</p>
    </details>
    <Link className="button" href={`/calendar?contact=${contactId}`}>Schedule a meeting</Link>
  </div>;
}
