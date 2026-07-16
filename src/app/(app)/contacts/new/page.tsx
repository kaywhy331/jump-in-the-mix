import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Add contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const [groups, customFields] = await Promise.all([
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] })
  ]);
  return (
    <div className="page">
      <header className="page-header"><div><h1>Add a contact</h1><p>Add the details that make future Jumps accurate and easy to complete.</p></div></header>
      {error && <Notice type="error">{error}</Notice>}
      <ContactForm
        mode="create"
        groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color }))}
        customFields={customFields.map((field) => ({ id: field.id, name: field.name, key: field.key }))}
      />
    </div>
  );
}
