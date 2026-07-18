import type { Prisma } from "@/generated/prisma/client";
import { requireWorkspaceCustomFieldDefinitions, type WorkspaceDb, WorkspaceScopeError } from "@/lib/workspace-repository";

export type ContactCustomFieldInput = {
  definitionId: string;
  value: string;
};

export function normalizeCustomFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function customFieldPlaceholder(key: string): string {
  return `{{contact.custom.${key}}}`;
}

export function buildContactCustomFieldInputs(definitionIds: string[], rawValues: string[]): ContactCustomFieldInput[] {
  const valuesByDefinition = new Map<string, string>();
  for (let index = 0; index < definitionIds.length; index += 1) {
    const definitionId = String(definitionIds[index] ?? "").trim();
    const value = String(rawValues[index] ?? "").trim();
    if (!definitionId || !value) continue;
    if (value.length > 2000) throw new Error("Contact custom field values must be 2,000 characters or fewer.");
    valuesByDefinition.set(definitionId, value);
  }
  return [...valuesByDefinition.entries()].map(([definitionId, value]) => ({ definitionId, value }));
}

export async function validateContactCustomFieldInputs(
  db: WorkspaceDb,
  workspaceId: string,
  inputs: ContactCustomFieldInput[]
): Promise<void> {
  await requireWorkspaceCustomFieldDefinitions(db, workspaceId, inputs.map((item) => item.definitionId));
}

export async function replaceContactCustomFieldValues(
  db: WorkspaceDb,
  workspaceId: string,
  contactId: string,
  inputs: ContactCustomFieldInput[]
): Promise<void> {
  const contact = await db.contact.findFirst({ where: { id: contactId, workspaceId, archivedAt: null }, select: { id: true } });
  if (!contact) throw new WorkspaceScopeError("Contact");
  await validateContactCustomFieldInputs(db, workspaceId, inputs);
  await db.contactCustomFieldValue.deleteMany({ where: { contactId: contact.id } });
  if (inputs.length) {
    await db.contactCustomFieldValue.createMany({
      data: inputs.map((item) => ({ contactId: contact.id, definitionId: item.definitionId, value: item.value }))
    });
  }
}

export function customFieldValuesData(inputs: ContactCustomFieldInput[]): Prisma.ContactCustomFieldValueCreateWithoutContactInput[] {
  return inputs.map((item) => ({ definition: { connect: { id: item.definitionId } }, value: item.value }));
}
