import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MixLibraryShell } from "@/components/MixLibraryShell";
import { AppIcon } from "@/components/AppIcon";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { Sheet } from "@/components/Sheet";
import { BrandTermsHelp } from "@/components/BrandTermsHelp";
import { PortableOutline } from "@/components/PortableOutline";
import { DuplicateMegaMixForm, ImportFileForm, MegaMixForm, RemoveMegaMixButton } from "@/components/MegaMixForms";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportMegaMixPipeline, megaMixShareState } from "@/lib/mega-mix-pipeline-service";
import { portableSummary } from "@/lib/mix-portable";
import { megaMixById } from "@/lib/mega-mixes";
import { MarketplaceNotices, MarketplaceShare } from "@/components/MarketplaceShare";

export const metadata: Metadata = { title: "Mega-Mixes" };
type SearchParams = { megaMix?: string; q?: string; new?: string; edit?: string; saved?: string; copied?: string; imported?: string; removed?: string };

const originLabel = (origin: string | null) => {
  if (!origin) return "Created in this account";
  if (origin.startsWith("BLUEPRINT:")) return `Ready-made ${megaMixById(origin.slice(10))?.name ?? ""} Mega-Mix`.replace("  ", " ");
  if (origin === "FILE") return "Imported from a file";
  if (origin.startsWith("COPY:")) return "Copied from another Mega-Mix";
  if (origin.startsWith("MARKETPLACE:")) return "Added from the Marketplace";
  return "Created in this account";
};

