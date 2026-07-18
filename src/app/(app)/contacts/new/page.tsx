import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Add contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ error?: string; quickAddFallback?: string }> }) {
  const [{ error, quickAddFallback }, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const [rawGroups, groupStates, customFields] = await Promise.all([
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] })
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);
  return (
    <div className="page">
      <header className="page-header"><div><h1>Add a contact</h1><p>Add the details that make future Jumps accurate and easy to complete.</p></div></header>
      {error && <Notice type="error">{error}</Notice>}
      {quickAddFallback && <Notice type="info">Your browser does not expose the native Contact Picker. Use this compact form instead; supported browsers also offer optional voice dictation for Public Notes.</Notice>}
      <ContactForm
        mode="create"
        groups={groups.map((group) => ({ id: group.id, name: group.name, color: group.color, isActive: group.isActive }))}
        customFields={customFields.map((field) => ({ id: field.id, name: field.name, key: field.key }))}
      />
    </div>
  );
}
