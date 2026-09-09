import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Sheet } from "@/components/Sheet";
import {
  createCustomDateTypeAction,
  deleteCustomDateTypeAction,
  renameCustomDateTypeAction,
  saveActiveDateTypesAction
} from "@/lib/date-type-actions";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Saved date types" };

type SearchParams = {
  q?: string;
  created?: string;
  inactive?: string;
  updated?: string;
  activationSaved?: string;
  deleted?: string;
  error?: string;
};

export default async function JumpDateTypesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const q = params.q?.trim() ?? "";
  const [allCustomTypes, systemTypes] = await Promise.all([
    prisma.dateType.findMany({
      where: { workspaceId: workspace.id, isSystem: false },
      include: { _count: { select: { jumpDates: true, mixes: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    }),
    prisma.dateType.findMany({ where: { workspaceId: null, isSystem: true, isActive: true }, orderBy: { name: "asc" } })
  ]);
  const normalizedQuery = q.toLowerCase();
  const customTypes = normalizedQuery ? allCustomTypes.filter((item) => item.name.toLowerCase().includes(normalizedQuery)) : allCustomTypes;
  const hiddenActiveTypes = normalizedQuery ? allCustomTypes.filter((item) => item.isActive && !item.name.toLowerCase().includes(normalizedQuery)) : [];

  return (
    <div className="page">
      {params.created && <Notice type="success">Date type created.</Notice>}
      {params.updated && <Notice type="success">Date type renamed.</Notice>}
      {params.activationSaved && <Notice type="success">Date types saved.</Notice>}
      {params.deleted && <Notice type="success">Date type deleted.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Saved date types</h1><p>Name the moments that can start a follow-up mix.</p></div>
        <div className="page-actions"><Link className="button" href="/mixes">Mixes</Link><Link className="button" href="/settings">Settings</Link></div>
      </header>

      <section className="card">
        <div className="card-header"><div><h2>+ New custom type</h2><p>Examples: Policy Renewal, Closing Anniversary, Program Start, or Warranty Expiration.</p></div></div>
        <form action={createCustomDateTypeAction} className="inline-create-form"><input name="name" placeholder="Date type, such as Warranty expires" required /><button className="button primary" type="submit">Create type</button></form>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>Manage custom types</h2><p>Choose which types appear in everyday workflows. Inactive types and their data are preserved.</p></div></div>
        <form className="filter-bar" action="/settings/jump-date-types" method="get"><input name="q" defaultValue={q} placeholder="Search custom types" aria-label="Search saved date types" /><button className="button" type="submit">Search</button>{q && <Link className="button" href="/settings/jump-date-types">Clear</Link>}</form>
        <form id="date-type-activation-form" action={saveActiveDateTypesAction}>{hiddenActiveTypes.map((item) => <input type="hidden" name="activeDateTypeIds" value={item.id} key={item.id} />)}</form>
        {customTypes.length ? <div className="date-type-list">{customTypes.map((dateType) => (
          <article className={dateType.isActive ? "date-type-row" : "date-type-row inactive"} key={dateType.id}>
            <label className="date-type-active-choice"><input form="date-type-activation-form" type="checkbox" name="activeDateTypeIds" value={dateType.id} defaultChecked={dateType.isActive} /><span>{dateType.isActive ? "Active" : "Inactive"}</span></label>
            <div><strong>{dateType.name}</strong><div className="jump-meta"><span>{dateType._count.jumpDates} saved date{dateType._count.jumpDates === 1 ? "" : "s"}</span><span>{dateType._count.mixes} mix{dateType._count.mixes === 1 ? "" : "s"}</span></div></div>
            <Sheet trigger={<button className="button small" type="button">Edit</button>} title={`Rename ${dateType.name}`} description="The saved dates and mixes using this type stay connected."><form action={renameCustomDateTypeAction} className="form-stack"><input type="hidden" name="dateTypeId" value={dateType.id} /><label className="field"><span>Name</span><input name="name" defaultValue={dateType.name} required /></label><button className="button primary" type="submit">Save name</button></form></Sheet>
            <ConfirmDialog trigger="Delete…" title={`Delete ${dateType.name}?`} description="You can delete it only when no saved dates or active mixes use it. Otherwise, turn it off." danger><form action={deleteCustomDateTypeAction}><input type="hidden" name="dateTypeId" value={dateType.id} /><button className="button small danger" type="submit">Confirm delete</button></form></ConfirmDialog>
          </article>
        ))}</div> : <p className="muted-copy">No custom date types match this view.</p>}
        <div className="form-actions"><button className="button primary" form="date-type-activation-form" type="submit">Save active selection</button></div>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>Built-in types</h2><p>These common saved dates are always available.</p></div></div>
        <div className="system-type-list">{systemTypes.map((dateType) => <span className="group-chip" key={dateType.id}>{dateType.name}</span>)}</div>
      </section>
    </div>
  );
}
