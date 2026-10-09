"use server";

import { redirect } from "next/navigation";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import {
  isGroupActive,
  setActiveWorkspaceGroups
} from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { setStagesFromTagJoins } from "@/lib/mix-stage";
import { UserFacingError } from "@/lib/user-facing-error";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

function fail(message: string, viewer: ErrorViewer): never {
  redirect(withViewerError("/contacts", message, viewer));
}

function selectedContactIds(formData: FormData): string[] {
  return [...new Set(values(formData, "contactIds"))];
}

export async function createContactGroupAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace(fail);
  const name = value(formData, "name");
  const description = value(formData, "description");
  const color = value(formData, "color");
  if (!name) fail("Give the group a name.", session);

  const duplicate = await prisma.group.findFirst({
    where: { workspaceId: workspace.id, name: { equals: name, mode: "insensitive" } },
    select: { id: true }
  });
  if (duplicate) fail("A group with that name already exists.", session);

  const isActive = true;

  await prisma.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        workspaceId: workspace.id,
        name,
        description: description || null,
        color: color || null
      }
    });
    await tx.contactGroupState.create({
      data: { groupId: group.id, workspaceId: workspace.id, isActive }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact_group.create",
        entityType: "Group",
        entityId: group.id,
        source: "contacts.groups",
        metadata: { isActive }
      }
    });
  });

  redirect(`/contacts?groupCreated=1${isActive ? "" : "&groupInactive=1"}`);
}

export async function deleteContactGroupAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace(fail);
  const groupId = value(formData, "groupId");
  const group = await prisma.group.findFirst({
    where: { id: groupId, workspaceId: workspace.id },
    select: { id: true, name: true }
  });
  if (!group) fail("Group not found.", session);

  await prisma.$transaction(async (tx) => {
    await tx.contactGroupState.deleteMany({ where: { groupId: group.id, workspaceId: workspace.id } });
    await tx.group.delete({ where: { id: group.id } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact_group.delete",
        entityType: "Group",
        entityId: group.id,
        source: "contacts.groups",
        metadata: { name: group.name }
      }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
  });

  redirect("/contacts?groupDeleted=1");
}

export async function saveActiveGroupsAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace(fail);
  try {
    await setActiveWorkspaceGroups({
      workspaceId: workspace.id,
      selectedIds: values(formData, "activeGroupIds"),
      actorUserId: user.id
    });
  } catch (error) {
    fail(error instanceof UserFacingError ? error.message : "The active tag selection could not be saved.", session);
  }
  redirect("/contacts?groupsActiveSaved=1");
}

export async function assignSelectedContactsToActiveGroupAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace(fail);
  const contactIds = selectedContactIds(formData);
  const groupId = value(formData, "groupId");
  if (!contactIds.length) fail("Select at least one Contact.", session);
  if (!(await isGroupActive(workspace.id, groupId))) {
    fail("Choose an active tag. Hidden tags stay saved but cannot receive new assignments.", session);
  }

  const contacts = await prisma.contact.findMany({
    where: { workspaceId: workspace.id, archivedAt: null, id: { in: contactIds } },
    select: { id: true }
  });
  if (contacts.length !== contactIds.length) fail("One or more selected Contacts are unavailable.", session);

  const added = await prisma.$transaction(async (tx) => {
    const tagged = new Set((await tx.contactGroupMembership.findMany({ where: { groupId, contactId: { in: contacts.map((contact) => contact.id) } }, select: { contactId: true } })).map((item) => item.contactId));
    await tx.contactGroupMembership.createMany({
      data: contacts.map((contact) => ({ contactId: contact.id, groupId })),
      skipDuplicates: true
    });
    // A tag's Mix that names a Contact stage starts for the people newly given the tag, so it sets that stage (JITM-09 §2.79).
    await setStagesFromTagJoins(tx, { workspaceId: workspace.id, joins: contacts.filter((contact) => !tagged.has(contact.id)).map((contact) => ({ contactId: contact.id, groupId })), actorUserId: user.id });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contacts.group.assign",
        entityType: "Group",
        entityId: groupId,
        source: "contacts.bulk",
        metadata: { contactCount: contacts.length }
      }
    });
    await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
    return contacts.length - tagged.size;
  });

  // The notice names the tag and how many people newly have it (TRU-07).
  redirect(`/contacts?bulkAssigned=${added}&bulkTag=${encodeURIComponent(groupId)}`);
}
