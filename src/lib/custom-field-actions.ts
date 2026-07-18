"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { normalizeCustomFieldKey } from "@/lib/contact-custom-fields";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/contacts/custom-fields?error=${encodeURIComponent(message)}`);
}

export async function createContactCustomFieldAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const name = value(formData, "name");
  const key = normalizeCustomFieldKey(name);
  if (!name || !key) fail("Give the custom field a clear name.");
  const duplicate = await prisma.contactCustomFieldDefinition.findFirst({
    where: { workspaceId: workspace.id, OR: [{ key }, { name: { equals: name, mode: "insensitive" } }] },
    select: { id: true }
  });
  if (duplicate) fail("A custom Contact field already uses that name or placeholder key.");
  const field = await prisma.contactCustomFieldDefinition.create({ data: { workspaceId: workspace.id, name, key } });
  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      actorType: "USER",
      actorUserId: user.id,
      action: "contact_custom_field.create",
      entityType: "ContactCustomFieldDefinition",
      entityId: field.id,
      source: "contacts.custom_fields",
      afterData: { name: field.name, key: field.key }
    }
  });
  redirect("/contacts/custom-fields?created=1");
}

export async function renameContactCustomFieldAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const definitionId = value(formData, "definitionId");
  const name = value(formData, "name");
  if (!name) fail("Give the custom field a clear name.");
  const existing = await prisma.contactCustomFieldDefinition.findFirst({
    where: { id: definitionId, workspaceId: workspace.id },
    select: { id: true, name: true, key: true }
  });
  if (!existing) fail("Custom Contact field not found.");
  const duplicate = await prisma.contactCustomFieldDefinition.findFirst({
    where: { workspaceId: workspace.id, id: { not: existing.id }, name: { equals: name, mode: "insensitive" } },
    select: { id: true }
  });
  if (duplicate) fail("Another custom Contact field already uses that name.");
  await prisma.$transaction([
    prisma.contactCustomFieldDefinition.update({ where: { id: existing.id }, data: { name } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact_custom_field.rename",
        entityType: "ContactCustomFieldDefinition",
        entityId: existing.id,
        source: "contacts.custom_fields",
        beforeData: { name: existing.name, key: existing.key },
        afterData: { name, key: existing.key }
      }
    })
  ]);
  redirect("/contacts/custom-fields?updated=1");
}

export async function deleteContactCustomFieldAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const definitionId = value(formData, "definitionId");
  const existing = await prisma.contactCustomFieldDefinition.findFirst({
    where: { id: definitionId, workspaceId: workspace.id },
    include: { _count: { select: { values: true } } }
  });
  if (!existing) fail("Custom Contact field not found.");
  await prisma.$transaction([
    prisma.contactCustomFieldDefinition.delete({ where: { id: existing.id } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contact_custom_field.delete",
        entityType: "ContactCustomFieldDefinition",
        entityId: existing.id,
        source: "contacts.custom_fields",
        beforeData: { name: existing.name, key: existing.key, valueCount: existing._count.values }
      }
    }),
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } })
  ]);
  redirect(`/contacts/custom-fields?deleted=1&values=${existing._count.values}`);
}
