import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import {
  createContactCustomFieldAction,
  deleteContactCustomFieldAction,
  renameContactCustomFieldAction
} from "@/lib/custom-field-actions";
import { requireWorkspace } from "@/lib/auth";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Contact custom fields" };

type SearchParams = {
  created?: string;
  updated?: string;
  deleted?: string;
  values?: string;
  error?: string;
};

export default async function ContactCustomFieldsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const fields = await prisma.contactCustomFieldDefinition.findMany({
    where: { workspaceId: workspace.id },
    include: { _count: { select: { values: true } } },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }]
  });

  return (
    <div className="page">
      {params.created && <Notice type="success">Contact custom field created.</Notice>}
      {params.updated && <Notice type="success">Contact custom field renamed. Its placeholder key stayed stable.</Notice>}
      {params.deleted && <Notice type="success">Custom field deleted{params.values && params.values !== "0" ? ` with ${params.values} saved value${params.values === "1" ? "" : "s"}` : ""}.</Notice>}
      {params.error && <Notice type="error">{params.error}</Notice>}
      <header className="page-header">
        <div><h1>Contact custom fields</h1><p>Add workspace-specific Contact data and use it in personalized Jumps.</p></div>
        <div className="page-actions"><Link className="button" href="/contacts">Contacts</Link><Link className="button" href="/settings/jumps">Jumps</Link></div>
      </header>

      <section className="card">
        <div className="card-header"><div><h2>+ New custom field</h2><p>The generated placeholder key remains stable even when the display name changes.</p></div></div>
        <form action={createContactCustomFieldAction} className="inline-create-form">
          <input name="name" placeholder="Policy number" aria-label="Custom Contact field name" required maxLength={80} />
          <button className="button primary" type="submit">Create field</button>
        </form>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>Manage fields</h2><p>Deleting a field also deletes its saved Contact values. Existing Jump text is preserved, but that placeholder will render blank.</p></div></div>
        {fields.length ? <div className="custom-field-list">{fields.map((field) => (
          <article className="custom-field-row" key={field.id}>
            <div><strong>{field.name}</strong><code>{customFieldPlaceholder(field.key)}</code><small>{field._count.values} Contact value{field._count.values === 1 ? "" : "s"}</small></div>
            <details className="date-type-edit"><summary className="button small">Rename</summary><form action={renameContactCustomFieldAction} className="date-type-edit-panel"><input type="hidden" name="definitionId" value={field.id} /><input name="name" defaultValue={field.name} required maxLength={80} /><button className="button small primary" type="submit">Save name</button></form></details>
            <details className="destructive-confirm"><summary className="button small danger">Delete…</summary><div className="destructive-confirm-panel"><p>Delete “{field.name}” and {field._count.values} saved value{field._count.values === 1 ? "" : "s"}? This cannot be undone.</p><form action={deleteContactCustomFieldAction}><input type="hidden" name="definitionId" value={field.id} /><button className="button small danger" type="submit">Confirm delete</button></form></div></details>
          </article>
        ))}</div> : <p className="muted-copy">No custom Contact fields yet.</p>}
      </section>
    </div>
  );
}
