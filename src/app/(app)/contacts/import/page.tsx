import type { Metadata } from "next";
import Link from "next/link";
import { ContactImportWizard } from "@/components/ContactImportWizard";
import { requireWorkspace } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Import Contacts" };

export default async function ImportContactsPage() {
  const { workspace } = await requireWorkspace();
  const [groups, customFields, dateTypes, activeContacts] = await Promise.all([
    prisma.group.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, _count: { select: { memberships: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.contactCustomFieldDefinition.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, key: true },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }]
    }),
    prisma.dateType.findMany({
      where: { OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
      select: { id: true, name: true, slug: true, isSystem: true, isActive: true },
      orderBy: [{ isSystem: "asc" }, { name: "asc" }]
    }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } })
  ]);
  const contactLimit = PLAN_LIMITS[workspace.planTier].contacts;

  return (
    <div className="page import-contacts-page">
      <header className="page-header">
        <div><h1>Import Contacts</h1><p>Bring in CSV or VCF data with field mapping, duplicate review, Jump Dates, and a downloadable error report.</p></div>
        <div className="page-actions"><Link className="button" href="/contacts">Back to Contacts</Link></div>
      </header>
      <ContactImportWizard
        groups={groups.map((group) => ({ id: group.id, name: group.name, contactCount: group._count.memberships }))}
        customFields={customFields}
        dateTypes={dateTypes}
        initialUsage={{ activeContacts, contactLimit, remainingContacts: Math.max(contactLimit - activeContacts, 0) }}
      />
    </div>
  );
}
