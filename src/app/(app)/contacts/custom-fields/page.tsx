import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Sheet } from "@/components/Sheet";
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
        <div><h1>Custom contact fields</h1><p>Add customer details you can reuse in prepared messages.</p></div>
        <div className="page-actions"><Link className="button" href="/contacts">Contacts</Link><Link className="button" href="/mixes">Plans</Link></div>
      </header>

      <section className="card">
        <div className="card-header"><div><h2>+ New custom field</h2><p>The generated placeholder key remains stable even when the display name changes.</p></div></div>
        <form action={createContactCustomFieldAction} className="inline-create-form">
          <input name="name" placeholder="Policy number" aria-label="Custom Contact field name" required maxLength={80} />
          <button className="button primary" type="submit">Create field</button>
        </form>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>Manage fields</h2><p>Deleting a field also deletes its saved contact values. Existing prepared messages stay unchanged, but that field will be blank in future messages.</p></div></div>
        {fields.length ? <div className="custom-field-list">{fields.map((field) => (
          <article className="custom-field-row" key={field.id}>
            <div><strong>{field.name}</strong><code>{customFieldPlaceholder(field.key)}</code><small>{field._count.values} contact value{field._count.values === 1 ? "" : "s"}</small></div>
            <Sheet trigger={<button className="button small" type="button">Rename</button>} title={`Rename ${field.name}`} description="Its message placeholder stays the same."><form action={renameContactCustomFieldAction} className="form-stack"><input type="hidden" name="definitionId" value={field.id} /><label className="field"><span>Name</span><input name="name" defaultValue={field.name} required maxLength={80} /></label><button className="button primary" type="submit">Save name</button></form></Sheet>
            <ConfirmDialog trigger="Delete…" title={`Delete ${field.name}?`} description={`This also deletes ${field._count.values} saved Contact value${field._count.values === 1 ? "" : "s"} and cannot be undone.`} danger><form action={deleteContactCustomFieldAction}><input type="hidden" name="definitionId" value={field.id} /><button className="button small danger" type="submit">Confirm delete</button></form></ConfirmDialog>
          </article>
        ))}</div> : <p className="muted-copy">No custom contact fields yet.</p>}
      </section>
    </div>
  );
}
