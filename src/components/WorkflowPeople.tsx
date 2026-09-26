"use client";

import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { useRef } from "react";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import { workflowStatuses, workflowStatusLabels, type WorkflowAnalytics, type WorkflowCounts } from "@/lib/workflow-analytics";
import type { WorkflowGraphMix } from "@/lib/mix-workflow-view";
import styles from "@/components/WorkflowJourney.module.css";

export function WorkflowCountStrip({ counts, value, onSelect, disabled = false }: { disabled?: boolean; counts: WorkflowCounts; value: string; onSelect: (status: string) => void }) {
  return <div className={styles.countStrip} aria-label="People by workflow status">
    <button type="button" disabled={disabled} aria-pressed={value === "all"} onClick={() => onSelect("all")}><strong>{counts.total}</strong><span>People</span></button>
    {workflowStatuses.filter(status => ["active", "waiting", "attention", "completed"].includes(status) || counts[status] > 0).map(status => <button type="button" disabled={disabled} key={status} data-status={status} aria-pressed={value === status} onClick={() => onSelect(status)}><strong>{counts[status]}</strong><span>{workflowStatusLabels[status]}</span></button>)}
  </div>;
}
export function WorkflowPeople({ selectedContactId = "", data, mixes, node, status, stage, query, pending, onFilter, onPerson, displayPreferences }: { selectedContactId?: string; pending: boolean; data: WorkflowAnalytics; mixes: WorkflowGraphMix[]; node: string; status: string; stage: string; query: string; onFilter: (patch: { status?: string; stage?: string; query?: string; offset?: number; node?: string }) => void; onPerson: (id: string, instanceId?: string) => void; displayPreferences: DisplayFormatPreferences }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const nodeName = node.startsWith("beat:") ? mixes.flatMap(mix => mix.steps).find(step => `beat:${step.id}` === node)?.name : mixes.find(mix => `mix:${mix.id}` === node)?.name;
  return <section className={styles.people} aria-label="Journey people">
    <div className={styles.instanceHeading}><h2 ref={heading} tabIndex={-1}>{nodeName ?? "People"} <span className={styles.countBadge}>{data.total}</span></h2>{node && <button type="button" className="text-button" onClick={() => onFilter({ node: "", offset: 0 })}>All Mixes</button>}</div>
    <form className={styles.peopleSearch} onSubmit={event => { event.preventDefault(); onFilter({ query: String(new FormData(event.currentTarget).get("query") ?? ""), offset: 0 }); }}><label className="sr-only" htmlFor="workflow-person-search">Find a person</label><input key={query} id="workflow-person-search" name="query" type="search" placeholder="Find a person" defaultValue={query} /><button className="button small">Search</button></form>
    <div className={styles.rosterFilters}><label><span className="sr-only">Workflow status</span><select aria-label="Workflow status" value={status} onChange={event => onFilter({ status: event.target.value, offset: 0 })}><option value="all">All statuses</option>{workflowStatuses.map(value => <option key={value} value={value}>{workflowStatusLabels[value]}</option>)}</select></label><label><span className="sr-only">Contact stage</span><select aria-label="Contact stage" value={stage} onChange={event => onFilter({ stage: event.target.value, offset: 0 })}><option value="">All contact stages</option>{data.stages.map(item => <option key={item.id} value={item.id}>{item.name} · {item.count}</option>)}</select></label></div>
    {(status !== "all" || stage || query) && <button type="button" className="text-button" onClick={() => onFilter({ status: "all", stage: "", query: "", offset: 0 })}>Clear filters</button>}
    {pending && <p className={styles.rosterLoading} role="status">Updating people…</p>}
    <div className={styles.peopleRows} inert={pending} aria-busy={pending}>{data.roster.map(person => {
      const position = person.positions[0], mix = mixes.find(item => item.id === position?.mixId), beat = mix?.steps.find(item => item.id === position?.stepId);
      const initials = person.displayName.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("");
      return <article key={person.id} className={styles.personRow} data-selected={selectedContactId === person.id}>
        <button className={styles.personSelect} type="button" aria-label={`View ${person.displayName}'s journey`} aria-pressed={selectedContactId === person.id} onClick={() => onPerson(person.id, person.positions.find(item => item.instanceId)?.instanceId ?? undefined)}>
          <span className={styles.personAvatar} aria-hidden="true">{initials}</span>
          <span className={styles.personCopy}><strong>{person.displayName}</strong><span className={styles.stageBadge}>{person.stageName}</span><span className={styles.statuses}>{person.statuses.map(value => <span data-status={value} key={value}>{workflowStatusLabels[value]}</span>)}</span>
            {position && <span className={styles.personPreview}>{beat?.name ?? mix?.name ?? "Previous Mix"}<small>{position.reason}{position.dueAt ? ` · ${formatDateTime(position.dueAt, displayPreferences)}` : ""}{person.positions.length > 1 ? ` · +${person.positions.length - 1} other positions` : ""}</small></span>}
          </span>
        </button>
        <Link className={styles.personContact} href={`/contacts/${person.id}`} aria-label={`Open ${person.displayName}'s contact`} title="Open contact"><AppIcon name="external" /></Link>
      </article>;
    })}</div>
    {!data.total && <p className={styles.emptyPeople}>No people match this view.</p>}
    {data.total > data.pageSize && <div className={styles.actions}><button className="button small" disabled={!data.offset} onClick={() => onFilter({ offset: data.offset - data.pageSize })}>Previous people</button><span>{data.offset + 1}–{Math.min(data.offset + data.pageSize, data.total)} of {data.total}</span><button className="button small" disabled={data.offset + data.pageSize >= data.total} onClick={() => onFilter({ offset: data.offset + data.pageSize })}>Next people</button></div>}
    <details className={styles.countHelp}><summary>About these counts</summary><p>People are counted once per status in each view. Parallel work can put someone in several statuses. Completed means no unfinished work in that view. Scheduled Beats and pending outcomes count as waiting.</p><p>Map totals cover nonarchived contacts in the account. Filters narrow this list. Contact stages use your saved labels. Connection results use their selected period.</p></details>
  </section>;
}