export default async function MegaMixesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace, user, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const q = params.q?.trim().slice(0, 160) ?? "";
  const [pipelines, mixes] = await Promise.all([
    prisma.megaMixPipeline.findMany({ where: { workspaceId: workspace.id, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: [{ name: "asc" }, { id: "asc" }],
      include: { members: { orderBy: { position: "asc" }, select: { mixId: true, mix: { select: { _count: { select: { steps: { where: { isActive: true } } } } } } } } } }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, source: { not: "ONE_TIME" }, status: { not: "ARCHIVED" } }, orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, status: true, _count: { select: { steps: { where: { isActive: true } } } }, megaMixMembership: { select: { pipeline: { select: { id: true, name: true } } } } } })
  ]);
  const creating = params.new === "1" && !impersonation;
  const requested = params.megaMix ? pipelines.find(item => item.id === params.megaMix) ?? await prisma.megaMixPipeline.findFirst({ where: { id: params.megaMix, workspaceId: workspace.id }, include: { members: { orderBy: { position: "asc" }, select: { mixId: true, mix: { select: { _count: { select: { steps: { where: { isActive: true } } } } } } } } } }) : null;
  if (params.megaMix && !requested) notFound();
  const selected = creating ? null : requested ?? pipelines[0] ?? null;
  const editing = Boolean(selected && params.edit === "1" && !impersonation);
  const exported = selected && selected.members.length ? await exportMegaMixPipeline(prisma, workspace.id, selected.id).catch(() => null) : null;
  const share = selected ? await megaMixShareState(prisma, selected.id) : null;
  const ungrouped = mixes.filter(mix => !mix.megaMixMembership).length;
  const choices = mixes.map(mix => ({ id: mix.id, name: mix.name, status: mix.status, beats: mix._count.steps, pipeline: mix.megaMixMembership?.pipeline ?? null }));
  const beats = (item: NonNullable<typeof selected>) => item.members.reduce((sum, member) => sum + member.mix._count.steps, 0);
  const summary = exported ? portableSummary(exported.package) : null;

  return <div className="page mix-workspace-page mega-mix-page">
    {params.saved && <Notice type="success">Mega-Mix saved.</Notice>}
    {params.copied && <Notice type="success">Copy ready. Its Mixes are new and separate from the original.</Notice>}
    {params.imported && <Notice type="success">Imported. No one was started; start people from Journey when you’re ready.</Notice>}
    {params.removed && <Notice type="success">Mega-Mix removed. Its Mixes are still in My Mixes.</Notice>}
    <MarketplaceNotices workspaceId={workspace.id} pipelineId={selected?.id} />
    <MixLibraryShell selectedMixId={selected?.id ?? (creating ? "new" : undefined)} explicitSelection={Boolean(params.megaMix || creating)}>
      <aside className="mix-library-directory" aria-label="Mega-Mix library">
        <header className="mix-directory-header"><h1>Mixes</h1><div className="mix-directory-actions">
          <BrandTermsHelp />
          {!impersonation && <Link className="icon-button" href="/mixes/mega?new=1" aria-label="Create a Mega-Mix" title="Create a Mega-Mix"><AppIcon name="plus" /></Link>}
          {!impersonation && <Sheet trigger={<button className="icon-button" type="button" aria-label="Import a Mix or Mega-Mix file" title="Import a file"><AppIcon name="import" /></button>} title="Import a file" description="Add a Mix or Mega-Mix that you or someone else exported.">
            <ImportFileForm />
          </Sheet>}
        </div></header>
        <nav className="mix-library-tabs" aria-label="Mix collection"><Link href="/mixes"><AppIcon name="mixes" />My Mixes</Link><Link href="/mixes/mega" aria-current="page"><AppIcon name="journey" />Mega-Mixes</Link><Link href="/marketplace"><AppIcon name="store" />Marketplace</Link></nav>
        <Link className="mix-clear-filters" href="/templates/journeys"><AppIcon name="journey" />Add a ready-made Mega-Mix</Link>
        <div className="mix-directory-search"><form className="mix-library-search" action="/mixes/mega" key={q}>
          <button className="icon-button" type="submit" aria-label="Search Mega-Mixes"><AppIcon name="search" /></button><label className="sr-only" htmlFor="mega-mix-search">Search Mega-Mixes</label><input id="mega-mix-search" name="q" type="search" defaultValue={q} placeholder="Search Mega-Mixes" />
        </form></div>
        <div className="mix-library-total"><span role="status">{pipelines.length} {pipelines.length === 1 ? "Mega-Mix" : "Mega-Mixes"}</span>{ungrouped > 0 && <small>{ungrouped} {ungrouped === 1 ? "Mix is" : "Mixes are"} not in a Mega-Mix</small>}</div>
        {q && <Link className="mix-clear-filters" href="/mixes/mega"><AppIcon name="close" />Clear search</Link>}
        {pipelines.length ? <nav className="mix-library-nav" aria-label="Your Mega-Mixes">{pipelines.map(item => <div className="mix-library-row" key={item.id}>
          <Link className="mix-library-item" href={`/mixes/mega?megaMix=${encodeURIComponent(item.id)}#selected-mix`} aria-current={selected?.id === item.id ? "page" : undefined}>
            <span className="mix-row-icon" aria-hidden="true"><AppIcon name="journey" /></span>
            <span className="mix-row-copy"><strong>{item.name}</strong><small>{item.members.length} {item.members.length === 1 ? "Mix" : "Mixes"} · {beats(item)} Beats</small></span>
          </Link></div>)}</nav> : <p className="muted-copy">{q ? "No Mega-Mix matches." : "Group Mixes into a named pipeline, add a ready-made one, or import a file."}</p>}
      </aside>

      {creating ? <div className="mix-edit-columns"><section id="selected-mix" className="mix-editor-workspace" aria-label="New Mega-Mix">
        <header className="mix-selected-header"><div><h2>New Mega-Mix</h2></div></header>
        <p className="mix-selected-description">Name a pipeline and choose the Mixes that belong to it. Journey shows, numbers and exports each Mega-Mix on its own.</p>
        <MegaMixForm mixes={choices} />
      </section></div> : selected ? <div className="mix-edit-columns">
        <section id="selected-mix" className="mix-editor-workspace" aria-label="Selected Mega-Mix">
          <header className="mix-selected-header"><div><h2>{selected.name}</h2><span className="status-pill">{selected.members.length} {selected.members.length === 1 ? "Mix" : "Mixes"}</span></div>
            <nav className="mix-view-tabs" aria-label="Mega-Mix view">{!impersonation && <MarketplaceShare kind="MEGA_MIX" targetId={selected.id} targetName={selected.name} workspaceId={workspace.id} canEdit={workspace.ownerId === user.id} />}<Link className="button small" href={`/mixes/mega?megaMix=${encodeURIComponent(selected.id)}`} aria-current={!editing ? "page" : undefined}><AppIcon name="eye" />Preview</Link>{!impersonation && <Link className="button small" href={`/mixes/mega?megaMix=${encodeURIComponent(selected.id)}&edit=1`} aria-current={editing ? "page" : undefined}><AppIcon name="edit" />Edit</Link>}</nav>
          </header>
          {editing ? <MegaMixForm pipeline={{ id: selected.id, name: selected.name, description: selected.description, mixIds: selected.members.map(member => member.mixId) }} mixes={choices} /> : <>
            {selected.description && <p className="mix-selected-description">{selected.description}</p>}
            {exported ? <>
              {summary && <p className="mega-mix-facts">{summary.mixes} {summary.mixes === 1 ? "Mix" : "Mixes"} · {summary.beats} Beats · {summary.connections} {summary.connections === 1 ? "path" : "paths"} inside this Mega-Mix</p>}
              <PortableOutline value={exported.package} label={`${selected.name} Beats in journey order`} />
            </> : <EmptyState title="No Mixes yet" description="Choose the Mixes that belong to this pipeline." actionHref={`/mixes/mega?megaMix=${encodeURIComponent(selected.id)}&edit=1`} actionLabel="Choose Mixes" />}
          </>}
        </section>
        <aside className="mix-context-pane" aria-label="Mega-Mix details">
          <section><h3><AppIcon name="journey" />Journey</h3><p>See people, progress and connections for just this pipeline.</p><Link className="button small" href={`/journey?megaMix=${encodeURIComponent(selected.id)}`}><AppIcon name="journey" />Open in Journey</Link></section>
          <section><h3><AppIcon name="info" />About</h3><p>{originLabel(selected.origin)}</p>
            {exported && (exported.omittedConnections > 0 || exported.skippedMixes > 0) && <p className="muted-copy">{exported.omittedConnections > 0 ? `${exported.omittedConnections} ${exported.omittedConnections === 1 ? "path leads" : "paths lead"} to Mixes outside this Mega-Mix and ${exported.omittedConnections === 1 ? "is" : "are"} not included in its file. ` : ""}{exported.skippedMixes > 0 ? `${exported.skippedMixes} ${exported.skippedMixes === 1 ? "Mix has" : "Mixes have"} no Beats or a fixed-date start and ${exported.skippedMixes === 1 ? "is" : "are"} left out of its file.` : ""}</p>}
          </section>
          <section><h3><AppIcon name="export" />Export</h3><p>Download a file with every Mix, Beat and path. It never includes people or history.</p>{exported ? <a className="button small" href={`/api/mega-mixes/${encodeURIComponent(selected.id)}/export`} download><AppIcon name="export" />Export file</a> : <p className="muted-copy">Add a Mix with Beats to export.</p>}</section>
          {!impersonation && <details className="mix-manage"><summary><AppIcon name="settings" />Manage Mega-Mix</summary><div>
            {exported && <DuplicateMegaMixForm pipeline={{ id: selected.id, name: selected.name }} />}
            <RemoveMegaMixButton pipeline={{ id: selected.id, name: selected.name }} share={share} />
          </div></details>}
        </aside>
      </div> : <EmptyState title="Name your first Mega-Mix" description="A Mega-Mix groups connected Mixes into one named pipeline you can view, number, export and share." actionHref={impersonation ? "/templates/journeys" : "/mixes/mega?new=1"} actionLabel={impersonation ? "Browse ready-made Mega-Mixes" : "Create a Mega-Mix"} />}
    </MixLibraryShell>
  </div>;
}
