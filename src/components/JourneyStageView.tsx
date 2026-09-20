import Link from "next/link";
import { JourneyPersonDot, SelectQuietPeople } from "@/components/JourneyPersonDot";
import type { JourneyDueFilter } from "@/lib/journey-view";

const columns: { key: JourneyDueFilter; label: string }[] = [
  { key: "late", label: "Late" }, { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" }, { key: "week", label: "This week" }, { key: "next-week", label: "Next week" }, { key: "later", label: "Later" },
  { key: "quiet", label: "Nothing scheduled" }
];
export function JourneyStageView({ name, total, people, counts, href, canMove = true }: {
  name: string; total: number;
  people: { id: string; name: string; bucket: JourneyDueFilter; stage: string; next: { id: string; label: string; reason: string } | null }[];
  counts: Record<JourneyDueFilter, number>;
  href: (due: JourneyDueFilter) => string;
  canMove?: boolean;
}) {
  return <section className="journey-stage-detail" aria-label={`${name} follow-up map`}>
    <h2>{name}</h2><p>{total} people, lined up by the next follow-up.</p>
    {people.some(person => person.bucket === "quiet") && <SelectQuietPeople count={people.filter(person => person.bucket === "quiet").length} />}
    <div className="journey-person-columns">{columns.map(column => <div key={column.key} className={`journey-person-column ${column.key}`}>
      <Link className="journey-column-label" href={href(column.key)}>{column.label}<strong>{counts[column.key]}</strong></Link>
      <div className="journey-person-dots" role="group" aria-label={`${column.label} people on this page`}>{people.filter(person => person.bucket === column.key).map(person => <JourneyPersonDot key={person.id} person={person} canMove={canMove} />)}</div>
    </div>)}</div>
    <p className="journey-map-caption">Each dot is one of the {people.length} people on this page. Select a dot for their next follow-up and actions. Counts include everyone matching your search.</p>
  </section>;
}
