import Link from "next/link";
import type { JourneyDueFilter } from "@/lib/journey-view";

const columns: { key: JourneyDueFilter; label: string }[] = [
  { key: "late", label: "Late" }, { key: "today", label: "Today" },
  { key: "week", label: "Next six days" }, { key: "later", label: "Later" },
  { key: "quiet", label: "Nothing scheduled" }
];
export function JourneyStageView({ name, total, people, counts, href }: {
  name: string; total: number;
  people: { id: string; name: string; bucket: JourneyDueFilter }[];
  counts: Record<JourneyDueFilter, number>;
  href: (due: JourneyDueFilter) => string;
}) {
  return <section className="journey-stage-detail" aria-label={`${name} follow-up map`}>
    <h2>{name}</h2><p>{total} people, lined up by the next follow-up.</p>
    <div className="journey-person-columns">{columns.map(column => <div key={column.key} className={`journey-person-column ${column.key}`}>
      <Link className="journey-column-label" href={href(column.key)}>{column.label}<strong>{counts[column.key]}</strong></Link>
      <div className="journey-person-dots" role="group" aria-label={`${column.label} people on this page`}>{people.filter(person => person.bucket === column.key).map(person => <a href={`#journey-person-${person.id}`} className="journey-person-dot" key={person.id} aria-label={`Find ${person.name} in the list`} title={person.name}><span /></a>)}</div>
    </div>)}</div>
    <p className="journey-map-caption">Each dot is one of the {people.length} people on this page. Select a dot to find them in the list. Counts include everyone matching your search.</p>
  </section>;
}
