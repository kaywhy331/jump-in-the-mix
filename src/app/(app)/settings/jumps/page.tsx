import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { ReusableJumpForm } from "@/components/ReusableJumpForm";
import { archiveReusableJumpAction } from "@/lib/actions";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Reusable Jumps" };

type SearchParams = { q?: string; created?: string; updated?: string; archived?: string; error?: string };

function channelIcon(channel: string): string {
  if (channel === "EMAIL") return "✉";
  if (channel === "PHONE_CALL") return "☎";
  if (channel === "VOICEMAIL") return "◉";
  if (channel === "WHATSAPP") return "◌";
  return "●";
}

export default async function ReusableJumpsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const q = params.q?.trim() ?? "";
  const [templates, customFields] = await Promise.all([
    prisma.stepTemplate.findMany({
      where: {
        workspaceId: workspace.id,
        isActive: true,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {})
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
          include: { mixSteps: { where: { isActive: true }, include: { mix: true } } }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.contactCustomFieldDefinition.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, key: true },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }]
    })
  ]);

  return (
    <div className="page">
      {params.created && <Notice type="success">Reusable Jump created.</Notice>}
      {params.updated && <Notice type="success">Jump updated. Future pending work is being reconciled while completed snapshots remain unchanged.</Notice>}
      {params.archived && <Notice type="success">Jump archived.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header"><div><h1>Jumps</h1><p>Create reusable SMS, email, phone, voicemail, and WhatsApp content for Mixes.</p></div><div className="page-actions"><Link className="button" href="/contacts/custom-fields">Contact fields</Link><Link className="button" href="/settings">Settings</Link><Link className="button" href="/mixes">Mixes</Link></div></header>

      <details className="card create-panel" open={params.created ? false : undefined}>
        <summary><strong>+ Create a reusable Jump</strong><span>Build content once, then use it in any Mix.</span></summary>
        <div className="create-panel-body"><ReusableJumpForm mode="create" customFields={customFields} /></div>
      </details>

      <form className="filter-bar" action="/settings/jumps" method="get"><input name="q" defaultValue={q} placeholder="Search reusable Jumps" aria-label="Search reusable Jumps" /><button className="button" type="submit">Search</button>{q && <Link className="button" href="/settings/jumps">Clear</Link>}</form>

      {templates.length ? <div className="jump-library-list">{templates.map((template) => {
        const latest = template.versions[0];
        const associations = new Map<string, { id: string; name: string }>();
        for (const version of template.versions) for (const mixStep of version.mixSteps) associations.set(mixStep.mix.id, { id: mixStep.mix.id, name: mixStep.mix.name });
        const mixes = [...associations.values()];
        return (
          <article className="card jump-library-card" key={template.id}>
            <div className="card-header">
              <div className="jump-library-title"><span className="timeline-icon" aria-hidden="true">{channelIcon(template.channel)}</span><div><h2>{template.name}</h2><div className="jump-meta"><span>{template.channel.replaceAll("_", " ").toLowerCase()}</span><span>Version {template.currentVersion}</span><span>{mixes.length} Mix{mixes.length === 1 ? "" : "es"}</span></div></div></div>
              <details className="destructive-confirm"><summary className="button small danger">Archive…</summary><div className="destructive-confirm-panel"><p>{mixes.length ? "This Jump is still used by active Mixes and must be removed from them first." : "Archive this reusable Jump? Existing completed history is preserved."}</p><form action={archiveReusableJumpAction}><input type="hidden" name="stepTemplateId" value={template.id} /><button className="button small danger" type="submit" disabled={mixes.length > 0}>Confirm archive</button></form></div></details>
            </div>
            {latest && <div className="jump-content-preview">{latest.subject && <strong>{latest.subject}</strong>}<p>{latest.body ?? latest.script ?? "No content"}</p></div>}
            {mixes.length > 0 && <div className="association-list"><span>Used in</span>{mixes.map((mix) => <Link href={`/mixes/${mix.id}/edit`} className="group-chip" key={mix.id}>{mix.name}</Link>)}</div>}
            <details className="mix-details jump-edit-details"><summary>Edit Jump</summary><div className="jump-edit-body"><ReusableJumpForm mode="edit" customFields={customFields} jump={{ id: template.id, name: template.name, channel: template.channel, subject: latest?.subject, body: latest?.body, script: latest?.script }} /></div></details>
          </article>
        );
      })}</div> : <EmptyState title={q ? "No Jumps matched that search" : "Create your first reusable Jump"} description="Reusable Jumps are the messages and call scripts arranged inside a Mix." actionHref="/settings/jumps" actionLabel={q ? "Clear search" : "Open the creator above"} />}
    </div>
  );
}
