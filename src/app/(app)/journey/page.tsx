import Link from "next/link";
import { JourneySelection } from "@/components/JourneySelection";
import { randomUUID } from "node:crypto";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import { Prisma } from "@/generated/prisma/client";
import { EmptyState } from "@/components/EmptyState";
import { JourneyMap } from "@/components/JourneyMap";
import { JourneyStageView } from "@/components/JourneyStageView";
import { Sheet } from "@/components/Sheet";
import { AppIcon } from "@/components/AppIcon";
import { requireWorkspace } from "@/lib/auth";
import { changeContactJourneyAction } from "@/lib/journey-actions";
import { journeyDates, journeyDueFilter, journeyDueWhere, journeyDueBucket, journeyMixMembers, JOURNEY_DUE_FILTERS } from "@/lib/journey-view";
import { journeyRosterIds } from "@/lib/journey-roster";
import { prisma } from "@/lib/prisma";
export const metadata = { title: "Customer journey" };

export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ stage?: string; mix?: string; due?: string; q?: string; page?: string }> }) {
  const [{ workspace, user, impersonation }, query] = await Promise.all([requireWorkspace(), searchParams]);
  const display = await displayPreferencesForUser(user.id);
  const dates = journeyDates(new Date(), display.timeZone);
  const activeContact: Prisma.ContactWhereInput = { workspaceId: workspace.id, archivedAt: null };
  const [stages, preference, touchpoints, recordedMoves] = await Promise.all([
    prisma.journeyStage.findMany({ where: { workspaceId: workspace.id, isActive: true }, include: { plan: { select: { name: true } }, _count: { select: { contacts: { where: { contact: activeContact } } } } }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
    prisma.journeyPreference.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE", source: { notIn: ["ONE_TIME", "SYSTEM"] }, journeyStages: { none: { isActive: true } } }, select: { id: true, name: true, triggerMode: true, dateType: { select: { name: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    prisma.$queryRaw<{ from: string; to: string; count: number }[]>(Prisma.sql`SELECT metadata->>'previousStageId' AS "from", metadata->>'stageId' AS "to", COUNT(*)::int AS count FROM "ContactActivity" WHERE "workspaceId" = ${workspace.id} AND kind = 'SYSTEM' AND "occurredAt" >= ${new Date(Date.now()-30*86400000)} AND metadata->>'previousStageId' IS NOT NULL AND metadata->>'previousStageId' <> metadata->>'stageId' GROUP BY 1,2`)
  ]);
  const selected = stages.find(stage => stage.id === query.stage) ?? (!query.mix && query.stage !== "all" ? stages[0] : undefined);
  const stageDetail = Boolean(query.stage && selected);
  const mix = !selected ? touchpoints.find(item => item.id === query.mix) : undefined;
  const q = query.q?.trim().slice(0, 160) ?? "";
  const due = journeyDueFilter(query.due);
  const members = (mixId: string) => journeyMixMembers(workspace.id, mixId);
  const scope: Prisma.ContactWhereInput = { ...activeContact, ...(selected ? { journey: { stageId: selected.id } } : mix ? members(mix.id) : { journey: { stage: { isActive: true } } }), ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}) };
  const where: Prisma.ContactWhereInput = { AND: [scope, journeyDueWhere(due, dates, mix?.id)] };
  const [total, counts, stageStats, touchStats] = await Promise.all([
    prisma.contact.count({ where }),
    Promise.all(JOURNEY_DUE_FILTERS.map(filter => prisma.contact.count({ where: { AND: [scope, journeyDueWhere(filter, dates, mix?.id)] } }))),
    Promise.all(stages.map(async stage => ({ id: stage.id, name: stage.name, count: stage._count.contacts, late: await prisma.contact.count({ where: { ...activeContact, journey: { stageId: stage.id }, ...journeyDueWhere("late", dates) } }), soon: await prisma.contact.count({ where: { AND: [activeContact, { journey: { stageId: stage.id } }, { jumps: { some: { status: "PENDING", scheduledAt: { gte: dates.start, lt: dates.week } }, none: { status: "PENDING", scheduledAt: { lt: dates.start } } } }] } }) }))),
    Promise.all(touchpoints.map(async item => ({ ...item, count: await prisma.contact.count({ where: { AND: [activeContact, members(item.id)] } }), stages: (await prisma.contactJourney.groupBy({ by: ["stageId"], where: { workspaceId: workspace.id, contact: { AND: [activeContact, members(item.id)] } } })).map(row => row.stageId), timing: item.dateType ? `On ${item.dateType.name}` : item.triggerMode === "MANUAL_START" ? "When you start it" : "On its scheduled date" })))
  ]);
  const pages = Math.max(1, Math.ceil(total/50));
  const page = Math.max(1, Math.min(pages, Number.parseInt(query.page ?? "1", 10) || 1));
  const ids = await journeyRosterIds({ workspaceId: workspace.id, stageId: selected?.id, mixId: mix?.id, query: q, due, dates, page });
  const contacts = await prisma.contact.findMany({ where: { AND: [where, { id: { in: ids.map(row => row.id) } }] }, select: { id: true, displayName: true, journey: { include: { stage: true } }, jumps: { where: { status: "PENDING", ...(mix ? { mixId: mix.id } : {}) }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 1, select: { id: true, scheduledAt: true, reason: true } } } });
  const order = new Map(ids.map((row, index) => [row.id, index]));
  contacts.sort((a,b) => order.get(a.id)! - order.get(b.id)!);
  const href = (stage?: string, mixId?: string, filter = "all", number = 1) => `/journey?${new URLSearchParams({ ...(stage ? { stage } : {}), ...(mixId ? { mix: mixId } : {}), ...(q ? { q } : {}), ...(filter !== "all" ? { due: filter } : {}), ...(number > 1 ? { page: String(number) } : {}) })}`;
  const labels = { all: "All", late: "Late", today: "Today", tomorrow: "Tomorrow", week: "This week", "next-week": "Next week", later: "Later", quiet: "Nothing scheduled" };
  const totalInJourney = stages.reduce((sum, stage) => sum + stage._count.contacts, 0);
  const searchForm = <form className="journey-search" action="/journey" method="get">{selected && <input type="hidden" name="stage" value={selected.id} />}{mix && <input type="hidden" name="mix" value={mix.id} />}<input type="hidden" name="due" value={due} /><input type="search" name="q" defaultValue={q} aria-label="Search this journey" placeholder="Find someone" /><button className="button" type="submit">Search</button></form>;
  return <div className="page journey-page"><header className="page-header"><div><h1>Journey</h1><p>{totalInJourney.toLocaleString()} people in your journey</p></div><div className="page-actions journey-header-actions"><Link className="button" href="/settings/journey">Automatic transitions: {preference?.enabled ? "on" : "paused"}</Link><Link className="button" href="/settings/journey">Edit stages</Link></div><div className="journey-mobile-options"><Sheet trigger={<button className="button" type="button" aria-label="Find someone in the journey"><AppIcon name="search" /></button>} title="Find someone">{searchForm}</Sheet><Sheet trigger={<button className="button" type="button" aria-label="Journey options"><AppIcon name="filter" /></button>} title="Journey options"><p>Automatic transitions are {preference?.enabled ? "on" : "paused"}.</p><nav className="sheet-link-list" aria-label="Journey options"><Link className="button" href="/settings/journey">Edit stages and transitions</Link><Link className="button" href="/journey?stage=all">The whole journey</Link><Link className="button" href="/contacts">All contacts</Link></nav></Sheet></div></header>
    {stages.length ? <div className="journey-workspace"><section className="journey-canvas" aria-label="Your relationship journey">
      <nav className="journey-view-links" aria-label="Journey view"><Link href="/journey?stage=all" aria-current={!selected && !mix ? "page" : undefined}>The whole journey</Link><Link href="/contacts">All contacts</Link></nav>
      <div className={stageDetail ? "journey-map-overview has-stage-selection" : "journey-map-overview"}><JourneyMap stages={stageStats} touchpoints={touchStats} moves={recordedMoves} selectedStage={selected?.id} selectedMix={mix?.id} href={href} /></div>
      {stageDetail && selected && <JourneyStageView canMove={!impersonation} name={selected.name} total={counts[0]} counts={Object.fromEntries(JOURNEY_DUE_FILTERS.map((key, index) => [key, counts[index]])) as Record<typeof due, number>} people={contacts.map(person => ({ id: person.id, name: person.displayName, bucket: journeyDueBucket(person.jumps[0]?.scheduledAt ?? null, dates), next: person.jumps[0] ? { id: person.jumps[0].id, label: formatDateTime(person.jumps[0].scheduledAt, display), reason: person.jumps[0].reason } : null, stage: person.journey?.stage.name ?? "No stage" }))} href={filter => href(selected.id, undefined, filter)} />}
      <section className="journey-touchpoints"><div className="section-label"><h2>Touchpoints, at any time</h2><Link className="button small" href="/mixes/new"><AppIcon name="plus" /><span>Add a touchpoint</span></Link></div><p className="muted-copy journey-touchpoints-description">Mixes that run alongside your stages. Starting one keeps a person in their current stage.</p>{touchStats.length ? touchStats.map(item => <Link key={item.id} className={`touchpoint-row${mix?.id === item.id ? " active" : ""}`} href={href(undefined, item.id)} aria-current={mix?.id === item.id ? "page" : undefined}><AppIcon name="message" /><span><strong>{item.name}</strong><small>{item.timing}</small></span><span>{item.count}</span><span className="touchpoint-stage-dots" aria-label={`${item.stages.length} stages represented`}>{stages.map(stage => <i className={item.stages.includes(stage.id) ? "active" : ""} key={stage.id} />)}</span></Link>) : <p className="muted-copy">Create a Mix for a check-in, thank-you, or another reason to stay in touch.</p>}</section>
    </section><section className="journey-roster" aria-labelledby="journey-roster-title"><h2 id="journey-roster-title">{selected?.name ?? mix?.name ?? "Everyone in the journey"}</h2><p>{counts[0]} {counts[0] === 1 ? "person" : "people"}{selected?.plan ? ` · ${selected.plan.name} on entry` : ""}</p>
      {mix && <Link className="inline-action" href={`/mixes/${mix.id}/edit`}>Edit this Mix or choose people →</Link>}
      <div className="journey-search-desktop">{searchForm}</div>
      <nav className="journey-due-filters" aria-label="Follow-up timing">{JOURNEY_DUE_FILTERS.map((filter,i) => <Link key={filter} href={href(selected?.id, mix?.id, filter)} aria-current={due === filter ? "page" : undefined}>{labels[filter]} <span>{counts[i]}</span></Link>)}</nav>
      {q && <p role="status">Searching “{q}”. <Link href={href(selected?.id,mix?.id,due).replace(/([?&])q=[^&]*&?/,"$1")}>Clear search</Link></p>}
      <JourneySelection people={contacts.map(person => ({ id: person.id, quiet: !person.jumps.length }))}>
      {contacts.length ? <div className="journey-people">{contacts.map(person => { const next = person.jumps[0]; const bucket = journeyDueBucket(next?.scheduledAt ?? null, dates); return <article className="journey-person" id={`journey-person-${person.id}`} key={person.id}><input className="journey-select-person" type="checkbox" value={person.id} aria-label={`Select ${person.displayName}`} /><span className="person-initials" aria-hidden="true">{person.displayName.split(/\s+/).slice(0,2).map(part=>part[0]).join("")}</span><Link className="journey-person-name" href={`/contacts/${person.id}`}><strong>{person.displayName}</strong><small className={bucket === "late" ? "late" : ""}>{next ? `${bucket === "late" ? "Late · " : ""}${formatDateTime(next.scheduledAt, display)}` : "Nothing scheduled"}</small>{!selected && <small>{person.journey?.stage.name ?? "No stage assigned"}</small>}</Link><div className="journey-person-actions">{next && <Link className="button small soft" href={`/jumps?jump=${next.id}&range=all&status=pending`}>Review</Link>}{!impersonation && <Sheet trigger={<button id={`journey-move-${person.id}`} className="button small" aria-label={`Move ${person.displayName}`} type="button">Move</button>} title={`Move ${person.displayName}`} description="A move can stop the previous stage’s Mix and start the new stage’s Mix."><form action={changeContactJourneyAction} className="form-stack"><input type="hidden" name="contactId" value={person.id}/><input type="hidden" name="version" value={person.journey?.version ?? 0}/><input type="hidden" name="requestId" value={randomUUID()}/><label className="field"><span>Move to stage</span><select name="stageId" defaultValue={person.journey?.stageId ?? ""} required><option value="">Choose a stage</option>{stages.map(stage=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label><button className="button primary" type="submit">Move stage</button></form></Sheet>}</div></article>; })}</div> : <EmptyState title="No people in this view yet" description="Try another timing filter, or choose a stage from a contact’s page." actionHref="/contacts" actionLabel="Open contacts" />}
      </JourneySelection>
      <p className="journey-roster-caption">Ordered by next follow-up. People without one come last.</p>
      {pages > 1 && <nav className="calendar-week-nav" aria-label="Journey pages">{page > 1 && <Link className="button" href={href(selected?.id,mix?.id,due,page-1)}>Previous people</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="button" href={href(selected?.id,mix?.id,due,page+1)}>Next people</Link>}</nav>}
    </section></div> : <EmptyState title="A clear next step for every relationship" description="Start with Lead, Prospect, Client, and Retention, then adapt the stages and rules to your business." actionHref="/settings/journey" actionLabel="Set up your journey" />}
  </div>;
}
