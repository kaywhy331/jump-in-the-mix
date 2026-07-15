import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import {
  createCustomDateTypeAction,
  deleteCustomDateTypeAction,
  renameCustomDateTypeAction,
  saveActiveDateTypesAction
} from "@/lib/date-type-actions";
import { requireWorkspace } from "@/lib/auth";
import { formatPlanLimit, PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Jump Date Types" };

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
  const [customTypes, systemTypes] = await Promise.all([
    prisma.dateType.findMany({
      where: {
        workspaceId: workspace.id,
        isSystem: false,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {})
      },
      include: { _count: { select: { jumpDates: true, mixes: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    }),
    prisma.dateType.findMany({ where: { workspaceId: null, isSystem: true, isActive: true }, orderBy: { name: "asc" } })
  ]);
  const limit = PLAN_LIMITS[workspace.planTier].customDateTypes;
  const activeCount = customTypes.filter((item) => item.isActive).length;

  return (
    <div className="page">
      {params.created && <Notice type="success">Custom Jump Date Type created.</Notice>}
      {params.inactive && <Notice type="info">The type was preserved as inactive because your active-type limit is already reached. Select which types should remain active below.</Notice>}
      {params.updated && <Notice type="success">Jump Date Type renamed.</Notice>}
      {params.activationSaved && <Notice type="success">Active Jump Date Types updated. Future pending work is being reconciled.</Notice>}
      {params.deleted && <Notice type="success">Unused custom Jump Date Type deleted.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Jump Date Types</h1><p>Create industry-specific trigger classifications without duplicating global system data.</p></div>
        <div className="page-actions"><Link className="button" href="/mixes">Mixes</Link><Link className="button" href="/settings">Settings</Link></div>
      </header>
      <div className="usage-line"><span>Active custom types</span><strong>{activeCount}/{formatPlanLimit(limit)}</strong></div>

      <section className="card">
        <div className="card-header"><div><h2>+ New custom type</h2><p>Examples: Policy Renewal, Closing Anniversary, Program Start, or Warranty Expiration.</p></div></div>
        <form action={createCustomDateTypeAction} className="inline-create-form"><input name="name" placeholder="Custom Jump Date Type" required /><button className="button primary" type="submit">Create type</button></form>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>Manage custom types</h2><p>Choose which remain active after a plan change. Inactive types and their data are preserved.</p></div></div>
        <form className="filter-bar" action="/settings/jump-date-types" method="get"><input name="q" defaultValue={q} placeholder="Search custom types" aria-label="Search custom Jump Date Types" /><button className="button" type="submit">Search</button>{q && <Link className="button" href="/settings/jump-date-types">Clear</Link>}</form>
        <form action={saveActiveDateTypesAction} className="date-type-activation-form">
          {customTypes.length ? <div className="date-type-list">{customTypes.map((dateType) => (
            <article className={dateType.isActive ? "date-type-row" : "date-type-row inactive"} key={dateType.id}>
              <label className="date-type-active-choice"><input type="checkbox" name="activeDateTypeIds" value={dateType.id} defaultChecked={dateType.isActive} /><span>{dateType.isActive ? "Active" : "Inactive"}</span></label>
              <div><strong>{dateType.name}</strong><div className="jump-meta"><span>{dateType._count.jumpDates} Jump Date{dateType._count.jumpDates === 1 ? "" : "s"}</span><span>{dateType._count.mixes} Mix{dateType._count.mixes === 1 ? "" : "es"}</span></div></div>
              <details className="date-type-edit"><summary className="button small">Edit</summary><form action={renameCustomDateTypeAction} className="date-type-edit-panel"><input type="hidden" name="dateTypeId" value={dateType.id} /><input name="name" defaultValue={dateType.name} required /><button className="button small primary" type="submit">Save name</button></form></details>
              <details className="destructive-confirm"><summary className="button small danger">Delete…</summary><div className="destructive-confirm-panel"><p>Deletion is allowed only when no Jump Dates or active Mixes use this type. Otherwise, leave it inactive.</p><form action={deleteCustomDateTypeAction}><input type="hidden" name="dateTypeId" value={dateType.id} /><button className="button small danger" type="submit">Confirm delete</button></form></div></details>
            </article>
          ))}</div> : <p className="muted-copy">No custom Jump Date Types match this view.</p>}
          <div className="form-actions"><button className="button primary" type="submit">Save active selection</button></div>
        </form>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>System types</h2><p>These global records are shared safely across all workspaces and do not count against custom-type limits.</p></div></div>
        <div className="system-type-list">{systemTypes.map((dateType) => <span className="group-chip" key={dateType.id}>{dateType.name}</span>)}</div>
      </section>
    </div>
  );
}
