import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { EmptyState } from "@/components/EmptyState";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const metadata = { title: "Customer journey" };
export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string; page?: string }> }) {
  const [{ workspace }, query] = await Promise.all([requireWorkspace(), searchParams]);
  const stages = await prisma.journeyStage.findMany({ where: { workspaceId: workspace.id, isActive: true }, include: { _count: { select: { contacts: { where: { contact: { archivedAt: null } } } } } }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  const selected = stages.find(stage => stage.id === query.stage);
  const q = query.q?.trim().slice(0, 160) ?? "";
  const where: Prisma.ContactJourneyWhereInput = { workspaceId: workspace.id, ...(selected ? { stageId: selected.id } : {}), contact: { archivedAt: null, ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}) } };
  const [total, preference] = await Promise.all([prisma.contactJourney.count({ where }), prisma.journeyPreference.findUnique({ where: { workspaceId: workspace.id } })]);
  const pages = Math.max(1, Math.ceil(total/50)); const page = Math.max(1, Math.min(pages, Number.parseInt(query.page ?? "1",10) || 1));
  const contacts = await prisma.contactJourney.findMany({ where, include: { contact: { select: { displayName: true } }, stage: true }, orderBy: [{ stageSince: "desc" }, { contactId: "asc" }], take: 50, skip: (page-1)*50 });
  const pageHref = (number: number) => `/journey?${new URLSearchParams({ ...(selected ? { stage: selected.id } : {}), ...(q ? { q } : {}), page: String(number) })}`;
  return <div className="page journey-page"><header className="page-header"><div><h1>Customer journey</h1><p>See where each relationship stands and what happens next.</p></div><div className="page-actions"><Link className="button" href="/contacts">All contacts</Link><Link className="button" href="/settings/journey">Set up stages</Link></div></header>
    {stages.length ? <><nav className="journey-stage-grid" aria-label="Customer stages"><Link className={!selected ? "journey-stage active" : "journey-stage"} href="/journey" aria-current={!selected ? "page" : undefined}><strong>{stages.reduce((sum, stage) => sum + stage._count.contacts, 0)}</strong><span>Everyone in the journey</span></Link>{stages.map(stage => <Link className={selected?.id === stage.id ? "journey-stage active" : "journey-stage"} aria-current={selected?.id === stage.id ? "page" : undefined} href={`/journey?stage=${stage.id}`} key={stage.id}><strong>{stage._count.contacts}</strong><span>{stage.name}</span></Link>)}</nav>
      <form className="filter-bar" action="/journey" method="get">{selected && <input type="hidden" name="stage" value={selected.id} />}<input type="search" name="q" defaultValue={q} aria-label="Search this journey" placeholder="Find a person" /><button className="button">Search</button></form>
      {contacts.length ? <div className="journey-people">{contacts.map(person => <Link className="journey-person card" href={`/contacts/${person.contactId}`} key={person.contactId}><div><strong>{person.contact.displayName}</strong><small>{person.stage.name} · {Math.max(0, Math.floor((Date.now() - person.stageSince.getTime()) / 86_400_000))} days in this stage</small></div><span className="status-pill">{preference?.enabled && person.automatic ? "Automatic" : "Paused"}</span></Link>)}</div> : <EmptyState title="No people in this view yet" description="Choose a stage from a contact’s page, or let new leads enter automatically." actionHref="/contacts" actionLabel="Open contacts" />}
      {pages > 1 && <nav className="calendar-week-nav" aria-label="Journey pages">{page > 1 && <Link className="button" href={pageHref(page-1)}>Previous people</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="button" href={pageHref(page+1)}>Next people</Link>}</nav>}
    </> : <EmptyState title="A clear next step for every relationship" description="Start with Lead, Prospect, Client, and Retention, then adapt the stages and rules to your business." actionHref="/settings/journey" actionLabel="Set up your journey" />}
  </div>;
}
