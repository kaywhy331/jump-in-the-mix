import { workflowContinuation } from "@/lib/workflow-continuation";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactImportWizardV2 } from "@/components/ContactImportWizardV2";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { newContactStage } from "@/lib/journey";
import { everyoneMixesForNewPeople, newContactPlacementSetting, placeableMixFilter } from "@/lib/new-contact-placement";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/components/BackLink";

export const metadata: Metadata = { title: "Import Contacts" };

export default async function ImportContactsPage({ searchParams }: { searchParams: Promise<{ onboarding?: string; returnTo?: string }> }) {
  const query = await searchParams;
  const onboarding = query.onboarding === "1";
  const returnTo = workflowContinuation(query.returnTo);
  const { workspace } = await requireWorkspace();
  const [rawGroups, groupStates, customFields, dateTypes, activeContacts, placement, placeableMixes, everyoneMixes, stage] = await Promise.all([
    prisma.group.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, _count: { select: { memberships: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.contactGroupState.findMany({
      where: { workspaceId: workspace.id },
      select: { groupId: true, isActive: true }
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
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
    newContactPlacementSetting(prisma, workspace.id),
    prisma.mix.findMany({ where: await placeableMixFilter(prisma, workspace.id), select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 200 }),
    everyoneMixesForNewPeople(prisma, workspace.id),
    newContactStage(prisma, workspace.id)
  ]);
  // The review preselects the New contacts setting's Mix, but not on top of a Mix the new people's Contact stage
  // starts, nor when the import was opened to start a Mix from Journey (JITM-09 §2.78).
  const stageMix = stage?.mix ? `Your ${stage.name} stage starts ${stage.mix.name} for new people.` : null;
  const groups = mergeGroupActivity(rawGroups, groupStates).filter((group) => group.isActive);

  return (
    <div className="page import-contacts-page">
      <BackLink href="/contacts" label="Contacts" /><header className="page-header">
        <div><h1>Import Contacts</h1><p>Choose a file, review only the rows that need a decision, then let the background worker finish safely.</p></div>
        
      </header>
      {onboarding && <p>After importing, return to your setup tab; saved people refresh automatically and your other choices stay there. <Link href="/onboarding">Open setup</Link> if you closed it.</p>}
      {returnTo && <p className="notice">After importing, <Link href={returnTo}>return to your selected Mix and choose a person</Link>. Importing does not start this Mix.</p>}
      <ContactImportWizardV2
        groups={groups.map((group) => ({ id: group.id, name: group.name, contactCount: group._count.memberships }))}
        customFields={customFields}
        dateTypes={dateTypes}
        initialUsage={{ activeContacts, contactLimit: Number.MAX_SAFE_INTEGER, remainingContacts: Number.MAX_SAFE_INTEGER }}
        mixes={placeableMixes}
        defaultMixId={returnTo || stageMix ? null : placement.mix?.id ?? null}
        stageNote={stageMix}
        everyoneMixes={everyoneMixes.map((mix) => mix.name)}
      />
    </div>
  );
}
